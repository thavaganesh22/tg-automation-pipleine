import { test, expect } from '@playwright/test';
import { EmployeeEditPage } from '../pages/employee-edit.page';

test.describe('employee-edit — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-fa99e7a2-e5ec-5477-c633-1787a0285a98  SCOPE:regression
    test('Edit drawer pre-populates all fields with existing employee data', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      // Step 1: Retrieve the first seeded employee's ID
      const id = await po.getFirstEmployeeId();
      expect(id).toBeTruthy();

      // Fetch full employee details via API for assertion
      const employee = await po.getEmployeeById(id);
      const firstName = (employee as Record<string, unknown>).firstName as string;
      const lastName = (employee as Record<string, unknown>).lastName as string;
      const email = (employee as Record<string, unknown>).email as string;
      const department = (employee as Record<string, unknown>).department as string;
      const designation = (employee as Record<string, unknown>).designation as string;

      // Step 2: Navigate to root (already done, but ensure fresh state)
      await po.navigate();

      // Step 3: Search for the employee by first name to ensure row is on page 1
      await po.searchEmployees(firstName);

      // Step 4: Verify the row is visible and click it
      const rowVisible = await po.isEmployeeRowVisible(id);
      expect(rowVisible).toBe(true);
      await po.clickEmployeeRow(id);

      // Wait for drawer to open
      await po.waitForDrawerOpen();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 5: Verify First Name is pre-populated
      const actualFirstName = await po.getFirstNameValue();
      expect(actualFirstName).toBe(firstName);

      // Step 6: Verify Last Name is pre-populated
      const actualLastName = await po.getLastNameValue();
      expect(actualLastName).toBe(lastName);

      // Step 7: Verify Email is pre-populated
      const actualEmail = await po.getEmailValue();
      expect(actualEmail).toBe(email);

      // Step 8: Verify Department is pre-populated
      const actualDepartment = await po.getDepartmentValue();
      expect(actualDepartment).toBe(department);

      // Step 9: Verify Designation (Role) is pre-populated
      const actualDesignation = await po.getDesignationValue();
      expect(actualDesignation).toBe(designation);

      // Step 10: Verify drawer is in edit mode — drawer title is "Personal Information"
      // and the form is pre-filled (already verified above). Confirm drawer is visible.
      const drawerStillVisible = await po.isDrawerVisible();
      expect(drawerStillVisible).toBe(true);

      // Step 11: Close the drawer without making changes
      await po.closeDrawer();
      const drawerClosed = await po.isDrawerVisible();
      expect(drawerClosed).toBe(false);
    });

  });

  test.describe('negative', () => {

    // TC-b38c4b78-4e84-53ed-e9de-7428e55e1194  SCOPE:regression
    test('Edit drawer discards unsaved changes and restores original data on cancel', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      // Step 1: Create a dedicated test employee with unique email
      const uniqueEmail = `test.cancel.${Date.now()}@test.com`;
      const originalFirstName = 'CancelTest';
      const originalLastName = 'Employee';
      const id = await po.createEmployee({
        firstName: originalFirstName,
        lastName: originalLastName,
        email: uniqueEmail,
        designation: 'QA Tester',
        department: 'QA',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '456 Cancel St', city: 'Test City', country: 'United States' },
      });

      try {
        // Step 2: Navigate to root to reload the list
        await po.navigate();

        // Step 3: Search for the created employee
        await po.searchEmployees(originalFirstName);

        // Verify the row is visible
        const rowVisible = await po.isEmployeeRowVisible(id);
        expect(rowVisible).toBe(true);

        // Step 4: Click the employee row to open edit drawer
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const drawerVisible = await po.isDrawerVisible();
        expect(drawerVisible).toBe(true);

        // Verify pre-populated values match original data
        const preFirstName = await po.getFirstNameValue();
        expect(preFirstName).toBe(originalFirstName);
        const preEmail = await po.getEmailValue();
        expect(preEmail).toBe(uniqueEmail);

        // Step 5: Clear First Name and type a temporary value
        await po.fillFirstName('UNSAVED_EDIT');
        const editedFirstName = await po.getFirstNameValue();
        expect(editedFirstName).toBe('UNSAVED_EDIT');

        // Step 6: Clear Email and type a temporary value
        const unsavedEmail = `unsaved.${Date.now()}@test.com`;
        await po.fillEmail(unsavedEmail);
        const editedEmail = await po.getEmailValue();
        expect(editedEmail).toBe(unsavedEmail);

        // Step 7: Click Cancel without saving
        await po.cancelForm();
        const drawerAfterCancel = await po.isDrawerVisible();
        expect(drawerAfterCancel).toBe(false);

        // Step 8: Search for the employee again
        await po.searchEmployees(originalFirstName);
        const rowStillVisible = await po.isEmployeeRowVisible(id);
        expect(rowStillVisible).toBe(true);

        // Step 9: Click the employee row again to reopen the edit drawer
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const drawerReopened = await po.isDrawerVisible();
        expect(drawerReopened).toBe(true);

        // Step 10: Verify First Name is restored to original value
        const restoredFirstName = await po.getFirstNameValue();
        expect(restoredFirstName).toBe(originalFirstName);

        // Step 11: Verify Email is restored to original value
        const restoredEmail = await po.getEmailValue();
        expect(restoredEmail).toBe(uniqueEmail);

        // Step 12: Close the drawer
        await po.closeDrawer();
      } finally {
        // Cleanup: delete the dedicated test employee
        await po.deleteEmployee(id);
      }
    });

  });

  test.describe('edge', () => {
    // No edge cases defined for this module
  });

});

