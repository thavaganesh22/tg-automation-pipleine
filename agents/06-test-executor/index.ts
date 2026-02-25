import { execSync } from "child_process";
import * as fs from "fs/promises";
import * as net from "net";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TestExecutorConfig {
  baseURL: string;
  headless?: boolean;
  workers?: number;
  retries?: number;
}

export interface FailedTest {
  title: string;
  file: string;
  error: string;
  screenshotPath: string | null;
  tracePath: string | null;
  retried: boolean;
}

export interface ExecutionResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
  passRate: number;
  failedTests: FailedTest[];
  artifactsDir: string;
}

// ── Guardrail Constants ────────────────────────────────────────────────────

const ALLOWED_URLS = (process.env.ALLOWED_TEST_URLS ?? "")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);
const MAX_WORKERS = Math.min(parseInt(process.env.MAX_WORKERS ?? "8", 10), 8);
const TEST_TIMEOUT_MS = 60_000;
const SUITE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_RETRIES = 2;

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runTestExecutor(
  specDir: string,
  config: TestExecutorConfig
): Promise<ExecutionResult> {
  // GUARDRAIL: never run against production
  assertURLAllowed(config.baseURL);

  // Pre-flight: verify the app is actually reachable before spawning Playwright
  await assertAppReachable(config.baseURL);

  const runId = `run-${Date.now()}`;
  const artifactsDir = path.resolve("test-results", runId);
  await fs.mkdir(artifactsDir, { recursive: true });

  // Write config at project root so Playwright workers can always resolve it
  const configPath = path.resolve(`playwright-agt06-${runId}.config.js`);
  await writePlaywrightConfig(specDir, artifactsDir, configPath, config);
  const resultPath = path.join(artifactsDir, "results.json");

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // GUARDRAIL: secrets injected via env, never hardcoded
  const env = { ...process.env, BASE_URL: config.baseURL, CI: "true" };

  try {
    await runWithTimeout(
      () => executePlaywright(configPath, env),
      SUITE_TIMEOUT_MS
    );
  } finally {
    // Clean up the temporary config file
    await fs.unlink(configPath).catch(() => undefined);
  }

  const durationMs = Date.now() - startMs;
  const finishedAt = new Date().toISOString();

  const report = await parseReport(resultPath, artifactsDir);

  return {
    runId,
    startedAt,
    finishedAt,
    durationMs,
    passRate: report.total > 0 ? report.passed / report.total : 0,
    artifactsDir,
    totalTests: report.total,
    passed: report.passed,
    failed: report.failed,
    flaky: report.flaky,
    skipped: report.skipped,
    failedTests: report.failedTests,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function assertAppReachable(baseURL: string, retries = 10, intervalMs = 3000): Promise<void> {
  const parsed = new URL(baseURL);
  const host = parsed.hostname;
  const port = parseInt(parsed.port || (parsed.protocol === "https:" ? "443" : "80"), 10);

  for (let i = 0; i < retries; i++) {
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 5000);
      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => { clearTimeout(timer); resolve(false); });
    });
    if (reachable) return;
    if (i < retries - 1) {
      console.warn(
        `  [AGT-06] App not reachable at ${baseURL} — retrying in ${intervalMs / 1000}s (${i + 1}/${retries})`
      );
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error(
    `[AGT-06 GUARDRAIL] Application is not running at ${baseURL}.\n` +
      `Start the app before running the pipeline:\n` +
      `  docker compose up -d\n` +
      `Then re-run from AGT-06: npm run pipeline -- --from=6`
  );
}

function assertURLAllowed(url: string): void {
  if (ALLOWED_URLS.length === 0) {
    throw new Error(
      "[AGT-06 GUARDRAIL] ALLOWED_TEST_URLS is not set. Set it in .env to permit test execution."
    );
  }
  if (!ALLOWED_URLS.some((allowed: string) => url.startsWith(allowed))) {
    throw new Error(
      `[AGT-06 GUARDRAIL] Base URL "${url}" is not in ALLOWED_TEST_URLS.\n` +
        `Allowed: ${ALLOWED_URLS.join(", ")}\n` +
        `NEVER point tests at production.`
    );
  }
}

async function executePlaywright(
  configPath: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  const cmd = [
    "npx playwright test",
    `--config=${configPath}`,
    `--workers=${MAX_WORKERS}`,
    `--retries=${MAX_RETRIES}`,
    `--timeout=${TEST_TIMEOUT_MS}`,
  ].join(" ");

  try {
    execSync(cmd, { env, stdio: "inherit" });
  } catch {
    // Playwright exits non-zero on failures — parse results regardless
  }
}

interface ParsedReport {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  failedTests: FailedTest[];
}

async function parseReport(reportPath: string, artifactsDir: string): Promise<ParsedReport> {
  let raw: string;
  try {
    raw = await fs.readFile(reportPath, "utf-8");
  } catch {
    return { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, failedTests: [] };
  }

  const report = JSON.parse(raw) as {
    suites?: Array<{
      file?: string;
      suites?: unknown[];
      specs?: Array<{
        title: string;
        tests?: Array<{
          status: string;
          results?: Array<{ error?: { message?: string }; retry?: number }>;
        }>;
      }>;
    }>;
  };

  let passed = 0,
    failed = 0,
    flaky = 0,
    skipped = 0;
  const failedTests: FailedTest[] = [];

  function walkSuites(suites: typeof report.suites): void {
    if (!suites) return;
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const retried = (test.results?.length ?? 0) > 1;
          if (test.status === "passed") passed++;
          else if (test.status === "flaky") {
            flaky++;
            passed++;
          } else if (test.status === "skipped") skipped++;
          else {
            failed++;
            const errorMsg = test.results?.[0]?.error?.message ?? "Unknown error";
            failedTests.push({
              title: spec.title,
              file: suite.file ?? "",
              // GUARDRAIL: truncate error to 500 chars to avoid PII leakage in DB
              error: errorMsg.slice(0, 500),
              screenshotPath: locateArtifact(artifactsDir, spec.title, "png"),
              tracePath: locateArtifact(artifactsDir, spec.title, "zip"),
              retried,
            });
          }
        }
      }
      walkSuites(suite.suites as typeof report.suites);
    }
  }

  walkSuites(report.suites);
  return { total: passed + failed + skipped, passed, failed, flaky, skipped, failedTests };
}

function locateArtifact(dir: string, title: string, ext: string): string | null {
  const safe = title
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase()
    .slice(0, 50);
  const candidate = path.join(dir, `${safe}.${ext}`);
  try {
    require("fs").accessSync(candidate);
    return candidate;
  } catch {
    return null;
  }
}

async function writePlaywrightConfig(
  specDir: string,
  outputDir: string,
  configPath: string,
  config: TestExecutorConfig
): Promise<void> {
  const content = `// Auto-generated by AGT-06 — deleted after run
const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: ${JSON.stringify(path.resolve(specDir))},
  outputDir: ${JSON.stringify(outputDir)},
  use: {
    baseURL: ${JSON.stringify(config.baseURL)},
    headless: ${config.headless ?? true},
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
  },
  retries: ${MAX_RETRIES},
  workers: ${MAX_WORKERS},
  timeout: ${TEST_TIMEOUT_MS},
  reporter: [["json", { outputFile: ${JSON.stringify(path.join(outputDir, "results.json"))} }], ["line"]],
});
`;
  await fs.writeFile(configPath, content, "utf-8");
}

async function runWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[AGT-06 GUARDRAIL] Suite timeout exceeded (${ms / 60000} min)`)),
        ms
      )
    ),
  ]);
}
