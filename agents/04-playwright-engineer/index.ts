/**
 * AGT-04 — Playwright Engineer  (v3)
 *
 * Receives TestCase[] from AGT-03, each tagged with:
 *   caseScope = "regression" | "new-feature"
 *   testType  = "ui" | "api"
 *
 * Per module, two independent pipelines run:
 *
 *   UI pipeline  (testType = "ui")
 *     1. Page Object Model  → playwright-tests/pages/{module}.page.ts
 *        - Private readonly selector constants (data-testid)
 *        - Public async methods representing user intents
 *        - All waits inside POM methods — no raw Playwright in specs
 *     2. Fixtures             → playwright-tests/fixtures/{module}.fixture.ts
 *        - page.route() mocks with correct pagination format
 *     3. UI Spec              → playwright-tests/specs/{module}.spec.ts
 *        - Imports POM + fixtures; ONLY calls POM methods
 *
 *   API pipeline (testType = "api")
 *     1. Fixtures             → playwright-tests/fixtures/{module}.fixture.ts  (shared)
 *     2. API Spec             → playwright-tests/specs/{module}.api.spec.ts
 *        - No POM; uses page.evaluate(fetch) for every request
 *        - Asserts status codes and response JSON fields directly
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
const MAX_LINES_PER_FILE = 800;
const MAX_CASES_PER_SPEC = parseInt(process.env.MAX_CASES_PER_SPEC ?? "20", 10);

export interface PlaywrightEngineerOptions {
  remediationMode?: boolean;
}

// ── Data-testid reference (authoritative — shared across all prompts) ────────

const DATA_TESTID_REFERENCE = `
AUTHORITATIVE data-testid REFERENCE — use ONLY these exact attribute values:

PAGE / TABLE:
  [data-testid="add-employee-btn"]        — Add employee button
  [data-testid="search-input"]            — search text box
  [data-testid="department-filter"]       — department <select>
  [data-testid="status-filter"]           — status <select>
  [data-testid="clear-filters-btn"]       — Clear filters button
  [data-testid="error-banner"]            — list-level error message
  [data-testid="success-toast"]           — success toast notification
  [data-testid="employee-table"]          — <table> element
  [data-testid="loading-row"]             — loading spinner row
  [data-testid="empty-state"]             — "No employees found" container
  [data-testid="employee-row-{_id}"]      — individual row (replace {_id} with actual value)
  [data-testid="employee-name"]           — name cell inside a row
  [data-testid="employee-email"]          — email cell inside a row
  [data-testid="employee-department"]     — department badge inside a row
  [data-testid="pagination"]              — pagination container
  [data-testid="pagination-summary"]      — "X–Y of Z employees" text
  [data-testid="prev-page-btn"]           — Previous page button
  [data-testid="next-page-btn"]           — Next page button
  [data-testid="pagination-current"]      — "X / Y" page indicator

DRAWER:
  [data-testid="employee-drawer"]         — slide-in drawer panel
  [data-testid="drawer-overlay"]          — backdrop (click closes drawer)
  [data-testid="close-drawer-btn"]        — X close button in drawer header
  [data-testid="drawer-error"]            — error message inside drawer

FORM (inside drawer):
  [data-testid="firstName-input"]
  [data-testid="lastName-input"]
  [data-testid="email-input"]
  [data-testid="phone-input"]
  [data-testid="designation-input"]
  [data-testid="department-select"]       — <select> for department
  [data-testid="employmentType-select"]   — <select> for employment type
  [data-testid="employmentStatus-select"] — <select> for employment status
  [data-testid="startDate-input"]
  [data-testid="street-input"]
  [data-testid="city-input"]
  [data-testid="state-input"]
  [data-testid="postalCode-input"]
  [data-testid="country-input"]
  [data-testid="firstName-error"]
  [data-testid="lastName-error"]
  [data-testid="email-error"]
  [data-testid="designation-error"]
  [data-testid="department-error"]
  [data-testid="employmentType-error"]
  [data-testid="employmentStatus-error"]
  [data-testid="startDate-error"]
  [data-testid="address-street-error"]
  [data-testid="address-city-error"]
  [data-testid="address-country-error"]
  [data-testid="delete-btn"]              — Delete (edit mode only)
  [data-testid="cancel-btn"]              — Cancel / close form
  [data-testid="submit-btn"]              — Save / Add Employee submit

CONFIRM DIALOG:
  [data-testid="confirm-dialog"]
  [data-testid="modal-overlay"]
  [data-testid="confirm-cancel-btn"]
  [data-testid="confirm-delete-btn"]
`.trim();

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runPlaywrightEngineer(
  testCases: TestCase[],
  apiSpecs: Record<string, unknown>,
  options: PlaywrightEngineerOptions = {}
): Promise<void> {
  await ensureDirs();

  const moduleGroups = groupByModule(testCases);

  for (const [module, cases] of Object.entries(moduleGroups)) {
    const uiCases = cases.filter((c) => c.testType === "ui");
    const apiCases = cases.filter((c) => c.testType === "api");

    console.log(
      `  [AGT-04] Module: ${module} | ` +
        `${uiCases.length} UI cases | ${apiCases.length} API cases`
    );

    if (uiCases.length > 0) {
      await processUIModule(module, uiCases, apiSpecs, options);
    }

    if (apiCases.length > 0) {
      await processAPIModule(module, apiCases, apiSpecs, options);
    }
  }
}

// ── UI Pipeline ─────────────────────────────────────────────────────────────

async function processUIModule(
  module: string,
  uiCases: TestCase[],
  apiSpecs: Record<string, unknown>,
  options: PlaywrightEngineerOptions
): Promise<void> {
  const specPath = path.join(SPEC_DIR, `${module}.spec.ts`);
  const pomPath = path.join(POM_DIR, `${module}.page.ts`);
  const fixturePath = path.join(FIXTURE_DIR, `${module}.fixture.ts`);

  const regressionCases = uiCases.filter((c) => c.caseScope === "regression");
  const newFeatureCases = uiCases.filter((c) => c.caseScope === "new-feature");
  const specExists = await fileExists(specPath);

  if (specExists && !options.remediationMode) {
    if (newFeatureCases.length > 0) {
      console.log(`  [AGT-04] [ui] Merging ${newFeatureCases.length} new-feature cases → ${specPath}`);
      await mergeUISpec(specPath, newFeatureCases, module);

      if (await fileExists(pomPath)) {
        console.log(`  [AGT-04] [ui] Extending POM for new actions in ${module}`);
        await extendPOM(pomPath, newFeatureCases, module);
      }
    } else {
      console.log(`  [AGT-04] [ui] No new-feature cases for ${module} — spec unchanged`);
    }
  } else if (specExists && options.remediationMode) {
    console.log(`  [AGT-04] [ui] Remediation: merging ${uiCases.length} gap cases → ${specPath}`);
    await mergeUISpec(specPath, uiCases, module);
  } else {
    const allCases = [...regressionCases, ...newFeatureCases].slice(0, MAX_CASES_PER_SPEC);
    if (allCases.length === 0) return;

    console.log(`  [AGT-04] [ui] Generating full UI suite for ${module} (${allCases.length} cases)`);

    // POM generated first — spec receives method list to prevent name invention
    const [pomCode, fixtureCode] = await Promise.all([
      generatePOM(module, allCases),
      generateFixtures(module, allCases, apiSpecs),
    ]);

    const cappedRegression = regressionCases.slice(0, Math.ceil(MAX_CASES_PER_SPEC * 0.7));
    const cappedNewFeature = newFeatureCases.slice(0, Math.floor(MAX_CASES_PER_SPEC * 0.3));
    const specCode = await generateUISpec(module, cappedRegression, cappedNewFeature, pomCode);

    await writeChecked(pomPath, pomCode, `${module}.page`);
    await writeChecked(fixturePath, fixtureCode, `${module}.fixture`);
    await writeChecked(specPath, specCode, `${module}.spec`);
    validateTypeScript(specPath);
  }
}

// ── API Pipeline ────────────────────────────────────────────────────────────

async function processAPIModule(
  module: string,
  apiCases: TestCase[],
  apiSpecs: Record<string, unknown>,
  options: PlaywrightEngineerOptions
): Promise<void> {
  const apiSpecPath = path.join(SPEC_DIR, `${module}.api.spec.ts`);
  const fixturePath = path.join(FIXTURE_DIR, `${module}.fixture.ts`);

  const regressionCases = apiCases.filter((c) => c.caseScope === "regression");
  const newFeatureCases = apiCases.filter((c) => c.caseScope === "new-feature");
  const apiSpecExists = await fileExists(apiSpecPath);

  // Fixture is shared — generate only if UI pipeline hasn't done it yet
  if (!(await fileExists(fixturePath))) {
    console.log(`  [AGT-04] [api] Generating shared fixture for ${module}`);
    const fixtureCode = await generateFixtures(module, apiCases, apiSpecs);
    await writeChecked(fixturePath, fixtureCode, `${module}.fixture`);
  }

  if (apiSpecExists && !options.remediationMode) {
    if (newFeatureCases.length > 0) {
      console.log(`  [AGT-04] [api] Merging ${newFeatureCases.length} new-feature cases → ${apiSpecPath}`);
      await mergeAPISpec(apiSpecPath, newFeatureCases, module);
    } else {
      console.log(`  [AGT-04] [api] No new-feature cases for ${module} — API spec unchanged`);
    }
  } else if (apiSpecExists && options.remediationMode) {
    // Batch into chunks of 15 to stay within max_tokens for each append call
    const REMEDIATION_BATCH = 15;
    for (let i = 0; i < apiCases.length; i += REMEDIATION_BATCH) {
      const batch = apiCases.slice(i, i + REMEDIATION_BATCH);
      console.log(`  [AGT-04] [api] Remediation: appending ${batch.length} gap cases (batch ${Math.floor(i/REMEDIATION_BATCH)+1}) → ${apiSpecPath}`);
      await mergeAPISpec(apiSpecPath, batch, module);
    }
  } else {
    const maxReg = Math.ceil(MAX_CASES_PER_SPEC * 0.7);
    const maxNew = Math.floor(MAX_CASES_PER_SPEC * 0.3);
    const cappedRegression = regressionCases.slice(0, maxReg);
    const cappedNewFeature = newFeatureCases.slice(0, maxNew);
    const allCases = [...cappedRegression, ...cappedNewFeature];
    if (allCases.length === 0) return;

    console.log(`  [AGT-04] [api] Generating API spec for ${module} (${allCases.length} cases)`);
    const specCode = await generateAPISpec(module, cappedRegression, cappedNewFeature);
    await writeChecked(apiSpecPath, specCode, `${module}.api.spec`);
    validateTypeScript(apiSpecPath);
  }
}

// ── POM Generator ───────────────────────────────────────────────────────────

async function generatePOM(module: string, cases: TestCase[]): Promise<string> {
  const pascal = toPascalCase(module);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright TypeScript expert writing a Page Object Model class.

STRICT PAGE OBJECT MODEL RULES — follow every rule exactly:

1. CLASS STRUCTURE
   - Class name: ${pascal}Page
   - Constructor takes a single Page parameter: constructor(page: Page)
   - All selector strings are private readonly class fields (not inside methods)
   - No public properties — only public methods

2. SELECTORS
   - All selectors use data-testid: '[data-testid="exact-value"]'
   - Declare every selector as: private readonly mySelector = '[data-testid="..."]';
   - Only use selectors from the authoritative list below

3. METHODS
   - All methods are public async and return typed Promises
   - Method names express USER INTENT, e.g.:
       navigateToEmployeeList()   NOT  clickMenuLink()
       openAddEmployeeDrawer()    NOT  clickAddButton()
       fillFirstName(value)       NOT  typeInFirstNameField(value)
       submitEmployeeForm()       NOT  clickSubmitButton()
       getEmployeeRowCount()      NOT  countTableRows()
   - Every method includes its own waitForSelector/waitForLoadState before acting
   - Action methods (click, fill, select) use: this.page.waitForSelector(this.mySelector, { state: 'visible' })
     then this.page.click(this.mySelector) / this.page.fill(this.mySelector, value) / this.page.selectOption(this.mySelector, value)
   - Query methods (isXVisible, getXText, getXCount) use locators and return boolean/string/number
   - NO test assertions (expect) inside POM — assertions belong in the spec only

4. API CALLS FROM POM
   - If any test action needs a direct API call, use page.evaluate() with fetch():
     const result = await this.page.evaluate(async ({ url, method, body }) => {
       const res = await fetch(url, {
         method,
         headers: { 'Content-Type': 'application/json' },
         body: body ? JSON.stringify(body) : undefined,
       });
       const data = await res.json().catch(() => null);
       return { status: res.status, body: data };
     }, { url: '/api/employees', method: 'POST', body: payload });
   - NEVER use this.page.request.get/post/put/delete() — it bypasses page.route() mocks

5. NAVIGATION
   - Navigate only to '/' unless a specific route is in the test step description
   - After goto('/'), wait for the main page element to appear before returning

6. OUTPUT
   - Return ONLY the TypeScript class — no markdown fences, no imports other than Page from @playwright/test
   - TypeScript strict mode — no 'any' types
   - Start with: import { Page } from '@playwright/test';

${DATA_TESTID_REFERENCE}`,
    messages: [
      {
        role: "user",
        content: `Generate the ${pascal}Page class for module "${module}".

Test cases that this POM must support:
${JSON.stringify(
  cases.map((c) => ({
    title: c.title,
    type: c.type,
    steps: c.steps.map((s) => ({ action: s.action, expectedResult: s.expectedResult })),
  })),
  null,
  2
)}

Create public methods for every distinct user action and state query needed across these test cases.
Each method should be self-contained with its own waits.`,
      },
    ],
  });

  return (response.content[0] as { text: string }).text;
}

// ── Fixture Generator ───────────────────────────────────────────────────────

async function generateFixtures(
  module: string,
  cases: TestCase[],
  apiSpecs: Record<string, unknown>
): Promise<string> {
  const pascal = toPascalCase(module);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright expert generating route mock fixtures.

RULES — follow every rule exactly:

1. ROUTE INTERCEPTION
   - Use page.route() for ALL external HTTP calls
   - URL patterns MUST include trailing wildcard for paginated/filterable endpoints:
       CORRECT:   '**/api/employees**'
       INCORRECT: '**/api/employees'
     The trailing ** is required so ?page=1&limit=20 variants are intercepted
   - Always check route.request().method() to distinguish GET/POST/PATCH/DELETE on the same pattern

