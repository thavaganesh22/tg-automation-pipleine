import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupErrorHandlingMocks } from '../fixtures/error-handling.fixture';

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

test.describe('error-handling — API Gap Cases', () => {
  test.describe('positive', () => {
    // No positive cases in this batch
  });

  test.describe('negative', () => {
    // TC-2b3497e5-6bc7-5966-3633-562e8754c3be  SCOPE:regression
    test('GET /api/unknown returns 404 NOT_FOUND', async ({ page }) => {
      await setupErrorHandlingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/unknown', 'GET');
      expect(r.status).toBe(404);
      expect(r.body.error).toBe('NOT_FOUND');
      expect(typeof r.body.message).toBe('string');
      expect((r.body.message as string).length).toBeGreaterThan(0);
      const bodyStr = JSON.stringify(r.body);
      expect(bodyStr).not.toContain('stack');
      expect(bodyStr).not.toContain('node_modules');
      expect(bodyStr).not.toMatch(/\.ts:|\.js:/);
    });
  });

  test.describe('edge', () => {
    // TC-7b8d2ab9-445d-50fa-4bfa-5a685b5dbfa0  SCOPE:regression
    test('deeply nested unknown route and bare /api/ both return 404', async ({ page }) => {
      await setupErrorHandlingMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/unknown/nested/path/that/does/not/exist', 'GET');
      expect(r1.status).toBe(404);
      expect(r1.body.error).toBe('NOT_FOUND');
      expect(typeof r1.body.message).toBe('string');
      const r2 = await apiCall(page, '/api/', 'GET');
      expect(r2.status).toBe(404);
      expect(r2.body.error).toBe('NOT_FOUND');
      expect(typeof r2.body.message).toBe('string');
    });
  });
});
