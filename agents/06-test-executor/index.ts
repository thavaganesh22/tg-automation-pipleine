import Anthropic from "@anthropic-ai/sdk";
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
  /** Which spec types to run. Defaults to "both". */
  testType?: "ui" | "api" | "both";
  /** Whether to attempt LLM-driven spec repair on script errors. Default: AUTO_HEAL_ENABLED env. */
  autoHeal?: boolean;
}

export interface FailedTest {
  title: string;
  file: string;
  error: string;
  screenshotPath: string | null;
  tracePath: string | null;
  retried: boolean;
  failureType: "script" | "app";
}

export interface ExecutionResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  testType: "ui" | "api" | "both";
  totalTests: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
  passRate: number;
  failedTests: FailedTest[];
  artifactsDir: string;
  healAttempted: boolean;
  healedSpecs: string[];
  scriptErrors: number;
  appErrors: number;
}

// ── Guardrail Constants ────────────────────────────────────────────────────

const ALLOWED_URLS = (process.env.ALLOWED_TEST_URLS ?? "")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);
const MAX_WORKERS = Math.min(parseInt(process.env.MAX_WORKERS ?? "4", 10), 8);
const TEST_TIMEOUT_MS = 20_000;        // per-test wall-clock limit
const ACTION_TIMEOUT_MS = 10_000;      // per-action (locator.waitFor, click, fill, etc.)
const NAVIGATION_TIMEOUT_MS = 15_000; // page.goto / waitForURL
const SUITE_TIMEOUT_MS = 15 * 60 * 1000; // overall suite cap (15 min)
const MAX_RETRIES = process.env.CI ? 1 : 0;
const MAX_FAILURES = 0;              // 0 = run all tests regardless of failures (no bail-out)

// ── Auto-Heal Constants ────────────────────────────────────────────────────

const AUTO_HEAL_ENABLED = process.env.AUTO_HEAL_ENABLED === "true";
const MAX_HEAL_FAILURE_RATIO = 0.5; // skip heal if >50% of tests fail (app likely down)

const SCRIPT_ERROR_PATTERNS: RegExp[] = [
  /TimeoutError/i,
  /locator\.(waitFor|click|fill|check|selectOption|hover|tap)/i,
  /waiting for (locator|selector)/i,
  /no element found for selector/i,
  /strict mode violation/i,
  /is not a function/i,
  /cannot read propert/i,
  /target page.*closed/i,
  /expect.*toBeVisible.*failed/i,
  /expect.*toHaveCount.*failed/i,
  /expect.*toHaveText.*failed/i,
];

const APP_ERROR_PATTERNS: RegExp[] = [
  /net::ERR_/i,
  /ECONNREFUSED/i,
  /connection refused/i,
  /response status.*[45]\d\d/i,
  /internal server error/i,
];

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runTestExecutor(
  specDir: string,
  config: TestExecutorConfig
): Promise<ExecutionResult> {
  // GUARDRAIL: never run against production
  assertURLAllowed(config.baseURL);

  // Pre-flight: verify the app is actually reachable before spawning Playwright
  await assertAppReachable(config.baseURL);

  const effectiveTestType = config.testType ?? "both";
  console.log(`  [AGT-06] Running ${effectiveTestType.toUpperCase()} tests`);

  const runId = `run-${Date.now()}`;
  const artifactsDir = path.resolve("test-results", runId);
  await fs.mkdir(artifactsDir, { recursive: true });

  // Write config at project root so Playwright workers can always resolve it
  const configPath = path.resolve(`playwright-agt06-${runId}.config.js`);
  await writePlaywrightConfig(specDir, artifactsDir, configPath, config, effectiveTestType);
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

  const baseResult: ExecutionResult = {
    runId,
    startedAt,
    finishedAt,
    testType: effectiveTestType,
    durationMs,
    passRate: report.total > 0 ? report.passed / report.total : 0,
    artifactsDir,
    totalTests: report.total,
    passed: report.passed,
    failed: report.failed,
    flaky: report.flaky,
    skipped: report.skipped,
    failedTests: report.failedTests,
    healAttempted: false,
    healedSpecs: [],
    scriptErrors: 0,
    appErrors: 0,
  };

  const shouldHeal = (config.autoHeal ?? AUTO_HEAL_ENABLED) && report.failedTests.length > 0;
  if (shouldHeal) {
    return await runAutoHealCycle(specDir, config, baseResult, env);
  }
  return baseResult;
}

