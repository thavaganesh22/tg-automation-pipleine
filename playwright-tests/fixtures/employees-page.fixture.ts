import { Page } from '@playwright/test';

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

const allEmployees: Employee[] = [
  {
    _id: '665a1b2c3d4e5f6a7b8c9d01',
    firstName: 'Thava',
    lastName: 'Ganesh',
    email: 'thava.ganesh@company.com',
    designation: 'Tech Lead',
    department: 'Engineering',
    employmentType: 'Full-Time',
    employmentStatus: 'Active',
  },
  {
    _id: '665a1b2c3d4e5f6a7b8c9d02',
    firstName: 'Sara',
    lastName: 'Mitchell',
    email: 'sara.mitchell@company.com',
    designation: 'Product Manager',
    department: 'Product',
    employmentType: 'Full-Time',
    employmentStatus: 'Active',
  },
  {
    _id: '665a1b2c3d4e5f6a7b8c9d03',
    firstName: 'James',
    lastName: 'Parker',
    email: 'james.parker@company.com',
    designation: 'UX Designer',
    department: 'Design',
    employmentType: 'Contract',
    employmentStatus: 'Active',
  },
  {
    _id: '665a1b2c3d4e5f6a7b8c9d04',
    firstName: 'Linda',
    lastName: 'Nguyen',
    email: 'linda.nguyen@company.com',
    designation: 'Backend Engineer',
    department: 'Engineering',
    employmentType: 'Full-Time',
    employmentStatus: 'Terminated',
  },
  {
    _id: '665a1b2c3d4e5f6a7b8c9d05',
    firstName: 'Carlos',
    lastName: 'Rivera',
    email: 'carlos.rivera@company.com',
    designation: 'QA Engineer',
    department: 'Engineering',
    employmentType: 'Part-Time',
    employmentStatus: 'Active',
  },
];

function buildPaginatedResponse(employees: Employee[], page: number, limit: number): EmployeeListResponse {
  const total = employees.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const paged = employees.slice(start, start + limit);

  return {
    data: paged,
    pagination: {
      total,
      page,
      limit,
      pages,
    },
  };
}

function filterEmployees(
  search?: string,
  department?: string,
  status?: string,
): Employee[] {
  let result = [...allEmployees];

  if (search && search.trim().length > 0) {
    const term = search.trim().toLowerCase();
    result = result.filter(
      (e) =>
        e.firstName.toLowerCase().includes(term) ||
        e.lastName.toLowerCase().includes(term) ||
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(term),
    );
  }

  if (department) {
    result = result.filter(
      (e) => e.department.toLowerCase() === department.toLowerCase(),
    );
  }

  if (status) {
    result = result.filter(
      (e) => e.employmentStatus.toLowerCase() === status.toLowerCase(),
    );
  }

  return result;
}

export async function setupEmployeesPageMocks(page: Page): Promise<void> {
  // --- Employee list endpoint (GET) ---
  await page.route('**/api/employees**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url(), 'http://localhost');

    if (method === 'GET') {
      // Check for error simulation param
      const simulateError = url.searchParams.get('simulateError');
      if (simulateError === '500') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred while fetching employees.',
          }),
        });
        return;
      }

      if (simulateError === '404') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Not Found',
            message: 'The requested resource was not found.',
          }),
        });
        return;
      }

      const search = url.searchParams.get('search') ?? undefined;
      const department = url.searchParams.get('department') ?? undefined;
      const status = url.searchParams.get('status') ?? undefined;
      const pageNum = parseInt(url.searchParams.get('page') ?? '1', 10);
      const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

      // Whitespace-only search → treat as no search (return all)
      const effectiveSearch = search && search.trim().length > 0 ? search : undefined;

      const filtered = filterEmployees(effectiveSearch, department, status);
      const response = buildPaginatedResponse(filtered, pageNum, limit);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
      return;
    }

    if (method === 'POST') {
      const body = request.postDataJSON() as Partial<Employee> | null;

      if (!body || !body.firstName || !body.lastName || !body.email) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Bad Request',
            message: 'firstName, lastName, and email are required fields.',
          }),
        });
        return;
      }

      const newEmployee: Employee = {
        _id: '665a1b2c3d4e5f6a7b8c9d99',
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        designation: body.designation ?? 'Unknown',
        department: body.department ?? 'General',
        employmentType: body.employmentType ?? 'Full-Time',
        employmentStatus: body.employmentStatus ?? 'Active',
      };

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: newEmployee }),
      });
      return;
    }

    if (method === 'PATCH' || method === 'PUT') {
      const body = request.postDataJSON() as Partial<Employee> | null;

      // Extract ID from URL like /api/employees/:id
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const employeeId = pathSegments[pathSegments.length - 1];

      const existing = allEmployees.find((e) => e._id === employeeId);

      if (!existing) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Not Found',
            message: `Employee with ID ${employeeId} not found.`,
          }),
        });
        return;
      }

      const updated: Employee = { ...existing, ...body };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: updated }),
      });
      return;
    }

    if (method === 'DELETE') {
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const employeeId = pathSegments[pathSegments.length - 1];

      const existing = allEmployees.find((e) => e._id === employeeId);

      if (!existing) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Not Found',
            message: `Employee with ID ${employeeId} not found.`,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: existing, message: 'Employee deleted successfully.' }),
      });
      return;
    }

    // Fallback for unsupported methods
    await route.fulfill({
      status: 405,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Method Not Allowed',
        message: `Method ${method} is not supported on this endpoint.`,
      }),
    });
  });

  // --- Departments list endpoint (for filter dropdowns) ---
  await page.route('**/api/departments**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { _id: 'dept-01', name: 'Engineering' },
            { _id: 'dept-02', name: 'Product' },
            { _id: 'dept-03', name: 'Design' },
            { _id: 'dept-04', name: 'Marketing' },
            { _id: 'dept-05', name: 'Human Resources' },
          ],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 405,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    });
  });

  // --- Employment statuses endpoint (for filter dropdowns) ---
  await page.route('**/api/employment-statuses**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: ['Active', 'On Leave', 'Terminated'],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 405,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    });
  });
}

export async function setupEmptyEmployeesPageMocks(page: Page): Promise<void> {
  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { total: 0, page: 1, limit: 20, pages: 0 } }),
      });
      return;
    }
    await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Method Not Allowed' }) });
  });
  await page.route('**/api/departments**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });
  await page.route('**/api/employment-statuses**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: ['Active', 'On Leave', 'Terminated'] }) });
  });
}

export async function setupSingleEmployeePageMocks(page: Page): Promise<void> {
  const singleEmployee: Employee = {
    _id: '665a1b2c3d4e5f6a7b8c9d01',
    firstName: 'Thava',
    lastName: 'Ganesh',
    email: 'thava.ganesh@company.com',
    designation: 'Tech Lead',
    department: 'Engineering',
    employmentType: 'Full-Time',
    employmentStatus: 'Active',
  };

  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [singleEmployee], pagination: { total: 1, page: 1, limit: 20, pages: 1 } }),
      });
      return;
    }
    await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Method Not Allowed' }) });
  });
  await page.route('**/api/departments**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ _id: 'dept-01', name: 'Engineering' }] }) });
  });
  await page.route('**/api/employment-statuses**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: ['Active', 'On Leave', 'Terminated'] }) });
  });
}