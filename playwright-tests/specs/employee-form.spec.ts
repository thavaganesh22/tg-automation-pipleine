import { test, expect } from '@playwright/test';
import { EmployeeFormPage } from '../pages/employee-form.page';

test.describe('employee-form — UI New Feature', () => {

  test.describe('positive', () => {

    // TC-8fe6ed1d-cb0d-5040-6950-6596d48df1f4  SCOPE:new-feature
    test('[UI] employee-form: Work Phone label displayed in Add Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      const workPhoneLabelVisible = await po.isLabelVisible('Work Phone');
      expect(workPhoneLabelVisible).toBe(true);

      const hasStandalonePhone = await po.hasStandalonePhoneLabel();
      expect(hasStandalonePhone).toBe(false);
    });

    // TC-334d05f9-139f-54c8-3322-68561a65cafb  SCOPE:new-feature
    test('[UI] employee-form: Work Phone label displayed in Edit Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const id = await po.getFirstEmployeeId();
      const employeeName = await po.getFirstEmployeeName();
      await po.searchEmployees(employeeName);
      await po.clickEmployeeRow(id);

      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      const workPhoneLabelVisible = await po.isLabelVisible('Work Phone');
      expect(workPhoneLabelVisible).toBe(true);

      const hasStandalonePhone = await po.hasStandalonePhoneLabel();
      expect(hasStandalonePhone).toBe(false);
    });

    // TC-2eabade4-a727-5493-a47a-6a227cbc79e7  SCOPE:new-feature
    test('[UI] employee-form: Cell Phone field is present in Add Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      const cellPhoneLabelVisible = await po.isLabelVisible('Cell Phone');
      expect(cellPhoneLabelVisible).toBe(true);

      const cellPhoneInputVisible = await po.isCellPhoneInputVisible();
      expect(cellPhoneInputVisible).toBe(true);

      await po.fillCellPhone('555-000-1234');
      const cellPhoneValue = await po.getCellPhoneValue();
      expect(cellPhoneValue).toBe('555-000-1234');
    });

    // TC-aad7fbe3-750c-5bdb-88ee-770d0154db6e  SCOPE:new-feature
    test('[UI] employee-form: Both Work Phone and Cell Phone labels coexist in the form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      const workPhoneLabelVisible = await po.isLabelVisible('Work Phone');
      expect(workPhoneLabelVisible).toBe(true);

      const cellPhoneLabelVisible = await po.isLabelVisible('Cell Phone');
      expect(cellPhoneLabelVisible).toBe(true);

      const workPhoneInputVisible = await po.isWorkPhoneInputVisible();
      expect(workPhoneInputVisible).toBe(true);

      const cellPhoneInputVisible = await po.isCellPhoneInputVisible();
      expect(cellPhoneInputVisible).toBe(true);

      const hasStandalonePhone = await po.hasStandalonePhoneLabel();
      expect(hasStandalonePhone).toBe(false);

      const labels = await po.getFormLabelTexts();
      const phoneRelatedLabels = labels.filter(
        (l) => l.toLowerCase().includes('phone')
      );
      expect(phoneRelatedLabels.length).toBe(2);
    });

    // TC-5a8b57a5-34fa-5dbf-0da6-1020cd282a5d  SCOPE:new-feature
    test('[UI] employee-form: Submitting Add Employee form with Work Phone and Cell Phone values saves successfully', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const uniqueEmail = `test.phones.${Date.now()}@example.com`;
      const firstName = 'UITestPhones';
      const lastName = 'User';

      await po.openAddEmployeeDrawer();

      await po.fillRequiredFields({
        firstName,
        lastName,
        email: uniqueEmail,
        designation: 'QA Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        street: '123 Test St',
        city: 'Test City',
        country: 'United States',
      });

      await po.fillWorkPhone('555-100-2000');
      await po.fillCellPhone('555-100-3000');

      await po.submitEmployeeForm();
      await po.waitForSuccessToast();

      await po.navigate();
      await po.searchEmployees(firstName);

      const id = await po.getFirstVisibleEmployeeId();

      try {
        const rowVisible = await po.isEmployeeRowVisible(id);
        expect(rowVisible).toBe(true);

        await po.clickEmployeeRow(id);
        const drawerVisible = await po.isDrawerVisible();
        expect(drawerVisible).toBe(true);

        const workPhoneValue = await po.getWorkPhoneValue();
        expect(workPhoneValue).toBe('555-100-2000');

        const cellPhoneValue = await po.getCellPhoneValue();
        expect(cellPhoneValue).toBe('555-100-3000');
      } finally {
        await po.deleteEmployee(id);
      }
    });
  });

  test.describe('negative', () => {

    // TC-db3754c3-5ba6-532a-124b-d9e7008b9f8b  SCOPE:new-feature
    test('[UI] employee-form: Work Phone label is not the old Phone label — negative label regression check', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      // Check Add form
      await po.openAddEmployeeDrawer();
      const addDrawerVisible = await po.isDrawerVisible();
      expect(addDrawerVisible).toBe(true);

      const hasStandalonePhoneAdd = await po.hasStandalonePhoneLabel();
      expect(hasStandalonePhoneAdd).toBe(false);

      const workPhoneVisibleAdd = await po.isLabelVisible('Work Phone');
      expect(workPhoneVisibleAdd).toBe(true);

      const cellPhoneVisibleAdd = await po.isLabelVisible('Cell Phone');
      expect(cellPhoneVisibleAdd).toBe(true);

      await po.closeDrawer();

      // Check Edit form
      const id = await po.getFirstEmployeeId();
      const employeeName = await po.getFirstEmployeeName();
      await po.searchEmployees(employeeName);
      await po.clickEmployeeRow(id);

      const editDrawerVisible = await po.isDrawerVisible();
      expect(editDrawerVisible).toBe(true);

      const hasStandalonePhoneEdit = await po.hasStandalonePhoneLabel();
      expect(hasStandalonePhoneEdit).toBe(false);

      const workPhoneVisibleEdit = await po.isLabelVisible('Work Phone');
      expect(workPhoneVisibleEdit).toBe(true);

      const cellPhoneVisibleEdit = await po.isLabelVisible('Cell Phone');
      expect(cellPhoneVisibleEdit).toBe(true);
    });
  });
});

