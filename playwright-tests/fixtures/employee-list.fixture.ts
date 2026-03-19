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

const statuses: string[] = ['Active', 'Active', 'Active', 'On Leave', 'Terminated'];
const types = ['Full-Time', 'Part-Time', 'Contract', 'Intern'];
const names: [string, string, string, string][] = [
  ['Grace', 'Adeyemi', 'HR Coordinator', 'HR'],
  ['Aisha', 'Al-Rashid', 'UX Designer', 'Design'],
  ['James', 'Chen', 'Software Engineer', 'Engineering'],
  ['Maria', 'Garcia', 'Product Manager', 'Product'],
  ['Oliver', 'Smith', 'QA Lead', 'QA'],
  ['Fatima', 'Hassan', 'DevOps Engineer', 'DevOps'],
  ['Liam', 'Johnson', 'Data Analyst', 'Data'],
  ['Sofia', 'Martinez', 'Marketing Lead', 'Marketing'],
  ['Noah', 'Williams', 'Sales Rep', 'Sales'],
  ['Emma', 'Brown', 'Finance Analyst', 'Finance'],
  ['Lucas', 'Taylor', 'Backend Developer', 'Engineering'],
  ['Mia', 'Anderson', 'Frontend Developer', 'Engineering'],
  ['Ethan', 'Thomas', 'Designer', 'Design'],
  ['Ava', 'Jackson', 'Product Analyst', 'Product'],
  ['Benjamin', 'White', 'QA Engineer', 'QA'],
  ['Charlotte', 'Harris', 'HR Manager', 'HR'],
  ['Alexander', 'Martin', 'Tech Lead', 'Engineering'],
  ['Amelia', 'Thompson', 'Scrum Master', 'Product'],
  ['Daniel', 'Robinson', 'Data Engineer', 'Data'],
  ['Harper', 'Clark', 'UX Researcher', 'Design'],
  ['Sebastian', 'Lewis', 'DevOps Lead', 'DevOps'],
  ['Ella', 'Walker', 'Marketing Analyst', 'Marketing'],
  ['Jack', 'Hall', 'Account Executive', 'Sales'],
  ['Scarlett', 'Allen', 'Software Engineer', 'Engineering'],
  ['Henry', 'Young', 'QA Analyst', 'QA'],
];

