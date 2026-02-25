/**
 * AGT-04 — Playwright Engineer  (v2)
 *
 * Receives TestCase[] from AGT-03 tagged with caseScope = "regression" | "new-feature".
 *
 * Strategy per module:
 *
 *   If a spec for this module ALREADY EXISTS:
 *     - Merge new-feature test cases INTO the existing spec (preserve all existing tests)
 *     - Leave regression-scope test cases as-is (they were written on first creation)
 *
 *   If NO spec exists yet (new module):
 *     - Generate full spec (POM + fixtures + spec) from ALL test cases (regression + new-feature)
 *
 *   Remediation mode (triggered by AGT-05 when coverage < 80%):
 *     - Always regenerate the full spec, overwriting any existing file
 *
 * The module name comes from TestCase.module (set from scenario.module by AGT-03),
 * ensuring consistent, intentional module-to-file mapping.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";
import type { TestCase } from "../03-test-case-designer";

const client = new Anthropic();

const OUTPUT_ROOT = "playwright-tests";
const POM_DIR = `${OUTPUT_ROOT}/pages`;
const FIXTURE_DIR = `${OUTPUT_ROOT}/fixtures`;
const SPEC_DIR = `${OUTPUT_ROOT}/specs`;
const MAX_LINES_PER_FILE = 400;
// Cap cases passed to each generator to stay within max_tokens budget
const MAX_CASES_PER_SPEC = parseInt(process.env.MAX_CASES_PER_SPEC ?? "20", 10);

export interface PlaywrightEngineerOptions {
  remediationMode?: boolean;
}

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runPlaywrightEngineer(
  testCases: TestCase[],
  apiSpecs: Record<string, unknown>,
  options: PlaywrightEngineerOptions = {}
): Promise<void> {
  await ensureDirs();

  // Group by module (from TestCase.module, sourced from Scenario.module)
  const moduleGroups = groupByModule(testCases);

  for (const [module, cases] of Object.entries(moduleGroups)) {
    const regressionCases = cases.filter((c) => c.caseScope === "regression");
    const newFeatureCases = cases.filter((c) => c.caseScope === "new-feature");

    console.log(
      `  [AGT-04] Module: ${module} | ` +
        `${regressionCases.length} regression + ${newFeatureCases.length} new-feature cases`
    );

    const specPath = path.join(SPEC_DIR, `${module}.spec.ts`);
    const pomPath = path.join(POM_DIR, `${module}.page.ts`);
    const fixturePath = path.join(FIXTURE_DIR, `${module}.fixture.ts`);

    const specExists = await fileExists(specPath);

    if (specExists && !options.remediationMode) {
      // ── Existing spec: merge new-feature cases only; regression already covered ──
      if (newFeatureCases.length > 0) {
        console.log(
          `  [AGT-04] Merging ${newFeatureCases.length} new-feature cases into ${specPath}`
        );
        await mergeNewFeatureCases(specPath, newFeatureCases, module);
      } else {
        console.log(`  [AGT-04] No new-feature cases for ${module} — existing spec unchanged`);
      }

      // Update POM if new-feature cases introduce new page actions
      if (newFeatureCases.length > 0 && (await fileExists(pomPath))) {
        console.log(`  [AGT-04] Extending POM for new actions in ${module}`);
        await extendPOM(pomPath, newFeatureCases, module);
      }
    } else if (specExists && options.remediationMode) {
      // ── Remediation: append gap cases to existing spec (do not overwrite) ──
      console.log(
        `  [AGT-04] Remediation: merging ${cases.length} gap cases into existing ${specPath}`
      );
      await mergeNewFeatureCases(specPath, cases, module);
    } else {
      // ── No spec yet: generate full suite from scratch ──
      // Slice to MAX_CASES_PER_SPEC to keep LLM output within token budget
      const allCases = [...regressionCases, ...newFeatureCases].slice(0, MAX_CASES_PER_SPEC);
      const cappedRegression = regressionCases.slice(0, Math.ceil(MAX_CASES_PER_SPEC * 0.7));
      const cappedNewFeature = newFeatureCases.slice(0, Math.floor(MAX_CASES_PER_SPEC * 0.3));
      if (allCases.length === 0) continue;

      console.log(`  [AGT-04] New module: generating full suite for ${module} (${allCases.length} cases)`);

      // Generate POM first, then pass it to spec so method names are consistent
      const [pomCode, fixtureCode] = await Promise.all([
        generatePOM(module, allCases),
        generateFixtures(module, allCases, apiSpecs),
      ]);
      const specCode = await generateSpec(module, cappedRegression, cappedNewFeature, pomCode);

      await writeChecked(pomPath, pomCode, `${module}.page`);
      await writeChecked(fixturePath, fixtureCode, `${module}.fixture`);
      await writeChecked(specPath, specCode, `${module}.spec`);
      validateTypeScript(specPath);
    }
  }
}

// ── Code Generators ────────────────────────────────────────────────────────

async function generatePOM(module: string, cases: TestCase[]): Promise<string> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright TypeScript expert generating a Page Object Model.
Rules:
- Class named ${toPascalCase(module)}Page
- All selectors as private readonly data-testid properties
- Public async methods for each user action in the test cases
- waitForSelector / waitForResponse for async operations
- TypeScript strict mode — no 'any'
- Return ONLY TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Generate POM for module "${module}".

Test actions to cover:
${JSON.stringify(
  cases.map((c) => ({
    title: c.title,
    scope: c.caseScope,
    actions: c.steps.map((s: { action: string }) => s.action),
  })),
  null,
  2
)}`,
      },
    ],
  });
  return (response.content[0] as { text: string }).text;
}

async function extendPOM(pomPath: string, newCases: TestCase[], module: string): Promise<void> {
  const existing = await fs.readFile(pomPath, "utf-8");
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright TypeScript expert extending a Page Object Model.
Rules:
- Preserve ALL existing methods and selectors — do not modify them
- Add new selector properties and methods only for NEW actions not already present
- Maintain TypeScript strict mode — no 'any'
- Return ONLY the complete updated TypeScript class, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Existing POM:\n${existing}

New actions to add for module "${module}":
${JSON.stringify(
  newCases.map((c) => ({
    title: c.title,
    actions: c.steps.map((s: { action: string }) => s.action),
  })),
  null,
  2
)}`,
      },
    ],
  });
  await writeChecked(
    pomPath,
    (response.content[0] as { text: string }).text,
    `${module}.page extended`
  );
}

async function generateFixtures(
  module: string,
  cases: TestCase[],
  apiSpecs: Record<string, unknown>
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright expert generating test fixture files.
Rules:
- Use page.route() to intercept ALL external HTTP calls
- Provide success (2xx) AND error (4xx, 5xx) mock responses for every endpoint
- Export named async function: setup${toPascalCase(module)}Mocks(page: Page)
- TypeScript strict mode — no 'any'
- Return ONLY TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Generate fixtures for module "${module}".

API specs: ${JSON.stringify(apiSpecs).slice(0, 3000)}

Test cases (regression + new-feature):
${JSON.stringify(
  cases.map((c) => ({
    title: c.title,
    scope: c.caseScope,
    endpoints: c.tags.filter((t: string) => t.startsWith("/")),
  })),
  null,
  2
)}`,
      },
    ],
  });
  return (response.content[0] as { text: string }).text;
}

/**
 * Generates a full spec file with separate describe blocks for:
 *   - Regression tests (existing behaviour)
 *   - New-feature tests (PR-specific new behaviour)
 * Within each block, further split by type: positive / negative / edge
 */