2. LIST RESPONSE FORMAT — EXACTLY this shape (never omit pagination):
   {
     data: Employee[],
     pagination: { total: number, page: number, limit: number, pages: number }
   }
   Never use flat fields like 'total', 'pageSize', 'totalPages' at the top level.

3. MOCK DATA
   - Provide at least 3 realistic employee objects in mock data
   - Include "Thava Ganesh" (Engineering / Tech Lead) as one employee for search tests
   - Employee fields: _id, firstName, lastName, email, designation, department,
     employmentType, employmentStatus ('Active'|'On Leave'|'Terminated')

4. ERROR RESPONSES
   - Provide success (2xx) AND error (4xx/5xx) mock responses for every endpoint
   - Pattern: check a query param or request body field to decide which mock to return

5. EXPORT
   - Export one named async function: setup${pascal}Mocks(page: Page): Promise<void>
   - TypeScript strict mode — no 'any'
   - Return ONLY TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Generate fixtures for module "${module}".

Endpoints needed by the test cases:
${JSON.stringify(
  [...new Set(cases.flatMap((c) => c.tags.filter((t: string) => t.startsWith("/"))))],
  null,
  2
)}

API Specs (for reference): ${JSON.stringify(apiSpecs).slice(0, 2000)}

Test cases summary:
${JSON.stringify(
  cases.map((c) => ({ title: c.title, scope: c.caseScope, type: c.type })),
  null,
  2
)}`,
      },
    ],
  });

  return (response.content[0] as { text: string }).text;
}

// ── UI Spec Generator ───────────────────────────────────────────────────────

function extractPomMethods(pomCode: string): string[] {
  const methods: string[] = [];
  // Match both `async methodName(` and `public async methodName(` patterns
  const re = /^\s+(?:public\s+)?async\s+(\w+)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pomCode)) !== null) {
    methods.push(m[1]);
  }
  return [...new Set(methods)];
}

async function generateUISpec(
  module: string,
  regressionCases: TestCase[],
  newFeatureCases: TestCase[],
  pomCode: string
): Promise<string> {
  const pascal = toPascalCase(module);
  const pomMethods = extractPomMethods(pomCode);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright TypeScript expert writing UI test specifications.

RULES — follow every rule exactly:

1. IMPORTS (use exactly these, no others):
   import { test, expect } from '@playwright/test';
   import { ${pascal}Page } from '../pages/${module}.page';
   import { setup${pascal}Mocks } from '../fixtures/${module}.fixture';

2. TEST STRUCTURE
   - Two top-level describe blocks:
       test.describe('${module} — UI Regression Suite', () => { ... })
       test.describe('${module} — UI New Feature', () => { ... })
   - Within each, group by test type:
       test.describe('positive', () => { ... })
       test.describe('negative', () => { ... })
       test.describe('edge', () => { ... })
   - Always use test.describe() NOT describe() — Playwright doesn't expose describe as a global

3. EVERY TEST MUST:
   a. Start with: await setup${pascal}Mocks(page);
   b. Create a POM instance: const po = new ${pascal}Page(page);
   c. Call POM methods only — NEVER call page.click/fill/goto/locator directly in a test
   d. End with clear expect() assertions using POM query methods
   e. Have a traceability comment above it: // TC-<id>  SCOPE:<caseScope>

4. ALLOWED POM METHODS — call ONLY these exact method names (no others):
${pomMethods.map((m) => `   po.${m}()`).join("\n")}

5. ASSERTIONS
   - Use expect(value).toBe() / toContain() / toBeGreaterThan() / toBeGreaterThanOrEqual()
   - Use await with every async POM method call
   - Never assert against raw page.locator() — use POM query methods

6. TEST DATA
   - Use realistic values: firstName='John', lastName='Doe', email='john.doe@test.com'
   - For select options, use exact values from fixtures: 'Engineering', 'Full-Time', 'Active'
   - Never use empty strings as test input values

7. NAVIGATION
   - Never navigate to invented routes — the app only has '/' as its frontend URL
   - POM navigation methods handle page.goto() internally

8. OUTPUT
   - Return ONLY the TypeScript file contents — no markdown fences, no comments outside tests
   - TypeScript strict mode — no 'any'`,
    messages: [
      {
        role: "user",
        content: `Generate the complete UI spec for module "${module}".

AVAILABLE POM METHODS (use ONLY these — do not invent new names):
${pomMethods.map((m) => `  po.${m}()`).join("\n")}

REGRESSION CASES (${regressionCases.length}):
${JSON.stringify(regressionCases, null, 2)}

NEW-FEATURE CASES (${newFeatureCases.length}):
${JSON.stringify(newFeatureCases, null, 2)}

Write tests that clearly follow each test case's steps and assert the expected outcomes.
Every test MUST call setup${pascal}Mocks(page) first and use POM methods only.`,
      },
    ],
  });

  return (response.content[0] as { text: string }).text;
}