test.describe('employee-form — UI Gap Cases', () => {
  test.describe('positive', () => {
    // TC-ae09793d-3478-5036-0d7f-e59cacec84d0  SCOPE:new-feature
    test('[UI] employee-form: Cell Phone field in Edit form persists updated value after save', async ({ page }) => {
      const po = new EmployeeFormPage(page);
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
        cellPhone: '555-111-2222',
      });

      try {
        await po.searchEmployees('UITest');
        expect(await po.isEmployeeRowVisible(id)).toBe(true);

        await po.clickEmployeeRow(id);
        expect(await po.isDrawerVisible()).toBe(true);

        await po.fillCellPhone('555-999-8888');
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();

        // Reopen the employee to verify persistence
        await po.searchEmployees('UITest');
        expect(await po.isEmployeeRowVisible(id)).toBe(true);
        await po.clickEmployeeRow(id);
        expect(await po.isDrawerVisible()).toBe(true);

        const cellPhoneValue = await po.getCellPhoneValue();
        expect(cellPhoneValue).toBe('555-999-8888');
      } finally {
        await po.deleteEmployee(id);
      }
    });

    // TC-3a9a52a0-4539-5522-434c-0735183dd7a7  SCOPE:new-feature
    test('[UI] employee-form: Seeded employee data displays Work Phone and Cell Phone values in edit form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      // Create an employee with known phone values so we can reliably assert
      const uniqueEmail = `seeded.${Date.now()}@test.com`;
      const id = await po.createEmployee({
        firstName: 'SeededPhone',
        lastName: 'TestUser',
        email: uniqueEmail,
        designation: 'Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' },
        phone: '555-777-0001',
        cellPhone: '555-777-0002',
      });

      try {
        await po.navigate();
        await po.searchEmployees('SeededPhone');
        expect(await po.isEmployeeRowVisible(id)).toBe(true);

        await po.clickEmployeeRow(id);
        expect(await po.isDrawerVisible()).toBe(true);

        // Verify Work Phone label and input are visible
        expect(await po.isWorkPhoneInputVisible()).toBe(true);
        expect(await po.isLabelVisible('Work Phone')).toBe(true);

        // Verify Cell Phone label and input are visible
        expect(await po.isCellPhoneInputVisible()).toBe(true);
        expect(await po.isLabelVisible('Cell Phone')).toBe(true);

        // Verify values are populated (non-empty)
        const workPhone = await po.getWorkPhoneValue();
        const cellPhone = await po.getCellPhoneValue();
        expect(workPhone.length).toBeGreaterThan(0);
        expect(cellPhone.length).toBeGreaterThan(0);
      } finally {
        await po.deleteEmployee(id);
      }
    });
  });

  test.describe('negative', () => {
    // No negative cases in this batch
  });

  test.describe('edge', () => {
    // TC-0fc537c5-c845-5cf5-bd86-5c26264905bf  SCOPE:new-feature
    test('[UI] employee-form: Work Phone field accepts empty value (optional field boundary)', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const uniqueEmail = `edge.${Date.now()}@test.com`;
      let id: string | undefined;

      try {
        await po.openAddEmployeeDrawer();
        expect(await po.isDrawerVisible()).toBe(true);

        await po.fillRequiredFields({
          firstName: 'UITest',
          lastName: 'EdgePhone',
          email: uniqueEmail,
          designation: 'Tester',
          department: 'Engineering',
          employmentType: 'Full-Time',
          street: '456 Edge St',
          city: 'Edge City',
          country: 'United States',
        });

        // Explicitly leave Work Phone and Cell Phone empty (don't fill them)
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();

        // Search for the created employee
        await po.searchEmployees('UITest');
        // Get the visible employee id
        const visibleId = await po.getFirstVisibleEmployeeId();
        id = visibleId;

        await po.clickEmployeeRow(visibleId);
        expect(await po.isDrawerVisible()).toBe(true);

        // Verify Work Phone and Cell Phone are empty
        const workPhone = await po.getWorkPhoneValue();
        const cellPhone = await po.getCellPhoneValue();
        expect(workPhone).toBe('');
        expect(cellPhone).toBe('');

        // Verify Work Phone label is still visible even when empty
        expect(await po.isLabelVisible('Work Phone')).toBe(true);
      } finally {
        if (id) {
          await po.deleteEmployee(id);
        }
      }
    });

    // TC-70dbcb0f-4cb7-5c3d-14c1-6255aa246edc  SCOPE:new-feature
    test('[UI] employee-form: Work Phone label visible on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const po = new EmployeeFormPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Scroll to phone inputs if needed by checking visibility
      const phoneInput = page.locator('[data-testid="phone-input"]');
      await phoneInput.scrollIntoViewIfNeeded();

      // Verify Work Phone label is visible and not truncated
      expect(await po.isLabelVisible('Work Phone')).toBe(true);
      expect(await po.isWorkPhoneInputVisible()).toBe(true);

      // Verify Cell Phone label is visible
      expect(await po.isLabelVisible('Cell Phone')).toBe(true);
      expect(await po.isCellPhoneInputVisible()).toBe(true);

      // Verify the Work Phone label bounding box fits within the viewport
      const labels = page.locator('label').filter({ hasText: 'Work Phone' });
      const labelBox = await labels.first().boundingBox();
      expect(labelBox).not.toBeNull();
      if (labelBox) {
        // Label should start within viewport and not overflow
        expect(labelBox.x).toBeGreaterThanOrEqual(0);
        expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(375);
      }
    });
  });
});