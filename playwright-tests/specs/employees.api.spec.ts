import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupEmployeesMocks } from '../fixtures/employees.fixture';

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

test.describe('employees — API Regression Suite', () => {

  test.describe('positive', () => {

    // TC-eb0049f1-b43d-489f-a9fc-95655b0cef0c  SCOPE:regression
    test('List employees with default pagination returns data array and pagination metadata', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'GET');
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.data)).toBe(true);
      const data = r.body.data as Record<string, unknown>[];
      expect(data.length).toBeGreaterThanOrEqual(1);
      expect(data.length).toBeLessThanOrEqual(20);
      const pagination = r.body.pagination as Record<string, unknown>;
      expect(pagination).toBeDefined();
      expect(pagination.page).toBe(1);
      expect(typeof pagination.total).toBe('number');
      expect(pagination.total as number).toBeGreaterThanOrEqual(data.length);
      const firstEmployee = data[0];
      expect(firstEmployee._id ?? firstEmployee.id).toBeDefined();
      expect(firstEmployee.firstName).toBeDefined();
    });

    // TC-b8fd88eb-07d6-41f5-9687-5900d9a6b103  SCOPE:regression
    test('Filter by department and status returns matching employees', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/employees?department=Engineering&status=Active', 'GET');
      expect(r1.status).toBe(200);
      const data1 = (r1.body.data ?? r1.body) as Record<string, unknown>[];
      expect(Array.isArray(data1)).toBe(true);
      expect(data1.length).toBeGreaterThanOrEqual(1);
      data1.forEach((emp) => {
        expect(emp.department).toBe('Engineering');
        expect(emp.employmentStatus ?? emp.status).toBe('Active');
      });
      const r2 = await apiCall(page, '/api/employees?department=Product&status=Active', 'GET');
      expect(r2.status).toBe(200);
      const r3 = await apiCall(page, '/api/employees?department=Engineering&status=Terminated', 'GET');
      expect(r3.status).toBe(200);
    });

    // TC-d6220631-e72f-47eb-aacd-9d416cdf8eba  SCOPE:regression
    test('Search employees by name returns matching results', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const rAll = await apiCall(page, '/api/employees', 'GET');
      expect(rAll.status).toBe(200);
      const rSearch = await apiCall(page, '/api/employees?search=Thava', 'GET');
      expect(rSearch.status).toBe(200);
      const data = (rSearch.body.data ?? rSearch.body) as Record<string, unknown>[];
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(1);
      const rLower = await apiCall(page, '/api/employees?search=thava', 'GET');
      expect(rLower.status).toBe(200);
    });

    // TC-7070072e-849f-4cf1-a2a0-237fd86c7d11  SCOPE:regression
    test('Create employee with full valid payload returns 201 and created record', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const payload = { firstName: 'John', lastName: 'Doe', email: 'john.doe.test@testcompany.com', department: 'Engineering', designation: 'Software Engineer', employmentType: 'Full-Time' };
      const r = await apiCall(page, '/api/employees', 'POST', payload);
      expect(r.status).toBe(201);
      expect(r.body._id ?? r.body.id).toBeDefined();
      expect(r.body.firstName).toBe('John');
      expect(r.body.lastName).toBe('Doe');
      expect(r.body.email).toBe('john.doe.test@testcompany.com');
      expect(r.body.department).toBe('Engineering');
      const id = (r.body._id ?? r.body.id) as string;
      const rGet = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(rGet.status).toBe(200);
      const rDel = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect([200, 204]).toContain(rDel.status);
    });

    // TC-5b99fe2c-0987-4cbc-99ef-c4c3f476ab03  SCOPE:regression
    test('POST with valid complete payload returns 201 and created employee', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const payload = { firstName: 'Test', lastName: 'Employee', email: 'test.employee@testcompany.com', department: 'Engineering', designation: 'Software Engineer', employmentType: 'Full-Time' };
      const r = await apiCall(page, '/api/employees', 'POST', payload);
      expect(r.status).toBe(201);
      expect(r.body._id ?? r.body.id).toBeDefined();
      expect(r.body.firstName).toBe('Test');
      expect(r.body.lastName).toBe('Employee');
      const id = (r.body._id ?? r.body.id) as string;
      const rGet = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(rGet.status).toBe(200);
      const rDel = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect([200, 204]).toContain(rDel.status);
    });
  });

  test.describe('negative', () => {

    // TC-db89e583-2e11-40a7-aef5-44fe78b66dd3  SCOPE:regression
    test('Request with invalid pagination parameters returns 400 or safely handled response', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/employees?page=-1&limit=10', 'GET');
      expect([400, 422]).toContain(r1.status);
      expect(r1.body.message || r1.body.error).toBeTruthy();
      const r2 = await apiCall(page, '/api/employees?page=abc&limit=xyz', 'GET');
      expect([400, 422]).toContain(r2.status);
      expect(r2.body.message || r2.body.error).toBeTruthy();
      const r3 = await apiCall(page, '/api/employees?page=1&limit=-5', 'GET');
      expect([400, 422]).toContain(r3.status);
      expect(r3.body.message || r3.body.error).toBeTruthy();
    });

    // TC-8c6d5209-104d-4399-9890-ac7bae9856b7  SCOPE:regression
    test('Filter with invalid department or status returns empty result or 400', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/employees?department=NonExistentDept999&status=Active', 'GET');
      expect([200, 400, 422]).toContain(r1.status);
      if (r1.status === 200) {
        const data = (r1.body.data ?? r1.body) as Record<string, unknown>[];
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
      }
      const r2 = await apiCall(page, '/api/employees?department=QA&status=InvalidStatus123', 'GET');
      expect([200, 400, 422]).toContain(r2.status);
      const r3 = await apiCall(page, '/api/employees?department=&status=', 'GET');
      expect([200, 400, 422]).toContain(r3.status);
    });

    // TC-ad0a3e9c-267f-4857-a0f2-238157b71dfb  SCOPE:regression
    test('Search with non-matching text returns empty results', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees?search=ZZXXYY999NONEXISTENT', 'GET');
      expect(r.status).toBe(200);
      const data = (r.body.data ?? r.body) as Record<string, unknown>[];
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });

    // TC-84fd361d-2de1-4ede-9702-151d4298505e  SCOPE:regression
    test('Create employee with missing required fields returns 400/422 validation error', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/employees', 'POST', { lastName: 'Doe', email: 'missing.first@testcompany.com', department: 'Engineering' });
      expect([400, 422]).toContain(r1.status);
      expect(r1.body.message || r1.body.error || r1.body.errors).toBeTruthy();
      const r2 = await apiCall(page, '/api/employees', 'POST', { firstName: 'John', lastName: 'Doe', department: 'Engineering' });
      expect([400, 422]).toContain(r2.status);
      expect(r2.body.message || r2.body.error || r2.body.errors).toBeTruthy();
      const r3 = await apiCall(page, '/api/employees', 'POST', {});
      expect([400, 422]).toContain(r3.status);
      expect(r3.body.message || r3.body.error || r3.body.errors).toBeTruthy();
    });

    // TC-3fbf5da4-732b-44f4-95df-51e01cafab7a  SCOPE:regression
    test('POST with empty body returns 400 with validation error details', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'POST', {});
      expect(r.status).toBe(400);
      expect(r.body.message || r.body.error || r.body.errors).toBeTruthy();
      const rList = await apiCall(page, '/api/employees', 'GET');
      expect(rList.status).toBe(200);
    });
  });

  test.describe('edge', () => {

    // TC-b951f9c7-db01-472d-b97d-df8aa08cc77c  SCOPE:regression
    test('Requesting a page beyond total pages returns empty data array with correct pagination', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/employees?page=1&limit=1', 'GET');
      expect(r1.status).toBe(200);
      const pagination1 = r1.body.pagination as Record<string, unknown>;
      const totalPages = (pagination1.pages ?? pagination1.totalPages) as number;
      const total = pagination1.total as number;
      const r2 = await apiCall(page, `/api/employees?page=${totalPages + 100}&limit=1`, 'GET');
      expect(r2.status).toBe(200);
      const data2 = r2.body.data as Record<string, unknown>[];
      expect(data2.length).toBe(0);
      const pagination2 = r2.body.pagination as Record<string, unknown>;
      expect(pagination2.total).toBe(total);
      const r3 = await apiCall(page, '/api/employees?page=0&limit=1', 'GET');
      expect([200, 400]).toContain(r3.status);
      const r4 = await apiCall(page, '/api/employees?page=1&limit=0', 'GET');
      expect([200, 400]).toContain(r4.status);
      const r5 = await apiCall(page, '/api/employees?page=1&limit=999999', 'GET');
      expect([200, 400]).toContain(r5.status);
    });

    // TC-7142303b-6267-4b36-a47f-64977583b578  SCOPE:regression
    test('Filter with only one query param (partial filter) and SQL injection boundary', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/employees?department=QA', 'GET');
      expect(r1.status).toBe(200);
      const r2 = await apiCall(page, '/api/employees?status=Active', 'GET');
      expect(r2.status).toBe(200);
      const r3 = await apiCall(page, "/api/employees?department=QA'%20OR%201%3D1%20--&status=Active", 'GET');
      expect([200, 400, 422]).toContain(r3.status);
      expect(r3.status).not.toBe(500);
      const r4 = await apiCall(page, '/api/employees?department=QA&status=Active&department=Engineering', 'GET');
      expect([200, 400]).toContain(r4.status);
      expect(r4.status).not.toBe(500);
      const r5 = await apiCall(page, '/api/employees?department=qa&status=active', 'GET');
      expect(r5.status).toBe(200);
      expect(r5.status).not.toBe(500);
    });

    // TC-8b28251c-155c-4206-baf2-e2215ec50950  SCOPE:regression
    test('Search with empty and special character boundary inputs', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/employees?search=', 'GET');
      expect(r1.status).toBe(200);
      const r2 = await apiCall(page, '/api/employees?search=%20%20%20', 'GET');
      expect(r2.status).toBe(200);
      const r3 = await apiCall(page, '/api/employees?search=%27OR%201%3D1--', 'GET');
      expect(r3.status).toBe(200);
      expect(r3.status).not.toBe(500);
      const r4 = await apiCall(page, '/api/employees?search=%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'GET');
      expect(r4.status).toBe(200);
      const r5 = await apiCall(page, '/api/employees?search=a', 'GET');
      expect(r5.status).toBe(200);
    });

    // TC-88bc516d-b902-42c6-9606-15e7f847c374  SCOPE:regression
    test('Create employee with boundary and edge-case field values', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/employees', 'POST', { firstName: 'A', lastName: 'B', email: 'edge1@testcompany.com', department: 'QA', designation: 'Analyst', employmentType: 'Full-Time' });
      expect(r1.status).toBe(201);
      expect(r1.body.firstName).toBe('A');
      expect(r1.body.lastName).toBe('B');
      const id1 = (r1.body._id ?? r1.body.id) as string;
      const longName = 'X'.repeat(255);
      const r2 = await apiCall(page, '/api/employees', 'POST', { firstName: longName, lastName: 'Long', email: 'edge2@testcompany.com', department: 'Engineering', designation: 'Engineer', employmentType: 'Full-Time' });
      expect(r2.status).toBe(201);
      const id2 = (r2.body._id ?? r2.body.id) as string;
      // Duplicate email test: re-use edge1@testcompany.com which was just created
      const r3 = await apiCall(page, '/api/employees', 'POST', { firstName: 'Jane', lastName: 'Smith', email: 'edge1@testcompany.com', department: 'Engineering', designation: 'Designer', employmentType: 'Full-Time' });
      expect([400, 409]).toContain(r3.status);
      expect(r3.body.message || r3.body.error).toBeTruthy();
      const r4 = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'User', email: 'not-an-email', department: 'Sales' });
      expect([400, 422]).toContain(r4.status);
      const r5 = await apiCall(page, '/api/employees', 'POST', { firstName: 'José María', lastName: 'García-López', email: 'edge3@testcompany.com', department: 'Engineering', designation: 'Developer', employmentType: 'Full-Time' });
      expect(r5.status).toBe(201);
      expect(r5.body.firstName).toBe('José María');
      expect(r5.body.lastName).toBe('García-López');
      const id3 = (r5.body._id ?? r5.body.id) as string;
      for (const id of [id1, id2, id3].filter(Boolean)) {
        const rDel = await apiCall(page, `/api/employees/${id}`, 'DELETE');
        expect([200, 204]).toContain(rDel.status);
      }
    });
  });
});

