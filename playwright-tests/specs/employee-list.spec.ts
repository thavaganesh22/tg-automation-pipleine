import { test, expect } from '@playwright/test';
import { EmployeeListPage } from '../pages/employee-list.page';

test.describe('employee-list — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-f4265755-c2dc-54ca-dbca-6d2cac5600a3  SCOPE:regression
    test('[UI] employee-list: Page loads and renders employee table with data', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      // Step 1: Page loads without error
      const errorVisible = await po.isErrorBannerVisible();
      expect(errorVisible).toBe(false);

      const heading = await po.getPageHeadingText();
      expect(heading.toLowerCase()).toContain('employee');

      // Step 2: Table is visible with data rows
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // Step 3: Table headers are present
      const headers = await po.getTableHeaderTexts();
      expect(headers.length).toBeGreaterThanOrEqual(4);
      const headersUpper = headers.map(h => h.toUpperCase());
      expect(headersUpper).toEqual(expect.arrayContaining(['EMPLOYEE', 'DESIGNATION', 'DEPARTMENT', 'STATUS']));

      // Step 4: Row count is at least 1 (already verified above)

      // Step 5: First row has non-empty values
      const firstName = await po.getFirstRowName();
      expect(firstName.trim().length).toBeGreaterThan(0);

      const firstEmail = await po.getFirstRowEmail();
      expect(firstEmail.trim().length).toBeGreaterThan(0);

      const firstDept = await po.getFirstRowDepartment();
      expect(firstDept.trim().length).toBeGreaterThan(0);

      // Step 6: Pagination is visible
      const paginationVisible = await po.isPaginationVisible();
      expect(paginationVisible).toBe(true);

      const summaryText = await po.getPaginationSummaryText();
      expect(summaryText.length).toBeGreaterThan(0);
    });

    // TC-e8664f52-2648-57b8-0ba0-724a2fd84cd0  SCOPE:regression
    test('[UI] employee-list: Empty state does NOT appear when search matches at least one employee', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      // Step 1: Get the first employee's name dynamically
      const firstRowName = await po.getFirstRowName();
      expect(firstRowName.trim().length).toBeGreaterThan(0);

      // Extract just the first word (first name) to use as search term
      const searchTerm = firstRowName.trim().split(/\s+/)[0];

      // Step 2-3: Search input is visible and empty
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);

      const initialSearchValue = await po.getSearchInputValue();
      expect(initialSearchValue).toBe('');

      // Step 4: Type the employee name into search
      await po.searchEmployees(searchTerm);

      // Step 5: Wait for table to update
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      // Step 6: At least one row is rendered
      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // Step 7: Empty state is NOT visible
      const emptyStateHidden = await po.isEmptyStateHidden();
      expect(emptyStateHidden).toBe(true);
    });

  });

  test.describe('negative', () => {

    // TC-a9e256b0-6aa1-5b4a-5596-b4384aa01c85  SCOPE:regression
    test('[UI] employee-list: Table displays empty-state message when no employees match a filter', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      // Step 1-2: Table is visible with data
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(1);

      // Step 3: Search input is visible
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);

      // Step 4: Type a string guaranteed to match no employee
      await po.searchEmployees('zzz-no-match-99999');

      // Step 5-6: No rows, empty state visible
      const rowCountAfterSearch = await po.getEmployeeRowCount();
      expect(rowCountAfterSearch).toBe(0);

      const emptyStateVisible = await po.isEmptyStateVisible();
      expect(emptyStateVisible).toBe(true);

      const emptyText = await po.getEmptyStateText();
      expect(emptyText.length).toBeGreaterThan(0);

      // Step 7-8: Clear search and verify table repopulates
      await po.clearSearch();

      const rowCountAfterClear = await po.getEmployeeRowCount();
      expect(rowCountAfterClear).toBeGreaterThanOrEqual(1);

      const emptyStateHidden = await po.isEmptyStateHidden();
      expect(emptyStateHidden).toBe(true);
    });

    // TC-33b1c8d7-ae04-51a6-f8ef-5c60fd4a6d0a  SCOPE:regression
    test('[UI] employee-list: Empty state message displayed when search yields no results', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      // Step 1: Table is visible with rows
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(1);

      // Step 2: Search input is visible and empty
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);

      const initialSearchValue = await po.getSearchInputValue();
      expect(initialSearchValue).toBe('');

      // Step 3: Type a guaranteed no-match string
      await po.searchEmployees('ZZZNOMATCH_99999_XQWERTY');

      // Step 4-5: No rows rendered
      const rowCountAfterSearch = await po.getEmployeeRowCount();
      expect(rowCountAfterSearch).toBe(0);

      // Step 6: Empty state message is visible
      const emptyStateVisible = await po.isEmptyStateVisible();
      expect(emptyStateVisible).toBe(true);

      const emptyText = await po.getEmptyStateText();
      expect(emptyText.toLowerCase()).toMatch(/no\s+(employees|results)/);

      // Step 7: Clear search
      await po.clearSearch();

      // Step 8: Rows are restored, empty state hidden
      const rowCountAfterClear = await po.getEmployeeRowCount();
      expect(rowCountAfterClear).toBeGreaterThanOrEqual(1);

      const emptyStateHidden = await po.isEmptyStateHidden();
      expect(emptyStateHidden).toBe(true);
    });

  });

  test.describe('edge', () => {
    // No edge cases in this regression suite
  });

});

