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
 *     2. NO fixtures for UI — tests run directly against the live app (no page.route() mocks)
 *     3. UI Spec              → playwright-tests/specs/{module}.spec.ts
 *        - Imports POM only; ONLY calls POM methods; hits real running backend
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
import type { EnhancedAppStructure } from "../../shared/types";
import { inspectAppComprehensive } from "../../shared/browser-inspector";

const client = new Anthropic();

const DEFAULT_MAX_TOKENS = 16384;
const MAX_CONTINUATIONS = 3;

/**
 * Call the Anthropic API with automatic continuation when the response is
 * truncated due to max_tokens. Concatenates partial outputs until the model
 * emits stop_reason: "end_turn" or the continuation limit is reached.
 */
async function llmGenerate(
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "max_tokens"> & { max_tokens?: number }
): Promise<string> {
  const maxTokens = params.max_tokens ?? DEFAULT_MAX_TOKENS;
  let accumulated = "";
  let messages = [...params.messages];

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const response = await client.messages.create({
      ...params,
      max_tokens: maxTokens,
      messages,
    });

    const text = (response.content[0] as { text: string }).text;
    accumulated += text;

    if (response.stop_reason !== "max_tokens") {
      return accumulated;
    }

    console.warn(
      `[AGT-04] Response truncated (max_tokens). Continuation ${attempt + 1}/${MAX_CONTINUATIONS}…`
    );

    // Ask the model to continue from where it left off
    messages = [
      ...messages,
      { role: "assistant" as const, content: accumulated },
      { role: "user" as const, content: "Continue exactly where you left off. Do not repeat any code already written. Output only the remaining code." },
    ];
  }

  console.warn(`[AGT-04] Max continuations (${MAX_CONTINUATIONS}) reached — output may still be truncated`);
  return accumulated;
}

let OUTPUT_ROOT = "playwright-tests";
let POM_DIR = `${OUTPUT_ROOT}/pages`;
let FIXTURE_DIR = `${OUTPUT_ROOT}/fixtures`;
let SPEC_DIR = `${OUTPUT_ROOT}/specs`;
const MAX_LINES_PER_FILE = 800;
const MAX_CASES_PER_SPEC = parseInt(process.env.MAX_CASES_PER_SPEC ?? "20", 10);

export interface PlaywrightEngineerOptions {
  remediationMode?: boolean;
  /** Override output directory. Default: "playwright-tests" */
  outputDir?: string;
  /** Override the live app URL used for selector inspection. Default: BASE_URL env or http://localhost:3000 */
  baseUrl?: string;
  /** Pre-computed app observations from shared browser inspector. Skips internal inspection if provided. */
  appObservations?: EnhancedAppStructure | null;
}

/**
 * Input contract for runPlaywrightEngineer.
 * When called standalone (outside the pipeline) provide cases directly.
 */
export interface PlaywrightEngineerInput {
  cases: TestCase[];
  /** OpenAPI spec for the target app — pass {} if not available */
  apiSpecs?: Record<string, unknown>;
  options?: PlaywrightEngineerOptions;
}

/** What runPlaywrightEngineer returns — lets callers see exactly what was written. */
export interface PlaywrightEngineerOutput {
  /** Absolute paths of every file written or merged during this run */
  filesWritten: string[];
  /** Non-fatal warnings emitted during generation (truncation, syntax fallback, etc.) */
  warnings: string[];
  /** The resolved output directory that was used */
  outputDir: string;
}

// ── Data-testid reference (authoritative — shared across all prompts) ────────
// The FORM section is generated dynamically from live browser observations so
// new fields are picked up automatically without any code changes here.

const DATA_TESTID_STATIC_PREFIX = `
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
  [data-testid="drawer-error"]            — error message inside drawer`.trim();

const DATA_TESTID_STATIC_SUFFIX = `
CONFIRM DIALOG:
  [data-testid="confirm-dialog"]
  [data-testid="modal-overlay"]
  [data-testid="confirm-cancel-btn"]
  [data-testid="confirm-delete-btn"]`.trim();

// Non-field drawer selectors excluded from the dynamic FORM listing
const DRAWER_NON_FIELD_IDS = new Set([
  "employee-drawer", "drawer-overlay", "close-drawer-btn", "drawer-error",
  "delete-btn", "cancel-btn", "submit-btn",
]);

function buildDataTestidReference(obs?: EnhancedAppStructure | null): string {
  // Build the FORM section from live observations when available
  const drawerSelectors = obs?.observations?.addDrawerFields ?? [];
  const formInputs = drawerSelectors.filter(
    (id) => !DRAWER_NON_FIELD_IDS.has(id) && (id.endsWith("-input") || id.endsWith("-select"))
  );
  const formErrors = drawerSelectors.filter((id) => id.endsWith("-error"));
  const formButtons = ["delete-btn", "cancel-btn", "submit-btn"].filter((id) =>
    drawerSelectors.includes(id)
  );

  // Fall back to a minimal hardcoded list only when the inspector hasn't run yet
  const inputs = formInputs.length > 0
    ? formInputs.map((id) => `  [data-testid="${id}"]`).join("\n")
    : [
        "firstName-input", "lastName-input", "email-input", "phone-input", "cellPhone-input",
        "designation-input", "department-select", "employmentType-select",
        "employmentStatus-select", "startDate-input",
        "street-input", "city-input", "state-input", "postalCode-input", "country-input",
      ].map((id) => `  [data-testid="${id}"]`).join("\n");

  const errors = formErrors.length > 0
    ? formErrors.map((id) => `  [data-testid="${id}"]`).join("\n")
    : [
        "firstName-error", "lastName-error", "email-error", "designation-error",
        "department-error", "employmentType-error", "employmentStatus-error",
        "startDate-error", "address-street-error", "address-city-error", "address-country-error",
        "phone-error", "cellPhone-error",
      ].map((id) => `  [data-testid="${id}"]`).join("\n");

  const buttons = formButtons.length > 0
    ? formButtons.map((id) => `  [data-testid="${id}"]`).join("\n")
    : [
        `  [data-testid="delete-btn"]              — Delete (edit mode only)`,
        `  [data-testid="cancel-btn"]              — Cancel / close form`,
        `  [data-testid="submit-btn"]              — Save / Add Employee submit`,
      ].join("\n");

  return [
    DATA_TESTID_STATIC_PREFIX,
    `\nFORM (inside drawer):\n${inputs}\n${errors}\n${buttons}`,
    `\n${DATA_TESTID_STATIC_SUFFIX}`,
  ].join("\n");
}

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

        // Dynamically discover all form inputs/selects in the add drawer from the live DOM
        // so new fields are picked up automatically without any code changes here
        const inputIds = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('[data-testid$="-input"],[data-testid$="-select"]'))
            .filter((el) => el instanceof HTMLInputElement || el instanceof HTMLSelectElement)
            .map((el) => el.getAttribute("data-testid")!)
            .filter(Boolean)
        );
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

  // Include all selectors — dynamic row IDs are noted as patterns
  const staticSelectors = discoveredSelectors.filter((s) => !/^employee-row-[a-f0-9]{24}$/.test(s));
  const hasDynamicRows = discoveredSelectors.some((s) => /^employee-row-[a-f0-9]{24}$/.test(s));

  const parts: string[] = [
    `LIVE APP INSPECTION (verified from running app at ${process.env.BASE_URL ?? "http://localhost:3000"}):`,
    `NOTE: This data is for SELECTOR VERIFICATION ONLY. Do NOT hardcode employee names, emails, or IDs`,
    `from this inspection into test assertions — they change between DB resets and test runs.`,
    ``,
    `## Confirmed data-testid selectors`,
    staticSelectors.map((s) => `  [data-testid="${s}"]`).join("\n"),
    ...(hasDynamicRows ? [`  [data-testid^="employee-row-"]  ← dynamic rows (use .first(), .nth(n), or use getFirstEmployeeId() to get a real ID)`] : []),
  ];

  if (observations.tableColumns.length > 0) {
    parts.push(`\n## Table columns (CSS text-transform:uppercase — always assert with UPPERCASE text)\n${observations.tableColumns.join(" | ")}`);
  }
  if (Object.keys(observations.firstRowValues).length > 0) {
    // Include all real field values — these are from the live app for reference
    parts.push(`\n## First employee row (real field values from live app)\n${JSON.stringify(observations.firstRowValues, null, 2)}`);
  }
  if (observations.addDrawerFields.length > 0) {
    parts.push(`\n## Add drawer form fields\n${observations.addDrawerFields.map((s) => `  [data-testid="${s}"]`).join("\n")}`);
  }
  if (Object.keys(observations.editDrawerPrefill).length > 0) {
    // Include prefilled values — real employee data for reference
    parts.push(`\n## Edit drawer prefilled values (real employee data)\n${JSON.stringify(observations.editDrawerPrefill, null, 2)}`);
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
  // Include ARIA snapshots for live-app context
  if (snapshots.editDrawer) {
    parts.push(`\n## Edit drawer ARIA snapshot (prefilled with real data)\n${snapshots.editDrawer.slice(0, 1500)}`);
  }
  if (snapshots.confirmDialog) {
    parts.push(`\n## Delete confirm dialog ARIA snapshot\n${snapshots.confirmDialog}`);
  }

  return parts.join("\n");
}

