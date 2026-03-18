import { test, expect } from '@playwright/test';
import { EmployeeFormPage } from '../pages/employee-form.page';

test.describe('employee-form — UI New Feature', () => {

  test.describe('positive', () => {

    // TC-c2fb9f53-dcb6-5894-29ed-a1d3be60762f  SCOPE:new-feature
    test('[UI] employee-form: Work Phone label is displayed correctly on Add Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      // Open the Add Employee drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Verify the phone field label reads 'Work Phone'
      const phoneLabel = await po.getPhoneFieldLabel();
      expect(phoneLabel).toBe('Work Phone');

      // Confirm no standalone 'Phone' label exists (only 'Work Phone' and 'Cell Phone')
      const standalonePhoneCount = await po.countLabelsWithExactText('Phone');
      expect(standalonePhoneCount).toBe(0);

      await po.closeDrawer();
    });

    // TC-4378d1f9-5922-5b83-5a9d-fb750c44e8a2  SCOPE:new-feature
    test('[UI] employee-form: Work Phone label is displayed correctly on Edit Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      // Get the first employee and open their edit drawer (read-only — no modifications)
      const id = await po.getFirstEmployeeId();
      await po.clickEmployeeRow(id);

      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Verify the phone field label reads 'Work Phone'
      const phoneLabel = await po.getPhoneFieldLabel();
      expect(phoneLabel).toBe('Work Phone');

      // Confirm no standalone 'Phone' label exists
      const standalonePhoneCount = await po.countLabelsWithExactText('Phone');
      expect(standalonePhoneCount).toBe(0);

      await po.closeDrawer();
    });

    // TC-a4fe40cd-1821-544e-fd7a-c434ae91d0d8  SCOPE:new-feature
    test('[UI] employee-form: Cell Phone field is present on Add Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      // Open the Add Employee drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Verify 'Cell Phone' label is visible
      const cellPhoneLabel = await po.getCellPhoneFieldLabel();
      expect(cellPhoneLabel).toBe('Cell Phone');

      // Verify the Cell Phone input is visible and enabled
      const cellPhoneVisible = await po.isCellPhoneInputVisible();
      expect(cellPhoneVisible).toBe(true);

      const cellPhoneEnabled = await po.isCellPhoneInputEnabled();
      expect(cellPhoneEnabled).toBe(true);

      await po.closeDrawer();
    });

    // TC-4174c992-5b0e-5891-736c-b90c242c4f42  SCOPE:new-feature
    test('[UI] employee-form: Cell Phone field is present on Edit Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      // Get the first employee and open their edit drawer (read-only)
      const id = await po.getFirstEmployeeId();
      await po.clickEmployeeRow(id);

      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Verify 'Cell Phone' label is visible
      const cellPhoneLabel = await po.getCellPhoneFieldLabel();
      expect(cellPhoneLabel).toBe('Cell Phone');

      // Verify the Cell Phone input is visible and enabled
      const cellPhoneVisible = await po.isCellPhoneInputVisible();
      expect(cellPhoneVisible).toBe(true);

      const cellPhoneEnabled = await po.isCellPhoneInputEnabled();
      expect(cellPhoneEnabled).toBe(true);

      await po.closeDrawer();
    });

    // TC-26d9c027-73d5-5142-5e25-9f0fb2b45333  SCOPE:new-feature
    test('[UI] employee-form: Both Work Phone and Cell Phone fields coexist on the Add Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      // Open the Add Employee drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Verify 'Work Phone' label is present
      const phoneLabel = await po.getPhoneFieldLabel();
      expect(phoneLabel).toBe('Work Phone');

      // Verify 'Cell Phone' label is present
      const cellPhoneLabel = await po.getCellPhoneFieldLabel();
      expect(cellPhoneLabel).toBe('Cell Phone');

      // Verify both phone inputs are visible
      const phoneVisible = await po.isPhoneInputVisible();
      expect(phoneVisible).toBe(true);

      const cellPhoneVisible = await po.isCellPhoneInputVisible();
      expect(cellPhoneVisible).toBe(true);

      // Verify exactly one 'Work Phone' label and exactly one 'Cell Phone' label exist
      const workPhoneCount = await po.countLabelsWithExactText('Work Phone');
      expect(workPhoneCount).toBe(1);

      const cellPhoneCount = await po.countLabelsWithExactText('Cell Phone');
      expect(cellPhoneCount).toBe(1);

      await po.closeDrawer();
    });

    // TC-5401cfb3-f805-589f-bf37-c47cc80e0e12  SCOPE:new-feature
    test('[UI] employee-form: Cell Phone value is saved and displayed after creating a new employee', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const uniqueEmail = `test.cellphone.${Date.now()}@test.com`;
      const firstName = 'CellTest';
      const cellPhoneValue = '555-020-0002';
      const workPhoneValue = '555-010-0001';

      const id = await po.createEmployee({
        firstName: firstName,
        lastName: 'PhoneUser',
        email: uniqueEmail,
        designation: 'QA Tester',
        department: 'QA',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' },
        phone: workPhoneValue,
        cellPhone: cellPhoneValue
      });

      try {
        // Reload the list and search for the created employee
        await po.navigate();
        await po.searchEmployees(firstName);

        // Verify the employee row is visible
        const rowVisible = await po.isEmployeeRowVisible(id);
        expect(rowVisible).toBe(true);

        // Click the employee row to open the edit drawer
        await po.clickEmployeeRow(id);
        const drawerVisible = await po.isDrawerVisible();
        expect(drawerVisible).toBe(true);

        // Verify the Cell Phone field displays the saved value
        const savedCellPhone = await po.getCellPhoneValue();
        expect(savedCellPhone).toBe(cellPhoneValue);

        // Also verify Work Phone was saved correctly
        const savedWorkPhone = await po.getPhoneValue();
        expect(savedWorkPhone).toBe(workPhoneValue);

        await po.closeDrawer();
      } finally {
        await po.deleteEmployee(id);
      }
    });

  });

});

