import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupHealthMocks } from '../fixtures/health.fixture';

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

test.describe('health — API Regression Suite', () => {

  test.describe('positive', () => {
    // TC-4fdded8b-0d33-5f27-c59a-bffe9d992106  SCOPE:regression
    test('[API] health: GET /api/health returns 200 with ok status', async ({ page }) => {
      await setupHealthMocks(page);
      await page.goto('/');
      const r1 = await apiCall(page, '/api/health', 'GET');
      expect(r1.status).toBe(200);
      expect(r1.body.status).toBe('ok');
      expect(r1.body.timestamp).toBeTruthy();
      const services = r1.body.services as Record<string, unknown>;
      expect(services.mongodb).toBe('connected');
      // Idempotency check
      const r2 = await apiCall(page, '/api/health', 'GET');
      expect(r2.status).toBe(200);
      expect(r2.body.status).toBe('ok');
    });
  });

  test.describe('negative', () => {
    // TC-f132058b-78a9-548a-11e7-1a3f70bd72bf  SCOPE:regression
    test('[API] health: GET /api/health does not accept unsupported HTTP methods', async ({ page }) => {
      await setupHealthMocks(page);
      await page.goto('/');
      const postR = await apiCall(page, '/api/health', 'POST', {});
      expect([404, 405]).toContain(postR.status);
      const delR = await apiCall(page, '/api/health', 'DELETE');
      expect([404, 405]).toContain(delR.status);
      const putR = await apiCall(page, '/api/health', 'PUT', {});
      expect([404, 405]).toContain(putR.status);
      // Confirm endpoint still works after invalid methods
      const getR = await apiCall(page, '/api/health', 'GET');
      expect(getR.status).toBe(200);
      expect(getR.body.status).toBe('ok');
    });
  });

});