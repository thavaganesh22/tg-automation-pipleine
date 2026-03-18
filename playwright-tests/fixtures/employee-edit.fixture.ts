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
const statuses: Array<'Active' | 'On Leave' | 'Terminated'> = ['Active', 'On Leave', 'Terminated'];
const types: Array<'Full-Time' | 'Part-Time' | 'Contract' | 'Intern'> = ['Full-Time', 'Part-Time', 'Contract', 'Intern'];
const designations = ['Software Engineer', 'Senior Engineer', 'Product Manager', 'UX Designer', 'QA Engineer', 'HR Coordinator', 'Data Analyst', 'DevOps Engineer', 'Marketing Lead', 'Sales Rep', 'Finance Analyst', 'Legal Counsel', 'Operations Manager'];

function makeId(i: number): string {
  return `665a${(i + 1).toString(16).padStart(20, '0')}`;
}

function buildMockEmployees(): Employee[] {
  const emps: Employee[] = [];
  for (let i = 0; i < 25; i++) {
    const dept = departments[i % departments.length];
    const status = statuses[i % statuses.length];
    const empType = types[i % types.length];
    const desig = designations[i % designations.length];
    const first = ['Grace', 'Aisha', 'John', 'Maria', 'Chen', 'Olga', 'Raj', 'Fatima', 'Liam', 'Sofia', 'Yuki', 'Omar', 'Emma', 'Carlos', 'Priya', 'Noah', 'Amara', 'David', 'Mei', 'Hassan', 'Anna', 'James', 'Zara', 'Lucas', 'Ines'][i];
    const last = ['Adeyemi', 'Al-Rashid', 'Smith', 'Garcia', 'Wei', 'Petrov', 'Sharma', 'Hassan', 'Murphy', 'Rossi', 'Tanaka', 'Farouk', 'Johnson', 'Lopez', 'Patel', 'Brown', 'Okafor', 'Kim', 'Zhang', 'Ali', 'Muller', 'Wilson', 'Khan', 'Silva', 'Dupont'][i];
    emps.push({
      _id: makeId(i),
      firstName: first,
      lastName: last,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@company.com`,
      phone: `+1-555-${String(1000 + i)}`,
      designation: desig,
      department: dept,
      employmentType: empType,
      employmentStatus: status,
      startDate: '2024-01-15',
      address: { street: `${100 + i} Main St`, city: 'Springfield', state: 'IL', postalCode: '62701', country: 'USA' },
      avatarUrl: '',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
  }
  return emps;
}

const ID_REGEX = /^[0-9a-f]{24}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function setupEmployeeEditMocks(page: Page): Promise<void> {
  const mockEmployees = buildMockEmployees();
  const createdEmployees: Employee[] = [];
  const deletedIds = new Set<string>();
  const createdEmails = new Set<string>(mockEmployees.map(e => e.email));
  const updates = new Map<string, Partial<Employee>>();

  // Health
  await page.route('**/api/health**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), services: { mongodb: 'connected' } }) });
  });

  // List employees (less specific — registered first)
  await page.route('**/api/employees**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());

    if (method === 'GET') {
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const deptFilter = url.searchParams.get('department') || '';
      const statusFilter = url.searchParams.get('status') || '';

      let filtered = mockEmployees.filter(e => !deletedIds.has(e._id));

      if (search) {
        filtered = filtered.filter(e =>
          e.firstName.toLowerCase().includes(search) ||
          e.lastName.toLowerCase().includes(search) ||
          e.email.toLowerCase().includes(search) ||
          e.designation.toLowerCase().includes(search)
        );
      }
      if (deptFilter && departments.includes(deptFilter)) {
        filtered = filtered.filter(e => e.department === deptFilter);
      }
      if (statusFilter && statuses.includes(statusFilter as typeof statuses[number])) {
        filtered = filtered.filter(e => e.employmentStatus === statusFilter);
      }

      // Apply updates to filtered results
      const withUpdates = filtered.map(e => {
        const u = updates.get(e._id);
        return u ? { ...e, ...u } : e;
      });

      const total = withUpdates.length;
      const pages = Math.max(1, Math.ceil(total / limit));
      const start = (pageNum - 1) * limit;
      const data = withUpdates.slice(start, start + limit);

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { total, page: pageNum, limit, pages } }) });
      return;
    }

    if (method === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>;
      const required = ['firstName', 'lastName', 'email', 'designation', 'department', 'employmentType', 'startDate'];
      const details: Array<{ field: string; message: string }> = [];

      for (const f of required) {
        if (!body[f]) details.push({ field: f, message: 'Required' });
      }
      if (!body['address'] || typeof body['address'] !== 'object') {
        details.push({ field: 'address', message: 'Required' });
      } else {
        const addr = body['address'] as Record<string, unknown>;
        for (const af of ['street', 'city', 'country']) {
          if (!addr[af]) details.push({ field: `address.${af}`, message: 'Required' });
        }
      }

      if (details.length > 0) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details }) });
        return;
      }

      const email = body['email'] as string;
      if (!EMAIL_REGEX.test(email)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format', details: [{ field: 'email', message: 'Invalid email format' }] }) });
        return;
      }

      if (createdEmails.has(email)) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: `Email ${email} already exists` }) });
        return;
      }

      const newId = '665a000000000000000ff001';
      const now = new Date().toISOString();
      const newEmp: Employee = {
        _id: newId, firstName: body['firstName'] as string, lastName: body['lastName'] as string,
        email, phone: (body['phone'] as string) || '', designation: body['designation'] as string,
        department: body['department'] as string, employmentType: body['employmentType'] as string,
        employmentStatus: (body['employmentStatus'] as string) || 'Active',
        startDate: body['startDate'] as string, address: body['address'] as Address,
        avatarUrl: '', createdAt: now, updatedAt: now,
      };
      createdEmails.add(email);
      createdEmployees.push(newEmp);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newEmp) });
      return;
    }

    await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) });
  });

  // Single employee (more specific — registered last for higher priority)
  await page.route('**/api/employees/*', async (route) => {
    const req = route.request();
    const method = req.method();
    const urlPath = new URL(req.url()).pathname;
    const segments = urlPath.split('/');
    const id = segments[segments.length - 1];

    if (!ID_REGEX.test(id)) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'INVALID_ID', message: `'${id}' is not a valid employee id` }) });
      return;
    }

    const emp = [...mockEmployees, ...createdEmployees].find(e => e._id === id);

    if (method === 'GET') {
      if (!emp || deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const u = updates.get(id);
      const result = u ? { ...emp, ...u } : emp;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
      return;
    }

    if (method === 'PATCH') {
      if (!emp || deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const body = req.postDataJSON() as Record<string, unknown>;

      // Validate email if provided
      if (body['email'] !== undefined) {
        const email = body['email'] as string;
        if (!EMAIL_REGEX.test(email)) {
          await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format', details: [{ field: 'email', message: 'Invalid email format' }] }) });
          return;
        }
      }

      // Validate department if provided
      if (body['department'] !== undefined && !departments.includes(body['department'] as string)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid department value', details: [{ field: 'department', message: 'Invalid value' }] }) });
        return;
      }

      // Validate employmentStatus if provided
      if (body['employmentStatus'] !== undefined && !statuses.includes(body['employmentStatus'] as typeof statuses[number])) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid status value', details: [{ field: 'employmentStatus', message: 'Invalid value' }] }) });
        return;
      }

      // Validate employmentType if provided
      if (body['employmentType'] !== undefined && !types.includes(body['employmentType'] as typeof types[number])) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid employment type', details: [{ field: 'employmentType', message: 'Invalid value' }] }) });
        return;
      }

      const now = new Date().toISOString();
      const existing = updates.get(id) || {};
      const merged = { ...existing, ...body, updatedAt: now };
      updates.set(id, merged);
      const result = { ...emp, ...merged };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
      return;
    }

    if (method === 'DELETE') {
      if (!emp || deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      deletedIds.add(id);
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) });
  });
}