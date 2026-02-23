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
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  type: z.enum(["positive", "negative", "edge"]),
  preconditions: z.array(z.string()).min(1),
  steps: z.array(TestStepSchema).min(3).max(20),
  expectedOutcome: z.string().min(1),
  requiresPII: z.boolean(),
  tags: z.array(z.string()),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

// ── Guardrail Constants ────────────────────────────────────────────────────

const MAX_TEST_CASES = parseInt(process.env.MAX_TEST_CASES ?? "500", 10);
const FORBIDDEN_PATTERNS = [
  /password\s*[:=]\s*['"`][^'"`]+['"`]/gi,
  /secret\s*[:=]\s*['"`][^'"`]+['"`]/gi,
  /api[-_]?key\s*[:=]\s*['"`][^'"`]+['"`]/gi,
  /token\s*[:=]\s*['"`][A-Za-z0-9._-]{20,}['"`]/gi,
];

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runTestCaseDesigner(
  scenarios: ValidatedScenario[]
): Promise<TestCase[]> {
  const allCases: TestCase[] = [];

  for (const scenario of scenarios) {
    if (allCases.length >= MAX_TEST_CASES) {
      console.warn(`[AGT-03 GUARDRAIL] Max test case limit (${MAX_TEST_CASES}) reached`);
      break;
    }

    console.log(`  [AGT-03] Designing cases for: ${scenario.title}`);
    const cases = await generateCasesForScenario(scenario);
    allCases.push(...cases);
  }

  return allCases;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function generateCasesForScenario(
  scenario: ValidatedScenario
): Promise<TestCase[]> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 6000,
    system: `You are a senior QA engineer writing detailed manual test cases.

Rules (MANDATORY):
1. Generate BOTH positive AND negative variants for every scenario
2. Each test case needs 3–20 steps — no more, no less
3. Flag requiresPII: true if steps involve personal data (names, emails, SSN, etc.)
4. NEVER include real credentials — use placeholders like [VALID_USER_TOKEN], [TEST_EMAIL], [TEST_PASSWORD]
5. Steps must be precise, actionable, and independently reproducible
6. Return ONLY a valid JSON array matching the schema below

Schema:
{
  "title": "string",
  "priority": "P0|P1|P2|P3",
  "type": "positive|negative|edge",
  "preconditions": ["string"],
  "steps": [{ "stepNumber": 1, "action": "string", "expectedResult": "string", "testData": "optional string" }],
  "expectedOutcome": "string",
  "requiresPII": boolean,
  "tags": ["string"]
}`,
    messages: [
      {
        role: "user",
        content: `Generate test cases for this scenario:\n${JSON.stringify(scenario, null, 2)}`,
      },
    ],
  });

  const text = (response.content[0] as { text: string }).text;
  const raw = extractJSONArray(text);

  return raw
    .map((item) => {
      try {
        const tc = TestCaseSchema.parse({
          ...item,
          id: uuidv4(),
          scenarioId: scenario.id,
          jiraRef: scenario.jiraRef,
        });

        // GUARDRAIL: check for hardcoded credentials in steps
        assertNoHardcodedCredentials(tc);

        return tc;
      } catch (err) {
        console.warn(`  [AGT-03] Skipping malformed test case: ${(err as Error).message}`);
        return null;
      }
    })
    .filter((tc): tc is TestCase => tc !== null);
}

function assertNoHardcodedCredentials(tc: TestCase): void {
  const content = JSON.stringify(tc);
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(
        `[AGT-03 GUARDRAIL] Hardcoded credentials detected in test case "${tc.title}"`
      );
    }
  }
}

function extractJSONArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]) as unknown[];
  } catch {
    return [];
  }
}
