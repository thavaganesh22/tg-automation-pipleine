import { test, expect } from '@playwright/test';
import { EmployeeEditPage } from '../pages/employee-edit.page';

test.describe('employee-edit — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-fa99e7a2-e5ec-5477-c633-1787a0285a98  SCOPE:regression
    test('Edit drawer pre-populates all fields with existing employee data', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      // Step 1: Retrieve the first seeded employee's ID and data
      const id = await po.getFirstEmployeeId();
      const employee = await po.getEmployeeById(id);
      const originalFirstName = employee.firstName as string;
      const originalLastName = employee.lastName as string;
      const originalEmail = employee.email as string;
      const originalDepartment = employee.department as string;
      const originalDesignation = employee.designation as string;

      // Step 3: Search for the employee so their row is on page 1
      await po.searchEmployees(originalFirstName);

      // Wait for the filtered row to appear
      await page.getByTestId(`employee-row-${id}`).waitFor({ state: 'visible', timeout: 10000 });

      // Step 4: Click the employee row to open the edit drawer
      const rowVisible = await po.isEmployeeRowVisible(id);
      expect(rowVisible).toBe(true);
      await po.clickEmployeeRow(id);

      // Verify drawer is open
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Step 5: Verify First Name is pre-populated
      const firstName = await po.getFirstNameValue();
      expect(firstName).toBe(originalFirstName);

      // Step 6: Verify Last Name is pre-populated
      const lastName = await po.getLastNameValue();
      expect(lastName).toBe(originalLastName);

      // Step 7: Verify Email is pre-populated
      const email = await po.getEmailValue();
      expect(email).toBe(originalEmail);

      // Step 8: Verify Department is pre-populated
      const department = await po.getDepartmentValue();
      expect(department).toBe(originalDepartment);

      // Step 9: Verify Designation (Role) is pre-populated
      const designation = await po.getDesignationValue();
      expect(designation).toBe(originalDesignation);

      // Step 10: Verify drawer is visible (drawer title is "Personal Information", not "Edit Employee")
      const drawerStillVisible = await po.isDrawerVisible();
      expect(drawerStillVisible).toBe(true);

      // Step 11: Close the drawer without making changes
      await po.pressEscape();
      const drawerHidden = await po.isDrawerHidden();
      expect(drawerHidden).toBe(true);
    });

  });

  test.describe('negative', () => {

    // TC-b38c4b78-4e84-53ed-e9de-7428e55e1194  SCOPE:regression
    test('Edit drawer discards unsaved changes and restores original data on cancel', async ({ page }) => {
      const po = new EmployeeEditPage(page);
      await po.navigate();

      // Step 1: Create a dedicated test employee
      const uniqueEmail = `test.discard.${Date.now()}@test.com`;
      const originalFirstName = 'DiscardTest';
      const originalLastName = 'CancelUser';
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
        // Step 2: Navigate to list
        await po.navigate();

        // Step 3: Search for the test employee
        await po.searchEmployees(originalFirstName);

        // Wait for the filtered row to appear
        await page.getByTestId(`employee-row-${id}`).waitFor({ state: 'visible', timeout: 10000 });

        const rowVisible = await po.isEmployeeRowVisible(id);
        expect(rowVisible).toBe(true);

        // Step 4: Click the employee row to open edit drawer
        await po.clickEmployeeRow(id);
        const drawerVisible = await po.isDrawerVisible();
        expect(drawerVisible).toBe(true);

        // Verify pre-populated values
        const preFirstName = await po.getFirstNameValue();
        expect(preFirstName).toBe(originalFirstName);
        const preEmail = await po.getEmailValue();
        expect(preEmail).toBe(uniqueEmail);

        // Step 5: Clear First Name and type a temporary value
        await po.fillFirstName('UNSAVED_EDIT');
        const changedFirstName = await po.getFirstNameValue();
        expect(changedFirstName).toBe('UNSAVED_EDIT');

        // Step 6: Clear Email and type a temporary value
        const unsavedEmail = `unsaved.${Date.now()}@test.com`;
        await po.fillEmail(unsavedEmail);
        const changedEmail = await po.getEmailValue();
        expect(changedEmail).toBe(unsavedEmail);

        // Step 7: Cancel without saving
        await po.cancelEdit();
        const drawerHidden = await po.isDrawerHidden();
        expect(drawerHidden).toBe(true);

        // Step 8: Search for the test employee again
        await po.searchEmployees(originalFirstName);

        // Wait for the filtered row to appear
        await page.getByTestId(`employee-row-${id}`).waitFor({ state: 'visible', timeout: 10000 });

        const rowStillVisible = await po.isEmployeeRowVisible(id);
        expect(rowStillVisible).toBe(true);

        // Step 9: Reopen the edit drawer
        await po.clickEmployeeRow(id);
        const drawerVisibleAgain = await po.isDrawerVisible();
        expect(drawerVisibleAgain).toBe(true);

        // Step 10: Verify First Name is restored to original
        const restoredFirstName = await po.getFirstNameValue();
        expect(restoredFirstName).toBe(originalFirstName);

        // Step 11: Verify Email is restored to original
        const restoredEmail = await po.getEmailValue();
        expect(restoredEmail).toBe(uniqueEmail);

        // Step 12: Close the drawer
        await po.closeDrawer();
        const finalDrawerHidden = await po.isDrawerHidden();
        expect(finalDrawerHidden).toBe(true);
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