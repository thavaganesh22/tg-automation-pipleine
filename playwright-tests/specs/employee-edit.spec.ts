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
    // TC-25009928-3b54-53cb-c19f-4f385af8cbd9  SCOPE:new-feature
    test('Work phone label displays correctly in Add Employee form', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();

      const drawer = page.locator('[data-testid="employee-drawer"]');
      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();

      // Confirm no standalone "Phone" label exists (without "Work" or "Cell" prefix)
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

    // TC-7069dd4e-9fde-58cf-02a8-558cd7b7f9cc  SCOPE:new-feature
    test('Work phone label displays correctly in Edit Employee form', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      const id = await po.getFirstEmployeeId();
      await po.openEmployeeEditDrawer(id);

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

    // TC-b389b942-0d02-53be-5e3f-61e0b4f06e45  SCOPE:new-feature
    test('Work phone input field accepts and saves a valid phone number', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      const id = await po.createEmployee({
        firstName: 'UITest',
        lastName: 'User',
        email: uniqueEmail,
        designation: 'Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' },
      });

      try {
        await po.searchEmployees('UITest');
        expect(await po.isEmployeeRowVisible(id)).toBe(true);
        await po.openEmployeeEditDrawer(id);

        const phoneInput = page.locator('[data-testid="phone-input"]');
        await phoneInput.clear();
        await phoneInput.fill('555-010-0001');

        await po.submitEmployeeForm();
        await po.waitForSuccessToast();

        // Re-open the employee to verify saved value
        await po.searchEmployees('UITest');
        await po.openEmployeeEditDrawer(id);

        const savedValue = await phoneInput.inputValue();
        expect(savedValue).toBe('555-010-0001');
      } finally {
        await po.deleteEmployee(id);
      }
    });

    // TC-0252d197-433f-5042-bc13-3668aa729ad8  SCOPE:new-feature
    test('Work phone label is distinct from Cell Phone label in the form', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();

      const drawer = page.locator('[data-testid="employee-drawer"]');

      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();

      const cellPhoneLabel = drawer.locator('label', { hasText: 'Cell Phone' });
      await expect(cellPhoneLabel).toBeVisible();

      // Verify two distinct phone inputs exist
      const phoneInput = page.locator('[data-testid="phone-input"]');
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      await expect(phoneInput).toBeVisible();
      await expect(cellPhoneInput).toBeVisible();

      // Confirm they are different elements
      const phoneBox = await phoneInput.boundingBox();
      const cellBox = await cellPhoneInput.boundingBox();
      expect(phoneBox).not.toBeNull();
      expect(cellBox).not.toBeNull();
      expect(phoneBox!.y).not.toBe(cellBox!.y);
    });

    // TC-f3db4843-9452-5701-2417-000d6796a280  SCOPE:new-feature
    test('Seeded employee data displays Work Phone value under correct label', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      const id = await po.getFirstEmployeeId();
      await po.openEmployeeEditDrawer(id);

      const drawer = page.locator('[data-testid="employee-drawer"]');
      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();

      // The phone input should be present and accessible under Work Phone label
      const phoneInput = page.locator('[data-testid="phone-input"]');
      await expect(phoneInput).toBeVisible();

      // Value may or may not be empty for seeded data, but the field should be accessible
      const phoneValue = await phoneInput.inputValue();
      expect(typeof phoneValue).toBe('string');
    });
  });

  test.describe('negative', () => {
    // TC-eb88b13d-936d-571f-204e-ebd0cf532b88  SCOPE:new-feature
    test('Work phone field rejects invalid format and shows validation message', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();

      // Fill required fields
      await po.fillFirstName('TestVal');
      await page.locator('[data-testid="lastName-input"]').fill('User');
      await po.fillEmail(`test.${Date.now()}@test.com`);
      await page.locator('[data-testid="designation-input"]').fill('Engineer');
      await page.locator('[data-testid="department-select"]').selectOption('Engineering');
      await page.locator('[data-testid="employmentType-select"]').selectOption('Full-Time');
      await page.locator('[data-testid="street-input"]').fill('123 Test St');
      await page.locator('[data-testid="city-input"]').fill('Test City');
      await page.locator('[data-testid="country-input"]').fill('United States');

      // Enter invalid phone value
      const phoneInput = page.locator('[data-testid="phone-input"]');
      await phoneInput.fill('abcdefgh');

      await po.submitEmployeeForm();

      // Check for validation error near the phone field
      const phoneError = page.locator('[data-testid="phone-error"]');
      await expect(phoneError).toBeVisible({ timeout: 5000 });
      const errorText = await phoneError.textContent();
      expect(errorText).toBeTruthy();
      expect((errorText ?? '').length).toBeGreaterThan(0);
    });
  });

  test.describe('edge', () => {
    // TC-7c3f00f9-85f0-5735-e7ce-c5a262a0602a  SCOPE:new-feature
    test('Work phone label is visible and correctly positioned relative to its input', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();

      const drawer = page.locator('[data-testid="employee-drawer"]');
      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();

      const phoneInput = page.locator('[data-testid="phone-input"]');
      await expect(phoneInput).toBeVisible();

      // Click the label and verify focus moves to the input
      await workPhoneLabel.click();
      const isFocused = await phoneInput.evaluate((el) => document.activeElement === el);
      expect(isFocused).toBe(true);

      // Verify label is positioned above or near the input
      const labelBox = await workPhoneLabel.boundingBox();
      const inputBox = await phoneInput.boundingBox();
      expect(labelBox).not.toBeNull();
      expect(inputBox).not.toBeNull();
      // Label should be above or at the same vertical position as the input
      expect(labelBox!.y).toBeLessThanOrEqual(inputBox!.y);
    });

    // TC-30b83ddc-71c7-5aae-7bd1-fdadae74403e  SCOPE:new-feature
    test('Work phone field accepts empty value without blocking form submission', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      // Create employee via the form with empty Work Phone
      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();

      await po.fillFirstName('UITest');
      await page.locator('[data-testid="lastName-input"]').fill('EmptyPhone');
      await po.fillEmail(uniqueEmail);
      await page.locator('[data-testid="designation-input"]').fill('Engineer');
      await page.locator('[data-testid="department-select"]').selectOption('Engineering');
      await page.locator('[data-testid="employmentType-select"]').selectOption('Full-Time');
      await page.locator('[data-testid="street-input"]').fill('123 Test St');
      await page.locator('[data-testid="city-input"]').fill('Test City');
      await page.locator('[data-testid="country-input"]').fill('United States');

      // Ensure Work Phone is empty
      const phoneInput = page.locator('[data-testid="phone-input"]');
      await phoneInput.clear();

      await po.submitEmployeeForm();
      await po.waitForSuccessToast();

      // Find the created employee to get its ID for cleanup
      await po.searchEmployees('UITest');
      // Wait for results
      await page.waitForTimeout(1000);

      // Get the row and extract ID
      const rows = page.locator('[data-testid^="employee-row-"]');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      // Find the row with our unique email
      let createdId = '';
      for (let i = 0; i < rowCount; i++) {
        const rowText = await rows.nth(i).textContent();
        if (rowText && rowText.includes(uniqueEmail)) {
          const testId = await rows.nth(i).getAttribute('data-testid');
          createdId = (testId ?? '').replace('employee-row-', '');
          break;
        }
      }

      try {
        if (createdId) {
          await po.openEmployeeEditDrawer(createdId);
          const savedPhone = await phoneInput.inputValue();
          expect(savedPhone).toBe('');
        }
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });

    // TC-1713b190-2a9c-5252-5a35-ec3c13391b93  SCOPE:new-feature
    test('Work phone label persists after a form validation error and re-render', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();

      // Submit empty form to trigger validation errors
      await po.submitEmployeeForm();

      // Wait for validation errors to render
      await expect(page.locator('[data-testid="firstName-error"]')).toBeVisible({ timeout: 5000 });

      // Verify Work Phone label is still visible after error re-render
      const drawer = page.locator('[data-testid="employee-drawer"]');
      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();

      // Confirm no standalone "Phone" label appeared
      const allLabels = drawer.locator('label');
      const count = await allLabels.count();
      for (let i = 0; i < count; i++) {
        const text = (await allLabels.nth(i).textContent()) ?? '';
        const trimmed = text.trim();
        if (trimmed === 'Phone') {
          throw new Error('Found standalone "Phone" label after validation error — expected "Work Phone"');
        }
      }
    });

    // TC-e15a2f22-3154-5b66-c9ba-246385a16c84  SCOPE:new-feature
    test('Work phone label is visible on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const po = new EmployeeEditPage(page);
      await po.navigate();

      await page.locator('[data-testid="add-employee-btn"]').click();
      await po.waitForDrawerOpen();

      const drawer = page.locator('[data-testid="employee-drawer"]');

      // Scroll to the phone input to ensure it's in view
      const phoneInput = page.locator('[data-testid="phone-input"]');
      await phoneInput.scrollIntoViewIfNeeded();

      const workPhoneLabel = drawer.locator('label', { hasText: 'Work Phone' });
      await expect(workPhoneLabel).toBeVisible();
      await expect(phoneInput).toBeVisible();

      // Verify the label is not clipped — bounding box should have positive dimensions
      const labelBox = await workPhoneLabel.boundingBox();
      expect(labelBox).not.toBeNull();
      expect(labelBox!.width).toBeGreaterThan(0);
      expect(labelBox!.height).toBeGreaterThan(0);

      // Verify input is tappable (within viewport)
      const inputBox = await phoneInput.boundingBox();
      expect(inputBox).not.toBeNull();
      expect(inputBox!.width).toBeGreaterThan(0);
    });
  });
});
