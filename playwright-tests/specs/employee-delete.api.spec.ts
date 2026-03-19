import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupEmployeeDeleteMocks } from '../fixtures/employee-delete.fixture';

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

test.describe('employee-delete — API Regression Suite', () => {

  test.describe('positive', () => {

    // TC-5c603fbe-5e22-5983-c920-f58c6f495799  SCOPE:regression
    test('DELETE /api/employees/:id successfully removes an existing employee', async ({ page }) => {
      await setupEmployeeDeleteMocks(page);
      await page.goto('/');

      const payload = { firstName: 'Delete', lastName: 'Target', email: `delete.target+${Date.now()}@example.com`, designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' } };
      const created = await apiCall(page, '/api/employees', 'POST', payload);
      expect(created.status).toBe(201);
      const id = created.body._id as string;
      expect(id).toBeTruthy();

      const getBefore = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(getBefore.status).toBe(200);
      expect(getBefore.body._id).toBe(id);

      const del = await apiCall(page, `/api/employees/${id}`, 'DELETE');
      expect(del.status).toBe(204);

      const getAfter = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(getAfter.status).toBe(404);
      expect(getAfter.body.error || getAfter.body.message).toBeTruthy();

      const list = await apiCall(page, '/api/employees?limit=100', 'GET');
      expect(list.status).toBe(200);
      const data = list.body.data as Record<string, unknown>[];
      expect(data.some((e) => e._id === id)).toBe(false);
    });

  });

  test.describe('negative', () => {

    // TC-61ed95d1-acb2-5e9c-44c8-effb09190633  SCOPE:regression
    test('DELETE /api/employees/:id returns 404 for non-existent or already-deleted ID, 400 for malformed ID', async ({ page }) => {
      await setupEmployeeDeleteMocks(page);
      await page.goto('/');

      // Non-existent valid ObjectId
      const r1 = await apiCall(page, '/api/employees/000000000000000000000000', 'DELETE');
      expect(r1.status).toBe(404);
      expect(r1.body.error || r1.body.message).toBeTruthy();

      // Create then delete, then delete again
      const payload = { firstName: 'Double', lastName: 'Delete', email: `double.delete+${Date.now()}@example.com`, designation: 'Analyst', department: 'Operations', employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-03-01', address: { street: '456 Edge Ave', city: 'Edge City', country: 'United States' } };
      const created = await apiCall(page, '/api/employees', 'POST', payload);
      expect(created.status).toBe(201);
      const newId = created.body._id as string;
      expect(newId).toBeTruthy();

      const del1 = await apiCall(page, `/api/employees/${newId}`, 'DELETE');
      expect(del1.status).toBe(204);

      const del2 = await apiCall(page, `/api/employees/${newId}`, 'DELETE');
      expect(del2.status).toBe(404);
      expect(del2.body.error || del2.body.message).toBeTruthy();

      // Malformed ID
      const r3 = await apiCall(page, '/api/employees/not-a-valid-id', 'DELETE');
      expect(r3.status).toBe(400);
      expect(r3.body.error || r3.body.message).toBeTruthy();
    });

  });

});