import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupEmployeeValidationMocks } from '../fixtures/employee-validation.fixture';

type ApiResponse = { status: number; body: Record<string, unknown> };

async function apiCall(
  page: Page,
  url: string,
  method: string,
  body?: Record<string, unknown> | null
): Promise<ApiResponse> {
  return page.evaluate(async (p) => {
    const res = await fetch(p.url, {
      method: p.method,
      headers: { 'Content-Type': 'application/json' },
      body: p.body != null ? JSON.stringify(p.body) : undefined,
    });
    const responseBody = await res.json().catch(() => null) as Record<string, unknown>;
    return { status: res.status, body: responseBody };
  }, { url, method, body: body ?? null } as { url: string; method: string; body: Record<string, unknown> | null });
}

test.describe('employee-validation — API Regression Suite', () => {

  test.describe('positive', () => {

    // TC-f8610e8d-fe9c-5978-eb67-c6385e56ac06  SCOPE:regression
    test('POST /api/employees returns 201 with complete valid payload (happy path)', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'ApiUser', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(201);
      expect(r.body._id).toBeTruthy();
      expect(r.body.firstName).toBe('Test');
      expect(r.body.email).toBe(email);
      const id = r.body._id as string;
      const get = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(get.status).toBe(200);
      expect(get.body.firstName).toBe('Test');
      expect(get.body.email).toBe(email);
      await apiCall(page, `/api/employees/${id}`, 'DELETE');
    });

  });

  test.describe('negative', () => {

    // TC-339d11b9-0ef3-5920-49b4-2343bcd30750  SCOPE:regression
    test('POST /api/employees returns 400 when required fields are missing', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees', 'POST', {
        lastName: 'ValidationUser', designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active', startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(400);
      expect(r.body.error || r.body.errors).toBeTruthy();
      const details = r.body.details as Record<string, unknown>[];
      const fields = details.map((d) => d.field);
      expect(fields).toContain('firstName');
      expect(fields).toContain('email');
      const list = await apiCall(page, '/api/employees', 'GET');
      expect(list.status).toBe(200);
      const data = list.body.data as Record<string, unknown>[];
      expect(data.some((e) => e.lastName === 'ValidationUser')).toBe(false);
    });

    // TC-54d4ddc7-2a2f-51bd-16a1-f9228a742aa2  SCOPE:regression
    test('GET /api/employees/:id returns 400 for malformed ObjectId', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const r = await apiCall(page, '/api/employees/invalid-id', 'GET');
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('INVALID_ID');
      expect(typeof r.body.message).toBe('string');
      expect((r.body.message as string).length).toBeGreaterThan(0);
      expect(r.body._id).toBeUndefined();
      expect(r.body.firstName).toBeUndefined();
      expect(r.body.email).toBeUndefined();
    });

  });

  test.describe('edge', () => {

    // TC-2078db68-1ddf-562b-8ee6-681a4d19732e  SCOPE:regression
    test('GET /api/employees/:id returns 400 for various malformed ObjectId formats', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const malformedIds = [
        '000000000000000000000000z',
        '12345',
        'null',
        'undefined',
        '..%2F..%2Fetc%2Fpasswd'
      ];
      for (const badId of malformedIds) {
        const r = await apiCall(page, `/api/employees/${badId}`, 'GET');
        expect(r.status).toBe(400);
        expect(r.body.error).toBe('INVALID_ID');
        expect(r.body._id).toBeUndefined();
        expect(r.body.firstName).toBeUndefined();
        expect(r.body.email).toBeUndefined();
      }
    });

  });

});

