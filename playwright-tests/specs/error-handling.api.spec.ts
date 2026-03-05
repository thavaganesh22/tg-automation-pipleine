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

test.describe('error-handling — API Regression Suite', () => {

  test.describe('positive', () => {
    // TC-721b8f50-2bf1-4ee6-9d6f-d5201748e983  SCOPE:regression
    test('[API] error-handling: Unknown GET route returns 404 NOT_FOUND with error payload', async ({ page }) => {
      await setupErrorHandlingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/nonexistent', 'GET');
      expect(r.status).toBe(404);
      expect(r.body).toBeTruthy();
      const hasErrorIndication =
        r.body.statusCode === 404 ||
        (typeof r.body.message === 'string' && r.body.message.toLowerCase().includes('not found')) ||
        (typeof r.body.error === 'string' && r.body.error.toLowerCase().includes('not found'));
      expect(hasErrorIndication).toBe(true);
    });
  });

  test.describe('negative', () => {
    // TC-f99b002f-13d3-4000-908d-d8964b7936c0  SCOPE:regression
    test('[API] error-handling: Unknown POST route returns 404 NOT_FOUND regardless of HTTP method', async ({ page }) => {
      await setupErrorHandlingMocks(page);
      await page.goto('/');

      const postR = await apiCall(page, '/api/nonexistent', 'POST', { key: 'value' });
      expect(postR.status).toBe(404);
      expect(postR.body.message || postR.body.error || postR.body.statusCode).toBeTruthy();

      const putR = await apiCall(page, '/api/nonexistent', 'PUT', { key: 'value' });
      expect(putR.status).toBe(404);
      expect(putR.body.message || putR.body.error || putR.body.statusCode).toBeTruthy();

      const delR = await apiCall(page, '/api/nonexistent', 'DELETE');
      expect(delR.status).toBe(404);
      expect(delR.body.message || delR.body.error || delR.body.statusCode).toBeTruthy();

      const patchR = await apiCall(page, '/api/nonexistent', 'PATCH', { key: 'updated' });
      expect(patchR.status).toBe(404);
      expect(patchR.body.message || patchR.body.error || patchR.body.statusCode).toBeTruthy();
    });
  });

  test.describe('edge', () => {
    // TC-730c13a2-6ea4-4faf-81a9-37be834e774b  SCOPE:regression
    test('[API] error-handling: Deeply nested unknown API path returns 404 NOT_FOUND', async ({ page }) => {
      await setupErrorHandlingMocks(page);
      await page.goto('/');

      const deepR = await apiCall(page, '/api/a/b/c/d/e/f/nonexistent', 'GET');
      expect(deepR.status).toBe(404);
      expect(deepR.body).toBeTruthy();
      const deepHasError = deepR.body.statusCode === 404 || (typeof deepR.body.message === 'string' && deepR.body.message.toLowerCase().includes('not found'));
      expect(deepHasError).toBe(true);

      const encodedR = await apiCall(page, '/api/nonexistent%2F%2F%2Fpath', 'GET');
      expect(encodedR.status).toBe(404);
      expect(encodedR.body.message || encodedR.body.error || encodedR.body.statusCode).toBeTruthy();

      const qsR = await apiCall(page, '/api/nonexistent?foo=bar&baz=qux', 'GET');
      expect(qsR.status).toBe(404);
      expect(qsR.body.message || qsR.body.error || qsR.body.statusCode).toBeTruthy();
    });
  });
});

test.describe('error-handling — API New Feature', () => {

  test.describe('positive', () => {
    // No new-feature positive cases defined
  });

  test.describe('negative', () => {
    // No new-feature negative cases defined
  });

  test.describe('edge', () => {
    // No new-feature edge cases defined
  });
});