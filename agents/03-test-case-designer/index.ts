/**
 * AGT-03 — Test Case Designer  (v3)
 *
 * Receives ValidatedScenario[] from AGT-02, each tagged with:
 *   scenarioScope = "regression" | "new-feature"
 *   testType      = "ui" | "api"
 *
 * For each scenario, generates detailed test cases scoped strictly to
 * the scenario's testType:
 *
 *   testType = "ui"
 *     Browser-based test cases only: navigate pages, interact with UI elements
 *     (buttons, forms, modals), assert visible text, rendered lists, redirects.
 *     No HTTP request steps.
 *
 *   testType = "api"
 *     HTTP test cases only: send GET/POST/PUT/PATCH/DELETE requests with
 *     headers and bodies, assert status codes and response JSON fields.
 *     No browser navigation steps.
 *
 * Every TestCase carries testType so AGT-04 can write the right kind of
 * Playwright test (page interactions vs page.evaluate fetch).
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
  testType: z.enum(["ui", "api"]), // propagated from scenario.testType — LLM cannot override
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
    `  [AGT-03] Scenarios: ` +
      `${regression.length} regression ` +
      `(${regression.filter((s) => s.testType === "ui").length} UI | ` +
      `${regression.filter((s) => s.testType === "api").length} API) + ` +
      `${newFeature.length} new-feature ` +
      `(${newFeature.filter((s) => s.testType === "ui").length} UI | ` +
      `${newFeature.filter((s) => s.testType === "api").length} API)`
  );
  console.log(
    `  [AGT-03] Limits: ${MAX_CASES_PER_SCENARIO} per scenario | ` +
      `${MAX_REGRESSION_CASES} regression total | ${MAX_NEW_FEATURE_CASES} new-feature total`
  );

  const regressionCases: TestCase[] = [];
  const newFeatureCases: TestCase[] = [];

  // Regression cases first — they form the stable baseline suite
  for (const scenario of regression) {
    if (regressionCases.length >= MAX_REGRESSION_CASES) break;
    console.log(`  [AGT-03] [regression/${scenario.testType}] ${scenario.title}`);
    const remaining = MAX_REGRESSION_CASES - regressionCases.length;
    const cases = await generateCases(scenario, MAX_CASES_PER_SCENARIO, "regression");
    regressionCases.push(...cases.slice(0, remaining));
  }

  // New-feature cases — JIRA story derived scenarios from AGT-02
  for (const scenario of newFeature) {
    if (newFeatureCases.length >= MAX_NEW_FEATURE_CASES) break;
    console.log(`  [AGT-03] [new-feature/${scenario.testType}] ${scenario.title}`);
    const remaining = MAX_NEW_FEATURE_CASES - newFeatureCases.length;
    const cases = await generateCases(scenario, MAX_CASES_PER_SCENARIO, "new-feature");
    newFeatureCases.push(...cases.slice(0, remaining));
  }

  if (regressionCases.length >= MAX_REGRESSION_CASES) {
    console.warn(`[AGT-03 GUARDRAIL] Regression case limit (${MAX_REGRESSION_CASES}) reached`);
  }
  if (newFeatureCases.length >= MAX_NEW_FEATURE_CASES) {
    console.warn(`[AGT-03 GUARDRAIL] New-feature case limit (${MAX_NEW_FEATURE_CASES}) reached`);
  }

  const allCases = [...regressionCases, ...newFeatureCases];
  const uiTotal = allCases.filter((tc) => tc.testType === "ui").length;
  const apiTotal = allCases.filter((tc) => tc.testType === "api").length;
  console.log(
    `  [AGT-03] Total test cases: ${allCases.length} ` +
      `(${regressionCases.length} regression | ${newFeatureCases.length} new-feature) ` +
      `(${uiTotal} UI | ${apiTotal} API)`
  );

  return allCases;
}

// ── Case Generation (type-aware) ───────────────────────────────────────────

async function generateCases(
  scenario: ValidatedScenario,
  maxCases: number,
  caseScope: "regression" | "new-feature"
): Promise<TestCase[]> {
  const isUI = scenario.testType === "ui";

  // Type-specific instructions — UI cases = browser only, API cases = HTTP only
  const typeInstruction = isUI
    ? `UI TEST CASES ONLY — browser-based, user-facing interactions:
  - Navigate to routes, click buttons/links, fill forms, submit data
  - Assert: visible text, rendered lists, form validation messages, toast notifications,
    modal states, error banners, redirects
  - Steps must describe exactly what a browser user does and what they see
  - Do NOT write HTTP requests, status codes, or response body assertions`
    : `API TEST CASES ONLY — backend HTTP calls:
  - Send HTTP requests (GET/POST/PUT/PATCH/DELETE) with appropriate headers and body
  - Assert: HTTP status codes (200/201/400/401/403/404/422/500), response JSON field values,
    response Content-Type, and error message text in response body
  - Steps must be curl-style or HTTP-client steps (method, URL, headers, body)
  - Do NOT describe browser navigation, UI elements, or DOM state`;

  const titlePrefix = isUI ? "[UI]" : "[API]";
  const exampleAction = isUI
    ? "Navigate to / and click the Add Employee button"
    : "Send POST /api/employees with JSON body: {firstName, email, department}";
  const exampleResult = isUI
    ? "Employee drawer opens and all form fields are visible and interactive"
    : "Response 201 with JSON body containing id, firstName, email fields";
  const exampleData = isUI
    ? "selector: [data-testid=add-employee-btn]"
    : '{"firstName":"Test","email":"test@test.com","department":"Engineering"}';

  // Scope-specific context block
  const scopeContext =
    caseScope === "regression"
      ? `These test cases verify EXISTING, STABLE behaviour. They run on every release.
Do NOT limit them to any PR or ticket — they protect the whole module.`
      : `These test cases validate NEW behaviour from JIRA story ${scenario.jiraTicket}.
Acceptance Criteria: ${scenario.jiraAcceptanceCriteria ?? "N/A"}
JIRA Description: ${scenario.jiraDescription ?? "N/A"}
Alignment: ${scenario.alignmentSummary}`;

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    system: `You are a senior QA engineer writing ${scenario.testType.toUpperCase()} test cases for a web application.

${typeInstruction}

MANDATORY RULES:
1. Generate AT MOST ${maxCases} test cases — prioritise P0 and P1 coverage
2. Include at least: 1 positive (happy path), 1 negative (error/rejection), 1 edge (boundary)
3. Each test case needs 3–20 concrete, independently reproducible steps
4. Steps must reference real routes/endpoints/files from the scenario context
5. Flag requiresPII: true if any step involves personal data (names, emails, phone, SSN)
6. NEVER hardcode real credentials — use [VALID_USER_TOKEN], [TEST_EMAIL], [TEST_PASSWORD]
7. Return ONLY a valid JSON array — no markdown, no explanation text

Schema per test case:
{
  "title": "${titlePrefix} ${scenario.module}: <short descriptive title>",
  "module": "${scenario.module}",
  "priority": "P0|P1|P2|P3",
  "type": "positive|negative|edge",
  "caseScope": "${caseScope}",
  "testType": "${scenario.testType}",
  "preconditions": ["required system/data state before the test runs"],
  "steps": [
    {
      "stepNumber": 1,
      "action": "${exampleAction}",
      "expectedResult": "${exampleResult}",
      "testData": "${exampleData}"
    }
  ],
  "expectedOutcome": "overall pass criterion for this test",
  "requiresPII": false,
  "tags": ["${scenario.module}", "${caseScope}", "${scenario.testType}"]
}`,
    messages: [
      {
        role: "user",
        content: `Generate ${scenario.testType.toUpperCase()} test cases for this module:

Module: ${scenario.module}
Scenario: ${scenario.title}
Description: ${scenario.description}
Priority: ${scenario.priority}
Test Type: ${scenario.testType.toUpperCase()} ONLY
Scope: ${caseScope}

${scopeContext}

User Journeys: ${JSON.stringify(scenario.userJourneys ?? [])}
API Endpoints: ${JSON.stringify(scenario.apiEndpoints ?? [])}
Source Files: ${JSON.stringify(scenario.entryPoints)}
${caseScope === "new-feature" ? `JIRA Story: ${scenario.jiraSummary}\nChanged Files: ${JSON.stringify(scenario.changedFiles)}` : ""}

Generate up to ${maxCases} test cases. ${isUI ? "Focus only on browser/UI behaviour." : "Focus only on HTTP/API behaviour."}`,
      },
    ],
  });

  return parseCases((response.content[0] as { text: string }).text, scenario, caseScope);
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
        module: scenario.module,         // always from scenario — LLM cannot override
        priority: normalisePriority(obj["priority"]),
        type: normaliseType(obj["type"]),
        caseScope: scope,                // enforce scope — LLM cannot override
        testType: scenario.testType,     // enforce testType — LLM cannot override
        preconditions: toStringArray(obj["preconditions"], ["Application is running"]),
        steps: normalisedSteps,
        expectedOutcome: String(obj["expectedOutcome"] ?? "Test passes as described"),
        requiresPII:
          typeof obj["requiresPII"] === "boolean"
            ? obj["requiresPII"]
            : String(obj["requiresPII"]).toLowerCase() === "true",
        tags: toStringArray(obj["tags"], [scenario.module, scope, scenario.testType]),
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
