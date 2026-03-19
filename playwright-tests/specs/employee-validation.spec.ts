import { test, expect } from '@playwright/test';
import { EmployeeValidationPage } from '../pages/employee-validation.page';

test.describe('employee-validation — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-752dfe8f-59a8-5ef8-3ec3-9c78de39d4a2  SCOPE:regression
    test('Filling all required fields clears validation errors and enables successful submission', async ({ page }) => {
      const po = new EmployeeValidationPage(page);
      await po.navigate();

      // Step 1: Verify employee list page loads
      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThan(0);

      // Step 2: Open add employee drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 3: Submit empty form to trigger validation errors
      await po.submitEmployeeForm();

      // Verify all required field errors are shown
      expect(await po.isFirstNameErrorVisible()).toBe(true);
      expect(await po.isLastNameErrorVisible()).toBe(true);
      expect(await po.isEmailErrorVisible()).toBe(true);
      expect(await po.isDesignationErrorVisible()).toBe(true);
      expect(await po.isDepartmentErrorVisible()).toBe(true);
      expect(await po.isEmploymentTypeErrorVisible()).toBe(true);
      expect(await po.isStreetErrorVisible()).toBe(true);
      expect(await po.isCityErrorVisible()).toBe(true);
      expect(await po.isCountryErrorVisible()).toBe(true);

      // Step 4: Fill first name — error should clear
      await po.fillFirstName('UITest');

      // Step 5: Fill last name
      await po.fillLastName('Validation');

      // Step 6: Fill unique email
      const uniqueEmail = `uitest.validation.${Date.now()}@test.com`;
      await po.fillEmail(uniqueEmail);

      // Step 7: Fill all remaining required fields
      await po.fillDesignation('QA Engineer');
      await po.selectDepartment('Engineering');
      await po.selectEmploymentType('Full-Time');
      await po.fillStreet('456 Validation Ave');
      await po.fillCity('Test City');
      await po.fillCountry('United States');

      // Verify all validation errors are cleared
      const noErrors = await po.hasNoValidationErrors();
      expect(noErrors).toBe(true);

      // Step 8: Submit the form
      await po.submitEmployeeForm();
      await po.waitForSuccessToast();

      // Step 9: Search for the newly created employee
      await po.navigate();
      await po.searchEmployees('UITest');

      // Get the ID of the created employee from the filtered list
      const createdId = await po.getFirstVisibleEmployeeId();
      const rowVisible = await po.isEmployeeRowVisible(createdId);
      expect(rowVisible).toBe(true);

      // Step 10: Clean up — delete the test employee
      await po.deleteEmployee(createdId);
    });

  });

  test.describe('negative', () => {

    // TC-867dc601-9a25-57e4-9077-ef3b3ec96bd4  SCOPE:regression
    test('Empty form submission shows all required field validation errors', async ({ page }) => {
      const po = new EmployeeValidationPage(page);
      await po.navigate();

      // Step 1: Verify employee list page loads with at least one row
      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThan(0);

      // Step 2: Click Add Employee button to open the drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 3: Submit the empty form without filling any fields
      await po.submitEmployeeForm();

      // Drawer should remain open (form not submitted)
      const drawerStillVisible = await po.isDrawerVisible();
      expect(drawerStillVisible).toBe(true);

      // Step 4: Verify First Name validation error
      expect(await po.isFirstNameErrorVisible()).toBe(true);
      const firstNameError = await po.getFirstNameErrorText();
      expect(firstNameError).toBe('Required');

      // Step 5: Verify Last Name validation error
      expect(await po.isLastNameErrorVisible()).toBe(true);
      const lastNameError = await po.getLastNameErrorText();
      expect(lastNameError).toBe('Required');

      // Step 6: Verify Email validation error
      expect(await po.isEmailErrorVisible()).toBe(true);
      const emailError = await po.getEmailErrorText();
      expect(emailError).toBe('Required');

      // Step 7: Verify all other required field validation errors
      expect(await po.isDesignationErrorVisible()).toBe(true);
      const designationError = await po.getDesignationErrorText();
      expect(designationError).toBe('Required');

      expect(await po.isDepartmentErrorVisible()).toBe(true);
      const departmentError = await po.getDepartmentErrorText();
      expect(departmentError).toBe('Required');

      expect(await po.isEmploymentTypeErrorVisible()).toBe(true);
      const employmentTypeError = await po.getEmploymentTypeErrorText();
      expect(employmentTypeError).toBe('Required');

      expect(await po.isStreetErrorVisible()).toBe(true);
      const streetError = await po.getStreetErrorText();
      expect(streetError).toBe('Required');

      expect(await po.isCityErrorVisible()).toBe(true);
      const cityError = await po.getCityErrorText();
      expect(cityError).toBe('Required');

      expect(await po.isCountryErrorVisible()).toBe(true);
      const countryError = await po.getCountryErrorText();
      expect(countryError).toBe('Required');

      // Step 8: Verify no new employee was added — navigate back and check count
      await po.navigate();
      const finalRowCount = await po.getEmployeeRowCount();
      expect(finalRowCount).toBe(initialRowCount);
    });

  });

  test.describe('edge', () => {

    // TC-edge-001  SCOPE:regression
    test('Partially filling required fields still shows errors for remaining empty fields', async ({ page }) => {
      const po = new EmployeeValidationPage(page);
      await po.navigate();

      // Open add employee drawer
      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Fill only first name and last name, leave everything else empty
      await po.fillFirstName('Partial');
      await po.fillLastName('Test');

      // Submit the form
      await po.submitEmployeeForm();

      // Drawer should remain open
      expect(await po.isDrawerVisible()).toBe(true);

      // First name and last name errors should NOT be visible (they were filled)
      expect(await po.isFirstNameErrorVisible()).toBe(false);
      expect(await po.isLastNameErrorVisible()).toBe(false);

      // All other required fields should still show errors
      expect(await po.isEmailErrorVisible()).toBe(true);
      expect(await po.isDesignationErrorVisible()).toBe(true);
      expect(await po.isDepartmentErrorVisible()).toBe(true);
      expect(await po.isEmploymentTypeErrorVisible()).toBe(true);
      expect(await po.isStreetErrorVisible()).toBe(true);
      expect(await po.isCityErrorVisible()).toBe(true);
      expect(await po.isCountryErrorVisible()).toBe(true);
    });

  });

});