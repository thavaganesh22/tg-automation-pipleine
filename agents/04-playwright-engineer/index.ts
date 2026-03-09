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
import { chromium } from "@playwright/test";
import ts from "typescript";
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

// ── Live App Structure (discovered by Playwright browser inspection) ─────────

interface AppStructure {
  // All [data-testid] values found across all inspected states
  discoveredSelectors: string[];

  // Snapshots keyed by UI state — each trimmed for prompt budget
  snapshots: {
    mainPage: string;          // ARIA snapshot of employee list
    addDrawer: string;         // ARIA snapshot of blank Add Employee drawer
    editDrawer: string;        // ARIA snapshot of Edit drawer prefilled with real data
    confirmDialog: string;     // ARIA snapshot of delete confirmation dialog
  };

  // Real data observed from the live app
  observations: {
    tableColumns: string[];               // column headers visible in the table
    firstRowValues: Record<string, string>; // cell text of the first employee row
    addDrawerFields: string[];            // form field data-testids inside add drawer
    editDrawerPrefill: Record<string, string>; // actual prefilled values in edit form
    confirmDialogText: string;            // dialog message text observed
    apiListSample: string;                // JSON of real GET /api/employees response (truncated)
    apiEmployeeSample: string;            // JSON of real GET /api/employees/:id response
  };
}

