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

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface EmployeeListResponse {
  data: Employee[];
  pagination: PaginationMeta;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: { field: string; message: string }[];
}

const mockEmployees: Employee[] = [
  {
    _id: '507f1f77bcf86cd799439011',
    firstName: 'Thava',
    lastName: 'Ganesh',
    email: 'thava.ganesh@company.com',
    designation: 'Tech Lead',
    department: 'Engineering',
    employmentType: 'Full-Time',
    employmentStatus: 'Active',
  },
  {
    _id: '507f1f77bcf86cd799439012',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah.johnson@company.com',
    designation: 'Product Manager',
    department: 'Product',
    employmentType: 'Full-Time',
    employmentStatus: 'On Leave',
  },
  {
    _id: '507f1f77bcf86cd799439013',
    firstName: 'Marcus',
    lastName: 'Chen',
    email: 'marcus.chen@company.com',
    designation: 'Senior Developer',
    department: 'Engineering',
    employmentType: 'Contract',
    employmentStatus: 'Active',
  },
  {
    _id: '507f1f77bcf86cd799439014',
    firstName: 'Olivia',
    lastName: 'Martinez',
    email: 'olivia.martinez@company.com',
    designation: 'HR Specialist',
    department: 'Human Resources',
    employmentType: 'Full-Time',
    employmentStatus: 'Terminated',
  },
  {
    _id: '507f1f77bcf86cd799439015',
    firstName: 'James',
    lastName: 'Wilson',
    email: 'james.wilson@company.com',
    designation: 'DevOps Engineer',
    department: 'Engineering',
    employmentType: 'Full-Time',
    employmentStatus: 'Active',
  },
];

const VALID_DEPARTMENTS = ['Engineering', 'Product', 'Human Resources', 'Finance', 'Marketing'];
const VALID_STATUSES: string[] = ['Active', 'On Leave', 'Terminated'];

function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

function parseQueryParams(url: string): URLSearchParams {
  try {
    const urlObj = new URL(url, 'http://localhost');
    return urlObj.searchParams;
  } catch {
    return new URLSearchParams();
  }
}

// Track created employees and deleted employee IDs for stateful mocking
const createdEmployees: Employee[] = [];
const deletedEmployeeIds: Set<string> = new Set();

