import { Page, Route, Request } from '@playwright/test';

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  mongodb: {
    status: string;
    host: string;
    name: string;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

const healthSuccessResponse: HealthResponse = {
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: 123456.789,
  mongodb: {
    status: 'connected',
    host: 'localhost:27017',
    name: 'employee_management',
  },
};

const methodNotAllowedResponse: ErrorResponse = {
  error: 'Method Not Allowed',
  message: 'The HTTP method is not allowed for this endpoint.',
  statusCode: 405,
};

const notFoundResponse: ErrorResponse = {
  error: 'Not Found',
  message: 'The requested resource was not found.',
  statusCode: 404,
};

export async function setupHealthMocks(page: Page): Promise<void> {
  // Intercept all requests to /api/health** (trailing wildcard covers query params)
  await page.route('**/api/health**', async (route: Route, request: Request) => {
    const method = request.method();

    if (method === 'GET') {
      // GET /api/health — always returns 200 ok regardless of query params or headers
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(healthSuccessResponse),
      });
    } else if (method === 'POST') {
      // POST /api/health — returns 405 Method Not Allowed (some servers may return 404)
      // Check for a custom header to simulate 404 vs 405 for testing flexibility
      const simulateNotFound = request.headers()['x-simulate-not-found'];

      if (simulateNotFound === 'true') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify(notFoundResponse),
        });
      } else {
        await route.fulfill({
          status: 405,
          contentType: 'application/json',
          body: JSON.stringify(methodNotAllowedResponse),
        });
      }
    } else if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      // Any other mutating method — also not allowed
      await route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify(methodNotAllowedResponse),
      });
    } else {
      // Fallback for OPTIONS or other methods
      await route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify(methodNotAllowedResponse),
      });
    }
  });

  // Mock employees endpoint in case health tests accidentally trigger it
  // (follows required list response format with pagination)
  await page.route('**/api/employees**', async (route: Route, request: Request) => {
    const method = request.method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              _id: '6651a1b2c3d4e5f6a7b8c9d0',
              firstName: 'Thava',
              lastName: 'Ganesh',
              email: 'thava.ganesh@example.com',
              designation: 'Tech Lead',
              department: 'Engineering',
              employmentType: 'Full-time',
              employmentStatus: 'Active' as const,
            },
            {
              _id: '6651a1b2c3d4e5f6a7b8c9d1',
              firstName: 'Sarah',
              lastName: 'Mitchell',
              email: 'sarah.mitchell@example.com',
              designation: 'Senior Developer',
              department: 'Engineering',
              employmentType: 'Full-time',
              employmentStatus: 'Active' as const,
            },
            {
              _id: '6651a1b2c3d4e5f6a7b8c9d2',
              firstName: 'James',
              lastName: 'Thornton',
              email: 'james.thornton@example.com',
              designation: 'Product Manager',
              department: 'Product',
              employmentType: 'Contract',
              employmentStatus: 'On Leave' as const,
            },
          ],
          pagination: {
            total: 3,
            page: 1,
            limit: 20,
            pages: 1,
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify(methodNotAllowedResponse),
      });
    }
  });
}