/** Collects all data-testid values currently in the DOM. */
async function collectSelectors(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate<string[]>(() =>
    Array.from(document.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid") as string)
      .filter(Boolean)
  );
}

/** Takes an ARIA snapshot of the body, trimmed to maxChars. */
async function ariaSnap(
  page: import("@playwright/test").Page,
  maxChars = 3_000
): Promise<string> {
  try {
    return (await page.locator("body").ariaSnapshot()).slice(0, maxChars);
  } catch {
    return "";
  }
}

/**
 * Browses the live app with headless Chromium and performs a realistic walkthrough:
 *   1. Main page  — collect selectors, column headers, first employee row values, API response
 *   2. Add drawer — click "Add Employee", capture blank form fields + ARIA
 *   3. Edit drawer — close add drawer, click first employee row, capture prefilled values + ARIA
 *   4. Confirm dialog — click Delete inside edit drawer, capture dialog text + ARIA
 *
 * Every interaction step is wrapped individually so a failure in one step does not
 * abort later steps. Falls back to null if the app is unreachable.
 */
async function inspectAppStructure(baseUrl: string): Promise<AppStructure | null> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // ── Capture real API responses passively ──────────────────────────────
    let apiListSample = "";
    let apiEmployeeSample = "";
    page.on("response", async (resp) => {
      try {
        const url = resp.url();
        if (/\/api\/employees(\?|$)/.test(url) && resp.status() === 200 && !apiListSample) {
          const json = await resp.json().catch(() => null);
          if (json) apiListSample = JSON.stringify(json).slice(0, 1_500);
        }
        if (/\/api\/employees\/[^/?]+$/.test(url) && resp.status() === 200 && !apiEmployeeSample) {
          const json = await resp.json().catch(() => null);
          if (json) apiEmployeeSample = JSON.stringify(json).slice(0, 800);
        }
      } catch { /* best-effort */ }
    });

    // ── 1. Main page ───────────────────────────────────────────────────────
    await page.goto(baseUrl, { timeout: 15_000, waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="employee-table"]', { timeout: 8_000 }).catch(() => {});

    const pageSelectors = await collectSelectors(page);
    const mainPageSnap = await ariaSnap(page);

    // Column headers
    const tableColumns: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll("th")).map((th) => th.textContent?.trim() ?? "").filter(Boolean)
    ).catch(() => []);

    // First row cell values
    const firstRowValues: Record<string, string> = {};
    try {
      const firstRow = page.locator('[data-testid^="employee-row-"]').first();
      if (await firstRow.isVisible({ timeout: 3_000 })) {
        const cells = firstRow.locator("td");
        const count = await cells.count();
        for (let i = 0; i < Math.min(count, tableColumns.length); i++) {
          const col = tableColumns[i] ?? `col${i}`;
          firstRowValues[col] = (await cells.nth(i).textContent())?.trim() ?? "";
        }
      }
    } catch { /* best-effort */ }

    // ── 2. Add Employee drawer ──────────────────────────────────────────────
    let addDrawerSnap = "";
    const addDrawerFields: string[] = [];
    try {
      const addBtn = page.locator('[data-testid="add-employee-btn"]');
      if (await addBtn.isVisible({ timeout: 3_000 })) {
        await addBtn.click();
        await page.waitForSelector('[data-testid="employee-drawer"]', { timeout: 5_000 });
        const allSelectors = await collectSelectors(page);
        addDrawerFields.push(...allSelectors.filter((s) => !pageSelectors.includes(s)));
        addDrawerSnap = await ariaSnap(page);
        // Close drawer before next step
        const closeBtn = page.locator('[data-testid="close-drawer-btn"]');
        if (await closeBtn.isVisible({ timeout: 2_000 })) await closeBtn.click();
        else await page.keyboard.press("Escape");
        await page.waitForSelector('[data-testid="employee-drawer"]', { state: "hidden", timeout: 3_000 }).catch(() => {});
      }
    } catch { /* best-effort */ }

    // ── 3. Edit drawer (click first employee row) ──────────────────────────
    let editDrawerSnap = "";
    const editDrawerPrefill: Record<string, string> = {};
    let editDrawerEmployeeId = "";
    try {
      const firstRow = page.locator('[data-testid^="employee-row-"]').first();
      if (await firstRow.isVisible({ timeout: 3_000 })) {
        // Capture the employee ID from data-testid for API sample later
        editDrawerEmployeeId = (await firstRow.getAttribute("data-testid") ?? "").replace("employee-row-", "");
        await firstRow.click();
        await page.waitForSelector('[data-testid="employee-drawer"]', { timeout: 5_000 });

        // Wait for form to populate (edit drawer fetches employee data async)
        try {
          await page.waitForFunction(
            () => {
              const el = document.querySelector('[data-testid="firstName-input"]') as HTMLInputElement | null;
              return el && el.value.trim().length > 0;
            },
            { timeout: 5_000 }
          );
        } catch { /* may not populate in time — continue anyway */ }

        // Capture prefilled input values
        const inputIds = [
          "firstName-input", "lastName-input", "email-input", "phone-input",
          "designation-input", "department-select", "employmentType-select",
          "employmentStatus-select", "startDate-input",
        ];
        for (const id of inputIds) {
          try {
            const el = page.locator(`[data-testid="${id}"]`);
            if (await el.isVisible({ timeout: 1_000 })) {
              const val = await el.inputValue().catch(() => "") || await el.textContent().catch(() => "") || "";
              if (val.trim()) editDrawerPrefill[id] = val.trim();
            }
          } catch { /* individual field best-effort */ }
        }
        editDrawerSnap = await ariaSnap(page);

        // ── 4. Confirm dialog (click Delete inside edit drawer) ────────────
      }
    } catch { /* best-effort */ }

    let confirmDialogSnap = "";
    let confirmDialogText = "";
    try {
      const deleteBtn = page.locator('[data-testid="delete-btn"]');
      if (await deleteBtn.isVisible({ timeout: 2_000 })) {
        await deleteBtn.click();
        await page.waitForSelector('[data-testid="confirm-dialog"]', { timeout: 4_000 });
        confirmDialogText = (await page.locator('[data-testid="confirm-dialog"]').textContent())?.trim().slice(0, 300) ?? "";
        confirmDialogSnap = await ariaSnap(page);
        // Cancel to leave app in clean state
        const cancelBtn = page.locator('[data-testid="confirm-cancel-btn"]');
        if (await cancelBtn.isVisible({ timeout: 2_000 })) await cancelBtn.click();
      }
    } catch { /* best-effort */ }

    // Fetch single employee via API if we have an ID
    if (editDrawerEmployeeId && !apiEmployeeSample) {
      try {
        const resp = await page.evaluate(async (id: string) => {
          const r = await fetch(`/api/employees/${id}`);
          return r.ok ? r.text() : null;
        }, editDrawerEmployeeId);
        if (resp) apiEmployeeSample = resp.slice(0, 800);
      } catch { /* best-effort */ }
    }

    const discoveredSelectors = [...new Set([...pageSelectors, ...addDrawerFields])];
    await browser.close();

    console.log(
      `  [AGT-04] App inspection complete: ${discoveredSelectors.length} selectors | ` +
      `columns: [${tableColumns.join(", ")}] | ` +
      `edit prefill: ${Object.keys(editDrawerPrefill).length} fields | ` +
      `API list: ${apiListSample ? "captured" : "none"}`
    );

    return {
      discoveredSelectors,
      snapshots: {
        mainPage: mainPageSnap,
        addDrawer: addDrawerSnap,
        editDrawer: editDrawerSnap,
        confirmDialog: confirmDialogSnap,
      },
      observations: {
        tableColumns,
        firstRowValues,
        addDrawerFields,
        editDrawerPrefill,
        confirmDialogText,
        apiListSample,
        apiEmployeeSample,
      },
    };
  } catch (err) {
    await browser?.close().catch(() => undefined);
    console.warn(
      `  [AGT-04] App inspection skipped (${(err as Error).message.slice(0, 80)}) — ` +
        `using static selector reference`
    );
    return null;
  }
}