test.describe('employee-edit — UI Gap Cases', () => {
  test.describe('positive', () => {
    // TC-c050df35-ca2e-5a8c-8028-82fd90bd19e3  SCOPE:new-feature
    test('Cell phone field is visible in the edit form', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const id = await po.getFirstEmployeeId();
      await po.openEmployeeEditDrawer(id);
      await po.waitForDrawerOpen();
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      await expect(cellPhoneInput).toBeVisible();
      await expect(cellPhoneInput).toBeEnabled();
      await expect(cellPhoneInput).toBeEditable();
    });

    // TC-91d7fde6-2483-5b07-f82e-330be5fcf6ea  SCOPE:new-feature
    test('Existing phone field label reads Work Phone in edit form', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const id = await po.getFirstEmployeeId();
      await po.openEmployeeEditDrawer(id);
      await po.waitForDrawerOpen();
      const drawer = page.locator('[data-testid="employee-drawer"]');
      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();
      const allLabels = drawer.locator('label');
      const count = await allLabels.count();
      for (let i = 0; i < count; i++) {
        const text = (await allLabels.nth(i).textContent()) ?? '';
        const trimmed = text.trim();
        if (trimmed === 'Phone') {
          throw new Error('Found standalone "Phone" label — expected "Work Phone" instead');
        }
      }
    });

    // TC-a6a07a8d-9075-5958-9e95-3a4b60e1bbd4  SCOPE:new-feature
    test('Cell phone field is visible in the add (create) employee form', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      await expect(cellPhoneInput).toBeVisible();
      await expect(cellPhoneInput).toBeEnabled();
      const drawer = page.locator('[data-testid="employee-drawer"]');
      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();
    });

    // TC-7693b848-f613-5097-6fd9-fe67f98193a5  SCOPE:new-feature
    test('Cell phone value is saved and displayed after editing an employee', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      const id = await po.createEmployee({
        firstName: 'UITest', lastName: 'User', email: uniqueEmail,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      try {
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
        await cellPhoneInput.clear();
        await cellPhoneInput.fill('555-010-0001');
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const savedValue = await page.locator('[data-testid="cellPhone-input"]').inputValue();
        expect(savedValue).toBe('555-010-0001');
      } finally {
        await po.deleteEmployee(id);
      }
    });

    // TC-37ee3084-b973-5ccf-437d-d2b1e827aa7a  SCOPE:new-feature
    test('Both Work Phone and Cell Phone labels appear together without duplication', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const id = await po.getFirstEmployeeId();
      await po.openEmployeeEditDrawer(id);
      await po.waitForDrawerOpen();
      const drawer = page.locator('[data-testid="employee-drawer"]');
      const workPhoneLabels = drawer.locator('label', { hasText: 'Work Phone' });
      const cellPhoneLabels = drawer.locator('label', { hasText: 'Cell Phone' });
      await expect(workPhoneLabels).toHaveCount(1);
      await expect(cellPhoneLabels).toHaveCount(1);
      const allLabels = drawer.locator('label');
      const count = await allLabels.count();
      for (let i = 0; i < count; i++) {
        const text = (await allLabels.nth(i).textContent()) ?? '';
        const trimmed = text.trim();
        if (trimmed === 'Phone') {
          throw new Error('Found standalone "Phone" label — should not exist');
        }
      }
    });

    // TC-5bfd69b9-0ab5-58b5-e00c-2640a6ff357e  SCOPE:new-feature
    test('Cell phone value entered during employee creation is persisted and visible on re-open', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      await po.fillFirstName('UITest');
      await page.locator('[data-testid="lastName-input"]').fill('CreatedUser');
      await po.fillEmail(uniqueEmail);
      await page.locator('[data-testid="designation-input"]').fill('Engineer');
      await page.locator('[data-testid="department-select"]').selectOption('Engineering');
      await page.locator('[data-testid="employmentType-select"]').selectOption('Full-Time');
      await page.locator('[data-testid="street-input"]').fill('123 Test St');
      await page.locator('[data-testid="city-input"]').fill('Test City');
      await page.locator('[data-testid="country-input"]').fill('United States');
      await page.locator('[data-testid="cellPhone-input"]').fill('555-020-0002');
      await po.submitEmployeeForm();
      await po.waitForSuccessToast();
      let createdId = '';
      try {
        await po.searchEmployees('UITest');
        const rows = page.locator('[data-testid^="employee-row-"]');
        const firstRowTestId = await rows.first().getAttribute('data-testid');
        createdId = firstRowTestId?.replace('employee-row-', '') ?? '';
        await po.clickEmployeeRow(createdId);
        await po.waitForDrawerOpen();
        const savedValue = await page.locator('[data-testid="cellPhone-input"]').inputValue();
        expect(savedValue).toBe('555-020-0002');
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });

    // TC-f3b6b55e-ec9b-5ee2-a987-aaeb1fb4554d  SCOPE:new-feature
    test('Work Phone label is displayed in the edit form (not Phone)', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const id = await po.getFirstEmployeeId();
      await po.openEmployeeEditDrawer(id);
      await po.waitForDrawerOpen();
      const drawer = page.locator('[data-testid="employee-drawer"]');
      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();
      const allLabels = drawer.locator('label');
      const count = await allLabels.count();
      for (let i = 0; i < count; i++) {
        const text = (await allLabels.nth(i).textContent()) ?? '';
        if (text.trim() === 'Phone') {
          throw new Error('Found standalone "Phone" label — expected "Work Phone"');
        }
      }
    });

    // TC-7e3c5d71-59d2-5ade-21b6-d5c828624359  SCOPE:new-feature
    test('Work Phone label is displayed in the Add Employee form (not Phone)', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();
      const drawer = page.locator('[data-testid="employee-drawer"]');
      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();
      const allLabels = drawer.locator('label');
      const count = await allLabels.count();
      for (let i = 0; i < count; i++) {
        const text = (await allLabels.nth(i).textContent()) ?? '';
        if (text.trim() === 'Phone') {
          throw new Error('Found standalone "Phone" label in add form — expected "Work Phone"');
        }
      }
    });

    // TC-1682f959-2cdc-57b7-eff7-cd6f8542e497  SCOPE:new-feature
    test('Cell Phone field is present in the edit form', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const id = await po.getFirstEmployeeId();
      await po.openEmployeeEditDrawer(id);
      await po.waitForDrawerOpen();
      const drawer = page.locator('[data-testid="employee-drawer"]');
      const cellPhoneLabel = drawer.locator('label', { hasText: 'Cell Phone' });
      await expect(cellPhoneLabel).toBeVisible();
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      await expect(cellPhoneInput).toBeVisible();
      await expect(cellPhoneInput).toBeEnabled();
    });

    // TC-6afbb133-6825-5fff-804b-257610790a84  SCOPE:new-feature
    test('Cell Phone field is present in the Add Employee form', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();
      const drawer = page.locator('[data-testid="employee-drawer"]');
      const cellPhoneLabel = drawer.locator('label', { hasText: 'Cell Phone' });
      await expect(cellPhoneLabel).toBeVisible();
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      await expect(cellPhoneInput).toBeVisible();
      await expect(cellPhoneInput).toBeEnabled();
    });

    // TC-0fff2b12-125a-599b-8b24-113f8a2aebf5  SCOPE:new-feature
    test('Cell Phone value is saved and displayed after creating a new employee', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      await po.fillFirstName('UITest');
      await page.locator('[data-testid="lastName-input"]').fill('SaveCheck');
      await po.fillEmail(uniqueEmail);
      await page.locator('[data-testid="designation-input"]').fill('Engineer');
      await page.locator('[data-testid="department-select"]').selectOption('Engineering');
      await page.locator('[data-testid="employmentType-select"]').selectOption('Full-Time');
      await page.locator('[data-testid="street-input"]').fill('123 Test St');
      await page.locator('[data-testid="city-input"]').fill('Test City');
      await page.locator('[data-testid="country-input"]').fill('United States');
      await page.locator('[data-testid="cellPhone-input"]').fill('555-000-1234');
      await po.submitEmployeeForm();
      await po.waitForSuccessToast();
      let createdId = '';
      try {
        await po.searchEmployees('UITest');
        const rows = page.locator('[data-testid^="employee-row-"]');
        const firstRowTestId = await rows.first().getAttribute('data-testid');
        createdId = firstRowTestId?.replace('employee-row-', '') ?? '';
        await po.clickEmployeeRow(createdId);
        await po.waitForDrawerOpen();
        const savedValue = await page.locator('[data-testid="cellPhone-input"]').inputValue();
        expect(savedValue).toBe('555-000-1234');
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });

    // TC-0d7e730a-37cd-593b-97c2-dc6d0bf8b9b3  SCOPE:new-feature
    test('Cell Phone value can be updated in the edit form', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      const id = await po.createEmployee({
        firstName: 'UITest', lastName: 'UpdateCell', email: uniqueEmail,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      try {
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
        await cellPhoneInput.clear();
        await cellPhoneInput.fill('555-999-8888');
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const updatedValue = await page.locator('[data-testid="cellPhone-input"]').inputValue();
        expect(updatedValue).toBe('555-999-8888');
      } finally {
        await po.deleteEmployee(id);
      }
    });

    // TC-6ae0f475-97a8-5be2-d336-083e56b00fdf  SCOPE:new-feature
    test('Both Work Phone and Cell Phone fields coexist in the form without layout issues', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const id = await po.getFirstEmployeeId();
      await po.openEmployeeEditDrawer(id);
      await po.waitForDrawerOpen();
      const drawer = page.locator('[data-testid="employee-drawer"]');
      await expect(drawer.locator('label', { hasText: 'Work Phone' })).toBeVisible();
      await expect(drawer.locator('label', { hasText: 'Cell Phone' })).toBeVisible();
      const phoneInput = page.locator('[data-testid="phone-input"]');
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      await expect(phoneInput).toBeVisible();
      await expect(cellPhoneInput).toBeVisible();
      const phoneBox = await phoneInput.boundingBox();
      const cellBox = await cellPhoneInput.boundingBox();
      expect(phoneBox).not.toBeNull();
      expect(cellBox).not.toBeNull();
      if (phoneBox && cellBox) {
        const phoneBottom = phoneBox.y + phoneBox.height;
        const cellBottom = cellBox.y + cellBox.height;
        const overlapsVertically = phoneBox.y < cellBottom && cellBox.y < phoneBottom;
        const overlapsHorizontally = phoneBox.x < cellBox.x + cellBox.width && cellBox.x < phoneBox.x + phoneBox.width;
        if (overlapsVertically && overlapsHorizontally) {
          throw new Error('Work Phone and Cell Phone inputs are overlapping');
        }
      }
      const allLabels = drawer.locator('label');
      const count = await allLabels.count();
      for (let i = 0; i < count; i++) {
        const text = (await allLabels.nth(i).textContent()) ?? '';
        if (text.trim() === 'Phone') {
          throw new Error('Found standalone "Phone" label — should not exist');
        }
      }
    });

    // TC-51fa5f4f-ece7-5c42-f5df-cae0d00e75a9  SCOPE:new-feature
    test('Work phone field retains its value independently from cell phone field', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      const id = await po.createEmployee({
        firstName: 'UITest', lastName: 'PhoneIndep', email: uniqueEmail,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      try {
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const phoneInput = page.locator('[data-testid="phone-input"]');
        await phoneInput.clear();
        await phoneInput.fill('555-030-0003');
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
        await cellPhoneInput.clear();
        await cellPhoneInput.fill('555-040-0004');
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const workPhoneValue = await page.locator('[data-testid="phone-input"]').inputValue();
        const cellPhoneValue = await page.locator('[data-testid="cellPhone-input"]').inputValue();
        expect(workPhoneValue).toBe('555-030-0003');
        expect(cellPhoneValue).toBe('555-040-0004');
      } finally {
        await po.deleteEmployee(id);
      }
    });

    // TC-97a4eebf-f53d-58c2-c681-25de67886d89  SCOPE:new-feature
    test('Work Phone field still accepts and saves a valid phone number after label change', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      const id = await po.createEmployee({
        firstName: 'UITest', lastName: 'WorkPhSave', email: uniqueEmail,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      try {
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const drawer = page.locator('[data-testid="employee-drawer"]');
        await expect(drawer.locator('label', { hasText: 'Work Phone' })).toBeVisible();
        const phoneInput = page.locator('[data-testid="phone-input"]');
        await phoneInput.clear();
        await phoneInput.fill('555-111-2222');
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const savedValue = await page.locator('[data-testid="phone-input"]').inputValue();
        expect(savedValue).toBe('555-111-2222');
      } finally {
        await po.deleteEmployee(id);
      }
    });
  });

  test.describe('negative', () => {
    // TC-20818466-31e8-50c4-4f55-2e9fb18933e4  SCOPE:new-feature
    test('Cell phone field rejects invalid format and shows validation message', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      await po.fillFirstName('UITest');
      await page.locator('[data-testid="lastName-input"]').fill('InvalidCell');
      await po.fillEmail(uniqueEmail);
      await page.locator('[data-testid="designation-input"]').fill('Engineer');
      await page.locator('[data-testid="department-select"]').selectOption('Engineering');
      await page.locator('[data-testid="employmentType-select"]').selectOption('Full-Time');
      await page.locator('[data-testid="street-input"]').fill('123 Test St');
      await page.locator('[data-testid="city-input"]').fill('Test City');
      await page.locator('[data-testid="country-input"]').fill('United States');
      await page.locator('[data-testid="cellPhone-input"]').fill('abcdefgh');
      await po.submitEmployeeForm();
      const cellPhoneError = page.locator('[data-testid="cellPhone-error"]');
      await expect(cellPhoneError).toBeVisible({ timeout: 5000 });
      const errorText = await cellPhoneError.textContent();
      expect(errorText).toBeTruthy();
    });

    // TC-30267f39-116b-5c9b-cddf-a16871d93d5c  SCOPE:new-feature
    test('Cell Phone field does not accept excessively long input without error', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      await po.fillFirstName('UITest');
      await page.locator('[data-testid="lastName-input"]').fill('LongCell');
      await po.fillEmail(uniqueEmail);
      await page.locator('[data-testid="designation-input"]').fill('Engineer');
      await page.locator('[data-testid="department-select"]').selectOption('Engineering');
      await page.locator('[data-testid="employmentType-select"]').selectOption('Full-Time');
      await page.locator('[data-testid="street-input"]').fill('123 Test St');
      await page.locator('[data-testid="city-input"]').fill('Test City');
      await page.locator('[data-testid="country-input"]').fill('United States');
      const longValue = '1'.repeat(300);
      await page.locator('[data-testid="cellPhone-input"]').fill(longValue);
      await po.submitEmployeeForm();
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      const actualValue = await cellPhoneInput.inputValue();
      const cellPhoneError = page.locator('[data-testid="cellPhone-error"]');
      const hasError = await cellPhoneError.isVisible().catch(() => false);
      const wasTruncated = actualValue.length < 300;
      expect(hasError || wasTruncated).toBeTruthy();
    });
  });

  test.describe('edge', () => {
    // TC-28c68736-a34f-5a74-1daa-bc8160f2cdf8  SCOPE:new-feature
    test('Cell phone field accepts empty value (optional field)', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      const id = await po.createEmployee({
        firstName: 'UITest', lastName: 'OptCell', email: uniqueEmail,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      try {
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
        await cellPhoneInput.clear();
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        const cellPhoneError = page.locator('[data-testid="cellPhone-error"]');
        const hasError = await cellPhoneError.isVisible().catch(() => false);
        expect(hasError).toBe(false);
      } finally {
        await po.deleteEmployee(id);
      }
    });

    // TC-d72f0c7d-7362-593f-1b36-16d0fb059339  SCOPE:new-feature
    test('Cell Phone field accepts empty value on edit (optional field) and persists', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      const id = await po.createEmployee({
        firstName: 'UITest', lastName: 'EmptyCell', email: uniqueEmail,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      try {
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
        await cellPhoneInput.clear();
        expect(await cellPhoneInput.inputValue()).toBe('');
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const savedValue = await page.locator('[data-testid="cellPhone-input"]').inputValue();
        expect(savedValue).toBe('');
      } finally {
        await po.deleteEmployee(id);
      }
    });

    // TC-4e4920c1-c301-53a3-75d3-4f79faa79231  SCOPE:new-feature
    test('Cell phone field accepts maximum length boundary value', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();
      const uniqueEmail = `test.${Date.now()}@test.com`;
      const id = await po.createEmployee({
        firstName: 'UITest', lastName: 'MaxLen', email: uniqueEmail,
        designation: 'Engineer', department: 'Engineering',
        employmentType: 'Full-Time', employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' }
      });
      try {
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
        await cellPhoneInput.clear();
        await cellPhoneInput.fill('+123456789012345');
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.searchEmployees('UITest');
        await po.clickEmployeeRow(id);
        await po.waitForDrawerOpen();
        const savedValue = await page.locator('[data-testid="cellPhone-input"]').inputValue();
        expect(savedValue).toBe('+123456789012345');
      } finally {
        await po.deleteEmployee(id);
      }
    });
  });
});
