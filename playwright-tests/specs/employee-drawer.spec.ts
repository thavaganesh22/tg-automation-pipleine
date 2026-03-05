import { test, expect } from '@playwright/test';
import { EmployeeDrawerPage } from '../pages/employee-drawer.page';
import { setupEmployeeDrawerMocks } from '../fixtures/employee-drawer.fixture';

test.describe('employee-drawer — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-c526eaf6-d57d-4b78-9fdd-2424f0951d37  SCOPE:regression
    test('[UI] employee-drawer: Successfully add a new employee via drawer form', async ({ page }) => {
      await setupEmployeeDrawerMocks(page);
      const po = new EmployeeDrawerPage(page);

      // Step 1: Navigate to the employees page
      await po.navigateToEmployeesPage();
      const addBtnVisible = await po.isAddEmployeeButtonVisible();
      expect(addBtnVisible).toBe(true);

      // Step 2: Click the Add Employee button
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 3: Enter first name
      await po.fillFirstName('John');
      const firstNameValue = await po.getFirstNameValue();
      expect(firstNameValue).toBe('John');

      // Step 4: Enter last name
      await po.fillLastName('Doe');
      const lastNameValue = await po.getLastNameValue();
      expect(lastNameValue).toBe('Doe');

      // Step 5: Enter email
      await po.fillEmail('john.doe@test.com');
      const emailValue = await po.getEmailValue();
      expect(emailValue).toBe('john.doe@test.com');

      // Step 6: Enter phone number
      await po.fillPhone('555-000-1234');
      const phoneValue = await po.getPhoneValue();
      expect(phoneValue).toBe('555-000-1234');

      // Step 7: Select department
      await po.selectDepartment('Engineering');

      // Step 8: Enter designation / job title
      await po.fillDesignation('Software Engineer');
      const designationValue = await po.getDesignationValue();
      expect(designationValue).toBe('Software Engineer');

      // Step 9: Select employment type and status, fill start date and address, then submit
      await po.selectEmploymentType('Full-Time');
      await po.selectEmploymentStatus('Active');
      await po.fillStartDate('2024-01-15');
      await po.fillStreet('123 Main St');
      await po.fillCity('Springfield');
      await po.fillCountry('United States');
      await po.submitEmployeeForm();

      // Verify success toast appears
      await po.waitForSuccessToast();
      const toastVisible = await po.isSuccessToastVisible();
      expect(toastVisible).toBe(true);
      const toastText = await po.getSuccessToastText();
      expect(toastText).toContain('Employee added successfully');

      // Verify drawer closes
      await po.waitForDrawerToClose();
      const drawerStillVisible = await po.isDrawerVisible();
      expect(drawerStillVisible).toBe(false);

      // Step 10: Verify employee appears in the list
      const employeeInList = await po.isEmployeeInList('John Doe');
      expect(employeeInList).toBe(true);
    });

  });

  test.describe('negative', () => {

    // TC-76cbb4f9-9cbe-492e-b3ce-c586dcc81a89  SCOPE:regression
    test('[UI] employee-drawer: Submit form with missing required fields shows validation errors', async ({ page }) => {
      await setupEmployeeDrawerMocks(page);
      const po = new EmployeeDrawerPage(page);

      // Step 1: Navigate to employees page
      await po.navigateToEmployeesPage();
      const addBtnVisible = await po.isAddEmployeeButtonVisible();
      expect(addBtnVisible).toBe(true);

      // Step 2: Open the drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 3: Leave all fields empty and click submit
      await po.submitEmployeeForm();

      // Verify inline validation errors appear for required fields
      const firstNameError = await po.isFirstNameErrorVisible();
      expect(firstNameError).toBe(true);
      const firstNameErrorText = await po.getFirstNameErrorText();
      expect(firstNameErrorText).toContain('Required');

      const lastNameError = await po.isLastNameErrorVisible();
      expect(lastNameError).toBe(true);
      const lastNameErrorText = await po.getLastNameErrorText();
      expect(lastNameErrorText).toContain('Required');

      const emailError = await po.isEmailErrorVisible();
      expect(emailError).toBe(true);
      const emailErrorText = await po.getEmailErrorText();
      expect(emailErrorText).toContain('Required');

      // Step 4: Fill only first name and submit again
      await po.fillFirstName('John');
      await po.submitEmployeeForm();

      // First name error should disappear
      const firstNameErrorAfter = await po.isFirstNameErrorVisible();
      expect(firstNameErrorAfter).toBe(false);

      // Other required field errors should still be present
      const lastNameErrorStill = await po.isLastNameErrorVisible();
      expect(lastNameErrorStill).toBe(true);

      const emailErrorStill = await po.isEmailErrorVisible();
      expect(emailErrorStill).toBe(true);

      // Step 5: Enter invalid email and submit
      await po.fillEmail('not-an-email');
      await po.submitEmployeeForm();

      const emailErrorInvalid = await po.isEmailErrorVisible();
      expect(emailErrorInvalid).toBe(true);
      const emailErrorInvalidText = await po.getEmailErrorText();
      expect(emailErrorInvalidText).toContain('valid email');

      // Step 6: Verify drawer remains open and no success toast
      const drawerStillOpen = await po.isDrawerVisible();
      expect(drawerStillOpen).toBe(true);

      const successToastShown = await po.isSuccessToastVisible();
      expect(successToastShown).toBe(false);
    });

  });

  test.describe('edge', () => {

    // TC-f1daa5ea-1eac-4d85-8ed3-a613bab22ff6  SCOPE:regression
    test('[UI] employee-drawer: Close drawer without saving discards unsaved form data', async ({ page }) => {
      await setupEmployeeDrawerMocks(page);
      const po = new EmployeeDrawerPage(page);

      // Step 1: Navigate to employees page
      await po.navigateToEmployeesPage();
      const addBtnVisible = await po.isAddEmployeeButtonVisible();
      expect(addBtnVisible).toBe(true);

      // Step 2: Record current employee count
      const initialRowCount = await po.getEmployeeRowCount();

      // Step 3: Open the drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 4: Fill in partial data
      await po.fillFirstName('AbandonedFirst');
      const firstNameValue = await po.getFirstNameValue();
      expect(firstNameValue).toBe('AbandonedFirst');

      await po.fillLastName('AbandonedLast');
      const lastNameValue = await po.getLastNameValue();
      expect(lastNameValue).toBe('AbandonedLast');

      // Step 5: Close the drawer without submitting
      await po.closeDrawerWithCloseButton();
      await po.waitForDrawerToClose();
      const drawerClosed = await po.isDrawerVisible();
      expect(drawerClosed).toBe(false);

      // Verify no success toast appeared
      const successToastShown = await po.isSuccessToastVisible();
      expect(successToastShown).toBe(false);

      // Step 6: Verify employee list is unchanged
      const currentRowCount = await po.getEmployeeRowCount();
      expect(currentRowCount).toBe(initialRowCount);

      const abandonedEmployeeInList = await po.isEmployeeInList('AbandonedFirst AbandonedLast');
      expect(abandonedEmployeeInList).toBe(false);

      // Step 7: Reopen drawer and verify form is reset
      await po.openAddEmployeeDrawer();
      const drawerReopened = await po.isDrawerVisible();
      expect(drawerReopened).toBe(true);

      const resetFirstName = await po.getFirstNameValue();
      expect(resetFirstName).toBe('');

      const resetLastName = await po.getLastNameValue();
      expect(resetLastName).toBe('');
    });

  });

});

test.describe('employee-drawer — UI New Feature', () => {

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