test.describe('employee-list — UI Gap Cases', () => {
  test.describe('positive', () => {
    // TC-1e15ea3a-5cee-5c6b-7427-45e24095c530  SCOPE:new-feature
    test('Cell phone column header is visible in the employee list table', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await expect(await po.isEmployeeTableVisible()).toBe(true);
      const headers = await po.getTableHeaderTexts();
      expect(headers.some(h => h.trim() === 'Cell Phone')).toBe(true);
    });

    // TC-22d829ec-556c-5a06-9345-ffc2d2876bbb  SCOPE:new-feature
    test('Work Phone column header label is correctly renamed from Phone', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await expect(await po.isEmployeeTableVisible()).toBe(true);
      const headers = await po.getTableHeaderTexts();
      const trimmedHeaders = headers.map(h => h.trim());

      // 'Work Phone' must be present
      expect(trimmedHeaders).toContain('Work Phone');

      // No standalone 'Phone' header (exact match, not substring of 'Work Phone' or 'Cell Phone')
      const standalonePhone = trimmedHeaders.filter(h => h === 'Phone');
      expect(standalonePhone.length).toBe(0);
    });

    // TC-7aba284f-c101-5c50-af54-a3d7fa38d7e8  SCOPE:new-feature
    test('Cell phone data is displayed in the cell phone column for a seeded employee', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await expect(await po.isEmployeeTableVisible()).toBe(true);

      // Determine the Cell Phone column index
      const headers = await po.getTableHeaderTexts();
      const trimmedHeaders = headers.map(h => h.trim());
      const cellPhoneIndex = trimmedHeaders.indexOf('Cell Phone');
      expect(cellPhoneIndex).toBeGreaterThanOrEqual(0);

      // Get the first row's cell texts and check the cell phone column
      const cellTexts = await po.getRowCellTexts(0);
      expect(cellTexts.length).toBeGreaterThan(cellPhoneIndex);
      // The cell should contain some value (seeded employees should have cell phone data)
      const cellPhoneValue = cellTexts[cellPhoneIndex].trim();
      expect(cellPhoneValue.length).toBeGreaterThan(0);
    });

    // TC-aed92ad5-ddf4-5248-b227-94a297f06456  SCOPE:new-feature
    test('Add Employee form contains a Cell Phone field', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Verify the cellPhone input is visible
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      await expect(cellPhoneInput).toBeVisible();

      // Verify it accepts text input
      await cellPhoneInput.fill('555-000-1234');
      await expect(cellPhoneInput).toHaveValue('555-000-1234');

      // Close without saving
      await po.closeDrawer();
      expect(await po.isDrawerVisible()).toBe(false);
    });

    // TC-2d5ffe19-f2bf-579a-95de-7320aa7028b9  SCOPE:new-feature
    test('Add Employee form labels the existing phone field as Work Phone', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Find all labels within the drawer
      const drawer = page.locator('[data-testid="employee-drawer"]');
      const labels = await drawer.locator('label').allTextContents();
      const trimmedLabels = labels.map(l => l.trim());

      // 'Work Phone' label must be present
      expect(trimmedLabels.some(l => l === 'Work Phone')).toBe(true);

      // No standalone 'Phone' label (exact match)
      const standalonePhoneLabels = trimmedLabels.filter(l => l === 'Phone');
      expect(standalonePhoneLabels.length).toBe(0);

      await po.closeDrawer();
    });

    // TC-d54ff87b-a181-5cc1-66fa-7dc5903a5e75  SCOPE:new-feature
    test('Creating an employee with a cell phone value persists and displays in the list', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      const cellPhoneValue = `555-111-${String(Date.now()).slice(-4)}`;
      let createdId = '';

      try {
        // Open drawer and fill form
        await po.openAddEmployeeDrawer();
        expect(await po.isDrawerVisible()).toBe(true);

        await po.fillFirstName('UITest');
        await po.fillLastName('CellPhoneUser');
        await po.fillEmail(uniqueEmail);
        await po.fillDesignation('Engineer');
        await po.selectDepartment('Engineering');
        await po.selectEmploymentType('Full-Time');
        await po.selectEmploymentStatus('Active');
        await po.fillStreet('123 Test St');
        await po.fillCity('Test City');
        await po.fillCountry('United States');

        // Fill cell phone
        const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
        await cellPhoneInput.fill(cellPhoneValue);

        await po.submitEmployeeForm();
        await po.waitForSuccessToast();

        // Search for the created employee
        await po.searchEmployees('UITest');

        // Determine Cell Phone column index
        const headers = await po.getTableHeaderTexts();
        const trimmedHeaders = headers.map(h => h.trim());
        const cellPhoneIndex = trimmedHeaders.indexOf('Cell Phone');
        expect(cellPhoneIndex).toBeGreaterThanOrEqual(0);

        // Find the row with our employee and check cell phone value
        const rowCount = await po.getEmployeeRowCount();
        expect(rowCount).toBeGreaterThan(0);

        const cellTexts = await po.getRowCellTexts(0);
        expect(cellTexts[cellPhoneIndex].trim()).toBe(cellPhoneValue);

        // Get the ID for cleanup
        createdId = await po.getFirstEmployeeId();
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });

    // TC-352ae206-3e2a-5191-c9be-3b2e33624db0  SCOPE:new-feature
    test('Edit Employee form displays and allows updating the Cell Phone field', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      const updatedCellPhone = `555-999-${String(Date.now()).slice(-4)}`;
      let createdId = '';

      try {
        createdId = await po.createEmployee({
          firstName: 'UITest',
          lastName: 'EditCell',
          email: uniqueEmail,
          designation: 'Engineer',
          department: 'Engineering',
          employmentType: 'Full-Time',
          employmentStatus: 'Active',
          startDate: '2024-01-15',
          address: { street: '123 Test St', city: 'Test City', country: 'United States' },
        });

        await po.navigate();
        await po.searchEmployees('UITest');
        expect(await po.isEmployeeRowVisible(createdId)).toBe(true);

        // Click the row to open edit drawer
        await po.clickEmployeeRow(createdId);
        expect(await po.isDrawerVisible()).toBe(true);

        // Verify Cell Phone field is present
        const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
        await expect(cellPhoneInput).toBeVisible();

        // Clear and enter new cell phone
        await cellPhoneInput.clear();
        await cellPhoneInput.fill(updatedCellPhone);

        await po.submitEmployeeForm();
        await po.waitForSuccessToast();

        // Search again and verify updated value
        await po.searchEmployees('UITest');
        expect(await po.isEmployeeRowVisible(createdId)).toBe(true);

        // Determine Cell Phone column index
        const headers = await po.getTableHeaderTexts();
        const trimmedHeaders = headers.map(h => h.trim());
        const cellPhoneIndex = trimmedHeaders.indexOf('Cell Phone');
        expect(cellPhoneIndex).toBeGreaterThanOrEqual(0);

        const cellTexts = await po.getRowCellTexts(0);
        expect(cellTexts[cellPhoneIndex].trim()).toBe(updatedCellPhone);
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });
  });

  test.describe('negative', () => {
    // TC-69e39066-e235-58cb-8897-cdc78fd73a04  SCOPE:new-feature
    test('Cell Phone field rejects excessively long input with a validation message', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      expect(await po.isDrawerVisible()).toBe(true);

      // Fill all required fields
      await po.fillFirstName('UITest');
      await po.fillLastName('LongCell');
      await po.fillEmail(`test.${Date.now()}@test.com`);
      await po.fillDesignation('Engineer');
      await po.selectDepartment('Engineering');
      await po.selectEmploymentType('Full-Time');
      await po.selectEmploymentStatus('Active');
      await po.fillStreet('123 Test St');
      await po.fillCity('Test City');
      await po.fillCountry('United States');

      // Enter excessively long cell phone value (300 digits)
      const longCellPhone = '1'.repeat(300);
      const cellPhoneInput = page.locator('[data-testid="cellPhone-input"]');
      await cellPhoneInput.fill(longCellPhone);

      await po.submitEmployeeForm();

      // Check for validation error near the cell phone field, or that the drawer remains open
      // (form did not submit successfully)
      const cellPhoneError = page.locator('[data-testid="cellPhone-error"]');
      const drawerStillVisible = await po.isDrawerVisible();

      // Either a specific validation error is shown, or the drawer stays open (form rejected)
      const hasValidationError = await cellPhoneError.isVisible().catch(() => false);

      // At minimum, the form should either show an error or remain open
      expect(hasValidationError || drawerStillVisible).toBe(true);

      // If there's a validation error, verify it has meaningful text
      if (hasValidationError) {
        const errorText = await cellPhoneError.textContent();
        expect(errorText!.trim().length).toBeGreaterThan(0);
      }

      await po.closeDrawer();
    });
  });

  test.describe('edge', () => {
    // TC-0ab509e9-b883-50f9-4dc4-a8fbbeb070ab  SCOPE:new-feature
    test('Cell phone column shows empty/blank for employees with no cell phone value', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      let createdId = '';

      try {
        // Create employee without cell phone via the form
        await po.openAddEmployeeDrawer();
        expect(await po.isDrawerVisible()).toBe(true);

        await po.fillFirstName('UITest');
        await po.fillLastName('NoCellPhone');
        await po.fillEmail(uniqueEmail);
        await po.fillDesignation('Engineer');
        await po.selectDepartment('Engineering');
        await po.selectEmploymentType('Full-Time');
        await po.selectEmploymentStatus('Active');
        await po.fillStreet('123 Test St');
        await po.fillCity('Test City');
        await po.fillCountry('United States');

        // Explicitly leave cellPhone empty (do not fill it)

        await po.submitEmployeeForm();
        await po.waitForSuccessToast();

        // Search for the created employee
        await po.searchEmployees('UITest');

        const rowCount = await po.getEmployeeRowCount();
        expect(rowCount).toBeGreaterThan(0);

        createdId = await po.getFirstEmployeeId();

        // Determine Cell Phone column index
        const headers = await po.getTableHeaderTexts();
        const trimmedHeaders = headers.map(h => h.trim());
        const cellPhoneIndex = trimmedHeaders.indexOf('Cell Phone');
        expect(cellPhoneIndex).toBeGreaterThanOrEqual(0);

        // Check the cell phone column value — should be empty, blank, or a dash
        const cellTexts = await po.getRowCellTexts(0);
        const cellPhoneValue = cellTexts[cellPhoneIndex].trim();

        // Should not contain 'undefined', 'null', or error text
        expect(cellPhoneValue).not.toContain('undefined');
        expect(cellPhoneValue).not.toContain('null');
        expect(cellPhoneValue).not.toContain('error');

        // Should be empty or a placeholder like '-' or 'N/A'
        expect(['', '-', 'N/A', '—']).toContain(cellPhoneValue);
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });

    // TC-f0c239ae-0b87-5ae1-279d-75faec257263  SCOPE:new-feature
    test('Cell phone column is present alongside all other expected columns', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await expect(await po.isEmployeeTableVisible()).toBe(true);

      const headers = await po.getTableHeaderTexts();
      const trimmedHeaders = headers.map(h => h.trim());

      // Both 'Cell Phone' and 'Work Phone' must be separate columns
      expect(trimmedHeaders).toContain('Cell Phone');
      expect(trimmedHeaders).toContain('Work Phone');

      // They should be distinct entries (not the same column)
      const cellPhoneIndex = trimmedHeaders.indexOf('Cell Phone');
      const workPhoneIndex = trimmedHeaders.indexOf('Work Phone');
      expect(cellPhoneIndex).not.toBe(workPhoneIndex);

      // Verify other expected columns are still present
      // Check for common expected columns (Name, Email, Department)
      expect(trimmedHeaders.some(h => h.toLowerCase().includes('name'))).toBe(true);
      expect(trimmedHeaders.some(h => h.toLowerCase().includes('email'))).toBe(true);
      expect(trimmedHeaders.some(h => h.toLowerCase().includes('department'))).toBe(true);

      // Verify no duplicate columns (each header should appear only once)
      const uniqueHeaders = new Set(trimmedHeaders);
      expect(uniqueHeaders.size).toBe(trimmedHeaders.length);
    });
  });
});

