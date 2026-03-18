import { test, expect } from '@playwright/test';
import { EmployeeSearchPage } from '../pages/employee-search.page';

test.describe('employee-search — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-061ddd3c-015b-5c9e-7dea-a8f50b9d5eb0  SCOPE:regression
    test('[UI] employee-search: Typing a valid name filters the employee list', async ({ page }) => {
      const po = new EmployeeSearchPage(page);
      await po.navigate();

      // Step 1: Verify the employee table is visible with at least one row
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      // Step 2: Verify search input is visible and enabled
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);
      const searchEnabled = await po.isSearchInputEnabled();
      expect(searchEnabled).toBe(true);

      // Step 3: Record baseline row count before searching
      const baselineCount = await po.getEmployeeRowCount();
      expect(baselineCount).toBeGreaterThan(0);

      // Step 4: Retrieve the first employee's name dynamically
      const firstEmployeeName = await po.getFirstEmployeeName();
      expect(firstEmployeeName.length).toBeGreaterThan(0);

      // Step 5: Use the first word of the employee's name (backend uses MongoDB $text — full words only)
      const searchTerm = firstEmployeeName.split(' ')[0];
      await po.searchEmployees(searchTerm);

      // Steps 6-7: Wait for debounce and verify filtered results
      // searchEmployees should handle the debounce wait internally
      const filteredCount = await po.getEmployeeRowCount();
      expect(filteredCount).toBeGreaterThan(0);
      expect(filteredCount).toBeLessThanOrEqual(baselineCount);

      // Step 8: Verify at least one visible employee name contains the search term
      const nameTexts = await po.getEmployeeNameTexts();
      const anyMatch = nameTexts.some(name => name.toLowerCase().includes(searchTerm.toLowerCase()));
      expect(anyMatch).toBe(true);

      // Step 9: Clear the search input
      await po.clearSearch();

      // Step 10: Verify the search input is empty and full list is restored
      const searchValue = await po.getSearchInputValue();
      expect(searchValue).toBe('');

      const restoredCount = await po.getEmployeeRowCount();
      expect(restoredCount).toBeGreaterThanOrEqual(baselineCount);
    });

  });

  test.describe('negative', () => {

    // TC-fa292360-2e1c-55d7-1192-86af4f8c7ac5  SCOPE:regression
    test('[UI] employee-search: Typing a search term that matches no employees shows an empty state', async ({ page }) => {
      const po = new EmployeeSearchPage(page);
      await po.navigate();

      // Step 1: Verify the employee table is visible with at least one row
      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      // Step 2: Verify search input is visible and enabled
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);
      const searchEnabled = await po.isSearchInputEnabled();
      expect(searchEnabled).toBe(true);

      const initialCount = await po.getEmployeeRowCount();
      expect(initialCount).toBeGreaterThan(0);

      // Step 3: Type a nonsense string guaranteed to match no employee
      const nonsenseQuery = 'ZZZNOMATCH_xq9';
      await po.searchEmployees(nonsenseQuery);

      // Step 4-5: Wait for debounce and verify zero rows
      const filteredCount = await po.getEmployeeRowCount();
      expect(filteredCount).toBe(0);

      // Step 6: Verify empty state message is displayed
      const emptyStateVisible = await po.isEmptyStateVisible();
      expect(emptyStateVisible).toBe(true);

      const emptyStateText = await po.getEmptyStateText();
      expect(emptyStateText.toLowerCase()).toMatch(/no\s.*(found|results|employees)/);

      // Step 7: Verify no error banner is shown
      const errorVisible = await po.isErrorBannerVisible();
      expect(errorVisible).toBe(false);

      // Step 8: Clear the search input
      await po.clearSearch();

      // Step 9: Verify the full list is restored
      const searchValue = await po.getSearchInputValue();
      expect(searchValue).toBe('');

      const restoredCount = await po.getEmployeeRowCount();
      expect(restoredCount).toBeGreaterThan(0);
      expect(restoredCount).toBeGreaterThanOrEqual(initialCount);
    });

  });

  test.describe('edge', () => {
    // No edge cases specified for this module
  });

});