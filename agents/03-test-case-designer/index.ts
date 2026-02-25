/**
 * AGT-03 — Test Case Designer  (v2)
 *
 * Receives ValidatedScenario[] from AGT-02, which are tagged with
 * scenarioScope = "regression" | "new-feature".
 *
 * For REGRESSION scenarios:
 *   Generates detailed test cases that verify the application's existing,
 *   stable behaviour still works correctly. Emphasis on:
 *   - Confirming established happy paths haven't regressed
 *   - Verifying known error handling still works
 *   - Boundary conditions that have always been valid
 *   - Integration contracts that downstream systems rely on
 *
 * For NEW-FEATURE scenarios:
 *   Generates detailed test cases validating the new/changed behaviour
 *   from the PR. Emphasis on:
 *   - Happy path for the new feature
 *   - All acceptance criteria from the JIRA story
 *   - New negative/edge cases introduced by the change
 *   - Integration regression risk from the new code
 *
 * Both scopes always produce: positive + negative + edge case types.
 * caseScope on each TestCase propagates to AGT-04 so it knows whether
 * to add to an existing spec (regression) or create/modify (new-feature).
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { ValidatedScenario } from "../02-jira-validator";

const client = new Anthropic();

// ── Types ──────────────────────────────────────────────────────────────────

export const TestStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  action: z.string().min(1),
  expectedResult: z.string().min(1),
  testData: z.string().optional(),
});

export const TestCaseSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  jiraRef: z.string().nullable(),
  title: z.string().min(1),
  module: z.string(), // propagated from scenario.module
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  type: z.enum(["positive", "negative", "edge"]),
  caseScope: z.enum(["regression", "new-feature"]),
  preconditions: z.array(z.string()).min(1),
  steps: z.array(TestStepSchema).min(3).max(20),
  expectedOutcome: z.string().min(1),
  requiresPII: z.boolean(),
  tags: z.array(z.string()),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

// ── Guardrail Constants ────────────────────────────────────────────────────

const MAX_TEST_CASES = parseInt(process.env.MAX_TEST_CASES ?? "500", 10);
// Per-scope budgets (default: split MAX_TEST_CASES evenly if not set)
const MAX_REGRESSION_CASES = parseInt(
  process.env.MAX_REGRESSION_CASES ?? String(Math.ceil(MAX_TEST_CASES / 2)),
  10
);
const MAX_NEW_FEATURE_CASES = parseInt(
  process.env.MAX_NEW_FEATURE_CASES ?? String(Math.ceil(MAX_TEST_CASES / 2)),
  10
);
// Per-scenario cap: limits how many cases one scenario can produce
const MAX_CASES_PER_SCENARIO = parseInt(process.env.MAX_CASES_PER_SCENARIO ?? "10", 10);

const FORBIDDEN_PATTERNS = [
  /password\s*[:=]\s*['"`][^'"`]+['"`]/gi,
  /secret\s*[:=]\s*['"`][^'"`]+['"`]/gi,
  /api[-_]?key\s*[:=]\s*['"`][^'"`]+['"`]/gi,
  /token\s*[:=]\s*['"`][A-Za-z0-9._-]{20,}['"`]/gi,
];

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runTestCaseDesigner(scenarios: ValidatedScenario[]): Promise<TestCase[]> {
  const regression = scenarios.filter((s) => s.scenarioScope === "regression");
  const newFeature = scenarios.filter((s) => s.scenarioScope === "new-feature");

  console.log(
    `  [AGT-03] Scenarios: ${regression.length} regression + ${newFeature.length} new-feature`
  );

  const regressionCases: TestCase[] = [];
  const newFeatureCases: TestCase[] = [];

  console.log(
    `  [AGT-03] Limits: ${MAX_CASES_PER_SCENARIO} per scenario | ` +
      `${MAX_REGRESSION_CASES} regression total | ${MAX_NEW_FEATURE_CASES} new-feature total`
  );

  // Regression cases first — they form the stable baseline suite
  for (const scenario of regression) {
    if (regressionCases.length >= MAX_REGRESSION_CASES) break;
    console.log(`  [AGT-03] [regression] ${scenario.title}`);
    const remaining = MAX_REGRESSION_CASES - regressionCases.length;
    const cases = await generateRegressionCases(scenario, MAX_CASES_PER_SCENARIO);
    regressionCases.push(...cases.slice(0, remaining));
  }

  // New-feature cases — test the PR delta
  for (const scenario of newFeature) {
    if (newFeatureCases.length >= MAX_NEW_FEATURE_CASES) break;
    console.log(`  [AGT-03] [new-feature] ${scenario.title}`);
    const remaining = MAX_NEW_FEATURE_CASES - newFeatureCases.length;
    const cases = await generateNewFeatureCases(scenario, MAX_CASES_PER_SCENARIO);
    newFeatureCases.push(...cases.slice(0, remaining));
  }

  if (regressionCases.length >= MAX_REGRESSION_CASES) {
    console.warn(`[AGT-03 GUARDRAIL] Regression case limit (${MAX_REGRESSION_CASES}) reached`);
  }
  if (newFeatureCases.length >= MAX_NEW_FEATURE_CASES) {
    console.warn(`[AGT-03 GUARDRAIL] New-feature case limit (${MAX_NEW_FEATURE_CASES}) reached`);
  }

  const allCases = [...regressionCases, ...newFeatureCases];
  console.log(
    `  [AGT-03] Total test cases: ${allCases.length} (${regressionCases.length} regression + ${newFeatureCases.length} new-feature)`
  );

  return allCases;
}

// ── Regression Case Generation ─────────────────────────────────────────────

async function generateRegressionCases(
  scenario: ValidatedScenario,
  maxCases: number
): Promise<TestCase[]> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    system: `You are a senior QA engineer writing REGRESSION test cases for a full-stack web application.

IMPORTANT: These test cases are for the WHOLE APPLICATION — they are NOT limited to any PR or ticket.
They verify the EXISTING, STABLE behaviour of the module described below and run on every release.

Rules (MANDATORY):
1. Generate AT MOST ${maxCases} test cases total — prioritise the most critical coverage
2. Write test cases for BOTH layers:
   FRONTEND — use the entry point file paths to infer pages/routes/components:
     - Navigate to the page, interact with UI elements (buttons, forms, links)
     - Assert visible text, rendered lists, form validation messages, redirects
   BACKEND — use the apiEndpoints list for direct HTTP call steps:
     - Send the request (method, URL, headers, body)
     - Assert HTTP status code and response body fields
3. Include at least one POSITIVE (happy path), one NEGATIVE (error/rejection), one EDGE (boundary) case
4. Each test case needs 3–20 concrete, independently reproducible steps
5. Steps must be specific to THIS module — reference real routes and file paths provided
6. Flag requiresPII: true if any step involves personal data (names, emails, phone, SSN)
7. NEVER hardcode real credentials — use [VALID_USER_TOKEN], [TEST_EMAIL], [TEST_PASSWORD]
8. Return ONLY a valid JSON array — no markdown, no explanation

Schema per test case:
{
  "title": "[Frontend|Backend|Integration] <short descriptive title for this module>",
  "module": "${scenario.module}",
  "priority": "P0|P1|P2|P3",
  "type": "positive|negative|edge",
  "caseScope": "regression",
  "preconditions": ["required system/data state before this test runs"],
  "steps": [
    {
      "stepNumber": 1,
      "action": "Frontend: 'Navigate to /employees and click Add Employee' OR Backend: 'Send POST /api/employees with valid JSON body'",
      "expectedResult": "Frontend: 'Employee list renders with name column' OR Backend: 'Response 201 with id field in body'",
      "testData": "optional — URL path, JSON payload, selector, or input value"
    }
  ],
  "expectedOutcome": "overall pass criterion — what must be true for this test to pass",
  "requiresPII": false,
  "tags": ["${scenario.module}", "regression", "frontend|backend|integration"]
}`,
    messages: [
      {
        role: "user",
        content: `Generate regression test cases for this application module (frontend + backend):

Module: ${scenario.module}
Scenario: ${scenario.title}
Description: ${scenario.description}
Priority: ${scenario.priority}
User Journeys: ${JSON.stringify(scenario.userJourneys ?? [])}
API Endpoints: ${JSON.stringify(scenario.apiEndpoints ?? [])}
Source Files: ${JSON.stringify(scenario.entryPoints)}

Write test cases that verify this module's existing behaviour still works correctly.
Use API Endpoints for backend steps and Source Files (page/route paths) for frontend steps.`,
      },
    ],
  });

  return parseCases((response.content[0] as { text: string }).text, scenario, "regression");
}

// ── New-Feature Case Generation ────────────────────────────────────────────

async function generateNewFeatureCases(
  scenario: ValidatedScenario,
  maxCases: number
): Promise<TestCase[]> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    system: `You are a senior QA engineer writing NEW-FEATURE test cases.

These test cases verify NEW or MODIFIED behaviour introduced by a PR across BOTH frontend and backend.
They validate the JIRA story's acceptance criteria and the new code paths.

Rules (MANDATORY):
1. Generate AT MOST ${maxCases} test cases total — prioritise acceptance criteria coverage first
2. Cover BOTH layers introduced or changed by this PR:
   - FRONTEND tests: new UI interactions, new page states, new validation messages visible to the user
     (navigate to pages, interact with new UI elements, assert visible outcomes)
   - BACKEND tests: new or changed API endpoint behaviour
     (send HTTP requests to new/modified routes, assert status codes and response bodies)
3. Start with acceptance criteria, then negative cases, then edge cases
4. Each test case needs 3–20 steps — precise, actionable, independently reproducible
5. Steps must describe NEW behaviour only (not existing behaviour)
6. Steps must reference actual routes from API Endpoints and pages from Changed Files
7. Flag requiresPII: true if steps involve personal data
8. NEVER include real credentials — use [VALID_USER_TOKEN], [TEST_EMAIL], [TEST_PASSWORD]
9. Return ONLY a valid JSON array

Schema per test case:
{
  "title": "string — include [Frontend] or [Backend] or [Integration] prefix",
  "module": "${scenario.module}",
  "priority": "P0|P1|P2|P3",
  "type": "positive|negative|edge",
  "caseScope": "new-feature",
  "preconditions": ["setup required for this new feature"],
  "steps": [
    {
      "stepNumber": 1,
      "action": "frontend: precise UI action; or backend: HTTP method + route + headers/body",
      "expectedResult": "exact observable outcome — UI text shown, HTTP status code, response field",
      "testData": "optional — URL, payload, selector, or input value"
    }
  ],
  "expectedOutcome": "overall pass criterion confirming the new feature works as specified",
  "requiresPII": false,
  "tags": ["${scenario.module}", "new-feature", "frontend|backend|integration"]
}`,
    messages: [
      {
        role: "user",
        content: `Generate new-feature test cases for this scenario covering BOTH frontend and backend:

Module: ${scenario.module}
Title: ${scenario.title}
Description: ${scenario.description}
Priority: ${scenario.priority}
JIRA Ticket: ${scenario.jiraTicket}
JIRA Story: ${scenario.jiraSummary}
JIRA Description: ${scenario.jiraDescription ?? "N/A"}
Acceptance Criteria: ${scenario.jiraAcceptanceCriteria ?? "N/A"}
User Journeys: ${JSON.stringify(scenario.userJourneys ?? [])}
API Endpoints: ${JSON.stringify(scenario.apiEndpoints ?? [])}
Changed Files: ${JSON.stringify(scenario.changedFiles)}
Alignment Summary: ${scenario.alignmentSummary}

Generate test cases that validate the new JIRA story behaviour in BOTH the UI and the API.
Use API Endpoints for backend steps and Changed Files paths for frontend steps.`,
      },
    ],
  });

  return parseCases((response.content[0] as { text: string }).text, scenario, "new-feature");
}

// ── Parsing helpers ────────────────────────────────────────────────────────

/** Normalise LLM priority output — "P1 - Critical", "high", "P1-high" → "P1" */
function normalisePriority(val: unknown): "P0" | "P1" | "P2" | "P3" {
  const s = String(val ?? "P2").toUpperCase();
  const match = s.match(/^P([0-3])/);
  if (match) return `P${match[1]}` as "P0" | "P1" | "P2" | "P3";
  if (s.includes("CRITICAL") || s.includes("HIGH")) return "P1";
  if (s.includes("LOW") || s.includes("MINOR")) return "P3";
  return "P2";
}