// ── Auto-Heal ──────────────────────────────────────────────────────────────

function classifyFailure(error: string): "script" | "app" {
  for (const pattern of APP_ERROR_PATTERNS) {
    if (pattern.test(error)) return "app";
  }
  for (const pattern of SCRIPT_ERROR_PATTERNS) {
    if (pattern.test(error)) return "script";
  }
  // Conservative default: attempt heal; if it can't fix the real cause, test stays failed
  return "script";
}

async function healSpecFile(
  specPath: string,
  failures: FailedTest[]
): Promise<boolean> {
  let specContent: string;
  try {
    specContent = await fs.readFile(specPath, "utf-8");
  } catch {
    console.warn(`  [AGT-06] Heal skipped — cannot read spec: ${specPath}`);
    return false;
  }

  const failureSummary = failures
    .map((f) => `Test: "${f.title}"\nError: ${f.error}`)
    .join("\n\n");

  const client = new Anthropic();
  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system:
        "You are a Playwright test repair specialist. " +
        "Fix ONLY infrastructure problems: wrong selectors, bad route patterns, missing POM method calls, incorrect navigation paths. " +
        "Do NOT weaken assertions. Do NOT change what a test is asserting — only fix HOW it finds elements or sets up routes. " +
        "Do NOT fix application bugs. " +
        "Return ONLY valid TypeScript — no markdown fences, no explanation.",
      messages: [
        {
          role: "user",
          content:
            `The following tests in this spec file are failing due to script/infrastructure issues:\n\n` +
            `${failureSummary}\n\n` +
            `Here is the full spec file:\n\n${specContent}\n\n` +
            `Return the complete repaired TypeScript spec file with only the infrastructure fixes applied.`,
        },
      ],
    });
  } catch (err) {
    console.warn(`  [AGT-06] Heal LLM call failed for ${specPath}: ${(err as Error).message}`);
    return false;
  }

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!raw.trim()) {
    console.warn(`  [AGT-06] Heal returned empty response for ${specPath}`);
    return false;
  }

  const fixed = stripCodeFences(raw);

  // Guard: reject prose output — LLM sometimes returns analysis text instead of TypeScript.
  // A valid TypeScript spec file must start with an import, comment, or known TS keyword.
  if (!looksLikeTypeScript(fixed)) {
    console.warn(`  [AGT-06] Heal rejected for ${specPath} — response looks like prose, not TypeScript.`);
    return false;
  }

  await fs.writeFile(specPath, fixed, "utf-8");
  return true;
}

