import { test, expect } from '@playwright/test';
import { EmployeesPagePage } from '../pages/employees-page.page';
import { setupEmployeesPageMocks, setupEmptyEmployeesPageMocks, setupSingleEmployeePageMocks } from '../fixtures/employees-page.fixture';

test.describe('employees-page — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-9b642b3d-b708-45f5-946f-8517a751c8dc  SCOPE:regression
    test('Table loads and displays seeded employee rows with name, department, and status columns', async ({ page }) => {
      await setupEmployeesPageMocks(page);
      const po = new EmployeesPagePage(page);

      await po.navigateToEmployeesPage();
      await po.waitForTableToLoad();

      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const headers = await po.getTableHeaderTexts();
      const headersLower = headers.map(h => h.toLowerCase());
      expect(headersLower).toContain('employee');
      expect(headersLower).toContain('department');
      expect(headersLower).toContain('status');

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(3);

      const firstName = await po.getEmployeeNameByIndex(0);
      expect(firstName).toBeTruthy();

      const firstDept = await po.getEmployeeDepartmentByIndex(0);
      expect(firstDept).toBeTruthy();

      const secondName = await po.getEmployeeNameByIndex(1);
      expect(secondName).toBeTruthy();

      const secondDept = await po.getEmployeeDepartmentByIndex(1);
      expect(secondDept).toBeTruthy();

      expect(firstName).not.toBe(secondName);
    });

    // TC-c9626199-191b-41c9-9d42-168d225d385c  SCOPE:regression
    test('Search by employee name filters table to matching results', async ({ page }) => {
      await setupEmployeesPageMocks(page);
      const po = new EmployeesPagePage(page);

      await po.navigateToEmployeesPage();
      await po.waitForTableToLoad();

      const searchVisible = await po.isSearchInputVisible();
      expect(searchVisible).toBe(true);

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(5);

      await po.searchEmployeeByName('James');
      await po.waitForTableUpdate();

      const filteredNames = await po.getAllEmployeeNames();
      for (const name of filteredNames) {
        expect(name.toLowerCase()).toContain('james');
      }

      const filteredCount = await po.getEmployeeRowCount();
      expect(filteredCount).toBeGreaterThanOrEqual(1);
      expect(filteredCount).toBeLessThanOrEqual(initialRowCount);

      await po.clearSearchInput();
      await po.waitForTableUpdate();

      const restoredCount = await po.getEmployeeRowCount();
      expect(restoredCount).toBe(initialRowCount);
    });

    // TC-b3823052-d9f6-4478-ba12-629b354371d3  SCOPE:regression
    test('Selecting a department filter updates the employee list to show only matching employees', async ({ page }) => {
      await setupEmployeesPageMocks(page);
      const po = new EmployeesPagePage(page);

      await po.navigateToEmployeesPage();
      await po.waitForTableToLoad();

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(3);

      const departmentOptions = await po.getDepartmentFilterOptions();
      expect(departmentOptions.length).toBeGreaterThanOrEqual(1);

      await po.filterByDepartmentValue('Engineering');
      await po.waitForTableUpdate();

      const selectedDept = await po.getDepartmentFilterValue();
      expect(selectedDept).toBe('Engineering');

      const filteredDepartments = await po.getAllEmployeeDepartments();
      for (const dept of filteredDepartments) {
        expect(dept).toBe('Engineering');
      }

      const filteredCount = await po.getEmployeeRowCount();
      expect(filteredCount).toBeGreaterThanOrEqual(1);

      await po.resetDepartmentFilter();
      await po.waitForTableUpdate();

      const restoredCount = await po.getEmployeeRowCount();
      expect(restoredCount).toBe(initialRowCount);
    });

  });

  test.describe('negative', () => {

    // TC-16599658-79d1-4670-8bf4-0d6548ba6786  SCOPE:regression
    test('Table displays empty state when no employees exist', async ({ page }) => {
      await setupEmptyEmployeesPageMocks(page);
      const po = new EmployeesPagePage(page);

      await po.navigateToEmployeesPage();
      await po.waitForTableToLoad();

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBe(0);

      const emptyVisible = await po.isEmptyStateVisible();
      expect(emptyVisible).toBe(true);

      const emptyText = await po.getEmptyStateText();
      expect(emptyText.toLowerCase()).toContain('no employees');

      const headers = await po.getTableHeaderTexts();
      const headersLower = headers.map(h => h.toLowerCase());
      expect(headersLower).toContain('employee');
      expect(headersLower).toContain('department');
      expect(headersLower).toContain('status');
    });

    // TC-d55ed9a6-4860-421b-bddc-f61a10f2f90e  SCOPE:regression
    test('Search with no matching results displays empty state', async ({ page }) => {
      await setupEmployeesPageMocks(page);
      const po = new EmployeesPagePage(page);

      await po.navigateToEmployeesPage();
      await po.waitForTableToLoad();

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(1);

      await po.searchEmployeeByName('ZZZNONEXISTENT999');
      await po.waitForTableUpdate();

      const searchValue = await po.getSearchInputValue();
      expect(searchValue).toBe('ZZZNONEXISTENT999');

      const filteredCount = await po.getEmployeeRowCount();
      expect(filteredCount).toBe(0);

      const emptyVisible = await po.isEmptyStateVisible();
      expect(emptyVisible).toBe(true);

      const headers = await po.getTableHeaderTexts();
      const headersLower = headers.map(h => h.toLowerCase());
      expect(headersLower).toContain('employee');
      expect(headersLower).toContain('department');
    });

    // TC-79d078d8-d56c-4131-a1f2-d7f982ddaf29  SCOPE:regression
    test('Selecting a status filter with no matching employees shows an empty state', async ({ page }) => {
      await setupEmployeesPageMocks(page);
      const po = new EmployeesPagePage(page);

      await po.navigateToEmployeesPage();
      await po.waitForTableToLoad();

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(1);

      const statusOptions = await po.getStatusFilterOptions();
      expect(statusOptions.length).toBeGreaterThanOrEqual(1);

      await po.filterByStatusValue('On Leave');
      await po.waitForTableUpdate();

      const selectedStatus = await po.getStatusFilterValue();
      expect(selectedStatus).toBe('On Leave');

      const filteredCount = await po.getEmployeeRowCount();
      expect(filteredCount).toBe(0);

      const emptyVisible = await po.isEmptyStateVisible();
      expect(emptyVisible).toBe(true);
    });

  });

  test.describe('edge', () => {

    // TC-8f3a8653-135a-4694-ac1d-8c1055407b05  SCOPE:regression
    test('Table correctly renders a single employee (boundary — minimum data set)', async ({ page }) => {
      await setupSingleEmployeePageMocks(page);
      const po = new EmployeesPagePage(page);

      await po.navigateToEmployeesPage();
      await po.waitForTableToLoad();

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBe(1);

      const name = await po.getEmployeeNameByIndex(0);
      expect(name).toBeTruthy();

      const department = await po.getEmployeeDepartmentByIndex(0);
      expect(department).toBeTruthy();

      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      const emptyVisible = await po.isEmptyStateVisible();
      expect(emptyVisible).toBe(false);
    });

    // TC-e510456a-de04-4d16-ab30-877f41f5144d  SCOPE:regression
    test('Search with a single character filters progressively and handles whitespace-only input', async ({ page }) => {
      await setupEmployeesPageMocks(page);
      const po = new EmployeesPagePage(page);

      await po.navigateToEmployeesPage();
      await po.waitForTableToLoad();

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(1);

      await po.searchEmployeeByName('a');
      await po.waitForTableUpdate();

      const singleCharCount = await po.getEmployeeRowCount();
      expect(singleCharCount).toBeGreaterThanOrEqual(0);
      expect(singleCharCount).toBeLessThanOrEqual(initialRowCount);

      await po.clearSearchInput();
      await po.searchEmployeeByName('   ');
      await po.waitForTableUpdate();

      const whitespaceCount = await po.getEmployeeRowCount();
      expect(whitespaceCount).toBeGreaterThanOrEqual(0);

      const tableVisible = await po.isEmployeeTableVisible();
      expect(tableVisible).toBe(true);

      await po.clearSearchInput();
      await po.waitForTableUpdate();

      const restoredCount = await po.getEmployeeRowCount();
      expect(restoredCount).toBe(initialRowCount);

      await po.searchEmployeeByName('sMi');
      await po.waitForTableUpdate();

      const caseInsensitiveNames = await po.getAllEmployeeNames();
      for (const empName of caseInsensitiveNames) {
        expect(empName.toLowerCase()).toContain('smi');
      }
    });

    // TC-f94faba1-881b-4cfb-ab00-1c9c4103f90a  SCOPE:regression
    test('Combining department and status filters narrows results by both criteria simultaneously', async ({ page }) => {
      await setupEmployeesPageMocks(page);
      const po = new EmployeesPagePage(page);

      await po.navigateToEmployeesPage();
      await po.waitForTableToLoad();

      const initialRowCount = await po.getEmployeeRowCount();
      expect(initialRowCount).toBeGreaterThanOrEqual(5);

      await po.filterByDepartmentValue('Engineering');
      await po.waitForTableUpdate();

      const deptOnlyCount = await po.getEmployeeRowCount();
      expect(deptOnlyCount).toBeGreaterThanOrEqual(2);

      const deptFilteredDepartments = await po.getAllEmployeeDepartments();
      for (const dept of deptFilteredDepartments) {
        expect(dept).toBe('Engineering');
      }

      await po.filterByStatusValue('Active');
      await po.waitForTableUpdate();

      const combinedCount = await po.getEmployeeRowCount();
      expect(combinedCount).toBeGreaterThanOrEqual(1);
      expect(combinedCount).toBeLessThanOrEqual(deptOnlyCount);

      const combinedDepartments = await po.getAllEmployeeDepartments();
      for (const dept of combinedDepartments) {
        expect(dept).toBe('Engineering');
      }

      await po.resetStatusFilter();
      await po.waitForTableUpdate();

      const afterStatusResetCount = await po.getEmployeeRowCount();
      expect(afterStatusResetCount).toBe(deptOnlyCount);

      await po.resetDepartmentFilter();
      await po.waitForTableUpdate();

      const fullyRestoredCount = await po.getEmployeeRowCount();
      expect(fullyRestoredCount).toBe(initialRowCount);
    });

  });

});

test.describe('employees-page — UI New Feature', () => {

  test.describe('positive', () => {
    // No new feature positive cases defined
  });

  test.describe('negative', () => {
    // No new feature negative cases defined
  });

  test.describe('edge', () => {
    // No new feature edge cases defined
  });

});