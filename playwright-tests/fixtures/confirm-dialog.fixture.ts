import { Page } from '@playwright/test';

interface Employee {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  department: string;
  employmentType: string;
  employmentStatus: string;
}

const departments = ['Engineering', 'Product', 'Design', 'QA', 'HR'];
const statuses: string[] = ['Active', 'Active', 'Active', 'On Leave', 'Terminated'];
const types: string[] = ['Full-Time', 'Full-Time', 'Part-Time', 'Contract'];
const designations = ['Software Engineer', 'Product Manager', 'Designer', 'QA Lead', 'HR Specialist'];

const mockEmployees: Employee[] = Array.from({ length: 5 }, (_, i) => {
  const idx = i + 1;
  const padded = idx.toString().padStart(3, '0');
  const dept = departments[i % departments.length];
  return {
    _id: `665a000000000000000000${idx.toString(16).padStart(2, '0')}`,
    firstName: `First${padded}`,
    lastName: `Last${padded}`,
    email: `employee${padded}@example.com`,
    designation: designations[i % designations.length],
    department: dept,
    employmentType: types[i % types.length],
    employmentStatus: statuses[i % statuses.length],
  };
});

let liveEmployees: Employee[] = [];

export async function setupConfirmDialogMocks(page: Page): Promise<void> {
  liveEmployees = [...mockEmployees];

  // LIST employees
  await page.route('**/api/employees**', async (route) => {
    const method = route.request().method();
    const url = route.request().url();

    if (method === 'GET' && !url.match(/\/api\/employees\/[a-f0-9]/)) {
      const urlObj = new URL(url);
      const page_num = parseInt(urlObj.searchParams.get('page') || '1', 10);
      const limit = parseInt(urlObj.searchParams.get('limit') || '20', 10);
      const start = (page_num - 1) * limit;
      const paged = liveEmployees.slice(start, start + limit);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: paged,
          pagination: {
            total: liveEmployees.length,
            page: page_num,
            limit,
            pages: Math.ceil(liveEmployees.length / limit) || 1,
          },
        }),
      });
      return;
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body && (body as Record<string, unknown>).error === true) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal Server Error' }) });
        return;
      }
      const created: Employee = {
        _id: '665a0000000000000000ff01',
        firstName: (body.firstName as string) || 'New',
        lastName: (body.lastName as string) || 'Employee',
        email: (body.email as string) || 'new@example.com',
        designation: (body.designation as string) || 'Engineer',
        department: (body.department as string) || 'Engineering',
        employmentType: (body.employmentType as string) || 'Full-Time',
        employmentStatus: (body.employmentStatus as string) || 'Active',
      };
      liveEmployees.push(created);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }

    await route.fallback();
  });

  // SINGLE employee: GET / PATCH / DELETE
  await page.route(/\/api\/employees\/[^?]+/, async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    const idMatch = url.match(/\/api\/employees\/([^?/]+)/);
    const id = idMatch ? idMatch[1] : '';

    if (!/^[a-f0-9]{24}$/.test(id)) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'INVALID_ID', message: 'Invalid employee ID' }) });
      return;
    }

    if (method === 'GET') {
      const emp = liveEmployees.find((e) => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Employee not found' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emp) });
      return;
    }

    if (method === 'DELETE') {
      // Simulate error when special header is present
      const headers = route.request().headers();
      if (headers['x-simulate-error'] === 'true') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Deletion failed' }) });
        return;
      }
      const idx = liveEmployees.findIndex((e) => e._id === id);
      if (idx === -1) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Employee not found' }) });
        return;
      }
      liveEmployees.splice(idx, 1);
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (method === 'PATCH') {
      const emp = liveEmployees.find((e) => e._id === id);
      if (!emp) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Employee not found' }) });
        return;
      }
      const body = route.request().postDataJSON() as Partial<Employee>;
      Object.assign(emp, body);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emp) });
      return;
    }

    await route.fallback();
  });
}