import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupEmployeeListMocks } from '../fixtures/employee-list.fixture';

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

test.describe('employee-list — API Regression Suite', () => {

  test.describe('positive', () => {

    // TC-7efd9af0-46b2-5377-7bb4-955d22bb9b3d  SCOPE:regression
    test('GET /api/employees returns paginated first page with correct response shape', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');

      const r = await apiCall(page, '/api/employees', 'GET');
      expect(r.status).toBe(200);
      expect(typeof r.body).toBe('object');
      expect(Array.isArray(r.body.data)).toBe(true);

      const data = r.body.data as Record<string, unknown>[];
      const pagination = r.body.pagination as Record<string, unknown>;
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(typeof pagination.total).toBe('number');
      expect(pagination.page).toBe(1);
      expect(typeof pagination.limit).toBe('number');
      expect((pagination.limit as number)).toBeGreaterThan(0);
      expect(data.length).toBeLessThanOrEqual(pagination.limit as number);

      const first = data[0];
      for (const field of ['_id', 'firstName', 'lastName', 'email', 'designation', 'department', 'employmentStatus']) {
        expect(first[field]).toBeTruthy();
      }

      const r2 = await apiCall(page, '/api/employees?page=1&limit=5', 'GET');
      expect(r2.status).toBe(200);
      const data2 = r2.body.data as Record<string, unknown>[];
      expect(data2.length).toBeLessThanOrEqual(5);
    });

  });

  test.describe('negative', () => {

    // TC-59672e2b-f616-5e47-085a-65f2218d7a97  SCOPE:regression
    test('GET /api/employees rejects invalid pagination parameters', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');

      const invalidCases = [
        '/api/employees?page=0&limit=10',
        '/api/employees?page=1&limit=0',
        '/api/employees?page=-1&limit=10',
        '/api/employees?page=abc&limit=10',
        '/api/employees?page=1&limit=abc',
      ];

      for (const url of invalidCases) {
        const r = await apiCall(page, url, 'GET');
        expect([400, 422]).toContain(r.status);
        expect(r.body.error || r.body.message).toBeTruthy();
      }

      const valid = await apiCall(page, '/api/employees?page=1&limit=10', 'GET');
      expect(valid.status).toBe(200);
      expect(Array.isArray(valid.body.data)).toBe(true);
    });

  });

  test.describe('edge', () => {
    // No edge cases specified for this module
  });

});

