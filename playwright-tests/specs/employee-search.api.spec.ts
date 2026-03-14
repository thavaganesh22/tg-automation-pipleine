import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupEmployeeSearchMocks } from '../fixtures/employee-search.fixture';

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

test.describe('employee-search — API Regression Suite', () => {

  test.describe('positive', () => {

    // TC-1ade99ab-1e5b-56a6-6c85-2a268b5a30ad  SCOPE:regression
    test('GET /api/employees?department=Engineering returns only Engineering employees', async ({ page }) => {
      await setupEmployeeSearchMocks(page);
      await page.goto('/');

      const allR = await apiCall(page, '/api/employees', 'GET');
      expect(allR.status).toBe(200);
      const allData = allR.body.data as Record<string, unknown>[];
      const allPagination = allR.body.pagination as Record<string, unknown>;
      const departments = new Set(allData.map(e => e.department));
      expect(departments.size).toBeGreaterThanOrEqual(2);

      const filteredR = await apiCall(page, '/api/employees?department=Engineering', 'GET');
      expect(filteredR.status).toBe(200);
      const filteredData = filteredR.body.data as Record<string, unknown>[];
      const filteredPagination = filteredR.body.pagination as Record<string, unknown>;
      expect(filteredData.length).toBeGreaterThan(0);

      for (const emp of filteredData) {
        expect(emp.department).toBe('Engineering');
        expect(emp._id).toBeTruthy();
        expect(emp.firstName).toBeTruthy();
        expect(emp.lastName).toBeTruthy();
        expect(emp.email).toBeTruthy();
      }

      expect(filteredPagination.total as number).toBeLessThan(allPagination.total as number);
    });

  });

  test.describe('negative', () => {

    // TC-4345b9e6-4c25-5a2e-2386-f13389c46e31  SCOPE:regression
    test('GET /api/employees?department=NonExistentDept_XYZ returns empty result set', async ({ page }) => {
      await setupEmployeeSearchMocks(page);
      await page.goto('/');

      const r = await apiCall(page, '/api/employees?department=NonExistentDept_XYZ', 'GET');
      expect(r.status).toBe(200);
      const data = r.body.data as Record<string, unknown>[];
      expect(data.length).toBe(0);

      const emptyR = await apiCall(page, '/api/employees?department=', 'GET');
      expect(emptyR.status).not.toBe(500);
      expect(emptyR.body).toBeTruthy();
    });

  });

  test.describe('edge', () => {
    // No additional edge cases specified
  });

});