export async function setupEmployeesMocks(page: Page): Promise<void> {
  // ─── LIST / SEARCH / FILTER: GET /api/employees ───
  await page.route('**/api/employees**', async (route: Route, request: Request) => {
    const method = request.method();
    const url = request.url();

    // ── Distinguish single-resource routes like /api/employees/:id ──
    const singleResourceMatch = url.match(/\/api\/employees\/([^?/]+)/);

    if (singleResourceMatch) {
      const id = decodeURIComponent(singleResourceMatch[1]);

      // ── GET /api/employees/:id ──
      if (method === 'GET') {
        // Check for special characters or malformed IDs
        if (/[^0-9a-fA-F]/.test(id) || id.length !== 24) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'INVALID_ID',
              message: `Invalid employee ID format: "${id}"`,
            } satisfies ErrorResponse),
          });
          return;
        }

        if (!isValidObjectId(id)) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'INVALID_ID',
              message: `Invalid employee ID format: "${id}"`,
            } satisfies ErrorResponse),
          });
          return;
        }

        // Check if deleted
        if (deletedEmployeeIds.has(id)) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'NOT_FOUND',
              message: `Employee with ID "${id}" not found`,
            } satisfies ErrorResponse),
          });
          return;
        }

        // Find in mock data or created employees
        const allEmployees = [...mockEmployees, ...createdEmployees];
        const employee = allEmployees.find((e) => e._id === id);

        if (employee) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(employee),
          });
        } else {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'NOT_FOUND',
              message: `Employee with ID "${id}" not found`,
            } satisfies ErrorResponse),
          });
        }
        return;
      }

      // ── PATCH /api/employees/:id ──
      if (method === 'PATCH') {
        if (!isValidObjectId(id)) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'INVALID_ID',
              message: `Invalid employee ID format: "${id}"`,
            } satisfies ErrorResponse),
          });
          return;
        }

        if (deletedEmployeeIds.has(id)) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'NOT_FOUND',
              message: `Employee with ID "${id}" not found`,
            } satisfies ErrorResponse),
          });
          return;
        }

        const allEmployees = [...mockEmployees, ...createdEmployees];
        const existingEmployee = allEmployees.find((e) => e._id === id);

        if (!existingEmployee) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'NOT_FOUND',
              message: `Employee with ID "${id}" not found`,
            } satisfies ErrorResponse),
          });
          return;
        }

        let body: Record<string, unknown>;
        try {
          body = JSON.parse(request.postData() || '{}');
        } catch {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'INVALID_JSON',
              message: 'Request body must be valid JSON',
            } satisfies ErrorResponse),
          });
          return;
        }

        // Validate fields if provided
        const validationErrors: { field: string; message: string }[] = [];

        if ('email' in body && typeof body.email === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(body.email)) {
            validationErrors.push({ field: 'email', message: 'Invalid email format' });
          }
        }

        if ('employmentStatus' in body && !VALID_STATUSES.includes(body.employmentStatus as string)) {
          validationErrors.push({
            field: 'employmentStatus',
            message: `Must be one of: ${VALID_STATUSES.join(', ')}`,
          });
        }

        if ('firstName' in body && (typeof body.firstName !== 'string' || body.firstName.trim() === '')) {
          validationErrors.push({ field: 'firstName', message: 'firstName must be a non-empty string' });
        }

        if ('lastName' in body && (typeof body.lastName !== 'string' || body.lastName.trim() === '')) {
          validationErrors.push({ field: 'lastName', message: 'lastName must be a non-empty string' });
        }

        if (validationErrors.length > 0) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'VALIDATION_ERROR',
              message: 'Validation failed',
              details: validationErrors,
            } satisfies ErrorResponse),
          });
          return;
        }

        const updatedEmployee: Employee = {
          ...existingEmployee,
          ...(body as Partial<Employee>),
          _id: existingEmployee._id, // prevent _id overwrite
        };

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updatedEmployee),
        });
        return;
      }

      // ── DELETE /api/employees/:id ──
      if (method === 'DELETE') {
        if (!isValidObjectId(id)) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'INVALID_ID',
              message: `Invalid employee ID format: "${id}"`,
            } satisfies ErrorResponse),
          });
          return;
        }

        if (deletedEmployeeIds.has(id)) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'NOT_FOUND',
              message: `Employee with ID "${id}" not found`,
            } satisfies ErrorResponse),
          });
          return;
        }

        const allEmployees = [...mockEmployees, ...createdEmployees];
        const employeeToDelete = allEmployees.find((e) => e._id === id);

        if (!employeeToDelete) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'NOT_FOUND',
              message: `Employee with ID "${id}" not found`,
            } satisfies ErrorResponse),
          });
          return;
        }

        deletedEmployeeIds.add(id);

        await route.fulfill({
          status: 204,
          body: '',
        });
        return;
      }

      // Fallback for unsupported methods on single resource
      await route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'METHOD_NOT_ALLOWED',
          message: `Method ${method} not allowed on this resource`,
        }),
      });
      return;
    }

    // ── POST /api/employees ──
    if (method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(request.postData() || '{}');
      } catch {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'INVALID_JSON',
            message: 'Request body must be valid JSON',
          } satisfies ErrorResponse),
        });
        return;
      }

      // Check empty body
      if (Object.keys(body).length === 0) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: [
              { field: 'firstName', message: 'firstName is required' },
              { field: 'lastName', message: 'lastName is required' },
              { field: 'email', message: 'email is required' },
              { field: 'designation', message: 'designation is required' },
              { field: 'department', message: 'department is required' },
              { field: 'employmentType', message: 'employmentType is required' },
            ],
          } satisfies ErrorResponse),
        });
        return;
      }

      // Validate required fields
      const requiredFields = ['firstName', 'lastName', 'email', 'designation', 'department', 'employmentType'];
      const missingFields = requiredFields.filter(
        (field) => !(field in body) || body[field] === '' || body[field] === null || body[field] === undefined
      );

      if (missingFields.length > 0) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: missingFields.map((field) => ({
              field,
              message: `${field} is required`,
            })),
          } satisfies ErrorResponse),
        });
        return;
      }

      // Check duplicate email (case-insensitive)
      const allEmployees = [...mockEmployees, ...createdEmployees];
      const emailLower = (body.email as string).toLowerCase();
      const duplicate = allEmployees.find(
        (e) => e.email.toLowerCase() === emailLower && !deletedEmployeeIds.has(e._id)
      );

      if (duplicate) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'DUPLICATE_EMAIL',
            message: `An employee with email "${body.email}" already exists`,
          } satisfies ErrorResponse),
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof body.email !== 'string' || !emailRegex.test(body.email)) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: [{ field: 'email', message: 'Invalid email format' }],
          } satisfies ErrorResponse),
        });
        return;
      }

      // Create employee
      const newId =
        '507f1f77bcf86cd799439' +
        (100 + createdEmployees.length).toString().padStart(3, '0');
      const newEmployee: Employee = {
        _id: newId,
        firstName: body.firstName as string,
        lastName: body.lastName as string,
        email: body.email as string,
        designation: body.designation as string,
        department: body.department as string,
        employmentType: body.employmentType as string,
        employmentStatus: (body.employmentStatus as Employee['employmentStatus']) || 'Active',
      };

      createdEmployees.push(newEmployee);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newEmployee),
      });
      return;
    }

    // ── GET /api/employees (list, search, filter) ──
    if (method === 'GET') {
      const params = parseQueryParams(url);
      const pageParam = params.get('page');
      const limitParam = params.get('limit');
      const department = params.get('department');
      const status = params.get('status');
      const search = params.get('search') || params.get('q') || params.get('name');

      // Validate pagination parameters
      const pageNum = pageParam ? parseInt(pageParam, 10) : 1;
      const limitNum = limitParam ? parseInt(limitParam, 10) : 20;

      if (
        (pageParam !== null && (isNaN(pageNum) || pageNum < 1)) ||
        (limitParam !== null && (isNaN(limitNum) || limitNum < 1 || limitNum > 100))
      ) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'INVALID_PAGINATION',
            message: 'page must be >= 1 and limit must be between 1 and 100',
          } satisfies ErrorResponse),
        });
        return;
      }

      // Build pool of active (non-deleted) employees
      let pool = [...mockEmployees, ...createdEmployees].filter(
        (e) => !deletedEmployeeIds.has(e._id)
      );

      // Validate and apply department filter
      if (department !== null) {
        // Check for SQL injection patterns as boundary test
        const sqlInjectionPattern = /('|--|;|DROP|SELECT|INSERT|UPDATE|DELETE)/i;
        if (sqlInjectionPattern.test(department)) {
          // Safely return empty results for injection attempts
          const emptyResponse: EmployeeListResponse = {
            data: [],
            pagination: { total: 0, page: pageNum, limit: limitNum, pages: 0 },
          };
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(emptyResponse),
          });
          return;
        }

        if (!VALID_DEPARTMENTS.includes(department)) {
          // Return empty result for invalid department
          const emptyResponse: EmployeeListResponse = {
            data: [],
            pagination: { total: 0, page: pageNum, limit: limitNum, pages: 0 },
          };
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(emptyResponse),
          });
          return;
        }

        pool = pool.filter((e) => e.department === department);
      }

      // Validate and apply status filter
      if (status !== null) {
        if (!VALID_STATUSES.includes(status)) {
          const emptyResponse: EmployeeListResponse = {
            data: [],
            pagination: { total: 0, page: pageNum, limit: limitNum, pages: 0 },
          };
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(emptyResponse),
          });
          return;
        }

        pool = pool.filter((e) => e.employmentStatus === status);
      }

      // Apply search
      if (search !== null && search.trim() !== '') {
        const searchLower = search.toLowerCase();
        pool = pool.filter(
          (e) =>
            e.firstName.toLowerCase().includes(searchLower) ||
            e.lastName.toLowerCase().includes(searchLower) ||
            `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchLower) ||
            e.email.toLowerCase().includes(searchLower)
        );
      }

      const total = pool.length;
      const pages = Math.ceil(total / limitNum) || 0;
      const start = (pageNum - 1) * limitNum;
      const pageData = pool.slice(start, start + limitNum);

      const response: EmployeeListResponse = {
        data: pageData,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages,
        },
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
      return;
    }

    // Fallback
    await route.fulfill({
      status: 405,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'METHOD_NOT_ALLOWED',
        message: `Method ${method} not allowed`,
      }),
    });
  });
}