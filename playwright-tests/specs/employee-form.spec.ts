import { test, expect } from '@playwright/test';
import { EmployeeFormPage } from '../pages/employee-form.page';

test.describe('employee-form — UI New Feature', () => {

  test.describe('positive', () => {

    // TC-f16b3241-e9b9-5038-8d64-6f5cabf32da2  SCOPE:new-feature
    test('Work Phone label is visible in the Add Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      const workPhoneVisible = await po.isLabelVisibleInDrawer('Work Phone');
      expect(workPhoneVisible).toBe(true);

      const standalonePhonePresent = await po.isExactStandaloneLabelPresent('Phone');
      expect(standalonePhonePresent).toBe(false);
    });

    // TC-336fb36d-83d3-5e40-a247-c5b50ddb52b3  SCOPE:new-feature
    test('Work Phone label is visible in the Edit Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const id = await po.getFirstEmployeeId();
      await po.clickEmployeeRow(id);

      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      const workPhoneVisible = await po.isLabelVisibleInDrawer('Work Phone');
      expect(workPhoneVisible).toBe(true);

      const standalonePhonePresent = await po.isExactStandaloneLabelPresent('Phone');
      expect(standalonePhonePresent).toBe(false);
    });

    // TC-ea665b9c-58c2-5b9d-dab3-59cd21812f40  SCOPE:new-feature
    test('Cell Phone field is present in the Add Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      const cellPhoneLabelVisible = await po.isLabelVisibleInDrawer('Cell Phone');
      expect(cellPhoneLabelVisible).toBe(true);

      const cellPhoneInputVisible = await po.isCellPhoneInputVisible();
      expect(cellPhoneInputVisible).toBe(true);

      const cellPhoneEnabled = await po.isCellPhoneInputEnabled();
      expect(cellPhoneEnabled).toBe(true);
    });

    // TC-068d246c-6355-5ace-76a3-4270459eb62c  SCOPE:new-feature
    test('Both Work Phone and Cell Phone labels coexist in the Add Employee form', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      const labels = await po.getDrawerLabelTexts();

      const hasWorkPhone = labels.some(l => l.trim() === 'Work Phone');
      expect(hasWorkPhone).toBe(true);

      const hasCellPhone = labels.some(l => l.trim() === 'Cell Phone');
      expect(hasCellPhone).toBe(true);

      const phoneInputVisible = await po.isPhoneInputVisible();
      expect(phoneInputVisible).toBe(true);

      const cellPhoneInputVisible = await po.isCellPhoneInputVisible();
      expect(cellPhoneInputVisible).toBe(true);

      const standalonePhonePresent = await po.isExactStandaloneLabelPresent('Phone');
      expect(standalonePhonePresent).toBe(false);
    });

    // TC-731a2fa4-2c08-5371-3c55-03e9b6e95379  SCOPE:new-feature
    test('Submitting a new employee with Work Phone and Cell Phone values persists and redisplays them correctly', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const uniqueEmail = `test.phones.${Date.now()}@test.com`;
      const firstName = 'PhoneTest';
      const workPhone = '555-010-0001';
      const cellPhone = '555-020-0002';

      const id = await po.createEmployee({
        firstName,
        lastName: 'User',
        email: uniqueEmail,
        designation: 'Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' },
        phone: workPhone,
        cellPhone: cellPhone,
      });

      try {
        await po.navigate();
        await po.searchEmployees(firstName);

        const rowVisible = await po.isEmployeeRowVisible(id);
        expect(rowVisible).toBe(true);

        await po.clickEmployeeRow(id);
        const drawerVisible = await po.isDrawerVisible();
        expect(drawerVisible).toBe(true);

        const phoneValue = await po.getPhoneInputValue();
        expect(phoneValue).toBe(workPhone);

        const cellPhoneValue = await po.getCellPhoneInputValue();
        expect(cellPhoneValue).toBe(cellPhone);
      } finally {
        await po.deleteEmployee(id);
      }
    });

    // TC-efe717d9-7418-591d-bdb4-0a9b347475b1  SCOPE:new-feature
    test('Cell Phone field is present and accessible in the Edit Employee form for a seeded employee', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const id = await po.getFirstEmployeeId();
      await po.clickEmployeeRow(id);

      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      const cellPhoneLabelVisible = await po.isLabelVisibleInDrawer('Cell Phone');
      expect(cellPhoneLabelVisible).toBe(true);

      const cellPhoneInputVisible = await po.isCellPhoneInputVisible();
      expect(cellPhoneInputVisible).toBe(true);

      // The cell phone value may or may not be pre-populated for seeded employees,
      // but the input must be present and return a string (empty or filled).
      const cellPhoneValue = await po.getCellPhoneInputValue();
      expect(typeof cellPhoneValue).toBe('string');
    });

  });

});

