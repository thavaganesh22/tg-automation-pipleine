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
        firstName: 'Test', lastName: 'ApiUser', email, designation: 'Engineer',
        department: 'Engineering', employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15', address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      expect(r.status).toBe(201);
      expect(r.body._id).toBeTruthy();
      expect(r.body.firstName).toBe('Test');
      expect(r.body.email).toBe(email);
      const id = r.body._id as string;
      const getR = await apiCall(page, `/api/employees/${id}`, 'GET');
      expect(getR.status).toBe(200);
      expect(getR.body.firstName).toBe('Test');
      expect(getR.body.email).toBe(email);
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
      expect(r.body.error).toBe('VALIDATION_ERROR');
      const details = r.body.details as Record<string, unknown>[];
      const fields = details.map(d => d.field);
      expect(fields).toContain('firstName');
      expect(fields).toContain('email');
      const listR = await apiCall(page, '/api/employees', 'GET');
      const data = listR.body.data as Record<string, unknown>[];
      expect(data.every(e => e.lastName !== 'ValidationUser')).toBe(true);
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
      expect(r.body.lastName).toBeUndefined();
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