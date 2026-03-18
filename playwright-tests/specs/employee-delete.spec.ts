import { test, expect } from '@playwright/test';
import { EmployeeDeletePage } from '../pages/employee-delete.page';

test.describe('employee-delete — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-9860ba1a-4eb3-5973-2a7a-b4e6470c16fe  SCOPE:regression
    test('Confirm dialog delete button removes employee from list', async ({ page }) => {
      const po = new EmployeeDeletePage(page);
      await po.navigate();

      const uniqueEmail = `test.delete.${Date.now()}@example.com`;
      const firstName = 'TestDel';
      const lastName = `User${Date.now()}`;
      const id = await po.createEmployee({
        firstName,
        lastName,
        email: uniqueEmail,
        designation: 'Engineer',
        department: 'Engineering',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-01-15',
        address: { street: '123 Test St', city: 'Test City', country: 'United States' },
      });

      try {
        // Navigate and search to ensure the created employee is on page 1
        await po.navigate();
        await po.searchEmployees(firstName);
        const rowVisible = await po.isEmployeeRowVisible(id);
        expect(rowVisible).toBe(true);

        // Open edit drawer to access delete button
        await po.openEmployeeEditDrawer(id);
        const drawerVisible = await po.isDrawerVisible();
        expect(drawerVisible).toBe(true);

        // Click delete button to open confirm dialog
        await po.clickDeleteButton();
        const dialogVisible = await po.isConfirmDialogVisible();
        expect(dialogVisible).toBe(true);

        // Verify dialog has cancel and confirm delete buttons
        const cancelVisible = await po.isCancelButtonVisible();
        expect(cancelVisible).toBe(true);
        const confirmDeleteVisible = await po.isConfirmDeleteButtonVisible();
        expect(confirmDeleteVisible).toBe(true);

        // Verify dialog text contains a deletion warning
        const dialogText = await po.getConfirmDialogText();
        expect(dialogText.toLowerCase()).toContain('delete');

        // Confirm deletion
        await po.confirmDeletion();
        await po.waitForSuccessToast();

        const toastVisible = await po.isSuccessToastVisible();
        expect(toastVisible).toBe(true);

        // Wait for the employee row to disappear
        await po.waitForEmployeeRowHidden(id);
        const rowGone = await po.isEmployeeRowVisible(id);
        expect(rowGone).toBe(false);

        // Re-search to confirm employee does not reappear
        await po.searchEmployees(firstName);
        const rowStillGone = await po.isEmployeeRowVisible(id);
        expect(rowStillGone).toBe(false);
      } catch (e) {
        // Attempt cleanup if deletion didn't happen
        try {
          await po.deleteEmployee(id);
        } catch {
          // Employee may already be deleted — ignore
        }
        throw e;
      }
    });

    // TC-040b8a4a-5400-579e-8f1d-d1bc7a6e2eba  SCOPE:regression
    test('Escape key closes confirm dialog without deleting employee', async ({ page }) => {
      const po = new EmployeeDeletePage(page);
      await po.navigate();

      // Read-only test — use seeded data
      const id = await po.getFirstEmployeeId();
      const name = await po.getFirstEmployeeName();

      // Search for the employee to ensure row is on page 1
      await po.searchEmployees(name);
      const rowVisible = await po.isEmployeeRowVisible(id);
      expect(rowVisible).toBe(true);

      // Open edit drawer
      await po.openEmployeeEditDrawer(id);
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Click delete to open confirm dialog
      await po.clickDeleteButton();
      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      // Press Escape to dismiss dialog
      await po.dismissDialogWithEscape();

      // Verify dialog is closed
      const dialogHidden = await po.isConfirmDialogHidden();
      expect(dialogHidden).toBe(true);

      // Verify employee row is still present
      await po.navigate();
      await po.searchEmployees(name);
      const rowStillVisible = await po.isEmployeeRowVisible(id);
      expect(rowStillVisible).toBe(true);
    });
  });

  test.describe('negative', () => {

    // TC-6be062eb-e65f-522c-ecb0-521aff4c5e04  SCOPE:regression
    test('Cancelling the confirm dialog does not remove the employee', async ({ page }) => {
      const po = new EmployeeDeletePage(page);
      await po.navigate();

      // Read-only test — use seeded data
      const id = await po.getFirstEmployeeId();
      const name = await po.getFirstEmployeeName();

      // Search for the employee to ensure row is on page 1
      await po.searchEmployees(name);
      const rowVisible = await po.isEmployeeRowVisible(id);
      expect(rowVisible).toBe(true);

      // Open edit drawer
      await po.openEmployeeEditDrawer(id);
      const drawerVisible = await po.isDrawerVisible();
      expect(drawerVisible).toBe(true);

      // Click delete to open confirm dialog
      await po.clickDeleteButton();
      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      // Verify both buttons are visible
      const cancelBtnVisible = await po.isCancelButtonVisible();
      expect(cancelBtnVisible).toBe(true);
      const confirmDeleteBtnVisible = await po.isConfirmDeleteButtonVisible();
      expect(confirmDeleteBtnVisible).toBe(true);

      // Click Cancel
      await po.cancelDeletion();

      // Verify dialog is closed
      const dialogHidden = await po.isConfirmDialogHidden();
      expect(dialogHidden).toBe(true);

      // Verify employee row is still present
      await po.navigate();
      await po.searchEmployees(name);
      const rowStillVisible = await po.isEmployeeRowVisible(id);
      expect(rowStillVisible).toBe(true);

      // Re-search to double-confirm
      await po.searchEmployees(name);
      const rowConfirmed = await po.isEmployeeRowVisible(id);
      expect(rowConfirmed).toBe(true);
    });
  });

  test.describe('edge', () => {

    // TC-1e52ec0d-c64b-5ade-9b1b-4c39d34ede7c  SCOPE:regression
    test('Escape key on confirm dialog does not delete; subsequent explicit confirm does delete', async ({ page }) => {
      const po = new EmployeeDeletePage(page);
      await po.navigate();

      const uniqueEmail = `test.escdelete.${Date.now()}@example.com`;
      const firstName = 'TestEsc';
      const lastName = `Del${Date.now()}`;
      const id = await po.createEmployee({
        firstName,
        lastName,
        email: uniqueEmail,
        designation: 'QA Engineer',
        department: 'QA',
        employmentType: 'Full-Time',
        employmentStatus: 'Active',
        startDate: '2024-02-20',
        address: { street: '456 Escape Rd', city: 'Dismiss City', country: 'United States' },
      });

      try {
        // Navigate and search to ensure the created employee is on page 1
        await po.navigate();
        await po.searchEmployees(firstName);
        const rowVisible = await po.isEmployeeRowVisible(id);
        expect(rowVisible).toBe(true);

        // Open edit drawer and click delete
        await po.openEmployeeEditDrawer(id);
        expect(await po.isDrawerVisible()).toBe(true);

        await po.clickDeleteButton();
        expect(await po.isConfirmDialogVisible()).toBe(true);

        // Press Escape to dismiss — should NOT delete
        await po.dismissDialogWithEscape();
        const dialogHidden = await po.isConfirmDialogHidden();
        expect(dialogHidden).toBe(true);

        // Verify employee still exists
        await po.navigate();
        await po.searchEmployees(firstName);
        const rowStillVisible = await po.isEmployeeRowVisible(id);
        expect(rowStillVisible).toBe(true);

        // Now open the delete dialog again
        await po.openEmployeeEditDrawer(id);
        expect(await po.isDrawerVisible()).toBe(true);

        await po.clickDeleteButton();
        expect(await po.isConfirmDialogVisible()).toBe(true);

        // This time, confirm the deletion
        await po.confirmDeletion();
        await po.waitForSuccessToast();

        const toastVisible = await po.isSuccessToastVisible();
        expect(toastVisible).toBe(true);

        // Verify employee row is gone
        await po.waitForEmployeeRowHidden(id);
        const rowGone = await po.isEmployeeRowVisible(id);
        expect(rowGone).toBe(false);
      } catch (e) {
        // Attempt cleanup if deletion didn't happen
        try {
          await po.deleteEmployee(id);
        } catch {
          // Employee may already be deleted — ignore
        }
        throw e;
      }
    });
  });
});