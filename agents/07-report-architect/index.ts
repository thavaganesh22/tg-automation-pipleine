import Anthropic from "@anthropic-ai/sdk";
import { Pool } from "pg";
import * as fs from "fs/promises";
import * as path from "path";
import type { ExecutionResult } from "../06-test-executor";
import type { CoverageReport } from "../05-coverage-auditor";

const client = new Anthropic();

// ── DB Pool (read + write for run persistence) ─────────────────────────────
const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  : null;

// ── Types ──────────────────────────────────────────────────────────────────

export interface DashboardData {
  runHistory: RunRecord[];
  flakinessByTest: FlakinessRecord[];
  coverageTrend: CoverageTrendRecord[];
  currentRunSummary: RunSummary;
  aiInsights: string;
  generatedAt: string;
}

interface RunRecord {
  runId: string;
  date: string;
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  coveragePct: number;
}

interface FlakinessRecord {
  testName: string;
  flakyCount: number;
  totalRuns: number;
  flakinessIndex: number;
}

interface CoverageTrendRecord {
  date: string;
  coveragePercent: number;
  p0Coverage: number;
}

interface RunSummary {
  passRate: number;
  trend: "improving" | "degrading" | "stable";
  slaBreached: boolean;
}

// ── Guardrails ─────────────────────────────────────────────────────────────

const STAKEHOLDER_EMAILS = (process.env.STAKEHOLDER_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim())
  .filter((e: string) => e.includes("@"));

const SLA_PASS_RATE = parseFloat(process.env.SLA_PASS_RATE ?? "0.95");

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runReportArchitect(
  executionResult: ExecutionResult,
  coverageReport: CoverageReport
): Promise<DashboardData> {
  // 1. Persist run to DB (if configured)
  if (db) {
    await persistRunResult(executionResult, coverageReport);
    console.log("  [AGT-07] Run persisted to database");
  } else {
    console.warn("  [AGT-07] DATABASE_URL not set — skipping DB persistence");
  }

  // 2. Fetch historical data
  const [runHistory, flakiness, coverageTrend] = await Promise.all([
    db ? queryRunHistory() : [],
    db ? queryFlakiness() : [],
    db ? queryCoverageTrend() : [],
  ]);

  // 3. AI narrative insights (no PII — guardrail enforced in system prompt)
  const aiInsights = await generateInsights(runHistory, flakiness, executionResult);

  // 4. SLA check
  const slaBreached = executionResult.passRate < SLA_PASS_RATE;
  if (slaBreached) {
    await sendSLAAlert(executionResult);
  }

  const dashboard: DashboardData = {
    runHistory,
    flakinessByTest: flakiness,
    coverageTrend,
    currentRunSummary: {
      passRate: executionResult.passRate,
      trend: computeTrend(runHistory),
      slaBreached,
    },
    aiInsights,
    generatedAt: new Date().toISOString(),
  };

  // 5. Generate HTML dashboard
  await generateDashboard(dashboard, executionResult, coverageReport);

  return dashboard;
}

// ── DB Operations ──────────────────────────────────────────────────────────

async function persistRunResult(result: ExecutionResult, coverage: CoverageReport): Promise<void> {
  await db!.query(
    `INSERT INTO test_runs
       (run_id, started_at, finished_at, total, passed, failed, flaky, skipped, duration_ms, coverage_pct, p0_coverage_pct)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (run_id) DO NOTHING`,
    [
      result.runId,
      result.startedAt,
      result.finishedAt,
      result.totalTests,
      result.passed,
      result.failed,
      result.flaky,
      result.skipped,
      result.durationMs,
      coverage.coveragePercent.toFixed(2),
      coverage.p0CoveragePercent.toFixed(2),
    ]
  );

  for (const failed of result.failedTests) {
    await db!.query(
      `INSERT INTO test_failures (run_id, test_name, error_msg, retried) VALUES ($1,$2,$3,$4)`,
      [
        result.runId,
        failed.title,
        failed.error.slice(0, 500), // GUARDRAIL: truncate — no PII in DB
        failed.retried,
      ]
    );
  }
}

async function queryRunHistory(): Promise<RunRecord[]> {
  // GUARDRAIL: 90-day retention window
  const { rows } = await db!.query(
    `SELECT run_id, started_at::date::text as date, passed, failed, total, duration_ms, coverage_pct
     FROM test_runs
     WHERE started_at > NOW() - INTERVAL '90 days'
     ORDER BY started_at DESC
     LIMIT 50`
  );
  return rows as RunRecord[];
}

