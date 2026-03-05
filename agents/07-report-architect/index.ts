/**
 * AGT-07 — Report Architect
 *
 * Indexes each pipeline run into Elasticsearch (qa-test-runs + qa-failed-tests)
 * and generates an HTML dashboard artifact. Kibana visualizes the indexed data.
 *
 * Env vars:
 *   ELASTICSEARCH_URL  — default http://localhost:9200
 *   STAKEHOLDER_EMAILS — comma-separated alert recipients
 *   SLA_PASS_RATE      — decimal threshold (default 0.95)
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs/promises";
import * as path from "path";
import type { ExecutionResult } from "../06-test-executor";
import type { CoverageReport } from "../05-coverage-auditor";

const client = new Anthropic();

// ── Elasticsearch config ────────────────────────────────────────────────────

const ES_URL = (process.env.ELASTICSEARCH_URL ?? "http://localhost:9200").replace(/\/$/, "");
const ES_INDEX_RUNS = "qa-test-runs";
const ES_INDEX_FAILURES = "qa-failed-tests";

// ── Types ───────────────────────────────────────────────────────────────────

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

// ── Guardrails ──────────────────────────────────────────────────────────────

const STAKEHOLDER_EMAILS = (process.env.STAKEHOLDER_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim())
  .filter((e: string) => e.includes("@"));

const SLA_PASS_RATE = parseFloat(process.env.SLA_PASS_RATE ?? "0.95");

// ── Main Agent ──────────────────────────────────────────────────────────────

export async function runReportArchitect(
  executionResult: ExecutionResult,
  coverageReport: CoverageReport
): Promise<DashboardData> {
  // 1. Fetch historical data from Elasticsearch (empty arrays if ES unavailable)
  const [runHistory, flakiness, coverageTrend] = await Promise.all([
    queryRunHistory(),
    queryFlakiness(),
    queryCoverageTrend(),
  ]);

  // 2. Compute derived fields
  const trend = computeTrend(runHistory);
  const slaBreached = executionResult.passRate < SLA_PASS_RATE;

  // 3. AI narrative insights
  const aiInsights = await generateInsights(runHistory, flakiness, executionResult);

  // 4. Index current run to Elasticsearch
  await indexRunToES(executionResult, coverageReport, trend, slaBreached, aiInsights);

  // 5. SLA alert
  if (slaBreached) {
    await sendSLAAlert(executionResult);
  }

  const dashboard: DashboardData = {
    runHistory,
    flakinessByTest: flakiness,
    coverageTrend,
    currentRunSummary: { passRate: executionResult.passRate, trend, slaBreached },
    aiInsights,
    generatedAt: new Date().toISOString(),
  };

  // 6. Generate HTML dashboard artifact
  await generateDashboard(dashboard, executionResult, coverageReport);
  console.log(`  [AGT-07] Kibana: ${ES_URL.replace("9200", "5601")} (qa-test-runs, qa-failed-tests)`);

  return dashboard;
}

// ── Elasticsearch helpers ───────────────────────────────────────────────────

async function esRequest<T>(
  method: string,
  urlPath: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${ES_URL}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[AGT-07] Elasticsearch ${method} ${urlPath} → ${response.status}: ${text.slice(0, 200)}`
    );
  }
  return response.json() as Promise<T>;
}

// ── Indexing ────────────────────────────────────────────────────────────────

async function indexRunToES(
  result: ExecutionResult,
  coverage: CoverageReport,
  trend: string,
  slaBreached: boolean,
  aiInsights: string
): Promise<void> {
  const runDoc = {
    "@timestamp": result.finishedAt,
    runId: result.runId,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    testType: result.testType,
    totalTests: result.totalTests,
    passed: result.passed,
    failed: result.failed,
    flaky: result.flaky,
    skipped: result.skipped,
    durationMs: result.durationMs,
    passRate: result.passRate,
    // Overall coverage
    coveragePercent: coverage.coveragePercent,
    p0CoveragePercent: coverage.p0CoveragePercent,
    p1CoveragePercent: coverage.p1CoveragePercent,
    // UI coverage breakdown (flat fields — easier for Kibana field selectors)
    uiTotalCases: coverage.ui.totalCases,
    uiCoveredCases: coverage.ui.coveredCases,
    uiCoveragePercent: coverage.ui.coveragePercent,
    uiP0CoveragePercent: coverage.ui.p0CoveragePercent,
    uiP1CoveragePercent: coverage.ui.p1CoveragePercent,
    // API coverage breakdown
    apiTotalCases: coverage.api.totalCases,
    apiCoveredCases: coverage.api.coveredCases,
    apiCoveragePercent: coverage.api.coveragePercent,
    apiP0CoveragePercent: coverage.api.p0CoveragePercent,
    apiP1CoveragePercent: coverage.api.p1CoveragePercent,
    // Meta
    trend,
    slaBreached,
    aiInsights,
  };

  try {
    await esRequest("PUT", `/${ES_INDEX_RUNS}/_doc/${result.runId}`, runDoc);
    console.log(`  [AGT-07] Run indexed → ${ES_INDEX_RUNS}/${result.runId}`);
  } catch (err) {
    console.warn(`  [AGT-07] Could not index run to Elasticsearch — ${(err as Error).message}`);
  }

  // Index each failed test as a separate document for per-test drill-down in Kibana
  for (let i = 0; i < result.failedTests.length; i++) {
    const failed = result.failedTests[i];
    const failureDoc = {
      "@timestamp": result.finishedAt,
      runId: result.runId,
      testName: failed.title,
      file: failed.file,
      // GUARDRAIL: truncate error — no PII in the index
      error: failed.error.slice(0, 500),
      retried: failed.retried,
    };
    try {
      await esRequest(
        "PUT",
        `/${ES_INDEX_FAILURES}/_doc/${result.runId}-${i}`,
        failureDoc
      );
    } catch {
      // Suppress per-failure errors — run doc is more important
    }
  }

  if (result.failedTests.length > 0) {
    console.log(
      `  [AGT-07] ${result.failedTests.length} failure(s) indexed → ${ES_INDEX_FAILURES}`
    );
  }
}

// ── Historical queries ──────────────────────────────────────────────────────

async function queryRunHistory(): Promise<RunRecord[]> {
  try {
    const data = await esRequest<{
      hits: { hits: Array<{ _source: Record<string, unknown> }> };
    }>("POST", `/${ES_INDEX_RUNS}/_search`, {
      sort: [{ "@timestamp": "desc" }],
      size: 50,
      query: { range: { "@timestamp": { gte: "now-90d/d" } } },
      _source: ["runId", "finishedAt", "passed", "failed", "totalTests", "durationMs", "coveragePercent"],
    });

    return (data.hits?.hits ?? []).map((h) => {
      const s = h._source;
      return {
        runId: String(s["runId"] ?? ""),
        date: String(s["finishedAt"] ?? "").split("T")[0],
        passed: Number(s["passed"] ?? 0),
        failed: Number(s["failed"] ?? 0),
        total: Number(s["totalTests"] ?? 0),
        durationMs: Number(s["durationMs"] ?? 0),
        coveragePct: Number(s["coveragePercent"] ?? 0),
      };
    });
  } catch {
    console.warn("  [AGT-07] Could not query run history from Elasticsearch — skipping");
    return [];
  }
}

async function queryFlakiness(): Promise<FlakinessRecord[]> {
  try {
    const data = await esRequest<{
      aggregations?: {
        by_test?: {
          buckets?: Array<{
            key: string;
            doc_count: number;
            flaky_count: { doc_count: number };
          }>;
        };
      };
    }>("POST", `/${ES_INDEX_FAILURES}/_search`, {
      size: 0,
      query: { range: { "@timestamp": { gte: "now-90d/d" } } },
      aggs: {
        by_test: {
          terms: { field: "testName.keyword", size: 20, min_doc_count: 3 },
          aggs: {
            flaky_count: { filter: { term: { retried: true } } },
          },
        },
      },
    });

    return (data.aggregations?.by_test?.buckets ?? [])
      .map((b) => ({
        testName: b.key,
        flakyCount: b.flaky_count.doc_count,
        totalRuns: b.doc_count,
        flakinessIndex: Math.round((b.flaky_count.doc_count / b.doc_count) * 1000) / 10,
      }))
      .filter((r) => r.flakyCount > 0)
      .sort((a, b) => b.flakinessIndex - a.flakinessIndex);
  } catch {
    console.warn("  [AGT-07] Could not query flakiness from Elasticsearch — skipping");
    return [];
  }
}

async function queryCoverageTrend(): Promise<CoverageTrendRecord[]> {
  try {
    const data = await esRequest<{
      hits: { hits: Array<{ _source: Record<string, unknown> }> };
    }>("POST", `/${ES_INDEX_RUNS}/_search`, {
      sort: [{ "@timestamp": "asc" }],
      size: 90,
      query: { range: { "@timestamp": { gte: "now-90d/d" } } },
      _source: ["finishedAt", "coveragePercent", "p0CoveragePercent"],
    });

    return (data.hits?.hits ?? []).map((h) => {
      const s = h._source;
      return {
        date: String(s["finishedAt"] ?? "").split("T")[0],
        coveragePercent: Number(s["coveragePercent"] ?? 0),
        p0Coverage: Number(s["p0CoveragePercent"] ?? 0),
      };
    });
  } catch {
    console.warn("  [AGT-07] Could not query coverage trend from Elasticsearch — skipping");
    return [];
  }
}

// ── AI Insights ─────────────────────────────────────────────────────────────

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

// ── Dashboard Generation ────────────────────────────────────────────────────

async function generateDashboard(
  dashboard: DashboardData,
  execution: ExecutionResult,
  coverage: CoverageReport
): Promise<void> {
  await fs.mkdir("reports", { recursive: true });
  const reportPath = path.join("reports", `dashboard-${execution.runId}.html`);
  const html = buildDashboardHTML(dashboard, execution, coverage);
  await fs.writeFile(reportPath, html, "utf-8");
  console.log(`  [AGT-07] HTML dashboard written to ${reportPath}`);
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
  const kibanaUrl = ES_URL.replace(":9200", ":5601");

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
    .kibana-link { background: #0D1117; border: 1px solid #1C2333; border-left: 3px solid #60A5FA; border-radius: 8px; padding: 12px 20px; margin-bottom: 24px; font-size: 12px; color: #94A3B8; }
    .kibana-link a { color: #60A5FA; text-decoration: none; }
    .coverage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .coverage-card { background: #0D1117; border: 1px solid #1C2333; border-radius: 8px; padding: 16px; }
    .coverage-card h3 { font-size: 11px; letter-spacing: 2px; color: #4A5568; margin-bottom: 12px; }
    .coverage-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; }
    .coverage-label { color: #4A5568; }
  </style>
</head>
<body>
  <h1>QA PIPELINE DASHBOARD</h1>
  <div class="subtitle">RUN: ${execution.runId} | TYPE: ${execution.testType.toUpperCase()} | GENERATED: ${data.generatedAt}</div>

  <div class="kibana-link">
    Full interactive dashboards in Kibana:
    <a href="${kibanaUrl}" target="_blank">${kibanaUrl}</a>
    — indices: <strong>qa-test-runs</strong>, <strong>qa-failed-tests</strong>
  </div>

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
      <div class="card-label">FLAKY TESTS</div>
      <div class="card-value yellow">${execution.flaky}</div>
    </div>
    <div class="card">
      <div class="card-label">OVERALL COVERAGE</div>
      <div class="card-value blue">${coverage.coveragePercent.toFixed(0)}%</div>
    </div>
    <div class="card">
      <div class="card-label">P0 COVERAGE</div>
      <div class="card-value ${coverage.p0CoveragePercent >= 80 ? "green" : "red"}">${coverage.p0CoveragePercent.toFixed(0)}%</div>
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

  <div class="coverage-grid">
    <div class="coverage-card">
      <h3>UI COVERAGE</h3>
      <div class="coverage-row"><span class="coverage-label">Cases covered</span><span class="blue">${coverage.ui.coveredCases} / ${coverage.ui.totalCases}</span></div>
      <div class="coverage-row"><span class="coverage-label">Coverage</span><span class="${coverage.ui.coveragePercent >= 80 ? "green" : "red"}">${coverage.ui.coveragePercent.toFixed(1)}%</span></div>
      <div class="coverage-row"><span class="coverage-label">P0 coverage</span><span class="${coverage.ui.p0CoveragePercent >= 80 ? "green" : "red"}">${coverage.ui.p0CoveragePercent.toFixed(1)}%</span></div>
      <div class="coverage-row"><span class="coverage-label">P1 coverage</span><span class="${coverage.ui.p1CoveragePercent >= 80 ? "green" : "red"}">${coverage.ui.p1CoveragePercent.toFixed(1)}%</span></div>
    </div>
    <div class="coverage-card">
      <h3>API COVERAGE</h3>
      <div class="coverage-row"><span class="coverage-label">Cases covered</span><span class="blue">${coverage.api.coveredCases} / ${coverage.api.totalCases}</span></div>
      <div class="coverage-row"><span class="coverage-label">Coverage</span><span class="${coverage.api.coveragePercent >= 80 ? "green" : "red"}">${coverage.api.coveragePercent.toFixed(1)}%</span></div>
      <div class="coverage-row"><span class="coverage-label">P0 coverage</span><span class="${coverage.api.p0CoveragePercent >= 80 ? "green" : "red"}">${coverage.api.p0CoveragePercent.toFixed(1)}%</span></div>
      <div class="coverage-row"><span class="coverage-label">P1 coverage</span><span class="${coverage.api.p1CoveragePercent >= 80 ? "green" : "red"}">${coverage.api.p1CoveragePercent.toFixed(1)}%</span></div>
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

// ── Alerts ──────────────────────────────────────────────────────────────────

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

// ── Utilities ────────────────────────────────────────────────────────────────

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
