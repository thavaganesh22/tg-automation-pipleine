import { Page } from '@playwright/test';

interface Employee {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  department: string;
  employmentType: 'Full-Time' | 'Part-Time' | 'Contract';
  employmentStatus: 'Active' | 'On Leave' | 'Terminated';
}

const depts = ['Engineering', 'Product', 'Design', 'QA', 'HR'];
const types: Employee['employmentType'][] = ['Full-Time', 'Part-Time', 'Contract'];
const statuses: Employee['employmentStatus'][] = ['Active', 'On Leave', 'Terminated'];
const titles = ['Engineer', 'Manager', 'Designer', 'Analyst', 'Lead', 'Director', 'Intern', 'Coordinator'];
const firstNames = ['Alice', 'Bob', 'Carol', 'Dan', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack',
  'Karen', 'Leo', 'Mia', 'Nick', 'Olivia', 'Pat', 'Quinn', 'Ray', 'Sara', 'Tom',
  'Uma', 'Vince', 'Wendy', 'Xander', 'Thava'];
const lastNames = ['Smith', 'Jones', 'Brown', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas',
  'Jackson', 'White', 'Harris', 'Martin', 'Garcia', 'Clark', 'Lewis', 'Hall', 'Allen', 'Young', 'King',
  'Wright', 'Lopez', 'Hill', 'Scott', 'Green'];

const BASE_EMPLOYEES: Employee[] = Array.from({ length: 25 }, (_, i) => ({
  _id: `665a000000000000000000${(i + 1).toString(16).padStart(2, '0')}`,
  firstName: firstNames[i],
  lastName: lastNames[i],
  email: `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}@example.com`,
  designation: titles[i % titles.length],
  department: depts[i % depts.length],
  employmentType: types[i % types.length],
  employmentStatus: statuses[i % statuses.length],
}));

export async function setupEmployeesMocks(page: Page): Promise<void> {
  // Local copy so DELETE mutations don't bleed between tests
  const employees: Employee[] = [...BASE_EMPLOYEES];

  // Route registration order matters: Playwright uses LIFO (last-in = first-matched).
  // Register the LESS-SPECIFIC pattern first so the MORE-SPECIFIC one registered last takes priority.

  // 1st registered (lower priority): handles list + create — '**/api/employees**' also matches /:id URLs
  //    but the single-employee handler below (registered last) wins for /:id requests via LIFO.
  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());

    if (method === 'GET') {
      const rawPg = parseInt(url.searchParams.get('page') ?? '1', 10);
      const rawLim = parseInt(url.searchParams.get('limit') ?? '20', 10);
      if ((url.searchParams.has('page') && (isNaN(rawPg) || rawPg < 1)) || (url.searchParams.has('limit') && (isNaN(rawLim) || rawLim < 1))) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid pagination parameters' }) });
      }
      const pg = rawPg;
      const lim = rawLim;
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const dept = url.searchParams.get('department') ?? '';
      const status = url.searchParams.get('status') ?? '';

      let filtered = employees;
      if (search) filtered = filtered.filter((e) => `${e.firstName} ${e.lastName} ${e.email} ${e.designation}`.toLowerCase().includes(search));
      if (dept) filtered = filtered.filter((e) => e.department === dept);
      if (status) filtered = filtered.filter((e) => e.employmentStatus === status);

      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / lim));
      const data = filtered.slice((pg - 1) * lim, pg * lim);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { total, page: pg, limit: lim, pages } }) });
    }

    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      if (!body.firstName || !body.email) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Required fields missing' }) });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email as string)) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format' }) });
      }
      if (employees.some((e) => e.email === body.email)) {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: 'An employee with this email already exists' }) });
      }
      const created: Employee = {
        _id: `665a00000000000000000f${(employees.length).toString(16).padStart(2, '0')}`,
        firstName: body.firstName as string,
        lastName: (body.lastName as string) ?? 'Employee',
        email: body.email as string,
        designation: (body.designation as string) ?? 'Engineer',
        department: (body.department as string) ?? 'Engineering',
        employmentType: (body.employmentType as Employee['employmentType']) ?? 'Full-Time',
        employmentStatus: (body.employmentStatus as Employee['employmentStatus']) ?? 'Active',
      };
      employees.push(created);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }

    return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) });
  });

  // 2nd registered (higher priority via LIFO): handles single employee by ID
  await page.route('**/api/employees/*', async (route) => {
    const method = route.request().method();
    const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';

    // Validate MongoDB ObjectId format (24 hex chars)
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'INVALID_ID', message: `"${id}" is not a valid employee id` }) });
    }

    const idx = employees.findIndex((e) => e._id === id);

    if (method === 'GET') {
      if (idx === -1) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(employees[idx]) });
    }
    if (method === 'PATCH') {
      if (idx === -1) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      if ('email' in body && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email as string)) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format' }) });
      }
      if ('firstName' in body && !body.firstName) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'firstName cannot be empty' }) });
      }
      if (body.email && employees.some((e, i) => i !== idx && e.email === body.email)) {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: 'An employee with this email already exists' }) });
      }
      employees[idx] = { ...employees[idx], ...body as Partial<Employee> };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(employees[idx]) });
    }
    if (method === 'DELETE') {
      if (idx === -1) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
      employees.splice(idx, 1);
      return route.fulfill({ status: 204, body: '' });
    }

    return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) });
  });
}