/** Returns true if the string starts with a TypeScript statement, not natural language prose. */
function looksLikeTypeScript(code: string): boolean {
  const firstLine = code.trimStart().split("\n")[0] ?? "";
  return /^(import |export |\/\/|\/\*|const |let |var |type |interface |class |async |function |test\(|test\.describe|describe\()/.test(firstLine);
}

function stripCodeFences(code: string): string {
  // Strip outer code fences if present
  const fenceMatch = code.match(/^```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return code
    .replace(/^```(?:typescript|ts)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

async function runAutoHealCycle(
  specDir: string,
  config: TestExecutorConfig,
  firstResult: ExecutionResult,
  env: NodeJS.ProcessEnv
): Promise<ExecutionResult> {
  const total = firstResult.totalTests;
  const failCount = firstResult.failed;

  // Gate: skip if too many failures (app likely down)
  if (total > 0 && failCount / total > MAX_HEAL_FAILURE_RATIO) {
    console.log(
      `  [AGT-06] Auto-heal skipped — ${failCount}/${total} tests failed (>${(MAX_HEAL_FAILURE_RATIO * 100).toFixed(0)}% threshold, app may be down)`
    );
    return firstResult;
  }

  // Classify each failure
  const classified = firstResult.failedTests.map((f) => ({
    ...f,
    failureType: classifyFailure(f.error) as "script" | "app",
  }));

  const scriptFails = classified.filter((f) => f.failureType === "script");
  const appFails = classified.filter((f) => f.failureType === "app");

  // Group script failures by spec file
  const byFile = new Map<string, FailedTest[]>();
  for (const f of scriptFails) {
    const key = f.file;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key)!.push(f);
  }

  console.log(
    `  [AGT-06] Auto-heal: ${scriptFails.length} script error(s) in ${byFile.size} file(s) | ` +
      `${appFails.length} app error(s) (skipped)`
  );

  if (scriptFails.length === 0) {
    return {
      ...firstResult,
      failedTests: classified,
      healAttempted: false,
      healedSpecs: [],
      scriptErrors: 0,
      appErrors: appFails.length,
    };
  }

  // Heal each spec file
  const healedSpecs: string[] = [];
  for (const [filePath, failures] of byFile.entries()) {
    // filePath from Playwright report is relative to testDir — resolve it
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(specDir, filePath);
    console.log(`  [AGT-06] Healing ${absPath} ...`);
    const healed = await healSpecFile(absPath, failures);
    if (healed) healedSpecs.push(absPath);
  }

  if (healedSpecs.length === 0) {
    console.log(`  [AGT-06] No files successfully healed — returning original results`);
    return {
      ...firstResult,
      failedTests: classified,
      healAttempted: true,
      healedSpecs: [],
      scriptErrors: scriptFails.length,
      appErrors: appFails.length,
    };
  }

  // Write a targeted Playwright config for only the healed files
  const healRunId = `${firstResult.runId}-heal`;
  const healArtifactsDir = path.resolve("test-results", healRunId);
  await fs.mkdir(healArtifactsDir, { recursive: true });

  const healConfigPath = path.resolve(`playwright-agt06-${healRunId}.config.js`);
  const testMatchList = healedSpecs.map((p) => JSON.stringify(p)).join(", ");
  const healConfig = `// Auto-generated by AGT-06 heal — deleted after run
const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: ${JSON.stringify(path.resolve(specDir))},
  testMatch: [${testMatchList}],
  outputDir: ${JSON.stringify(healArtifactsDir)},
  use: {
    baseURL: ${JSON.stringify(config.baseURL)},
    headless: ${config.headless ?? true},
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
    actionTimeout: ${ACTION_TIMEOUT_MS},
    navigationTimeout: ${NAVIGATION_TIMEOUT_MS},
  },
  retries: ${MAX_RETRIES},
  workers: ${MAX_WORKERS},
  timeout: ${TEST_TIMEOUT_MS},
  maxFailures: ${MAX_FAILURES},
  reporter: [["json", { outputFile: ${JSON.stringify(path.join(healArtifactsDir, "results.json"))} }], ["line"]],
});
`;
  await fs.writeFile(healConfigPath, healConfig, "utf-8");

  console.log(`  [AGT-06] Re-running ${healedSpecs.length} healed spec file(s)...`);

  try {
    await runWithTimeout(
      () => executePlaywright(healConfigPath, env),
      SUITE_TIMEOUT_MS
    );
  } catch {
    // parse results regardless of exit code
  } finally {
    await fs.unlink(healConfigPath).catch(() => undefined);
  }

  const healReport = await parseReport(
    path.join(healArtifactsDir, "results.json"),
    healArtifactsDir
  );

  // Merge: keep run-1 results for non-healed files; replace with run-2 for healed files
  // Passed/failed counts from run-1 minus the healed files
  const run1NonHealedPassed = firstResult.passed - scriptFails.length; // rough: remove all script-fail tests
  const run1NonHealedFailed = appFails.length;

  const mergedPassed = run1NonHealedPassed + healReport.passed;
  const mergedFailed = run1NonHealedFailed + healReport.failed;
  const mergedTotal = firstResult.totalTests;

  // Keep app-error failures; add any still-failing tests from heal run
  const mergedFailedTests: FailedTest[] = [
    ...appFails,
    ...healReport.failedTests.map((f) => ({
      ...f,
      failureType: classifyFailure(f.error) as "script" | "app",
    })),
  ];

  const mergedPassRate = mergedTotal > 0 ? mergedPassed / mergedTotal : 0;

  const prevPct = ((firstResult.passed / firstResult.totalTests) * 100).toFixed(1);
  const newPct = (mergedPassRate * 100).toFixed(1);
  console.log(
    `  [AGT-06] Post-heal: ${mergedPassed}/${mergedTotal} passed (${newPct}%) — was ${firstResult.passed}/${firstResult.totalTests} (${prevPct}%)`
  );

  return {
    ...firstResult,
    passed: mergedPassed,
    failed: mergedFailed,
    passRate: mergedPassRate,
    failedTests: mergedFailedTests,
    healAttempted: true,
    healedSpecs,
    scriptErrors: scriptFails.length,
    appErrors: appFails.length,
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
          results?: Array<{ status?: string; error?: { message?: string }; retry?: number }>;
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
          // Playwright JSON report uses test.status = "expected"|"unexpected"|"flaky"|"skipped"
          // NOT "passed"/"failed". Check test.status first, fall back to last result.status.
          const retried = (test.results?.length ?? 0) > 1;
          const lastResultStatus = test.results?.[test.results.length - 1]?.status ?? "";
          const isPassed = test.status === "expected" || test.status === "passed" || lastResultStatus === "passed";
          const isFlaky = test.status === "flaky";
          const isSkipped = test.status === "skipped";

          if (isPassed) passed++;
          else if (isFlaky) { flaky++; passed++; }
          else if (isSkipped) skipped++;
          else {
            failed++;
            const errorMsg = test.results?.[0]?.error?.message ?? "Unknown error";
            const truncatedError = errorMsg.slice(0, 500);
            failedTests.push({
              title: spec.title,
              file: suite.file ?? "",
              // GUARDRAIL: truncate error to 500 chars to avoid PII leakage in DB
              error: truncatedError,
              screenshotPath: locateArtifact(artifactsDir, spec.title, "png"),
              tracePath: locateArtifact(artifactsDir, spec.title, "zip"),
              retried,
              failureType: classifyFailure(truncatedError),
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
  config: TestExecutorConfig,
  testType: "ui" | "api" | "both"
): Promise<void> {
  // testMatch / testIgnore lines — filter spec files by type:
  //   ui   → all *.spec.ts, excluding *.api.spec.ts
  //   api  → only *.api.spec.ts
  //   both → all *.spec.ts (default — no extra lines needed)
  const testFilterLines =
    testType === "ui"
      ? `  testIgnore: ["**/*.api.spec.ts"],`
      : testType === "api"
        ? `  testMatch: ["**/*.api.spec.ts"],`
        : "";

  const content = `// Auto-generated by AGT-06 — deleted after run
const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: ${JSON.stringify(path.resolve(specDir))},
  outputDir: ${JSON.stringify(outputDir)},${testFilterLines ? `\n  ${testFilterLines.trim()}` : ""}
  use: {
    baseURL: ${JSON.stringify(config.baseURL)},
    headless: ${config.headless ?? true},
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
    actionTimeout: ${ACTION_TIMEOUT_MS},
    navigationTimeout: ${NAVIGATION_TIMEOUT_MS},
  },
  retries: ${MAX_RETRIES},
  workers: ${MAX_WORKERS},
  timeout: ${TEST_TIMEOUT_MS},
  maxFailures: ${MAX_FAILURES},
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
