import { test, expect } from '@playwright/test';
import { EmployeeCreatePage } from '../pages/employee-create.page';

test.describe('employee-create — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-f1b75045-4c97-583e-3b53-08f1ad465f2a  SCOPE:regression
    test('Add employee drawer opens and successfully saves a new employee', async ({ page }) => {
      const po = new EmployeeCreatePage(page);
      await po.navigate();

      // Step 1: Verify the page loaded with employee list and Add button
      const addBtnVisible = await po.isAddEmployeeBtnVisible();
      expect(addBtnVisible).toBe(true);
      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThan(0);

      // Step 2: Open the Add Employee drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 3: Verify form fields are empty/default (text inputs should be empty)
      const firstNameVal = await po.getFirstNameValue();
      expect(firstNameVal).toBe('');
      const lastNameVal = await po.getLastNameValue();
      expect(lastNameVal).toBe('');
      const emailVal = await po.getEmailValue();
      expect(emailVal).toBe('');

      // No validation errors should be visible yet
      expect(await po.isFirstNameErrorVisible()).toBe(false);
      expect(await po.isLastNameErrorVisible()).toBe(false);
      expect(await po.isEmailErrorVisible()).toBe(false);

      // Step 4: Fill First Name
      await po.fillFirstName('UITestCreate');
      expect(await po.getFirstNameValue()).toBe('UITestCreate');

      // Step 5: Fill Last Name
      await po.fillLastName('Employee');
      expect(await po.getLastNameValue()).toBe('Employee');

      // Step 6: Fill Email with unique timestamp
      const uniqueEmail = `uitestcreate.${Date.now()}@test.com`;
      await po.fillEmail(uniqueEmail);
      expect(await po.getEmailValue()).toBe(uniqueEmail);

      // Step 7: Select Department
      await po.selectDepartment('Engineering');
      expect(await po.getDepartmentValue()).toBe('Engineering');

      // Step 8: Fill Designation (Role)
      await po.fillDesignation('Engineer');

      // Fill remaining required fields
      await po.selectEmploymentType('Full-Time');
      expect(await po.getEmploymentTypeValue()).toBe('Full-Time');

      await po.selectEmploymentStatus('Active');
      expect(await po.getEmploymentStatusValue()).toBe('Active');

      await po.fillStartDate('2024-01-15');
      await po.fillStreet('123 Test St');
      await po.fillCity('Test City');
      await po.fillCountry('United States');

      // Step 9: Submit the form
      await po.submitEmployeeForm();

      // Step 10: Wait for success toast and drawer to close
      await po.waitForSuccessToast();
      const drawerHidden = await po.isDrawerHidden();
      expect(drawerHidden).toBe(true);

      // Now find the created employee to get its ID for cleanup
      // Step 11: Search for the newly created employee
      await po.navigate();
      await po.searchEmployees('UITestCreate');

      // Find the employee row count after search
      const searchRowCount = await po.getEmployeeRowCount();
      expect(searchRowCount).toBeGreaterThanOrEqual(1);

      // Get the ID of the first visible row after filtering by search term
      const createdId = await po.getFirstVisibleEmployeeId();

      try {
        const rowVisible = await po.isEmployeeRowVisible(createdId);
        expect(rowVisible).toBe(true);

        // Verify the name and email in the row
        const rowName = await po.getEmployeeNameFromRow(createdId);
        expect(rowName).toContain('UITestCreate');
        expect(rowName).toContain('Employee');

        const rowEmail = await po.getEmployeeEmailFromRow(createdId);
        expect(rowEmail).toBe(uniqueEmail);
      } finally {
        // Step 12: Clean up — delete the test employee
        await po.deleteEmployee(createdId);
      }
    });
  });

  test.describe('negative', () => {

    // TC-eb39b4a1-46b0-519e-3f92-1daacaf1068a  SCOPE:regression
    test('Add employee form shows validation errors when submitted with missing required fields', async ({ page }) => {
      const po = new EmployeeCreatePage(page);
      await po.navigate();

      // Step 1: Verify page loaded
      const addBtnVisible = await po.isAddEmployeeBtnVisible();
      expect(addBtnVisible).toBe(true);

      // Step 2: Open the Add Employee drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 3: Leave all fields blank — verify no validation errors yet
      expect(await po.isFirstNameErrorVisible()).toBe(false);
      expect(await po.isLastNameErrorVisible()).toBe(false);
      expect(await po.isEmailErrorVisible()).toBe(false);

      // Step 4: Click Submit without filling any fields
      await po.submitEmployeeForm();

      // Step 5: Verify validation errors appear on all required fields
      // (employmentStatus and startDate have defaults, so no errors for those)
      expect(await po.isFirstNameErrorVisible()).toBe(true);
      expect(await po.isLastNameErrorVisible()).toBe(true);
      expect(await po.isEmailErrorVisible()).toBe(true);
      expect(await po.isDesignationErrorVisible()).toBe(true);
      expect(await po.isDepartmentErrorVisible()).toBe(true);
      expect(await po.isEmploymentTypeErrorVisible()).toBe(true);
      expect(await po.isStreetErrorVisible()).toBe(true);
      expect(await po.isCityErrorVisible()).toBe(true);
      expect(await po.isCountryErrorVisible()).toBe(true);

      // Verify error text says "Required"
      expect(await po.getFirstNameErrorText()).toBe('Required');
      expect(await po.getLastNameErrorText()).toBe('Required');
      expect(await po.getEmailErrorText()).toBe('Required');
      expect(await po.getDesignationErrorText()).toBe('Required');

      // Drawer should still be open
      expect(await po.isDrawerVisible()).toBe(true);

      // Step 6: Fill only First Name and submit again
      await po.fillFirstName('Partial');
      await po.submitEmployeeForm();

      // First Name error should clear
      expect(await po.isFirstNameErrorVisible()).toBe(false);

      // Other required field errors should still be visible
      expect(await po.isLastNameErrorVisible()).toBe(true);
      expect(await po.isEmailErrorVisible()).toBe(true);
      expect(await po.isDesignationErrorVisible()).toBe(true);
      expect(await po.isDepartmentErrorVisible()).toBe(true);
      expect(await po.isEmploymentTypeErrorVisible()).toBe(true);
      expect(await po.isStreetErrorVisible()).toBe(true);
      expect(await po.isCityErrorVisible()).toBe(true);
      expect(await po.isCountryErrorVisible()).toBe(true);

      // Drawer still open
      expect(await po.isDrawerVisible()).toBe(true);

      // Step 7: Fill Email with invalid format and submit
      await po.fillEmail('notanemail');
      await po.submitEmployeeForm();

      // Email error should show format validation
      expect(await po.isEmailErrorVisible()).toBe(true);
      const emailErrorText = await po.getEmailErrorText();
      expect(emailErrorText.length).toBeGreaterThan(0);

      // Drawer still open
      expect(await po.isDrawerVisible()).toBe(true);

      // Step 8: Close the drawer via cancel
      await po.cancelDrawer();
      const drawerHidden = await po.isDrawerHidden();
      expect(drawerHidden).toBe(true);

      // Step 9: Search for 'Partial' — no employee should have been created
      await po.searchEmployees('Partial');
      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBe(0);
    });
  });

  test.describe('edge', () => {

    // TC-edge-001  SCOPE:regression
    test('Drawer can be closed via X button without creating an employee', async ({ page }) => {
      const po = new EmployeeCreatePage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Close via the close button (X)
      await po.closeDrawer();
      expect(await po.isDrawerHidden()).toBe(true);

      // Employee list should still be intact
      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThan(0);
    });

    // TC-edge-002  SCOPE:regression
    test('Form defaults are correctly set when add drawer opens', async ({ page }) => {
      const po = new EmployeeCreatePage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // employmentStatus defaults to 'Active'
      expect(await po.getEmploymentStatusValue()).toBe('Active');

      // startDate defaults to today's date (2026-03-14 format)
      const startDate = await po.getStartDateValue();
      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(startDate.length).toBe(10);

      // Text inputs should be empty
      expect(await po.getFirstNameValue()).toBe('');
      expect(await po.getLastNameValue()).toBe('');
      expect(await po.getEmailValue()).toBe('');

      await po.cancelDrawer();
    });
  });
});