test.describe('employee-validation — API Gap Cases', () => {
  test.describe('positive', () => {
    // TC-757dbefd-fcbb-5e67-c989-f40139f724f7  SCOPE:new-feature
    test('POST with valid cellPhone format returns 201', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const body = {
        firstName: 'Test', lastName: 'User', email: `test+cellphone+valid+${Date.now()}@example.com`,
        designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time',
        employmentStatus: 'Active', startDate: '2024-01-15', phone: '212-555-0100',
        cellPhone: '917-555-0199', address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body._id).toBeTruthy();
      expect(r.body.cellPhone).toBe('917-555-0199');
      const del = await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      expect(del.status).toBe(204);
    });

    // TC-66fd9ad3-f1ce-5948-9315-6135361496ea  SCOPE:new-feature
    test('POST without cellPhone field succeeds (field is optional)', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const body = {
        firstName: 'Test', lastName: 'NoCellPhone', email: `test+nocellphone+${Date.now()}@example.com`,
        designation: 'Designer', department: 'Product', employmentType: 'Part-Time',
        employmentStatus: 'Active', startDate: '2024-06-01',
        address: { street: '789 Optional Ln', city: 'Optionalville', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body._id).toBeTruthy();
      expect(r.body.firstName).toBe('Test');
      const del = await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      expect(del.status).toBe(204);
    });

    // TC-673bf723-0214-5c5d-4dba-8a14caabfdf0  SCOPE:new-feature
    test('POST with valid cellPhone and valid phone both accepted', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const body = {
        firstName: 'Test', lastName: 'BothPhones', email: `test+bothphones+${Date.now()}@example.com`,
        designation: 'Manager', department: 'Operations', employmentType: 'Full-Time',
        employmentStatus: 'Active', startDate: '2024-02-01', phone: '212-555-0101',
        cellPhone: '646-555-0202', address: { street: '10 Dual Phone Rd', city: 'Phonecity', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(201);
      expect(r.body.phone).toBe('212-555-0101');
      expect(r.body.cellPhone).toBe('646-555-0202');
      const del = await apiCall(page, `/api/employees/${r.body._id}`, 'DELETE');
      expect(del.status).toBe(204);
    });
  });

  test.describe('negative', () => {
    // TC-7527e88d-7ffe-54e6-300d-8eaf929341ef  SCOPE:new-feature
    test('POST with invalid cellPhone format returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+invalid+${Date.now()}@example.com`;
      const body = {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time',
        employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: 'NOTAPHONE',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('VALIDATION_ERROR');
      const details = r.body.details as Record<string, unknown>[];
      const cellErr = details.find((d) => d.field === 'cellPhone');
      expect(cellErr).toBeTruthy();
    });

    // TC-f6d91ca5-8183-5f2f-c493-b7fd8ca15d96  SCOPE:new-feature
    test('POST with cellPhone containing special characters returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const body = {
        firstName: 'Test', lastName: 'User', email: `test+cellphone+special+${Date.now()}@example.com`,
        designation: 'Analyst', department: 'Finance', employmentType: 'Full-Time',
        employmentStatus: 'Active', startDate: '2024-03-01', cellPhone: '###-!!!-@@@@',
        address: { street: '456 Edge Ave', city: 'Edge City', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('VALIDATION_ERROR');
      const details = r.body.details as Record<string, unknown>[];
      expect(details.find((d) => d.field === 'cellPhone')).toBeTruthy();
    });

    // TC-5b94996e-1942-5c04-54ce-d2efe23a1ddf  SCOPE:new-feature
    test('POST with empty string cellPhone returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+emptycell+${Date.now()}@example.com`;
      const body = {
        firstName: 'Test', lastName: 'EmptyCell', email,
        designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time',
        employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: '',
        address: { street: '1 Empty St', city: 'Emptytown', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('VALIDATION_ERROR');
      const details = r.body.details as Record<string, unknown>[];
      expect(details.find((d) => d.field === 'cellPhone')).toBeTruthy();
    });

    // TC-02445407-4d81-5b33-ef3e-da25431eb3cf  SCOPE:new-feature
    test('POST with invalid phone (work phone) format returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const body = {
        firstName: 'Test', lastName: 'BadWorkPhone', email: `test+badworkphone+${Date.now()}@example.com`,
        designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time',
        employmentStatus: 'Active', startDate: '2024-01-15', phone: 'INVALID',
        address: { street: '5 Bad Phone St', city: 'Errortown', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('VALIDATION_ERROR');
      const details = r.body.details as Record<string, unknown>[];
      expect(details.find((d) => d.field === 'phone')).toBeTruthy();
    });
  });

  test.describe('edge', () => {
    // TC-b47c123d-aed7-5e6e-d8e1-9c05a8c12381  SCOPE:new-feature
    test('POST with cellPhone exceeding maximum length returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const longPhone = '1234567890'.repeat(5);
      const body = {
        firstName: 'Test', lastName: 'LongCell', email: `test+longcell+${Date.now()}@example.com`,
        designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time',
        employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: longPhone,
        address: { street: '2 Long St', city: 'Longtown', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('VALIDATION_ERROR');
      const details = r.body.details as Record<string, unknown>[];
      expect(details.find((d) => d.field === 'cellPhone')).toBeTruthy();
    });

    // TC-e9798b20-94ef-5459-da35-1e8ca2f56a1f  SCOPE:new-feature
    test('POST with null cellPhone returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const body = {
        firstName: 'Test', lastName: 'NullCell', email: `test+nullcell+${Date.now()}@example.com`,
        designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time',
        employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: null,
        address: { street: '3 Null Blvd', city: 'Nullcity', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('VALIDATION_ERROR');
      const details = r.body.details as Record<string, unknown>[];
      expect(details.find((d) => d.field === 'cellPhone')).toBeTruthy();
    });

    // TC-deda5983-31ff-561c-ba75-2f0fb5dd9345  SCOPE:new-feature
    test('POST with cellPhone as numeric type (not string) returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const body = {
        firstName: 'Test', lastName: 'NumericCell', email: `test+numericcell+${Date.now()}@example.com`,
        designation: 'Engineer', department: 'Engineering', employmentType: 'Full-Time',
        employmentStatus: 'Active', startDate: '2024-01-15', cellPhone: 9175550199,
        address: { street: '7 Type Error Blvd', city: 'Typecity', country: 'United States' }
      };
      const r = await apiCall(page, '/api/employees', 'POST', body);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('VALIDATION_ERROR');
      const details = r.body.details as Record<string, unknown>[];
      expect(details.find((d) => d.field === 'cellPhone')).toBeTruthy();
    });
  });
});

