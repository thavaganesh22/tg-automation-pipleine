import { test, expect } from '@playwright/test';
import { EmployeeCreatePage } from '../pages/employee-create.page';

test.describe('employee-create — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-f1b75045-4c97-583e-3b53-08f1ad465f2a  SCOPE:regression
    test('Add employee drawer opens and successfully saves a new employee', async ({ page }) => {
      test.setTimeout(60000);
      const po = new EmployeeCreatePage(page);
      await po.navigate();

      // Step 1: Verify page loaded with employee list and Add button
      const addBtnVisible = await po.isAddEmployeeButtonVisible();
      expect(addBtnVisible).toBe(true);
      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThan(0);

      // Step 2: Click Add Employee button to open drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 3: Verify text fields are empty (selects have defaults per app behavior)
      const firstNameVal = await po.getFirstNameValue();
      expect(firstNameVal).toBe('');
      const lastNameVal = await po.getLastNameValue();
      expect(lastNameVal).toBe('');
      const emailVal = await po.getEmailValue();
      expect(emailVal).toBe('');

      // No validation errors shown yet
      const fnErr = await po.isFirstNameErrorVisible();
      expect(fnErr).toBe(false);
      const lnErr = await po.isLastNameErrorVisible();
      expect(lnErr).toBe(false);
      const emErr = await po.isEmailErrorVisible();
      expect(emErr).toBe(false);

      // Step 4: Fill First Name
      await po.fillFirstName('UITest');
      const fnAfter = await po.getFirstNameValue();
      expect(fnAfter).toBe('UITest');

      // Step 5: Fill Last Name
      await po.fillLastName('CreateSpec');
      const lnAfter = await po.getLastNameValue();
      expect(lnAfter).toBe('CreateSpec');

      // Step 6: Fill Email with unique timestamp
      const uniqueEmail = `uitest.create.${Date.now()}@example.com`;
      await po.fillEmail(uniqueEmail);
      const emAfter = await po.getEmailValue();
      expect(emAfter).toBe(uniqueEmail);

      // Step 7: Select Department
      await po.selectDepartment('Engineering');
      const deptAfter = await po.getDepartmentValue();
      expect(deptAfter).toBe('Engineering');

      // Step 8: Fill Designation (Role)
      await po.fillDesignation('Engineer');

      // Also fill remaining required fields
      await po.selectEmploymentType('Full-Time');
      await po.fillStreet('123 Test St');
      await po.fillCity('Test City');
      await po.fillCountry('United States');

      // Step 9: Click Submit
      await po.submitEmployeeForm();

      // Step 10: Wait for success toast and drawer close
      await po.waitForSuccessToast();
      const toastVisible = await po.isSuccessToastVisible();
      expect(toastVisible).toBe(true);

      const drawerHidden = await po.isDrawerHidden();
      expect(drawerHidden).toBe(true);

      // Step 11: Search for the newly created employee
      await po.navigate();
      await po.searchEmployees('UITest');
      const newId = await po.getFirstVisibleEmployeeId();
      const rowVisible = await po.isEmployeeRowVisible(newId);
      expect(rowVisible).toBe(true);

      const nameInRow = await po.getEmployeeNameFromRow(newId);
      expect(nameInRow).toContain('UITest');
      expect(nameInRow).toContain('CreateSpec');

      const emailInRow = await po.getEmployeeEmailFromRow(newId);
      expect(emailInRow).toBe(uniqueEmail);

      // Step 12: Clean up — delete the created employee
      await po.deleteEmployee(newId);

      // Verify deletion
      await po.navigate();
      await po.searchEmployees('UITest');
      const rowAfterDelete = await po.isEmployeeRowVisible(newId);
      expect(rowAfterDelete).toBe(false);
    });
  });

  test.describe('negative', () => {

    // TC-eb39b4a1-46b0-519e-3f92-1daacaf1068a  SCOPE:regression
    test('Add employee form shows validation errors when submitted with missing required fields', async ({ page }) => {
      const po = new EmployeeCreatePage(page);
      await po.navigate();

      // Step 1: Verify page loaded
      const addBtnVisible = await po.isAddEmployeeButtonVisible();
      expect(addBtnVisible).toBe(true);

      // Step 2: Open Add Employee drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 3: Leave all fields blank — verify no validation errors yet
      const fnErrBefore = await po.isFirstNameErrorVisible();
      expect(fnErrBefore).toBe(false);
      const lnErrBefore = await po.isLastNameErrorVisible();
      expect(lnErrBefore).toBe(false);
      const emErrBefore = await po.isEmailErrorVisible();
      expect(emErrBefore).toBe(false);

      // Step 4: Click Submit without filling any fields
      await po.submitEmployeeForm();

      // Step 5: Verify validation errors appear for all required fields
      // (employmentStatus and startDate have defaults, so no errors for those)
      const fnErr = await po.isFirstNameErrorVisible();
      expect(fnErr).toBe(true);
      const fnErrText = await po.getValidationErrorText('firstName-error');
      expect(fnErrText).toContain('Required');

      const lnErr = await po.isLastNameErrorVisible();
      expect(lnErr).toBe(true);
      const lnErrText = await po.getValidationErrorText('lastName-error');
      expect(lnErrText).toContain('Required');

      const emErr = await po.isEmailErrorVisible();
      expect(emErr).toBe(true);
      const emErrText = await po.getValidationErrorText('email-error');
      expect(emErrText).toContain('Required');

      const desErr = await po.isDesignationErrorVisible();
      expect(desErr).toBe(true);
      const desErrText = await po.getValidationErrorText('designation-error');
      expect(desErrText).toContain('Required');

      const deptErr = await po.isDepartmentErrorVisible();
      expect(deptErr).toBe(true);
      const deptErrText = await po.getValidationErrorText('department-error');
      expect(deptErrText).toContain('Required');

      const etErr = await po.isEmploymentTypeErrorVisible();
      expect(etErr).toBe(true);
      const etErrText = await po.getValidationErrorText('employmentType-error');
      expect(etErrText).toContain('Required');

      const streetErr = await po.isStreetErrorVisible();
      expect(streetErr).toBe(true);
      const streetErrText = await po.getValidationErrorText('address-street-error');
      expect(streetErrText).toContain('Required');

      const cityErr = await po.isCityErrorVisible();
      expect(cityErr).toBe(true);
      const cityErrText = await po.getValidationErrorText('address-city-error');
      expect(cityErrText).toContain('Required');

      const countryErr = await po.isCountryErrorVisible();
      expect(countryErr).toBe(true);
      const countryErrText = await po.getValidationErrorText('address-country-error');
      expect(countryErrText).toContain('Required');

      // Drawer remains open
      const stillOpen = await po.isDrawerVisible();
      expect(stillOpen).toBe(true);

      // Step 6: Fill only First Name and submit again
      await po.fillFirstName('Partial');
      await po.submitEmployeeForm();

      // First Name error should clear
      const fnErrAfterPartial = await po.isFirstNameErrorVisible();
      expect(fnErrAfterPartial).toBe(false);

      // Other required field errors still present
      const lnErrStill = await po.isLastNameErrorVisible();
      expect(lnErrStill).toBe(true);
      const emErrStill = await po.isEmailErrorVisible();
      expect(emErrStill).toBe(true);
      const desErrStill = await po.isDesignationErrorVisible();
      expect(desErrStill).toBe(true);

      // Drawer still open — form did not submit
      const drawerStillOpen = await po.isDrawerVisible();
      expect(drawerStillOpen).toBe(true);

      // Step 7: Fill Email with invalid format and submit
      await po.fillEmail('notanemail');
      await po.submitEmployeeForm();

      // Email error should show format validation
      const emErrInvalid = await po.isEmailErrorVisible();
      expect(emErrInvalid).toBe(true);
      const emErrInvalidText = await po.getEmailErrorText();
      expect(emErrInvalidText.length).toBeGreaterThan(0);

      // Drawer still open
      const drawerStillOpen2 = await po.isDrawerVisible();
      expect(drawerStillOpen2).toBe(true);

      // Step 8: Cancel / close the drawer
      await po.cancelEmployeeForm();
      const drawerHidden = await po.isDrawerHidden();
      expect(drawerHidden).toBe(true);

      // Step 9: Confirm no partial employee was created
      await po.searchEmployees('Partial');
      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBe(0);
    });
  });

  test.describe('edge', () => {

    // Edge: Verify drawer can be closed via close button without side effects
    test('Closing add drawer via close button does not create an employee', async ({ page }) => {
      const po = new EmployeeCreatePage(page);
      await po.navigate();

      const initialRowCount = await po.getEmployeeRowCount();

      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Fill some fields but do not submit
      await po.fillFirstName('EdgeClose');
      await po.fillLastName('Test');
      await po.fillEmail('edgeclose@test.com');

      // Close via close button
      await po.closeDrawer();
      const drawerHidden = await po.isDrawerHidden();
      expect(drawerHidden).toBe(true);

      // Verify no employee was created
      await po.searchEmployees('EdgeClose');
      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBe(0);
    });

    // Edge: Re-opening drawer after cancel shows a clean form
    test('Re-opening add drawer after cancel shows empty form fields', async ({ page }) => {
      const po = new EmployeeCreatePage(page);
      await po.navigate();

      // Open drawer and fill some fields
      await po.openAddEmployeeDrawer();
      await po.fillFirstName('Stale');
      await po.fillLastName('Data');
      await po.fillEmail('stale@data.com');

      // Cancel
      await po.cancelEmployeeForm();
      const drawerHidden = await po.isDrawerHidden();
      expect(drawerHidden).toBe(true);

      // Re-open drawer
      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Verify fields are empty (reset)
      const fn = await po.getFirstNameValue();
      expect(fn).toBe('');
      const ln = await po.getLastNameValue();
      expect(ln).toBe('');
      const em = await po.getEmailValue();
      expect(em).toBe('');

      // Clean up — close drawer
      await po.closeDrawer();
    });
  });
});