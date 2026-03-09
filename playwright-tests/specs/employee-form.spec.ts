import { test, expect } from '@playwright/test';
import { EmployeeFormPage } from '../pages/employee-form.page';
import { setupEmployeeFormMocks } from '../fixtures/employee-form.fixture';

test.describe('employee-form — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-f85be5b4-4150-4766-ba23-68f88e94b398  SCOPE:regression
    test('[UI] employee-form: Filling all required fields clears validation errors and allows successful submission', async ({ page }) => {
      await setupEmployeeFormMocks(page);
      const po = new EmployeeFormPage(page);

      // Step 1: Navigate to the employee form
      await po.navigateToEmployeeList();
      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Step 2: Click submit without entering any data — validation errors appear
      await po.submitEmployeeForm();
      const errorCountAfterEmptySubmit = await po.getVisibleValidationErrorCount();
      expect(errorCountAfterEmptySubmit).toBeGreaterThan(0);

      // Step 3: Enter a valid first name — its error disappears
      await po.fillFirstName('Jane');
      expect(await po.isFirstNameErrorVisible()).toBe(false);

      // Step 4: Enter a valid last name — its error disappears
      await po.fillLastName('Doe');
      expect(await po.isLastNameErrorVisible()).toBe(false);

      // Step 5: Enter a valid email — its error disappears
      await po.fillEmail('jane.doe@test.com');
      expect(await po.isEmailErrorVisible()).toBe(false);

      // Step 6: Fill in all remaining required fields
      await po.fillDesignation('Developer');
      expect(await po.isDesignationErrorVisible()).toBe(false);

      await po.selectDepartment('Engineering');
      expect(await po.isDepartmentErrorVisible()).toBe(false);

      await po.selectEmploymentType('Full-Time');
      expect(await po.isEmploymentTypeErrorVisible()).toBe(false);

      await po.selectEmploymentStatus('Active');
      expect(await po.isEmploymentStatusErrorVisible()).toBe(false);

      await po.fillStartDate('2024-01-15');
      expect(await po.isStartDateErrorVisible()).toBe(false);

      await po.fillStreet('123 Main St');
      expect(await po.isAddressStreetErrorVisible()).toBe(false);

      await po.fillCity('Springfield');
      expect(await po.isAddressCityErrorVisible()).toBe(false);

      await po.fillCountry('United States');
      expect(await po.isAddressCountryErrorVisible()).toBe(false);

      // Verify zero validation errors remain
      expect(await po.hasNoVisibleValidationErrors()).toBe(true);

      // Step 7: Click submit — form submits successfully
      await po.submitEmployeeForm();
      await po.waitForSuccessToast();
      expect(await po.isSuccessToastVisible()).toBe(true);
    });

  });

  test.describe('negative', () => {

    // TC-8ad4f0b9-b45d-41a7-a834-07894bd1b7fc  SCOPE:regression
    test('[UI] employee-form: Submitting empty form displays all required field validation errors', async ({ page }) => {
      await setupEmployeeFormMocks(page);
      const po = new EmployeeFormPage(page);

      // Step 1: Navigate to the employee form and verify it is displayed with no errors
      await po.navigateToEmployeeList();
      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);
      expect(await po.hasNoVisibleValidationErrors()).toBe(true);

      // Step 2: Click submit without entering any data
      await po.submitEmployeeForm();

      // Step 3: First Name validation error is visible
      expect(await po.isFirstNameErrorVisible()).toBe(true);
      const firstNameError = await po.getFirstNameErrorText();
      expect(firstNameError).toContain('Required');

      // Step 4: Last Name validation error is visible
      expect(await po.isLastNameErrorVisible()).toBe(true);
      const lastNameError = await po.getLastNameErrorText();
      expect(lastNameError).toContain('Required');

      // Step 5: Email validation error is visible
      expect(await po.isEmailErrorVisible()).toBe(true);
      const emailError = await po.getEmailErrorText();
      expect(emailError).toContain('Required');

      // Step 6: All other required fields show validation errors
      expect(await po.isDesignationErrorVisible()).toBe(true);
      const designationError = await po.getDesignationErrorText();
      expect(designationError).toContain('Required');

      expect(await po.isDepartmentErrorVisible()).toBe(true);
      const departmentError = await po.getDepartmentErrorText();
      expect(departmentError).toContain('Required');

      expect(await po.isEmploymentTypeErrorVisible()).toBe(true);
      const employmentTypeError = await po.getEmploymentTypeErrorText();
      expect(employmentTypeError).toContain('Required');

      // Note: employmentStatus defaults to 'Active' and startDate defaults to today,
      // so those fields do not trigger validation errors in create mode.

      expect(await po.isAddressStreetErrorVisible()).toBe(true);
      const streetError = await po.getAddressStreetErrorText();
      expect(streetError).toContain('Required');

      expect(await po.isAddressCityErrorVisible()).toBe(true);
      const cityError = await po.getAddressCityErrorText();
      expect(cityError).toContain('Required');

      expect(await po.isAddressCountryErrorVisible()).toBe(true);
      const countryError = await po.getAddressCountryErrorText();
      expect(countryError).toContain('Required');

      // Step 7: Total visible error count — 9 required fields shown (employmentStatus and startDate have defaults)
      const totalErrors = await po.getVisibleValidationErrorCount();
      expect(totalErrors).toBeGreaterThanOrEqual(9);

      // Verify the drawer is still open (form was NOT submitted)
      expect(await po.isDrawerVisible()).toBe(true);
    });

  });

  test.describe('edge', () => {
    // No edge regression cases defined
  });

});

test.describe('employee-form — UI New Feature', () => {

  test.describe('positive', () => {
    // No new feature positive cases defined
  });

  test.describe('negative', () => {
    // No new feature negative cases defined
  });

  test.describe('edge', () => {
    // No new feature edge cases defined
  });

});