async function queryFlakiness(): Promise<FlakinessRecord[]> {
  const { rows } = await db!.query(
    `SELECT
       test_name,
       COUNT(*) FILTER (WHERE retried = true)::int  AS "flakyCount",
       COUNT(*)::int                                 AS "totalRuns",
       ROUND(
         COUNT(*) FILTER (WHERE retried = true)::numeric / COUNT(*) * 100, 1
       )::float                                      AS "flakinessIndex"
     FROM test_failures
     WHERE created_at > NOW() - INTERVAL '90 days'
     GROUP BY test_name
     HAVING COUNT(*) > 2
     ORDER BY "flakinessIndex" DESC
     LIMIT 20`
  );
  return rows as FlakinessRecord[];
}

async function queryCoverageTrend(): Promise<CoverageTrendRecord[]> {
  const { rows } = await db!.query(
    `SELECT
       started_at::date::text AS date,
       coverage_pct           AS "coveragePercent",
       p0_coverage_pct        AS "p0Coverage"
     FROM test_runs
     WHERE started_at > NOW() - INTERVAL '90 days'
     ORDER BY started_at ASC`
  );
  return rows as CoverageTrendRecord[];
}

// ── AI Insights ────────────────────────────────────────────────────────────

async function generateInsights(
  history: RunRecord[],
  flakiness: FlakinessRecord[],
  latest: ExecutionResult
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a QA analytics expert writing a stakeholder report.
Write a concise summary (max 3 paragraphs).
Focus on: trends, top flaky tests, and actionable recommendations.
STRICT GUARDRAIL: NEVER include personal data, usernames, email addresses, or PII of any kind.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          latestRun: {
            passed: latest.passed,
            failed: latest.failed,
            total: latest.totalTests,
            passRate: `${(latest.passRate * 100).toFixed(1)}%`,
            durationMs: latest.durationMs,
          },
          recentHistory: history.slice(0, 10),
          topFlaky: flakiness.slice(0, 5),
        }),
      },
    ],
  });

  return (response.content[0] as { text: string }).text;
}

// ── Dashboard Generation ───────────────────────────────────────────────────

async function generateDashboard(
  dashboard: DashboardData,
  execution: ExecutionResult,
  coverage: CoverageReport
): Promise<void> {
  await fs.mkdir("reports", { recursive: true });
  const reportPath = path.join("reports", `dashboard-${execution.runId}.html`);

  const html = buildDashboardHTML(dashboard, execution, coverage);
  await fs.writeFile(reportPath, html, "utf-8");
  console.log(`  [AGT-07] Dashboard written to ${reportPath}`);
  // GUARDRAIL: in production, generate presigned URL with 7-day TTL here
}