function buildMockEmployees(): Employee[] {
  const now = new Date().toISOString();
  return names.map(([first, last, desig, dept], i) => ({
    _id: `665a${(i + 1).toString(16).padStart(20, '0')}`,
    firstName: first,
    lastName: last,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@company.com`,
    phone: `+1-555-${String(1000 + i)}`,
    cellPhone: `+1-555-${String(2000 + i)}`,
    designation: desig,
    department: dept,
    employmentType: types[i % types.length],
    employmentStatus: statuses[i % statuses.length],
    startDate: '2024-01-15',
    address: { street: `${100 + i} Main St`, city: 'New York', state: 'NY', postalCode: '10001', country: 'US' },
    avatarUrl: '',
    createdAt: now,
    updatedAt: now,
  }));
}

export async function setupEmployeeListMocks(page: Page): Promise<void> {
  const mockEmployees: Employee[] = buildMockEmployees();
  const deletedIds = new Set<string>();
  const createdEmails = new Set(mockEmployees.map(e => e.email));
  const created: Employee[] = [];

  const hexIdRegex = /^[0-9a-fA-F]{24}$/;

  // Health endpoint
  await page.route('**/api/health**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), services: { mongodb: 'connected' } }),
    });
  });

  // List endpoint (less specific — registered first)
  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());

    if (method === 'GET') {
      const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
      const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);

      if (isNaN(pageParam) || isNaN(limitParam) || pageParam < 1 || limitParam < 1) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid pagination parameters' }),
        });
        return;
      }

      const searchTerm = url.searchParams.get('search') || '';
      const deptFilter = url.searchParams.get('department') || '';
      const statusFilter = url.searchParams.get('status') || '';

      let pool = [...mockEmployees, ...created].filter(e => !deletedIds.has(e._id));

      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        pool = pool.filter(e =>
          e.firstName.toLowerCase() === lower ||
          e.lastName.toLowerCase() === lower ||
          e.email.toLowerCase().includes(lower) ||
          e.designation.toLowerCase().includes(lower)
        );
      }

      const validDepts = ['Engineering', 'Product', 'Design', 'QA', 'DevOps', 'Data', 'Marketing', 'Sales', 'HR', 'Finance', 'Legal', 'Operations', 'Other'];
      if (deptFilter && validDepts.includes(deptFilter)) {
        pool = pool.filter(e => e.department === deptFilter);
      }

      const validStatuses = ['Active', 'On Leave', 'Terminated'];
      if (statusFilter && validStatuses.includes(statusFilter)) {
        pool = pool.filter(e => e.employmentStatus === statusFilter);
      }

      const total = pool.length;
      const pages = Math.max(1, Math.ceil(total / limitParam));
      const start = (pageParam - 1) * limitParam;
      const data = pool.slice(start, start + limitParam);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data, pagination: { total, page: pageParam, limit: limitParam, pages } }),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const required = ['firstName', 'lastName', 'email', 'designation', 'department', 'employmentType', 'startDate'];
      const details: { field: string; message: string }[] = [];

      for (const f of required) {
        if (!body[f]) details.push({ field: f, message: 'Required' });
      }

      const addr = body.address as Record<string, unknown> | undefined;
      if (!addr) {
        details.push({ field: 'address', message: 'Required' });
      } else {
        for (const af of ['street', 'city', 'country']) {
          if (!addr[af]) details.push({ field: `address.${af}`, message: 'Required' });
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

      const email = body.email as string;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format' }),
        });
        return;
      }

      if (createdEmails.has(email.toLowerCase())) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: `Email ${email} already exists` }),
        });
        return;
      }

      const now = new Date().toISOString();
      const newEmp: Employee = {
        _id: '665a000000000000000ff001',
        firstName: body.firstName as string,
        lastName: body.lastName as string,
        email,
        phone: (body.phone as string) || '',
        cellPhone: (body.cellPhone as string) || '',
        designation: body.designation as string,
        department: body.department as string,
        employmentType: body.employmentType as string,
        employmentStatus: (body.employmentStatus as string) || 'Active',
        startDate: body.startDate as string,
        address: addr as unknown as Address,
        avatarUrl: '',
        createdAt: now,
        updatedAt: now,
      };

      createdEmails.add(email.toLowerCase());
      created.push(newEmp);

      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newEmp) });
    } else {
      await route.continue();
    }
  });

  // Single employee endpoint (more specific — registered last for higher priority)
  await page.route('**/api/employees/*', async (route) => {
    const method = route.request().method();
    const urlPath = new URL(route.request().url()).pathname;
    const segments = urlPath.split('/');
    const id = segments[segments.length - 1];

    if (!hexIdRegex.test(id)) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'INVALID_ID', message: `'${id}' is not a valid employee id` }),
      });
      return;
    }

    const allEmployees = [...mockEmployees, ...created];
    const emp = allEmployees.find(e => e._id === id);

    if (method === 'GET') {
      if (!emp || deletedIds.has(id)) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emp) });
    } else if (method === 'DELETE') {
      if (!emp || deletedIds.has(id)) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }),
        });
        return;
      }
      deletedIds.add(id);
      await route.fulfill({ status: 204, body: '' });
    } else if (method === 'PATCH') {
      if (!emp || deletedIds.has(id)) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }),
        });
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email as string)) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format' }),
          });
          return;
        }
      }
      const updated = { ...emp, ...body, updatedAt: new Date().toISOString() };
      Object.assign(emp, updated);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
    } else {
      await route.continue();
    }
  });
}