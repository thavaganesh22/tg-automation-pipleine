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