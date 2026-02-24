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
const MAX_LINES_PER_FILE = 300;

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

  const moduleGroups = groupByModule(testCases);

  for (const [module, cases] of Object.entries(moduleGroups)) {
    console.log(`  [AGT-04] Processing module: ${module} (${cases.length} test cases)`);

    const specPath = path.join(SPEC_DIR, `${module}.spec.ts`);
    const pomPath = path.join(POM_DIR, `${module}.page.ts`);
    const fixturePath = path.join(FIXTURE_DIR, `${module}.fixture.ts`);

    if (!options.remediationMode) {
      // GUARDRAIL: never overwrite existing passing tests
      if ((await fileExists(specPath)) && (await hasPassingTests(specPath))) {
        console.log(`  [AGT-04] Merging into existing passing spec: ${specPath}`);
        await mergeSpec(specPath, cases);
        continue;
      }
    }

    const [pomCode, fixtureCode, specCode] = await Promise.all([
      generatePOM(module, cases),
      generateFixtures(module, cases, apiSpecs),
      generateSpec(module, cases),
    ]);

    await writeChecked(pomPath, pomCode, module);
    await writeChecked(fixturePath, fixtureCode, module);
    await writeChecked(specPath, specCode, module);
    validateTypeScript(specPath);
  }
}

// ── Code Generators ────────────────────────────────────────────────────────

async function generatePOM(module: string, cases: TestCase[]): Promise<string> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: `You are a Playwright TypeScript expert. Generate a Page Object Model class.
Rules:
- Class named ${toPascalCase(module)}Page
- ALL selectors defined as private readonly properties using data-testid
- Public async methods for each user action
- waitForSelector / waitForResponse used for async operations
- TypeScript strict mode — no 'any' types
- Return ONLY the TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Generate POM for module "${module}".\nTest cases:\n${JSON.stringify(
          cases.map((c) => ({ title: c.title, steps: c.steps.map((s) => s.action) })),
          null,
          2
        )}`,
      },
    ],
  });
  return (response.content[0] as { text: string }).text;
}

async function generateFixtures(
  module: string,
  cases: TestCase[],
  apiSpecs: Record<string, unknown>
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    system: `You are a Playwright expert generating fixture files.
Rules:
- Use page.route() to intercept ALL external HTTP calls
- Provide success (2xx) AND error (4xx, 5xx) mock responses for every endpoint
- No real network calls — every external URL must be handled
- Export named async functions: setup${toPascalCase(module)}Mocks(page)
- TypeScript strict mode — no 'any' types
- Return ONLY the TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Generate fixtures for module "${module}".\nAPI specs: ${JSON.stringify(apiSpecs).slice(0, 3000)}\nTest cases: ${JSON.stringify(cases.map((c) => c.title))}`,
      },
    ],
  });
  return (response.content[0] as { text: string }).text;
}

async function generateSpec(module: string, cases: TestCase[]): Promise<string> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    system: `You are a Playwright expert writing test specifications.
Rules:
- Import: import { ${toPascalCase(module)}Page } from '../pages/${module}.page'
- Import: import { setup${toPascalCase(module)}Mocks } from '../fixtures/${module}.fixture'
- Each TestCase maps to one test() block
- Add traceability comment above each test: // TC-<id>
- Call setup${toPascalCase(module)}Mocks(page) at the start of each test
- TypeScript strict mode — no 'any' types
- Split into separate describe blocks by test type (positive/negative/edge)
- Return ONLY the TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Generate Playwright spec for module "${module}":\n${JSON.stringify(cases, null, 2)}`,
      },
    ],
  });
  return (response.content[0] as { text: string }).text;
}

async function mergeSpec(specPath: string, newCases: TestCase[]): Promise<void> {
  const existing = await fs.readFile(specPath, "utf-8");
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8096,
    system: `You are a Playwright expert. Merge new test cases into an existing spec file.
Rules:
- Preserve ALL existing tests — do not remove or modify them
- Add new test() blocks for each new case with // TC-<id> comments
- Keep consistent style with existing code
- Return ONLY the merged TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Existing spec:\n${existing}\n\nNew test cases to add:\n${JSON.stringify(newCases, null, 2)}`,
      },
    ],
  });
  const merged = (response.content[0] as { text: string }).text;
  await writeChecked(specPath, merged, "merged");
}

// ── File Writer with Guardrails ────────────────────────────────────────────

async function writeChecked(filePath: string, content: string, label: string): Promise<void> {
  const lines = content.split("\n");
  if (lines.length > MAX_LINES_PER_FILE) {
    console.warn(
      `[AGT-04 GUARDRAIL] ${label}: ${lines.length} lines > ${MAX_LINES_PER_FILE} limit. Consider splitting.`
    );
  }
  await fs.writeFile(filePath, content, "utf-8");
}

function validateTypeScript(filePath: string): void {
  try {
    execSync(`npx tsc --noEmit --strict --esModuleInterop ${filePath} 2>&1`, { stdio: "pipe" });
  } catch (e) {
    const out = (e as { stdout?: Buffer }).stdout?.toString() ?? "";
    console.warn(`[AGT-04 GUARDRAIL] TypeScript issues in ${filePath}:\n${out.slice(0, 500)}`);
    // Warn but don't throw — LLM-generated code may need minor manual fixes
  }
}

async function hasPassingTests(specPath: string): Promise<boolean> {
  try {
    execSync(`npx playwright test ${specPath} --reporter=dot 2>&1`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function groupByModule(cases: TestCase[]): Record<string, TestCase[]> {
  return cases.reduce<Record<string, TestCase[]>>((acc, tc) => {
    const mod = (tc.tags[0] ?? "general").toLowerCase().replace(/\s+/g, "-");
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
