import { Page } from '@playwright/test';

interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface Employee {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cellPhone: string;
  designation: string;
  department: string;
  employmentType: string;
  employmentStatus: string;
  startDate: string;
  address: Address;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
}

const departments = ['Engineering', 'Product', 'Design', 'QA', 'HR', 'DevOps', 'Data', 'Marketing', 'Sales', 'Finance', 'Legal', 'Operations', 'Other'];
const statuses: string[] = ['Active', 'Active', 'Active', 'On Leave', 'Terminated'];
const types = ['Full-Time', 'Part-Time', 'Contract', 'Intern'];
const firstNames = ['Grace', 'Aisha', 'James', 'Olivia', 'Liam', 'Sophia', 'Noah', 'Emma', 'Ethan', 'Ava', 'Mason', 'Isabella', 'Logan', 'Mia', 'Lucas', 'Charlotte', 'Alexander', 'Amelia', 'Benjamin', 'Harper', 'Daniel', 'Evelyn', 'Henry', 'Abigail', 'Sebastian'];
const lastNames = ['Adeyemi', 'Al-Rashid', 'Chen', 'Williams', 'Garcia', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Robinson', 'Clark', 'Lewis', 'Lee', 'Walker', 'Hall'];
const designations = ['HR Coordinator', 'UX Designer', 'Software Engineer', 'Product Manager', 'QA Analyst', 'Data Scientist', 'DevOps Engineer', 'Marketing Lead', 'Sales Rep', 'Finance Analyst'];

function makeId(i: number): string {
  return `665a${(i + 1).toString(16).padStart(20, '0')}`;
}

const mockEmployees: Employee[] = Array.from({ length: 25 }, (_, i) => ({
  _id: makeId(i),
  firstName: firstNames[i],
  lastName: lastNames[i],
  email: `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}@company.com`,
  phone: `+1-555-${String(1000 + i)}`,
  cellPhone: `+1-555-${String(2000 + i)}`,
  designation: designations[i % designations.length],
  department: departments[i % departments.length],
  employmentType: types[i % types.length],
  employmentStatus: statuses[i % statuses.length],
  startDate: '2024-01-15',
  address: { street: `${100 + i} Main St`, city: 'Springfield', state: 'IL', postalCode: '62701', country: 'USA' },
  avatarUrl: '',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}));

const VALID_ID_RE = /^[0-9a-f]{24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_FIELDS = ['firstName', 'lastName', 'email', 'designation', 'department', 'employmentType', 'employmentStatus', 'startDate'] as const;

export async function setupEmployeeCreateMocks(page: Page): Promise<void> {
  const deletedIds = new Set<string>();
  const createdEmails = new Set<string>(mockEmployees.map(e => e.email.toLowerCase().trim()));
  const createdEmployees: Employee[] = [];
  let createCounter = 0;

  // Health
  await page.route('**/api/health**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), services: { mongodb: 'connected' } }),
    });
  });

  // Employee list (less specific — registered first)
  await page.route('**/api/employees**', async (route) => {
    const req = route.request();
    const method = req.method();

    if (method === 'GET') {
      const url = new URL(req.url(), 'http://localhost');
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const search = url.searchParams.get('search')?.toLowerCase() || '';
      const deptFilter = url.searchParams.get('department') || '';
      const statusFilter = url.searchParams.get('status') || '';

      const allEmps = [...mockEmployees, ...createdEmployees].filter(e => !deletedIds.has(e._id));

      let filtered = allEmps;
      if (search) {
        const words = search.split(/\s+/);
        filtered = filtered.filter(e => {
          const haystack = `${e.firstName} ${e.lastName} ${e.email} ${e.designation}`.toLowerCase();
          return words.every(w => haystack.split(/\s+|@|\./).some(token => token === w || token.startsWith(w)));
        });
      }
      if (deptFilter && departments.includes(deptFilter)) {
        filtered = filtered.filter(e => e.department === deptFilter);
      }
      if (statusFilter && ['Active', 'On Leave', 'Terminated'].includes(statusFilter)) {
        filtered = filtered.filter(e => e.employmentStatus === statusFilter);
      }

      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / limit));
      const start = (pageNum - 1) * limit;
      const data = filtered.slice(start, start + limit);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data, pagination: { total, page: pageNum, limit, pages } }),
      });
      return;
    }

    if (method === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>;

      // Validate required fields
      const details: { field: string; message: string }[] = [];
      for (const f of REQUIRED_FIELDS) {
        if (!body[f] || (typeof body[f] === 'string' && !(body[f] as string).trim())) {
          details.push({ field: f, message: 'Required' });
        }
      }
      const addr = body.address as Record<string, unknown> | undefined;
      if (!addr) {
        details.push({ field: 'address', message: 'Required' });
      } else {
        for (const af of ['street', 'city', 'country']) {
          if (!addr[af] || (typeof addr[af] === 'string' && !(addr[af] as string).trim())) {
            details.push({ field: `address.${af}`, message: 'Required' });
          }
        }
      }

      if (details.length > 0) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details }),
        });
        return;
      }

      // Validate email format
      const email = (body.email as string).trim();
      if (!EMAIL_RE.test(email)) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'email', message: 'Invalid email format' }] }),
        });
        return;
      }

      // Duplicate email check (case-insensitive, trimmed)
      const normalizedEmail = email.toLowerCase().trim();
      if (createdEmails.has(normalizedEmail)) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: `Employee with email ${email} already exists` }),
        });
        return;
      }

      createCounter++;
      const newId = `665a000000000000000ff${createCounter.toString(16).padStart(3, '0')}`;
      const now = new Date().toISOString();
      const newEmployee: Employee = {
        _id: newId,
        firstName: (body.firstName as string).trim(),
        lastName: (body.lastName as string).trim(),
        email,
        phone: ((body.phone as string) || '').trim(),
        cellPhone: ((body.cellPhone as string) || '').trim(),
        designation: (body.designation as string).trim(),
        department: body.department as string,
        employmentType: body.employmentType as string,
        employmentStatus: body.employmentStatus as string,
        startDate: body.startDate as string,
        address: {
          street: (addr!.street as string) || '',
          city: (addr!.city as string) || '',
          state: (addr!.state as string) || '',
          postalCode: (addr!.postalCode as string) || '',
          country: (addr!.country as string) || '',
        },
        avatarUrl: '',
        createdAt: now,
        updatedAt: now,
      };

      createdEmails.add(normalizedEmail);
      createdEmployees.push(newEmployee);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newEmployee),
      });
      return;
    }

    await route.fallback();
  });

  // Single employee (more specific — registered last for higher priority)
  await page.route('**/api/employees/*', async (route) => {
    const req = route.request();
    const method = req.method();
    const urlPath = new URL(req.url(), 'http://localhost').pathname;
    const segments = urlPath.split('/');
    const id = segments[segments.length - 1];

    // Skip if this looks like a list request (no actual ID segment)
    if (!id) {
      await route.fallback();
      return;
    }

    if (!VALID_ID_RE.test(id)) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'INVALID_ID', message: `'${id}' is not a valid employee id` }),
      });
      return;
    }

    const allEmps = [...mockEmployees, ...createdEmployees];
    const employee = allEmps.find(e => e._id === id);

    if (method === 'GET') {
      if (!employee || deletedIds.has(id)) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(employee) });
      return;
    }

    if (method === 'PATCH') {
      if (!employee || deletedIds.has(id)) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }),
        });
        return;
      }
      const patchBody = req.postDataJSON() as Record<string, unknown>;
      if (patchBody.email && !EMAIL_RE.test((patchBody.email as string).trim())) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'email', message: 'Invalid email format' }] }),
        });
        return;
      }
      const updated = { ...employee, ...patchBody, updatedAt: new Date().toISOString() };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }

    if (method === 'DELETE') {
      if (!employee || deletedIds.has(id)) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }),
        });
        return;
      }
      deletedIds.add(id);
      createdEmails.delete(employee.email.toLowerCase().trim());
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fallback();
  });

  // Catch-all for unknown API routes
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url(), 'http://localhost');
    if (url.pathname.startsWith('/api/employees') || url.pathname === '/api/health') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'NOT_FOUND', message: 'API not found' }),
    });
  });
}