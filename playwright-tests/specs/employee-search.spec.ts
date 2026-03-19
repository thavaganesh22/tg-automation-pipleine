import { test, expect } from '@playwright/test';
import { EmployeeSearchPage } from '../pages/employee-search.page';

test.describe('employee-search — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-061ddd3c-015b-5c9e-7dea-a8f50b9d5eb0  SCOPE:regression
    test('[UI] employee-search: Typing a valid name filters the employee list', async ({ page }) => {
      const po = new EmployeeSearchPage(page);
      await po.navigate();

      // Step 1: Verify the employee list is visible with at least one row
      await page.waitForSelector('[data-testid^="employee-row-"]');
      const initialRowCount = await page.locator('[data-testid^="employee-row-"]').count();
      expect(initialRowCount).toBeGreaterThan(0);

      // Step 2: Verify search input is visible
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);

      // Step 3: Record baseline row count (already captured above)
      const baselineCount = initialRowCount;

      // Step 4: Retrieve the first employee's name dynamically
      const firstEmployeeName = await po.getFirstEmployeeName();
      expect(firstEmployeeName.length).toBeGreaterThan(0);

      // Step 5: Search by the employee's first name.
      // The backend uses MongoDB $text search (full-word matching), so we need a
      // complete word — a 3-char prefix like "Gra" will not match "Grace".
      const searchTerm = firstEmployeeName.split(' ')[0];
      await po.searchEmployees(searchTerm);

      // Step 6 & 7: Wait for debounce and observe filtered results
      // Wait for the network/debounce to settle
      await page.waitForTimeout(1000);
      await page.waitForSelector('[data-testid^="employee-row-"]');
      const filteredRowCount = await page.locator('[data-testid^="employee-row-"]').count();
      expect(filteredRowCount).toBeGreaterThan(0);
      expect(filteredRowCount).toBeLessThanOrEqual(baselineCount);

      // Step 8: Verify that at least one visible employee name contains the search substring
      const visibleNames = await po.getVisibleEmployeeNames();
      const matchingNames = visibleNames.filter(name =>
        name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      expect(matchingNames.length).toBeGreaterThan(0);

      // Step 9: Clear the search input
      await po.clearSearch();

      // Step 10: Verify the search input is empty and full list is restored
      const searchValue = await po.getSearchInputValue();
      expect(searchValue).toBe('');

      await page.waitForTimeout(1000);
      const restoredRowCount = await page.locator('[data-testid^="employee-row-"]').count();
      expect(restoredRowCount).toBeGreaterThanOrEqual(baselineCount);
    });

  });

  test.describe('negative', () => {

    // TC-fa292360-2e1c-55d7-1192-86af4f8c7ac5  SCOPE:regression
    test('[UI] employee-search: Typing a search term that matches no employees shows an empty state', async ({ page }) => {
      const po = new EmployeeSearchPage(page);
      await po.navigate();

      // Step 1: Verify the employee list is visible with at least one row
      await page.waitForSelector('[data-testid^="employee-row-"]');
      const initialRowCount = await page.locator('[data-testid^="employee-row-"]').count();
      expect(initialRowCount).toBeGreaterThan(0);

      // Step 2: Verify search input is visible
      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);

      // Step 3: Type a nonsense string guaranteed to match no employee
      const nonsenseQuery = 'ZZZNOMATCH_xq9';
      await po.searchEmployees(nonsenseQuery);

      // Step 4 & 5: Wait for debounce and verify no rows are rendered
      await page.waitForTimeout(1000);
      const filteredRowCount = await page.locator('[data-testid^="employee-row-"]').count();
      expect(filteredRowCount).toBe(0);

      // Step 6: Check for empty-state message
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

      await page.waitForTimeout(1000);
      await page.waitForSelector('[data-testid^="employee-row-"]');
      const restoredRowCount = await page.locator('[data-testid^="employee-row-"]').count();
      expect(restoredRowCount).toBeGreaterThan(0);
    });

  });

  test.describe('edge', () => {
    // No edge cases specified for this module
  });

});