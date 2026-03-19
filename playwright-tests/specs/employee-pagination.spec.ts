import { test, expect } from '@playwright/test';
import { EmployeePaginationPage } from '../pages/employee-pagination.page';

test.describe('employee-pagination — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-a4c91f7a-6fa1-5b1c-b5b0-960e33223a86  SCOPE:regression
    test('Clicking next page loads the second page of employees', async ({ page }) => {
      const po = new EmployeePaginationPage(page);
      await po.navigate();

      // Step 1: Verify table is visible with employees on page 1
      const page1RowCount = await po.getEmployeeRowCount();
      expect(page1RowCount).toBeGreaterThan(0);

      // Step 2: Record the names of employees on page 1
      const page1Names = await po.getVisibleEmployeeNames();
      expect(page1Names.length).toBeGreaterThan(0);

      // Step 2 continued: Verify we are on page 1
      const currentPage = await po.getCurrentPageNumber();
      expect(currentPage).toBe(1);

      // Step 3: Verify the Next button is enabled
      const nextEnabled = await po.isNextPageButtonEnabled();
      expect(nextEnabled).toBe(true);

      // Step 4: Click the Next page button
      await po.goToNextPage();

      // Step 5: Verify the page indicator now shows page 2
      const pageAfterNext = await po.getCurrentPageNumber();
      expect(pageAfterNext).toBe(2);

      // Step 6: Verify that page 2 employees are different from page 1
      const page2Names = await po.getVisibleEmployeeNames();
      expect(page2Names.length).toBeGreaterThan(0);

      // Ensure no overlap between page 1 and page 2 names
      const overlap = page2Names.filter(name => page1Names.includes(name));
      expect(overlap.length).toBe(0);

      // Step 7: Verify the Previous button is now enabled
      const prevEnabled = await po.isPrevPageButtonEnabled();
      expect(prevEnabled).toBe(true);

      // Step 8: Click Previous and verify we're back to page 1 with the same employees
      await po.goToPrevPage();

      const pageAfterPrev = await po.getCurrentPageNumber();
      expect(pageAfterPrev).toBe(1);

      const page1NamesAgain = await po.getVisibleEmployeeNames();
      expect(page1NamesAgain).toEqual(page1Names);
    });
  });

  test.describe('negative', () => {
    // No negative regression cases for this module
  });

  test.describe('edge', () => {

    // TC-e650c350-3d4e-5f1e-f485-13c251103578  SCOPE:regression
    test('Previous button is disabled on the first page and next button is disabled on the last page', async ({ page }) => {
      const po = new EmployeePaginationPage(page);
      await po.navigate();

      // Step 1: Verify the employee table is visible on page 1
      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThan(0);

      const currentPage = await po.getCurrentPageNumber();
      expect(currentPage).toBe(1);

      // Step 2: Verify the Previous button is disabled on page 1
      const prevDisabledOnFirst = await po.isPrevPageButtonEnabled();
      expect(prevDisabledOnFirst).toBe(false);

      // Step 3: Attempt to click the disabled Previous button — nothing should happen
      // The button is disabled, so use force:true to click it without waiting for enabled state
      await page.click('[data-testid="prev-page-btn"]', { force: true });
      const stillPage1 = await po.getCurrentPageNumber();
      expect(stillPage1).toBe(1);

      // Step 4: Determine total page count
      const totalPages = await po.getTotalPageCount();
      expect(totalPages).toBeGreaterThan(1);

      // Step 5: Navigate to the last page
      await po.goToLastPage();

      // Step 6: Verify we are on the last page and Next button is disabled
      const lastPage = await po.getCurrentPageNumber();
      expect(lastPage).toBe(totalPages);

      const nextDisabledOnLast = await po.isNextPageButtonEnabled();
      expect(nextDisabledOnLast).toBe(false);

      // Step 7: Attempt to click the disabled Next button — nothing should happen
      // The button is disabled, so use force:true to click it without waiting for enabled state
      await page.click('[data-testid="next-page-btn"]', { force: true });
      const stillLastPage = await po.getCurrentPageNumber();
      expect(stillLastPage).toBe(totalPages);

      // Step 8: Verify the Previous button is enabled on the last page
      const prevEnabledOnLast = await po.isPrevPageButtonEnabled();
      expect(prevEnabledOnLast).toBe(true);
    });
  });
});