/** Formats AppStructure as a rich prompt section for LLM context. */
function appStructurePrompt(appStructure: AppStructure | null): string {
  if (!appStructure) return "";

  const { discoveredSelectors, snapshots, observations } = appStructure;

  // Strip dynamic IDs (employee-row-{objectId}) — replace with generic pattern note
  const staticSelectors = discoveredSelectors.filter((s) => !/^employee-row-[a-f0-9]{24}$/.test(s));
  const hasDynamicRows = discoveredSelectors.some((s) => /^employee-row-[a-f0-9]{24}$/.test(s));

  const parts: string[] = [
    `LIVE APP INSPECTION (verified from running app at ${process.env.BASE_URL ?? "http://localhost:3000"}):`,
    ``,
    `## Confirmed data-testid selectors`,
    staticSelectors.map((s) => `  [data-testid="${s}"]`).join("\n"),
    ...(hasDynamicRows ? [`  [data-testid^="employee-row-"]  ← dynamic rows (use .first(), .nth(n), not a specific ID)`] : []),
  ];

  if (observations.tableColumns.length > 0) {
    parts.push(`\n## Table columns\n${observations.tableColumns.join(" | ")}`);
  }
  if (Object.keys(observations.firstRowValues).length > 0) {
    // Strip specific DB IDs — never embed real ObjectIds in the prompt (they don't exist in fixtures)
    const sanitizedRow = Object.fromEntries(
      Object.entries(observations.firstRowValues).filter(([k]) => k !== "rowId" && !k.includes("_id") && !k.includes("id"))
    );
    if (Object.keys(sanitizedRow).length > 0) {
      parts.push(`\n## First employee row (real field values — do NOT use these IDs in selectors)\n${JSON.stringify(sanitizedRow, null, 2)}`);
    }
  }
  if (observations.addDrawerFields.length > 0) {
    parts.push(`\n## Add drawer form fields\n${observations.addDrawerFields.map((s) => `  [data-testid="${s}"]`).join("\n")}`);
  }
  if (Object.keys(observations.editDrawerPrefill).length > 0) {
    const sanitizedPrefill = Object.fromEntries(
      Object.entries(observations.editDrawerPrefill).filter(([k]) => !k.includes("_id") && !k.includes("id") && k !== "rowId")
    );
    if (Object.keys(sanitizedPrefill).length > 0) {
      parts.push(`\n## Edit drawer prefilled values (real employee data — do NOT use these in selectors)\n${JSON.stringify(sanitizedPrefill, null, 2)}`);
    }
  }
  if (observations.confirmDialogText) {
    parts.push(`\n## Delete confirm dialog text\n  "${observations.confirmDialogText}"`);
  }
  if (observations.apiListSample) {
    parts.push(`\n## Real GET /api/employees response shape\n${observations.apiListSample}`);
  }
  if (observations.apiEmployeeSample) {
    parts.push(`\n## Real GET /api/employees/:id response shape\n${observations.apiEmployeeSample}`);
  }
  // ARIA snapshots intentionally omitted — they contain real DB ObjectIds that don't exist in fixtures
  if (snapshots.confirmDialog) {
    parts.push(`\n## Delete confirm dialog ARIA snapshot\n${snapshots.confirmDialog}`);
  }

  return parts.join("\n");
}

