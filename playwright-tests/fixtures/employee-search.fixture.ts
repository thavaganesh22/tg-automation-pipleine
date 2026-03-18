import { Page } from '@playwright/test';

const departments = ['Engineering', 'Product', 'Design', 'QA', 'HR', 'DevOps', 'Data', 'Marketing', 'Sales', 'Finance', 'Legal', 'Operations', 'Other'];
const statuses: Array<'Active' | 'On Leave' | 'Terminated'> = ['Active', 'On Leave', 'Terminated'];
const types: Array<'Full-Time' | 'Part-Time' | 'Contract' | 'Intern'> = ['Full-Time', 'Part-Time', 'Contract', 'Intern'];
const designations = ['Software Engineer', 'Senior Engineer', 'Product Manager', 'UX Designer', 'QA Engineer', 'HR Coordinator', 'Data Analyst', 'DevOps Engineer', 'Marketing Lead', 'Sales Rep', 'Finance Analyst', 'Legal Counsel', 'Operations Manager'];

interface Address { street: string; city: string; state: string; postalCode: string; country: string }
interface Employee {
  _id: string; firstName: string; lastName: string; email: string; phone: string;
  designation: string; department: string; employmentType: string; employmentStatus: string;
  startDate: string; address: Address; avatarUrl: string; createdAt: string; updatedAt: string;
}

function makeId(i: number): string {
  return `665a${(i + 1).toString(16).padStart(20, '0')}`;
}

const firstNames = ['Grace', 'Aisha', 'James', 'Priya', 'Carlos', 'Mei', 'Oliver', 'Fatima', 'Liam', 'Sofia', 'Noah', 'Yuki', 'Ethan', 'Amara', 'Lucas', 'Zara', 'Mason', 'Ines', 'Logan', 'Chloe', 'Alex', 'Dana', 'Ryan', 'Tara', 'Ben'];
const lastNames = ['Adeyemi', 'Al-Rashid', 'Chen', 'Patel', 'Garcia', 'Wang', 'Smith', 'Hassan', 'Johnson', 'Martinez', 'Brown', 'Tanaka', 'Davis', 'Okafor', 'Wilson', 'Khan', 'Taylor', 'Dubois', 'Anderson', 'Kim', 'Lee', 'Morgan', 'Clark', 'Singh', 'White'];

const mockEmployees: Employee[] = Array.from({ length: 25 }, (_, i): Employee => ({
  _id: makeId(i),
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

export async function setupEmployeeSearchMocks(page: Page): Promise<void> {
  const deletedIds = new Set<string>();
  const createdEmails = new Set<string>();
  const createdEmployees: Employee[] = [];
  const hexIdRegex = /^[0-9a-fA-F]{24}$/;

  await page.route('**/api/health**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), services: { mongodb: 'connected' } }) });
  });

  // List + Create (less specific — registered first)
  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());

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
      if (dept) {
        filtered = departments.includes(dept)
          ? filtered.filter(e => e.department === dept)
          : [];
      }
      if (status && (statuses as string[]).includes(status)) {
        filtered = filtered.filter(e => e.employmentStatus === status);
      }

      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / limit));
      const start = (pageNum - 1) * limit;
      const data = filtered.slice(start, start + limit);

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { total, page: pageNum, limit, pages } }) });
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const required = ['firstName', 'lastName', 'email', 'designation', 'department', 'employmentType', 'startDate'];
      const details: Array<{ field: string; message: string }> = [];

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
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details }) });
        return;
      }

      const email = body.email as string;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format', details: [{ field: 'email', message: 'Invalid email' }] }) });
        return;
      }

      const allEmails = new Set([...mockEmployees.filter(e => !deletedIds.has(e._id)).map(e => e.email), ...createdEmails]);
      if (allEmails.has(email)) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: `Employee with email ${email} already exists` }) });
        return;
      }

      createdEmails.add(email);
      const newEmp: Employee = {
        _id: '665a000000000000000ff001',
        firstName: body.firstName as string,
        lastName: body.lastName as string,
        email,
        phone: (body.phone as string) || '',
        designation: body.designation as string,
        department: body.department as string,
        employmentType: body.employmentType as string,
        employmentStatus: (body.employmentStatus as string) || 'Active',
        startDate: body.startDate as string,
        address: addr as unknown as Address,
        avatarUrl: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      createdEmployees.push(newEmp);

      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newEmp) });
      return;
    }

    await route.fallback();
  });

  // Single employee routes (more specific — registered last for higher priority)
  await page.route('**/api/employees/*', async (route) => {
    const method = route.request().method();
    const urlPath = new URL(route.request().url()).pathname;
    const segments = urlPath.split('/');
    const id = segments[segments.length - 1];

    if (!hexIdRegex.test(id)) {
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
      return;
    }

    if (method === 'PATCH') {
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
      if (body.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email as string)) {
          await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format', details: [{ field: 'email', message: 'Invalid email' }] }) });
          return;
        }
      }
      const updated = { ...emp, ...body, updatedAt: new Date().toISOString() };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }

    if (method === 'DELETE') {
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
      return;
    }

    await route.fallback();
  });
}