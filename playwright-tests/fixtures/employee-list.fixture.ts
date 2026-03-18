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

const departments = ['Engineering', 'Product', 'Design', 'QA', 'HR', 'DevOps', 'Data', 'Marketing', 'Sales', 'Finance'];
const statuses: string[] = ['Active', 'Active', 'Active', 'On Leave', 'Terminated'];
const types = ['Full-Time', 'Part-Time', 'Contract', 'Intern'];
const names: [string, string, string][] = [
  ['Grace', 'Adeyemi', 'HR Coordinator'], ['Aisha', 'Al-Rashid', 'UX Designer'],
  ['James', 'Chen', 'Software Engineer'], ['Maria', 'Garcia', 'Product Manager'],
  ['Liam', 'O\'Brien', 'QA Lead'], ['Fatima', 'Hassan', 'Data Analyst'],
  ['Yuki', 'Tanaka', 'DevOps Engineer'], ['Priya', 'Sharma', 'Frontend Developer'],
  ['Carlos', 'Rivera', 'Backend Developer'], ['Emma', 'Wilson', 'Scrum Master'],
  ['Noah', 'Kim', 'UI Designer'], ['Sofia', 'Petrov', 'Marketing Specialist'],
  ['Oliver', 'Brown', 'Sales Executive'], ['Zara', 'Okafor', 'Finance Analyst'],
  ['Ethan', 'Muller', 'Tech Lead'], ['Ava', 'Johansson', 'HR Manager'],
  ['Lucas', 'Dubois', 'Full Stack Developer'], ['Mia', 'Nakamura', 'Product Designer'],
  ['Benjamin', 'Santos', 'QA Engineer'], ['Isabella', 'Rossi', 'Data Scientist'],
  ['Alexander', 'Patel', 'Cloud Architect'], ['Charlotte', 'Lee', 'Operations Manager'],
  ['Daniel', 'Martinez', 'Security Engineer'], ['Amelia', 'Thompson', 'Legal Counsel'],
  ['Henry', 'Wang', 'Mobile Developer'],
];

function buildMockEmployees(): Employee[] {
  const now = new Date().toISOString();
  return names.map(([first, last, desig], i) => ({
    _id: `665a${(i + 1).toString(16).padStart(20, '0')}`,
    firstName: first, lastName: last, email: `${first.toLowerCase()}.${last.toLowerCase().replace(/'/g, '')}@company.com`,
    phone: `+1-555-${String(1000 + i)}`, designation: desig,
    department: departments[i % departments.length], employmentType: types[i % types.length],
    employmentStatus: statuses[i % statuses.length], startDate: '2024-01-15',
    address: { street: `${100 + i} Main St`, city: 'New York', state: 'NY', postalCode: '10001', country: 'US' },
    avatarUrl: '', createdAt: now, updatedAt: now,
  }));
}

const ID_REGEX = /^[0-9a-f]{24}$/;

export async function setupEmployeeListMocks(page: Page): Promise<void> {
  const mockEmployees = buildMockEmployees();
  const deletedIds = new Set<string>();
  const createdEmails = new Set(mockEmployees.map(e => e.email));
  const created: Employee[] = [];

  // Health
  await page.route('**/api/health**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), services: { mongodb: 'connected' } }) });
  });

  // List (less specific — registered first)
  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());

    if (method === 'GET') {
      const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
      const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);
      if (isNaN(pageParam) || isNaN(limitParam) || pageParam < 1 || limitParam < 1) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid pagination parameters' }) });
      }
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const dept = url.searchParams.get('department') || '';
      const status = url.searchParams.get('status') || '';

      let all = [...mockEmployees, ...created].filter(e => !deletedIds.has(e._id));
      if (search) all = all.filter(e => [e.firstName, e.lastName, e.email, e.designation].some(f => f.toLowerCase().includes(search)));
      if (dept && departments.includes(dept)) all = all.filter(e => e.department === dept);
      if (status && ['Active', 'On Leave', 'Terminated'].includes(status)) all = all.filter(e => e.employmentStatus === status);

      const total = all.length;
      const pages = Math.max(1, Math.ceil(total / limitParam));
      const start = (pageParam - 1) * limitParam;
      const data = all.slice(start, start + limitParam);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { total, page: pageParam, limit: limitParam, pages } }) });
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const required = ['firstName', 'lastName', 'email', 'designation', 'department', 'employmentType', 'startDate'];
      const details: { field: string; message: string }[] = [];
      for (const f of required) { if (!body[f]) details.push({ field: f, message: 'Required' }); }
      const addr = body.address as Record<string, unknown> | undefined;
      if (!addr) { details.push({ field: 'address', message: 'Required' }); }
      else { for (const af of ['street', 'city', 'country']) { if (!addr[af]) details.push({ field: `address.${af}`, message: 'Required' }); } }
      if (details.length) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details }) });

      const email = body.email as string;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format' }) });
      if (createdEmails.has(email)) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: `Email ${email} already exists` }) });

      const now = new Date().toISOString();
      const newEmp: Employee = {
        _id: '665a000000000000000ff001',
        firstName: body.firstName as string, lastName: body.lastName as string, email,
        phone: (body.phone as string) || '', designation: body.designation as string,
        department: body.department as string, employmentType: body.employmentType as string,
        employmentStatus: (body.employmentStatus as string) || 'Active',
        startDate: body.startDate as string,
        address: { street: (addr as Record<string, string>).street || '', city: (addr as Record<string, string>).city || '', state: (addr as Record<string, string>).state || '', postalCode: (addr as Record<string, string>).postalCode || '', country: (addr as Record<string, string>).country || '' },
        avatarUrl: '', createdAt: now, updatedAt: now,
      };
      createdEmails.add(email);
      created.push(newEmp);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newEmp) });
    }

    await route.fallback();
  });

  // Single employee (more specific — registered last for higher priority)
  await page.route('**/api/employees/*', async (route) => {
    const method = route.request().method();
    const urlPath = new URL(route.request().url()).pathname;
    const segments = urlPath.split('/');
    const id = segments[segments.length - 1];

    if (!ID_REGEX.test(id)) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'INVALID_ID', message: `'${id}' is not a valid employee id` }) });
    }

    const allEmps = [...mockEmployees, ...created];
    const emp = allEmps.find(e => e._id === id);

    if (method === 'GET') {
      if (!emp || deletedIds.has(id)) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emp) });
    }

    if (method === 'PATCH') {
      if (!emp || deletedIds.has(id)) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email as string)) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format' }) });
      const updated = { ...emp, ...body, updatedAt: new Date().toISOString() };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
    }

    if (method === 'DELETE') {
      if (!emp || deletedIds.has(id)) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
      deletedIds.add(id);
      return route.fulfill({ status: 204, body: '' });
    }

    await route.fallback();
  });

  // Catch-all for unknown API routes
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/employees') || url.pathname.startsWith('/api/health')) return route.fallback();
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: 'API not found' }) });
  });
}