// ── Observation-Driven Behavior Context ──────────────────────────────────────

/**
 * Converts EnhancedAppStructure observations into compact prompt text.
 * Replaces ~800 lines of hardcoded behavior rules with ~150-200 lines of verified facts.
 *
 * Two variants: 'ui' (selectors, form behavior, timings) and 'api' (schemas, routes, validation).
 * The 'fixture' variant gets both.
 */
function generateBehaviorContext(
  obs: EnhancedAppStructure,
  variant: "ui" | "api" | "fixture"
): string {
  const parts: string[] = [
    "APP BEHAVIOR (observed from live app — verified facts):",
    "",
  ];

  // ── Common: apiCall helper + route behavior ────────────────────────────
  parts.push(`apiCall() HELPER RETURNS: { status: number, body: Record<string, unknown> }`);
  parts.push(`  — NO headers field. Never assert r.headers or r.statusText.`);
  parts.push("");

  if (Object.keys(obs.routeBehavior).length > 0) {
    parts.push("ROUTE BEHAVIOR (verified):");
    for (const [route, status] of Object.entries(obs.routeBehavior)) {
      const suffix = route === "/unknown" ? " (SPA fallback — serves index.html)" :
                     route === "/api/unknown" ? " (API not found)" :
                     route === "/api/health" ? ` — ${JSON.stringify(obs.apiSchemas.healthShape)}` : "";
      parts.push(`  ${route} → ${status}${suffix}`);
    }
    parts.push("");
  }

  // ── UI-specific context ────────────────────────────────────────────────
  if (variant === "ui" || variant === "fixture") {
    if (Object.keys(obs.formBehavior.fieldsWithDefaults).length > 0) {
      parts.push("FORM DEFAULTS (pre-filled when add-drawer opens):");
      for (const [testid, val] of Object.entries(obs.formBehavior.fieldsWithDefaults)) {
        parts.push(`  ${testid}: "${val}"`);
      }
      parts.push("");
    }

    if (Object.keys(obs.formBehavior.emptySubmitErrors).length > 0) {
      parts.push("VALIDATION ON EMPTY SUBMIT (only these fields show errors):");
      for (const [testid, text] of Object.entries(obs.formBehavior.emptySubmitErrors)) {
        parts.push(`  ${testid}: "${text}"`);
      }
      if (obs.formBehavior.fieldsWithoutErrors.length > 0) {
        parts.push(`Fields WITHOUT errors: ${obs.formBehavior.fieldsWithoutErrors.join(", ")}`);
      }
      parts.push("");
    }

    if (Object.keys(obs.dropdownOptions).length > 0) {
      parts.push("DROPDOWN OPTIONS (exact values — use these exact strings):");
      for (const [testid, options] of Object.entries(obs.dropdownOptions)) {
        parts.push(`  ${testid}: [${options.map((o) => `"${o}"`).join(", ")}]`);
      }
      parts.push("");
    }

    if (obs.timings.successToastMs > 0) {
      parts.push(`SUCCESS TOAST TIMING: appeared after ${obs.timings.successToastMs}ms — use timeout: 15000`);
      parts.push("");
    }
  }

  // ── API-specific context ───────────────────────────────────────────────
  if (variant === "api" || variant === "fixture") {
    parts.push("API RESPONSE SHAPES (verified from live app):");

    if (obs.apiSchemas.listSampleResponse) {
      parts.push(`  GET /api/employees → ${JSON.stringify(obs.apiSchemas.listShape)}`);
      parts.push(`  Default limit: ${obs.apiSchemas.listDefaultLimit || 20}`);
      parts.push(`  Sample: ${JSON.stringify(obs.apiSchemas.listSampleResponse).slice(0, 500)}`);
    }

    if (obs.apiSchemas.singleSampleResponse) {
      parts.push(`  GET /api/employees/:id → ${JSON.stringify(obs.apiSchemas.singleShape)}`);
    }

    if (obs.apiSchemas.createSuccessShape) {
      parts.push(`  POST /api/employees (201) → ${JSON.stringify(obs.apiSchemas.createSuccessShape)}`);
    }

    if (obs.apiSchemas.createErrorShape) {
      parts.push(`  POST missing fields (400) → ${JSON.stringify(obs.apiSchemas.createErrorShape)}`);
    }

    if (obs.apiSchemas.duplicateEmailStatus) {
      parts.push(`  POST duplicate email (${obs.apiSchemas.duplicateEmailCaseSensitive ? "case-sensitive" : "case-insensitive"}) → ${obs.apiSchemas.duplicateEmailStatus}`);
      if (obs.apiSchemas.duplicateEmailErrorShape) {
        parts.push(`    Error: ${JSON.stringify(obs.apiSchemas.duplicateEmailErrorShape)}`);
      }
    }

    if (obs.apiSchemas.deleteStatus) {
      parts.push(`  DELETE /api/employees/:id → ${obs.apiSchemas.deleteStatus}${obs.apiSchemas.deleteHasBody ? "" : " (no body)"}`);
    }

    if (obs.apiSchemas.healthShape) {
      parts.push(`  GET /api/health → ${JSON.stringify(obs.apiSchemas.healthShape)}`);
    }
    parts.push("");

    // Invalid/not-found ID behavior — critical for negative API tests
    if (obs.apiSchemas.invalidIdStatus) {
      parts.push(`INVALID ID BEHAVIOR (verified from live app):`);
      parts.push(`  GET /api/employees/not-a-valid-id → ${obs.apiSchemas.invalidIdStatus}${obs.apiSchemas.invalidIdErrorShape ? ` ${JSON.stringify(obs.apiSchemas.invalidIdErrorShape)}` : ""}`);
      parts.push(`  GET /api/employees/000000000000000000000000 (valid format, nonexistent) → ${obs.apiSchemas.notFoundIdStatus}${obs.apiSchemas.notFoundIdErrorShape ? ` ${JSON.stringify(obs.apiSchemas.notFoundIdErrorShape)}` : ""}`);
      parts.push(`  IMPORTANT: Use the EXACT status codes above in assertions — do NOT assume 400 for invalid IDs if the app returns ${obs.apiSchemas.invalidIdStatus}.`);
      parts.push("");
    }

    // Filter behavior — what happens with unknown filter values
    parts.push(`FILTER BEHAVIOR (verified):`);
    parts.push(`  GET /api/employees?department=UNKNOWN → ${obs.apiSchemas.filterBehavior.unknownDepartmentReturnsEmpty ? "200 with empty data[]" : "returns results (no filter applied)"}`);
    parts.push(`  GET /api/employees?status=UNKNOWN → ${obs.apiSchemas.filterBehavior.unknownStatusReturnsEmpty ? "200 with empty data[]" : "returns results (no filter applied)"}`);
    parts.push(`  Unknown filter values do NOT return errors — they return 200 with empty or unfiltered results.`);
    parts.push("");

    // Search behavior — MongoDB $text full-word matching
    parts.push(`SEARCH BEHAVIOR (verified):`);
    parts.push(`  Backend uses MongoDB $text search — FULL WORD matching only, NOT substring.`);
    parts.push(`  "Ais" does NOT match "Aisha". "Aisha" DOES match "Aisha".`);
    parts.push(`  Test search terms MUST be complete words (e.g., use employee.firstName.split(' ')[0], NOT firstName.substring(0,3)).`);
    parts.push(`  searchEmployees() in POMs uses click+fill+loading-row wait pattern (NOT waitForResponse).`);
    parts.push("");

    if (obs.apiSchemas.createRequiredFields.length > 0) {
      parts.push(`REQUIRED FIELDS FOR CREATE (cause 400 when missing):`);
      parts.push(`  ${obs.apiSchemas.createRequiredFields.join(", ")}`);
      if (Object.keys(obs.apiSchemas.createOptionalWithDefaults).length > 0) {
        parts.push(`  NOT required (have defaults): ${Object.entries(obs.apiSchemas.createOptionalWithDefaults).map(([k, v]) => `${k} ("${v}")`).join(", ")}`);
      }
      parts.push("");
    }
  }

  // ── Selectors (both variants) ──────────────────────────────────────────
  const staticSelectors = obs.discoveredSelectors.filter((s) => !/^employee-row-[a-f0-9]{24}$/.test(s));
  const hasDynamicRows = obs.discoveredSelectors.some((s) => /^employee-row-[a-f0-9]{24}$/.test(s));
  parts.push("VERIFIED SELECTORS (from live app):");
  parts.push(staticSelectors.map((s) => `  [data-testid="${s}"]`).join("\n"));
  if (hasDynamicRows) {
    parts.push(`  [data-testid^="employee-row-"]  ← dynamic rows`);
  }

  return parts.join("\n");
}