// ── API Spec Generator ──────────────────────────────────────────────────────

async function generateAPISpec(
  module: string,
  regressionCases: TestCase[],
  newFeatureCases: TestCase[]
): Promise<string> {
  const pascal = toPascalCase(module);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright TypeScript expert writing concise API test specifications.

API tests use a shared \`apiCall\` helper that wraps page.evaluate(fetch(...)).
This ensures the page.route() mocks defined in fixtures intercept all calls correctly.

RULES — follow every rule exactly:

1. FILE STRUCTURE — start with this exact header (copy verbatim, fill in the import):
   import { test, expect } from '@playwright/test';
   import type { Page } from '@playwright/test';
   import { setup${pascal}Mocks } from '../fixtures/${module}.fixture';

   type ApiResponse = { status: number; body: Record<string, unknown> };

   async function apiCall(
     page: Page,
     url: string,
     method: string,
     body?: Record<string, unknown> | null
   ): Promise<ApiResponse> {
     return page.evaluate(async (p) => {
       const res = await fetch(p.url, {
         method: p.method,
         headers: { 'Content-Type': 'application/json' },
         body: p.body != null ? JSON.stringify(p.body) : undefined,
       });
       const responseBody = await res.json().catch(() => null) as Record<string, unknown>;
       return { status: res.status, body: responseBody };
     }, { url, method, body: body ?? null } as { url: string; method: string; body: Record<string, unknown> | null });
   }

2. TEST STRUCTURE
   - Two top-level describe blocks:
       test.describe('${module} — API Regression Suite', () => { ... })
       test.describe('${module} — API New Feature', () => { ... })
   - Within each, group by test type:
       test.describe('positive', () => { ... })
       test.describe('negative', () => { ... })
       test.describe('edge', () => { ... })
   - Always use test.describe() NOT describe()

3. EVERY TEST MUST:
   a. Start with: await setup${pascal}Mocks(page);
   b. Then: await page.goto('/');   ← activates route mocks in the browser context
   c. Make API calls using apiCall() — NEVER inline the page.evaluate boilerplate
   d. Assert response.status AND specific response.body fields
   e. Have a traceability comment above it: // TC-<id>  SCOPE:<caseScope>

4. USING apiCall — examples:
   // GET request
   const r = await apiCall(page, '/api/employees', 'GET');
   // GET with query params
   const r = await apiCall(page, '/api/employees?page=2&limit=10', 'GET');
   // POST with body
   const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'John', ... });
   // PATCH
   const r = await apiCall(page, '/api/employees/123', 'PATCH', { department: 'HR' });
   // DELETE
   const r = await apiCall(page, '/api/employees/123', 'DELETE');

5. CONCISENESS — keep each test body short (≤15 lines):
   // TC-abc  SCOPE:regression
   test('...', async ({ page }) => {
     await setup${pascal}Mocks(page);
     await page.goto('/');
     const r = await apiCall(page, '/api/employees', 'GET');
     expect(r.status).toBe(200);
     expect(r.body.data).toBeDefined();
     expect(r.body.pagination).toBeDefined();
   });

6. ASSERTIONS
   - Always assert: expect(r.status).toBe(expectedStatusCode);
   - For list responses: assert r.body.data and r.body.pagination fields
   - For errors: expect(r.body.message || r.body.error).toBeTruthy();
   - Never toEqual on the whole body — check individual fields

7. TEST DATA
   - Valid employee: { firstName, lastName, email, designation, department, employmentType, employmentStatus }
   - Use 'Engineering', 'Full-Time', 'Active' as valid enum values
   - For negative tests, deliberately omit required fields or use wrong types

8. OUTPUT
   - Return ONLY the TypeScript file contents — no markdown fences, no prose
   - TypeScript strict mode — no 'any' — use Record<string, unknown> for untyped objects`,
    messages: [
      {
        role: "user",
        content: `Generate the complete API spec for module "${module}".
Cover EVERY test case below — include ALL ${regressionCases.length + newFeatureCases.length} cases.

REGRESSION CASES (${regressionCases.length}):
${JSON.stringify(regressionCases, null, 2)}

NEW-FEATURE CASES (${newFeatureCases.length}):
${JSON.stringify(newFeatureCases, null, 2)}

Use the apiCall() helper for every request. Keep each test ≤15 lines.
Every test must have: setup${pascal}Mocks(page) → page.goto('/') → apiCall() → assertions.`,
      },
    ],
  });

  return (response.content[0] as { text: string }).text;
}

