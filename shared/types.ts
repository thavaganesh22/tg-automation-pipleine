/**
 * shared/types.ts
 *
 * Single import point for all public agent types.
 * Teams that use individual agents can import from here instead of
 * reaching into each agent's directory.
 *
 * Example:
 *   import type { TestCase, PlaywrightEngineerInput } from '../shared/types';
 */

// ── Shared Browser Inspector Types ──────────────────────────────────────────

export interface EnhancedAppStructure {
  // Existing (from original AppStructure in AGT-04)
  discoveredSelectors: string[];
  snapshots: {
    mainPage: string;
    addDrawer: string;
    editDrawer: string;
    confirmDialog: string;
  };
  observations: {
    tableColumns: string[];
    firstRowValues: Record<string, string>;
    addDrawerFields: string[];
    editDrawerPrefill: Record<string, string>;
    confirmDialogText: string;
    apiListSample: string;
    apiEmployeeSample: string;
  };

  // NEW — form behavior
  formBehavior: {
    fieldsWithDefaults: Record<string, string>;     // testid -> default value
    emptySubmitErrors: Record<string, string>;       // testid -> error text (only fields that show errors)
    fieldsWithoutErrors: string[];                   // fields that DON'T show errors on empty submit
  };

  // NEW — dropdown options
  dropdownOptions: Record<string, string[]>;         // testid -> option values (exact case)

  // NEW — API schemas (probed from live app)
  apiSchemas: {
    listShape: Record<string, unknown> | null;
    listDefaultLimit: number;
    listSampleResponse: unknown;
    singleShape: Record<string, unknown> | null;
    singleSampleResponse: unknown;
    createRequiredFields: string[];
    createOptionalWithDefaults: Record<string, string>;
    createSuccessShape: Record<string, unknown> | null;
    createErrorShape: unknown;
    duplicateEmailStatus: number;
    duplicateEmailErrorShape: unknown;
    duplicateEmailCaseSensitive: boolean;
    deleteStatus: number;
    deleteHasBody: boolean;
    healthShape: unknown;
    invalidIdStatus: number;                            // GET /api/employees/invalid-id → 400 or 404?
    invalidIdErrorShape: unknown;                       // error body for invalid ID
    notFoundIdStatus: number;                           // GET /api/employees/<valid-but-nonexistent> → 404
    notFoundIdErrorShape: unknown;                      // error body for not-found ID
    filterBehavior: {
      unknownDepartmentReturnsEmpty: boolean;           // GET ?department=INVALID → empty data[] or error?
      unknownStatusReturnsEmpty: boolean;               // GET ?status=INVALID → empty data[] or error?
    };
  };

  // NEW — route behavior
  routeBehavior: Record<string, number>;             // path -> status code

  // NEW — timing measurements
  timings: {
    successToastMs: number;
    drawerOpenMs: number;
    loadingRowMs: number;
  };
}

// ── AGT-01: Codebase Analyst ─────────────────────────────────────────────────
export type { Scenario, TestType, PRContext } from "../agents/01-codebase-analyst";

// ── AGT-02: JIRA Validator ───────────────────────────────────────────────────
export type {
  JiraStory,
  AlignmentVerdict,
  AlignmentFinding,
  ValidatedScenario,
  JiraValidationReport,
  JiraConfig,
} from "../agents/02-jira-validator";

// ── AGT-03: Test Case Designer ───────────────────────────────────────────────
export type { TestCase } from "../agents/03-test-case-designer";

// ── AGT-04: Playwright Engineer ──────────────────────────────────────────────
export type {
  PlaywrightEngineerInput,
  PlaywrightEngineerOutput,
  PlaywrightEngineerOptions,
} from "../agents/04-playwright-engineer";

// ── AGT-05: Coverage Auditor ─────────────────────────────────────────────────
export type {
  TraceabilityEntry,
  TypeCoverageBreakdown,
  CoverageReport,
  CoverageGuardrails,
} from "../agents/05-coverage-auditor";

// ── AGT-06: Test Executor ────────────────────────────────────────────────────
export type {
  TestExecutorConfig,
  FailedTest,
  AllTestResult,
  ExecutionResult,
} from "../agents/06-test-executor";

// ── AGT-07: Report Architect ─────────────────────────────────────────────────
export type { DashboardData } from "../agents/07-report-architect";
