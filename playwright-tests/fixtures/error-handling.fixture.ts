import { Page, Route, Request } from '@playwright/test';

interface Employee {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  department: string;
  employmentType: string;
  employmentStatus: 'Active' | 'On Leave' | 'Terminated';
}

interface PaginatedResponse {
  data: Employee[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

interface ErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string;
}

const mockEmployees: Employee[] = [
  {
    _id: '664a1f2e3b1c4e5d6f7a8b01',
    firstName: 'Thava',
    lastName: 'Ganesh',
    email: 'thava.ganesh@company.com',
    designation: 'Tech Lead',
    department: 'Engineering',
    employmentType: 'Full-Time',
    employmentStatus: 'Active',
  },
  {
    _id: '664a1f2e3b1c4e5d6f7a8b02',
    firstName: 'Maria',
    lastName: 'Santos',
    email: 'maria.santos@company.com',
    designation: 'Product Manager',
    department: 'Product',
    employmentType: 'Full-Time',
    employmentStatus: 'On Leave',
  },
  {
    _id: '664a1f2e3b1c4e5d6f7a8b03',
    firstName: 'James',
    lastName: 'O\'Brien',
    email: 'james.obrien@company.com',
    designation: 'QA Engineer',
    department: 'Quality Assurance',
    employmentType: 'Contract',
    employmentStatus: 'Terminated',
  },
];

const mockPaginatedResponse: PaginatedResponse = {
  data: mockEmployees,
  pagination: {
    total: 3,
    page: 1,
    limit: 20,
    pages: 1,
  },
};

const notFoundErrorResponse: ErrorResponse = {
  success: false,
  statusCode: 404,
  error: 'NOT_FOUND',
  message: 'The requested resource was not found',
};

const internalServerErrorResponse: ErrorResponse = {
  success: false,
  statusCode: 500,
  error: 'INTERNAL_SERVER_ERROR',
  message: 'An unexpected error occurred',
};

export async function setupErrorHandlingMocks(page: Page): Promise<void> {
  // Mock known employee endpoints (GET list)
  await page.route('**/api/employees**', async (route: Route, request: Request) => {
    const method = request.method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPaginatedResponse),
      });
    } else if (method === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown> | null;
      if (body && body.firstName && body.lastName && body.email) {
        const newEmployee: Employee = {
          _id: '664a1f2e3b1c4e5d6f7a8b04',
          firstName: String(body.firstName),
          lastName: String(body.lastName),
          email: String(body.email),
          designation: String(body.designation ?? 'Engineer'),
          department: String(body.department ?? 'Engineering'),
          employmentType: String(body.employmentType ?? 'Full-Time'),
          employmentStatus: 'Active',
        };
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ data: newEmployee }),
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            statusCode: 400,
            error: 'BAD_REQUEST',
            message: 'Missing required fields: firstName, lastName, email',
          }),
        });
      }
    } else if (method === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockEmployees[0] }),
      });
    } else if (method === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Employee deleted' }),
      });
    } else {
      await route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          statusCode: 405,
          error: 'METHOD_NOT_ALLOWED',
          message: `Method ${method} is not allowed`,
        }),
      });
    }
  });

  // Mock unknown/non-existent shallow API routes — e.g. /api/nonexistent, /api/unknown-route
  // This catches any /api/<single-segment> that is NOT "employees"
  await page.route('**/api/!(employees)**', async (route: Route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify(notFoundErrorResponse),
    });
  });

  // Mock deeply nested unknown API paths — e.g. /api/foo/bar/baz/qux
  await page.route('**/api/*/*/**', async (route: Route) => {
    const url = route.request().url();
    // Allow known nested routes like /api/employees/<id>
    if (url.includes('/api/employees/')) {
      const method = route.request().method();
      if (method === 'GET') {
        // Simulate fetching a single employee by ID
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockEmployees[0] }),
        });
      } else if (method === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockEmployees[0] }),
        });
      } else if (method === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Employee deleted' }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify(notFoundErrorResponse),
        });
      }
      return;
    }

    // All other deeply nested unknown paths return 404
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify(notFoundErrorResponse),
    });
  });

  // Catch-all for any unknown route under /api that slips through
  await page.route('**/api/**', async (route: Route) => {
    const url = route.request().url();

    // Let known endpoints pass through to their specific handlers
    if (url.includes('/api/employees')) {
      await route.fallback();
      return;
    }

    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify(notFoundErrorResponse),
      });
    } else if (method === 'POST') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify(notFoundErrorResponse),
      });
    } else if (method === 'PUT') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify(notFoundErrorResponse),
      });
    } else if (method === 'PATCH') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify(notFoundErrorResponse),
      });
    } else if (method === 'DELETE') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify(notFoundErrorResponse),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify(notFoundErrorResponse),
      });
    }
  });

  // Mock server error simulation — trigger with header X-Simulate-Error: 500
  await page.route('**/api/error-simulation**', async (route: Route) => {
    const headers = route.request().headers();
    if (headers['x-simulate-error'] === '500') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify(internalServerErrorResponse),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify(notFoundErrorResponse),
      });
    }
  });
}