// ── Main Agent ─────────────────────────────────────────────────────────────

export async function runPlaywrightEngineer(
  testCases: TestCase[],
  apiSpecs: Record<string, unknown>,
  options: PlaywrightEngineerOptions = {}
): Promise<void> {
  await ensureDirs();

  // Inspect the live app once before generating any files.
  // This discovers real [data-testid] selectors and page structure, making
  // generated POMs and specs far more accurate than static references alone.
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const appStructure = await inspectAppStructure(baseUrl);

  const moduleGroups = groupByModule(testCases);

  for (const [module, cases] of Object.entries(moduleGroups)) {
    const uiCases = cases.filter((c) => c.testType === "ui");
    const apiCases = cases.filter((c) => c.testType === "api");

    console.log(
      `  [AGT-04] Module: ${module} | ` +
        `${uiCases.length} UI cases | ${apiCases.length} API cases`
    );

    if (uiCases.length > 0) {
      await processUIModule(module, uiCases, apiSpecs, options, appStructure);
    }

    if (apiCases.length > 0) {
      await processAPIModule(module, apiCases, apiSpecs, options, appStructure);
    }
  }
}

// ── UI Pipeline ─────────────────────────────────────────────────────────────

async function processUIModule(
  module: string,
  uiCases: TestCase[],
  apiSpecs: Record<string, unknown>,
  options: PlaywrightEngineerOptions,
  appStructure: AppStructure | null = null
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
    // Initial generation: first batch only (POM + fixture + first MAX_CASES_PER_SPEC tests).
    // Remaining cases are covered by remediation batches — avoids LLM token overflow on large modules.
    // Skip if all cases are regression — spec should already be committed; regenerating would
    // overwrite manually-crafted fixtures and POMs.
    if (newFeatureCases.length === 0) {
      console.log(`  [AGT-04] [ui] WARNING: spec missing for ${module} but all cases are regression — skipping generation (commit ${module}.spec.ts to fix)`);
      return;
    }
    const firstBatchReg = regressionCases.slice(0, Math.ceil(MAX_CASES_PER_SPEC * 0.7));
    const firstBatchNew = newFeatureCases.slice(0, Math.floor(MAX_CASES_PER_SPEC * 0.3));
    const firstBatch = [...firstBatchReg, ...firstBatchNew];
    if (firstBatch.length === 0) return;

    console.log(`  [AGT-04] [ui] Generating full UI suite for ${module} (${firstBatch.length} cases)`);

    // POM generated first — spec receives method signatures to prevent argument mismatches
    const [pomCode, fixtureCode] = await Promise.all([
      generatePOM(module, firstBatch, appStructure),
      generateFixtures(module, firstBatch, apiSpecs),
    ]);

    const specCode = await generateUISpec(module, firstBatchReg, firstBatchNew, pomCode, appStructure);

    if (!(await fileExists(pomPath))) {
      await writeChecked(pomPath, pomCode, `${module}.page`);
    }
    if (!(await fileExists(fixturePath))) {
      await writeChecked(fixturePath, fixtureCode, `${module}.fixture`);
    }
    await writeChecked(specPath, specCode, `${module}.spec`);
    validateTypeScript(specPath);

    // Append remaining cases in batches (same path as remediation)
    const remainingReg = regressionCases.slice(Math.ceil(MAX_CASES_PER_SPEC * 0.7));
    const remainingNew = newFeatureCases.slice(Math.floor(MAX_CASES_PER_SPEC * 0.3));
    const remaining = [...remainingReg, ...remainingNew];
    if (remaining.length > 0) {
      console.log(`  [AGT-04] [ui] Appending ${remaining.length} additional cases for ${module} in batches`);
      for (let i = 0; i < remaining.length; i += MAX_CASES_PER_SPEC) {
        const batch = remaining.slice(i, i + MAX_CASES_PER_SPEC);
        await mergeUISpec(specPath, batch, module);
      }
    }
  }
}

// ── API Pipeline ────────────────────────────────────────────────────────────

