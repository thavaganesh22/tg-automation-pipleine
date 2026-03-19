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
  cellPhone?: string;
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
const types = ['Full-Time', 'Part-Time', 'Contract', 'Intern'];
const statuses: Array<'Active' | 'On Leave' | 'Terminated'> = ['Active', 'Active', 'Active', 'On Leave', 'Terminated'];
const names = [
  ['Grace', 'Adeyemi'], ['Aisha', 'Al-Rashid'], ['James', 'Chen'], ['Maria', 'Garcia'], ['Liam', 'O-Brien'],
  ['Fatima', 'Hassan'], ['Yuki', 'Tanaka'], ['Carlos', 'Rivera'], ['Priya', 'Sharma'], ['Oliver', 'Smith'],
  ['Sofia', 'Petrov'], ['Ahmed', 'Khan'], ['Emma', 'Johnson'], ['Wei', 'Zhang'], ['Isabella', 'Rossi'],
  ['Noah', 'Williams'], ['Amara', 'Okafor'], ['Lucas', 'Mueller'], ['Zara', 'Patel'], ['Ethan', 'Brown'],
  ['Mia', 'Anderson'], ['Daniel', 'Kim'], ['Chloe', 'Taylor'], ['Ryan', 'Davis'], ['Lily', 'Wilson'],
];

function makeId(i: number): string {
  return `665a${(i + 1).toString(16).padStart(20, '0')}`;
}

function buildEmployees(): Employee[] {
  return names.map((n, i) => ({
    _id: makeId(i),
    firstName: n[0],
    lastName: n[1],
    email: `${n[0].toLowerCase()}.${n[1].toLowerCase()}@company.com`,
    phone: `+1-555-${String(1000 + i)}`,
    designation: ['HR Coordinator', 'UX Designer', 'Backend Engineer', 'Product Manager', 'QA Lead',
      'DevOps Engineer', 'Data Analyst', 'Marketing Lead', 'Sales Rep', 'Finance Analyst',
      'Frontend Engineer', 'Recruiter', 'Scrum Master', 'Data Scientist', 'UI Designer',
      'SRE', 'Content Writer', 'Account Exec', 'Payroll Specialist', 'Legal Counsel',
      'Mobile Engineer', 'Tech Lead', 'Designer', 'Support Engineer', 'Intern'][i],
    department: departments[i % departments.length],
    employmentType: types[i % types.length],
    employmentStatus: statuses[i % statuses.length],
    startDate: '2024-01-15',
    address: { street: `${100 + i} Main St`, city: 'Springfield', state: 'IL', postalCode: '62701', country: 'USA' },
    avatarUrl: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }));
}

const ID_REGEX = /^[0-9a-f]{24}$/;

export async function setupEmployeeEditMocks(page: Page): Promise<void> {
  const mockEmployees = buildEmployees();
  const deletedIds = new Set<string>();
  const createdEmails = new Set(mockEmployees.map(e => e.email));
  const updatedFields = new Map<string, Partial<Employee>>();

  // Health
  await page.route('**/api/health**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), services: { mongodb: 'connected' } }) });
  });

  // List (less specific — registered first)
  await page.route('**/api/employees**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());

    if (method === 'GET') {
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const search = url.searchParams.get('search') || '';
      const dept = url.searchParams.get('department') || '';
      const status = url.searchParams.get('status') || '';

      let filtered = mockEmployees.filter(e => !deletedIds.has(e._id)).map(e => {
        const overrides = updatedFields.get(e._id);
        return overrides ? { ...e, ...overrides } : e;
      });

      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(e =>
          e.firstName.toLowerCase() === s || e.lastName.toLowerCase() === s ||
          e.email.toLowerCase().includes(s) || e.designation.toLowerCase().includes(s)
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format', details: [{ field: 'email', message: 'Invalid email' }] }) });
        return;
      }
      if (createdEmails.has(email)) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: `Email ${email} already exists` }) });
        return;
      }
      createdEmails.add(email);
      const newEmp: Employee = {
        _id: '665a000000000000000ff001',
        firstName: body['firstName'] as string,
        lastName: body['lastName'] as string,
        email,
        phone: (body['phone'] as string) || '',
        designation: body['designation'] as string,
        department: body['department'] as string,
        employmentType: body['employmentType'] as string,
        employmentStatus: (body['employmentStatus'] as string) || 'Active',
        startDate: body['startDate'] as string,
        address: body['address'] as Address,
        avatarUrl: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockEmployees.push(newEmp);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newEmp) });
      return;
    }

    await route.fallback();
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

    if (method === 'GET') {
      if (deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const emp = mockEmployees.find(e => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const overrides = updatedFields.get(id);
      const result = overrides ? { ...emp, ...overrides } : emp;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
      return;
    }

    if (method === 'PATCH') {
      if (deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const emp = mockEmployees.find(e => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const body = req.postDataJSON() as Record<string, unknown>;
      if ('designation' in body && (typeof body['designation'] !== 'string' || (body['designation'] as string).trim() === '')) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Designation must not be empty', details: [{ field: 'designation', message: 'Too small: expected string to have >=1 characters' }] }) });
        return;
      }
      if (body['email'] && typeof body['email'] === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body['email'])) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format', details: [{ field: 'email', message: 'Invalid email' }] }) });
        return;
      }
      // Validate known enum fields
      if (body['department'] && typeof body['department'] === 'string' && !['Engineering', 'Product', 'Design', 'QA', 'DevOps', 'Data', 'Marketing', 'Sales', 'HR', 'Finance', 'Legal', 'Operations', 'Other'].includes(body['department'])) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid department value', details: [{ field: 'department', message: 'Invalid value' }] }) });
        return;
      }
      if (body['employmentStatus'] && typeof body['employmentStatus'] === 'string' && !['Active', 'On Leave', 'Terminated'].includes(body['employmentStatus'])) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid status value', details: [{ field: 'employmentStatus', message: 'Invalid value' }] }) });
        return;
      }
      if (body['employmentType'] && typeof body['employmentType'] === 'string' && !['Full-Time', 'Part-Time', 'Contract', 'Intern'].includes(body['employmentType'])) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid type value', details: [{ field: 'employmentType', message: 'Invalid value' }] }) });
        return;
      }
      const existing = updatedFields.get(id) || {};
      const merged = { ...existing, ...body, updatedAt: new Date().toISOString() };
      updatedFields.set(id, merged);
      const result = { ...emp, ...merged };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
      return;
    }

    if (method === 'DELETE') {
      if (deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const emp = mockEmployees.find(e => e._id === id);
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