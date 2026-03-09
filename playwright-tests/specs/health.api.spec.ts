import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { setupHealthMocks } from "../fixtures/health.fixture";

type ApiResponse = { status: number; body: Record<string, unknown> };

async function apiCall(
  page: Page,
  url: string,
  method: string,
  body?: Record<string, unknown> | null
): Promise<ApiResponse> {
  return page.evaluate(
    async (p) => {
      const res = await fetch(p.url, {
        method: p.method,
        headers: { "Content-Type": "application/json" },
        body: p.body != null ? JSON.stringify(p.body) : undefined,
      });
      const responseBody = (await res.json().catch(() => null)) as Record<string, unknown>;
      return { status: res.status, body: responseBody };
    },
    { url, method, body: body ?? null } as {
      url: string;
      method: string;
      body: Record<string, unknown> | null;
    }
  );
}

test.describe("health — API Regression Suite", () => {
  test.describe("positive", () => {
    // TC-b9e1caaf-044b-41f8-9e62-f702dcc451ab  SCOPE:regression
    test("[API] health: GET /api/health returns 200 with ok status and mongodb info", async ({
      page,
    }) => {
      await setupHealthMocks(page);
      await page.goto("/");
      const r = await apiCall(page, "/api/health", "GET");
      expect(r.status).toBe(200);
      expect(r.body.status).toBe("ok");
      expect(r.body.mongodb ?? r.body.database).toBeDefined();
      expect(r.body.error).toBeUndefined();
      expect(r.body.exception).toBeUndefined();
      expect(r.body.stack).toBeUndefined();
    });
  });

  test.describe("negative", () => {
    // TC-555ec2be-46ac-4ccb-b8ce-5beac165eef2  SCOPE:regression
    test("[API] health: POST /api/health returns 404 or 405 Method Not Allowed", async ({
      page,
    }) => {
      await setupHealthMocks(page);
      await page.goto("/");
      const post = await apiCall(page, "/api/health", "POST", { test: true });
      expect([404, 405]).toContain(post.status);
      expect(post.body.status).not.toBe("ok");

      const put = await apiCall(page, "/api/health", "PUT", { test: true });
      expect([404, 405]).toContain(put.status);
      expect(put.body.status).not.toBe("ok");

      const del = await apiCall(page, "/api/health", "DELETE");
      expect([404, 405]).toContain(del.status);
      expect(del.body.status).not.toBe("ok");
    });
  });

  test.describe("edge", () => {
    // TC-2d5ad258-44b9-406d-ac85-0fda4f26fd69  SCOPE:regression
    test("[API] health: GET /api/health with unexpected query params and headers still returns 200 ok", async ({
      page,
    }) => {
      await setupHealthMocks(page);
      await page.goto("/");

      const r1 = await apiCall(page, "/api/health?foo=bar&baz=123", "GET");
      expect(r1.status).toBe(200);
      expect(r1.body.status).toBe("ok");

      const r2 = await page.evaluate(async () => {
        const res = await fetch("/api/health", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Custom-Header": "test-value",
            "X-Request-Id": "999",
          },
        });
        const body = (await res.json().catch(() => null)) as Record<string, unknown>;
        return { status: res.status, body };
      });
      expect(r2.status).toBe(200);
      expect(r2.body.status).toBe("ok");
      expect(r2.body.mongodb ?? r2.body.database).toBeDefined();

      const r3 = await page.evaluate(async () => {
        const res = await fetch("/api/health", {
          method: "GET",
          headers: { Accept: "text/xml" },
        });
        const body = (await res.json().catch(() => null)) as Record<string, unknown>;
        return { status: res.status, body };
      });
      expect(r3.status).toBe(200);
      expect(r3.body.status).toBe("ok");
    });
  });
});
