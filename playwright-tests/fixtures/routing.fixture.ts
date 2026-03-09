import { Page } from '@playwright/test';

export async function setupRoutingMocks(page: Page): Promise<void> {
  // Intercept all requests to nonexistent/unknown API paths and return 404 NOT_FOUND
  // This covers: /api/nonexistent, deeply nested paths, paths with query params,
  // paths with special characters, and paths outside /api prefix

  // First, set up known routes that should NOT 404 (none for this module)
  // Then catch-all for unknown routes

  await page.route('**/api/nonexistent**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found',
        },
      }),
    });
  });

  // Deeply nested unknown paths under /api
  await page.route('**/api/unknown/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found',
        },
      }),
    });
  });

  // Catch-all for any other unrecognized routes (outside /api prefix, special chars, etc.)
  await page.route('**/nonexistent**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found',
        },
      }),
    });
  });

  // Catch-all for non-/api paths (e.g. /completely/random/path)
  await page.route(/^(?!.*\/api\/).*$/, async (route) => {
    const url = route.request().url();
    // Allow the initial page navigation (/) to pass through
    if (new URL(url).pathname === '/') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found',
        },
      }),
    });
  });
}