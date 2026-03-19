import { test, expect } from '@playwright/test';
import { EmployeeListPage } from '../pages/employee-list.page';

test.describe('employee-list — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-f4265755-c2dc-54ca-dbca-6d2cac5600a3  SCOPE:regression
    test('[UI] employee-list: Page loads and renders employee table with data', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      // Step 1: Page loads without error banners
      const errorVisible = await po.isErrorBannerVisible();
      expect(errorVisible).toBe(false);

      // Step 2: Employee table is visible with at least one row; no loading indicator remains
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const loadingVisible = await po.isLoadingIndicatorVisible();
      expect(loadingVisible).toBe(false);

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // Step 3: Inspect table header row — columns include Employee, Designation, Department, Status
      const headers = await po.getTableHeaderTexts();
      expect(headers.length).toBeGreaterThanOrEqual(4);
      const headersUpper = headers.map(h => h.toUpperCase());
      expect(headersUpper).toContain('EMPLOYEE');
      expect(headersUpper).toContain('DESIGNATION');
      expect(headersUpper).toContain('DEPARTMENT');
      expect(headersUpper).toContain('STATUS');

      // Step 4: Row count is at least 1 (already verified above)

      // Step 5: First data row contains non-empty text in each visible column cell
      const firstRowCells = await po.getRowCellTexts(0);
      expect(firstRowCells.length).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < 4; i++) {
        expect(firstRowCells[i].trim().length).toBeGreaterThan(0);
      }

      // Also verify via dedicated POM methods
      const firstName = await po.getFirstRowName();
      expect(firstName.trim().length).toBeGreaterThan(0);

      const firstEmail = await po.getFirstRowEmail();
      expect(firstEmail.trim().length).toBeGreaterThan(0);

      const firstDept = await po.getFirstRowDepartment();
      expect(firstDept.trim().length).toBeGreaterThan(0);

      // Step 6: Pagination control or summary is visible
      const paginationVisible = await po.isPaginationVisible();
      expect(paginationVisible).toBe(true);

      const summaryText = await po.getPaginationSummaryText();
      expect(summaryText.trim().length).toBeGreaterThan(0);
    });

    // TC-e8664f52-2648-57b8-0ba0-724a2fd84cd0  SCOPE:regression
    test('[UI] employee-list: Empty state does NOT appear when search matches at least one employee', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      // Step 1: Retrieve the name of the first employee dynamically
      const firstRowName = await po.getFirstRowName();
      // Extract a usable search term — use the first word (first name)
      const searchTerm = firstRowName.split(' ')[0].trim();
      expect(searchTerm.length).toBeGreaterThan(0);

      // Step 2-3: Page is loaded, search input is visible and empty
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);

      const searchValue = await po.getSearchInputValue();
      expect(searchValue).toBe('');

      // Step 4: Type the first employee's name into the search input
      await po.searchEmployees(searchTerm);

      // Step 5: Wait for table to finish updating
      // Give a moment for debounce and loading
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      // Step 6: At least one employee row is rendered
      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(1);

      // Step 7: Empty state message is NOT visible
      const emptyVisible = await po.isEmptyStateVisible();
      expect(emptyVisible).toBe(false);
    });

  });

  test.describe('negative', () => {

    // TC-a9e256b0-6aa1-5b4a-5596-b4384aa01c85  SCOPE:regression
    test('[UI] employee-list: Table displays empty-state message when no employees match a filter', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      // Step 1-2: Page loads with table visible and at least one row
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(1);

      // Step 3: Search input is visible
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);

      // Step 4: Type a string guaranteed to match no employee
      await po.searchEmployees('zzz-no-match-99999');

      // Step 5: Table body no longer shows any employee data rows
      const rowCountAfterSearch = await po.getEmployeeRowCount();
      expect(rowCountAfterSearch).toBe(0);

      // Step 6: Empty-state message is visible
      const emptyVisible = await po.isEmptyStateVisible();
      expect(emptyVisible).toBe(true);

      const emptyText = await po.getEmptyStateText();
      expect(emptyText.length).toBeGreaterThan(0);

      // No error banner should be shown
      const errorVisible = await po.isErrorBannerVisible();
      expect(errorVisible).toBe(false);

      // Step 7-8: Clear the search input and verify table repopulates
      await po.clearSearch();

      const rowCountAfterClear = await po.getEmployeeRowCount();
      expect(rowCountAfterClear).toBeGreaterThanOrEqual(1);

      const emptyVisibleAfterClear = await po.isEmptyStateVisible();
      expect(emptyVisibleAfterClear).toBe(false);
    });

    // TC-33b1c8d7-ae04-51a6-f8ef-5c60fd4a6d0a  SCOPE:regression
    test('[UI] employee-list: Empty state message displayed when search yields no results', async ({ page }) => {
      const po = new EmployeeListPage(page);
      await po.navigate();

      // Step 1: Employee list page loads with table visible and at least one row
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(1);

      // Step 2: Search input is visible and empty
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);

      const searchValue = await po.getSearchInputValue();
      expect(searchValue).toBe('');

      // Step 3: Type a search string guaranteed to match no employee
      await po.searchEmployees('ZZZNOMATCH_99999_XQWERTY');

      // Step 4-5: Wait for table to settle — no employee rows rendered
      const rowCountAfterSearch = await po.getEmployeeRowCount();
      expect(rowCountAfterSearch).toBe(0);

      // Step 6: Empty state message is visible with meaningful text
      const emptyVisible = await po.isEmptyStateVisible();
      expect(emptyVisible).toBe(true);

      const emptyText = await po.getEmptyStateText();
      expect(emptyText.trim().length).toBeGreaterThan(0);

      // Step 7: Clear the search input
      await po.clearSearch();

      // Step 8: Employee rows are restored and empty state is hidden
      const rowCountAfterClear = await po.getEmployeeRowCount();
      expect(rowCountAfterClear).toBeGreaterThanOrEqual(1);

      const emptyVisibleAfterClear = await po.isEmptyStateVisible();
      expect(emptyVisibleAfterClear).toBe(false);
    });

  });

  test.describe('edge', () => {
    // No edge cases defined for this module
  });

});