// ── Main Agent ─────────────────────────────────────────────────────────────

/**
 * Primary entry point — supports both pipeline mode and standalone library mode.
 *
 * Pipeline (orchestrator passes positional args — backward-compatible):
 *   await runPlaywrightEngineer(testCases, apiSpecs, options)
 *
 * Standalone library (team passes a typed input object):
 *   await runPlaywrightEngineer({ cases, apiSpecs, options: { outputDir, baseUrl } })
 */
export async function runPlaywrightEngineer(
  inputOrCases: PlaywrightEngineerInput | TestCase[],
  apiSpecs: Record<string, unknown> = {},
  options: PlaywrightEngineerOptions = {}
): Promise<PlaywrightEngineerOutput> {
  // ── Normalise input — accept both calling conventions ────────────────────
  let testCases: TestCase[];
  let resolvedOptions: PlaywrightEngineerOptions;
  let resolvedApiSpecs: Record<string, unknown>;

  if (Array.isArray(inputOrCases)) {
    // Legacy / pipeline call: runPlaywrightEngineer(cases[], apiSpecs, options)
    testCases = inputOrCases;
    resolvedApiSpecs = apiSpecs;
    resolvedOptions = options;
  } else {
    // Typed input object: runPlaywrightEngineer({ cases, apiSpecs, options })
    testCases = inputOrCases.cases;
    resolvedApiSpecs = inputOrCases.apiSpecs ?? {};
    resolvedOptions = inputOrCases.options ?? {};
  }

  // ── Configure output paths ───────────────────────────────────────────────
  OUTPUT_ROOT = resolvedOptions.outputDir ?? "playwright-tests";
  POM_DIR = `${OUTPUT_ROOT}/pages`;
  FIXTURE_DIR = `${OUTPUT_ROOT}/fixtures`;
  SPEC_DIR = `${OUTPUT_ROOT}/specs`;

  await ensureDirs();

  // ── Inspect the live app once before generating any files ────────────────
  // Use pre-computed observations from orchestrator if available, otherwise run inspection locally
  const baseUrl =
    resolvedOptions.baseUrl ?? process.env.BASE_URL ?? "http://localhost:3000";
  let enhancedObs: EnhancedAppStructure | null = resolvedOptions.appObservations ?? null;
  if (!enhancedObs) {
    enhancedObs = await inspectAppComprehensive(baseUrl);
  }
  // Build legacy AppStructure for backward compatibility with existing prompt functions
  const appStructure: AppStructure | null = enhancedObs ? {
    discoveredSelectors: enhancedObs.discoveredSelectors,
    snapshots: enhancedObs.snapshots,
    observations: enhancedObs.observations,
  } : await inspectAppStructure(baseUrl);

  const modulesProcessed: string[] = [];
  const warnings: string[] = [];
  const moduleGroups = groupByModule(testCases);

  for (const [module, cases] of Object.entries(moduleGroups)) {
    const uiCases = cases.filter((c) => c.testType === "ui");
    const apiCases = cases.filter((c) => c.testType === "api");

    console.log(
      `  [AGT-04] Module: ${module} | ` +
        `${uiCases.length} UI cases | ${apiCases.length} API cases`
    );

    if (uiCases.length > 0) {
      await processUIModule(module, uiCases, resolvedApiSpecs, resolvedOptions, appStructure, enhancedObs);
    }

    if (apiCases.length > 0) {
      await processAPIModule(module, apiCases, resolvedApiSpecs, resolvedOptions, appStructure, enhancedObs);
    }

    modulesProcessed.push(module);
  }

  // Enumerate what was actually written so callers can inspect results
  const resolvedOutputDir = path.resolve(OUTPUT_ROOT);
  const filesWritten: string[] = [];
  for (const module of modulesProcessed) {
    const candidates = [
      path.join(POM_DIR, `${module}.page.ts`),
      path.join(FIXTURE_DIR, `${module}.fixture.ts`),
      path.join(SPEC_DIR, `${module}.spec.ts`),
      path.join(SPEC_DIR, `${module}.api.spec.ts`),
    ];
    for (const f of candidates) {
      try {
        await fs.access(f);
        filesWritten.push(path.resolve(f));
      } catch { /* file not generated for this module */ }
    }
  }

  return { filesWritten, warnings, outputDir: resolvedOutputDir };
}

// ── UI Pipeline ─────────────────────────────────────────────────────────────