// ── POM Extender ────────────────────────────────────────────────────────────

async function extendPOM(pomPath: string, newCases: TestCase[], module: string): Promise<void> {
  const existing = await fs.readFile(pomPath, "utf-8");
  const pascal = toPascalCase(module);

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright TypeScript expert extending a Page Object Model.

RULES:
- Preserve ALL existing selectors and methods exactly — do not modify or remove any
- Add new private readonly selector fields for any new data-testid elements
- Add new public async methods ONLY for actions not already covered by existing methods
- New methods must follow the same pattern: waitForSelector then action/query
- For new API calls in POM, use page.evaluate(fetch) — NEVER page.request.*
- TypeScript strict mode — no 'any'
- Return ONLY the complete updated TypeScript class, no markdown fences

${DATA_TESTID_REFERENCE}`,
    messages: [
      {
        role: "user",
        content: `Existing ${pascal}Page POM:
${existing}

New UI test cases requiring additional POM methods:
${JSON.stringify(
  newCases.map((c) => ({
    title: c.title,
    steps: c.steps.map((s) => ({ action: s.action, expectedResult: s.expectedResult })),
  })),
  null,
  2
)}

Add only the new selector fields and methods needed. Preserve everything else.`,
      },
    ],
  });

  await writeChecked(
    pomPath,
    (response.content[0] as { text: string }).text,
    `${module}.page extended`
  );
}

// ── UI Spec Merger ──────────────────────────────────────────────────────────

async function mergeUISpec(
  specPath: string,
  newCases: TestCase[],
  module: string
): Promise<void> {
  const existing = await fs.readFile(specPath, "utf-8");

  // Deduplicate by TC-UUID, exact title, and normalised title (catches LLM title drift)
  const existingIds = extractExistingTestIds(existing);
  const existingTitles = extractExistingTestTitles(existing);
  const existingNormTitles = new Set([...existingTitles].map(normalizeTitle));
  const dedupedCases = newCases.filter(
    (c) =>
      !existingIds.has(c.id.toLowerCase()) &&
      !existingTitles.has(c.title) &&
      !existingNormTitles.has(normalizeTitle(c.title))
  );
  if (dedupedCases.length === 0) {
    console.log(`  [AGT-04] [ui] All ${newCases.length} cases already in spec — skipping append`);
    return;
  }
  if (dedupedCases.length < newCases.length) {
    console.log(
      `  [AGT-04] [ui] Deduped: ${newCases.length - dedupedCases.length} cases already present, appending ${dedupedCases.length}`
    );
  }

  const pascal = toPascalCase(module);
  const pomPath = path.join(POM_DIR, `${module}.page.ts`);

  let pomMethods: string[] = [];
  try {
    const pomCode = await fs.readFile(pomPath, "utf-8");
    pomMethods = extractPomMethods(pomCode);
  } catch { /* POM may not exist yet */ }

  // IMPORTANT: Never ask the LLM to reproduce the existing file — it will be truncated
  // at max_tokens. Generate ONLY the new test block and append it.
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright expert generating additional UI tests to append to an existing spec.

OUTPUT: Return ONLY a single test.describe() block containing the new tests.
Do NOT reproduce the existing file content — do NOT include imports or the POM class definition.
The file already has: import { test, expect }, import { ${pascal}Page }, import { setup${pascal}Mocks }.

FORMAT — return exactly this structure:
test.describe('${module} — UI Gap Cases', () => {
  test.describe('positive', () => { /* tests go here */ });
  test.describe('negative', () => { /* tests go here */ });
  test.describe('edge', () => { /* tests go here */ });
});

RULES for each test():
- Traceability comment above the test: // TC-<id>  SCOPE:<caseScope>
- First line: await setup${pascal}Mocks(page);
- Second line: const po = new ${pascal}Page(page);
- Use ONLY these POM methods (do not invent names):
  ${pomMethods.length > 0 ? pomMethods.map((m) => `po.${m}()`).join(", ") : "methods already in the spec file"}
- Navigate only to '/' — the app has no other frontend routes
- TypeScript strict mode — no 'any'
- No markdown fences — raw TypeScript only`,
    messages: [
      {
        role: "user",
        content: `Generate test functions for these gap cases (${dedupedCases.length} cases):
${JSON.stringify(dedupedCases, null, 2)}`,
      },
    ],
  });

  let newBlock = extractTypeScriptCode((response.content[0] as { text: string }).text);

  // Strip any import statements the LLM may have included despite being told not to
  newBlock = newBlock.replace(/^import\s+[^\n]*\n?/gm, "").trim();

  // Guard: if the appended block has unbalanced braces, truncate to last complete inner describe
  if (braceDepth(newBlock) !== 0) {
    const truncated = truncateToBalanced(newBlock, 0);
    console.warn(
      `[AGT-04 GUARDRAIL] ${module}.spec UI merge block had unbalanced braces — truncated.`
    );
    newBlock = truncated;
  }

  const merged = existing.trimEnd() + "\n\n" + newBlock.trim() + "\n";
  await fs.writeFile(specPath, merged, "utf-8");
  console.log(`  [AGT-04] [ui] Appended ${dedupedCases.length} gap tests → ${specPath}`);
}

