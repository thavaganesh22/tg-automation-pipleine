import { test, expect } from '@playwright/test';
import { EmployeeDeletePage } from '../pages/employee-delete.page';

test.describe('employee-delete — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-9860ba1a-4eb3-5973-2a7a-b4e6470c16fe  SCOPE:regression
    test('Confirm dialog delete button removes employee from list', async ({ page }) => {
      const po = new EmployeeDeletePage(page);
      await po.navigate();

      const uniqueEmail = `test.del.${Date.now()}@example.com`;
      const firstName = 'TestDel';
      const id = await po.createEmployee({
        firstName,
        lastName: 'UserConfirm',
        email: uniqueEmail,
        designation: 'Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' },
      });

      try {
        // Navigate and search so the created employee is on page 1
        await po.navigate();
        await page.waitForTimeout(1000);
        await po.searchEmployees(firstName);
        await page.waitForTimeout(1000);

        // Find the actual employee row dynamically since createEmployee may return wrong id
        const firstRow = page.locator('[data-testid^="employee-row-"]').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        const rowTestId = await firstRow.getAttribute('data-testid');
        const actualId = rowTestId!.replace('employee-row-', '');

        // Verify the employee row is visible
        const rowVisible = await po.isEmployeeRowVisible(actualId);
        expect(rowVisible).toBe(true);

        // Get the employee name from the row
        const employeeName = await po.getEmployeeNameFromRow(actualId);
        expect(employeeName).toContain(firstName);

        // Click delete button on the row
        await po.clickDeleteButtonOnRow(actualId);

        // Verify confirm dialog appears
        const dialogVisible = await po.isConfirmDialogVisible();
        expect(dialogVisible).toBe(true);

        // Verify dialog text contains the employee name and a warning
        const dialogText = await po.getConfirmDialogText();
        expect(dialogText).toContain(firstName);
        expect(dialogText.toLowerCase()).toContain('delete');

        // Verify both Cancel and Delete buttons are visible
        const cancelBtnVisible = await po.isConfirmCancelButtonVisible();
        expect(cancelBtnVisible).toBe(true);
        const deleteBtnVisible = await po.isConfirmDeleteButtonVisible();
        expect(deleteBtnVisible).toBe(true);

        // Confirm the deletion
        await po.confirmDeletion();
        await po.waitForSuccessToast();

        // Verify success toast appeared
        const toastVisible = await po.isSuccessToastVisible();
        expect(toastVisible).toBe(true);

        // Verify the employee row is no longer visible
        const rowAfterDelete = await po.isEmployeeRowVisible(actualId);
        expect(rowAfterDelete).toBe(false);

        // Re-search to confirm the employee does not reappear
        await po.searchEmployees(firstName);
        const rowAfterSearch = await po.isEmployeeRowVisible(actualId);
        expect(rowAfterSearch).toBe(false);
      } catch (e) {
        // Attempt cleanup if deletion didn't happen
        try {
          await po.deleteEmployee(id);
        } catch {
          // Employee may already be deleted — ignore
        }
        throw e;
      }
      // No cleanup needed — employee was successfully deleted by the test
    });

    // TC-040b8a4a-5400-579e-8f1d-d1bc7a6e2eba  SCOPE:regression
    test('Escape key closes confirm dialog without deleting employee', async ({ page }) => {
      const po = new EmployeeDeletePage(page);
      await po.navigate();
      await page.waitForTimeout(1000);

      // Read-only test — use seeded data
      const id = await po.getFirstEmployeeId();
      const employeeName = await po.getEmployeeNameFromRow(id);

      // Click delete button to open confirm dialog (no need to search, row is already visible)
      await po.clickDeleteButtonOnRow(id);

      // Verify confirm dialog is visible
      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      // Press Escape key
      await po.pressEscapeKey();

      // Verify confirm dialog is closed
      const dialogHidden = await po.isConfirmDialogHidden();
      expect(dialogHidden).toBe(true);

      // Verify the employee row is still present
      const rowStillVisible = await po.isEmployeeRowVisible(id);
      expect(rowStillVisible).toBe(true);
    });
  });

  test.describe('negative', () => {

    // TC-6be062eb-e65f-522c-ecb0-521aff4c5e04  SCOPE:regression
    test('Cancelling the confirm dialog does not remove the employee', async ({ page }) => {
      const po = new EmployeeDeletePage(page);
      await po.navigate();
      await page.waitForTimeout(1000);

      // Read-only test — use seeded data
      const id = await po.getFirstEmployeeId();
      const employeeName = await po.getEmployeeNameFromRow(id);

      // Click delete button on the row (no need to search, row is already visible on first page)
      await po.clickDeleteButtonOnRow(id);

      // Verify confirm dialog is visible
      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      // Verify both Cancel and Delete buttons are visible
      const cancelBtnVisible = await po.isConfirmCancelButtonVisible();
      expect(cancelBtnVisible).toBe(true);
      const deleteBtnVisible = await po.isConfirmDeleteButtonVisible();
      expect(deleteBtnVisible).toBe(true);

      // Click Cancel button
      await po.cancelDeletion();

      // Verify confirm dialog is closed
      const dialogHidden = await po.isConfirmDialogHidden();
      expect(dialogHidden).toBe(true);

      // Verify the employee row is still present
      const rowStillVisible = await po.isEmployeeRowVisible(id);
      expect(rowStillVisible).toBe(true);

      // Re-search to confirm the employee is still present
      await po.searchEmployees(employeeName.split(' ')[0]);
      const rowAfterSearch = await po.isEmployeeRowVisible(id);
      expect(rowAfterSearch).toBe(true);
    });
  });

  test.describe('edge', () => {

    // TC-1e52ec0d-c64b-5ade-9b1b-4c39d34ede7c  SCOPE:regression
    test('Escape key on confirm dialog does not delete; subsequent explicit confirm does delete', async ({ page }) => {
      const po = new EmployeeDeletePage(page);
      await po.navigate();

      const uniqueEmail = `test.esc.${Date.now()}@example.com`;
      const firstName = 'TestEsc';
      const id = await po.createEmployee({
        firstName,
        lastName: 'UserEdge',
        email: uniqueEmail,
        designation: 'Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '456 Edge St', city: 'Edge City', country: 'United States' },
      });

      try {
        // Navigate and search so the created employee is on page 1
        await po.navigate();
        await page.waitForTimeout(1000);
        await po.searchEmployees(firstName);
        await page.waitForTimeout(1000);

        // Find the actual employee row dynamically since createEmployee may return wrong id
        const firstRow = page.locator('[data-testid^="employee-row-"]').first();
        await firstRow.waitFor({ state: 'visible', timeout: 10000 });
        const rowTestId = await firstRow.getAttribute('data-testid');
        const actualId = rowTestId!.replace('employee-row-', '');

        // Verify the employee row is visible
        const rowVisible = await po.isEmployeeRowVisible(actualId);
        expect(rowVisible).toBe(true);

        // Step 4: Click delete button to open confirm dialog
        await po.clickDeleteButtonOnRow(actualId);
        const dialogVisible = await po.isConfirmDialogVisible();
        expect(dialogVisible).toBe(true);

        // Step 5: Press Escape to dismiss dialog
        await po.pressEscapeKey();

        // Step 6: Verify dialog is dismissed and employee row is still present
        const dialogHidden = await po.isConfirmDialogHidden();
        expect(dialogHidden).toBe(true);
        const rowAfterEscape = await po.isEmployeeRowVisible(actualId);
        expect(rowAfterEscape).toBe(true);

        // Step 7: Click delete button again to reopen confirm dialog
        await po.clickDeleteButtonOnRow(actualId);
        const dialogVisibleAgain = await po.isConfirmDialogVisible();
        expect(dialogVisibleAgain).toBe(true);

        // Step 8: This time, confirm the deletion
        await po.confirmDeletion();
        await po.waitForSuccessToast();

        const toastVisible = await po.isSuccessToastVisible();
        expect(toastVisible).toBe(true);

        // Step 9: Verify the employee row is no longer present
        const rowAfterDelete = await po.isEmployeeRowVisible(actualId);
        expect(rowAfterDelete).toBe(false);

        // Re-search to be thorough
        await po.searchEmployees(firstName);
        const rowFinalCheck = await po.isEmployeeRowVisible(actualId);
        expect(rowFinalCheck).toBe(false);
      } catch (e) {
        // Attempt cleanup if deletion didn't happen
        try {
          await po.deleteEmployee(id);
        } catch {
          // Employee may already be deleted — ignore
        }
        throw e;
      }
      // No cleanup needed — employee was successfully deleted by the test
    });
  });
});