async function processUIModule(
  module: string,
  uiCases: TestCase[],
  _apiSpecs: Record<string, unknown>,
  options: PlaywrightEngineerOptions,
  appStructure: AppStructure | null = null,
  enhancedObs: EnhancedAppStructure | null = null
): Promise<void> {
  const specPath = path.join(SPEC_DIR, `${module}.spec.ts`);
  const pomPath = path.join(POM_DIR, `${module}.page.ts`);

  const regressionCases = uiCases.filter((c) => c.caseScope === "regression");
  const newFeatureCases = uiCases.filter((c) => c.caseScope === "new-feature");
  const specExists = await fileExists(specPath);

  if (specExists && !options.remediationMode) {
    if (newFeatureCases.length > 0) {
      console.log(`  [AGT-04] [ui] Merging ${newFeatureCases.length} new-feature cases → ${specPath}`);
      await mergeUISpec(specPath, newFeatureCases, module, enhancedObs);

      if (await fileExists(pomPath)) {
        console.log(`  [AGT-04] [ui] Extending POM for new actions in ${module}`);
        await extendPOM(pomPath, newFeatureCases, module, enhancedObs);
      }
    } else {
      console.log(`  [AGT-04] [ui] No new-feature cases for ${module} — spec unchanged`);
    }
  } else if (specExists && options.remediationMode) {
    console.log(`  [AGT-04] [ui] Remediation: merging ${uiCases.length} gap cases → ${specPath}`);
    await mergeUISpec(specPath, uiCases, module, enhancedObs);
  } else {
    // Initial generation: first batch only (POM + first MAX_CASES_PER_SPEC tests).
    // Remaining cases are covered by remediation batches — avoids LLM token overflow on large modules.
    // POM is guarded by fileExists check below — never overwritten if already present.
    // No fixture generated — UI tests hit the live running app directly.
    const firstBatchReg = regressionCases.slice(0, Math.ceil(MAX_CASES_PER_SPEC * 0.7));
    const firstBatchNew = newFeatureCases.slice(0, Math.floor(MAX_CASES_PER_SPEC * 0.3));
    const firstBatch = [...firstBatchReg, ...firstBatchNew];
    if (firstBatch.length === 0) return;

    console.log(`  [AGT-04] [ui] Generating full UI suite for ${module} (${firstBatch.length} cases)`);

    // POM generated first — spec receives method signatures to prevent argument mismatches
    // No fixtures for UI modules — tests run against the live app (no page.route() mocks)
    const pomCodeRaw = await generatePOM(module, firstBatch, appStructure, enhancedObs);
    const pomCode = postprocessPOM(pomCodeRaw);

    const specCode = await generateUISpec(module, firstBatchReg, firstBatchNew, pomCode, appStructure, enhancedObs);

    if (!(await fileExists(pomPath))) {
      await writeChecked(pomPath, pomCode, `${module}.page`);
    }
    // Fixtures are NOT generated for UI modules — tests hit the real running app
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
        await mergeUISpec(specPath, batch, module, enhancedObs);
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
  _appStructure: AppStructure | null = null,
  enhancedObs: EnhancedAppStructure | null = null
): Promise<void> {
  const apiSpecPath = path.join(SPEC_DIR, `${module}.api.spec.ts`);
  const fixturePath = path.join(FIXTURE_DIR, `${module}.fixture.ts`);

  const regressionCases = apiCases.filter((c) => c.caseScope === "regression");
  const newFeatureCases = apiCases.filter((c) => c.caseScope === "new-feature");
  const apiSpecExists = await fileExists(apiSpecPath);

  // Fixture is shared — generate only if UI pipeline hasn't done it yet
  if (!(await fileExists(fixturePath))) {
    console.log(`  [AGT-04] [api] Generating shared fixture for ${module}`);
    const fixtureCode = await generateFixtures(module, apiCases, apiSpecs, enhancedObs);
    await writeChecked(fixturePath, fixtureCode, `${module}.fixture`);
  }

  if (apiSpecExists && !options.remediationMode) {
    if (newFeatureCases.length > 0) {
      console.log(`  [AGT-04] [api] Merging ${newFeatureCases.length} new-feature cases → ${apiSpecPath}`);
      await mergeAPISpec(apiSpecPath, newFeatureCases, module, enhancedObs);
    } else {
      console.log(`  [AGT-04] [api] No new-feature cases for ${module} — API spec unchanged`);
    }
  } else if (apiSpecExists && options.remediationMode) {
    // Batch into chunks of 15 to stay within max_tokens for each append call
    const REMEDIATION_BATCH = 15;
    for (let i = 0; i < apiCases.length; i += REMEDIATION_BATCH) {
      const batch = apiCases.slice(i, i + REMEDIATION_BATCH);
      console.log(`  [AGT-04] [api] Remediation: appending ${batch.length} gap cases (batch ${Math.floor(i/REMEDIATION_BATCH)+1}) → ${apiSpecPath}`);
      await mergeAPISpec(apiSpecPath, batch, module, enhancedObs);
    }
  } else {
    // Initial generation: first batch only; remaining cases appended in batches below.
    // Fixture is guarded by fileExists check above — never overwritten if already present.
    const firstBatchReg = regressionCases.slice(0, Math.ceil(MAX_CASES_PER_SPEC * 0.7));
    const firstBatchNew = newFeatureCases.slice(0, Math.floor(MAX_CASES_PER_SPEC * 0.3));
    const firstBatch = [...firstBatchReg, ...firstBatchNew];
    if (firstBatch.length === 0) return;

    console.log(`  [AGT-04] [api] Generating API spec for ${module} (${firstBatch.length} cases)`);
    const specCode = await generateAPISpec(module, firstBatchReg, firstBatchNew, enhancedObs);
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
        await mergeAPISpec(apiSpecPath, batch, module, enhancedObs);
      }
    }
  }
}

// ── POM Generator ───────────────────────────────────────────────────────────

