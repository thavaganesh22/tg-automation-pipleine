import { Page, Route } from '@playwright/test';

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

interface EmployeeCreateResponse {
  data: Employee;
  message: string;
}

interface ErrorResponse {
  message: string;
  errors?: Record<string, string>;
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
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya.sharma@company.com',
    designation: 'QA Engineer',
    department: 'Engineering',
    employmentType: 'Full-Time',
    employmentStatus: 'Terminated',
  },
];

const employeeListResponse: EmployeeListResponse = {
  data: mockEmployees,
  pagination: {
    total: mockEmployees.length,
    page: 1,
    limit: 20,
    pages: 1,
  },
};

export async function setupEmployeeFormMocks(page: Page): Promise<void> {
  // Mock GET employees list
  await page.route('**/api/employees**', async (route: Route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(employeeListResponse),
      });
      return;
    }

    if (method === 'POST') {
      const requestBody = route.request().postDataJSON() as Partial<Employee> | null;

      // Simulate validation error when required fields are missing
      const requiredFields: (keyof Employee)[] = [
        'firstName',
        'lastName',
        'email',
        'designation',
        'department',
        'employmentType',
      ];

      const missingFields = requiredFields.filter(
        (field) => !requestBody || !requestBody[field] || String(requestBody[field]).trim() === ''
      );

      if (missingFields.length > 0) {
        const errors: Record<string, string> = {};
        for (const field of missingFields) {
          const label = field.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
          errors[field] = `${label.charAt(0).toUpperCase() + label.slice(1)} is required`;
        }
        const errorResp: ErrorResponse = {
          message: 'Validation failed',
          errors,
        };
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify(errorResp),
        });
        return;
      }

      // Successful creation
      const newEmployee: Employee = {
        _id: '664a1b2c3d4e5f6a7b8c9d99',
        firstName: requestBody?.firstName ?? '',
        lastName: requestBody?.lastName ?? '',
        email: requestBody?.email ?? '',
        designation: requestBody?.designation ?? '',
        department: requestBody?.department ?? '',
        employmentType: requestBody?.employmentType ?? 'Full-Time',
        employmentStatus: (requestBody?.employmentStatus as Employee['employmentStatus']) ?? 'Active',
      };

      const successResponse: EmployeeCreateResponse = {
        data: newEmployee,
        message: 'Employee created successfully',
      };

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(successResponse),
      });
      return;
    }

    if (method === 'PATCH' || method === 'PUT') {
      const requestBody = route.request().postDataJSON() as Partial<Employee> | null;

      if (!requestBody || Object.keys(requestBody).length === 0) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'No update data provided' } as ErrorResponse),
        });
        return;
      }

      const updatedEmployee: Employee = {
        ...mockEmployees[0],
        ...requestBody,
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: updatedEmployee, message: 'Employee updated successfully' }),
      });
      return;
    }

    if (method === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Employee deleted successfully' }),
      });
      return;
    }

    await route.fallback();
  });

  // Mock GET single employee by ID
  await page.route('**/api/employees/**', async (route: Route) => {
    const method = route.request().method();
    const url = route.request().url();

    // Match pattern like /api/employees/{id} but not the list endpoint already handled
    const singleEmployeeMatch = url.match(/\/api\/employees\/([a-f0-9]{24})/);

    if (method === 'GET' && singleEmployeeMatch) {
      const employeeId = singleEmployeeMatch[1];
      const employee = mockEmployees.find((e) => e._id === employeeId);

      if (employee) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: employee }),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Employee not found' } as ErrorResponse),
      });
      return;
    }

    await route.fallback();
  });

  // Mock departments endpoint (often used by form dropdowns)
  await page.route('**/api/departments**', async (route: Route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { _id: 'dept01', name: 'Engineering' },
            { _id: 'dept02', name: 'Product' },
            { _id: 'dept03', name: 'Design' },
            { _id: 'dept04', name: 'Marketing' },
            { _id: 'dept05', name: 'Human Resources' },
          ],
          pagination: { total: 5, page: 1, limit: 50, pages: 1 },
        }),
      });
      return;
    }

    await route.continue();
  });

  // Mock designations endpoint (often used by form dropdowns)
  await page.route('**/api/designations**', async (route: Route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { _id: 'des01', name: 'Tech Lead' },
            { _id: 'des02', name: 'Product Manager' },
            { _id: 'des03', name: 'UX Designer' },
            { _id: 'des04', name: 'QA Engineer' },
            { _id: 'des05', name: 'Software Engineer' },
          ],
          pagination: { total: 5, page: 1, limit: 50, pages: 1 },
        }),
      });
      return;
    }

    await route.continue();
  });

  // Mock employment types endpoint
  await page.route('**/api/employment-types**', async (route: Route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { _id: 'et01', name: 'Full-time' },
            { _id: 'et02', name: 'Part-time' },
            { _id: 'et03', name: 'Contract' },
            { _id: 'et04', name: 'Internship' },
          ],
          pagination: { total: 4, page: 1, limit: 50, pages: 1 },
        }),
      });
      return;
    }

    await route.continue();
  });
}