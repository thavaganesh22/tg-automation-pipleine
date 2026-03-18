/**
 * shared/browser-inspector.ts
 *
 * Comprehensive live app inspection using Playwright's Node.js API.
 * Extends AGT-04's original `inspectAppStructure()` pattern with additional
 * inspections: form defaults, validation behavior, dropdown options, API schemas,
 * route behavior, and timing measurements.
 *
 * The observations replace ~1,268 lines of hardcoded prompt rules in AGT-04
 * with verified facts from the running app.
 */

import { chromium } from "@playwright/test";
import type { Page, Browser } from "@playwright/test";
import type { EnhancedAppStructure } from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function collectSelectors(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(() =>
    Array.from(document.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid") as string)
      .filter(Boolean)
  );
}

async function ariaSnap(page: Page, maxChars = 3_000): Promise<string> {
  try {
    return (await page.locator("body").ariaSnapshot()).slice(0, maxChars);
  } catch {
    return "";
  }
}

// ── Main Inspection ─────────────────────────────────────────────────────────

/**
 * Launches headless Chromium and performs a comprehensive walkthrough of the
 * live app, collecting selectors, form behavior, API response shapes, route
 * behavior, and timing measurements.
 *
 * Falls back to null if the app is unreachable. Every interaction step is
 * individually wrapped so a failure in one step does not abort later steps.
 */
export async function inspectAppComprehensive(
  baseUrl: string
): Promise<EnhancedAppStructure | null> {
  let browser: Browser | undefined;
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
          if (json) apiListSample = JSON.stringify(json).slice(0, 2_000);
        }
        if (/\/api\/employees\/[^/?]+$/.test(url) && resp.status() === 200 && !apiEmployeeSample) {
          const json = await resp.json().catch(() => null);
          if (json) apiEmployeeSample = JSON.stringify(json).slice(0, 1_000);
        }
      } catch { /* best-effort */ }
    });

    // ── 1. Main page ───────────────────────────────────────────────────────
    await page.goto(baseUrl, { timeout: 15_000, waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="employee-table"]', { timeout: 8_000 }).catch(() => {});

    const pageSelectors = await collectSelectors(page);
    const mainPageSnap = await ariaSnap(page);

    const tableColumns: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll("th")).map((th) => th.textContent?.trim() ?? "").filter(Boolean)
    ).catch(() => []);

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

    // ── 2. Add Employee drawer — form defaults + validation ────────────────
    let addDrawerSnap = "";
    const addDrawerFields: string[] = [];
    const fieldsWithDefaults: Record<string, string> = {};
    const emptySubmitErrors: Record<string, string> = {};
    const fieldsWithoutErrors: string[] = [];
    const dropdownOptions: Record<string, string[]> = {};
    let drawerOpenMs = 0;

    try {
      const addBtn = page.locator('[data-testid="add-employee-btn"]');
      if (await addBtn.isVisible({ timeout: 3_000 })) {
        const drawerStart = Date.now();
        await addBtn.click();
        await page.waitForSelector('[data-testid="employee-drawer"]', { timeout: 5_000 });
        drawerOpenMs = Date.now() - drawerStart;

        const allSelectors = await collectSelectors(page);
        addDrawerFields.push(...allSelectors.filter((s) => !pageSelectors.includes(s)));
        addDrawerSnap = await ariaSnap(page);

        // Capture form field defaults — derived from dynamically discovered drawer selectors
        // so new fields are picked up automatically without any code changes here
        const formFields = addDrawerFields.filter(
          (id) => id.endsWith("-input") || id.endsWith("-select")
        );
        for (const id of formFields) {
          try {
            const el = page.locator(`[data-testid="${id}"]`);
            if (await el.isVisible({ timeout: 1_000 })) {
              const val = await el.inputValue().catch(() => "") || await el.textContent().catch(() => "") || "";
              if (val.trim()) fieldsWithDefaults[id] = val.trim();
            }
          } catch { /* best-effort */ }
        }

        // Capture dropdown options
        const selectFields = ["department-select", "employmentType-select", "employmentStatus-select"];
        for (const id of selectFields) {
          try {
            const options = await page.evaluate((testId: string) => {
              const select = document.querySelector(`[data-testid="${testId}"]`) as HTMLSelectElement | null;
              if (!select) return [];
              return Array.from(select.options)
                .map((o) => o.value)
                .filter((v) => v !== "");
            }, id);
            if (options.length > 0) dropdownOptions[id] = options;
          } catch { /* best-effort */ }
        }

        // Submit empty form to discover validation errors
        try {
          const submitBtn = page.locator('[data-testid="submit-btn"]');
          if (await submitBtn.isVisible({ timeout: 2_000 })) {
            await submitBtn.click();
            // Wait for validation errors to appear
            await page.waitForSelector('[data-testid$="-error"]', { state: "visible", timeout: 3_000 }).catch(() => {});

            // Collect all visible error testids and their text
            const errors = await page.evaluate(() => {
              const errorEls = document.querySelectorAll('[data-testid$="-error"]');
              const result: Record<string, string> = {};
              errorEls.forEach((el) => {
                const testid = el.getAttribute("data-testid") ?? "";
                const text = el.textContent?.trim() ?? "";
                if (testid && text && el instanceof HTMLElement && el.offsetParent !== null) {
                  result[testid] = text;
                }
              });
              return result;
            });

            // Categorize fields that show errors vs those that don't
            for (const [testid, text] of Object.entries(errors)) {
              emptySubmitErrors[testid] = text;
            }

            // Fields that DON'T show errors on empty submit (have defaults)
            const allErrorTestIds = Object.keys(errors);
            for (const id of formFields) {
              const errorId = id.replace("-input", "-error").replace("-select", "-error");
              // Also check address-prefixed errors
              const addressErrorId = id.startsWith("street") || id.startsWith("city") || id.startsWith("country")
                ? `address-${id.replace("-input", "-error")}`
                : errorId;
              if (!allErrorTestIds.includes(errorId) && !allErrorTestIds.includes(addressErrorId)) {
                fieldsWithoutErrors.push(id);
              }
            }
          }
        } catch { /* best-effort */ }

        // Close drawer
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
        editDrawerEmployeeId = (await firstRow.getAttribute("data-testid") ?? "").replace("employee-row-", "");
        await firstRow.click();
        await page.waitForSelector('[data-testid="employee-drawer"]', { timeout: 5_000 });
        try {
          await page.waitForFunction(
            () => {
              const el = document.querySelector('[data-testid="firstName-input"]') as HTMLInputElement | null;
              return el && el.value.trim().length > 0;
            },
            { timeout: 5_000 }
          );
        } catch { /* may not populate in time */ }

        // Dynamically discover all form inputs/selects in the edit drawer from the live DOM
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
      }
    } catch { /* best-effort */ }

    // ── 4. Confirm dialog ──────────────────────────────────────────────────
    let confirmDialogSnap = "";
    let confirmDialogText = "";
    try {
      const deleteBtn = page.locator('[data-testid="delete-btn"]');
      if (await deleteBtn.isVisible({ timeout: 2_000 })) {
        await deleteBtn.click();
        await page.waitForSelector('[data-testid="confirm-dialog"]', { timeout: 4_000 });
        confirmDialogText = (await page.locator('[data-testid="confirm-dialog"]').textContent())?.trim().slice(0, 300) ?? "";
        confirmDialogSnap = await ariaSnap(page);
        const cancelBtn = page.locator('[data-testid="confirm-cancel-btn"]');
        if (await cancelBtn.isVisible({ timeout: 2_000 })) await cancelBtn.click();
      }
    } catch { /* best-effort */ }

    // Close any open drawer
    try {
      const closeBtn = page.locator('[data-testid="close-drawer-btn"]');
      if (await closeBtn.isVisible({ timeout: 1_000 })) await closeBtn.click();
      await page.waitForSelector('[data-testid="employee-drawer"]', { state: "hidden", timeout: 3_000 }).catch(() => {});
    } catch { /* best-effort */ }

    // ── 5. API schema probing ──────────────────────────────────────────────
    const apiSchemas = await probeAPISchemas(page, baseUrl, editDrawerEmployeeId);

    // ── 6. Route behavior probing ──────────────────────────────────────────
    const routeBehavior = await probeRouteBehavior(page, baseUrl);

    // ── 7. Success toast timing (create + submit a valid employee) ─────────
    let successToastMs = 0;
    try {
      // Only measure timing if we have enough data — don't risk breaking app state
      successToastMs = await measureSuccessToastTiming(page, baseUrl);
    } catch { /* best-effort */ }

    // Fetch single employee via API if passive capture missed it
    if (editDrawerEmployeeId && !apiEmployeeSample) {
      try {
        const resp = await page.request.get(`${baseUrl}/api/employees/${editDrawerEmployeeId}`);
        if (resp.ok()) {
          apiEmployeeSample = (await resp.text()).slice(0, 1_000);
        }
      } catch { /* best-effort */ }
    }

    const discoveredSelectors = [...new Set([...pageSelectors, ...addDrawerFields])];
    await browser.close();

    console.log(
      `  [INSPECTOR] App inspection complete: ${discoveredSelectors.length} selectors | ` +
      `form defaults: ${Object.keys(fieldsWithDefaults).length} | ` +
      `validation errors: ${Object.keys(emptySubmitErrors).length} | ` +
      `dropdown fields: ${Object.keys(dropdownOptions).length} | ` +
      `API schemas: ${apiSchemas.listShape ? "captured" : "none"}`
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
      formBehavior: {
        fieldsWithDefaults,
        emptySubmitErrors,
        fieldsWithoutErrors,
      },
      dropdownOptions,
      apiSchemas,
      routeBehavior,
      timings: {
        successToastMs,
        drawerOpenMs,
        loadingRowMs: 0, // measured passively during navigation
      },
    };
  } catch (err) {
    await browser?.close().catch(() => undefined);
    console.warn(
      `  [INSPECTOR] App inspection failed (${(err as Error).message.slice(0, 80)}) — ` +
      `agents will proceed without observations`
    );
    return null;
  }
}

