import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupEmployeeEditMocks } from '../fixtures/employee-edit.fixture';

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

function getData(body: Record<string, unknown>): Record<string, unknown> {
  if (body && typeof body === 'object' && 'data' in body && body.data && typeof body.data === 'object') {
    return body.data as Record<string, unknown>;
  }
  return body;
}

test.describe('employee-edit — API Regression Suite', () => {

  test.describe('positive', () => {
    // TC-a875272a-dd50-5ada-d715-c638d540c263  SCOPE:regression
    test('PATCH /api/employees/:id successfully updates designation and employmentStatus', async ({ page }) => {
      await setupEmployeeEditMocks(page);
      await page.goto('/');

      const ts = Date.now();
      const payload = { firstName: 'Patch', lastName: 'Target', email: `patch.target+${ts}@example.com`, designation: 'Junior Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '1 Test Ave', city: 'Test City', country: 'United States' } };
      const created = await apiCall(page, '/api/employees', 'POST', payload);
      expect(created.status).toBe(201);
      const createdData = getData(created.body);
      const id = createdData._id as string;
      expect(id).toBeTruthy();

      const patched = await apiCall(page, `/api/employees/${id}`, 'PATCH', { designation: 'Senior Engineer', employmentStatus: 'On Leave' });
      expect(patched.status).toBe(200);
      const patchedData = getData(patched.body);
      expect(patchedData.designation).toBe('Senior Engineer');
      expect(patchedData.employmentStatus).toBe('On Leave');
      expect(patchedData.firstName).toBe('Patch');
      expect(patchedData.lastName).toBe('Target');
      expect(patchedData.department).toBe('Engineering');
      expect(patchedData.employmentType).toBe('Full-Time');
      expect(patchedData.startDate).toContain('2024-01-15');

      const fetched = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(fetched.status).toBe(200);
      const fetchedData = getData(fetched.body);
      expect(fetchedData.designation).toBe('Senior Engineer');
      expect(fetchedData.employmentStatus).toBe('On Leave');

      await apiCall(page, `/api/employees/${id}`, 'DELETE');
    });
  });

  test.describe('negative', () => {
    // TC-79d11d4b-83e0-587e-e51e-186f243e2cbd  SCOPE:regression
    test('PATCH /api/employees/:id rejects invalid field values with 400/422', async ({ page }) => {
      await setupEmployeeEditMocks(page);
      await page.goto('/');

      const ts = Date.now();
      const payload = { firstName: 'Invalid', lastName: 'PatchTarget', email: `invalid.patch+${ts}@example.com`, designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', address: { street: '99 Edge Rd', city: 'Edge City', country: 'United States' } };
      const created = await apiCall(page, '/api/employees', 'POST', payload);
      expect(created.status).toBe(201);
      const createdData = getData(created.body);
      const id = createdData._id as string;
      expect(id).toBeTruthy();

      const badStatus = await apiCall(page, `/api/employees/${id}`, 'PATCH', { employmentStatus: 'INVALID_STATUS' });
      expect([400, 422]).toContain(badStatus.status);
      expect(badStatus.body.message || badStatus.body.error).toBeTruthy();

      const emptyDesig = await apiCall(page, `/api/employees/${id}`, 'PATCH', { designation: '' });
      expect([400, 422]).toContain(emptyDesig.status);
      expect(emptyDesig.body.message || emptyDesig.body.error).toBeTruthy();

      const unchanged = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(unchanged.status).toBe(200);
      const unchangedData = getData(unchanged.body);
      expect(unchangedData.employmentStatus).toBe('Active');
      expect(unchangedData.designation).toBe('Analyst');

      const notFound = await apiCall(page, '/api/employees/000000000000000000000000', 'PATCH', { designation: 'Senior Analyst' });
      expect(notFound.status).toBe(404);
      expect(notFound.body.message || notFound.body.error).toBeTruthy();

      await apiCall(page, `/api/employees/${id}`, 'DELETE');
    });
  });

  test.describe('edge', () => {
    // No edge cases specified for this module
  });
});