async function processAPIModule(
  module: string,
  apiCases: TestCase[],
  apiSpecs: Record<string, unknown>,
  options: PlaywrightEngineerOptions,
  _appStructure: AppStructure | null = null
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
    // Initial generation: first batch only; remaining cases appended in batches below.
    // Skip if all cases are regression — spec should already be committed; regenerating would
    // overwrite the manually-crafted fixture.
    if (newFeatureCases.length === 0) {
      console.log(`  [AGT-04] [api] WARNING: API spec missing for ${module} but all cases are regression — skipping generation (commit ${module}.api.spec.ts to fix)`);
      return;
    }
    const firstBatchReg = regressionCases.slice(0, Math.ceil(MAX_CASES_PER_SPEC * 0.7));
    const firstBatchNew = newFeatureCases.slice(0, Math.floor(MAX_CASES_PER_SPEC * 0.3));
    const firstBatch = [...firstBatchReg, ...firstBatchNew];
    if (firstBatch.length === 0) return;

    console.log(`  [AGT-04] [api] Generating API spec for ${module} (${firstBatch.length} cases)`);
    const specCode = await generateAPISpec(module, firstBatchReg, firstBatchNew);
    await writeChecked(apiSpecPath, specCode, `${module}.api.spec`);
    validateTypeScript(apiSpecPath);

    // Append remaining cases in batches immediately (no need to wait for remediation pass)
    const remainingReg = regressionCases.slice(Math.ceil(MAX_CASES_PER_SPEC * 0.7));
    const remainingNew = newFeatureCases.slice(Math.floor(MAX_CASES_PER_SPEC * 0.3));
    const remaining = [...remainingReg, ...remainingNew];
    if (remaining.length > 0) {
      console.log(`  [AGT-04] [api] Appending ${remaining.length} additional cases for ${module} in batches`);
      for (let i = 0; i < remaining.length; i += MAX_CASES_PER_SPEC) {
        const batch = remaining.slice(i, i + MAX_CASES_PER_SPEC);
        await mergeAPISpec(apiSpecPath, batch, module);
      }
    }
  }
}

// ── POM Generator ───────────────────────────────────────────────────────────