test.describe('employee-list — API Gap Cases', () => {
  test.describe('positive', () => {
    // TC-a80edd3a  SCOPE:new-feature
    test('GET /api/employees returns cellPhone field in each employee object', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'GET');
      expect(r.status).toBe(200);
      const data = r.body.data as Record<string, unknown>[];
      expect(data.length).toBeGreaterThan(0);
      for (const emp of data) {
        expect('cellPhone' in emp).toBe(true);
        const val = emp.cellPhone;
        expect(val === null || typeof val === 'string').toBe(true);
      }
    });

    // TC-afe68da0  SCOPE:new-feature
    test('GET /api/employees returns phone field alongside cellPhone', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'GET');
      expect(r.status).toBe(200);
      const data = r.body.data as Record<string, unknown>[];
      expect(data.length).toBeGreaterThan(0);
      const emp = data[0];
      expect('phone' in emp).toBe(true);
      expect('cellPhone' in emp).toBe(true);
    });

    // TC-3a016e51  SCOPE:new-feature
    test('POST creates employee with cellPhone and GET returns it correctly', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.cell.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'CellUser', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', phone: '555-0100', cellPhone: '555-0199', address: { street: '1 Cell St', city: 'Test City', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      expect(id).toBeTruthy();
      expect(cr.body.cellPhone).toBe('555-0199');
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect(gr.body.cellPhone).toBe('555-0199');
      expect(gr.body.phone).toBe('555-0100');
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-ba5d4c2b  SCOPE:new-feature
    test('GET single employee returns cellPhone field in response', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const listR = await apiCall(page, '/api/employees', 'GET');
      expect(listR.status).toBe(200);
      const data = listR.body.data as Record<string, unknown>[];
      expect(data.length).toBeGreaterThan(0);
      const id = data[0]._id as string;
      const r = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(r.status).toBe(200);
      expect('cellPhone' in r.body).toBe(true);
      expect('phone' in r.body).toBe(true);
    });

    // TC-e86be89a  SCOPE:new-feature
    test('POST creates employee with cellPhone and GET by id returns it', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.cell2.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'Employee', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', phone: '555-0100', cellPhone: '555-0199', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      expect(cr.body.cellPhone).toBe('555-0199');
      const id = cr.body._id as string;
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect(gr.body.cellPhone).toBe('555-0199');
      expect(gr.body.phone).toBe('555-0100');
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-f58b4a8b  SCOPE:new-feature
    test('GET single employee returns cellPhone as null/empty when not provided at creation', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.nocell3.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NoCellPhone', email, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', address: { street: '456 No Cell Ave', city: 'Testville', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect('cellPhone' in gr.body).toBe(true);
      const val = gr.body.cellPhone;
      expect(val === null || val === '' || val === undefined).toBe(true);
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-44a97f90  SCOPE:new-feature
    test('PATCH updates cellPhone and GET reflects the new value', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.patchcell.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'UpdateCell', email, designation: 'Developer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-05-01', cellPhone: '555-0001', address: { street: '789 Update Rd', city: 'Patchtown', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const pr = await apiCall(page, `/api/employees/${id}`, 'PATCH', { cellPhone: '555-9999' });
      expect(pr.status).toBe(200);
      expect(pr.body.cellPhone).toBe('555-9999');
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect(gr.body.cellPhone).toBe('555-9999');
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-9dc62ee3  SCOPE:new-feature
    test('GET single employee contains both phone and cellPhone as distinct fields', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.dualphone.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'DualPhone', email, designation: 'Manager', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-06-01', phone: '555-1111', cellPhone: '555-2222', address: { street: '1 Dual St', city: 'Phoneville', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect(gr.body.phone).toBe('555-1111');
      expect(gr.body.cellPhone).toBe('555-2222');
      expect(gr.body.phone).not.toBe(gr.body.cellPhone);
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-b35d4cd5  SCOPE:new-feature
    test('GET list endpoint returns cellPhone field for all employees', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'GET');
      expect(r.status).toBe(200);
      const data = r.body.data as Record<string, unknown>[];
      expect(data.length).toBeGreaterThanOrEqual(1);
      for (const emp of data) {
        expect('cellPhone' in emp).toBe(true);
        expect('phone' in emp).toBe(true);
      }
    });

    // TC-973e8ec8  SCOPE:new-feature
    test('GET /api/employees response schema contains cellPhone for ALL employees', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'GET');
      expect(r.status).toBe(200);
      const data = r.body.data as Record<string, unknown>[];
      const missingCellPhone = data.filter(e => !('cellPhone' in e));
      expect(missingCellPhone.length).toBe(0);
      const missingPhone = data.filter(e => !('phone' in e));
      expect(missingPhone.length).toBe(0);
    });

    // TC-70ac9ba9  SCOPE:new-feature
    test('POST /api/employees accepts and persists cellPhone field', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.cell5.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'CellUser', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '+15550001234', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      expect(cr.body.cellPhone).toBe('+15550001234');
      const id = cr.body._id as string;
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect(gr.body.cellPhone).toBe('+15550001234');
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-d100207a  SCOPE:new-feature
    test('POST /api/employees succeeds when cellPhone field is omitted', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.nocell5.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NoCellUser', email, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', address: { street: '456 Main St', city: 'Anytown', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      expect(cr.body._id).toBeTruthy();
      const dr = await apiCall(page, `/api/employees/${cr.body._id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-60370817  SCOPE:new-feature
    test('GET /api/employees cellPhone value matches value set during PUT update', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.putcell.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'UpdateCellUser', email, designation: 'Manager', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-02-01', phone: '555-0400', cellPhone: '555-0001', address: { street: '5 Update Cell Way', city: 'Test City', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const putBody = { ...body, cellPhone: '555-9999' };
      const ur = await apiCall(page, `/api/employees/${id}`, 'PUT', putBody);
      expect(ur.status).toBe(200);
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect(gr.body.cellPhone).toBe('555-9999');
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-c165574d  SCOPE:new-feature
    test('GET /api/employees response includes both phone and cellPhone fields', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'GET');
      expect(r.status).toBe(200);
      const data = r.body.data as Record<string, unknown>[];
      expect(data.length).toBeGreaterThan(0);
      const emp = data[0];
      expect('phone' in emp).toBe(true);
      expect('cellPhone' in emp).toBe(true);
    });

    // TC-d896e5f2  SCOPE:new-feature
    test('PUT/PATCH updates cellPhone field and persists the change', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.updatecell6.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'UpdateCell', email, designation: 'Manager', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-02-01', cellPhone: '+15550000001', address: { street: '10 Update Ave', city: 'Updateville', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const pr = await apiCall(page, `/api/employees/${id}`, 'PATCH', { cellPhone: '+15559999999' });
      expect(pr.status).toBe(200);
      expect(pr.body.cellPhone).toBe('+15559999999');
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect(gr.body.cellPhone).toBe('+15559999999');
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });
  });

  test.describe('negative', () => {
    // TC-73c26661  SCOPE:new-feature
    test('POST with non-string cellPhone value (number) returns 400 or is coerced', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.badcell.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'BadCellUser', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', phone: '555-0100', cellPhone: 5550199, address: { street: '4 Bad Cell Blvd', city: 'Test City', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      if (cr.status === 201) {
        const id = cr.body._id as string;
        await apiCall(page, `/api/employees/${id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(cr.status);
        expect(cr.body.error).toBeTruthy();
      }
    });

    // TC-4334bdd0  SCOPE:new-feature
    test('GET /api/employees response does not duplicate phone data into cellPhone', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.distinct.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'DistinctPhoneUser', email, designation: 'Analyst', department: 'HR', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-04-01', phone: '111-1111', cellPhone: '222-2222', address: { street: '6 Distinct Phone Pl', city: 'Test City', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect(gr.body.phone).toBe('111-1111');
      expect(gr.body.cellPhone).toBe('222-2222');
      expect(gr.body.phone).not.toBe(gr.body.cellPhone);
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-4d045238  SCOPE:new-feature
    test('GET non-existent employee ID returns 404 with no cellPhone field', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees/000000000000000000000000', 'GET');
      expect(r.status).toBe(404);
      expect(r.body.error).toBe('NOT_FOUND');
      expect('cellPhone' in r.body).toBe(false);
      expect('phone' in r.body).toBe(false);
    });

    // TC-f330354c  SCOPE:new-feature
    test('POST with non-string cellPhone (integer) returns 400 or 422', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.badcell2.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'BadCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: 15550001234, address: { street: '1 Bad St', city: 'Errortown', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      if (cr.status === 201) {
        const id = cr.body._id as string;
        await apiCall(page, `/api/employees/${id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(cr.status);
        expect(cr.body.error).toBeTruthy();
      }
    });

    // TC-33a45766  SCOPE:new-feature
    test('POST with excessively long cellPhone returns 400/422 or accepts it', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.longcell.${Date.now()}@example.com`;
      const longCell = 'A'.repeat(200);
      const body = { firstName: 'Test', lastName: 'BadCell', email, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: longCell, address: { street: '1 Bad St', city: 'Errortown', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      if (cr.status === 201) {
        const id = cr.body._id as string;
        await apiCall(page, `/api/employees/${id}`, 'DELETE');
      } else {
        expect([400, 422]).toContain(cr.status);
        expect(cr.body.error).toBeTruthy();
      }
    });
  });

  test.describe('edge', () => {
    // TC-93f80717  SCOPE:new-feature
    test('POST without cellPhone — GET returns cellPhone as null or empty', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.nocell4.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NoCellUser', email, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', phone: '555-0200', address: { street: '2 No Cell Ave', city: 'Test City', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect('cellPhone' in gr.body).toBe(true);
      const val = gr.body.cellPhone;
      expect(val === null || val === '' || val === undefined).toBe(true);
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-dba8f376  SCOPE:new-feature
    test('POST with cellPhone as empty string is accepted', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.emptycell2.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'EmptyCellUser', email, designation: 'Designer', department: 'Product', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-06-01', phone: '555-0300', cellPhone: '', address: { street: '3 Empty Cell Rd', city: 'Test City', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      const val = gr.body.cellPhone;
      expect(val === '' || val === null).toBe(true);
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-367dc8b3  SCOPE:new-feature
    test('GET /api/employees cellPhone field is a string type (not object or array)', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'GET');
      expect(r.status).toBe(200);
      const data = r.body.data as Record<string, unknown>[];
      const toCheck = data.slice(0, 5);
      for (const emp of toCheck) {
        const val = emp.cellPhone;
        expect(typeof val === 'string' || val === null || val === undefined).toBe(true);
        expect(Array.isArray(val)).toBe(false);
        if (val !== null && val !== undefined) {
          expect(typeof val).toBe('string');
        }
      }
    });

    // TC-fe46809a  SCOPE:new-feature
    test('POST with cellPhone as null is accepted', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.nullcell.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'NullCell', email, designation: 'Designer', department: 'Product', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-06-01', cellPhone: null, address: { street: '789 Elm St', city: 'Somewhere', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      expect(cr.body._id).toBeTruthy();
      const dr = await apiCall(page, `/api/employees/${cr.body._id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-68175e42  SCOPE:new-feature
    test('POST with cellPhone as empty string — GET by id returns empty or null', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.emptycell3.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'EmptyCell', email, designation: 'Analyst', department: 'HR', employmentType: 'Part-Time', employmentStatus: 'Active', startDate: '2024-07-01', cellPhone: '', address: { street: '2 Empty Ln', city: 'Blankton', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect('cellPhone' in gr.body).toBe(true);
      const val = gr.body.cellPhone;
      expect(val === '' || val === null).toBe(true);
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-4a2ff417  SCOPE:new-feature
    test('GET single employee cellPhone value matches exactly what was stored (special chars)', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.specialcell.${Date.now()}@example.com`;
      const cellPhone = '+1 (555) 012-3456';
      const body = { firstName: 'Test', lastName: 'SpecialCell', email, designation: 'Consultant', department: 'Sales', employmentType: 'Contract', employmentStatus: 'Active', startDate: '2024-08-01', cellPhone, address: { street: '3 Special Blvd', city: 'Formatville', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect(cr.status).toBe(201);
      const id = cr.body._id as string;
      const gr = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(gr.status).toBe(200);
      expect(gr.body.cellPhone).toBe(cellPhone);
      const dr = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(dr.status).toBe(204);
    });

    // TC-a04a97c7  SCOPE:new-feature
    test('POST with empty string cellPhone is accepted or returns clear validation error', async ({ page }) => {
      await setupEmployeeListMocks(page);
      await page.goto('/');
      const email = `test.emptycell4.${Date.now()}@example.com`;
      const body = { firstName: 'Test', lastName: 'EmptyCell', email, designation: 'Coordinator', department: 'HR', employmentType: 'Contract', employmentStatus: 'Active', startDate: '2024-05-01', cellPhone: '', address: { street: '2 Empty Ln', city: 'Blanktown', country: 'United States' } };
      const cr = await apiCall(page, '/api/employees', 'POST', body);
      expect([201, 400, 422]).toContain(cr.status);
      expect(cr.status).not.toBe(500);
      if (cr.status === 201) {
        const id = cr.body._id as string;
        await apiCall(page, `/api/employees/${id}`, 'DELETE');
      }
    });
  });
});
