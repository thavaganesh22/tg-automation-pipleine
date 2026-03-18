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
      const id = created.body._id as string;
      expect(id).toBeTruthy();

      const patched = await apiCall(page, `/api/employees/${id}`, 'PATCH', { designation: 'Senior Engineer', employmentStatus: 'On Leave' });
      expect(patched.status).toBe(200);
      expect(patched.body.designation).toBe('Senior Engineer');
      expect(patched.body.employmentStatus).toBe('On Leave');
      expect(patched.body.firstName).toBe('Patch');
      expect(patched.body.lastName).toBe('Target');
      expect(patched.body.department).toBe('Engineering');
      expect(patched.body.employmentType).toBe('Full-Time');
      expect(patched.body.startDate).toContain('2024-01-15');

      const fetched = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(fetched.status).toBe(200);
      expect(fetched.body.designation).toBe('Senior Engineer');
      expect(fetched.body.employmentStatus).toBe('On Leave');

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
      const id = created.body._id as string;
      expect(id).toBeTruthy();

      const badStatus = await apiCall(page, `/api/employees/${id}`, 'PATCH', { employmentStatus: 'INVALID_STATUS' });
      expect([400, 422]).toContain(badStatus.status);
      expect(badStatus.body.message || badStatus.body.error || badStatus.body.errors).toBeTruthy();

      const unchanged = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(unchanged.status).toBe(200);
      expect(unchanged.body.employmentStatus).toBe('Active');
      expect(unchanged.body.designation).toBe('Analyst');

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