// ── API Spec Merger ─────────────────────────────────────────────────────────

async function mergeAPISpec(
  specPath: string,
  newCases: TestCase[],
  module: string
): Promise<void> {
  const existing = await fs.readFile(specPath, "utf-8");

  // Deduplicate by TC-UUID, exact title, and normalised title (catches LLM title drift)
  const existingIds = extractExistingTestIds(existing);
  const existingTitles = extractExistingTestTitles(existing);
  const existingNormTitles = new Set([...existingTitles].map(normalizeTitle));
  const dedupedCases = newCases.filter(
    (c) =>
      !existingIds.has(c.id.toLowerCase()) &&
      !existingTitles.has(c.title) &&
      !existingNormTitles.has(normalizeTitle(c.title))
  );
  if (dedupedCases.length === 0) {
    console.log(`  [AGT-04] [api] All ${newCases.length} cases already in spec — skipping append`);
    return;
  }
  if (dedupedCases.length < newCases.length) {
    console.log(
      `  [AGT-04] [api] Deduped: ${newCases.length - dedupedCases.length} cases already present, appending ${dedupedCases.length}`
    );
  }

  const pascal = toPascalCase(module);

  // IMPORTANT: Never ask the LLM to reproduce the existing file — it will be truncated
  // at max_tokens. Instead, generate ONLY the new test block and append it.
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    system: `You are a Playwright expert generating additional API tests to append to an existing spec.

OUTPUT: Return ONLY a single test.describe() block containing the new tests.
Do NOT reproduce the existing file content — do NOT include imports or the apiCall() helper.
The file already has: import { test, expect }, import { setup${pascal}Mocks }, and the apiCall() helper.

FORMAT — return exactly this structure:
test.describe('${module} — API Gap Cases', () => {
  test.describe('positive', () => { /* tests go here */ });
  test.describe('negative', () => { /* tests go here */ });
  test.describe('edge', () => { /* tests go here */ });
});

RULES for each test():
- Traceability comment above the test: // TC-<id>  SCOPE:<caseScope>
- First line: await setup${pascal}Mocks(page);
- Second line: await page.goto('/');
- Use apiCall(page, url, method, body?) for every request
- Assert response.status then specific body fields
- Keep each test body ≤15 lines
- TypeScript strict mode — no 'any' — use Record<string, unknown>
- No markdown fences — raw TypeScript only`,
    messages: [
      {
        role: "user",
        content: `Generate test functions for these gap cases (${dedupedCases.length} cases):
${JSON.stringify(dedupedCases, null, 2)}`,
      },
    ],
  });

  let newBlock = extractTypeScriptCode((response.content[0] as { text: string }).text);

  // Strip any import statements the LLM may have included despite being told not to
  newBlock = newBlock.replace(/^import\s+[^\n]*\n?/gm, "").trim();

  // Guard: if the appended block has unbalanced braces, truncate to last complete inner describe
  if (braceDepth(newBlock) !== 0) {
    const truncated = truncateToBalanced(newBlock, 0);
    console.warn(
      `[AGT-04 GUARDRAIL] ${module}.api.spec API merge block had unbalanced braces — truncated.`
    );
    newBlock = truncated;
  }

  // Ensure existing file ends cleanly, then append the new describe block
  const merged = existing.trimEnd() + "\n\n" + newBlock.trim() + "\n";
  await fs.writeFile(specPath, merged, "utf-8");
  console.log(`  [AGT-04] [api] Appended ${dedupedCases.length} gap tests → ${specPath}`);
}