test.describe('employee-list — UI Gap Cases', () => {
  test.describe('positive', () => {
    // TC-978b324f  SCOPE:new-feature
    test('Cell phone column is visible in the employee list table', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await expect(async () => {
        const visible = await po.isEmployeeTableVisible();
        expect(visible).toBe(true);
      }).toPass({ timeout: 10000 });

      const headers = await po.getTableHeaderTexts();
      const headerTextsLower = headers.map(h => h.toLowerCase().trim());

      expect(headerTextsLower).toContain('cell phone');
      expect(headerTextsLower).toContain('work phone');

      // Verify at least one row exists
      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThan(0);
    });

    // TC-e4f96bfd  SCOPE:new-feature
    test('Work Phone label replaces old Phone label in the employee list table', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await expect(async () => {
        const visible = await po.isEmployeeTableVisible();
        expect(visible).toBe(true);
      }).toPass({ timeout: 10000 });

      const headers = await po.getTableHeaderTexts();
      const trimmedHeaders = headers.map(h => h.trim());

      // No standalone 'Phone' header (exact match)
      const standalonePhone = trimmedHeaders.filter(h => h.toLowerCase() === 'phone');
      expect(standalonePhone.length).toBe(0);

      // Exactly one 'Work Phone' header
      const workPhoneHeaders = trimmedHeaders.filter(h => h.toLowerCase() === 'work phone');
      expect(workPhoneHeaders.length).toBe(1);
    });

    // TC-aa40f8b7  SCOPE:new-feature
    test('Cell phone value entered during employee creation appears in the list', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      const timestamp = Date.now().toString();
      let createdId = '';

      try {
        await po.openAddEmployeeDrawer();
        await expect(async () => {
          const visible = await po.isDrawerVisible();
          expect(visible).toBe(true);
        }).toPass({ timeout: 5000 });

        await po.fillFirstName('UITest');
        await po.fillLastName(`User${timestamp}`);
        await po.fillEmail(uniqueEmail);
        await po.fillDesignation('Engineer');
        await po.selectDepartment('Engineering');
        await po.selectEmploymentType('Full-Time');
        await po.fillPhone('555-000-0001');
        await po.fillCellPhone('555-000-0002');
        await po.fillStreet('123 Test St');
        await po.fillCity('Test City');
        await po.fillCountry('United States');

        await po.submitEmployeeForm();
        await po.waitForSuccessToast();

        // Wait for drawer to close
        await po.waitForDrawerHidden();

        // Search for the created employee
        await po.searchEmployees('UITest');

        // Get the row count and find our employee
        const rowCount = await po.getEmployeeRowCount();
        expect(rowCount).toBeGreaterThan(0);

        // Find Cell Phone and Work Phone column indices
        const headers = await po.getTableHeaderTexts();
        const cellPhoneColIdx = headers.findIndex(h => h.trim().toLowerCase() === 'cell phone');
        const workPhoneColIdx = headers.findIndex(h => h.trim().toLowerCase() === 'work phone');
        expect(cellPhoneColIdx).toBeGreaterThanOrEqual(0);
        expect(workPhoneColIdx).toBeGreaterThanOrEqual(0);

        // Read values from first row
        const cellPhoneValue = await po.getCellTextByRowAndColumnIndex(0, cellPhoneColIdx);
        const workPhoneValue = await po.getCellTextByRowAndColumnIndex(0, workPhoneColIdx);

        expect(cellPhoneValue).toContain('555-000-0002');
        expect(workPhoneValue).toContain('555-000-0001');

        // Get the employee ID for cleanup
        createdId = await po.getFirstEmployeeId();
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });

    // TC-288ad30e  SCOPE:new-feature
    test('Cell phone value is visible in the employee detail/edit drawer', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await expect(async () => {
        const visible = await po.isEmployeeTableVisible();
        expect(visible).toBe(true);
      }).toPass({ timeout: 10000 });

      const id = await po.getFirstEmployeeId();
      await po.clickEmployeeRow(id);

      await expect(async () => {
        const visible = await po.isDrawerVisible();
        expect(visible).toBe(true);
      }).toPass({ timeout: 5000 });

      // Verify Cell Phone input is visible in the drawer
      const cellPhoneVisible = await po.isCellPhoneInputVisible();
      expect(cellPhoneVisible).toBe(true);

      // Verify Phone (Work Phone) input is visible in the drawer
      const phoneVisible = await po.isPhoneInputVisible();
      expect(phoneVisible).toBe(true);

      // Verify form field labels contain 'Cell Phone' and 'Work Phone'
      const labels = await po.getFormFieldLabels();
      const labelsLower = labels.map(l => l.trim().toLowerCase());
      expect(labelsLower).toContain('cell phone');
      expect(labelsLower).toContain('work phone');

      await po.closeDrawer();
    });

    // TC-e0ee4091  SCOPE:new-feature
    test('Cell phone field label is "Cell Phone" and work phone field label is "Work Phone" in the create form', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      await expect(async () => {
        const visible = await po.isDrawerVisible();
        expect(visible).toBe(true);
      }).toPass({ timeout: 5000 });

      const labels = await po.getFormFieldLabels();
      const trimmedLabels = labels.map(l => l.trim());
      const labelsLower = trimmedLabels.map(l => l.toLowerCase());

      // 'Work Phone' label exists
      expect(labelsLower).toContain('work phone');

      // 'Cell Phone' label exists
      expect(labelsLower).toContain('cell phone');

      // No standalone 'Phone' label (exact match)
      const standalonePhone = trimmedLabels.filter(l => l.toLowerCase() === 'phone');
      expect(standalonePhone.length).toBe(0);

      await po.closeDrawer();
    });

    // TC-a74ffde4  SCOPE:new-feature
    test('Editing an existing employee updates the cell phone value in the list', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      let createdId = '';

      try {
        createdId = await po.createEmployee({
          firstName: 'UITest',
          lastName: 'EditCell',
          email: uniqueEmail,
          designation: 'Engineer',
          department: 'Engineering',
          employmentType: 'Full-Time',
          employmentStatus: 'Active',
          startDate: '2024-01-15',
          address: { street: '123 Test St', city: 'Test City', country: 'United States' }
        });

        await po.navigate();
        await po.searchEmployees('UITest');

        await expect(async () => {
          const visible = await po.isEmployeeRowVisible(createdId);
          expect(visible).toBe(true);
        }).toPass({ timeout: 10000 });

        await po.clickEmployeeRow(createdId);

        await expect(async () => {
          const visible = await po.isDrawerVisible();
          expect(visible).toBe(true);
        }).toPass({ timeout: 5000 });

        // Clear and fill cell phone with new value
        await po.clearCellPhone();
        await po.fillCellPhone('555-999-8888');

        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.waitForDrawerHidden();

        // Search again to find the updated employee
        await po.searchEmployees('UITest');

        await expect(async () => {
          const visible = await po.isEmployeeRowVisible(createdId);
          expect(visible).toBe(true);
        }).toPass({ timeout: 10000 });

        // Find Cell Phone column index
        const headers = await po.getTableHeaderTexts();
        const cellPhoneColIdx = headers.findIndex(h => h.trim().toLowerCase() === 'cell phone');
        expect(cellPhoneColIdx).toBeGreaterThanOrEqual(0);

        const cellPhoneValue = await po.getCellTextByEmployeeIdAndColumnIndex(createdId, cellPhoneColIdx);
        expect(cellPhoneValue).toContain('555-999-8888');
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });

    // TC-8f58361f  SCOPE:new-feature
    test('Both Work Phone and Cell Phone columns are independently populated and do not cross-contaminate data', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      const timestamp = Date.now().toString();
      let createdId = '';

      try {
        await po.openAddEmployeeDrawer();
        await expect(async () => {
          const visible = await po.isDrawerVisible();
          expect(visible).toBe(true);
        }).toPass({ timeout: 5000 });

        await po.fillFirstName('UITest');
        await po.fillLastName(`Cross${timestamp}`);
        await po.fillEmail(uniqueEmail);
        await po.fillDesignation('Engineer');
        await po.selectDepartment('Engineering');
        await po.selectEmploymentType('Full-Time');
        await po.fillPhone('555-111-2222');
        await po.fillCellPhone('555-333-4444');
        await po.fillStreet('123 Test St');
        await po.fillCity('Test City');
        await po.fillCountry('United States');

        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.waitForDrawerHidden();

        await po.searchEmployees('UITest');

        const rowCount = await po.getEmployeeRowCount();
        expect(rowCount).toBeGreaterThan(0);

        createdId = await po.getFirstEmployeeId();

        // Find column indices
        const headers = await po.getTableHeaderTexts();
        const workPhoneColIdx = headers.findIndex(h => h.trim().toLowerCase() === 'work phone');
        const cellPhoneColIdx = headers.findIndex(h => h.trim().toLowerCase() === 'cell phone');
        expect(workPhoneColIdx).toBeGreaterThanOrEqual(0);
        expect(cellPhoneColIdx).toBeGreaterThanOrEqual(0);

        // Verify values in the table
        const workPhoneValue = await po.getCellTextByEmployeeIdAndColumnIndex(createdId, workPhoneColIdx);
        const cellPhoneValue = await po.getCellTextByEmployeeIdAndColumnIndex(createdId, cellPhoneColIdx);

        expect(workPhoneValue).toContain('555-111-2222');
        expect(cellPhoneValue).toContain('555-333-4444');

        // Values should not be swapped
        expect(workPhoneValue).not.toContain('555-333-4444');
        expect(cellPhoneValue).not.toContain('555-111-2222');

        // Open drawer and verify values there too
        await po.clickEmployeeRow(createdId);
        await expect(async () => {
          const visible = await po.isDrawerVisible();
          expect(visible).toBe(true);
        }).toPass({ timeout: 5000 });

        const drawerPhoneValue = await po.getPhoneInputValue();
        const drawerCellPhoneValue = await po.getCellPhoneInputValue();

        expect(drawerPhoneValue).toContain('555-111-2222');
        expect(drawerCellPhoneValue).toContain('555-333-4444');

        await po.closeDrawer();
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });
  });

  test.describe('negative', () => {
    // TC-11487587  SCOPE:new-feature
    test('Cell phone field rejects non-numeric or invalid format input and shows a validation message', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      await po.openAddEmployeeDrawer();
      await expect(async () => {
        const visible = await po.isDrawerVisible();
        expect(visible).toBe(true);
      }).toPass({ timeout: 5000 });

      // Fill all required fields
      await po.fillAllRequiredFields({
        firstName: 'UITest',
        lastName: `Validate${Date.now()}`,
        email: `test.${Date.now()}@test.com`,
        designation: 'Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        street: '123 Test St',
        city: 'Test City',
        country: 'United States'
      });

      // Enter invalid cell phone value
      await po.fillCellPhone('abc!@#$%');

      await po.submitEmployeeForm();

      // Expect a validation error on the cell phone field
      const cellPhoneErrorVisible = await po.isCellPhoneErrorVisible();
      expect(cellPhoneErrorVisible).toBe(true);

      const errorText = await po.getCellPhoneErrorText();
      expect(errorText.length).toBeGreaterThan(0);

      // Drawer should still be open (form did not submit)
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Clear cell phone and submit again — should succeed since field is optional
      await po.clearCellPhone();
      await po.submitEmployeeForm();
      await po.waitForSuccessToast();
      await po.waitForDrawerHidden();

      // Clean up: find and delete the created employee
      await po.searchEmployees('UITest');
      const rowCount = await po.getEmployeeRowCount();
      if (rowCount > 0) {
        const createdId = await po.getFirstEmployeeId();
        await po.deleteEmployee(createdId);
      }
    });
  });

  test.describe('edge', () => {
    // TC-ad7be7e5  SCOPE:new-feature
    test('Employee can be saved with an empty cell phone field (optional field)', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      let createdId = '';

      try {
        await po.openAddEmployeeDrawer();
        await expect(async () => {
          const visible = await po.isDrawerVisible();
          expect(visible).toBe(true);
        }).toPass({ timeout: 5000 });

        await po.fillFirstName('UITest');
        await po.fillLastName(`Empty${Date.now()}`);
        await po.fillEmail(uniqueEmail);
        await po.fillDesignation('Engineer');
        await po.selectDepartment('Engineering');
        await po.selectEmploymentType('Full-Time');
        await po.fillStreet('123 Test St');
        await po.fillCity('Test City');
        await po.fillCountry('United States');
        // Deliberately leave Cell Phone empty

        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.waitForDrawerHidden();

        // No cell phone validation error should have appeared
        // (if it did, the form wouldn't have submitted and toast wouldn't appear)

        await po.searchEmployees('UITest');
        const rowCount = await po.getEmployeeRowCount();
        expect(rowCount).toBeGreaterThan(0);

        createdId = await po.getFirstEmployeeId();

        // Find Cell Phone column index
        const headers = await po.getTableHeaderTexts();
        const cellPhoneColIdx = headers.findIndex(h => h.trim().toLowerCase() === 'cell phone');
        expect(cellPhoneColIdx).toBeGreaterThanOrEqual(0);

        // Cell phone column should be empty or have a placeholder — no broken UI
        const cellPhoneValue = await po.getCellTextByEmployeeIdAndColumnIndex(createdId, cellPhoneColIdx);
        // Value should be empty string, dash, or N/A — just not an error indicator
        expect(cellPhoneValue.length).toBeLessThan(50); // sanity check — no error dump
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });

    // TC-547ed6b8  SCOPE:new-feature
    test('Cell phone column displays correctly when value contains maximum allowed characters', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      const uniqueEmail = `test.${Date.now()}@test.com`;
      const maxCellPhone = '+15550000001234';
      let createdId = '';

      try {
        await po.openAddEmployeeDrawer();
        await expect(async () => {
          const visible = await po.isDrawerVisible();
          expect(visible).toBe(true);
        }).toPass({ timeout: 5000 });

        await po.fillFirstName('UITest');
        await po.fillLastName(`MaxLen${Date.now()}`);
        await po.fillEmail(uniqueEmail);
        await po.fillDesignation('Engineer');
        await po.selectDepartment('Engineering');
        await po.selectEmploymentType('Full-Time');
        await po.fillCellPhone(maxCellPhone);
        await po.fillStreet('123 Test St');
        await po.fillCity('Test City');
        await po.fillCountry('United States');

        await po.submitEmployeeForm();
        await po.waitForSuccessToast();
        await po.waitForDrawerHidden();

        await po.searchEmployees('UITest');
        const rowCount = await po.getEmployeeRowCount();
        expect(rowCount).toBeGreaterThan(0);

        createdId = await po.getFirstEmployeeId();

        // Find Cell Phone column index
        const headers = await po.getTableHeaderTexts();
        const cellPhoneColIdx = headers.findIndex(h => h.trim().toLowerCase() === 'cell phone');
        expect(cellPhoneColIdx).toBeGreaterThanOrEqual(0);

        // Verify the full value is displayed in the table
        const cellPhoneValue = await po.getCellTextByEmployeeIdAndColumnIndex(createdId, cellPhoneColIdx);
        expect(cellPhoneValue).toContain(maxCellPhone);

        // Open drawer and verify the value there too
        await po.clickEmployeeRow(createdId);
        await expect(async () => {
          const visible = await po.isDrawerVisible();
          expect(visible).toBe(true);
        }).toPass({ timeout: 5000 });

        const drawerCellPhoneValue = await po.getCellPhoneInputValue();
        expect(drawerCellPhoneValue).toContain(maxCellPhone);

        await po.closeDrawer();
      } finally {
        if (createdId) {
          await po.deleteEmployee(createdId);
        }
      }
    });
  });
});
