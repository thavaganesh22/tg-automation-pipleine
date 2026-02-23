import "dotenv/config";
import { runCodebaseAnalyst } from "../agents/01-codebase-analyst";
import { runJiraValidator } from "../agents/02-jira-validator";
import { runTestCaseDesigner } from "../agents/03-test-case-designer";
import { runPlaywrightEngineer } from "../agents/04-playwright-engineer";
import { runCoverageAuditor } from "../agents/05-coverage-auditor";
import { runTestExecutor } from "../agents/06-test-executor";
import { runReportArchitect } from "../agents/07-report-architect";
import { loadConfig } from "./config";
import { PipelineLogger } from "./logger";
import { PipelineStateManager } from "./state";
import * as fs from "fs/promises";

const log = new PipelineLogger();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fromAgent = parseInt(args.find(a => a.startsWith("--from="))?.split("=")[1] ?? "1");
  const singleAgent = parseInt(args.find(a => a.startsWith("--agent="))?.split("=")[1] ?? "0");

  log.banner();
  const config = await loadConfig();
  const state = new PipelineStateManager();

  // ── AGENT 01: Codebase Analysis (PR-triggered) ───────────────────────────
  if (shouldRun(1, fromAgent, singleAgent)) {
    log.phase(1, "AGT-01", "Codebase Analysis");

    // PR context is set by the CI workflow via environment variables:
    //   PR_TITLE, PR_BRANCH, PR_NUMBER, GITHUB_BASE_REF, PR_CHANGED_FILES
    // AGT-01 reads these directly from process.env — no explicit passing needed.
    const prTitle  = process.env.PR_TITLE ?? "";
    const prBranch = process.env.PR_BRANCH ?? "";
    if (prTitle || prBranch) {
      log.info(`PR context: "${prTitle}" (${prBranch})`);
    }

    const scenarios = await runCodebaseAnalyst(config.repoPath);
    await state.save("scenarios", scenarios);
    log.done(`Generated ${scenarios.length} PR-scoped scenarios`);
    if (singleAgent === 1) { log.complete("Single-agent run complete"); return; }
  }

  // ── AGENT 02: JIRA Story Alignment Validation ─────────────────────────────
  if (shouldRun(2, fromAgent, singleAgent)) {
    log.phase(2, "AGT-02", "JIRA Story Alignment");
    const scenarios = await state.load("scenarios");

    if (scenarios.length > 0) {
      const ticket = (scenarios[0] as { jiraTicket?: string }).jiraTicket;
      log.info(`Validating JIRA story: ${ticket ?? "(no ticket found)"}`);
    }

    // AGT-02 fetches the specific story identified in the PR (TGDEMO-xxxxx)
    // and validates that the code changes actually match the story description
    // and acceptance criteria. Throws on FAIL verdict — blocks the pipeline.
    const validatedScenarios = await runJiraValidator(scenarios, config.jira);
    await state.save("validated-scenarios", validatedScenarios);

    const mismatches = validatedScenarios.filter(
      (s: { coverageStatus: string }) => s.coverageStatus === "MISMATCH"
    );
    const gaps = validatedScenarios.filter(
      (s: { coverageStatus: string }) => s.coverageStatus === "GAP"
    );
    const verdict = validatedScenarios[0]
      ? (validatedScenarios[0] as { alignmentVerdict?: string }).alignmentVerdict
      : "N/A";

    log.done(
      `${validatedScenarios.length} scenarios validated | ` +
      `Verdict: ${verdict} | ` +
      `${mismatches.length} mismatches | ${gaps.length} gaps`
    );
    if (singleAgent === 2) { log.complete("Single-agent run complete"); return; }
  }

  // ── AGENT 03: Test Case Design ────────────────────────────────────────────
  if (shouldRun(3, fromAgent, singleAgent)) {
    log.phase(3, "AGT-03", "Test Case Design");
    const validatedScenarios = await state.load("validated-scenarios");
    const testCases = await runTestCaseDesigner(validatedScenarios);
    await state.save("test-cases", testCases);
    log.done(`Generated ${testCases.length} manual test cases`);
    if (singleAgent === 3) { log.complete("Single-agent run complete"); return; }
  }

  // ── AGENT 04: Playwright Test Generation ──────────────────────────────────
  if (shouldRun(4, fromAgent, singleAgent)) {
    log.phase(4, "AGT-04", "Playwright Test Generation");
    const testCases = await state.load("test-cases");
    const apiSpecs = await loadApiSpecs(config.openApiPath);
    await runPlaywrightEngineer(testCases, apiSpecs);
    log.done("Playwright specs, POMs, and fixtures written to playwright-tests/");
    if (singleAgent === 4) { log.complete("Single-agent run complete"); return; }
  }

  // ── AGENT 05: Coverage Audit ──────────────────────────────────────────────
  if (shouldRun(5, fromAgent, singleAgent)) {
    log.phase(5, "AGT-05", "Coverage Audit");
    const testCases = await state.load("test-cases");
    let coverageReport = await runCoverageAuditor(testCases, "playwright-tests/specs");
    await state.save("coverage-report", coverageReport);

    log.done(
      `Coverage: ${coverageReport.coveragePercent.toFixed(1)}% | ` +
      `P0: ${coverageReport.p0CoveragePercent.toFixed(1)}% | ` +
      `P1: ${coverageReport.p1CoveragePercent.toFixed(1)}%`
    );

    // GUARDRAIL: feedback loop — remediate gaps before execution
    if (coverageReport.blocked) {
      log.warn("P0/P1 coverage < 80% — triggering AGT-04 gap remediation pass");
      const apiSpecs = await loadApiSpecs(config.openApiPath);
      const gapCaseIds = new Set(coverageReport.gapCases.map((g: { testCaseId: string }) => g.testCaseId));
      const gapTestCases = testCases.filter((tc: { id: string }) => gapCaseIds.has(tc.id));
      await runPlaywrightEngineer(gapTestCases, apiSpecs, { remediationMode: true });

      log.info("Re-checking coverage after remediation…");
      coverageReport = await runCoverageAuditor(testCases, "playwright-tests/specs");
      await state.save("coverage-report", coverageReport);

      if (coverageReport.blocked) {
        log.error(
          `Coverage still below threshold after remediation.\n` +
          `P0: ${coverageReport.p0CoveragePercent.toFixed(1)}% | P1: ${coverageReport.p1CoveragePercent.toFixed(1)}%\n` +
          `Escalating to human review — pipeline halted.`
        );
        process.exit(1);
      }
      log.done("Remediation successful — coverage thresholds met");
    }

    if (singleAgent === 5) { log.complete("Single-agent run complete"); return; }
  }

  // ── AGENT 06: Test Execution ──────────────────────────────────────────────
  if (shouldRun(6, fromAgent, singleAgent)) {
    log.phase(6, "AGT-06", "Test Execution");
    const executionResult = await runTestExecutor("playwright-tests/specs", {
      baseURL: config.stagingUrl,
      headless: true,
    });
    await state.save("execution-result", executionResult);
    const passRate = ((executionResult.passed / executionResult.totalTests) * 100).toFixed(1);
    log.done(
      `${executionResult.passed}/${executionResult.totalTests} passed (${passRate}%) ` +
      `in ${(executionResult.durationMs / 1000).toFixed(1)}s`
    );
    if (singleAgent === 6) { log.complete("Single-agent run complete"); return; }
  }

  // ── AGENT 07: Report Generation ───────────────────────────────────────────
  if (shouldRun(7, fromAgent, singleAgent)) {
    log.phase(7, "AGT-07", "Report Generation");
    const executionResult = await state.load("execution-result");
    const coverageReport = await state.load("coverage-report");
    await runReportArchitect(executionResult, coverageReport);
    log.done("Dashboard published | Stakeholder report sent");
  }

  log.complete("Pipeline finished successfully ✓");
}

function shouldRun(agentId: number, from: number, single: number): boolean {
  if (single > 0) return agentId === single;
  return agentId >= from;
}

async function loadApiSpecs(openApiPath?: string): Promise<Record<string, unknown>> {
  if (!openApiPath) return {};
  try {
    return JSON.parse(await fs.readFile(openApiPath, "utf-8"));
  } catch {
    return {};
  }
}

main().catch((err) => {
  console.error("\n[PIPELINE ERROR]", err.message);
  process.exit(1);
});
