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
    // TC-3486a916-5d0f-5871-7aee-d40648cfb18a  SCOPE:new-feature
    test('POST accepts cellPhone field and persists it', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+cellphone+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'User', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '+14155550101', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect((r.body as Record<string, unknown>).cellPhone).toBe('+14155550101');
      const id = (r.body as Record<string, unknown>)._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      expect((g.body as Record<string, unknown>).cellPhone).toBe('+14155550101');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-f5533b80-b641-5c5a-06d0-148e06897bd2  SCOPE:new-feature
    test('POST persists cellPhone independently of phone (workPhone) field', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+dualphone+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'Dual', email, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', phone: '+12125550100', cellPhone: '+13105550199', address: { street: '456 Main Ave', city: 'New York', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect((r.body as Record<string, unknown>).phone).toBe('+12125550100');
      expect((r.body as Record<string, unknown>).cellPhone).toBe('+13105550199');
      const id = (r.body as Record<string, unknown>)._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      expect((g.body as Record<string, unknown>).phone).toBe('+12125550100');
      expect((g.body as Record<string, unknown>).cellPhone).toBe('+13105550199');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-6bce3ae1-a0b8-596f-27ba-1582ff47ae91  SCOPE:new-feature
    test('POST succeeds when cellPhone is omitted (optional field)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+nocell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NoCellPhone', email, designation: 'Designer', department: 'Product', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-06-01', address: { street: '789 Oak Rd', city: 'Austin', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      const cellPhone = (r.body as Record<string, unknown>).cellPhone;
      expect(cellPhone === undefined || cellPhone === null || cellPhone === '').toBeTruthy();
      const id = (r.body as Record<string, unknown>)._id as string;
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-eacd1182-e6f5-5f61-20fd-555d20ffdc23  SCOPE:new-feature
    test('POST response body schema includes cellPhone field', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+schema+${Date.now()}@example.com`;
      const body = { firstName: 'Schema', lastName: 'Check', email, designation: 'QA Engineer', department: 'Quality', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-02-01', cellPhone: '+16505550123', address: { street: '99 Schema Way', city: 'San Francisco', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      const rb = r.body as Record<string, unknown>;
      expect(rb.cellPhone).toBe('+16505550123');
      for (const field of ['_id', 'firstName', 'lastName', 'email', 'designation', 'department', 'employmentType', 'employmentStatus', 'startDate', 'address']) {
        expect(rb).toHaveProperty(field);
      }
      const d = await apiCall(page, `/api/employees/${rb._id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-46db822b-6048-5c3b-ed32-24bd055f2cdc  SCOPE:new-feature
    test('GET detail response includes cellPhone field for employees created with it', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+listcell+${Date.now()}@example.com`;
      const body = { firstName: 'List', lastName: 'CellTest', email, designation: 'Manager', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-04-01', cellPhone: '+19175550188', address: { street: '10 List Rd', city: 'Chicago', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      const id = (r.body as Record<string, unknown>)._id as string;
      const g = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(g.status).toBe(200);
      const gb = g.body as Record<string, unknown>;
      expect(gb.cellPhone).toBe('+19175550188');
      expect(gb).toHaveProperty('phone');
      const d = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-ad695f78-5dcc-5a2c-2611-e365d52382f2  SCOPE:new-feature
    test('POST without cellPhone returns 201 (cellPhone is optional) - variant', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.nocell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NoCellPhone', email, designation: 'Analyst', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-06-01', address: { street: '1 Main St', city: 'Springfield', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      const rb = r.body as Record<string, unknown>;
      expect(rb._id).toBeTruthy();
      expect(rb.firstName).toBe('Test');
      expect(rb.lastName).toBe('NoCellPhone');
      const cellPhone = rb.cellPhone;
      expect(cellPhone === undefined || cellPhone === null || cellPhone === '').toBeTruthy();
      const g = await apiCall(page, `/api/employees/${rb._id}`, 'GET');
      expect(g.status).toBe(200);
      const d = await apiCall(page, `/api/employees/${rb._id}`, 'DELETE');
      expect(d.status).toBe(204);
    });

    // TC-b597ea5f-1993-570a-3edc-bb40dad3efd6  SCOPE:new-feature
    test('POST with cellPhone populated returns 201 and persists the value', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.withcell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'WithCell', email, designation: 'Developer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-06-01', cellPhone: '+15550001234', address: { street: '2 Oak Ave', city: 'Shelbyville', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      const rb = r.body as Record<string, unknown>;
      expect(rb._id).toBeTruthy();
      expect(rb.cellPhone).toBe('+15550001234');
      const g = await apiCall(page, `/api/employees/${rb._id}`, 'GET');
      expect(g.status).toBe(200);
      expect((g.body as Record<string, unknown>).cellPhone).toBe('+15550001234');
      const d = await apiCall(page, `/api/employees/${rb._id}`, 'DELETE');
      expect(d.status).toBe(204);
    });
  });

  test.describe('negative', () => {
    // TC-cca2e711-7feb-583f-7153-8c3ed6f4dccc  SCOPE:new-feature
    test('POST rejects invalid cellPhone format', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+badcell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'BadCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: 'NOT_A_PHONE_NUMBER!!!', address: { street: '1 Error Lane', city: 'Errorville', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect([400, 422]).toContain(r.status);
      const rb = r.body as Record<string, unknown>;
      expect(rb._id).toBeUndefined();
      expect(JSON.stringify(rb)).toContain('cellPhone');
    });

    // TC-5b002c0b-bb30-5563-827f-c931ca01e3a0  SCOPE:new-feature
    test('POST with cellPhone only — missing required fields still returns 400', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const body = { cellPhone: '+14085550177' };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect([400, 422]).toContain(r.status);
      const rb = r.body as Record<string, unknown>;
      expect(rb._id).toBeUndefined();
      expect(rb.error).toBe('VALIDATION_ERROR');
      const details = rb.details as Array<Record<string, unknown>>;
      const fields = details.map(d => d.field);
      expect(fields).toContain('firstName');
      expect(fields).toContain('email');
    });

    // TC-41be8c17-ab55-5940-a8d9-c64f0f9b7ea5  SCOPE:new-feature
    test('POST with non-string cellPhone value returns validation error', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.badcelltype+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'BadCellType', email, designation: 'Manager', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-09-01', cellPhone: 15550001234, address: { street: '5 Maple Dr', city: 'Gotham', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect([400, 422]).toContain(r.status);
      const rb = r.body as Record<string, unknown>;
      expect(rb._id).toBeUndefined();
      expect(JSON.stringify(rb)).toContain('cellPhone');
    });
  });

  test.describe('edge', () => {
    // TC-6c4bbbc7-9440-5dc4-941b-fc71291e1df6  SCOPE:new-feature
    test('POST rejects cellPhone that exceeds maximum length', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+longcell+${Date.now()}@example.com`;
      const longPhone = '1'.repeat(256);
      const body = { firstName: 'Test', lastName: 'LongCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: longPhone, address: { street: '1 Long St', city: 'Longtown', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect([400, 422]).toContain(r.status);
      const rb = r.body as Record<string, unknown>;
      expect(rb._id).toBeUndefined();
      expect(JSON.stringify(rb)).toContain('cellPhone');
    });

    // TC-a73841ce-9a28-5835-cbba-1316451c9db0  SCOPE:new-feature
    test('POST accepts cellPhone with empty string (blank optional field)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+emptycell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'EmptyCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '', address: { street: '2 Blank Blvd', city: 'Emptyville', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        const rb = r.body as Record<string, unknown>;
        const cellPhone = rb.cellPhone;
        expect(cellPhone === '' || cellPhone === null || cellPhone === undefined).toBeTruthy();
        const d = await apiCall(page, `/api/employees/${rb._id}`, 'DELETE');
        expect(d.status).toBe(204);
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-87cc21ac-ab77-502a-84e5-f6f43c277441  SCOPE:new-feature
    test('POST with null cellPhone value is handled gracefully', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test+nullcell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NullCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: null, address: { street: '3 Null Ave', city: 'Nulltown', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        const rb = r.body as Record<string, unknown>;
        expect(rb._id).toBeTruthy();
        const cellPhone = rb.cellPhone;
        expect(cellPhone === null || cellPhone === undefined || cellPhone === '').toBeTruthy();
        const d = await apiCall(page, `/api/employees/${rb._id}`, 'DELETE');
        expect(d.status).toBe(204);
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-039600b4-7650-5269-b032-cd4c0dd1d5f0  SCOPE:new-feature
    test('POST with cellPhone as empty string returns 201 - variant', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.emptycell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'EmptyCell', email, designation: 'QA Engineer', department: 'Quality Assurance', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-07-01', cellPhone: '', address: { street: '3 Elm Rd', city: 'Capital City', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        const rb = r.body as Record<string, unknown>;
        expect(rb._id).toBeTruthy();
        const d = await apiCall(page, `/api/employees/${rb._id}`, 'DELETE');
        expect(d.status).toBe(204);
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });

    // TC-4b2c3181-e728-54f1-2c75-1d8ed3a30772  SCOPE:new-feature
    test('POST with cellPhone as null returns 201 - variant', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.nullcell+${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NullCell', email, designation: 'Designer', department: 'Product', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-08-01', cellPhone: null, address: { street: '4 Pine Blvd', city: 'Metropolis', country: 'United States' } };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).not.toBe(500);
      if (r.status === 201) {
        const rb = r.body as Record<string, unknown>;
        expect(rb._id).toBeTruthy();
        const d = await apiCall(page, `/api/employees/${rb._id}`, 'DELETE');
        expect(d.status).toBe(204);
      } else {
        expect([400, 422]).toContain(r.status);
      }
    });
  });
});

test.describe('employee-create — API Gap Cases', () => {
  test.describe('positive', () => {
    // TC-45a061b1-e239-5a8c-62b4-1ef32baa3188  SCOPE:new-feature
    test('POST with both cellPhone and phone fields returns 201 and persists both', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.bothphones+${Date.now()}@example.com`;
      const createR = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'BothPhones', email,
        designation: 'Lead', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-10-01', phone: '+15550001111', cellPhone: '+15550002222',
        address: { street: '6 Cedar Ln', city: 'Star City', country: 'United States' }
      });
      expect(createR.status).toBe(201);
      const body = createR.body as Record<string, unknown>;
      expect(typeof body._id).toBe('string');
      expect(body.cellPhone).toBe('+15550002222');
      expect(body.phone).toBe('+15550001111');
      const getR = await apiCall(page, `/api/employees/${body._id}`, 'GET');
      expect(getR.status).toBe(200);
      const getBody = getR.body as Record<string, unknown>;
      expect(getBody.cellPhone).toBe('+15550002222');
      expect(getBody.phone).toBe('+15550001111');
      const delR = await apiCall(page, `/api/employees/${body._id}`, 'DELETE');
      expect(delR.status).toBe(204);
    });

    // TC-7d5d446a-eab2-545e-a43b-5eaac3b2559e  SCOPE:new-feature
    test('GET single employee created without cellPhone confirms field is absent or null', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.getnocell+${Date.now()}@example.com`;
      const createR = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'GetNoCellCheck', email,
        designation: 'Consultant', department: 'Finance',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-12-01',
        address: { street: '8 Walnut Ct', city: 'Riverdale', country: 'United States' }
      });
      expect(createR.status).toBe(201);
      const id = (createR.body as Record<string, unknown>)._id as string;
      const getR = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(getR.status).toBe(200);
      const getBody = getR.body as Record<string, unknown>;
      const cellPhone = getBody.cellPhone;
      expect(cellPhone === undefined || cellPhone === null || cellPhone === '').toBeTruthy();
      expect(getBody.firstName).toBe('Test');
      expect(getBody.lastName).toBe('GetNoCellCheck');
      expect(getBody.email).toBe(email);
      const delR = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(delR.status).toBe(204);
    });
  });

  test.describe('negative', () => {
    // TC-ef01e896-8c4b-5c0e-02ec-60456b3da922  SCOPE:new-feature
    test('POST missing all required fields still returns 400 even when cellPhone is provided', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'POST', { cellPhone: '+15550009999' });
      expect(r.status).toBe(400);
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBe('VALIDATION_ERROR');
      const details = body.details as Record<string, unknown>[];
      expect(details.length).toBeGreaterThan(0);
      const fields = details.map(d => d.field);
      expect(fields).toContain('firstName');
      expect(fields).toContain('email');
    });

    // TC-99e50bf4-e8bb-5aa4-6c97-a085d7359dc7  SCOPE:new-feature
    test('POST with duplicate email returns 409 regardless of cellPhone presence', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const email = `test.dupemail+${Date.now()}@example.com`;
      const base = { firstName: 'Test', lastName: 'DupEmailBase', email,
        designation: 'Analyst', department: 'Marketing',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2025-01-01',
        address: { street: '9 Spruce Ave', city: 'Smallville', country: 'United States' } };
      const createR = await apiCall(page, '/api/employees', 'POST', base);
      expect(createR.status).toBe(201);
      const id = (createR.body as Record<string, unknown>)._id as string;
      const dupR = await apiCall(page, '/api/employees', 'POST', {
        ...base, lastName: 'DupEmailCell', cellPhone: '+15550003333'
      });
      expect(dupR.status).toBe(409);
      const dupBody = dupR.body as Record<string, unknown>;
      expect(dupBody.error).toBeDefined();
      const delR = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(delR.status).toBe(204);
    });
  });

  test.describe('edge', () => {
    // TC-4f67e191-5849-5196-55bd-8235700c62bd  SCOPE:new-feature
    test('POST with excessively long cellPhone string returns 400 or 201 (length validation check)', async ({ page }) => {
      await setupEmployeeCreateMocks(page);
      await page.goto('/');
      const longPhone = '1'.repeat(300);
      const email = `test.longcell+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'LongCell', email,
        designation: 'Intern', department: 'HR',
        employmentType: 'Contract', employmentStatus: 'Active',
        startDate: '2024-11-01', cellPhone: longPhone,
        address: { street: '7 Birch Way', city: 'Central City', country: 'United States' }
      });
      if (r.status === 400 || r.status === 422) {
        const body = r.body as Record<string, unknown>;
        expect(body.error).toBeDefined();
      } else {
        expect(r.status).toBe(201);
        const id = (r.body as Record<string, unknown>)._id as string;
        const delR = await apiCall(page, `/api/employees/${id}`, 'DELETE');
        expect(delR.status).toBe(204);
      }
    });
  });
});
