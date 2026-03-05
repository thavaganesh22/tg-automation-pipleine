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

interface EmployeeListResponse {
  data: Employee[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

interface EmployeeSingleResponse {
  data: Employee;
}

interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

const mockEmployees: Employee[] = [
  {
    _id: '664a1b2c3d4e5f6a7b8c9d01',
    firstName: 'Thava',
    lastName: 'Ganesh',
    email: 'thava.ganesh@company.com',
    designation: 'Tech Lead',
    department: 'Engineering',
    employmentType: 'Full-Time',
    employmentStatus: 'Active',
  },
  {
    _id: '664a1b2c3d4e5f6a7b8c9d02',
    firstName: 'Sarah',
    lastName: 'Mitchell',
    email: 'sarah.mitchell@company.com',
    designation: 'Product Manager',
    department: 'Product',
    employmentType: 'Full-Time',
    employmentStatus: 'Active',
  },
  {
    _id: '664a1b2c3d4e5f6a7b8c9d03',
    firstName: 'James',
    lastName: 'Rodriguez',
    email: 'james.rodriguez@company.com',
    designation: 'UX Designer',
    department: 'Design',
    employmentType: 'Contract',
    employmentStatus: 'On Leave',
  },
  {
    _id: '664a1b2c3d4e5f6a7b8c9d04',
    firstName: 'Emily',
    lastName: 'Chen',
    email: 'emily.chen@company.com',
    designation: 'Data Analyst',
    department: 'Analytics',
    employmentType: 'Full-Time',
    employmentStatus: 'Terminated',
  },
];

const newlyCreatedEmployee: Employee = {
  _id: '664a1b2c3d4e5f6a7b8c9d05',
  firstName: 'NewFirst',
  lastName: 'NewLast',
  email: 'newfirst.newlast@company.com',
  designation: 'Software Engineer',
  department: 'Engineering',
  employmentType: 'Full-Time',
  employmentStatus: 'Active',
};

// Track employees created via POST so GET list reflects them
const createdInDrawerTests: Employee[] = [];

export async function setupEmployeeDrawerMocks(page: Page): Promise<void> {
  // ── GET /api/employees** — list employees ──
  await page.route('**/api/employees**', async (route: Route, request: Request) => {
    const method = request.method();

    if (method === 'GET') {
      const url = new URL(request.url());
      const search = url.searchParams.get('search') || '';
      const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
      const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);

      // Simulate server error when a special query param is present
      if (url.searchParams.get('forceError') === 'true') {
        const errorResponse: ErrorResponse = {
          error: 'Internal Server Error',
          message: 'An unexpected error occurred while fetching employees.',
          statusCode: 500,
        };
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify(errorResponse),
        });
        return;
      }

      let filtered = [...mockEmployees, ...createdInDrawerTests];
      if (search) {
        const lowerSearch = search.toLowerCase();
        filtered = filtered.filter(
          (emp) =>
            emp.firstName.toLowerCase().includes(lowerSearch) ||
            emp.lastName.toLowerCase().includes(lowerSearch) ||
            emp.email.toLowerCase().includes(lowerSearch) ||
            emp.department.toLowerCase().includes(lowerSearch) ||
            emp.designation.toLowerCase().includes(lowerSearch)
        );
      }

      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / limitParam));
      const start = (pageParam - 1) * limitParam;
      const paginatedData = filtered.slice(start, start + limitParam);

