import { test, expect } from '@playwright/test';
import { EmployeePaginationPage } from '../pages/employee-pagination.page';

test.describe('employee-pagination — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-a4c91f7a-6fa1-5b1c-b5b0-960e33223a86  SCOPE:regression
    test('[UI] employee-pagination: Clicking next page loads the second page of employees', async ({ page }) => {
      const po = new EmployeePaginationPage(page);
      await po.navigate();

      // Step 1: Verify table is visible with employees on page 1
      const page1RowCount = await po.getEmployeeRowCount();
      expect(page1RowCount).toBeGreaterThan(0);

      // Step 2: Record employee names on page 1
      const page1Names = await po.getEmployeeNamesOnPage();
      expect(page1Names.length).toBeGreaterThan(0);

      // Verify we are on page 1
      const currentPageBefore = await po.getCurrentPageFromIndicator();
      expect(currentPageBefore).toBe(1);

      // Step 3: Verify next page button is enabled (multiple pages exist)
      const nextEnabled = await po.isNextPageButtonEnabled();
      expect(nextEnabled).toBe(true);

      // Verify pagination is visible
      const paginationVisible = await po.isPaginationVisible();
      expect(paginationVisible).toBe(true);

      // Step 4: Click next page button
      await po.goToNextPage();

      // Step 5: Verify page indicator now shows page 2
      const currentPageAfter = await po.getCurrentPageFromIndicator();
      expect(currentPageAfter).toBe(2);

      // Step 6: Verify page 2 employees are different from page 1
      const page2Names = await po.getEmployeeNamesOnPage();
      expect(page2Names.length).toBeGreaterThan(0);

      // Ensure no overlap between page 1 and page 2 names
      const overlap = page2Names.filter(name => page1Names.includes(name));
      expect(overlap.length).toBe(0);

      // Step 7: Verify previous button is now enabled on page 2
      const prevEnabled = await po.isPrevPageButtonEnabled();
      expect(prevEnabled).toBe(true);

      // Step 8: Click previous to go back to page 1 and verify same employees
      await po.goToPrevPage();

      const backToPage1 = await po.getCurrentPageFromIndicator();
      expect(backToPage1).toBe(1);

      const page1NamesAgain = await po.getEmployeeNamesOnPage();
      expect(page1NamesAgain).toEqual(page1Names);
    });

  });

  test.describe('edge', () => {

    // TC-e650c350-3d4e-5f1e-f485-13c251103578  SCOPE:regression
    test('[UI] employee-pagination: Previous button is disabled on the first page and next button is disabled on the last page', async ({ page }) => {
      const po = new EmployeePaginationPage(page);
      await po.navigate();

      // Step 1: Verify table loads on page 1
      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThan(0);

      const currentPage = await po.getCurrentPageFromIndicator();
      expect(currentPage).toBe(1);

      // Step 2: Verify previous button is disabled on page 1
      const prevDisabledOnFirst = await po.isPrevPageButtonEnabled();
      expect(prevDisabledOnFirst).toBe(false);

      // Step 3: Attempt to click disabled previous button — nothing should happen
      await po.clickPrevPageButtonWhileDisabled();
      const stillPage1 = await po.getCurrentPageFromIndicator();
      expect(stillPage1).toBe(1);

      // Step 4: Determine total pages
      const totalPages = await po.getTotalPagesFromIndicator();
      expect(totalPages).toBeGreaterThan(1);

      // Step 5: Navigate to the last page
      await po.navigateToLastPage();

      // Verify we are on the last page
      const lastPage = await po.getCurrentPageFromIndicator();
      expect(lastPage).toBe(totalPages);

      // Step 6: Verify next button is disabled on the last page
      const nextDisabledOnLast = await po.isNextPageButtonEnabled();
      expect(nextDisabledOnLast).toBe(false);

      // Step 7: Attempt to click disabled next button — nothing should happen
      await po.clickNextPageButtonWhileDisabled();
      const stillLastPage = await po.getCurrentPageFromIndicator();
      expect(stillLastPage).toBe(totalPages);

      // Step 8: Verify previous button is enabled on the last page
      const prevEnabledOnLast = await po.isPrevPageButtonEnabled();
      expect(prevEnabledOnLast).toBe(true);
    });

  });

});