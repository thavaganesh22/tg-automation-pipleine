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
const statuses: Employee['employmentStatus'][] = ['Active', 'On Leave', 'Terminated'];
const types: Employee['employmentType'][] = ['Full-Time', 'Part-Time', 'Contract'];
const desigs = ['Software Engineer', 'Product Manager', 'Designer', 'QA Analyst', 'HR Specialist',
  'Tech Lead', 'Senior Engineer', 'Junior Designer', 'Intern', 'Director'];

const mockEmployees: Employee[] = Array.from({ length: 45 }, (_, i) => {
  const id = (i + 1).toString().padStart(24, '665a0000000000000000000');
  return {
    _id: id,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    email: `employee${i + 1}@company.com`,
    designation: desigs[i % desigs.length],
    department: depts[i % depts.length],
    employmentType: types[i % types.length],
    employmentStatus: statuses[i % statuses.length],
  };
});

export async function setupEmployeeTableMocks(page: Page): Promise<void> {
  // List employees
  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      const url = new URL(route.request().url(), 'http://localhost');
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const department = url.searchParams.get('department');
      const status = url.searchParams.get('employmentStatus') || url.searchParams.get('status');
      const search = url.searchParams.get('search') || url.searchParams.get('q');

      let filtered = [...mockEmployees];
      if (department) filtered = filtered.filter(e => e.department === department);
      if (status) filtered = filtered.filter(e => e.employmentStatus === status);
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(e =>
          e.firstName.toLowerCase().includes(s) ||
          e.lastName.toLowerCase().includes(s) ||
          e.email.toLowerCase().includes(s)
        );
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
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body && body.error) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal Server Error' }) });
        return;
      }
      const created: Employee = {
        _id: '665a0000000000000000099',
        firstName: (body?.firstName as string) || 'New',
        lastName: (body?.lastName as string) || 'Employee',
        email: (body?.email as string) || 'new@company.com',
        designation: (body?.designation as string) || 'Software Engineer',
        department: (body?.department as string) || 'Engineering',
        employmentType: (body?.employmentType as Employee['employmentType']) || 'Full-Time',
        employmentStatus: 'Active',
      };
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }

    await route.fallback();
  });

  // Single employee by ID
  await page.route('**/api/employees/*', async (route) => {
    const method = route.request().method();
    const urlPath = new URL(route.request().url(), 'http://localhost').pathname;
    const segments = urlPath.split('/').filter(Boolean);
    const id = segments[segments.length - 1];

    // Skip if this is the list endpoint (no specific ID segment beyond 'employees')
    if (id === 'employees') { await route.fallback(); return; }

    const validId = /^[a-fA-F0-9]{24}$/.test(id);

    if (method === 'GET') {
      if (!validId) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'INVALID_ID', message: 'Invalid employee ID' }) });
        return;
      }
      const emp = mockEmployees.find(e => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Employee not found' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emp) });
      return;
    }

    if (method === 'PATCH') {
      if (!validId) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'INVALID_ID', message: 'Invalid employee ID' }) });
        return;
      }
      const emp = mockEmployees.find(e => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Employee not found' }) });
        return;
      }
      const updates = route.request().postDataJSON() as Record<string, unknown>;
      const updated = { ...emp, ...updates };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }

    if (method === 'DELETE') {
      if (!validId) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'INVALID_ID', message: 'Invalid employee ID' }) });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fallback();
  });
}