/** Normalise LLM test type — "positive-test", "positive test", "happy path" → "positive" */
function normaliseType(val: unknown): "positive" | "negative" | "edge" {
  const s = String(val ?? "positive").toLowerCase();
  if (s.includes("neg") || s.includes("error") || s.includes("fail") || s.includes("invalid"))
    return "negative";
  if (s.includes("edge") || s.includes("bound") || s.includes("corner")) return "edge";
  return "positive";
}

/** Coerce a value to a string array */
function toStringArray(val: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === "string" && val.trim()) return [val.trim()];
  return fallback;
}

// ── Parsing ────────────────────────────────────────────────────────────────

function parseCases(
  text: string,
  scenario: ValidatedScenario,
  scope: "regression" | "new-feature"
): TestCase[] {
  const items = extractJSONArray(text);

  if (items.length === 0) {
    console.warn(
      `  [AGT-03] WARNING: LLM returned no parseable JSON array for ${scope} test cases.\n` +
        `  Response preview: ${text.slice(0, 300).replace(/\n/g, " ")}`
    );
    return [];
  }

  const results: TestCase[] = [];
  let skipped = 0;

  for (const item of items) {
    try {
      const obj = item as Record<string, unknown>;

      // Normalise steps — ensure stepNumber is numeric
      const rawSteps = Array.isArray(obj["steps"]) ? obj["steps"] : [];
      const normalisedSteps = rawSteps.map((s: unknown, idx: number) => {
        const step = s as Record<string, unknown>;
        return {
          stepNumber: typeof step["stepNumber"] === "number" ? step["stepNumber"] : idx + 1,
          action: String(step["action"] ?? ""),
          expectedResult: String(step["expectedResult"] ?? ""),
          testData: step["testData"] != null ? String(step["testData"]) : undefined,
        };
      });

      const tc = TestCaseSchema.parse({
        ...obj,
        id: uuidv4(),
        scenarioId: scenario.id,
        jiraRef: scenario.jiraRef ?? null,
        title: String(obj["title"] ?? "Untitled test case"),
        module: scenario.module, // always from scenario — LLM cannot override
        priority: normalisePriority(obj["priority"]),
        type: normaliseType(obj["type"]),
        caseScope: scope, // enforce scope — LLM cannot override
        preconditions: toStringArray(obj["preconditions"], ["Application is running"]),
        steps: normalisedSteps,
        expectedOutcome: String(obj["expectedOutcome"] ?? "Test passes as described"),
        requiresPII:
          typeof obj["requiresPII"] === "boolean"
            ? obj["requiresPII"]
            : String(obj["requiresPII"]).toLowerCase() === "true",
        tags: toStringArray(obj["tags"], [scenario.module, scope]),
      });

      assertNoHardcodedCredentials(tc);
      results.push(tc);
    } catch (err) {
      skipped++;
      console.warn(`  [AGT-03] Skipping malformed test case: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  if (skipped > 0) {
    console.warn(`  [AGT-03] ${skipped}/${items.length} test cases skipped due to validation errors`);
  }

  return results;
}

function assertNoHardcodedCredentials(tc: TestCase): void {
  const content = JSON.stringify(tc);
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(`[AGT-03 GUARDRAIL] Hardcoded credentials in test case "${tc.title}"`);
    }
  }
}

function extractJSONArray(text: string): unknown[] {
  // Strategy 1: raw JSON (no code fence)
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  // Strategy 2: extract content between code fence markers (non-greedy match)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const inner = fenceMatch ? fenceMatch[1].trim() : text.trim();

  const start = inner.indexOf("[");
  if (start === -1) return [];

  // Strategy 3: try JSON.parse on substring from first '[' to end
  try {
    const parsed = JSON.parse(inner.slice(start));
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }

  // Strategy 4: greedy last-bracket slice
  const lastBracket = inner.lastIndexOf("]");
  if (lastBracket > start) {
    try {
      const parsed = JSON.parse(inner.slice(start, lastBracket + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  return [];
}