async function generatePOM(
  module: string,
  cases: TestCase[],
  appStructure: AppStructure | null = null
): Promise<string> {
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

6. BREVITY — CRITICAL
   - The ENTIRE class file MUST be under 300 lines
   - Keep method bodies SHORT: 3–5 lines max per method
   - Use single-line locator returns: return this.page.locator(this.mySelector);
   - Do NOT add JSDoc comments or inline explanations
   - Combine similar actions (e.g. fill all form fields in one fillForm() method)

7. OUTPUT
   - Return ONLY the TypeScript class — no markdown fences, no imports other than Page from @playwright/test
   - TypeScript strict mode — no 'any' types
   - Start with: import { Page } from '@playwright/test';

${DATA_TESTID_REFERENCE}`,
    messages: [
      {
        role: "user",
        content: `Generate the ${pascal}Page class for module "${module}".

${appStructurePrompt(appStructure)}

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
   - ROUTE REGISTRATION ORDER: Playwright matches in LIFO (last-in-first-out) order.
     Register LESS-SPECIFIC patterns first and MORE-SPECIFIC patterns last:
       CORRECT:   page.route('**/api/employees**', listHandler);   // first → lower priority
                  page.route('**/api/employees/*', singleHandler); // last  → higher priority (wins)
       INCORRECT: page.route('**/api/employees/*', singleHandler); // first → lower priority (never reached!)
                  page.route('**/api/employees**', listHandler);   // last  → intercepts everything

2. LIST RESPONSE FORMAT — EXACTLY this shape (never omit pagination):
   {
     data: Employee[],
     pagination: { total: number, page: number, limit: number, pages: number }
   }
   Never use flat fields like 'total', 'pageSize', 'totalPages' at the top level.

3. MOCK DATA
   - Provide AT LEAST 25 realistic employee objects in mockEmployees[] — needed for pagination tests (default limit=20, so 25 gives 2 pages)
   - Use 24-hex MongoDB ObjectId format for _id values, e.g. '665a000000000000000000001' through '665a000000000000000000019'
   - Include employees from multiple departments (Engineering, Product, Design, QA, HR) and statuses (Active, On Leave, Terminated)
   - Employee fields: _id, firstName, lastName, email, designation, department, employmentType ('Full-Time'|'Part-Time'|'Contract'), employmentStatus ('Active'|'On Leave'|'Terminated')
   - For the single-employee route (/api/employees/:id): validate that the ID is a 24-hex string; return 400 INVALID_ID if malformed, 404 if not found
   - POST /api/employees returns 201 (not 200) with the created employee object
   - DELETE /api/employees/:id returns 204 with empty body (no JSON)

4. ERROR RESPONSES
   - Provide ONE generic error mock per endpoint (e.g. return 500 when request body contains "error": true)
   - Do NOT generate per-test-case mocks — one shared setup function handles ALL tests in the module

5. BREVITY — CRITICAL
   - The entire fixture file MUST be under 150 lines
   - Generate exactly ONE setup${pascal}Mocks(page: Page) function
   - Use the SIMPLEST mock that satisfies each endpoint — no per-test conditionals
   - Do NOT add helper functions beyond the single export

6. EXPORT
   - Export one named async function: setup${pascal}Mocks(page: Page): Promise<void>
   - TypeScript strict mode — no 'any'
   - Return ONLY TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Generate fixtures for module "${module}".

Endpoints needed (unique routes only):
${JSON.stringify(
  [...new Set(cases.flatMap((c) => c.tags.filter((t: string) => t.startsWith("/"))))],
  null,
  2
)}

API Specs (for reference): ${JSON.stringify(apiSpecs).slice(0, 1000)}

Test cases (sample — first 10 only, for context):
${JSON.stringify(
  cases.slice(0, 10).map((c) => ({ title: c.title, scope: c.caseScope })),
  null,
  2
)}`,
      },
    ],
  });

  return (response.content[0] as { text: string }).text;
}

// ── UI Spec Generator ───────────────────────────────────────────────────────

/**
 * Extracts full method signatures from POM code.
 * Returns strings like "methodName(param: Type, param2: Type): ReturnType"
 * so the spec generator knows the parameter shape.
 */
function extractPomMethods(pomCode: string): string[] {
  const methods: string[] = [];
  // Match full signature: `async methodName(params): ReturnType {`
  const re = /^\s+(?:public\s+)?async\s+(\w+\s*\([^)]*\)\s*(?::\s*[^{]+?)?)\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pomCode)) !== null) {
    methods.push(m[1].trim());
  }
  return [...new Set(methods)];
}

async function generateUISpec(
  module: string,
  regressionCases: TestCase[],
  newFeatureCases: TestCase[],
  pomCode: string,
  appStructure: AppStructure | null = null
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

4. ALLOWED POM METHODS — call ONLY these exact method signatures (no others):
${pomMethods.map((m) => `   po.${m}`).join("\n")}

   Pass the correct arguments as shown. If a method takes a parameter (e.g. fillForm(data: {...})),
   you MUST pass a matching object. Never call a parameterized method with 0 arguments.

5. ASSERTIONS
   - Use expect(value).toBe() / toContain() / toBeGreaterThan() / toBeGreaterThanOrEqual()
   - Use await with every async POM method call
   - Never assert against raw page.locator() — use POM query methods

6. TEST DATA
   - Use realistic values: firstName='John', lastName='Doe', email='john.doe@test.com'
   - For select options, use exact values from fixtures: 'Engineering', 'Full-Time', 'Active'
   - Never use empty strings as test input values
   - NEVER hardcode specific employee IDs (like '665a000...') — interact by row position (first, second, etc.)
   - NEVER assert specific IDs or DB ObjectIds in test expectations

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

${appStructurePrompt(appStructure)}

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

8. APP BEHAVIOUR CONSTRAINTS
   - This API has NO authentication — do NOT write any test expecting 401 or 403
   - POST /api/employees returns 200 or 201 on success — accept either
   - DELETE /api/employees/:id returns 204 (no body)
   - All endpoints are publicly accessible — no auth headers needed

9. OUTPUT
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
- NEVER hardcode specific employee IDs — interact by row position (first, second, etc.)
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

  // Guard: if the appended block has unbalanced braces/parens, truncate to last complete describe
  const { braces: uiBDepth, parens: uiPDepth } = syntaxDepth(newBlock);
  if (uiBDepth !== 0 || uiPDepth !== 0) {
    const truncated = truncateToBalanced(newBlock, 0);
    console.warn(
      `[AGT-04 GUARDRAIL] ${module}.spec UI merge block had unbalanced braces/parens — truncated.`
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
- No markdown fences — raw TypeScript only
- APP HAS NO AUTH: never assert 401 or 403 — skip any auth test case you receive
- DELETE returns 204 (no body) — use: expect(r.status).toBe(204)`,
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

  // Guard: if the appended block has unbalanced braces/parens, truncate to last complete describe
  const { braces: apiBDepth, parens: apiPDepth } = syntaxDepth(newBlock);
  if (apiBDepth !== 0 || apiPDepth !== 0) {
    const truncated = truncateToBalanced(newBlock, 0);
    console.warn(
      `[AGT-04 GUARDRAIL] ${module}.api.spec API merge block had unbalanced braces/parens — truncated.`
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
 * Checks whether a TypeScript snippet has balanced braces AND parentheses.
 * Ignores delimiters inside string literals (single, double, or template).
 * Returns depths (0 = balanced for each).
 */
function syntaxDepth(code: string): { braces: number; parens: number } {
  let braces = 0;
  let parens = 0;
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
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "(") parens++;
    else if (ch === ")") parens--;
    i++;
  }
  return { braces, parens };
}

/**
 * Truncates code to the last position where brace depth returns to `targetDepth`
 * AND parenthesis depth returns to 0.
 * Use targetDepth=0 for complete files, targetDepth=1 for append blocks.
 *
 * Playwright specs wrap every test in `test.describe('name', () => { ... });`
 * so valid cut points are after `});` — when BOTH the closing `}` brings brace
 * depth to target AND the following `)` brings paren depth to 0.
 * Cutting at `}` alone (depth=0 but parens still open) would drop the `);` and
 * produce a SyntaxError.
 */
function truncateToBalanced(code: string, targetDepth = 0): string {
  let depth = 0;
  let parens = 0;
  let lastPos = -1;
  let i = 0;

  const tryRecord = (pos: number) => {
    if (depth !== targetDepth || parens !== 0) return;
    // Don't record if this is an import destructuring (`import { X } from '...'`).
    // Cutting here would drop the `from 'path'` clause, producing a broken import.
    let j = pos;
    while (j < code.length && (code[j] === " " || code[j] === "\t")) j++;
    const ahead = code.slice(j, j + 5);
    const isImportDestructuring =
      ahead.startsWith("from") && /[\s'"`]/.test(code[j + 4] ?? " ");
    if (!isImportDestructuring) {
      lastPos = pos;
    }
  };

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
    else if (ch === "}") { depth--; tryRecord(i + 1); }
    else if (ch === "(") parens++;
    else if (ch === ")") { parens--; tryRecord(i + 1); }
    i++;
  }
  if (depth === targetDepth && parens === 0) return code; // already balanced
  if (lastPos === -1) return code;                        // no balanced position found — return as-is
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

/**
 * Checks TypeScript syntax using the compiler's transpileModule API.
 * Works without resolving imports — catches syntax errors only (not type errors).
 * Returns the first error message, or null if the code is syntactically valid.
 */
function checkTypeScriptSyntax(code: string): string | null {
  try {
    const result = ts.transpileModule(code, {
      reportDiagnostics: true,
      compilerOptions: {
        strict: false,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
      },
    });
    const errors = (result.diagnostics ?? []).filter(
      (d) => d.category === ts.DiagnosticCategory.Error
    );
    if (errors.length === 0) return null;
    return errors
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))
      .join("; ")
      .slice(0, 300);
  } catch (err) {
    return (err as Error).message.slice(0, 200);
  }
}

/**
 * Fallback repair for TypeScript files where truncateToBalanced(code, 0) returns lastPos=-1.
 * This happens in class files where the brace depth never returns to 0 inside the class body.
 * Strategy: strip trailing lines one at a time, then close open braces/parens/strings.
 * Validates each candidate with checkTypeScriptSyntax() and returns the first valid result.
 *
 * Handles template literal truncation: if a line contains an unclosed backtick (odd number of
 * unescaped backticks), that line is always stripped — it can't be closed safely.
 */
function repairTruncated(code: string): string {
  const lines = code.split("\n");
  // Higher limit — truncation inside a long method body may require stripping many lines
  const maxStrip = Math.min(60, lines.length);

  for (let stripCount = 1; stripCount <= maxStrip; stripCount++) {
    const trimmedLines = lines.slice(0, lines.length - stripCount);
    const trimmed = trimmedLines.join("\n");

    // Skip if the new last line has an unclosed string literal (odd number of unescaped quotes)
    const lastLine = trimmedLines[trimmedLines.length - 1] ?? "";
    if (hasUnclosedString(lastLine)) continue;

    const { braces, parens } = syntaxDepth(trimmed);
    // Skip candidates with negative depth (over-closed)
    if (braces < 0 || parens < 0) continue;
    // Build closers: close parens before braces
    const closers = ")".repeat(Math.max(0, parens)) + "}".repeat(Math.max(0, braces));
    const candidate = trimmed.trimEnd() + (closers ? "\n" + closers : "") + "\n";
    if (!checkTypeScriptSyntax(candidate)) return candidate;
  }
  return code; // all attempts failed — return original
}

/**
 * Returns true if the line contains an unclosed string literal (backtick, single, or double quote).
 * Used to skip lines that would confuse syntaxDepth() after truncation.
 */
function hasUnclosedString(line: string): boolean {
  let inSingle = false, inDouble = false, inTemplate = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") { i++; continue; } // skip escaped char
    if (ch === "'" && !inDouble && !inTemplate) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle && !inTemplate) { inDouble = !inDouble; continue; }
    if (ch === "`" && !inSingle && !inDouble) { inTemplate = !inTemplate; continue; }
  }
  return inSingle || inDouble || inTemplate;
}