test.describe('employees — API New Feature', () => {

  test.describe('positive', () => {
    test.skip('No new feature positive cases defined', async () => {});
  });

  test.describe('negative', () => {
    test.skip('No new feature negative cases defined', async () => {});
  });

  test.describe('edge', () => {
    test.skip('No new feature edge cases defined', async () => {});
  });
});

test.describe('employees — API Gap Cases', () => {
  test.describe('positive', () => {
    // TC-806c0b04-7f9d-4f3b-8f31-76ead3bf5b2a  SCOPE:regression
    test('[API] employees: Successful employee creation with unique email returns 201', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const createRes = await apiCall(page, '/api/employees', 'POST', { firstName: 'UniqueTest', lastName: 'User', email: 'uniquetest@example.com', department: 'Engineering', designation: 'Engineer', employmentType: 'Full-Time' });
      expect(createRes.status).toBe(201);
      const body = createRes.body as Record<string, unknown>;
      expect(typeof body.id === 'string' || typeof body._id === 'string').toBeTruthy();
      expect(body.firstName).toBe('UniqueTest');
      expect(body.lastName).toBe('User');
      expect(body.department).toBe('Engineering');
      const id = (body.id ?? body._id) as string;
      const deleteRes = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect([200, 204]).toContain(deleteRes.status);
    });

    // TC-f9c38cbe-f8fa-47d6-ba74-8659cd68db0b  SCOPE:regression
    test('[API] employees: GET /api/employees/:id returns full employee object for valid ObjectId', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const listRes = await apiCall(page, '/api/employees', 'GET');
      expect(listRes.status).toBe(200);
      const employees = ((listRes.body as Record<string, unknown>).data ?? listRes.body) as Record<string, unknown>[];
      expect(employees.length).toBeGreaterThan(0);
      const empId = (employees[0]._id ?? employees[0].id) as string;
      const getRes = await apiCall(page, `/api/employees/${empId}`, 'GET');
      expect(getRes.status).toBe(200);
      const emp = getRes.body as Record<string, unknown>;
      expect(emp._id ?? emp.id).toBe(empId);
      expect(typeof emp.firstName).toBe('string');
      expect(typeof emp.lastName).toBe('string');
      expect(typeof emp.email).toBe('string');
      expect(emp).not.toHaveProperty('passwordHash');
      expect(emp).not.toHaveProperty('internalNotes');
    });

    // TC-b71ef521-7f3c-49a2-bb40-72ac79a69227  SCOPE:regression
    test('[API] employees: GET with valid ID returns 200 employee object', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const listRes = await apiCall(page, '/api/employees', 'GET');
      expect(listRes.status).toBe(200);
      const employees = ((listRes.body as Record<string, unknown>).data ?? listRes.body) as Record<string, unknown>[];
      expect(employees.length).toBeGreaterThan(0);
      const empId = (employees[0].id ?? employees[0]._id) as string;
      const getRes = await apiCall(page, `/api/employees/${empId}`, 'GET');
      expect(getRes.status).toBe(200);
      const emp = getRes.body as Record<string, unknown>;
      expect(emp.id ?? emp._id).toBe(empId);
      expect(typeof emp.firstName).toBe('string');
      expect(typeof emp.email).toBe('string');
    });

    // TC-a3aaa347-3a2f-4c4c-9d83-44008a3c4b42  SCOPE:regression
    test('[API] employees: PATCH /api/employees/:id successfully updates employee with partial data', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const createRes = await apiCall(page, '/api/employees', 'POST', { firstName: 'PatchOrig', lastName: 'User', email: 'patchtest@example.com', department: 'Engineering', designation: 'Engineer', employmentType: 'Full-Time' });
      expect(createRes.status).toBe(201);
      const id = ((createRes.body as Record<string, unknown>).id ?? (createRes.body as Record<string, unknown>)._id) as string;
      const patchRes = await apiCall(page, `/api/employees/${id}`, 'PATCH', { department: 'Marketing' });
      expect(patchRes.status).toBe(200);
      const patched = patchRes.body as Record<string, unknown>;
      expect(patched.department).toBe('Marketing');
      expect(patched.firstName).toBe('PatchOrig');
      await apiCall(page, `/api/employees/${id}`, 'DELETE');
    });

    // TC-24230b87-ef39-4c64-8fb3-49488b8d0778  SCOPE:regression
    test('[API] employees: DELETE /api/employees/:id returns 204 and removes employee', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const createRes = await apiCall(page, '/api/employees', 'POST', { firstName: 'DeleteTest', lastName: 'User', email: 'deletetest@example.com', department: 'Engineering', designation: 'Engineer', employmentType: 'Full-Time' });
      expect(createRes.status).toBe(201);
      const id = ((createRes.body as Record<string, unknown>).id ?? (createRes.body as Record<string, unknown>)._id) as string;
      const preGet = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(preGet.status).toBe(200);
      const deleteRes = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect([200, 204]).toContain(deleteRes.status);
      const postGet = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(postGet.status).toBe(404);
    });
  });

  test.describe('negative', () => {
    // TC-de3c5090-e8c9-4907-92d7-37589646f9c9  SCOPE:regression
    test('[API] employees: Duplicate email returns 409 conflict with DUPLICATE_EMAIL error', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const first = await apiCall(page, '/api/employees', 'POST', { firstName: 'Original', lastName: 'Employee', email: 'duplicate-check@example.com', department: 'Engineering', designation: 'Engineer', employmentType: 'Full-Time' });
      expect(first.status).toBe(201);
      const id = ((first.body as Record<string, unknown>).id ?? (first.body as Record<string, unknown>)._id) as string;
      const second = await apiCall(page, '/api/employees', 'POST', { firstName: 'Duplicate', lastName: 'Attempt', email: 'duplicate-check@example.com', department: 'Marketing', designation: 'Engineer', employmentType: 'Full-Time' });
      expect(second.status).toBe(409);
      const errBody = second.body as Record<string, unknown>;
      expect(errBody.error ?? errBody.code).toBe('DUPLICATE_EMAIL');
      await apiCall(page, `/api/employees/${id}`, 'DELETE');
    });

    // TC-ea335d93-2773-4caa-ac2b-f90a203c3a55  SCOPE:regression
    test('[API] employees: GET /api/employees/:id returns 404 for non-existent but valid ObjectId', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const res = await apiCall(page, '/api/employees/000000000000000000000000', 'GET');
      expect(res.status).toBe(404);
      const body = res.body as Record<string, unknown>;
      const msg = JSON.stringify(body).toLowerCase();
      expect(msg).toContain('not found');
      expect(msg).not.toContain('stack');
      expect(msg).not.toContain('/node_modules/');
    });

    // TC-b9c5bcc0-75cd-47aa-9de4-1406edcf1eac  SCOPE:regression
    test('[API] employees: GET with malformed string ID returns 400 INVALID_ID', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const res = await apiCall(page, '/api/employees/bad-id', 'GET');
      expect(res.status).toBe(400);
      const body = res.body as Record<string, unknown>;
      expect(body.error ?? body.code).toBe('INVALID_ID');
      const msg = (body.message ?? body.error) as string;
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    });

    // TC-0f0016f0-d6bc-4f74-b54c-1b2cef54c042  SCOPE:regression
    test('[API] employees: PATCH /api/employees/:id with invalid data returns validation error', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const listRes = await apiCall(page, '/api/employees', 'GET');
      expect(listRes.status).toBe(200);
      const employees = ((listRes.body as Record<string, unknown>).data ?? listRes.body) as Record<string, unknown>[];
      const empId = (employees[0].id ?? employees[0]._id) as string;
      const invalidEmail = await apiCall(page, `/api/employees/${empId}`, 'PATCH', { email: 'not-an-email' });
      expect([400, 422]).toContain(invalidEmail.status);
      const emptyName = await apiCall(page, `/api/employees/${empId}`, 'PATCH', { firstName: '' });
      expect([400, 422]).toContain(emptyName.status);
      const notFound = await apiCall(page, '/api/employees/000000000000000000000000', 'PATCH', { department: 'Engineering' });
      expect(notFound.status).toBe(404);
    });

    // TC-99861b4a-b5a7-4fc0-bf28-1817d0568dd1  SCOPE:regression
    test('[API] employees: DELETE /api/employees/:id with non-existent ID returns 404', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const res = await apiCall(page, '/api/employees/000000000000000000000000', 'DELETE');
      expect(res.status).toBe(404);
      const body = res.body as Record<string, unknown>;
      const msg = JSON.stringify(body).toLowerCase();
      expect(msg).toContain('not found');
    });
  });

  test.describe('edge', () => {
    // TC-a42a3014-8f13-4dd6-8fe2-f114fb52ab78  SCOPE:regression
    test('[API] employees: POST with partial required fields returns 400 listing only the missing fields', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const partial = await apiCall(page, '/api/employees', 'POST', { firstName: 'OnlyFirst' });
      expect(partial.status).toBe(400);
      const partialBody = JSON.stringify(partial.body).toLowerCase();
      expect(partialBody).not.toContain('"firstname"');
      const invalidEmail = await apiCall(page, '/api/employees', 'POST', { firstName: 'Test', lastName: 'User', email: 'not-an-email', department: 'Engineering', designation: 'Engineer', employmentType: 'Full-Time' });
      expect(invalidEmail.status).toBe(400);
      const emailBody = JSON.stringify(invalidEmail.body).toLowerCase();
      expect(emailBody).toMatch(/email/);
      const emptyFields = await apiCall(page, '/api/employees', 'POST', { firstName: '', lastName: '', email: '', department: '' });
      expect(emptyFields.status).toBe(400);
    });

    // TC-dc7f3fee-2da5-4f41-9c59-934472f1212d  SCOPE:regression
    test('[API] employees: Duplicate email check is case-insensitive', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const first = await apiCall(page, '/api/employees', 'POST', { firstName: 'CaseTest', lastName: 'Lower', email: 'casetest@example.com', department: 'QA', designation: 'Analyst', employmentType: 'Full-Time' });
      expect(first.status).toBe(201);
      const firstId = ((first.body as Record<string, unknown>).id ?? (first.body as Record<string, unknown>)._id) as string;
      const second = await apiCall(page, '/api/employees', 'POST', { firstName: 'CaseTest', lastName: 'Upper', email: 'CASETEST@EXAMPLE.COM', department: 'Engineering', designation: 'Analyst', employmentType: 'Full-Time' });
      expect([201, 409]).toContain(second.status);
      if (second.status === 409) {
        expect((second.body as Record<string, unknown>).error ?? (second.body as Record<string, unknown>).code).toBe('DUPLICATE_EMAIL');
      }
      await apiCall(page, `/api/employees/${firstId}`, 'DELETE');
      if (second.status === 201) {
        const secondId = ((second.body as Record<string, unknown>).id ?? (second.body as Record<string, unknown>)._id) as string;
        await apiCall(page, `/api/employees/${secondId}`, 'DELETE');
      }
    });

    // TC-35317e75-ca2c-41b8-b273-d847298f0ab9  SCOPE:regression
    test('[API] employees: GET /api/employees/:id returns 400 or 404 for malformed non-ObjectId string', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const invalidStr = await apiCall(page, '/api/employees/invalid-id-string', 'GET');
      expect([400, 404]).toContain(invalidStr.status);
      const specialChars = await apiCall(page, '/api/employees/!@%23%24%25%5E%26*()', 'GET');
      expect([400, 404]).toContain(specialChars.status);
      expect(specialChars.status).not.toBe(500);
      const oversized = await apiCall(page, '/api/employees/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'GET');
      expect([400, 404]).toContain(oversized.status);
      expect(oversized.status).not.toBe(500);
    });

    // TC-551b1a8f-96e7-48d9-8c3f-236b761a9b73  SCOPE:regression
    test('[API] employees: GET with special characters in ID returns 400 INVALID_ID', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const special = await apiCall(page, '/api/employees/!@%23%24%25', 'GET');
      expect(special.status).toBe(400);
      expect((special.body as Record<string, unknown>).error ?? (special.body as Record<string, unknown>).code).toBe('INVALID_ID');
      const xss = await apiCall(page, '/api/employees/%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'GET');
      expect(xss.status).toBe(400);
      expect((xss.body as Record<string, unknown>).error ?? (xss.body as Record<string, unknown>).code).toBe('INVALID_ID');
      const spaces = await apiCall(page, '/api/employees/%20%20%20', 'GET');
      expect(spaces.status).toBe(400);
      const overflow = await apiCall(page, '/api/employees/99999999999999999999', 'GET');
      expect(overflow.status).toBe(400);
    });

    // TC-943492cb-7d70-4386-8133-041c83b3051d  SCOPE:regression
    test('[API] employees: PATCH /api/employees/:id with empty body and boundary payloads', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');
      const createRes = await apiCall(page, '/api/employees', 'POST', { firstName: 'EdgePatch', lastName: 'Test', email: 'edgepatch@example.com', department: 'Engineering', designation: 'Engineer', employmentType: 'Full-Time' });
      expect(createRes.status).toBe(201);
      const id = ((createRes.body as Record<string, unknown>).id ?? (createRes.body as Record<string, unknown>)._id) as string;
      const emptyPatch = await apiCall(page, `/api/employees/${id}`, 'PATCH', {});
      expect([200, 400]).toContain(emptyPatch.status);
      expect(emptyPatch.status).not.toBe(500);
      const singleChar = await apiCall(page, `/api/employees/${id}`, 'PATCH', { firstName: 'A' });
      expect([200, 400, 422]).toContain(singleChar.status);
      expect(singleChar.status).not.toBe(500);
      const xssPatch = await apiCall(page, `/api/employees/${id}`, 'PATCH', { firstName: '<script>alert(1)</script>' });
      expect([200, 400, 422]).toContain(xssPatch.status);
      expect(xssPatch.status).not.toBe(500);
      const unknownField = await apiCall(page, `/api/employees/${id}`, 'PATCH', { unknownField: 'shouldBeIgnored', department: 'Finance' });
      expect([200, 400, 422]).toContain(unknownField.status);
      expect(unknownField.status).not.toBe(500);
      await apiCall(page, `/api/employees/${id}`, 'DELETE');
    });
  });
});

test.describe('employees — API Gap Cases', () => {
  test.describe('positive', () => { /* no positive cases in this batch */ });
  test.describe('negative', () => { /* no negative cases in this batch */ });
  test.describe('edge', () => {
    // TC-76597de2-cb60-4b23-bee8-331e20dc1d96  SCOPE:regression
    test('[API] employees: DELETE /api/employees/:id with invalid ID format returns 400 or 404', async ({ page }) => {
      await setupEmployeesMocks(page);
      await page.goto('/');

      const res1 = await apiCall(page, '/api/employees/not-a-valid-id', 'DELETE');
      expect([400, 404]).toContain(res1.status);
      const body1 = res1.body as Record<string, unknown>;
      expect(body1).toBeDefined();

      const res2 = await apiCall(page, '/api/employees/', 'DELETE');
      expect([400, 404, 405]).toContain(res2.status);

      const res3 = await apiCall(page, '/api/employees/%20%20%20', 'DELETE');
      expect([400, 404]).toContain(res3.status);

      const res4 = await apiCall(page, '/api/employees/-1', 'DELETE');
      expect([400, 404]).toContain(res4.status);
    });
  });
});