test.describe('employee-validation — API Gap Cases', () => {
  test.describe('positive', () => {
    // TC-2a89b86b-29e7-5feb-08e1-f6f554348fc3  SCOPE:new-feature
    test('valid cellPhone format accepted on employee creation', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+valid+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', cellPhone: '+12125551234',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(typeof body._id).toBe('string');
      expect((body._id as string).length).toBeGreaterThan(0);
      expect(body.cellPhone).toBe('+12125551234');
      const del = await apiCall(page, `/api/employees/${body._id}`, 'DELETE');
      expect(del.status).toBe(204);
    });

    // TC-47a13109-5a60-5b20-032a-05317010cca2  SCOPE:new-feature
    test('cellPhone omitted entirely — employee created successfully', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+omitted+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(typeof body._id).toBe('string');
      expect((body._id as string).length).toBeGreaterThan(0);
      const cellPhone = body.cellPhone;
      expect(cellPhone === undefined || cellPhone === null || cellPhone === '').toBeTruthy();
      const del = await apiCall(page, `/api/employees/${body._id}`, 'DELETE');
      expect(del.status).toBe(204);
    });

    // TC-4a4bb5ef-ab76-5a73-b049-8db1013c156b  SCOPE:new-feature
    test('cellPhone field persisted independently of phone field', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+workphone+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', cellPhone: '+12125550001', phone: '+12125550002',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(body.cellPhone).toBe('+12125550001');
      expect(body.phone).toBe('+12125550002');
      const get = await apiCall(page, `/api/employees/${body._id}`, 'GET');
      expect(get.status).toBe(200);
      const fetched = get.body as Record<string, unknown>;
      expect(fetched.cellPhone).toBe('+12125550001');
      expect(fetched.phone).toBe('+12125550002');
      const del = await apiCall(page, `/api/employees/${body._id}`, 'DELETE');
      expect(del.status).toBe(204);
    });
  });

  test.describe('negative', () => {
    // TC-734c707b-b1dd-56da-e3a7-5deb19c43357  SCOPE:new-feature
    test('invalid cellPhone format (letters) returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+letters+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', cellPhone: 'ABCDEFGHIJ',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(400);
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });

    // TC-4527732b-b342-5871-694d-ad136f1d2936  SCOPE:new-feature
    test('invalid cellPhone format (special characters only) returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+special+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', cellPhone: '!!!###$$$',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(400);
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });

    // TC-4f2bb5cc-ce73-54ea-6a87-d67a90b00b97  SCOPE:new-feature
    test('cellPhone as empty string returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+empty+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', cellPhone: '',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(400);
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });

    // TC-1e1594a1-2167-570d-de4d-b10b1737f270  SCOPE:new-feature
    test('cellPhone with valid digits but no country code returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+nocountrycode+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', cellPhone: '2125551234',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(400);
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });

    // TC-753642b3-f7aa-511f-bae8-0497d81c4c7e  SCOPE:new-feature
    test('cellPhone as null value returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+null+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', cellPhone: null,
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(400);
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });
  });

  test.describe('edge', () => {
    // TC-a2161252-fdc9-5ec0-de8c-79ab4ae3a835  SCOPE:new-feature
    test('cellPhone exceeding maximum length returns 400', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+toolong+${Date.now()}@example.com`;
      const longPhone = '+' + '1'.repeat(50);
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', cellPhone: longPhone,
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(400);
      const body = r.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
    });

    // TC-2b32e584-a9f7-54b6-00da-4991df58df82  SCOPE:new-feature
    test('cellPhone at minimum valid length boundary accepted', async ({ page }) => {
      await setupEmployeeValidationMocks(page);
      await page.goto('/');
      const email = `test+cellphone+minlength+${Date.now()}@example.com`;
      const r = await apiCall(page, '/api/employees', 'POST', {
        firstName: 'Test', lastName: 'User', email,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', cellPhone: '+1234567',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(201);
      const body = r.body as Record<string, unknown>;
      expect(typeof body._id).toBe('string');
      expect((body._id as string).length).toBeGreaterThan(0);
      expect(body.cellPhone).toBe('+1234567');
      const del = await apiCall(page, `/api/employees/${body._id}`, 'DELETE');
      expect(del.status).toBe(204);
    });
  });
});