/** Extract the exact public async method names from a generated POM string */
function extractPomMethods(pomCode: string): string[] {
  const methods: string[] = [];
  const re = /^\s+async\s+(\w+)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pomCode)) !== null) {
    methods.push(m[1]);
  }
  return [...new Set(methods)];
}

async function generateSpec(
  module: string,
  regressionCases: TestCase[],
  newFeatureCases: TestCase[],
  pomCode: string
): Promise<string> {
  const pascal = toPascalCase(module);
  const pomMethods = extractPomMethods(pomCode);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    system: `You are a Playwright expert writing a complete test specification file.

Rules:
- Import: import { ${pascal}Page } from '../pages/${module}.page'
- Import: import { setup${pascal}Mocks } from '../fixtures/${module}.fixture'
- CRITICAL: ONLY call methods from this EXACT list — do NOT invent new method names:
  ${pomMethods.join(", ")}
- Organise into TWO top-level describe blocks:
    describe('${module} — Regression Suite', ...) for caseScope="regression"
    describe('${module} — New Feature', ...) for caseScope="new-feature"
- Within each describe block, group by type: positive / negative / edge
- Add traceability comment above each test: // TC-<id>  SCOPE:<caseScope>
- Call setup${pascal}Mocks(page) at the start of each test
- TypeScript strict mode — no 'any'
- Return ONLY the TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Generate the full Playwright spec for module "${module}".

AVAILABLE PAGE OBJECT METHODS (use ONLY these exact names):
${pomMethods.map((m) => `  - ${pascal}Page.${m}()`).join("\n")}

REGRESSION CASES (${regressionCases.length}):
${JSON.stringify(regressionCases, null, 2)}

NEW-FEATURE CASES (${newFeatureCases.length}):
${JSON.stringify(newFeatureCases, null, 2)}`,
      },
    ],
  });
  return (response.content[0] as { text: string }).text;
}

