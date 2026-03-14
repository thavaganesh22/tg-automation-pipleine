import { Page } from '@playwright/test';

export async function setupEmployeeDeleteMocks(page: Page): Promise<void> {
  const deletedIds = new Set<string>();
  const createdEmails = new Set<string>();

  const departments = ['Engineering', 'Product', 'Design', 'QA', 'HR'];
  const statuses: Array<'Active' | 'On Leave' | 'Terminated'> = ['Active', 'On Leave', 'Terminated'];
  const types: Array<'Full-Time' | 'Part-Time' | 'Contract' | 'Intern'> = ['Full-Time', 'Part-Time', 'Contract', 'Intern'];

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

  const mockEmployees: Employee[] = Array.from({ length: 25 }, (_, i) => {
    const id = `665a${(i + 1).toString(16).padStart(20, '0')}`;
    const dept = departments[i % departments.length];
    const status = statuses[i % statuses.length];
    const type = types[i % types.length];
    const first = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack',
      'Karen', 'Leo', 'Mona', 'Nate', 'Olivia', 'Paul', 'Quinn', 'Rita', 'Sam', 'Tina',
      'Uma', 'Vic', 'Wendy', 'Xander', 'Yara'][i];
    const last = ['Smith', 'Jones', 'Brown', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson',
      'White', 'Harris', 'Martin', 'Garcia', 'Clark', 'Lewis', 'Walker', 'Hall', 'Allen', 'Young',
      'King', 'Wright', 'Lopez', 'Hill', 'Scott'][i];
    return {
      _id: id,
      firstName: first,
      lastName: last,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@company.com`,
      phone: `+1-555-${String(1000 + i)}`,
      designation: `${dept} Specialist`,
      department: dept,
      employmentType: type,
      employmentStatus: status,
      startDate: '2024-01-15',
      address: { street: `${100 + i} Main St`, city: 'Springfield', state: 'IL', postalCode: '62701', country: 'USA' },
      avatarUrl: '',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
  });

  const isValidObjectId = (id: string) => /^[0-9a-f]{24}$/.test(id);

  // Health
  await page.route('**/api/health**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), services: { mongodb: 'connected' } }) });
  });

  // List employees (less specific — registered first)
  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const url = new URL(route.request().url());
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const department = url.searchParams.get('department') || '';
      const status = url.searchParams.get('status') || '';

      let filtered = mockEmployees.filter((e) => !deletedIds.has(e._id));
      if (search) {
        filtered = filtered.filter((e) =>
          [e.firstName, e.lastName, e.email, e.designation].some((f) => f.toLowerCase().includes(search))
        );
      }
      if (department && departments.includes(department)) {
        filtered = filtered.filter((e) => e.department === department);
      }
      if (status && (statuses as string[]).includes(status)) {
        filtered = filtered.filter((e) => e.employmentStatus === status);
      }

      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / limit));
      const start = (pageNum - 1) * limit;
      const data = filtered.slice(start, start + limit);

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { total, page: pageNum, limit, pages } }) });
    } else if (method === 'POST') {
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
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format', details: [{ field: 'email', message: 'Invalid email' }] }) });
        return;
      }
      const allEmails = mockEmployees.filter((e) => !deletedIds.has(e._id)).map((e) => e.email);
      if (allEmails.includes(email) || createdEmails.has(email)) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'DUPLICATE_EMAIL', message: `Email ${email} already exists` }) });
        return;
      }
      createdEmails.add(email);
      const newId = '665a000000000000000ff001';
      const newEmp: Employee = {
        _id: newId,
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
      mockEmployees.unshift(newEmp);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newEmp) });
    } else {
      await route.fallback();
    }
  });

  // Single employee (more specific — registered last for higher priority)
  await page.route('**/api/employees/*', async (route) => {
    const method = route.request().method();
    const urlPath = new URL(route.request().url()).pathname;
    const segments = urlPath.split('/');
    const id = segments[segments.length - 1];

    if (!isValidObjectId(id)) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'INVALID_ID', message: `'${id}' is not a valid employee id` }) });
      return;
    }

    if (method === 'GET') {
      const emp = mockEmployees.find((e) => e._id === id);
      if (!emp || deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emp) });
    } else if (method === 'DELETE') {
      if (deletedIds.has(id)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const emp = mockEmployees.find((e) => e._id === id);
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
      const emp = mockEmployees.find((e) => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'NOT_FOUND', message: `Employee with id ${id} not found` }) });
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email as string)) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Invalid email format', details: [{ field: 'email', message: 'Invalid email' }] }) });
        return;
      }
      Object.assign(emp, body, { updatedAt: new Date().toISOString() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emp) });
    } else {
      await route.fallback();
    }
  });
}