async function generatePOM(
  module: string,
  cases: TestCase[],
  appStructure: AppStructure | null = null,
  enhancedObs: EnhancedAppStructure | null = null
): Promise<string> {
  const pascal = toPascalCase(module);

  const response = await llmGenerate({
    model: "claude-opus-4-6",
    temperature: 0,
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
   - CRITICAL: Only declare selector fields that are ACTUALLY USED by at least one method in this class.
     Never declare a selector just because it exists in the reference — unused private fields are TypeScript errors.

3. METHODS
   - All methods are public async and return typed Promises
   - Method names express USER INTENT, e.g.:
       navigate()                 — goto('/') + wait for employee-table
       openAddEmployeeDrawer()    NOT  clickAddButton()
       fillFirstName(value)       NOT  typeInFirstNameField(value)
       submitEmployeeForm()       NOT  clickSubmitButton()
       getEmployeeRowCount()      NOT  countTableRows()
   - Every method includes its own waitForSelector/waitForLoadState before acting
   - Action methods (click, fill, select) use: this.page.waitForSelector(this.mySelector, { state: 'visible' })
     then this.page.click(this.mySelector) / this.page.fill(this.mySelector, value) / this.page.selectOption(this.mySelector, value)
   - Query methods (isXVisible, getXText, getXCount) use locators and return boolean/string/number
   - IMPORTANT: getEmployeeRowCount() must wait for loading-row to be hidden before counting:
       async getEmployeeRowCount(): Promise<number> {
         await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
         return this.page.locator('[data-testid^="employee-row-"]').count();
       }
   - NO test assertions (expect) inside POM — assertions belong in the spec only

   REQUIRED LIVE-APP METHODS — always include these:
   a. navigate(): Promise<void>
      — goto('/'), wait for employee-table visible, wait for loading-row hidden (with .catch(() => {})),
        then wait for at least one employee row with .catch(() => {}) so it doesn't fail on empty DB:
        await this.page.goto('/');
        await this.page.waitForSelector(this.employeeTable, { timeout: 10000 });
        await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
        await this.page.waitForSelector('[data-testid^="employee-row-"]', { timeout: 10000 }).catch(() => {});
   b. getFirstEmployeeId(): Promise<string>
      — Uses page.request.get GET /api/employees, extracts first employee ID
      — CRITICAL: response shape is { data: Employee[], pagination: {...} }
        The array is at response.data NOT response (response itself is an object)
        CORRECT:   const body = await res.json(); return body.data[0]._id as string;
        INCORRECT: const body = await res.json(); return body[0]._id as string;  // WRONG
      — throws if no employees found (data array is empty)
   c. createEmployee(payload: { firstName: string; lastName: string; email: string; designation: string; department: string; employmentType: string; employmentStatus: string; startDate: string; address: { street: string; city: string; country: string } }): Promise<string>
      — page.request.post POST /api/employees with ALL required fields, returns created._id
      — REQUIRED fields: firstName, lastName, email, designation, department, employmentType, employmentStatus, startDate (YYYY-MM-DD), address (object with street, city, country)
      — Example: { firstName: 'Test', lastName: 'User', email: 'test@test.com', designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' } }
   d. deleteEmployee(id: string): Promise<void>
      — page.request.delete DELETE /api/employees/:id, expects 204
   e. waitForSuccessToast(): Promise<void>  — if this module has form submission
      — Use timeout: 15000 (not 10000): await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 })

4. API CALLS FROM POM — two distinct patterns, NEVER mix them up:

   a. TEST-DATA HELPERS (createEmployee, deleteEmployee, getFirstEmployeeId):
      MUST use this.page.request — they run at Node.js level, work before navigate(), bypass route mocks:
        // getFirstEmployeeId
        const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
        const res = await this.page.request.get(\`\${baseUrl}/api/employees\`);
        const data = await res.json();
        return data.data[0]._id as string;

        // createEmployee
        const res = await this.page.request.post(\`\${baseUrl}/api/employees\`, {
          data: fullPayload, headers: { 'Content-Type': 'application/json' },
        });
        const body = await res.json();
        return body._id as string;

        // deleteEmployee
        await this.page.request.delete(\`\${baseUrl}/api/employees/\${id}\`);

      Store baseUrl as: private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

   b. IN-TEST ASSERTION HELPERS (any method called AFTER navigate() to assert real app state):
      Use page.evaluate(fetch) so route mocks intercept them:
        const result = await this.page.evaluate(async ({ url, method, body }) => {
          const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined });
          const data = await res.json().catch(() => null);
          return { status: res.status, body: data };
        }, { url: '/api/employees', method: 'POST', body: payload });

   RULE: createEmployee/deleteEmployee/getFirstEmployeeId MUST use page.request (pattern a).
         NEVER use page.evaluate(fetch) for these three methods.

5. REQUIRED UI HELPER METHODS — always implement these in every module's POM:

   a. searchEmployees(query: string): Promise<void>  — REQUIRED IN EVERY MODULE
      ALL modules render at '/' which always has a search input.
      Tests use this after createEmployee() to ensure the new employee is on page 1.
      Implementation MUST wait for both the API response AND the loading indicator to hide:
        await this.page.waitForSelector(this.searchInput, { state: 'visible' });
        await Promise.all([
          this.page.waitForResponse(res => res.url().includes('/api/employees') && res.status() === 200),
          this.page.fill(this.searchInput, query),
        ]);
        // Wait for React to re-render after the API response arrives
        await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

   b. isEmployeeRowVisible(id: string): Promise<boolean>  — MUST use waitForSelector, not isVisible()
      isVisible() returns the instant DOM state which may be stale after a search.
      CORRECT implementation:
        try {
          await this.page.waitForSelector(\`[data-testid="employee-row-\${id}"]\`, { state: 'visible', timeout: 3000 });
          return true;
        } catch {
          return false;
        }
      NEVER use: return this.page.locator(\`[data-testid="employee-row-\${id}"]\`).isVisible();

   c. submitEmployeeForm() or similar submit methods — MUST wait for a response after clicking submit:
      After clicking submit, wait for either a validation error OR the success toast:
        await this.page.waitForSelector(this.submitBtn, { state: 'visible' });
        await this.page.click(this.submitBtn);
        // Wait for form to process — either show errors or success
        await Promise.race([
          this.page.waitForSelector('[data-testid$="-error"]', { state: 'visible', timeout: 5000 }),
          this.page.waitForSelector('[data-testid="success-toast"]', { state: 'visible', timeout: 5000 }),
          this.page.waitForSelector('[data-testid="drawer-error"]', { state: 'visible', timeout: 5000 }),
        ]).catch(() => {});

6. NAVIGATION
   - Always implement navigate() as the primary entry point — tests call this to open the app
   - Navigate only to '/' — the app has no other frontend routes

7. BREVITY — CRITICAL
   - The ENTIRE class file MUST be under 300 lines
   - Keep method bodies SHORT: 3–5 lines max per method
   - Use single-line locator returns: return this.page.locator(this.mySelector);
   - Do NOT add JSDoc comments or inline explanations
   - Combine similar actions (e.g. fill all form fields in one fillForm() method)

8. OUTPUT
   - Return ONLY the TypeScript class — no markdown fences, no imports other than Page from @playwright/test
   - TypeScript strict mode — no 'any' types
   - Start with: import { Page } from '@playwright/test';

${buildDataTestidReference(enhancedObs)}`,
    messages: [
      {
        role: "user",
        content: `Generate the ${pascal}Page class for module "${module}".

${enhancedObs ? generateBehaviorContext(enhancedObs, "ui") : ""}

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

  return response;
}

// ── Fixture Generator ───────────────────────────────────────────────────────

async function generateFixtures(
  module: string,
  cases: TestCase[],
  apiSpecs: Record<string, unknown>,
  enhancedObs: EnhancedAppStructure | null = null
): Promise<string> {
  const pascal = toPascalCase(module);

  const response = await llmGenerate({
    model: "claude-opus-4-6",
    temperature: 0,
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
   - MongoDB ObjectId _id MUST be EXACTLY 24 lowercase hex characters. Use this formula:
       \`665a\${(i + 1).toString(16).padStart(20, '0')}\`  // produces '665a00000000000000000001' (24 chars) ✓
     NEVER use padStart(2) or padStart(3) with a 23-char prefix — that produces 25-26 chars which fail ID validation.
   - Static IDs (e.g. newly created employee) must also be exactly 24 chars: '665a000000000000000ff001'
   - Include employees from multiple departments (Engineering, Product, Design, QA, HR) and statuses (Active, On Leave, Terminated)
   - Employee fields: _id, firstName, lastName, email, designation, department, employmentType ('Full-Time'|'Part-Time'|'Contract'|'Intern'), employmentStatus ('Active'|'On Leave'|'Terminated')
   - For the single-employee route (/api/employees/:id): validate that the ID is a 24-hex string; return 400 INVALID_ID if malformed, 404 if not found

4. LIST QUERY PARAMETERS — exact names the app sends:
   - page (number, default 1)
   - limit (number, default 20)
   - search (string — filter by firstName, lastName, email, designation substring match, case-insensitive)
   - department (string — exact match on department field)
   - status (string — exact match on employmentStatus field — param is "status" NOT "employmentStatus")

5. STATEFUL OPERATIONS — use a local Set inside the setup function (captured in route closure):
   - DELETE /api/employees/:id: track deleted IDs in a Set; second DELETE of same ID must return 404
   - POST /api/employees: track created emails; duplicate email must return 409 DUPLICATE_EMAIL
   - After DELETE, the deleted employee must not appear in GET list results
   - Validate POST required fields (firstName, lastName, email, designation, department, employmentType, employmentStatus, startDate, address with street/city/country); missing field → 400
   - Validate email format on POST and PATCH; invalid format → 400
   - POST returns 201; DELETE returns 204 with empty body (no JSON); PATCH returns 200

6. BREVITY — CRITICAL
   - The entire fixture file MUST be under 300 lines
   - Generate exactly ONE setup${pascal}Mocks(page: Page) function
   - Use the SIMPLEST mock that satisfies each endpoint — no per-test conditionals
   - Do NOT add helper functions beyond the single export
   - If the endpoints list is empty, OR if the module is a health/ping/status check (real server validation, not business logic), generate a no-op stub:
       export async function setup${pascal}Mocks(_page: Page): Promise<void> {}
     Never leave the function body incomplete or missing.

7. EXPORT
   - Export one named async function: setup${pascal}Mocks(page: Page): Promise<void>
   - TypeScript strict mode — no 'any'
   - Return ONLY TypeScript code, no markdown fences`,
    messages: [
      {
        role: "user",
        content: `Generate fixtures for module "${module}".

${enhancedObs ? generateBehaviorContext(enhancedObs, "fixture") : ""}

Endpoints needed (unique routes only):
${JSON.stringify(
  [...new Set(cases.flatMap((c) => (c.tags ?? []).filter((t: string) => t.startsWith("/"))))],
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

  return response;
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
  appStructure: AppStructure | null = null,
  enhancedObs: EnhancedAppStructure | null = null
): Promise<string> {
  const pascal = toPascalCase(module);
  const pomMethods = extractPomMethods(pomCode);

  const response = await llmGenerate({
    model: "claude-opus-4-6",
    temperature: 0,
    system: `You are a Playwright TypeScript expert writing UI test specifications.

RULES — follow every rule exactly:

1. IMPORTS (use exactly these, no others):
   import { test, expect } from '@playwright/test';
   import { ${pascal}Page } from '../pages/${module}.page';

2. TEST STRUCTURE
   - Top-level describe blocks:
       test.describe('${module} — UI Regression Suite', () => { ... })
       ${newFeatureCases.length > 0 ? `test.describe('${module} — UI New Feature', () => { ... })` : "// No new-feature cases — omit the UI New Feature describe block entirely"}
   - Within each, group by test type:
       test.describe('positive', () => { ... })
       test.describe('negative', () => { ... })
       test.describe('edge', () => { ... })
   - Always use test.describe() NOT describe() — Playwright doesn't expose describe as a global
   - IMPORTANT: If there are 0 new-feature cases, do NOT emit a '${module} — UI New Feature' describe block at all

3. EVERY TEST MUST:
   a. First line: const po = new ${pascal}Page(page);
   b. Second line: await po.navigate();   ← opens the live app at '/'
   c. Call POM methods only — NEVER call page.click/fill/goto/locator directly in a test
   d. End with clear expect() assertions using POM query methods
   e. Have a traceability comment above it: // TC-<id>  SCOPE:<caseScope>
   f. TEST DATA ISOLATION — strictly separate reads from writes:
      READ-ONLY tests (view list, search, filter, open drawer to view without editing):
        Use seeded data: const id = await po.getFirstEmployeeId(); — NEVER modify or delete this employee.
      WRITE tests (edit fields, delete, confirm deletion, submit updated form):
        ALWAYS create a dedicated employee: const id = await po.createEmployee({...});
        NEVER call getFirstEmployeeId() in a test that will modify or delete the employee.
        This prevents parallel tests from colliding on the same seeded record.
   g. Tests that CREATE an employee: ALWAYS call po.navigate() FIRST, THEN po.createEmployee({...}),
      then po.navigate() again to reload the list, then interact. Always clean up in a finally block.
      MANDATORY: After the second navigate(), ALWAYS call po.searchEmployees(firstName) to filter the list
      so the created employee is always on page 1 (the DB can have hundreds of employees).
      Then ALWAYS use isEmployeeRowVisible(id) ONLY AFTER searching — without a prior search, the row
      may be on page 2+ and isEmployeeRowVisible will return false even though the employee exists.
      Example pattern:
        const po = new ${pascal}Page(page);
        await po.navigate();
        const uniqueEmail = \`test.\${Date.now()}@test.com\`;
        const id = await po.createEmployee({ firstName: 'UITest', lastName: 'User', email: uniqueEmail,
          designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active',
          startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' } });
        try {
          await po.navigate();
          await po.searchEmployees('UITest');  // ← MANDATORY: filter so created employee is on page 1
          const rowVisible = await po.isEmployeeRowVisible(id);
          expect(rowVisible).toBe(true);       // ← now safe to check
          // ... test steps ...
        } finally {
          await po.deleteEmployee(id);
        }
   h. Tests that DELETE an employee must first create one using the pattern from rule (g).
      NEVER call getFirstEmployeeId() in a test that will delete the employee — use createEmployee() instead.
   i. After any action that triggers an API call (submit, delete, save), always call a POM wait method
      before asserting — e.g. waitForSuccessToast(), waitForConfirmDialogHidden(), waitForDrawerClose().
      NEVER assert immediately after a click without waiting for the async response first.
   j. NEVER hardcode specific employee names/emails from the live app inspection into test assertions.
      The live inspection data is for context only — hardcoded names break tests when DB state changes.
      Always use getFirstEmployeeId() to get a real ID dynamically, or createEmployee() with a unique email.
   k. DRAWER TITLE: The edit drawer title is "Personal Information" — it does NOT say "Edit Employee".
      NEVER assert drawerTitle.toLowerCase().toContain('edit') — it will always fail.
      To verify the edit drawer is open, check:
        (1) the drawer element is visible: await po.isDrawerVisible()  [check [data-testid="employee-drawer"]]
        (2) a pre-filled form field has the expected value: await po.getFirstNameValue()
      DO NOT assert on the drawer title text.
   l. SUCCESS TOAST: [data-testid="success-toast"] appears briefly after a successful form submission.
      Always wait at least 15000ms for it. Use:
        await this.page.waitForSelector('[data-testid="success-toast"]', { state: 'visible', timeout: 15000 });
      If waitForSuccessToast is a POM method, call it immediately after submit with no other actions in between.

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
   - For select options, use exact values: 'Engineering', 'Full-Time', 'Active', 'On Leave', 'Terminated'
   - STRICT CAPITALIZATION: 'Full-Time' NOT 'Full-time'; 'Part-Time' NOT 'Part-time' — wrong case causes 400 error
   - Never use empty strings as test input values
   - FORM DEFAULTS: These fields have default values and will NEVER show validation errors on empty form submit:
     * employmentStatus defaults to 'Active' (no empty placeholder in dropdown)
     * startDate defaults to today's date (HTML5 date input, always pre-filled)
     NEVER assert validation errors for employmentStatus or startDate on empty form submit — they always have values.
   - FILTER DEFAULTS: Department and status filter dropdowns start with an empty value meaning "show all".
     NEVER assert getDepartmentFilterValue() or getStatusFilterValue() to be truthy on page load — they are empty strings.
   - SEARCH TIMING: After calling searchEmployees(), ALWAYS wait for the loading indicator to disappear
     before counting rows or checking visibility. getEmployeeRowCount() and isEmployeeRowVisible() will
     return 0/false if called during loading.
   - For tests requiring a specific employee: call const id = await po.getFirstEmployeeId(); — NEVER hardcode IDs
   - For tests creating employees: use po.createEmployee({...}) — always call po.deleteEmployee(id) to clean up after
   - NEVER hardcode 24-char MongoDB ObjectIds in test expectations

7. NAVIGATION
   - Never navigate to invented routes — the app only has '/' as its frontend URL
   - Always start with po.navigate() — never call page.goto() directly in tests
   - NO page.route() mocks — tests run against the live app

8. TABLE BEHAVIOUR
   - Table columns are NOT sortable — do NOT write any test expecting column-sort behaviour
   - NEVER click a column header expecting sorted results — sorting is not implemented

9. OUTPUT
   - Return ONLY the TypeScript file contents — no markdown fences, no comments outside tests
   - TypeScript strict mode — no 'any'`,
    messages: [
      {
        role: "user",
        content: `Generate the complete UI spec for module "${module}".

${enhancedObs ? generateBehaviorContext(enhancedObs, "ui") : ""}

${appStructurePrompt(appStructure)}

AVAILABLE POM METHODS (use ONLY these exact signatures — do not invent new names):
${pomMethods.map((m) => `  po.${m}`).join("\n")}

REGRESSION CASES (${regressionCases.length}):
${JSON.stringify(regressionCases, null, 2)}

NEW-FEATURE CASES (${newFeatureCases.length}):
${JSON.stringify(newFeatureCases, null, 2)}

Write tests that clearly follow each test case's steps and assert the expected outcomes.
Every test starts with: const po = new ${pascal}Page(page); await po.navigate();
No fixtures — tests run against the live app.`,
      },
    ],
  });

  return response;
}

// ── API Spec Generator ──────────────────────────────────────────────────────

async function generateAPISpec(
  module: string,
  regressionCases: TestCase[],
  newFeatureCases: TestCase[],
  enhancedObs: EnhancedAppStructure | null = null
): Promise<string> {
  const pascal = toPascalCase(module);

  const response = await llmGenerate({
    model: "claude-opus-4-6",
    temperature: 0,
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
   - Top-level describe blocks:
       test.describe('${module} — API Regression Suite', () => { ... })
       ${newFeatureCases.length > 0 ? `test.describe('${module} — API New Feature', () => { ... })` : "// No new-feature cases — omit the API New Feature describe block entirely"}
   - Within each, group by test type:
       test.describe('positive', () => { ... })
       test.describe('negative', () => { ... })
       test.describe('edge', () => { ... })
   - Always use test.describe() NOT describe()
   - IMPORTANT: If there are 0 new-feature cases, do NOT emit a '${module} — API New Feature' describe block at all

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

6. LIST RESPONSE SHAPE — CRITICAL — read this carefully:
   The GET /api/employees response is: { data: Employee[], pagination: { total, page, limit, pages } }
   - The ARRAY is at r.body.data — NEVER treat r.body itself as an array
   - CORRECT:   const data = r.body.data as Record<string, unknown>[];
   - INCORRECT: const data = r.body as Record<string, unknown>[];   ← WRONG, r.body is an object
   - CORRECT:   const pagination = r.body.pagination as Record<string, unknown>;
   - Query param for page size is 'limit' NOT 'pageSize': /api/employees?page=1&limit=5
   - Status filter query param is 'status' NOT 'employmentStatus':
       CORRECT:   /api/employees?status=Active
       INCORRECT: /api/employees?employmentStatus=Active   ← WRONG, this param is ignored by the API

7. ASSERTIONS
   - Always assert: expect(r.status).toBe(expectedStatusCode);
   - For list responses: assert r.body.data (array) and r.body.pagination fields
   - For errors: expect(r.body.message || r.body.error).toBeTruthy();
   - Never toEqual on the whole body — check individual fields
   - NEVER assert r.headers — apiCall() only returns { status, body }, headers is undefined

8. TEST DATA — COMPLETE VALID PAYLOAD (ALL fields required for POST):
   { firstName: 'Test', lastName: 'User', email: \`test.\${Date.now()}@example.com\`,
     designation: 'Engineer', department: 'Engineering',
     employmentType: 'Full-Time', employmentStatus: 'Active',
     startDate: '2024-01-15',
     address: { street: '123 Test St', city: 'Test City', country: 'United States' } }
   NEVER use 'position', 'hireDate', 'status', 'jobTitle' — those fields do NOT exist.
   Required fields: firstName, lastName, email, designation, department, employmentType, employmentStatus, startDate (YYYY-MM-DD), address (object with required: street, city, country)
   For negative tests, deliberately omit ONE of these required fields or use wrong types.

9. APP BEHAVIOUR CONSTRAINTS
   - This API has NO authentication — do NOT write any test expecting 401 or 403
   - POST /api/employees returns 201 (not 200) on success
   - DELETE /api/employees/:id returns 204 (no body)
   - All endpoints are publicly accessible — no auth headers needed
   - Duplicate email check is CASE-INSENSITIVE — 'Test@email.com' and 'test@email.com' are treated as the SAME email and both return 409. Do NOT write tests expecting case-sensitive duplicate detection (i.e. do NOT expect uppercase variants to create new employees).
   - startDate accepts any string value — the backend does NOT validate date format. Do NOT write tests expecting 400 for invalid date formats like 'not-a-date'.
   - ROUTING CONSTRAINT: The frontend is a React SPA. Non-/api routes (e.g. /unknown, /foo/bar) all
     return 200 (nginx serves the SPA index.html). NEVER write a test expecting a non-/api URL to return 404.
     Only /api/* routes can return 404. Unknown routes WITHIN /api (e.g. /api/unknown) DO return 404.
   - HEALTH ENDPOINT: GET /api/health returns { status: 'ok', timestamp: string, services: { mongodb: 'connected' | string } }
     The mongodb field is NESTED under services — NOT at top level.
     Assert: expect(r.body.status).toBe('ok'); expect(r.body.services?.mongodb).toBeTruthy();
     NEVER assert r.body.mongodb — that field does NOT exist at top level.

10. TEST DATA ISOLATION — read vs write:
   READ-ONLY tests (GET list, GET single, filter, search): use seeded data — GET the list first and use data[0]._id.
   WRITE tests (PATCH, DELETE): create a dedicated employee via POST first, use its _id, then the test operates on that employee.
   Pattern for PATCH/DELETE tests:
     // Create dedicated employee
     const created = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'Edit', email: \`edit.\${Date.now()}@test.com\`, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-01', address: { street: '1 Test St', city: 'Test City', country: 'United States' } });
     const id = created.body._id as string;
     // ... test the PATCH or DELETE ...
     // Cleanup (only if not already deleted by the test):
     await apiCall(page, \`/api/employees/\${id}\`, 'DELETE');
   NEVER hardcode a 24-char ObjectId — always obtain IDs dynamically.
   For READ tests, extract the ID: const listR = await apiCall(page, '/api/employees', 'GET');
                                    const id = (listR.body.data as Record<string, unknown>[])[0]._id as string;

11. OUTPUT
   - Return ONLY the TypeScript file contents — no markdown fences, no prose
   - TypeScript strict mode — no 'any' — use Record<string, unknown> for untyped objects`,
    messages: [
      {
        role: "user",
        content: `Generate the complete API spec for module "${module}".

${enhancedObs ? generateBehaviorContext(enhancedObs, "api") : ""}

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

  return response;
}

// ── POM Extender ────────────────────────────────────────────────────────────

async function extendPOM(pomPath: string, newCases: TestCase[], module: string, enhancedObs: EnhancedAppStructure | null = null): Promise<void> {
  const existing = await fs.readFile(pomPath, "utf-8");
  const pascal = toPascalCase(module);

  const response = await llmGenerate({
    model: "claude-opus-4-6",
    temperature: 0,
    system: `You are a Playwright TypeScript expert extending a Page Object Model.

RULES:
- Preserve ALL existing selectors and methods exactly — do not modify or remove any
- Add new private readonly selector fields for any new data-testid elements
- Add new public async methods ONLY for actions not already covered by existing methods
- New methods must follow the same pattern: waitForSelector then action/query
- For createEmployee/deleteEmployee/getFirstEmployeeId: use page.request (works before navigate(), Node.js level)
- For in-test assertion API calls (after navigate()): use page.evaluate(fetch) so route mocks intercept
- NEVER change createEmployee/deleteEmployee/getFirstEmployeeId to use page.evaluate(fetch)
- TypeScript strict mode — no 'any'
- Return ONLY the complete updated TypeScript class, no markdown fences

${buildDataTestidReference(enhancedObs)}`,
    messages: [
      {
        role: "user",
        content: `Existing ${pascal}Page POM:
${existing}

${enhancedObs ? generateBehaviorContext(enhancedObs, "ui") : ""}

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
    postprocessPOM(response),
    `${module}.page extended`
  );
}

// ── UI Spec Merger ──────────────────────────────────────────────────────────

async function mergeUISpec(
  specPath: string,
  newCases: TestCase[],
  module: string,
  enhancedObs: EnhancedAppStructure | null = null
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
  const response = await llmGenerate({
    model: "claude-opus-4-6",
    temperature: 0,
    system: `You are a Playwright expert generating additional UI tests to append to an existing spec.

OUTPUT: Return ONLY a single test.describe() block containing the new tests.
Do NOT reproduce the existing file content — do NOT include imports or the POM class definition.
The file already has: import { test, expect }, import { ${pascal}Page }.
These tests run against the LIVE app — no fixtures or page.route() mocks.

FORMAT — return exactly this structure:
test.describe('${module} — UI Gap Cases', () => {
  test.describe('positive', () => { /* tests go here */ });
  test.describe('negative', () => { /* tests go here */ });
  test.describe('edge', () => { /* tests go here */ });
});

RULES for each test():
- Traceability comment above the test: // TC-<id>  SCOPE:<caseScope>
- First line: const po = new ${pascal}Page(page);
- Second line: await po.navigate();
- Use ONLY these POM methods (do not invent names):
  ${pomMethods.length > 0 ? pomMethods.map((m) => `po.${m}()`).join(", ") : "methods already in the spec file"}
- TEST DATA ISOLATION — read vs write:
    READ-ONLY tests (view list, search, filter, open drawer to view): use seeded data:
      const id = await po.getFirstEmployeeId();  // NEVER modify or delete this employee
    WRITE tests (edit, delete, confirm deletion): create a dedicated employee:
      const uniqueEmail = \`test.\${Date.now()}@test.com\`;
      const id = await po.createEmployee({ firstName: 'UITest', lastName: 'User', email: uniqueEmail, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' } });
      Always clean up: po.deleteEmployee(id) in a finally block.
      NEVER use getFirstEmployeeId() in a test that will edit or delete the employee.
    MANDATORY: After creating an employee and navigating, call po.searchEmployees('UITest') BEFORE
    calling isEmployeeRowVisible(id) or clicking its row by ID.
    Without searching, the employee may be on page 2+ and isEmployeeRowVisible will return false.
    Use firstName='UITest' so the search always finds exactly your created employee.
- isEmployeeRowVisible(id) ONLY works after po.searchEmployees() has been called — never check
  visibility of a freshly-created employee without searching first.
- DRAWER TITLE: The edit drawer title is "Personal Information" — NOT "Edit Employee".
  NEVER assert drawerTitle.toLowerCase().toContain('edit') — it will always fail.
  To verify edit drawer is open: check drawer visibility and form field values instead.
- SUCCESS TOAST: always call waitForSuccessToast() immediately after submit, with a timeout of ≥15000ms.
- NEVER hardcode specific employee names/emails in assertions — live app data changes between runs.
- Navigate only to '/' — the app has no other frontend routes
- NO page.route() mocks — tests hit the live running app
- TypeScript strict mode — no 'any'
- No markdown fences — raw TypeScript only
- STRICT CAPITALIZATION: use 'Full-Time' NOT 'Full-time'; 'Part-Time' NOT 'Part-time'
- Table columns are NOT sortable — NEVER write tests expecting sort behaviour on column header clicks
- FORM DEFAULTS: These fields have default values — NEVER assert their validation errors on empty form submit:
  * employmentStatus defaults to 'Active' (no empty placeholder in dropdown)
  * startDate defaults to today's date (HTML5 date input, always pre-filled)`,
    messages: [
      {
        role: "user",
        content: `${enhancedObs ? generateBehaviorContext(enhancedObs, "ui") + "\n\n" : ""}Generate test functions for these gap cases (${dedupedCases.length} cases):
${JSON.stringify(dedupedCases, null, 2)}`,
      },
    ],
  });

  let newBlock = extractTypeScriptCode(response);

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
  module: string,
  enhancedObs: EnhancedAppStructure | null = null
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
  const response = await llmGenerate({
    model: "claude-opus-4-6",
    temperature: 0,
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
- DELETE returns 204 (no body) — use: expect(r.status).toBe(204)
- ROUTING: Non-/api URLs (e.g. /unknown, /foo/bar) return 200 (SPA). Only /api/* can return 404.
  Never assert a non-/api route returns 404 — it always returns 200 (nginx SPA fallback).
- HEALTH: expect(r.body.status).toBe('ok') — lowercase. expect(r.body.services?.mongodb).toBeTruthy()
  NEVER use r.body.mongodb — mongodb is nested under services: { status, timestamp, services: { mongodb } }
- NEVER assert r.headers — apiCall() only returns { status, body }, headers is undefined
- Duplicate email check is CASE-INSENSITIVE — do NOT expect uppercase email variants to create new employees (they return 409)
- startDate accepts any string — do NOT test invalid date format rejection (backend does not validate format)

LIST RESPONSE SHAPE — CRITICAL:
  GET /api/employees returns: { data: Employee[], pagination: { total, page, limit, pages } }
  CORRECT:   const data = r.body.data as Record<string, unknown>[];   ← array is at .data
  INCORRECT: const data = r.body as Record<string, unknown>[];         ← WRONG, body is an object
  Query param for page size is 'limit' NOT 'pageSize': /api/employees?page=1&limit=5
  Default pagination limit is 20 (not 10) — GET /api/employees with no params returns up to 20 employees per page.

POST REQUIRED FIELDS — COMPLETE payload (ALL fields required):
  { firstName: 'Test', lastName: 'User', email: \`test.\${Date.now()}@example.com\`,
    designation: 'Engineer', department: 'Engineering',
    employmentType: 'Full-Time', employmentStatus: 'Active',
    startDate: '2024-01-15',
    address: { street: '123 Test St', city: 'Test City', country: 'United States' } }
  NEVER use 'position', 'hireDate', 'status', 'jobTitle' — those fields do NOT exist.
  ALL 10 fields above are required by the backend Zod schema — omitting any one returns 400 VALIDATION_ERROR.

TEST DATA ISOLATION: READ tests (GET) use seeded data — get ID from: (listR.body.data as Record<string, unknown>[])[0]._id
WRITE tests (PATCH/DELETE) must POST a fresh employee first, use its _id, then clean up.`,
    messages: [
      {
        role: "user",
        content: `${enhancedObs ? generateBehaviorContext(enhancedObs, "api") + "\n\n" : ""}Generate test functions for these gap cases (${dedupedCases.length} cases):
${JSON.stringify(dedupedCases, null, 2)}`,
      },
    ],
  });

  let newBlock = extractTypeScriptCode(response);

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

/**
 * Post-process a generated POM file to enforce two patterns the LLM reliably ignores:
 *   1. isEmployeeRowVisible — replace instantaneous isVisible() with a waitForSelector + try/catch
 *   2. searchEmployees — add loading-row hidden wait after the Promise.all
 */
function postprocessPOM(code: string): string {
  // Fix isEmployeeRowVisible: replace the entire method body with a correct waitForSelector version.
  // Uses a brace-balanced search to find the full method body (handles nested try/catch braces).
  const methodSig = "async isEmployeeRowVisible(id: string): Promise<boolean>";
  const sigIdx = code.indexOf(methodSig);
  if (sigIdx !== -1) {
    const braceStart = code.indexOf("{", sigIdx + methodSig.length);
    if (braceStart !== -1) {
      let depth = 0;
      let braceEnd = -1;
      for (let i = braceStart; i < code.length; i++) {
        if (code[i] === "{") depth++;
        else if (code[i] === "}") {
          depth--;
          if (depth === 0) { braceEnd = i; break; }
        }
      }
      if (braceEnd !== -1) {
        const replacement = `async isEmployeeRowVisible(id: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(\`[data-testid="employee-row-\${id}"]\`, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }`;
        code = code.slice(0, sigIdx) + replacement + code.slice(braceEnd + 1);
      }
    }
  }

  // Strip unused private readonly fields — the LLM declares selectors it never uses,
  // causing TS6133 errors ("declared but never read"). Scan for `this.fieldName` usage
  // and remove any private readonly line whose field is never referenced in a method body.
  const fieldDeclRe = /^(\s+)private\s+readonly\s+(\w+)\s*=\s*.*;\s*$/gm;
  const fieldsToCheck: Array<{ fullMatch: string; name: string }> = [];
  let fieldMatch: RegExpExecArray | null;
  while ((fieldMatch = fieldDeclRe.exec(code)) !== null) {
    fieldsToCheck.push({ fullMatch: fieldMatch[0], name: fieldMatch[2] });
  }
  for (const { fullMatch, name } of fieldsToCheck) {
    // Check if `this.<name>` appears anywhere OUTSIDE the declaration line
    const usageRe = new RegExp(`this\\.${name}[^=\\w]`, "g");
    const codeWithoutDecl = code.replace(fullMatch, "");
    if (!usageRe.test(codeWithoutDecl)) {
      code = code.replace(fullMatch + "\n", "");
    }
  }

  // Fix searchEmployees and clearSearch: replace Promise.all([waitForResponse, fill]) with a reliable
  // click+fill+loading-row pattern. The Promise.all/waitForResponse pattern is unreliable in Firefox
  // because React's debounce may not fire within actionTimeout.
  for (const methodName of ['searchEmployees', 'clearSearch']) {
    const isSearch = methodName === 'searchEmployees';
    code = code.replace(
      new RegExp(`async ${methodName}\\(([^)]*)\\): Promise<void>\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g'),
      (_fullMatch: string, param: string) => {
        const paramName = isSearch ? (param.trim().split(':')[0].trim() || 'query') : '';
        const fillArg = isSearch ? paramName : "''";
        return `async ${methodName}(${param}): Promise<void> {
    const searchLoc = this.page.locator(this.searchInput);
    await searchLoc.waitFor({ state: 'visible' });
    await searchLoc.click();
    await searchLoc.fill(${fillArg});
    await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }`;
      }
    );
  }

  // Fix filterBy*, reset*Filter, goToNextPage, goToPrevPage:
  // Strip unreliable Promise.all([waitForResponse, action]) — replace with action + loading-row wait.
  // This covers all list-triggering actions (selectOption for filters, click for pagination).
  code = code.replace(
    /await Promise\.all\(\[\s*\n\s*this\.page\.waitForResponse\([^)]*200\),\s*\n(\s*)(this\.page\.[^\n;]+;)\s*\n\s*\]\);(\s*\n\s*await this\.page\.locator\([^)]+\)\.waitFor\([^)]+\)\.catch\(\(\) => \{\}\);)?/g,
    (_m: string, indent: string, action: string) => {
      return `${action}\n${indent}await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});\n${indent}await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});`;
    }
  );

  return code;
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