/**
 * Merges new-feature test cases into an existing spec.
 * Preserves all existing regression + previous new-feature tests.
 * Adds new tests into the new-feature describe block (or creates it).
 */
async function mergeNewFeatureCases(
  specPath: string,
  newCases: TestCase[],
  module: string
): Promise<void> {
  const existing = await fs.readFile(specPath, "utf-8");
  const pascal = toPascalCase(module);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    system: `You are a Playwright expert merging new test cases into an existing spec.

Rules:
- Preserve EVERY existing test() block exactly — do not modify or remove any
- Add new test() blocks for each new case into the '${module} — New Feature' describe block
  (create this describe block if it does not already exist)
- Add traceability comment above each new test: // TC-<id>  SCOPE:new-feature
- Call setup${pascal}Mocks(page) at start of each new test
- Maintain consistent style with existing code
- TypeScript strict mode — no 'any'
- Return ONLY the complete merged TypeScript file, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Existing spec file:
${existing}

New test cases to merge (new-feature scope):
${JSON.stringify(newCases, null, 2)}`,
      },
    ],
  });

  const merged = (response.content[0] as { text: string }).text;
  await writeChecked(specPath, merged, `${module}.spec merged`);
}

// ── File Writer ────────────────────────────────────────────────────────────

/** Strip markdown code fence wrappers that the LLM sometimes adds around TypeScript output */
function stripCodeFences(content: string): string {
  return content
    .replace(/^```(?:typescript|ts|javascript|js)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}

async function writeChecked(filePath: string, content: string, label: string): Promise<void> {
  const clean = stripCodeFences(content);
  const lines = clean.split("\n");
  if (lines.length > MAX_LINES_PER_FILE) {
    console.warn(
      `[AGT-04 GUARDRAIL] ${label}: ${lines.length} lines > ${MAX_LINES_PER_FILE} limit. Consider splitting.`
    );
  }
  await fs.writeFile(filePath, clean, "utf-8");
}

function validateTypeScript(filePath: string): void {
  try {
    execSync(`npx tsc --noEmit --strict --esModuleInterop ${filePath} 2>&1`, { stdio: "pipe" });
  } catch (e) {
    const out = (e as { stdout?: Buffer }).stdout?.toString() ?? "";
    console.warn(`[AGT-04 GUARDRAIL] TypeScript issues in ${filePath}:\n${out.slice(0, 500)}`);
    // Warn but don't throw — LLM-generated code may need minor fixes
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

/**
 * Groups test cases by their module field.
 * module is set from Scenario.module by AGT-03 — consistent, kebab-case.
 */
function groupByModule(cases: TestCase[]): Record<string, TestCase[]> {
  return cases.reduce<Record<string, TestCase[]>>((acc, tc) => {
    const mod = tc.module
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "");
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(tc);
    return acc;
  }, {});
}

function toPascalCase(str: string): string {
  return str.replace(/(^\w|-\w)/g, (s) => s.replace("-", "").toUpperCase());
}

async function ensureDirs(): Promise<void> {
  for (const dir of [POM_DIR, FIXTURE_DIR, SPEC_DIR]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
