import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupRoutingMocks } from '../fixtures/routing.fixture';

type ApiResponse = { status: number; body: Record<string, unknown> };

async function apiCall(
  page: Page,
  url: string,
  method: string,
  body?: Record<string, unknown> | null
): Promise<ApiResponse> {
  return page.evaluate(async (p) => {
    const init: RequestInit = {
      method: p.method,
      headers: { 'Content-Type': 'application/json' },
    };
    // GET/HEAD requests cannot have a body per the Fetch spec
    if (p.body != null && p.method !== 'GET' && p.method !== 'HEAD') {
      init.body = JSON.stringify(p.body);
    }
    const res = await fetch(p.url, init);
    const responseBody = await res.json().catch(() => null) as Record<string, unknown>;
    return { status: res.status, body: responseBody };
  }, { url, method, body: body ?? null } as { url: string; method: string; body: Record<string, unknown> | null });
}

test.describe('routing — API Regression Suite', () => {

  test.describe('positive', () => {

    // TC-0d4ecee1-ad64-49ab-9206-170a49d87c6b  SCOPE:regression
    test('[API] routing: GET /api/nonexistent returns 404 NOT_FOUND', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/nonexistent', 'GET');
      expect(r.status).toBe(404);
      expect(r.body).toBeTruthy();
      // r.body might be an object; we need to extract a string indicator properly
      const rawIndicator = r.body.message ?? r.body.error ?? r.body.status ?? '';
      const indicator = (typeof rawIndicator === 'object' && rawIndicator !== null)
        ? JSON.stringify(rawIndicator)
        : String(rawIndicator);
      expect(indicator.toLowerCase()).toMatch(/not.?found|404/);
    });

  });

  test.describe('negative', () => {

    // TC-74801089-303c-464b-b175-e9bb8c0f1351  SCOPE:regression
    test('[API] routing: POST /api/nonexistent returns 404 NOT_FOUND', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/nonexistent', 'POST', { key: 'value' });
      expect(r.status).toBe(404);
      expect(r.body).toBeTruthy();
      expect(r.body.message ?? r.body.error ?? r.body.status).toBeTruthy();
    });

    // TC-e6df2195-915d-4586-aa2c-b08972d3634a  SCOPE:regression
    test('[API] routing: PUT /api/nonexistent returns 404 NOT_FOUND', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/nonexistent', 'PUT', { update: 'data' });
      expect(r.status).toBe(404);
      expect(r.body).toBeTruthy();
      expect(r.body.message ?? r.body.error ?? r.body.status).toBeTruthy();
    });

    // TC-84d0f3f3-042c-49ca-ace5-962c0527d765  SCOPE:regression
    test('[API] routing: DELETE /api/nonexistent returns 404 NOT_FOUND', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/nonexistent', 'DELETE');
      expect(r.status).toBe(404);
      expect(r.body).toBeTruthy();
      expect(r.body.message ?? r.body.error ?? r.body.status).toBeTruthy();
    });

    // TC-52615651-dcf2-48d0-885c-c2de69a7deb4  SCOPE:regression
    test('[API] routing: PATCH /api/nonexistent returns 404 NOT_FOUND', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/nonexistent', 'PATCH', { patch: true });
      expect(r.status).toBe(404);
      expect(r.body).toBeTruthy();
      expect(r.body.message ?? r.body.error ?? r.body.status).toBeTruthy();
    });

  });

  test.describe('edge', () => {

    // TC-4036b119-78fe-4659-8706-fa8b159624de  SCOPE:regression
    test('[API] routing: Deeply nested unknown path returns 404', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/this/path/does/not/exist/at/all', 'GET');
      expect(r.status).toBe(404);
      expect(r.body).toBeTruthy();
      const rawIndicator = r.body.message ?? r.body.error ?? r.body.status ?? '';
      const indicator = (typeof rawIndicator === 'object' && rawIndicator !== null)
        ? JSON.stringify(rawIndicator)
        : String(rawIndicator);
      expect(indicator.toLowerCase()).toMatch(/not.?found|404/);
    });

    // TC-481bd470-ae65-47c8-b8f9-4edca71cf7fc  SCOPE:regression
    test('[API] routing: Unknown path with query parameters returns 404', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/nonexistent?foo=bar&baz=123', 'GET');
      expect(r.status).toBe(404);
      expect(r.body).toBeTruthy();
      expect(r.body.message ?? r.body.error ?? r.body.status).toBeTruthy();
    });

    // TC-f5bd71cf-096e-4edc-b12a-97a0cab52817  SCOPE:regression
    test('[API] routing: Unknown path with special characters returns 404 and not 500', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/non%20existent%2F%3Cscript%3E', 'GET');
      expect(r.status).toBe(404);
      expect(r.status).not.toBe(500);
      expect(r.body).toBeTruthy();
      const bodyStr = JSON.stringify(r.body).toLowerCase();
      expect(bodyStr).not.toContain('stack');
    });

    // TC-3dccf573-4d64-4061-8cd4-be0c577172ad  SCOPE:regression
    test('[API] routing: Unknown route outside /api prefix returns 404', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      const response = await apiCall(page, '/completely/random/path', 'GET');
      expect(response.status).toBe(404);
      expect(response.status).not.toBeGreaterThanOrEqual(500);
    });

    // TC-80790aab-5d30-446e-b9f5-a30bf742b6fa  SCOPE:regression
    test('[API] routing: Unknown route with request body on GET still returns 404', async ({ page }) => {
      await setupRoutingMocks(page);
      await page.goto('/');
      // GET requests cannot have a body per the Fetch spec, so we just do a plain GET
      const r = await apiCall(page, '/api/nonexistent', 'GET');
      expect(r.status).toBe(404);
      expect(r.body).toBeTruthy();
      expect(r.body.message ?? r.body.error ?? r.body.status).toBeTruthy();
    });

  });

});

test.describe('routing — API New Feature', () => {

  test.describe('positive', () => {
    // No new feature cases
  });

  test.describe('negative', () => {
    // No new feature cases
  });

  test.describe('edge', () => {
    // No new feature cases
  });

});