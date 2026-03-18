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
const designations = ['Software Engineer', 'Product Manager', 'UX Designer', 'QA Engineer', 'HR Coordinator', 'DevOps Engineer', 'Data Analyst', 'Marketing Lead', 'Sales Rep', 'Accountant'];
const firstNames = ['Grace', 'Aisha', 'James', 'Mei', 'Carlos', 'Fatima', 'Liam', 'Priya', 'Noah', 'Yuki', 'Omar', 'Sofia', 'Ethan', 'Zara', 'Lucas', 'Amara', 'Ben', 'Chloe', 'David', 'Elena', 'Felix', 'Gina', 'Hugo', 'Iris', 'Jack'];
const lastNames = ['Adeyemi', 'Al-Rashid', 'Chen', 'Wang', 'Garcia', 'Hassan', 'OBrien', 'Sharma', 'Kim', 'Tanaka', 'Farouk', 'Rossi', 'Miller', 'Okafor', 'Dubois', 'Mensah', 'Taylor', 'Nguyen', 'Park', 'Santos', 'Weber', 'Lund', 'Moreau', 'Petrov', 'Reed'];

const mockEmployees: Employee[] = Array.from({ length: 25 }, (_, i) => ({
  _id: `665a${(i + 1).toString(16).padStart(20, '0')}`,
  firstName: firstNames[i],
  lastName: lastNames[i],
  email: `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}@company.com`,
  phone: `+1-555-${String(1000 + i)}`,
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
const REQUIRED_FIELDS = ['firstName', 'lastName', 'email', 'designation', 'department', 'employmentType', 'startDate', 'address'] as const;
const REQUIRED_ADDR = ['street', 'city', 'country'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function setupEmployeeValidationMocks(page: Page): Promise<void> {
  const deletedIds = new Set<string>();
  const createdEmails = new Set<string>(mockEmployees.map(e => e.email));
  const createdEmployees: Employee[] = [];

  await page.route('**/api/health**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), services: { mongodb: 'connected' } }) });
    } else { await route.fallback(); }
  });

  // List + Create (less specific — registered first)
  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());

    // Avoid matching single-employee paths like /api/employees/665a...
    const pathSegments = url.pathname.replace(/\/+$/, '').split('/');
    const afterEmployees = pathSegments[pathSegments.indexOf('employees') + 1];
    if (afterEmployees) { await route.fallback(); return; }

    if (method === 'GET') {
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const dept = url.searchParams.get('department') || '';
      const status = url.searchParams.get('status') || '';

      const allEmps = [...mockEmployees, ...createdEmployees].filter(e => !deletedIds.has(e._id));
      let filtered = allEmps;
      if (search) {
        filtered = filtered.filter(e =>
          e.firstName.toLowerCase().includes(search) ||
          e.lastName.toLowerCase().includes(search) ||
          e.email.toLowerCase().includes(search) ||
          e.designation.toLowerCase().includes(search)
        );
      }
      if (dept && departments.includes(dept)) {
        filtered = filtered.filter(e => e.department === dept);
      }
      if (status && ['Active', 'On Leave', 'Terminated'].includes(status)) {
        filtered = filtered.filter(e => e.employmentStatus === status);
      }

      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / limit));
      const start = (pageNum - 1) * limit;
      const data = filtered.slice(start, start + limit);

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { total, page: pageNum, limit, pages } }) });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const details: { field: string; message: string }[] = [];

      for (const f of REQUIRED_FIELDS) {
        if (f === 'address') {
          if (!body.address || typeof body.address !== 'object') {
            details.push({ field: 'address', message: 'Required' });
          } else {
            const addr = body.address as Record<string, unknown>;
            for (const af of REQUIRED_ADDR) {
              if (!addr[af] || (typeof addr[af] === 'string' && !(addr[af] as string).trim())) {
                details.push({ field: `address.${af}`, message: 'Required' });
              }
            }
          }
        } else if (!body[f] || (typeof body[f] === 'string' && !(body[f] as string).trim())) {
          details.push({ field: f, message: 'Required' });
        }
      }

      if (details.length > 0) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details }) });
        return;
      }

      const email = (body.email as string).trim();
      if (!EMAIL_RE.test(email)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'email', message: 'Invalid email format' }] }) });
        return;
      }

      if (createdEmails.has(email.toLowerCase())) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: `Employee with email ${email} already exists` }) });
        return;
      }

      const addr = body.address as Record<string, string>;
      const newEmp: Employee = {
        _id: '665a000000000000000ff001',
        firstName: (body.firstName as string).trim(),
        lastName: (body.lastName as string).trim(),
        email,
        phone: ((body.phone as string) || '').trim(),
        designation: (body.designation as string).trim(),
        department: body.department as string,
        employmentType: body.employmentType as string,
        employmentStatus: (body.employmentStatus as string) || 'Active',
        startDate: body.startDate as string,
        address: { street: addr.street, city: addr.city, state: addr.state || '', postalCode: addr.postalCode || '', country: addr.country },
        avatarUrl: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      createdEmails.add(email.toLowerCase());
      createdEmployees.push(newEmp);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newEmp) });
    } else {
      await route.fallback();
    }
  });

  // Single employee (more specific — registered last for higher priority)
  await page.route('**/api/employees/*', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const segments = url.pathname.replace(/\/+$/, '').split('/');
    const id = segments[segments.length - 1];

    if (!VALID_ID_RE.test(id)) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'INVALID_ID', message: `'${id}' is not a valid employee id` }) });
      return;
    }

    const allEmps = [...mockEmployees, ...createdEmployees];

    if (method === 'GET') {
      if (deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const emp = allEmps.find(e => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emp) });
    } else if (method === 'DELETE') {
      if (deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const emp = allEmps.find(e => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      deletedIds.add(id);
      await route.fulfill({ status: 204, body: '' });
    } else if (method === 'PATCH') {
      if (deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const emp = allEmps.find(e => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.email && !EMAIL_RE.test(body.email as string)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'email', message: 'Invalid email format' }] }) });
        return;
      }
      const updated = { ...emp, ...body, updatedAt: new Date().toISOString() };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
    } else {
      await route.fallback();
    }
  });

  // Catch-all for unknown /api routes
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/employees') || url.pathname.startsWith('/api/health')) {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: 'API not found' }) });
  });
}