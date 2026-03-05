import "dotenv/config";
import { runCodebaseAnalyst } from "../agents/01-codebase-analyst";
import type { Scenario, TestType } from "../agents/01-codebase-analyst";
import { runJiraValidator } from "../agents/02-jira-validator";
import type { ValidatedScenario } from "../agents/02-jira-validator";
import { runTestCaseDesigner } from "../agents/03-test-case-designer";
import type { TestCase } from "../agents/03-test-case-designer";
import { runPlaywrightEngineer } from "../agents/04-playwright-engineer";
import { runCoverageAuditor } from "../agents/05-coverage-auditor";
import type { CoverageReport } from "../agents/05-coverage-auditor";
import { runTestExecutor } from "../agents/06-test-executor";
import type { ExecutionResult } from "../agents/06-test-executor";
import { runReportArchitect } from "../agents/07-report-architect";
import { loadConfig } from "./config";
import { PipelineLogger } from "./logger";
import { PipelineStateManager } from "./state";
import * as fs from "fs/promises";

const log = new PipelineLogger();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fromAgent = parseInt(
    args.find((a: string) => a.startsWith("--from="))?.split("=")[1] ?? "1"
  );
  const singleAgent = parseInt(
    args.find((a: string) => a.startsWith("--agent="))?.split("=")[1] ?? "0"
  );
  // --test-type=ui|api|both  (also reads TEST_TYPE env var as fallback inside AGT-01)
  const testTypeArg = args.find((a: string) => a.startsWith("--test-type="))?.split("=")[1];
  const testType = (testTypeArg ?? process.env.TEST_TYPE ?? "both") as TestType;

  log.banner();
  const config = await loadConfig();
  const state = new PipelineStateManager();

  // ── AGENT 01: Codebase Analysis (PR-triggered) ───────────────────────────
  if (shouldRun(1, fromAgent, singleAgent)) {
    log.phase(1, "AGT-01", "Codebase Analysis");

    // PR context is set by the CI workflow via environment variables:
    //   PR_TITLE, PR_BRANCH, PR_NUMBER, GITHUB_BASE_REF, PR_CHANGED_FILES
    // AGT-01 reads these directly from process.env — no explicit passing needed.
    const prTitle = process.env.PR_TITLE ?? "";
    const prBranch = process.env.PR_BRANCH ?? "";
    if (prTitle || prBranch) {
      log.info(`PR context: "${prTitle}" (${prBranch})`);
    }

    log.info(`Test type: ${testType}`);
    const scenarios = await runCodebaseAnalyst(config.repoPath, testType);
    await state.save("scenarios", scenarios);
    log.done(`Generated ${scenarios.length} regression scenarios (${testType})`);
    if (singleAgent === 1) {
      log.complete("Single-agent run complete");
      return;
    }
  }

  // ── AGENT 02: JIRA Story Alignment Validation ─────────────────────────────
  if (shouldRun(2, fromAgent, singleAgent)) {
    log.phase(2, "AGT-02", "JIRA Story Alignment");
    const scenarios = await state.load<Scenario[]>("scenarios");

    if (scenarios.length > 0) {
      const ticket = scenarios[0].jiraTicket;
      log.info(`Validating JIRA story: ${ticket ?? "(no ticket found)"}`);
    }

    // AGT-02 fetches the specific story identified in the PR (TGDEMO-xxxxx)
    // and validates that the code changes actually match the story description
    // and acceptance criteria. Throws on FAIL verdict — blocks the pipeline.
    const validatedScenarios = await runJiraValidator(scenarios, config.jira);
    await state.save("validated-scenarios", validatedScenarios);

    const mismatches = validatedScenarios.filter((s) => s.coverageStatus === "MISMATCH");
    const gaps = validatedScenarios.filter((s) => s.coverageStatus === "GAP");
    const verdict = validatedScenarios[0]?.alignmentVerdict ?? "N/A";

    log.done(
      `${validatedScenarios.length} scenarios validated | ` +
        `Verdict: ${verdict} | ` +
        `${mismatches.length} mismatches | ${gaps.length} gaps`
    );
    if (singleAgent === 2) {
      log.complete("Single-agent run complete");
      return;
    }
  }

  // ── AGENT 03: Test Case Design ────────────────────────────────────────────
  if (shouldRun(3, fromAgent, singleAgent)) {
    log.phase(3, "AGT-03", "Test Case Design");
    const validatedScenarios = await state.load<ValidatedScenario[]>("validated-scenarios");

    let testCases: TestCase[];
    const baselineExists = await state.exists("regression-baseline");

    if (baselineExists) {
      // ── Subsequent runs: load stable regression baseline ─────────────────
      const baselineCases = await state.load<TestCase[]>("regression-baseline");
      log.info(`Loaded ${baselineCases.length} regression test cases from baseline (UUIDs preserved)`);

      const regressionScenarios = validatedScenarios.filter((s) => s.scenarioScope === "regression");
      const newFeatureScenarios = validatedScenarios.filter((s) => s.scenarioScope === "new-feature");

      // Only generate new regression cases for modules not already in the baseline
      const baselineModules = new Set(baselineCases.map((tc) => tc.module));
      const newRegressionScenarios = regressionScenarios.filter(
        (s) => !baselineModules.has(s.module)
      );

      const scenariosToProcess = [...newRegressionScenarios, ...newFeatureScenarios];
      let freshCases: TestCase[] = [];

      if (scenariosToProcess.length > 0) {
        log.info(
          `Generating test cases for ${newRegressionScenarios.length} new regression module(s) + ` +
            `${newFeatureScenarios.length} new-feature scenario(s)`
        );
        freshCases = await runTestCaseDesigner(scenariosToProcess);
      } else {
        log.info("No new modules or new-feature scenarios — using baseline as-is");
      }

      // Additive baseline update: append new regression cases for new modules
      const freshRegression = freshCases.filter((tc) => tc.caseScope === "regression");
      if (freshRegression.length > 0) {
        const updatedBaseline = [...baselineCases, ...freshRegression];
        await state.save("regression-baseline", updatedBaseline);
        log.info(`Baseline updated: +${freshRegression.length} new regression case(s) (total: ${updatedBaseline.length})`);
      }

      const freshNewFeature = freshCases.filter((tc) => tc.caseScope === "new-feature");
      testCases = [...baselineCases, ...freshRegression, ...freshNewFeature];
    } else {
      // ── First run: generate all test cases and save regression baseline ──
      log.info("No regression baseline found — running full test case design");
      testCases = await runTestCaseDesigner(validatedScenarios);

      const regressionCases = testCases.filter((tc) => tc.caseScope === "regression");
      await state.save("regression-baseline", regressionCases);
      log.info(`Regression baseline created: ${regressionCases.length} test cases saved to pipeline-state/regression-baseline.json`);
    }

    await state.save("test-cases", testCases);
    const rCount = testCases.filter((tc) => tc.caseScope === "regression").length;
    const nfCount = testCases.filter((tc) => tc.caseScope === "new-feature").length;
    log.done(`${testCases.length} test cases ready (${rCount} regression | ${nfCount} new-feature)`);
    if (singleAgent === 3) {
      log.complete("Single-agent run complete");
      return;
    }
  }

  // ── AGENT 04: Playwright Test Generation ──────────────────────────────────
  if (shouldRun(4, fromAgent, singleAgent)) {
    log.phase(4, "AGT-04", "Playwright Test Generation");
    const testCases = await state.load<TestCase[]>("test-cases");
    const apiSpecs = await loadApiSpecs(config.openApiPath);
    await runPlaywrightEngineer(testCases, apiSpecs);
    log.done("Playwright specs, POMs, and fixtures written to playwright-tests/");
    if (singleAgent === 4) {
      log.complete("Single-agent run complete");
      return;
    }
  }

  // ── AGENT 05: Coverage Audit ──────────────────────────────────────────────
  if (shouldRun(5, fromAgent, singleAgent)) {
    log.phase(5, "AGT-05", "Coverage Audit");
    const testCases = await state.load<TestCase[]>("test-cases");
    let coverageReport = await runCoverageAuditor(testCases, "playwright-tests/specs", config.guardrails);
    await state.save("coverage-report", coverageReport);

    log.done(
      `Coverage: ${coverageReport.coveragePercent.toFixed(1)}% | ` +
        `P0: ${coverageReport.p0CoveragePercent.toFixed(1)}% (min: ${config.guardrails.minP0Coverage}%) | ` +
        `P1: ${coverageReport.p1CoveragePercent.toFixed(1)}% (min: ${config.guardrails.minP1Coverage}%)`
    );

    // GUARDRAIL: feedback loop — remediate gaps before execution
    if (coverageReport.blocked) {
      log.warn(
        `P0 coverage ${coverageReport.p0CoveragePercent.toFixed(1)}% < ${config.guardrails.minP0Coverage}% or ` +
          `P1 coverage ${coverageReport.p1CoveragePercent.toFixed(1)}% < ${config.guardrails.minP1Coverage}% — ` +
          `triggering AGT-04 gap remediation pass`
      );
      const apiSpecs = await loadApiSpecs(config.openApiPath);
      const gapCaseIds = new Set(coverageReport.gapCases.map((g) => g.testCaseId));
      const gapTestCases = testCases.filter((tc) => gapCaseIds.has(tc.id));
      await runPlaywrightEngineer(gapTestCases, apiSpecs, { remediationMode: true });

      log.info("Re-checking coverage after remediation…");
      coverageReport = await runCoverageAuditor(testCases, "playwright-tests/specs", config.guardrails);
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

    if (singleAgent === 5) {
      log.complete("Single-agent run complete");
      return;
    }
  }

  // ── AGENT 06: Test Execution ──────────────────────────────────────────────
  if (shouldRun(6, fromAgent, singleAgent)) {
    log.phase(6, "AGT-06", "Test Execution");
    const executionResult = await runTestExecutor("playwright-tests/specs", {
      baseURL: config.stagingUrl,
      headless: true,
      testType,
    });
    await state.save("execution-result", executionResult);
    const passRate = ((executionResult.passed / executionResult.totalTests) * 100).toFixed(1);
    log.done(
      `${executionResult.passed}/${executionResult.totalTests} passed (${passRate}%) ` +
        `in ${(executionResult.durationMs / 1000).toFixed(1)}s`
    );

    // GUARDRAIL: enforce SLA pass rate — fail the pipeline if tests are below threshold
    if (executionResult.totalTests > 0 && executionResult.passRate < config.sla.passRate) {
      log.error(
        `Pass rate ${(executionResult.passRate * 100).toFixed(1)}% is below SLA threshold ` +
          `${(config.sla.passRate * 100).toFixed(1)}%. ` +
          `${executionResult.failed} test(s) failed. Pipeline blocked.`
      );
      process.exit(1);
    }

    if (singleAgent === 6) {
      log.complete("Single-agent run complete");
      return;
    }
  }

  // ── AGENT 07: Report Generation ───────────────────────────────────────────
  if (shouldRun(7, fromAgent, singleAgent)) {
    log.phase(7, "AGT-07", "Report Generation");
    const executionResult = await state.load<ExecutionResult>("execution-result");
    const coverageReport = await state.load<CoverageReport>("coverage-report");
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
