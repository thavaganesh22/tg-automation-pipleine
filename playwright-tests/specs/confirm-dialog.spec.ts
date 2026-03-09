import { test, expect } from '@playwright/test';
import { ConfirmDialogPage } from '../pages/confirm-dialog.page';
import { setupConfirmDialogMocks } from '../fixtures/confirm-dialog.fixture';

test.describe('confirm-dialog — UI Regression Suite', () => {

  test.describe('positive', () => {

    // TC-315e1067-9ea4-45ec-b8af-fbbc591ea644  SCOPE:regression
    test('[UI] confirm-dialog: Happy path – delete employee via confirmation dialog and verify removal', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const initialCount = await po.getEmployeeRowCount();
      expect(initialCount).toBeGreaterThanOrEqual(1);

      const employeeName = await po.getEmployeeNameByIndex(0);
      expect(employeeName).toBeTruthy();

      await po.openDeleteDialogForEmployee(0);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      const dialogText = await po.getConfirmDialogText();
      expect(dialogText).toContain('Delete employee');

      const confirmBtnVisible = await po.isConfirmDeleteButtonVisible();
      expect(confirmBtnVisible).toBe(true);

      const cancelBtnVisible = await po.isConfirmCancelButtonVisible();
      expect(cancelBtnVisible).toBe(true);

      const confirmBtnEnabled = await po.isConfirmDeleteButtonEnabled();
      expect(confirmBtnEnabled).toBe(true);

      const cancelBtnEnabled = await po.isConfirmCancelButtonEnabled();
      expect(cancelBtnEnabled).toBe(true);

      await po.confirmDeletion();

      await po.waitForDialogToClose();

      await po.waitForSuccessToast();
      const toastVisible = await po.isSuccessToastVisible();
      expect(toastVisible).toBe(true);

      const toastText = await po.getSuccessToastText();
      expect(toastText.toLowerCase()).toContain('deleted');

      const isStillInList = await po.isEmployeeInList(employeeName);
      expect(isStillInList).toBe(false);

      const finalCount = await po.getEmployeeRowCount();
      expect(finalCount).toBe(initialCount - 1);
    });

    // TC-1662f435-fdf1-4926-b99b-e34f32f7ee07  SCOPE:regression
    test('[UI] confirm-dialog: Dialog content displays correct employee context', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(2);

      const secondEmployeeName = await po.getEmployeeNameByIndex(1);
      expect(secondEmployeeName).toBeTruthy();

      await po.openDeleteDialogForEmployee(1);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      const dialogText = await po.getConfirmDialogText();
      expect(dialogText).toContain(secondEmployeeName);

      await po.cancelDeletion();

      await po.waitForDialogToClose();
      const dialogGone = await po.isConfirmDialogVisible();
      expect(dialogGone).toBe(false);
    });

    // TC-d9d49e70-40d5-491d-b845-80ab3cab0a6e  SCOPE:regression
    test('[UI] confirm-dialog: Confirm button shows loading state during deletion', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const initialCount = await po.getEmployeeRowCount();
      expect(initialCount).toBeGreaterThanOrEqual(1);

      await po.interceptDeleteWithDelay(3000);

      await po.openDeleteDialogForEmployee(0);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      await po.confirmDeletion();

      const isDisabled = await po.isConfirmDeleteButtonDisabled();
      expect(isDisabled).toBe(true);

      await po.restoreNetworkRoutes();

      await po.waitForDialogToClose();

      await po.waitForSuccessToast();
      const toastVisible = await po.isSuccessToastVisible();
      expect(toastVisible).toBe(true);
    });
  });

  test.describe('negative', () => {

    // TC-2c404249-f5ec-4656-b55a-cf8cde20e69e  SCOPE:regression
    test('[UI] confirm-dialog: Cancel deletion – employee remains in the list after dismissing dialog', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const initialCount = await po.getEmployeeRowCount();
      expect(initialCount).toBeGreaterThanOrEqual(1);

      const employeeName = await po.getEmployeeNameByIndex(0);
      const allNamesBefore = await po.getAllEmployeeNames();

      await po.openDeleteDialogForEmployee(0);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      await po.cancelDeletion();

      await po.waitForDialogToClose();
      const dialogGone = await po.isConfirmDialogVisible();
      expect(dialogGone).toBe(false);

      const finalCount = await po.getEmployeeRowCount();
      expect(finalCount).toBe(initialCount);

      const isStillInList = await po.isEmployeeInList(employeeName);
      expect(isStillInList).toBe(true);

      const allNamesAfter = await po.getAllEmployeeNames();
      expect(allNamesAfter).toEqual(allNamesBefore);

      const toastVisible = await po.isSuccessToastVisible();
      expect(toastVisible).toBe(false);
    });

    // TC-b60a9999-594f-42fd-88cf-2cbecbd23d31  SCOPE:regression
    test('[UI] confirm-dialog: Deletion failure displays error message and keeps employee in list', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const initialCount = await po.getEmployeeRowCount();
      expect(initialCount).toBeGreaterThanOrEqual(1);

      const employeeName = await po.getEmployeeNameByIndex(0);

      await po.interceptDeleteWithError(500);

      await po.openDeleteDialogForEmployee(0);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      await po.confirmDeletion();

      const hasDrawerError = await po.isDrawerErrorVisible();
      const hasErrorBanner = await po.isErrorBannerVisible();
      expect(hasDrawerError || hasErrorBanner).toBe(true);

      const isStillInList = await po.isEmployeeInList(employeeName);
      expect(isStillInList).toBe(true);

      const finalCount = await po.getEmployeeRowCount();
      expect(finalCount).toBe(initialCount);

      await po.restoreNetworkRoutes();
    });
  });

  test.describe('edge', () => {

    // TC-b1d4eded-33b9-4bb2-85a8-29614a4344d9  SCOPE:regression
    test('[UI] confirm-dialog: Dismiss dialog by clicking backdrop/overlay', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const initialCount = await po.getEmployeeRowCount();
      expect(initialCount).toBeGreaterThanOrEqual(1);

      const allNamesBefore = await po.getAllEmployeeNames();

      await po.openDeleteDialogForEmployee(0);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      const overlayVisible = await po.isModalOverlayVisible();
      expect(overlayVisible).toBe(true);

      await po.dismissDialogByOverlay();

      await po.waitForDialogToClose();
      const dialogGone = await po.isConfirmDialogVisible();
      expect(dialogGone).toBe(false);

      const finalCount = await po.getEmployeeRowCount();
      expect(finalCount).toBe(initialCount);

      const allNamesAfter = await po.getAllEmployeeNames();
      expect(allNamesAfter).toEqual(allNamesBefore);
    });

    // TC-385cdf32-b703-45c4-9f76-e8301d8cd2a5  SCOPE:regression
    test('[UI] confirm-dialog: Dismiss dialog by pressing Escape key', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const initialCount = await po.getEmployeeRowCount();
      expect(initialCount).toBeGreaterThanOrEqual(1);

      const allNamesBefore = await po.getAllEmployeeNames();

      await po.openDeleteDialogForEmployee(0);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      await po.dismissDialogByEscape();

      await po.waitForDialogToClose();
      const dialogGone = await po.isConfirmDialogVisible();
      expect(dialogGone).toBe(false);

      const finalCount = await po.getEmployeeRowCount();
      expect(finalCount).toBe(initialCount);

      const allNamesAfter = await po.getAllEmployeeNames();
      expect(allNamesAfter).toEqual(allNamesBefore);
    });

    // TC-703e2984-fca7-4ae7-be43-8622d4403105  SCOPE:regression
    test('[UI] confirm-dialog: Dialog blocks interaction with background content', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const rowCount = await po.getEmployeeRowCount();
      expect(rowCount).toBeGreaterThanOrEqual(2);

      await po.openDeleteDialogForEmployee(0);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      const overlayVisible = await po.isModalOverlayVisible();
      expect(overlayVisible).toBe(true);

      const clickRegistered = await po.clickBackgroundElement('[data-testid="add-employee-btn"]');
      expect(clickRegistered).toBe(false);

      const dialogStillVisible = await po.isConfirmDialogVisible();
      expect(dialogStillVisible).toBe(true);

      await po.cancelDeletion();

      await po.waitForDialogToClose();
      const dialogGone = await po.isConfirmDialogVisible();
      expect(dialogGone).toBe(false);
    });

    // TC-299371a3-6a27-42e3-a360-9610d6910999  SCOPE:regression
    test('[UI] confirm-dialog: Double-click on confirm does not trigger duplicate deletion', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const initialCount = await po.getEmployeeRowCount();
      expect(initialCount).toBeGreaterThanOrEqual(2);

      const employeeName = await po.getEmployeeNameByIndex(0);

      await po.openDeleteDialogForEmployee(0);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      await po.doubleClickConfirmDeletion();

      await po.waitForDialogToClose();

      await po.waitForSuccessToast();
      const toastVisible = await po.isSuccessToastVisible();
      expect(toastVisible).toBe(true);

      const finalCount = await po.getEmployeeRowCount();
      expect(finalCount).toBe(initialCount - 1);

      const isStillInList = await po.isEmployeeInList(employeeName);
      expect(isStillInList).toBe(false);

      const errorVisible = await po.isErrorBannerVisible();
      expect(errorVisible).toBe(false);
    });

    // TC-ad683071-714e-4f99-ad20-856b0ccc63ae  SCOPE:regression
    test('[UI] confirm-dialog: Delete last remaining employee shows empty state', async ({ page }) => {
      await setupConfirmDialogMocks(page);
      const po = new ConfirmDialogPage(page);

      await po.navigateToEmployeeList();

      const initialCount = await po.getEmployeeRowCount();
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // Delete all employees one by one until one remains, then delete the last
      for (let i = initialCount; i > 1; i--) {
        await po.openDeleteDialogForEmployee(0);
        await po.confirmDeletion();
        await po.waitForDialogToClose();
        await po.waitForSuccessToast();
      }

      const remainingCount = await po.getEmployeeRowCount();
      expect(remainingCount).toBe(1);

      await po.openDeleteDialogForEmployee(0);

      const dialogVisible = await po.isConfirmDialogVisible();
      expect(dialogVisible).toBe(true);

      await po.confirmDeletion();

      await po.waitForDialogToClose();

      await po.waitForSuccessToast();
      const toastVisible = await po.isSuccessToastVisible();
      expect(toastVisible).toBe(true);

      await po.waitForEmptyState();
      const emptyStateVisible = await po.isEmptyStateVisible();
      expect(emptyStateVisible).toBe(true);

      const finalCount = await po.getEmployeeRowCount();
      expect(finalCount).toBe(0);
    });
  });
});

test.describe('confirm-dialog — UI New Feature', () => {

  test.describe('positive', () => {
    // No new feature cases defined
  });

  test.describe('negative', () => {
    // No new feature cases defined
  });

  test.describe('edge', () => {
    // No new feature cases defined
  });
});