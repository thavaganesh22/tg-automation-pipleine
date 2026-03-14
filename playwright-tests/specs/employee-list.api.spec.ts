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