      const listResponse: EmployeeListResponse = {
        data: paginatedData,
        pagination: {
          total,
          page: pageParam,
          limit: limitParam,
          pages,
        },
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(listResponse),
      });
      return;
    }

    if (method === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown> | null;

      // Validation error simulation: if required fields are missing
      if (
        !body ||
        !body.firstName ||
        !body.lastName ||
        !body.email ||
        !body.department ||
        !body.designation
      ) {
        const missingFields: string[] = [];
        if (!body?.firstName) missingFields.push('firstName');
        if (!body?.lastName) missingFields.push('lastName');
        if (!body?.email) missingFields.push('email');
        if (!body?.department) missingFields.push('department');
        if (!body?.designation) missingFields.push('designation');

        const validationError: ErrorResponse = {
          error: 'Validation Error',
          message: `Missing required fields: ${missingFields.join(', ')}`,
          statusCode: 422,
        };
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify(validationError),
        });
        return;
      }

      // Duplicate email simulation
      if (body.email === 'thava.ganesh@company.com') {
        const duplicateError: ErrorResponse = {
          error: 'Conflict',
          message: 'An employee with this email already exists.',
          statusCode: 409,
        };
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify(duplicateError),
        });
        return;
      }

      // Success: create employee
      const created: Employee = {
        ...newlyCreatedEmployee,
        firstName: (body.firstName as string) || newlyCreatedEmployee.firstName,
        lastName: (body.lastName as string) || newlyCreatedEmployee.lastName,
        email: (body.email as string) || newlyCreatedEmployee.email,
        designation: (body.designation as string) || newlyCreatedEmployee.designation,
        department: (body.department as string) || newlyCreatedEmployee.department,
        employmentType: (body.employmentType as string) || newlyCreatedEmployee.employmentType,
        employmentStatus:
          (body.employmentStatus as Employee['employmentStatus']) ||
          newlyCreatedEmployee.employmentStatus,
      };

      createdInDrawerTests.push(created);

      const successResponse: EmployeeSingleResponse = {
        data: created,
      };

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(successResponse),
      });
      return;
    }

    // Fallback for unhandled methods on this pattern
    await route.fallback();
  });

  // ── GET/PATCH/DELETE /api/employees/:id** — single employee operations ──
  await page.route('**/api/employees/*/**', async (route: Route, request: Request) => {
    const method = request.method();
    const url = request.url();

    // Extract ID from URL (last path segment before any query params)
    const pathSegments = new URL(url).pathname.split('/').filter(Boolean);
    const employeeId = pathSegments[pathSegments.length - 1];

    const foundEmployee = mockEmployees.find((emp) => emp._id === employeeId);

    if (method === 'GET') {
      if (!foundEmployee) {
        const notFoundError: ErrorResponse = {
          error: 'Not Found',
          message: `Employee with id '${employeeId}' not found.`,
          statusCode: 404,
        };
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify(notFoundError),
        });
        return;
      }

      const response: EmployeeSingleResponse = { data: foundEmployee };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
      return;
    }

    if (method === 'PATCH' || method === 'PUT') {
      if (!foundEmployee) {
        const notFoundError: ErrorResponse = {
          error: 'Not Found',
          message: `Employee with id '${employeeId}' not found.`,
          statusCode: 404,
        };
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify(notFoundError),
        });
        return;
      }

      const body = request.postDataJSON() as Record<string, unknown> | null;
      const updated: Employee = {
        ...foundEmployee,
        ...(body as Partial<Employee>),
      };

      const response: EmployeeSingleResponse = { data: updated };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
      return;
    }

    if (method === 'DELETE') {
      if (!foundEmployee) {
        const notFoundError: ErrorResponse = {
          error: 'Not Found',
          message: `Employee with id '${employeeId}' not found.`,
          statusCode: 404,
        };
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify(notFoundError),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { acknowledged: true, deletedCount: 1 } }),
      });
      return;
    }

    await route.fallback();
  });

  // ── GET /api/departments** — departments list for drawer dropdowns ──
  await page.route('**/api/departments**', async (route: Route, request: Request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }

    const departments = [
      { _id: 'dept01', name: 'Engineering' },
      { _id: 'dept02', name: 'Product' },
      { _id: 'dept03', name: 'Design' },
      { _id: 'dept04', name: 'Analytics' },
      { _id: 'dept05', name: 'Human Resources' },
    ];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: departments,
        pagination: {
          total: departments.length,
          page: 1,
          limit: 50,
          pages: 1,
        },
      }),
    });
  });

  // ── GET /api/designations** — designations list for drawer dropdowns ──
  await page.route('**/api/designations**', async (route: Route, request: Request) => {
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }

    const designations = [
      { _id: 'des01', name: 'Software Engineer' },
      { _id: 'des02', name: 'Tech Lead' },
      { _id: 'des03', name: 'Product Manager' },
      { _id: 'des04', name: 'UX Designer' },
      { _id: 'des05', name: 'Data Analyst' },
    ];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: designations,
        pagination: {
          total: designations.length,
          page: 1,
          limit: 50,
          pages: 1,
        },
      }),
    });
  });
}