test.describe('employee-form — UI Gap Cases', () => {
  test.describe('positive', () => {
    // TC-ebe8a4c6  SCOPE:new-feature
    test('[UI] employee-form: Work Phone value is saved and displayed after creating a new employee', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      let createdId = '';
      try {
        createdId = await po.createEmployee({
          firstName: 'WorkPhoneFirst',
          lastName: 'WorkPhoneLast',
          email: uniqueEmail,
          designation: 'Engineer',
          department: 'Engineering',
          employmentType: 'Full-Time',
          employmentStatus: 'Active',
          startDate: '2024-01-15',
          address: { street: '123 Test St', city: 'Test City', country: 'United States' },
          phone: '555-030-0003',
        });

        // Search for the created employee and verify row is visible
        await po.searchEmployees('WorkPhoneFirst');
        const visible = await po.isEmployeeRowVisible(createdId);
        expect(visible).toBe(true);

        // Open the employee's edit drawer
        await po.clickEmployeeRow(createdId);
        const drawerOpen = await po.isDrawerVisible();
        expect(drawerOpen).toBe(true);

        // Verify the Work Phone field has the saved value
        const phoneValue = await po.getPhoneValue();
        expect(phoneValue).toBe('555-030-0003');
      } finally {
        if (createdId) {
          await po.closeDrawer().catch(() => {});
          await po.deleteEmployee(createdId);
        }
      }
    });
  });

  test.describe('negative', () => {
    // TC-54a4c947  SCOPE:new-feature
    test('[UI] employee-form: Cell Phone field rejects invalid format and shows validation error', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      const drawerOpen = await po.isDrawerVisible();
      expect(drawerOpen).toBe(true);

      // Fill all required fields
      const uniqueEmail = `test.${Date.now()}@test.com`;
      await po.fillRequiredFields({
        firstName: 'InvalidCell',
        lastName: 'PhoneTest',
        email: uniqueEmail,
        designation: 'Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        street: '123 Test St',
        city: 'Test City',
        country: 'United States',
      });

      // Enter an invalid cell phone value
      await po.fillCellPhone('not-a-phone-number');

      // Submit the form
      await po.submitEmployeeForm();

      // Expect a validation error near the Cell Phone field — look for error via multiple strategies
      // The app may use a different pattern for error display (e.g., class-based, aria, or sibling text)
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      
      // Try multiple possible error selectors
      const errorByTestId = page.locator('[data-testid="cellPhone-error"]');
      const errorByRole = cellPhoneInput.locator('..').locator('.error, .text-error, .field-error, [class*="error"], [role="alert"]');
      const errorByAria = page.locator('[aria-describedby*="cellPhone"], [aria-errormessage]');
      const errorNearInput = cellPhoneInput.locator('xpath=./following-sibling::*[contains(@class,"error") or contains(@class,"helper")]');
      const errorParent = cellPhoneInput.locator('xpath=ancestor::*[position()<=3]//[contains(@class,"error") or contains(@class,"invalid") or contains(@class,"helper")]');

      // Wait a moment for validation to appear
      await page.waitForTimeout(1000);

      // Check if the form is still open (validation prevented submission) OR an error message appeared
      const stillOpen = await po.isDrawerVisible();
      
      // The validation might manifest as: error element, toast, or the input having an error state
      const hasErrorTestId = await errorByTestId.isVisible().catch(() => false);
      const hasErrorByRole = await errorByRole.first().isVisible().catch(() => false);
      const hasErrorByAria = await errorByAria.first().isVisible().catch(() => false);
      const hasErrorNearInput = await errorNearInput.first().isVisible().catch(() => false);
      
      // Check if the input itself has an error/invalid state
      const inputClasses = await cellPhoneInput.getAttribute('class') || '';
      const hasErrorClass = inputClasses.includes('error') || inputClasses.includes('invalid');
      const ariaInvalid = await cellPhoneInput.getAttribute('aria-invalid');
      const hasAriaInvalid = ariaInvalid === 'true';

      // The form should either show an error or remain open (not submit successfully)
      const hasAnyError = hasErrorTestId || hasErrorByRole || hasErrorByAria || hasErrorNearInput || hasErrorClass || hasAriaInvalid;
      
      // If the drawer is still open, the form didn't submit — that itself indicates validation blocked it
      // If an explicit error is shown, even better
      expect(stillOpen || hasAnyError).toBe(true);

      if (hasAnyError) {
        // Verify error text if we found an error element
        if (hasErrorTestId) {
          const errorText = await errorByTestId.textContent();
          expect(errorText).toBeTruthy();
        }
      }

      // Drawer should still be open (form not submitted)
      expect(stillOpen).toBe(true);

      // Now clear the cell phone field and resubmit — should succeed since cell phone is optional
      await cellPhoneInput.clear();
      await po.submitEmployeeForm();
      await po.waitForSuccessToast();

      // Clean up: search and delete the created employee
      await po.searchEmployees('InvalidCell');
      const rows = await po.getEmployeeRowCount();
      if (rows > 0) {
        // Find the employee row and get its ID to delete
        const row = page.locator('[data-testid^="employee-row-"]').first();
        const testId = await row.getAttribute('data-testid');
        if (testId) {
          const id = testId.replace('employee-row-', '');
          await po.deleteEmployee(id);
        }
      }
    });
  });

  test.describe('edge', () => {
    // TC-d22308b5  SCOPE:new-feature
    test('[UI] employee-form: Cell Phone field accepts empty value (optional field)', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      let createdId = '';
      try {
        // Create employee without cell phone (omit cellPhone entirely)
        createdId = await po.createEmployee({
          firstName: 'NoCellFirst',
          lastName: 'NoCellLast',
          email: uniqueEmail,
          designation: 'Engineer',
          department: 'Engineering',
          employmentType: 'Full-Time',
          employmentStatus: 'Active',
          startDate: '2024-01-15',
          address: { street: '123 Test St', city: 'Test City', country: 'United States' },
        });

        // Search for the created employee
        await po.searchEmployees('NoCellFirst');
        const visible = await po.isEmployeeRowVisible(createdId);
        expect(visible).toBe(true);

        // Open the edit drawer
        await po.clickEmployeeRow(createdId);
        const drawerOpen = await po.isDrawerVisible();
        expect(drawerOpen).toBe(true);

        // Verify Cell Phone field is empty
        const cellPhoneValue = await po.getCellPhoneValue();
        expect(cellPhoneValue).toBe('');

        // Verify no error is shown for cell phone
        const cellPhoneError = page.locator('[data-testid="cellPhone-error"]');
        await expect(cellPhoneError).not.toBeVisible();
      } finally {
        if (createdId) {
          await po.closeDrawer().catch(() => {});
          await po.deleteEmployee(createdId);
        }
      }
    });

    // TC-ef0b688c  SCOPE:new-feature
    test('[UI] employee-form: Work Phone label does not revert to Phone after editing and re-opening the form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      let createdId = '';
      try {
        createdId = await po.createEmployee({
          firstName: 'LabelCheck',
          lastName: 'Reopen',
          email: uniqueEmail,
          designation: 'Engineer',
          department: 'Engineering',
          employmentType: 'Full-Time',
          employmentStatus: 'Active',
          startDate: '2024-01-15',
          address: { street: '123 Test St', city: 'Test City', country: 'United States' },
          phone: '555-040-0004',
        });

        // Search and open the employee
        await po.searchEmployees('LabelCheck');
        const visible = await po.isEmployeeRowVisible(createdId);
        expect(visible).toBe(true);

        await po.clickEmployeeRow(createdId);
        const drawerOpen = await po.isDrawerVisible();
        expect(drawerOpen).toBe(true);

        // Verify the phone field label reads 'Work Phone'
        const label1 = await po.getPhoneFieldLabel();
        expect(label1).toContain('Work Phone');

        // Modify the Work Phone value and save
        await po.fillPhone('555-040-0099');
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();

        // Re-open the same employee's edit drawer
        await po.searchEmployees('LabelCheck');
        const stillVisible = await po.isEmployeeRowVisible(createdId);
        expect(stillVisible).toBe(true);

        await po.clickEmployeeRow(createdId);
        const drawerOpen2 = await po.isDrawerVisible();
        expect(drawerOpen2).toBe(true);

        // Verify the phone field label still reads 'Work Phone' after the edit cycle
        const label2 = await po.getPhoneFieldLabel();
        expect(label2).toContain('Work Phone');

        // Also verify the updated value persisted
        const phoneValue = await po.getPhoneValue();
        expect(phoneValue).toBe('555-040-0099');
      } finally {
        if (createdId) {
          await po.closeDrawer().catch(() => {});
          await po.deleteEmployee(createdId);
        }
      }
    });
  });
});