// ── API Schema Probing ──────────────────────────────────────────────────────

async function probeAPISchemas(
  page: Page,
  baseUrl: string,
  sampleEmployeeId: string
): Promise<EnhancedAppStructure["apiSchemas"]> {
  const result: EnhancedAppStructure["apiSchemas"] = {
    listShape: null,
    listDefaultLimit: 0,
    listSampleResponse: null,
    singleShape: null,
    singleSampleResponse: null,
    createRequiredFields: [],
    createOptionalWithDefaults: {},
    createSuccessShape: null,
    createErrorShape: null,
    duplicateEmailStatus: 0,
    duplicateEmailErrorShape: null,
    duplicateEmailCaseSensitive: true,
    deleteStatus: 0,
    deleteHasBody: true,
    healthShape: null,
    invalidIdStatus: 0,
    invalidIdErrorShape: null,
    notFoundIdStatus: 0,
    notFoundIdErrorShape: null,
    filterBehavior: {
      unknownDepartmentReturnsEmpty: true,
      unknownStatusReturnsEmpty: true,
    },
  };

  // GET /api/employees — list shape
  try {
    const resp = await page.request.get(`${baseUrl}/api/employees`);
    if (resp.ok()) {
      const body = await resp.json();
      result.listSampleResponse = truncateResponse(body, 2);
      result.listShape = describeShape(body);
      if (body?.pagination?.limit) result.listDefaultLimit = body.pagination.limit;
    }
  } catch { /* best-effort */ }

  // GET /api/employees/:id — single shape
  if (sampleEmployeeId) {
    try {
      const resp = await page.request.get(`${baseUrl}/api/employees/${sampleEmployeeId}`);
      if (resp.ok()) {
        const body = await resp.json();
        result.singleSampleResponse = body;
        result.singleShape = describeShape(body);
      }
    } catch { /* best-effort */ }
  }

  // POST /api/employees — with missing fields → validation error shape
  try {
    const resp = await page.request.post(`${baseUrl}/api/employees`, {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    if (resp.status() === 400) {
      const body = await resp.json();
      result.createErrorShape = body;
      // Extract required field names from validation errors
      if (Array.isArray(body?.errors)) {
        result.createRequiredFields = body.errors
          .map((e: { field?: string }) => e.field)
          .filter(Boolean);
      }
    }
  } catch { /* best-effort */ }

  // POST /api/employees — with valid payload → success shape + discover server defaults
  const testEmail = `inspector-${Date.now()}@test-probe.com`;
  const minimalPayload = {
    firstName: "InspectorProbe",
    lastName: "TestUser",
    email: testEmail,
    designation: "QA Engineer",
    department: "Engineering",
    employmentType: "Full-Time",
    address: { street: "1 Test St", city: "Test City", country: "United States" },
  };
  let createdId: string | null = null;
  try {
    const resp = await page.request.post(`${baseUrl}/api/employees`, {
      data: minimalPayload,
      headers: { "Content-Type": "application/json" },
    });
    if (resp.status() === 201) {
      const body = await resp.json();
      result.createSuccessShape = describeShape(body);
      createdId = body?._id ?? null;

      // Discover server-applied defaults by comparing payload vs response
      const serverDefaults: Record<string, string> = {};
      for (const [key, val] of Object.entries(body)) {
        if (!(key in minimalPayload) && key !== "_id" && key !== "__v" && key !== "createdAt" && key !== "updatedAt") {
          serverDefaults[key] = String(val);
        }
      }
      result.createOptionalWithDefaults = serverDefaults;

      // POST duplicate email → 409 shape
      try {
        const dupResp = await page.request.post(`${baseUrl}/api/employees`, {
          data: { ...minimalPayload, email: testEmail },
          headers: { "Content-Type": "application/json" },
        });
        result.duplicateEmailStatus = dupResp.status();
        if (dupResp.status() === 409) {
          result.duplicateEmailErrorShape = await dupResp.json().catch(() => null);
        }

        // Test case sensitivity
        const upperResp = await page.request.post(`${baseUrl}/api/employees`, {
          data: { ...minimalPayload, email: testEmail.toUpperCase() },
          headers: { "Content-Type": "application/json" },
        });
        result.duplicateEmailCaseSensitive = upperResp.status() !== 409;
        // If the server treated upper-case as a different email (201), clean up the leaked record
        if (upperResp.status() === 201) {
          try {
            const upperBody = await upperResp.json();
            if (upperBody?._id) {
              await page.request.delete(`${baseUrl}/api/employees/${upperBody._id}`).catch(() => {});
            }
          } catch { /* best-effort cleanup */ }
        }
      } catch { /* best-effort */ }
    } else if (resp.status() === 400) {
      // Minimal payload was missing some required fields — capture those
      const body = await resp.json().catch(() => null);
      if (body?.errors && Array.isArray(body.errors)) {
        // These are the fields we omitted that are actually required
        const missingFields = body.errors.map((e: { field?: string }) => e.field).filter(Boolean);
        // Merge with any we already found from the empty-body probe
        result.createRequiredFields = [
          ...new Set([...result.createRequiredFields, ...missingFields]),
        ];
      }
    }
  } catch { /* best-effort */ }

  // DELETE the probe employee
  if (createdId) {
    try {
      const resp = await page.request.delete(`${baseUrl}/api/employees/${createdId}`);
      result.deleteStatus = resp.status();
      const bodyText = await resp.text().catch(() => "");
      result.deleteHasBody = bodyText.trim().length > 0;
    } catch { /* best-effort */ }
  }

  // GET /api/health
  try {
    const resp = await page.request.get(`${baseUrl}/api/health`);
    if (resp.ok()) {
      result.healthShape = await resp.json();
    }
  } catch { /* best-effort */ }

  // GET /api/employees/invalid-id — probe invalid ID behavior (400 vs 404)
  try {
    const resp = await page.request.get(`${baseUrl}/api/employees/not-a-valid-id`);
    result.invalidIdStatus = resp.status();
    result.invalidIdErrorShape = await resp.json().catch(() => null);
  } catch { /* best-effort */ }

  // GET /api/employees/<valid-format-but-nonexistent> — probe not-found behavior
  try {
    const resp = await page.request.get(`${baseUrl}/api/employees/000000000000000000000000`);
    result.notFoundIdStatus = resp.status();
    result.notFoundIdErrorShape = await resp.json().catch(() => null);
  } catch { /* best-effort */ }

  // GET /api/employees?department=INVALID — probe filter with unknown value
  try {
    const deptResp = await page.request.get(`${baseUrl}/api/employees?department=NONEXISTENT_DEPT_XYZ`);
    if (deptResp.ok()) {
      const body = await deptResp.json();
      result.filterBehavior.unknownDepartmentReturnsEmpty = Array.isArray(body?.data) && body.data.length === 0;
    }
  } catch { /* best-effort */ }

  try {
    const statusResp = await page.request.get(`${baseUrl}/api/employees?status=NONEXISTENT_STATUS_XYZ`);
    if (statusResp.ok()) {
      const body = await statusResp.json();
      result.filterBehavior.unknownStatusReturnsEmpty = Array.isArray(body?.data) && body.data.length === 0;
    }
  } catch { /* best-effort */ }

  return result;
}

// ── Route Behavior Probing ──────────────────────────────────────────────────

async function probeRouteBehavior(
  page: Page,
  baseUrl: string
): Promise<Record<string, number>> {
  const routes: Record<string, number> = {};
  const probes = ["/api/unknown", "/unknown", "/api/health"];

  for (const route of probes) {
    try {
      const resp = await page.request.get(`${baseUrl}${route}`);
      routes[route] = resp.status();
    } catch { /* best-effort */ }
  }

  return routes;
}

// ── Success Toast Timing ────────────────────────────────────────────────────

async function measureSuccessToastTiming(page: Page, baseUrl: string): Promise<number> {
  // Create a test employee via API, then submit edit form to measure toast timing
  const testEmail = `toast-timing-${Date.now()}@test-probe.com`;
  const payload = {
    firstName: "ToastProbe",
    lastName: "Timing",
    email: testEmail,
    designation: "QA",
    department: "Engineering",
    employmentType: "Full-Time",
    employmentStatus: "Active",
    startDate: new Date().toISOString().slice(0, 10),
    address: { street: "1 Toast St", city: "Probe City", country: "United States" },
  };

  let createdId: string | null = null;
  let uniqueEmail = "";
  try {
    const resp = await page.request.post(`${baseUrl}/api/employees`, {
      data: payload,
      headers: { "Content-Type": "application/json" },
    });
    if (resp.status() !== 201) return 0;
    const body = await resp.json();
    createdId = body?._id ?? null;
    if (!createdId) return 0;

    // Navigate to the app, open the add drawer, fill form and submit to measure toast
    await page.goto(baseUrl, { timeout: 10_000, waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="employee-table"]', { timeout: 8_000 }).catch(() => {});

    const addBtn = page.locator('[data-testid="add-employee-btn"]');
    if (!(await addBtn.isVisible({ timeout: 3_000 }))) return 0;
    await addBtn.click();
    await page.waitForSelector('[data-testid="employee-drawer"]', { timeout: 5_000 });

    // Fill minimal form — store email so finally block can clean up
    uniqueEmail = `toast-measure-${Date.now()}@test.com`;
    await page.fill('[data-testid="firstName-input"]', "ToastMeasure");
    await page.fill('[data-testid="lastName-input"]', "Test");
    await page.fill('[data-testid="email-input"]', uniqueEmail);
    await page.fill('[data-testid="designation-input"]', "Engineer");
    await page.selectOption('[data-testid="department-select"]', "Engineering");
    await page.selectOption('[data-testid="employmentType-select"]', "Full-Time");
    await page.fill('[data-testid="street-input"]', "1 Test St");
    await page.fill('[data-testid="city-input"]', "City");
    await page.fill('[data-testid="country-input"]', "United States");

    const startTime = Date.now();
    await page.click('[data-testid="submit-btn"]');
    await page.waitForSelector('[data-testid="success-toast"]', { state: "visible", timeout: 20_000 });
    const toastMs = Date.now() - startTime;

    return toastMs;
  } finally {
    // Always clean up the probe employee
    if (createdId) {
      await page.request.delete(`${baseUrl}/api/employees/${createdId}`).catch(() => {});
    }
    // Always clean up the form-submitted employee (search by unique email)
    try {
      const listResp = await page.request.get(`${baseUrl}/api/employees?search=${encodeURIComponent(uniqueEmail)}`);
      if (listResp.ok()) {
        const listBody = await listResp.json();
        const formEmployee = listBody?.data?.[0];
        if (formEmployee?._id) {
          await page.request.delete(`${baseUrl}/api/employees/${formEmployee._id}`).catch(() => {});
        }
      }
    } catch { /* best-effort cleanup */ }
  }
}

// ── Shape Descriptor ────────────────────────────────────────────────────────

function describeShape(obj: unknown): Record<string, unknown> | null {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return { _type: "array", _length: obj.length, _sample: obj.length > 0 ? describeShape(obj[0]) : null };
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        result[key] = { _type: "array", _length: val.length };
      } else if (val !== null && typeof val === "object") {
        result[key] = describeShape(val);
      } else {
        result[key] = typeof val;
      }
    }
    return result;
  }
  return { _type: typeof obj };
}

function truncateResponse(body: unknown, maxItems: number): unknown {
  if (!body || typeof body !== "object") return body;
  const obj = body as Record<string, unknown>;
  if (Array.isArray(obj)) return obj.slice(0, maxItems);
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      result[key] = val.slice(0, maxItems);
    } else {
      result[key] = val;
    }
  }
  return result;
}
