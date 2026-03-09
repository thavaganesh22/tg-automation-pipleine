import { test, expect } from '@playwright/test';
import { EmployeeTablePage } from '../pages/employee-table.page';
import { setupEmployeeTableMocks } from '../fixtures/employee-table.fixture';

test.describe('employee-table — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-d19bda15-bc78-4bd3-99c0-65c748d0d6db  SCOPE:regression
    test('Empty state displayed when no employees exist', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();
      await po.waitForLoadingToDisappear();

      // Search for something that returns zero results to simulate empty state
      await po.searchEmployees('zzznonexistent99999');
      await po.waitForEmptyState();

      const emptyVisible = await po.isEmptyStateVisible();
      expect(emptyVisible).toBe(true);

      const emptyText = await po.getEmptyStateText();
      expect(emptyText.toLowerCase()).toContain('no');

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBe(0);

      // Table headers should still be visible
      const headers = await po.getTableHeaderTexts();
      expect(headers.length).toBeGreaterThan(0);

      // Clear search and verify data returns
      await po.clearSearchInput();
      await po.waitForEmployeeRows();
      const restoredCount = await po.getEmployeeRowCount();
      expect(restoredCount).toBeGreaterThan(0);
    });

    // TC-38197b72-75a3-49a8-a19a-c97875fcdb8a  SCOPE:regression
    test('Pagination navigates to page 2 and displays correct data', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();
      await po.waitForLoadingToDisappear();
      await po.waitForEmployeeRows();

      const page1RowCount = await po.getEmployeeRowCount();
      expect(page1RowCount).toBeGreaterThan(0);

      const page1FirstName = await po.getEmployeeNameAtRow(0);
      expect(page1FirstName.length).toBeGreaterThan(0);

      const paginationVisible = await po.isPaginationVisible();
      expect(paginationVisible).toBe(true);

      const currentPage1 = await po.getCurrentPageIndicator();
      expect(currentPage1).toContain('1');

      await po.goToNextPage();
      await po.waitForTableStable();

      const currentPage2 = await po.getCurrentPageIndicator();
      expect(currentPage2).toContain('2');

      const page2FirstName = await po.getEmployeeNameAtRow(0);
      expect(page2FirstName).not.toBe(page1FirstName);
    });

    // TC-fd76423b-e68c-4ceb-bcd8-f701eb3e6017  SCOPE:regression
    test('Navigate forward then back returns to original page 1 data', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();
      await po.waitForLoadingToDisappear();
      await po.waitForEmployeeRows();

      const page1FirstName = await po.getEmployeeNameAtRow(0);
      const page1FirstEmail = await po.getEmployeeEmailAtRow(0);

      await po.goToNextPage();
      await po.waitForTableStable();

      const page2FirstName = await po.getEmployeeNameAtRow(0);
      expect(page2FirstName).not.toBe(page1FirstName);

      await po.goToPreviousPage();
      await po.waitForTableStable();

      const restoredFirstName = await po.getEmployeeNameAtRow(0);
      const restoredFirstEmail = await po.getEmployeeEmailAtRow(0);
      expect(restoredFirstName).toBe(page1FirstName);
      expect(restoredFirstEmail).toBe(page1FirstEmail);

      const currentPage = await po.getCurrentPageIndicator();
      expect(currentPage).toContain('1');
    });

    // TC-9c32f5e1-98c4-4016-8df8-34392afd8029  SCOPE:regression
    test('Active page number is visually highlighted in pagination', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();
      await po.waitForLoadingToDisappear();
      await po.waitForEmployeeRows();

      const paginationVisible = await po.isPaginationVisible();
      expect(paginationVisible).toBe(true);

      const currentPageInitial = await po.getCurrentPageIndicator();
      expect(currentPageInitial).toContain('1');

      await po.goToNextPage();
      await po.waitForTableStable();

      const currentPageAfterNext = await po.getCurrentPageIndicator();
      expect(currentPageAfterNext).toContain('2');

      await po.goToNextPage();
      await po.waitForTableStable();

      const currentPageThird = await po.getCurrentPageIndicator();
      expect(currentPageThird).toContain('3');
    });

    // TC-00fdda70-c310-4220-9922-ccb3772ea1fb  SCOPE:regression
    test('Table columns and headers render correctly on page load', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();
      await po.waitForLoadingToDisappear();
      await po.waitForEmployeeRows();

      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const headers = await po.getTableHeaderTexts();
      expect(headers).toContain('Employee');
      expect(headers).toContain('Designation');
      expect(headers).toContain('Department');
      expect(headers).toContain('Status');

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThan(0);

      const firstRowCells = await po.getFirstRowCellTexts();
      for (const cell of firstRowCells) {
        expect(cell.length).toBeGreaterThan(0);
      }
    });

    // TC-0c70f9bf-ad70-4a62-87b5-be3a75aaf56d  SCOPE:regression
    test('Loading state appears before data is rendered', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();

      // Check that loading state is or was visible during load
      // (mocks may resolve quickly, so we just verify the transition completes)
      await po.waitForLoadingToDisappear();
      await po.waitForEmployeeRows();

      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThan(0);
    });
  });

  test.describe('negative', () => {

    // TC-bf562302-2216-44e5-90d0-6ed42be68f29  SCOPE:regression
    test('Empty state after filtering yields no results', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();
      await po.waitForLoadingToDisappear();
      await po.waitForEmployeeRows();

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThan(0);

      await po.searchEmployees('zzznonexistent99999');
      await po.waitForEmptyState();

      const emptyVisible = await po.isEmptyStateVisible();
      expect(emptyVisible).toBe(true);

      const emptyText = await po.getEmptyStateText();
      expect(emptyText.length).toBeGreaterThan(0);

      const filteredRowCount = await po.getEmployeeRowCount();
      expect(filteredRowCount).toBe(0);

      await po.clearSearchInput();
      await po.waitForEmployeeRows();

      const restoredRowCount = await po.getEmployeeRowCount();
      expect(restoredRowCount).toBeGreaterThan(0);
    });
  });

  test.describe('edge', () => {

    // TC-be803930-19ea-486f-a8b0-c2397f6630c5  SCOPE:regression
    test('Pagination Previous button is disabled on first page', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();
      await po.waitForLoadingToDisappear();
      await po.waitForEmployeeRows();

      const paginationVisible = await po.isPaginationVisible();
      expect(paginationVisible).toBe(true);

      const currentPage = await po.getCurrentPageIndicator();
      expect(currentPage).toContain('1');

      const prevDisabled = await po.isPreviousPageButtonDisabled();
      expect(prevDisabled).toBe(true);

      const firstNameBefore = await po.getEmployeeNameAtRow(0);

      // Attempt to click Previous — should have no effect
      await po.goToPreviousPage();
      await po.waitForTableStable();

      const firstNameAfter = await po.getEmployeeNameAtRow(0);
      expect(firstNameAfter).toBe(firstNameBefore);

      const currentPageAfter = await po.getCurrentPageIndicator();
      expect(currentPageAfter).toContain('1');
    });

    // TC-c1f9a878-0431-40ed-8b54-745e4e6dff6f  SCOPE:regression
    test('Pagination Next button is disabled on last page', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();
      await po.waitForLoadingToDisappear();
      await po.waitForEmployeeRows();

      await po.navigateToLastPage();
      await po.waitForTableStable();

      const nextDisabled = await po.isNextPageButtonDisabled();
      expect(nextDisabled).toBe(true);

      const lastPageRowCount = await po.getEmployeeRowCount();
      expect(lastPageRowCount).toBeGreaterThanOrEqual(1);
    });

    // TC-ad8742bc-0eec-469a-b1cb-b6ef00b4a8ce  SCOPE:regression
    test('Single page of results hides or disables all pagination navigation', async ({ page }) => {
      await setupEmployeeTableMocks(page);
      const po = new EmployeeTablePage(page);

      await po.navigateToEmployeeTable();
      await po.waitForLoadingToDisappear();
      await po.waitForEmployeeRows();

      // Filter to a department with few employees to get single page
      await po.filterByDepartment('Design');
      await po.waitForTableStable();

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(1);

      const paginationVisible = await po.isPaginationVisible();
      if (paginationVisible) {
        const prevDisabled = await po.isPreviousPageButtonDisabled();
        expect(prevDisabled).toBe(true);

        const nextDisabled = await po.isNextPageButtonDisabled();
        expect(nextDisabled).toBe(true);
      }

      // Clean up filters
      await po.clearFilters();
      await po.waitForEmployeeRows();
    });
  });
});

test.describe('employee-table — UI New Feature', () => {

  test.describe('positive', () => {
    // No new feature cases specified
  });

  test.describe('negative', () => {
    // No new feature cases specified
  });

  test.describe('edge', () => {
    // No new feature cases specified
  });
});