test.describe('employee-form — UI Gap Cases', () => {
  test.describe('positive', () => {
    // TC-01be1a09-eab0-5b06-6011-19202de98f9b  SCOPE:new-feature
    test('Editing and saving the Cell Phone field updates the displayed value', async ({ page }) => {
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
        cellPhone: '555-000-0000',
      });

      try {
        // Search for the created employee and open their drawer
        await po.searchEmployees('UITest');
        expect(await po.isEmployeeRowVisible(id)).toBe(true);
        await po.clickEmployeeRow(id);
        expect(await po.isDrawerVisible()).toBe(true);

        // Clear and update the Cell Phone field
        await po.fillCellPhone('555-099-0099');

        // Submit the form
        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.waitForDrawerToClose();

        // Reopen the drawer to verify the updated value persisted
        await po.searchEmployees('UITest');
        expect(await po.isEmployeeRowVisible(id)).toBe(true);
        await po.clickEmployeeRow(id);
        expect(await po.isDrawerVisible()).toBe(true);

        // Verify the Cell Phone field shows the updated value
        const cellPhoneValue = await po.getCellPhoneInputValue();
        expect(cellPhoneValue).toBe('555-099-0099');
      } finally {
        await po.deleteEmployee(id);
      }
    });
  });

  test.describe('negative', () => {
    // TC-e0a9fe54-5a2f-54cf-bd5d-edd755e55710  SCOPE:new-feature
    test('Work Phone label does not revert to "Phone" after a failed form submission', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      // Open the add employee drawer
      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Verify Work Phone and Cell Phone labels are present before submission
      expect(await po.isLabelVisibleInDrawer('Work Phone')).toBe(true);
      expect(await po.isLabelVisibleInDrawer('Cell Phone')).toBe(true);

      // Submit the empty form to trigger validation errors
      await po.submitEmployeeForm();

      // Verify the drawer is still open (form was rejected)
      expect(await po.isDrawerVisible()).toBe(true);

      // Verify Work Phone label is still present and has NOT reverted to 'Phone'
      expect(await po.isLabelVisibleInDrawer('Work Phone')).toBe(true);
      expect(await po.isLabelVisibleInDrawer('Cell Phone')).toBe(true);

      // Ensure the old label 'Phone' (as a standalone label) is NOT present
      expect(await po.isExactStandaloneLabelPresent('Phone')).toBe(false);
    });
  });

  test.describe('edge', () => {
    // TC-57e31be7-ced7-5775-aeaa-3e4d8d5c54ea  SCOPE:new-feature
    test('Work Phone field accepts an empty value without blocking form submission', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;

      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Fill only required fields, leaving phone and cellPhone empty
      await po.fillRequiredFields({
        firstName: 'UITest',
        lastName: 'User',
        email: uniqueEmail,
        designation: 'Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-01-15',
        street: '123 Test St',
        city: 'Test City',
        country: 'United States',
      });

      // Explicitly do NOT fill phone or cellPhone — they should remain empty

      // Submit the form
      await po.submitEmployeeForm();
      await po.waitForSuccessToast();
      await po.waitForDrawerToClose();

      // Find the created employee to get its ID for cleanup
      await po.searchEmployees('UITest');
      const count = await po.getEmployeeRowCount();
      expect(count).toBeGreaterThan(0);

      // Clean up: use visible DOM row (search is filtered to 'UITest') not unfiltered API
      const id = await po.getFirstVisibleEmployeeId();
      try {
        expect(await po.isEmployeeRowVisible(id)).toBe(true);
      } finally {
        await po.deleteEmployee(id);
      }
    });

    // TC-85265e46-4a47-50ad-4555-e855974ec55f  SCOPE:new-feature
    test('Work Phone label text matches exactly "Work Phone" with correct casing', async ({ page }) => {
      const po = new EmployeeFormPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Verify the exact label text 'Work Phone' is present
      expect(await po.isExactStandaloneLabelPresent('Work Phone')).toBe(true);

      // Verify incorrect variants are NOT present as standalone labels
      expect(await po.isExactStandaloneLabelPresent('work phone')).toBe(false);
      expect(await po.isExactStandaloneLabelPresent('WORK PHONE')).toBe(false);
      expect(await po.isExactStandaloneLabelPresent('WorkPhone')).toBe(false);
      expect(await po.isExactStandaloneLabelPresent('Phone (Work)')).toBe(false);

      // Also verify that the old label 'Phone' (standalone, not part of 'Work Phone' or 'Cell Phone') is not present
      expect(await po.isExactStandaloneLabelPresent('Phone')).toBe(false);

      // Get all drawer labels and find the one that should be 'Work Phone'
      const labels = await po.getDrawerLabelTexts();
      const workPhoneLabel = labels.find(l => l.includes('Work Phone'));
      expect(workPhoneLabel).toBeDefined();
      expect(workPhoneLabel!.trim()).toBe('Work Phone');
    });
  });
});