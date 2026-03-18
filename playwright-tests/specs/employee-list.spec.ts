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