async function writeChecked(filePath: string, content: string, label: string): Promise<void> {
  let clean = extractTypeScriptCode(content);

  // Pass 1: brace + paren balance check — handles LLM max_tokens truncation mid-describe.
  // Cutting at `}` alone (braces=0 but parens open) leaves `test.describe(` unclosed → SyntaxError.
  const { braces: bDepth, parens: pDepth } = syntaxDepth(clean);
  if (bDepth !== 0 || pDepth !== 0) {
    const truncated = truncateToBalanced(clean, 0);
    console.warn(
      `[AGT-04 GUARDRAIL] ${label}: output truncated (unbalanced braces/parens). ` +
        `${clean.split("\n").length} → ${truncated.split("\n").length} lines.`
    );
    clean = truncated;
  }

  // Pass 2: TypeScript syntax check using ts.transpileModule() (no import resolution needed).
  // If a syntax error remains after balance truncation, apply truncateToBalanced as a second
  // pass with a fresh balance scan on the already-trimmed code, then re-check.
  const syntaxErr = checkTypeScriptSyntax(clean);
  if (syntaxErr) {
    const truncated = truncateToBalanced(clean, 0);
    const truncErr = checkTypeScriptSyntax(truncated);
    if (!truncErr && truncated !== clean) {
      console.warn(
        `[AGT-04 GUARDRAIL] ${label}: syntax error fixed by second truncation pass. ` +
          `${clean.split("\n").length} → ${truncated.split("\n").length} lines. Error was: ${syntaxErr}`
      );
      clean = truncated;
    } else {
      // Pass 3: repairTruncated() — handles TypeScript class files where truncateToBalanced
      // finds no valid cut point (lastPos=-1) because class body depth never returns to 0.
      // Strips partial lines and closes open braces/parens until syntax is valid.
      const repaired = repairTruncated(clean);
      const repairErr = checkTypeScriptSyntax(repaired);
      if (!repairErr && repaired !== clean) {
        console.warn(
          `[AGT-04 GUARDRAIL] ${label}: syntax error fixed by repairTruncated(). ` +
            `${clean.split("\n").length} → ${repaired.split("\n").length} lines. Error was: ${syntaxErr}`
        );
        clean = repaired;
      } else {
        // Could not auto-fix — warn but write anyway so the pipeline can continue
        console.warn(
          `[AGT-04 GUARDRAIL] ${label}: syntax error could not be auto-fixed: ${syntaxErr}`
        );
      }
    }
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
    // Warn but don't throw — type errors are acceptable; syntax errors are caught by writeChecked
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
