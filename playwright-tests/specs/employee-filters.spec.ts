import { test, expect } from '@playwright/test';
import { EmployeeFiltersPage } from '../pages/employee-filters.page';

test.describe('employee-filters — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-25aead61-fbbd-5711-caa6-8677f1d15100  SCOPE:regression
    test('[UI] employee-filters: Department dropdown filters table rows to matching department', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      // Step 1: Verify table is visible with at least one row
      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThan(0);

      // Step 2: Verify department filter is visible
      const deptFilterVisible = await po.isDepartmentFilterVisible();
      expect(deptFilterVisible).toBe(true);

      // Step 3: Get department options and verify at least two named departments plus default
      const deptOptions = await po.getDepartmentFilterOptions();
      expect(deptOptions.length).toBeGreaterThanOrEqual(3); // default + at least 2 departments

      // Step 4: Select the first non-default department option (e.g. "Engineering")
      const selectedDepartment = deptOptions[1]; // first named department
      await po.filterByDepartment(selectedDepartment);

      // Step 5: Verify every visible row shows the selected department
      const visibleDepartments = await po.getAllVisibleDepartments();
      for (const dept of visibleDepartments) {
        expect(dept).toBe(selectedDepartment);
      }

      // Step 6: Verify filtered row count is <= unfiltered count
      const filteredRowCount = await po.getEmployeeRowCount();
      expect(filteredRowCount).toBeLessThanOrEqual(initialRowCount);
      expect(filteredRowCount).toBeGreaterThan(0);

      // Verify the selected value in the dropdown
      const selectedValue = await po.getSelectedDepartmentFilter();
      expect(selectedValue).toBe(selectedDepartment);

      // Step 7: Reset department filter and verify full list is restored
      await po.resetDepartmentFilter();
      const restoredRowCount = await po.getEmployeeRowCount();
      expect(restoredRowCount).toBe(initialRowCount);
    });

  });

  test.describe('negative', () => {

    // TC-7f21f24a-3135-5eaf-e74c-63910b4d2e03  SCOPE:regression
    test('[UI] employee-filters: Combining Department and Status dropdowns shows only matching employees, empty state shown when no results', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      // Step 1: Verify table loads with at least one row
      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThan(0);

      // Step 2: Verify both filter dropdowns are visible and set to defaults
      const deptFilterVisible = await po.isDepartmentFilterVisible();
      expect(deptFilterVisible).toBe(true);
      const statusFilterVisible = await po.isStatusFilterVisible();
      expect(statusFilterVisible).toBe(true);

      const defaultDept = await po.getSelectedDepartmentFilter();
      expect(defaultDept).toBe('');
      const defaultStatus = await po.getSelectedStatusFilter();
      expect(defaultStatus).toBe('');

      // Step 3: Filter by Status = Active
      await po.filterByStatus('Active');
      const activeStatuses = await po.getAllVisibleStatuses();
      for (const status of activeStatuses) {
        expect(status).toBe('Active');
      }
      const activeRowCount = await po.getEmployeeRowCount();
      expect(activeRowCount).toBeGreaterThan(0);

      // Step 4: While Status=Active, also filter by a department visible in current results
      const visibleDepts = await po.getAllVisibleDepartments();
      expect(visibleDepts.length).toBeGreaterThan(0);
      const chosenDepartment = visibleDepts[0];
      await po.filterByDepartment(chosenDepartment);

      // Step 5: Verify every visible row matches both filters
      const combinedDepts = await po.getAllVisibleDepartments();
      const combinedStatuses = await po.getAllVisibleStatuses();
      const combinedRowCount = await po.getEmployeeRowCount();
      expect(combinedRowCount).toBeGreaterThan(0);

      for (const dept of combinedDepts) {
        expect(dept).toBe(chosenDepartment);
      }
      for (const status of combinedStatuses) {
        expect(status).toBe('Active');
      }

      // Step 6: Change status to Terminated while keeping the same department
      // This may yield zero results if no employees in that department are Terminated
      await po.filterByStatus('Terminated');

      const terminatedRowCount = await po.getEmployeeRowCount();

      // Step 7: If zero results, verify empty state is shown
      if (terminatedRowCount === 0) {
        const emptyVisible = await po.isEmptyStateVisible();
        expect(emptyVisible).toBe(true);
      } else {
        // If there are results, they must all match both filters
        const termDepts = await po.getAllVisibleDepartments();
        const termStatuses = await po.getAllVisibleStatuses();
        for (const dept of termDepts) {
          expect(dept).toBe(chosenDepartment);
        }
        for (const status of termStatuses) {
          expect(status).toBe('Terminated');
        }
      }

      // Step 8: Reset both filters and verify full list is restored
      await po.resetDepartmentFilter();
      await po.resetStatusFilter();
      const restoredRowCount = await po.getEmployeeRowCount();
      expect(restoredRowCount).toBe(initialRowCount);
    });

  });

  test.describe('edge', () => {

    // TC-edge-001  SCOPE:regression
    test('[UI] employee-filters: Rapidly switching department filter values updates table correctly', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      const deptOptions = await po.getDepartmentFilterOptions();
      expect(deptOptions.length).toBeGreaterThanOrEqual(3);

      // Rapidly switch between multiple departments
      await po.filterByDepartment(deptOptions[1]);
      await po.filterByDepartment(deptOptions[2]);
      await po.filterByDepartment(deptOptions[3]);

      // Verify the final filter is applied correctly
      const finalSelectedDept = await po.getSelectedDepartmentFilter();
      expect(finalSelectedDept).toBe(deptOptions[3]);

      const visibleDepts = await po.getAllVisibleDepartments();
      const rowCount = await po.getEmployeeRowCount();

      if (rowCount > 0) {
        for (const dept of visibleDepts) {
          expect(dept).toBe(deptOptions[3]);
        }
      } else {
        const emptyVisible = await po.isEmptyStateVisible();
        expect(emptyVisible).toBe(true);
      }
    });

    // TC-edge-002  SCOPE:regression
    test('[UI] employee-filters: Resetting one filter while the other remains active preserves the remaining filter', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      // Apply both filters
      await po.filterByDepartment('Engineering');
      await po.filterByStatus('Active');

      // Verify combined filters work
      const combinedDepts = await po.getAllVisibleDepartments();
      const combinedStatuses = await po.getAllVisibleStatuses();
      for (const dept of combinedDepts) {
        expect(dept).toBe('Engineering');
      }
      for (const status of combinedStatuses) {
        expect(status).toBe('Active');
      }

      // Reset only department filter
      await po.resetDepartmentFilter();

      // Status filter should still be active
      const selectedStatus = await po.getSelectedStatusFilter();
      expect(selectedStatus).toBe('Active');

      const statusesAfterDeptReset = await po.getAllVisibleStatuses();
      for (const status of statusesAfterDeptReset) {
        expect(status).toBe('Active');
      }

      // Department should now show mixed departments (not just Engineering)
      const selectedDept = await po.getSelectedDepartmentFilter();
      expect(selectedDept).toBe('');

      // Reset status filter too
      await po.resetStatusFilter();
      const finalSelectedStatus = await po.getSelectedStatusFilter();
      expect(finalSelectedStatus).toBe('');
    });

  });

});