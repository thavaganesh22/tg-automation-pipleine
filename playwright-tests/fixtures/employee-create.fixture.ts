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
const statuses: Array<'Active' | 'On Leave' | 'Terminated'> = ['Active', 'On Leave', 'Terminated'];
const types = ['Full-Time', 'Part-Time', 'Contract', 'Intern'];
const names = [
  ['Grace', 'Adeyemi'], ['Aisha', 'Al-Rashid'], ['Carlos', 'Mendez'], ['Diana', 'Chen'], ['Erik', 'Johansson'],
  ['Fatima', 'Hassan'], ['George', 'Papadopoulos'], ['Hana', 'Tanaka'], ['Ivan', 'Petrov'], ['Julia', 'Santos'],
  ['Kofi', 'Asante'], ['Lena', 'Mueller'], ['Marco', 'Rossi'], ['Nina', 'Kowalski'], ['Oscar', 'Lindgren'],
  ['Priya', 'Sharma'], ['Quinn', 'O\'Brien'], ['Rosa', 'Garcia'], ['Sven', 'Eriksson'], ['Tara', 'Nguyen'],
  ['Uma', 'Patel'], ['Victor', 'Dubois'], ['Wendy', 'Kim'], ['Xavier', 'Moreau'], ['Yuki', 'Watanabe'],
];

function buildMockEmployees(): Employee[] {
  const now = '2026-03-14T00:00:00.000Z';
  return names.map(([first, last], i) => ({
    _id: `665a${(i + 1).toString(16).padStart(20, '0')}`,
    firstName: first,
    lastName: last,
    email: `${first.toLowerCase()}.${last.toLowerCase().replace(/'/g, '')}@company.com`,
    phone: `+1-555-${String(1000 + i)}`,
    designation: ['Software Engineer', 'UX Designer', 'Product Manager', 'QA Engineer', 'HR Coordinator'][i % 5],
    department: departments[i % departments.length],
    employmentType: types[i % types.length],
    employmentStatus: statuses[i % statuses.length],
    startDate: '2024-01-15',
    address: { street: `${100 + i} Main St`, city: 'Metropolis', state: 'NY', postalCode: '10001', country: 'USA' },
    avatarUrl: '',
    createdAt: now,
    updatedAt: now,
  }));
}

export async function setupEmployeeCreateMocks(page: Page): Promise<void> {
  const mockEmployees = buildMockEmployees();
  const deletedIds = new Set<string>();
  const createdEmployees: Employee[] = [];
  const existingEmails = new Set(mockEmployees.map(e => e.email.toLowerCase().trim()));
  let createCounter = 0;

  // Health
  await page.route('**/api/health**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), services: { mongodb: 'connected' } }) });
  });

  // List employees (less specific — registered first)
  await page.route('**/api/employees**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url(), 'http://localhost');

    if (method === 'GET') {
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const search = (url.searchParams.get('search') || '').toLowerCase().trim();
      const department = url.searchParams.get('department') || '';
      const status = url.searchParams.get('status') || '';

      const allEmps = [...mockEmployees, ...createdEmployees].filter(e => !deletedIds.has(e._id));
      let filtered = allEmps;

      if (search) {
        filtered = filtered.filter(e =>
          [e.firstName, e.lastName, e.email, e.designation].some(f => f.toLowerCase().includes(search))
        );
      }
      if (department && departments.includes(department)) {
        filtered = filtered.filter(e => e.department === department);
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
      const body = req.postDataJSON() as Record<string, unknown>;
      const requiredFields = ['firstName', 'lastName', 'email', 'designation', 'department', 'employmentType', 'startDate'];
      const details: Array<{ field: string; message: string }> = [];

      for (const field of requiredFields) {
        if (!body[field] || (typeof body[field] === 'string' && !(body[field] as string).trim())) {
          details.push({ field, message: 'Required' });
        }
      }

      const addr = body.address as Record<string, unknown> | undefined;
      if (!addr || typeof addr !== 'object') {
        details.push({ field: 'address', message: 'Required' });
      } else {
        for (const af of ['street', 'city', 'country']) {
          if (!addr[af] || (typeof addr[af] === 'string' && !(addr[af] as string).trim())) {
            details.push({ field: `address.${af}`, message: 'Required' });
          }
        }
      }

      if (details.length > 0) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details }) });
        return;
      }

      const email = (body.email as string).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'email', message: 'Invalid email format' }] }) });
        return;
      }

      if (existingEmails.has(email)) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: `Employee with email ${email} already exists` }) });
        return;
      }

      createCounter++;
      const newId = `665a000000000000000ff${createCounter.toString(16).padStart(3, '0')}`;
      const now = new Date().toISOString();
      const newEmployee: Employee = {
        _id: newId,
        firstName: (body.firstName as string).trim(),
        lastName: (body.lastName as string).trim(),
        email: email,
        phone: ((body.phone as string) || '').trim(),
        designation: (body.designation as string).trim(),
        department: (body.department as string).trim(),
        employmentType: (body.employmentType as string).trim(),
        employmentStatus: ((body.employmentStatus as string) || 'Active').trim(),
        startDate: (body.startDate as string).trim(),
        address: {
          street: (addr!.street as string || '').trim(),
          city: (addr!.city as string || '').trim(),
          state: (addr!.state as string || '').trim(),
          postalCode: (addr!.postalCode as string || '').trim(),
          country: (addr!.country as string || '').trim(),
        },
        avatarUrl: '',
        createdAt: now,
        updatedAt: now,
      };

      createdEmployees.push(newEmployee);
      existingEmails.add(email);

      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newEmployee) });
      return;
    }

    await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) });
  });

  // Single employee (more specific — registered last for higher priority)
  await page.route('**/api/employees/*', async (route) => {
    const req = route.request();
    const method = req.method();
    const urlPath = new URL(req.url(), 'http://localhost').pathname;
    const segments = urlPath.split('/');
    const id = segments[segments.length - 1];

    // Skip if this looks like a list request (no actual ID segment)
    if (!id || id === 'employees') {
      await route.fallback();
      return;
    }

    const hexRegex = /^[0-9a-fA-F]{24}$/;
    if (!hexRegex.test(id)) {
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
      existingEmails.delete(emp.email.toLowerCase().trim());
      await route.fulfill({ status: 204, body: '' });
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
      const body = req.postDataJSON() as Record<string, unknown>;
      if (body.email) {
        const emailVal = (body.email as string).trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailVal)) {
          await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'email', message: 'Invalid email format' }] }) });
          return;
        }
      }
      const updated = { ...emp, ...body, updatedAt: new Date().toISOString() };
      const idx = allEmps.findIndex(e => e._id === id);
      if (idx < mockEmployees.length) {
        mockEmployees[idx] = updated as Employee;
      } else {
        createdEmployees[idx - mockEmployees.length] = updated as Employee;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }

    await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) });
  });
}