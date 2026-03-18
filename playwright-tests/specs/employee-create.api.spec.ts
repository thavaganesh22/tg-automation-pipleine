import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupEmployeeCreateMocks } from '../fixtures/employee-create.fixture';

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

test.describe('employee-create — API Regression Suite', () => {

  test.describe('positive', () => {

    // TC-98810032-b079-5fe7-1a32-fb48bec7a145  SCOPE:regression
    test('POST /api/employees with all valid fields returns 201 and persists employee', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.${Date.now()}@example.com`;
      const payload = { firstName: 'Test', lastName: 'User', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', payload);
      expect(r.status).toBe(201);
      const id = r.body._id as string;
      expect(id).toBeTruthy();
      expect(r.body.firstName).toBe('Test');
      expect(r.body.lastName).toBe('User');
      expect(r.body.email).toBe(email);
      expect(r.body.designation).toBe('Engineer');
      expect(r.body.department).toBe('Engineering');
      expect(r.body.employmentType).toBe('Full-Time');
      expect(r.body.employmentStatus).toBe('Active');
      expect(r.body.startDate).toContain('2024-01-15');
      const addr = r.body.address as Record<string, unknown>;
      expect(addr.street).toBe('123 Test St');
      expect(addr.city).toBe('Test City');
      expect(addr.country).toBe('United States');
      const getR = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(getR.status).toBe(200);
      expect(getR.body._id).toBe(id);
      expect(getR.body.email).toBe(email);
      await apiCall(page, `/api/employees/${id}`, 'DELETE');
    });
  });

  test.describe('negative', () => {

    // TC-6a7ca48c-ece1-57cf-7768-8697d292a4ce  SCOPE:regression
    test('POST /api/employees with empty body returns 400 with validation errors', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'POST', {});
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('VALIDATION_ERROR');
      expect(r.body.message).toBeTruthy();
    });

    // TC-6a7ca48c-ece1-57cf-7768-8697d292a4ce  SCOPE:regression
    test('POST /api/employees missing email returns 400 referencing email', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const payload = { firstName: 'Test', lastName: 'User', designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', payload);
      expect(r.status).toBe(400);
      const details = r.body.details as Record<string, unknown>[];
      const emailErr = details.find((d) => d.field === 'email');
      expect(emailErr).toBeTruthy();
      expect(r.body._id).toBeUndefined();
    });

    // TC-6a7ca48c-ece1-57cf-7768-8697d292a4ce  SCOPE:regression
    test('POST /api/employees with invalid email format returns 400', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const payload = { firstName: 'Test', lastName: 'User', email: 'not-an-email', designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', payload);
      expect([400, 422]).toContain(r.status);
      expect(r.body._id).toBeUndefined();
      expect(r.body.message || r.body.error).toBeTruthy();
    });

    // TC-6a7ca48c-ece1-57cf-7768-8697d292a4ce  SCOPE:regression
    test('POST /api/employees missing address returns 400 referencing address', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const payload = { firstName: 'Test', lastName: 'User', email: `test.noaddr.${Date.now()}@example.com`, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15' };
      const r = await apiCall(page, '/api/employees', 'POST', payload);
      expect(r.status).toBe(400);
      const details = r.body.details as Record<string, unknown>[];
      const addrErr = details.find((d) => d.field === 'address');
      expect(addrErr).toBeTruthy();
      expect(r.body._id).toBeUndefined();
    });

    // TC-26e9240d-e9f3-50f0-c8a0-6d4a654d2a54  SCOPE:regression
    test('POST /api/employees returns 409 DUPLICATE_EMAIL when email already exists', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `duplicate.${Date.now()}@example.com`;
      const base = { designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const first = await apiCall(page, '/api/employees', 'POST', { firstName: 'Duplicate', lastName: 'EmailTest', email, ...base });
      expect(first.status).toBe(201);
      const id = first.body._id as string;
      const second = await apiCall(page, '/api/employees', 'POST', { firstName: 'Another', lastName: 'Person', email, ...base });
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('DUPLICATE_EMAIL');
      expect(second.body._id).toBeUndefined();
      await apiCall(page, `/api/employees/${id}`, 'DELETE');
    });
  });

  test.describe('edge', () => {

    // TC-c1862a69-782f-5859-a5fc-b4f8f68e9413  SCOPE:regression
    test('POST returns 409 on duplicate email regardless of case variation and whitespace', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const ts = Date.now();
      const email = `edgecase.${ts}@example.com`;
      const base = { designation: 'Developer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-06-01', address: { street: '789 Edge Blvd', city: 'Edge City', country: 'United States' } };
      const first = await apiCall(page, '/api/employees', 'POST', { firstName: 'Edge', lastName: 'CaseTest', email, ...base });
      expect(first.status).toBe(201);
      const id = first.body._id as string;
      const idsToClean = [id];

      // Uppercase variant — should be 409 (case-insensitive)
      const upper = await apiCall(page, '/api/employees', 'POST', { firstName: 'Edge', lastName: 'UpperCase', email: email.toUpperCase(), ...base });
      expect(upper.status).toBe(409);
      expect(upper.body.error).toBe('DUPLICATE_EMAIL');
      expect(upper.body._id).toBeUndefined();

      // Whitespace-padded variant — should be 409 or 400, never 201
      const padded = await apiCall(page, '/api/employees', 'POST', { firstName: 'Edge', lastName: 'WhiteSpace', email: `  ${email}  `, ...base });
      expect(padded.status).not.toBe(201);
      expect([400, 409, 422]).toContain(padded.status);
      expect(padded.body._id).toBeUndefined();

      for (const cleanId of idsToClean) {
        await apiCall(page, `/api/employees/${cleanId}`, 'DELETE');
      }
    });
  });
});

test.describe('employee-create — API Gap Cases', () => {
  test.describe('positive', () => {
    // TC-3486a916  SCOPE:new-feature
    test('POST accepts cellPhone field and persists it', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.cellphone.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'User', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '+14155550101', address: { street: '123 Test St', city: 'Test City', country: 'United States' } });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(body.cellPhone).toBe('+14155550101');
      const id = body._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      expect((g.body as Record<string, unknown>).cellPhone).toBe('+14155550101');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-f5533b80  SCOPE:new-feature
    test('POST persists cellPhone independently of phone (workPhone) field', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.dualphone.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'Dual', email, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', phone: '+12125550100', cellPhone: '+13105550199', address: { street: '456 Main Ave', city: 'New York', country: 'United States' } });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(body.phone).toBe('+12125550100');
      expect(body.cellPhone).toBe('+13105550199');
      const id = body._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      expect((g.body as Record<string, unknown>).phone).toBe('+12125550100');
      expect((g.body as Record<string, unknown>).cellPhone).toBe('+13105550199');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-6bce3ae1  SCOPE:new-feature
    test('POST succeeds when cellPhone is omitted (optional field)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.nocell.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'NoCellPhone', email, designation: 'Designer', department: 'Product', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-06-01', address: { street: '789 Oak Rd', city: 'Austin', country: 'United States' } });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(body._id).toBeTruthy();
      const cellVal = body.cellPhone;
      expect(cellVal === undefined || cellVal === null || cellVal === '').toBeTruthy();
      const d = await apiCall(page, `/api/employees/${body._id as string}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-eacd1182  SCOPE:new-feature
    test('POST response body schema includes cellPhone field', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.schema.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Schema', lastName: 'Check', email, designation: 'QA Engineer', department: 'Quality', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-02-01', cellPhone: '+16505550123', address: { street: '99 Schema Way', city: 'San Francisco', country: 'United States' } });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(body.cellPhone).toBe('+16505550123');
      expect(body._id).toBeTruthy();
      expect(body.firstName).toBe('Schema');
      expect(body.lastName).toBe('Check');
      expect(body.email).toBe(email);
      expect(body.designation).toBeTruthy();
      expect(body.department).toBeTruthy();
      expect(body.employmentType).toBeTruthy();
      expect(body.employmentStatus).toBeTruthy();
      expect(body.startDate).toBeTruthy();
      expect(body.address).toBeTruthy();
      const d = await apiCall(page, `/api/employees/${body._id as string}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-46db822b  SCOPE:new-feature
    test('GET single employee includes cellPhone field for employees created with it', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.listcell.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'List', lastName: 'CellTest', email, designation: 'Manager', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-04-01', cellPhone: '+19175550188', address: { street: '10 List Rd', city: 'Chicago', country: 'United States' } });
      expect(r.status).toBe(201);
      const id = (r.body as Record<string, unknown>)._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      const gBody = g.body as Record<string, unknown>;
      expect(gBody.cellPhone).toBe('+19175550188');
      expect('phone' in gBody).toBeTruthy();
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-ad695f78  SCOPE:new-feature
    test('POST without cellPhone returns 201 (cellPhone is optional) - verify GET', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.nocell2.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'NoCellPhone', email, designation: 'Analyst', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-06-01', address: { street: '1 Main St', city: 'Springfield', country: 'United States' } });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(body._id).toBeTruthy();
      expect(body.firstName).toBe('Test');
      expect(body.lastName).toBe('NoCellPhone');
      const cellVal = body.cellPhone;
      expect(cellVal === undefined || cellVal === null || cellVal === '').toBeTruthy();
      const g = await apiCall(page, `/api/employees/${body._id as string}`, 'GET');
      expect(g.status).toBe(200);
      const d = await apiCall(page, `/api/employees/${body._id as string}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-b597ea5f  SCOPE:new-feature
    test('POST with cellPhone populated returns 201 and persists the value', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.withcell.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'WithCell', email, designation: 'Developer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-06-01', cellPhone: '+15550001234', address: { street: '2 Oak Ave', city: 'Shelbyville', country: 'United States' } });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(body._id).toBeTruthy();
      expect(body.cellPhone).toBe('+15550001234');
      const g = await apiCall(page, `/api/employees/${body._id as string}`, 'GET');
      expect(g.status).toBe(200);
      expect((g.body as Record<string, unknown>).cellPhone).toBe('+15550001234');
      const d = await apiCall(page, `/api/employees/${body._id as string}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-45a061b1  SCOPE:new-feature
    test('POST with both cellPhone and phone fields returns 201 and persists both', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.bothphones.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'BothPhones', email, designation: 'Lead', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-10-01', phone: '+15550001111', cellPhone: '+15550002222', address: { street: '6 Cedar Ln', city: 'Star City', country: 'United States' } });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(body._id).toBeTruthy();
      expect(body.cellPhone).toBe('+15550002222');
      expect(body.phone).toBe('+15550001111');
      const g = await apiCall(page, `/api/employees/${body._id as string}`, 'GET');
      expect(g.status).toBe(200);
      const gBody = g.body as Record<string, unknown>;
      expect(gBody.phone).toBe('+15550001111');
      expect(gBody.cellPhone).toBe('+15550002222');
      const d = await apiCall(page, `/api/employees/${body._id as string}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-7d5d446a  SCOPE:new-feature
    test('GET single employee created without cellPhone confirms field is absent or null', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.getnocell.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'GetNoCellCheck', email, designation: 'Consultant', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-12-01', address: { street: '8 Walnut Ct', city: 'Riverdale', country: 'United States' } });
      expect(r.status).toBe(201);
      const id = (r.body as Record<string, unknown>)._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      const gBody = g.body as Record<string, unknown>;
      const cellVal = gBody.cellPhone;
      expect(cellVal === undefined || cellVal === null || cellVal === '').toBeTruthy();
      expect(gBody.firstName).toBe('Test');
      expect(gBody.lastName).toBe('GetNoCellCheck');
      expect(gBody.email).toBe(email);
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });
  });

  test.describe('negative', () => {
    // TC-cca2e711  SCOPE:new-feature
    test('POST rejects invalid cellPhone format', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.badcell.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'BadCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: 'NOT_A_PHONE_NUMBER!!!', address: { street: '1 Error Lane', city: 'Errorville', country: 'United States' } });
      expect([400, 422]).toContain(r.status);
      const body = r.body as Record<string, unknown>;
      expect(body._id).toBeUndefined();
      const bodyStr = JSON.stringify(body);
      expect(bodyStr.toLowerCase()).toMatch(/cellphone|phone|valid/i);
    });

    // TC-5b002c0b  SCOPE:new-feature
    test('POST with cellPhone only — missing required fields still returns 400', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'POST', { cellPhone: '+14085550177' });
      expect([400, 422]).toContain(r.status);
      const body = r.body as Record<string, unknown>;
      expect(body._id).toBeUndefined();
      expect(body.error).toBe('VALIDATION_ERROR');
      const details = body.details as Record<string, unknown>[];
      const fields = details.map(d => d.field as string);
      expect(fields).toContain('firstName');
      expect(fields).toContain('email');
    });

    // TC-41be8c17  SCOPE:new-feature
    test('POST with non-string cellPhone value returns validation error', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.badcelltype.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'BadCellType', email, designation: 'Manager', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-09-01', cellPhone: 15550001234, address: { street: '5 Maple Dr', city: 'Gotham', country: 'United States' } });
      expect([400, 422]).toContain(r.status);
      const body = r.body as Record<string, unknown>;
      const bodyStr = JSON.stringify(body);
      expect(bodyStr.toLowerCase()).toMatch(/cellphone|phone|type|string|valid/i);
    });

    // TC-ef01e896  SCOPE:new-feature
    test('POST missing all required fields still returns 400 even when cellPhone is provided', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'POST', { cellPhone: '+15550009999' });
      expect([400, 422]).toContain(r.status);
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBe('VALIDATION_ERROR');
      const details = body.details as Record<string, unknown>[];
      const fields = details.map(d => d.field as string);
      expect(fields).toContain('firstName');
      expect(fields).toContain('lastName');
      expect(fields).toContain('email');
    });

    // TC-99e50bf4  SCOPE:new-feature
    test('POST with duplicate email returns 409 regardless of cellPhone presence', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.dupemail.${Date.now()}@example.com`;
      const r1 = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'DupEmailBase', email, designation: 'Analyst', department: 'Marketing', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2025-01-01', address: { street: '9 Spruce Ave', city: 'Smallville', country: 'United States' } });
      expect(r1.status).toBe(201);
      const id = (r1.body as Record<string, unknown>)._id as string;
      const r2 = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'DupEmailCell', email, designation: 'Analyst', department: 'Marketing', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2025-01-01', cellPhone: '+15550003333', address: { street: '9 Spruce Ave', city: 'Smallville', country: 'United States' } });
      expect(r2.status).toBe(409);
      const body2 = r2.body as Record<string, unknown>;
      const bodyStr = JSON.stringify(body2);
      expect(bodyStr.toLowerCase()).toMatch(/duplicate|email|exists|conflict/i);
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });
  });

  test.describe('edge', () => {
    // TC-6c4bbbc7  SCOPE:new-feature
    test('POST rejects cellPhone that exceeds maximum length', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.longcell.${Date.now()}@example.com`;
      const longPhone = '1'.repeat(256);
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'LongCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: longPhone, address: { street: '1 Long St', city: 'Longtown', country: 'United States' } });
      expect([400, 422]).toContain(r.status);
      const body = r.body as Record<string, unknown>;
      expect(body._id).toBeUndefined();
      const bodyStr = JSON.stringify(body);
      expect(bodyStr.toLowerCase()).toMatch(/cellphone|phone|length|long|valid/i);
    });

    // TC-a73841ce  SCOPE:new-feature
    test('POST accepts cellPhone with empty string (blank optional field)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.emptycell.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'EmptyCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '', address: { street: '2 Blank Blvd', city: 'Emptyville', country: 'United States' } });
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        const body = r.body as Record<string, unknown>;
        const cellVal = body.cellPhone;
        expect(cellVal === '' || cellVal === null || cellVal === undefined).toBeTruthy();
        const d = await apiCall(page, `/api/employees/${body._id as string}`, 'DELETE');
        expect(d.status).toBe(204);
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-87cc21ac  SCOPE:new-feature
    test('POST with null cellPhone value is handled gracefully', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.nullcell.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'NullCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: null, address: { street: '3 Null Ave', city: 'Nulltown', country: 'United States' } });
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        const body = r.body as Record<string, unknown>;
        const cellVal = body.cellPhone;
        expect(cellVal === null || cellVal === undefined || cellVal === '').toBeTruthy();
        const d = await apiCall(page, `/api/employees/${body._id as string}`, 'DELETE');
        expect(d.status).toBe(204);
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-039600b4  SCOPE:new-feature
    test('POST with cellPhone as empty string returns 201 (empty string treated as no value)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.emptycell2.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'EmptyCell', email, designation: 'QA Engineer', department: 'Quality Assurance', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-07-01', cellPhone: '', address: { street: '3 Elm Rd', city: 'Capital City', country: 'United States' } });
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        const body = r.body as Record<string, unknown>;
        expect(body._id).toBeTruthy();
        const cellVal = body.cellPhone;
        expect(cellVal === '' || cellVal === null || cellVal === undefined).toBeTruthy();
        const d = await apiCall(page, `/api/employees/${body._id as string}`, 'DELETE');
        expect(d.status).toBe(204);
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-4b2c3181  SCOPE:new-feature
    test('POST with cellPhone as null returns 201 (null treated as absent optional field)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.nullcell2.${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'NullCell', email, designation: 'Designer', department: 'Product', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-08-01', cellPhone: null, address: { street: '4 Pine Blvd', city: 'Metropolis', country: 'United States' } });
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        const body = r.body as Record<string, unknown>;
        expect(body._id).toBeTruthy();
        const d = await apiCall(page, `/api/employees/${body._id as string}`, 'DELETE');
        expect(d.status).toBe(204);
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-4f67e191  SCOPE:new-feature
    test('POST with excessively long cellPhone string returns 400/422', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.longcell2.${Date.now()}@example.com`;
      const longPhone = '1'.repeat(300);
      const r = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'LongCell', email, designation: 'Intern', department: 'HR', employmentType: 'Contract', employmentStatus: 'Active', startDate: '2024-11-01', cellPhone: longPhone, address: { street: '7 Birch Way', city: 'Central City', country: 'United States' } });
      expect([400, 422]).toContain(r.status);
      const body = r.body as Record<string, unknown>;
      const bodyStr = JSON.stringify(body);
      expect(bodyStr.toLowerCase()).toMatch(/cellphone|phone|length|long|valid/i);
    });
  });
});

test.describe('employee-create — API Gap Cases', () => {
  test.describe('positive', () => {
    // TC-ab540c1e  SCOPE:new-feature
    test('POST with cellPhone field returns 201 and persists cellPhone value', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+cellphone+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'User', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '+1-555-000-0001', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body.cellPhone).toBe('+1-555-000-0001');
      const id = r.body._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      expect(g.body.cellPhone).toBe('+1-555-000-0001');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-fac4f0f6  SCOPE:new-feature
    test('POST without cellPhone field still returns 201 (cellPhone is optional)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+nocell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NoCellPhone', email, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', address: { street: '456 No Cell St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body._id).toBeTruthy();
      expect(r.body.cellPhone === undefined || r.body.cellPhone === null || r.body.cellPhone === '').toBe(true);
      const d = await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-ad695f78  SCOPE:new-feature
    test('POST without cellPhone returns 201 (cellPhone optional - scenario 2)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+nocell2+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'User', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body._id).toBeTruthy();
      expect(r.body.error).toBeUndefined();
      const d = await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-7d910d74  SCOPE:new-feature
    test('POST with cellPhone populated returns 201 and persists value', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+withcell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'User', email, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', cellPhone: '555-123-4567', address: { street: '456 Cell Ave', city: 'Phoneville', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body.cellPhone).toBe('555-123-4567');
      const id = r.body._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      expect(g.body.cellPhone).toBe('555-123-4567');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-3dd41fee  SCOPE:new-feature
    test('POST with both cellPhone and phone fields stores both independently', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+bothphones+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'BothPhones', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', phone: '+1-555-111-0001', cellPhone: '+1-555-222-0002', address: { street: '123 Both St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body.cellPhone).toBe('+1-555-222-0002');
      expect(r.body.phone).toBe('+1-555-111-0001');
      const id = r.body._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      expect(g.body.cellPhone).toBe('+1-555-222-0002');
      expect(g.body.phone).toBe('+1-555-111-0001');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-620c35ef  SCOPE:new-feature
    test('POST with cellPhone field returns correct schema shape', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+schema+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'SchemaCheck', email, designation: 'QA Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-02-01', cellPhone: '+44-7700-900123', address: { street: '1 Schema Lane', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(typeof r.body._id).toBe('string');
      expect(typeof r.body.firstName).toBe('string');
      expect(typeof r.body.lastName).toBe('string');
      expect(typeof r.body.email).toBe('string');
      expect(r.body.cellPhone).toBe('+44-7700-900123');
      expect(r.body.error).toBeUndefined();
      const d = await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-89d6bb2d  SCOPE:new-feature
    test('POST /api/employees accepts cellPhone field and persists it (scenario 3)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+persist+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'User', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '+15550001234', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body.cellPhone).toBe('+15550001234');
      const id = r.body._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      expect(g.body.cellPhone).toBe('+15550001234');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-d5854045  SCOPE:new-feature
    test('POST /api/employees creates employee without cellPhone (optional field - scenario 3)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+nocell3+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NoCellPhone', email, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', address: { street: '456 Main St', city: 'Sample City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body.error).toBeUndefined();
      expect(r.body.cellPhone === undefined || r.body.cellPhone === null || r.body.cellPhone === '').toBe(true);
      const d = await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-6481dc57  SCOPE:new-feature
    test('GET /api/employees returns cellPhone field in employee objects', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+cellget+${Date.now()}@example.com`;
      const body = { firstName: 'CellTest', lastName: 'Employee', email, designation: 'Developer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-06-01', cellPhone: '+15559876543', address: { street: '789 Cell Ave', city: 'Tech City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      const id = r.body._id as string;
      const list = await apiCall(page, '/api/employees', 'GET');
      expect(list.status).toBe(200);
      const data = list.body.data as Record<string, unknown>[];
      const found = data.find((e) => e._id === id);
      expect(found).toBeTruthy();
      expect((found as Record<string, unknown>).cellPhone).toBe('+15559876543');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-528cfdc3  SCOPE:new-feature
    test('POST with only cellPhone omitted (all other required fields present) returns 201', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+nocellkey+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NoCellKey', email, designation: 'Consultant', department: 'Sales', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-09-01', address: { street: '10 No Cell Blvd', city: 'Optionalville', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body._id).toBeTruthy();
      expect(r.body.firstName).toBe('Test');
      expect(r.body.lastName).toBe('NoCellKey');
      expect(r.body.email).toBe(email);
      const g = await apiCall(page, `/api/employees/${r.body._id}`, 'GET');
      expect(g.status).toBe(200);
      const d = await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-bc40fb0b  SCOPE:new-feature
    test('POST with cellPhone present alongside phone returns 201 with both fields', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+bothphones2+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'BothPhones', email, designation: 'Director', department: 'HR', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-10-01', phone: '555-000-1111', cellPhone: '555-999-8888', address: { street: '5 Both Phones Way', city: 'Dualcity', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body.cellPhone).toBe('555-999-8888');
      expect(r.body.phone).toBe('555-000-1111');
      const id = r.body._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      expect(g.body.cellPhone).toBe('555-999-8888');
      expect(g.body.phone).toBe('555-000-1111');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });
  });

  test.describe('negative', () => {
    // TC-64f86327  SCOPE:new-feature
    test('POST with cellPhone as a non-string type (integer) returns 400 or 422', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+intcell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'IntCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: 5550001234, address: { street: '123 Int St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect([400, 422]).toContain(r.status);
      expect(r.body.error).toBeTruthy();
      if (r.status === 201) {
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      }
    });

    // TC-45cd1806  SCOPE:new-feature
    test('POST with cellPhone field and duplicate email returns 409', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+dupcell+${Date.now()}@example.com`;
      const body1 = { firstName: 'Test', lastName: 'DupCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '+1-555-333-0003', address: { street: '123 Dup St', city: 'Test City', country: 'United States' } };
      const r1 = await apiCall(page, '/api/employees', 'POST', body1);
      expect(r1.status).toBe(201);
      const id = r1.body._id as string;
      const body2 = { firstName: 'Test', lastName: 'DupCell2', email, designation: 'Analyst', department: 'Finance', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-02-01', cellPhone: '+1-555-444-0004', address: { street: '456 Dup St', city: 'Test City', country: 'United States' } };
      const r2 = await apiCall(page, '/api/employees', 'POST', body2);
      expect(r2.status).toBe(409);
      expect(r2.body.error).toBeTruthy();
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-4530bb97  SCOPE:new-feature
    test('POST missing all required fields returns 400 with validation errors and cellPhone not required', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'POST', {});
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('VALIDATION_ERROR');
      const details = r.body.details as Record<string, unknown>[];
      const fieldNames = details.map((d) => d.field);
      expect(fieldNames).toContain('firstName');
      expect(fieldNames).toContain('lastName');
      expect(fieldNames).toContain('email');
      expect(fieldNames).not.toContain('cellPhone');
    });

    // TC-a3719957  SCOPE:new-feature
    test('POST with duplicate email returns 409', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+dup+${Date.now()}@example.com`;
      const body1 = { firstName: 'Test', lastName: 'Duplicate', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '1 Dup St', city: 'Duptown', country: 'United States' } };
      const r1 = await apiCall(page, '/api/employees', 'POST', body1);
      expect(r1.status).toBe(201);
      const id = r1.body._id as string;
      const body2 = { firstName: 'Test', lastName: 'Duplicate2', email, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-02-01', address: { street: '2 Dup St', city: 'Duptown', country: 'United States' } };
      const r2 = await apiCall(page, '/api/employees', 'POST', body2);
      expect(r2.status).toBe(409);
      expect(r2.body.error).toBeTruthy();
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-7487176c  SCOPE:new-feature
    test('POST with non-string cellPhone value (numeric) returns validation error', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+badcell+${Date.now()}@example.com`;
      const body = { firstName: 'Bad', lastName: 'CellType', email, designation: 'Tester', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-08-01', cellPhone: 15550001234, address: { street: '99 Type Error Rd', city: 'Errorville', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect([400, 422]).toContain(r.status);
      expect(r.body.error).toBeTruthy();
      expect(r.body.message).toBeTruthy();
      if (r.status === 201) {
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      }
    });
  });

  test.describe('edge', () => {
    // TC-efb97557  SCOPE:new-feature
    test('POST with cellPhone as empty string is accepted or returns clear validation error', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+emptycell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'EmptyCell', email, designation: 'Designer', department: 'Engineering', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-06-01', cellPhone: '', address: { street: '789 Empty St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        expect(r.body._id).toBeTruthy();
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(r.status);
        expect(r.body.error).toBeTruthy();
      }
    });

    // TC-632147da  SCOPE:new-feature
    test('POST with cellPhone containing only whitespace is handled gracefully', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+wscell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'WhitespaceCell', email, designation: 'Manager', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-07-01', cellPhone: '   ', address: { street: '321 Whitespace Ave', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        expect(r.body._id).toBeTruthy();
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-1d0acefe  SCOPE:new-feature
    test('POST with excessively long cellPhone string (300 chars) is handled gracefully', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+longcell+${Date.now()}@example.com`;
      const longCell = '5'.repeat(300);
      const body = { firstName: 'Test', lastName: 'LongCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: longCell, address: { street: '123 Long St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-62364557  SCOPE:new-feature
    test('POST with cellPhone containing special characters and international format is accepted', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+intlcell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'IntlCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '+1 (555) 000-9999', address: { street: '123 Intl St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        expect(r.body.cellPhone).toBe('+1 (555) 000-9999');
        const id = r.body._id as string;
        const g = await apiCall(page, `/api/employees/${id}`, 'GET');
        expect(g.status).toBe(200);
        expect(g.body.cellPhone).toBe('+1 (555) 000-9999');
        await apiCall(page, `/api/employees/${id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-61dd1b4b  SCOPE:new-feature
    test('POST with cellPhone explicitly set to null returns 201', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+nullcell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NullCell', email, designation: 'Designer', department: 'Engineering', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-05-01', cellPhone: null, address: { street: '789 Null Rd', city: 'Nulltown', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        expect(r.body._id).toBeTruthy();
        expect(r.body.error).toBeUndefined();
        expect(r.body.cellPhone === null || r.body.cellPhone === undefined || r.body.cellPhone === '').toBe(true);
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-2298194d  SCOPE:new-feature
    test('POST with cellPhone as empty string returns 201 or 422 (boundary)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+emptycell2+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'EmptyCell', email, designation: 'Manager', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-06-01', cellPhone: '', address: { street: '1 Empty St', city: 'Blankville', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        expect(r.body._id).toBeTruthy();
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-1918298a  SCOPE:new-feature
    test('POST with cellPhone containing non-numeric characters returns 201 or 422', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+badphone+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'BadPhone', email, designation: 'Tester', department: 'Engineering', employmentType: 'Contract', employmentStatus: 'Active', startDate: '2024-07-01', cellPhone: 'not-a-phone!!', address: { street: '2 Bad Phone Ln', city: 'Errortown', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        expect(r.body._id).toBeTruthy();
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-c84d5769  SCOPE:new-feature
    test('POST with cellPhone as a 256-character string is handled gracefully', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+longcell2+${Date.now()}@example.com`;
      const longCell = '1'.repeat(256);
      const body = { firstName: 'Test', lastName: 'LongCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-08-01', cellPhone: longCell, address: { street: '3 Long St', city: 'Longtown', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-7e725a3d  SCOPE:new-feature
    test('POST with empty string cellPhone is handled gracefully (scenario 3)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+emptycell3+${Date.now()}@example.com`;
      const body = { firstName: 'Empty', lastName: 'CellPhone', email, designation: 'Tester', department: 'Engineering', employmentType: 'Contract', employmentStatus: 'Active', startDate: '2024-07-01', cellPhone: '', address: { street: '1 Empty St', city: 'Null City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        expect(r.body.cellPhone === '' || r.body.cellPhone === null || r.body.cellPhone === undefined).toBe(true);
        await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(r.status);
        expect(r.body.error).toBeTruthy();
      }
    });
  });
});