// ── Code Integrity Helpers ───────────────────────────────────────────────────

/** Returns all TC-UUIDs already referenced in a spec file (from traceability comments). */
function extractExistingTestIds(content: string): Set<string> {
  const ids = new Set<string>();
  const re = /\/\/\s*TC-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    ids.add(m[1].toLowerCase());
  }
  return ids;
}

/** Returns all test() titles already declared in a spec file. */
function extractExistingTestTitles(content: string): Set<string> {
  const titles = new Set<string>();
  const re = /test\s*\(\s*['"`](.*?)['"`]\s*,\s*async/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    titles.add(m[1].trim());
  }
  return titles;
}

/**
 * Normalises a test title for fuzzy deduplication: lowercase, strip non-alphanumeric,
 * collapse spaces. Matches the same normalisation used by AGT-05's fallback matcher,
 * so title drift between LLM runs (e.g. "special characters" vs "special chars") is caught.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Checks whether a TypeScript snippet has balanced braces.
 * Ignores braces inside string literals (single, double, or template).
 * Returns the final brace depth (0 = balanced).
 */
function braceDepth(code: string): number {
  let depth = 0;
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i++;
      while (i < code.length) {
        if (code[i] === "\\") { i += 2; continue; }
        if (code[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return depth;
}

/**
 * Truncates code to the last position where brace depth returns to `targetDepth`.
 * Use targetDepth=0 for complete files, targetDepth=1 for append blocks
 * (where the outer test.describe is depth 1).
 * Returns the original string if already balanced at targetDepth.
 */
function truncateToBalanced(code: string, targetDepth = 0): string {
  let depth = 0;
  let lastPos = -1;
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i++;
      while (i < code.length) {
        if (code[i] === "\\" ) { i += 2; continue; }
        if (code[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === targetDepth) {
        // Don't record this as a truncation point if it's part of an import
        // destructuring (`import { X } from '...'`). Cutting here would drop
        // the `from 'path'` clause, producing a broken import statement.
        let j = i + 1;
        while (j < code.length && (code[j] === " " || code[j] === "\t")) j++;
        const ahead = code.slice(j, j + 5);
        const isImportDestructuring =
          ahead.startsWith("from") && /[\s'"`]/.test(code[j + 4] ?? " ");
        if (!isImportDestructuring) {
          lastPos = i + 1;
        }
      }
    }
    i++;
  }
  if (depth === targetDepth) return code; // already balanced
  if (lastPos === -1) return code;        // no balanced position found — return as-is
  return code.slice(0, lastPos).trimEnd() + "\n";
}

// ── File Writer ─────────────────────────────────────────────────────────────

function extractTypeScriptCode(content: string): string {
  let code = content;

  // Step 1: If a code fence block is present, extract just the fenced content
  const fenceMatch = code.match(/```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)\n?```/);
  if (fenceMatch) {
    code = fenceMatch[1];
  }

  // Step 2: Strip any leading prose before the first TypeScript statement.
  // This handles the case where the LLM returns reasoning text before the code.
  const tsStart = /^(import |export |\/\*\*|\/\/|const |interface |type |class |async |function )/m;
  const match = code.match(tsStart);
  if (match && match.index !== undefined && match.index > 0) {
    code = code.slice(match.index);
  }

  return code.trim();
}

async function writeChecked(filePath: string, content: string, label: string): Promise<void> {
  let clean = extractTypeScriptCode(content);

  // Guard against LLM hitting max_tokens mid-file — truncate to last balanced brace position
  if (braceDepth(clean) !== 0) {
    const truncated = truncateToBalanced(clean, 0);
    const trimmedLines = truncated.split("\n").length;
    const origLines = clean.split("\n").length;
    console.warn(
      `[AGT-04 GUARDRAIL] ${label}: output truncated (unbalanced braces). ` +
        `Trimmed from ${origLines} to ${trimmedLines} lines.`
    );
    clean = truncated;
  }

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
    // Warn but don't throw — minor LLM-generated issues are acceptable
  }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function groupByModule(cases: TestCase[]): Record<string, TestCase[]> {
  return cases.reduce<Record<string, TestCase[]>>((acc, tc) => {
    const mod = tc.module
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
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
