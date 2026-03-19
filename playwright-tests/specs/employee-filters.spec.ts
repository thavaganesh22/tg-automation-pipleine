import { test, expect } from '@playwright/test';
import { EmployeeFiltersPage } from '../pages/employee-filters.page';

test.describe('employee-filters — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-25aead61-fbbd-5711-caa6-8677f1d15100  SCOPE:regression
    test('[UI] employee-filters: Department dropdown filters table rows to matching department', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      // Step 2: Verify department filter is visible and capture unfiltered row count
      const deptFilterVisible = await po.isDepartmentFilterVisible();
      expect(deptFilterVisible).toBe(true);

      const unfilteredRowCount = await po.getEmployeeRowCount();
      expect(unfilteredRowCount).toBeGreaterThan(0);

      // Step 3: Inspect available department options
      const deptOptions = await po.getDepartmentFilterOptions();
      expect(deptOptions.length).toBeGreaterThanOrEqual(3); // default + at least 2 departments

      // Step 4: Select the first non-default department option (e.g. "Engineering")
      const selectedDept = deptOptions[1]; // first named department after the default
      await po.selectDepartmentFilter(selectedDept);

      // Step 5: Verify every visible row shows the selected department
      const visibleDepartments = await po.getAllVisibleDepartments();
      const filteredRowCount = await po.getEmployeeRowCount();

      if (filteredRowCount > 0) {
        for (const dept of visibleDepartments) {
          expect(dept).toBe(selectedDept);
        }
      }

      // Step 6: Filtered row count should be <= unfiltered count
      expect(filteredRowCount).toBeLessThanOrEqual(unfilteredRowCount);

      // Step 7: Reset department filter and verify full list is restored
      await po.resetDepartmentFilter();

      const restoredRowCount = await po.getEmployeeRowCount();
      expect(restoredRowCount).toBe(unfilteredRowCount);
    });

  });

  test.describe('negative', () => {

    // TC-7f21f24a-3135-5eaf-e74c-63910b4d2e03  SCOPE:regression
    test('[UI] employee-filters: Combining Department and Status dropdowns shows only matching employees, empty state shown when no results', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      // Step 2: Verify both filters are visible and at defaults
      const deptFilterVisible = await po.isDepartmentFilterVisible();
      expect(deptFilterVisible).toBe(true);

      const statusFilterVisible = await po.isStatusFilterVisible();
      expect(statusFilterVisible).toBe(true);

      const defaultDept = await po.getSelectedDepartmentFilter();
      expect(defaultDept).toBe('');

      const defaultStatus = await po.getSelectedStatusFilter();
      expect(defaultStatus).toBe('');

      const unfilteredRowCount = await po.getEmployeeRowCount();
      expect(unfilteredRowCount).toBeGreaterThan(0);

      // Step 3: Select Status = "Active"
      await po.selectStatusFilter('Active');

      const activeStatuses = await po.getAllVisibleStatuses();
      const activeRowCount = await po.getEmployeeRowCount();

      if (activeRowCount > 0) {
        for (const status of activeStatuses) {
          expect(status).toBe('Active');
        }
      }

      // Step 4: While Status is "Active", select a department visible in current results
      const visibleDepts = await po.getAllVisibleDepartments();
      expect(visibleDepts.length).toBeGreaterThan(0);
      const chosenDept = visibleDepts[0];

      await po.selectDepartmentFilter(chosenDept);

      // Step 5: Verify every visible row matches both filters
      const combinedDepts = await po.getAllVisibleDepartments();
      const combinedStatuses = await po.getAllVisibleStatuses();
      const combinedRowCount = await po.getEmployeeRowCount();

      if (combinedRowCount > 0) {
        for (const dept of combinedDepts) {
          expect(dept).toBe(chosenDept);
        }
        for (const status of combinedStatuses) {
          expect(status).toBe('Active');
        }
      }

      // Step 6: Change Status to "Terminated" — this may yield zero results for the chosen department
      // The app does not have "Inactive" — use "Terminated" which is a valid status option
      await po.selectStatusFilter('Terminated');

      const terminatedRowCount = await po.getEmployeeRowCount();
      const terminatedDepts = await po.getAllVisibleDepartments();
      const terminatedStatuses = await po.getAllVisibleStatuses();

      // If there are results, they must all match both filters
      if (terminatedRowCount > 0) {
        for (const dept of terminatedDepts) {
          expect(dept).toBe(chosenDept);
        }
        for (const status of terminatedStatuses) {
          expect(status).toBe('Terminated');
        }
      }

      // If no results, try "On Leave" to find a combination that yields empty state
      if (terminatedRowCount > 0) {
        await po.selectStatusFilter('On Leave');
        const onLeaveRowCount = await po.getEmployeeRowCount();

        if (onLeaveRowCount === 0) {
          // Step 7: Confirm empty state is displayed
          const emptyVisible = await po.isEmptyStateVisible();
          expect(emptyVisible).toBe(true);
        }
      } else {
        // Step 7: Confirm empty state is displayed when Terminated yields 0 rows
        const emptyVisible = await po.isEmptyStateVisible();
        expect(emptyVisible).toBe(true);
      }

      // Step 8: Reset both filters and verify full list is restored
      await po.resetDepartmentFilter();
      await po.resetStatusFilter();

      const restoredRowCount = await po.getEmployeeRowCount();
      expect(restoredRowCount).toBe(unfilteredRowCount);
    });

  });

  test.describe('edge', () => {

    test('Department filter options match expected list', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      const options = await po.getDepartmentFilterOptions();
      const expectedDepartments = [
        'Engineering', 'Product', 'Design', 'QA', 'DevOps', 'Data',
        'Marketing', 'Sales', 'HR', 'Finance', 'Legal', 'Operations', 'Other'
      ];

      // First option is the default "All departments" placeholder
      for (const dept of expectedDepartments) {
        expect(options).toContain(dept);
      }
    });

    test('Status filter options match expected list', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      const options = await po.getStatusFilterOptions();
      const expectedStatuses = ['Active', 'On Leave', 'Terminated'];

      for (const status of expectedStatuses) {
        expect(options).toContain(status);
      }
    });

    test('Selecting each department filter individually shows only matching rows', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      const departments = ['Engineering', 'Design', 'QA'];

      for (const dept of departments) {
        await po.selectDepartmentFilter(dept);

        const rowCount = await po.getEmployeeRowCount();
        const visibleDepts = await po.getAllVisibleDepartments();

        if (rowCount > 0) {
          for (const d of visibleDepts) {
            expect(d).toBe(dept);
          }
        } else {
          const emptyVisible = await po.isEmptyStateVisible();
          expect(emptyVisible).toBe(true);
        }
      }

      // Reset after iteration
      await po.resetDepartmentFilter();
      const finalCount = await po.getEmployeeRowCount();
      expect(finalCount).toBeGreaterThan(0);
    });

    test('Selecting each status filter individually shows only matching rows', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      const statuses = ['Active', 'On Leave', 'Terminated'];

      for (const status of statuses) {
        await po.selectStatusFilter(status);

        const rowCount = await po.getEmployeeRowCount();
        const visibleStatuses = await po.getAllVisibleStatuses();

        if (rowCount > 0) {
          for (const s of visibleStatuses) {
            expect(s).toBe(status);
          }
        } else {
          const emptyVisible = await po.isEmptyStateVisible();
          expect(emptyVisible).toBe(true);
        }
      }

      // Reset after iteration
      await po.resetStatusFilter();
      const finalCount = await po.getEmployeeRowCount();
      expect(finalCount).toBeGreaterThan(0);
    });

    test('Resetting department filter while status filter is active preserves status filter', async ({ page }) => {
      const po = new EmployeeFiltersPage(page);
      await po.navigate();

      // Apply both filters
      await po.selectStatusFilter('Active');
      await po.selectDepartmentFilter('Engineering');

      // Verify combined filter works
      const combinedCount = await po.getEmployeeRowCount();
      const combinedStatuses = await po.getAllVisibleStatuses();
      if (combinedCount > 0) {
        for (const s of combinedStatuses) {
          expect(s).toBe('Active');
        }
      }

      // Reset only department filter
      await po.resetDepartmentFilter();

      // Status filter should still be active
      const selectedStatus = await po.getSelectedStatusFilter();
      expect(selectedStatus).toBe('Active');

      const statusOnlyStatuses = await po.getAllVisibleStatuses();
      const statusOnlyCount = await po.getEmployeeRowCount();
      if (statusOnlyCount > 0) {
        for (const s of statusOnlyStatuses) {
          expect(s).toBe('Active');
        }
      }

      // Row count after resetting dept should be >= combined count
      expect(statusOnlyCount).toBeGreaterThanOrEqual(combinedCount);

      // Clean up
      await po.resetStatusFilter();
    });

  });

});