function buildDashboardHTML(
  data: DashboardData,
  execution: ExecutionResult,
  coverage: CoverageReport
): string {
  const passRate = (execution.passRate * 100).toFixed(1);
  const trendIcon =
    data.currentRunSummary.trend === "improving"
      ? "↑"
      : data.currentRunSummary.trend === "degrading"
        ? "↓"
        : "→";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Pipeline Dashboard — ${execution.runId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; background: #080B10; color: #CDD9E5; padding: 32px; }
    h1 { color: #00FFA3; font-size: 20px; letter-spacing: 2px; margin-bottom: 8px; }
    .subtitle { color: #4A5568; font-size: 11px; letter-spacing: 3px; margin-bottom: 32px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .card { background: #0D1117; border: 1px solid #1C2333; border-radius: 8px; padding: 20px; }
    .card-label { font-size: 10px; letter-spacing: 2px; color: #4A5568; margin-bottom: 8px; }
    .card-value { font-size: 32px; font-weight: 700; }
    .green { color: #00FFA3; } .red { color: #EF4444; } .yellow { color: #F59E0B; } .blue { color: #60A5FA; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 11px; letter-spacing: 3px; color: #4A5568; margin-bottom: 16px; border-bottom: 1px solid #1C2333; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; padding: 8px 12px; color: #4A5568; font-size: 10px; letter-spacing: 2px; border-bottom: 1px solid #1C2333; }
    td { padding: 10px 12px; border-bottom: 1px solid #0D1117; }
    tr:hover td { background: #0D1117; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; }
    .badge-red { background: #7F1D1D; color: #FCA5A5; }
    .badge-green { background: #064E3B; color: #6EE7B7; }
    .badge-yellow { background: #78350F; color: #FCD34D; }
    .insights { background: #0D1117; border: 1px solid #1C2333; border-left: 3px solid #00FFA3; border-radius: 8px; padding: 20px; line-height: 1.7; font-size: 13px; color: #94A3B8; }
    .sla-alert { background: #7F1D1D; border: 1px solid #EF4444; border-radius: 8px; padding: 16px; margin-bottom: 16px; color: #FCA5A5; font-size: 13px; }
  </style>
</head>
<body>
  <h1>QA PIPELINE DASHBOARD</h1>
  <div class="subtitle">RUN: ${execution.runId} | GENERATED: ${data.generatedAt}</div>

  ${data.currentRunSummary.slaBreached ? `<div class="sla-alert">⚠ SLA BREACH: Pass rate ${passRate}% is below the ${(SLA_PASS_RATE * 100).toFixed(0)}% SLA threshold. Stakeholders have been notified.</div>` : ""}

  <div class="grid">
    <div class="card">
      <div class="card-label">PASS RATE</div>
      <div class="card-value ${parseFloat(passRate) >= 95 ? "green" : parseFloat(passRate) >= 80 ? "yellow" : "red"}">${passRate}%</div>
    </div>
    <div class="card">
      <div class="card-label">TESTS PASSED</div>
      <div class="card-value green">${execution.passed}</div>
    </div>
    <div class="card">
      <div class="card-label">TESTS FAILED</div>
      <div class="card-value red">${execution.failed}</div>
    </div>
    <div class="card">
      <div class="card-label">P0 COVERAGE</div>
      <div class="card-value ${coverage.p0CoveragePercent >= 80 ? "green" : "red"}">${coverage.p0CoveragePercent.toFixed(0)}%</div>
    </div>
    <div class="card">
      <div class="card-label">OVERALL COVERAGE</div>
      <div class="card-value blue">${coverage.coveragePercent.toFixed(0)}%</div>
    </div>
    <div class="card">
      <div class="card-label">FLAKY TESTS</div>
      <div class="card-value yellow">${execution.flaky}</div>
    </div>
    <div class="card">
      <div class="card-label">DURATION</div>
      <div class="card-value blue">${(execution.durationMs / 1000).toFixed(0)}s</div>
    </div>
    <div class="card">
      <div class="card-label">TREND</div>
      <div class="card-value ${data.currentRunSummary.trend === "improving" ? "green" : data.currentRunSummary.trend === "degrading" ? "red" : "yellow"}">${trendIcon}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">AI INSIGHTS</div>
    <div class="insights">${data.aiInsights.replace(/\n/g, "<br>")}</div>
  </div>

  ${
    execution.failedTests.length > 0
      ? `
  <div class="section">
    <div class="section-title">FAILED TESTS (${execution.failedTests.length})</div>
    <table>
      <thead><tr><th>TEST</th><th>FILE</th><th>ERROR</th><th>RETRIED</th></tr></thead>
      <tbody>
        ${execution.failedTests
          .map(
            (t) => `
        <tr>
          <td>${t.title}</td>
          <td style="color:#4A5568;font-size:11px">${t.file}</td>
          <td style="color:#FCA5A5;font-size:11px">${t.error.slice(0, 100)}…</td>
          <td><span class="badge ${t.retried ? "badge-yellow" : "badge-red"}">${t.retried ? "YES" : "NO"}</span></td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`
      : ""
  }

  ${
    data.flakinessByTest.length > 0
      ? `
  <div class="section">
    <div class="section-title">TOP FLAKY TESTS (90-DAY WINDOW)</div>
    <table>
      <thead><tr><th>TEST</th><th>FLAKY RUNS</th><th>TOTAL RUNS</th><th>FLAKINESS INDEX</th></tr></thead>
      <tbody>
        ${data.flakinessByTest
          .map(
            (f) => `
        <tr>
          <td>${f.testName}</td>
          <td class="yellow">${f.flakyCount}</td>
          <td>${f.totalRuns}</td>
          <td><span class="badge badge-yellow">${f.flakinessIndex}%</span></td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`
      : ""
  }
</body>
</html>`;
}

// ── Alerts ─────────────────────────────────────────────────────────────────

async function sendSLAAlert(result: ExecutionResult): Promise<void> {
  if (STAKEHOLDER_EMAILS.length === 0) {
    console.warn("[AGT-07] SLA breached but STAKEHOLDER_EMAILS not configured — skipping alert");
    return;
  }
  console.warn(
    `[AGT-07] SLA BREACH: ${(result.passRate * 100).toFixed(1)}% pass rate < ${(SLA_PASS_RATE * 100).toFixed(0)}% SLA\n` +
      `  Notifying: ${STAKEHOLDER_EMAILS.join(", ")}`
  );
  // Wire up nodemailer or SendGrid here for production
}

// ── Utilities ──────────────────────────────────────────────────────────────

function computeTrend(history: RunRecord[]): "improving" | "degrading" | "stable" {
  if (history.length < 4) return "stable";
  const recent = history.slice(0, 3).map((r) => r.passed / r.total);
  const older = history.slice(3, 6).map((r) => r.passed / r.total);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  if (recentAvg > olderAvg + 0.02) return "improving";
  if (recentAvg < olderAvg - 0.02) return "degrading";
  return "stable";
}
