import { Page } from '@playwright/test';

export class ConfirmDialogPage {
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly departmentFilter = '[data-testid="department-filter"]';
  private readonly statusFilter = '[data-testid="status-filter"]';
  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly employeeRow = '[data-testid^="employee-row-"]';
  private readonly employeeName = '[data-testid="employee-name"]';
  private readonly employeeEmail = '[data-testid="employee-email"]';
  private readonly employeeDepartment = '[data-testid="employee-department"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly emptyState = '[data-testid="empty-state"]';
  private readonly errorBanner = '[data-testid="error-banner"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly pagination = '[data-testid="pagination"]';
  private readonly paginationSummary = '[data-testid="pagination-summary"]';
  private readonly prevPageBtn = '[data-testid="prev-page-btn"]';
  private readonly nextPageBtn = '[data-testid="next-page-btn"]';
  private readonly paginationCurrent = '[data-testid="pagination-current"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly drawerOverlay = '[data-testid="drawer-overlay"]';
  private readonly closeDrawerBtn = '[data-testid="close-drawer-btn"]';
  private readonly drawerError = '[data-testid="drawer-error"]';
  private readonly deleteBtn = '[data-testid="delete-btn"]';
  private readonly cancelBtn = '[data-testid="cancel-btn"]';
  private readonly submitBtn = '[data-testid="submit-btn"]';
  private readonly confirmDialog = '[data-testid="confirm-dialog"]';
  private readonly modalOverlay = '[data-testid="modal-overlay"]';
  private readonly confirmCancelBtn = '[data-testid="confirm-cancel-btn"]';
  private readonly confirmDeleteBtn = '[data-testid="confirm-delete-btn"]';

  constructor(private readonly page: Page) {}

  async navigateToEmployeeList(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
  }

  async getEmployeeRowCount(): Promise<number> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    return this.page.locator(this.employeeRow).count();
  }

  async getEmployeeNameByIndex(index: number): Promise<string> {
    await this.page.waitForSelector(this.employeeRow, { state: 'visible' });
    const row = this.page.locator(this.employeeRow).nth(index);
    return (await row.locator(this.employeeName).textContent()) ?? '';
  }

  async getAllEmployeeNames(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeRow, { state: 'visible' });
    return this.page.locator(`${this.employeeRow} ${this.employeeName}`).allTextContents();
  }

  async clickEmployeeRow(index: number): Promise<void> {
    await this.page.waitForSelector(this.employeeRow, { state: 'visible' });
    await this.page.locator(this.employeeRow).nth(index).click();
  }

  async openDeleteDialogFromDrawer(): Promise<void> {
    await this.page.waitForSelector(this.deleteBtn, { state: 'visible' });
    await this.page.click(this.deleteBtn);
  }

  async openDeleteDialogForEmployee(index: number): Promise<void> {
    await this.clickEmployeeRow(index);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    await this.openDeleteDialogFromDrawer();
  }

  async isConfirmDialogVisible(): Promise<boolean> {
    return this.page.locator(this.confirmDialog).isVisible();
  }

  async getConfirmDialogText(): Promise<string> {
    await this.page.waitForSelector(this.confirmDialog, { state: 'visible' });
    return (await this.page.locator(this.confirmDialog).textContent()) ?? '';
  }

  async isConfirmDeleteButtonVisible(): Promise<boolean> {
    return this.page.locator(this.confirmDeleteBtn).isVisible();
  }

  async isConfirmCancelButtonVisible(): Promise<boolean> {
    return this.page.locator(this.confirmCancelBtn).isVisible();
  }

  async isConfirmDeleteButtonEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    return this.page.locator(this.confirmDeleteBtn).isEnabled();
  }

  async isConfirmCancelButtonEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible' });
    return this.page.locator(this.confirmCancelBtn).isEnabled();
  }

  async getConfirmDeleteButtonText(): Promise<string> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    return (await this.page.locator(this.confirmDeleteBtn).textContent()) ?? '';
  }

  async confirmDeletion(): Promise<void> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    await this.page.click(this.confirmDeleteBtn);
  }

  async cancelDeletion(): Promise<void> {
    await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible' });
    await this.page.click(this.confirmCancelBtn);
  }

  async dismissDialogByOverlay(): Promise<void> {
    await this.page.waitForSelector(this.modalOverlay, { state: 'visible' });
    await this.page.locator(this.modalOverlay).click({ position: { x: 10, y: 10 }, force: true });
  }

  async dismissDialogByEscape(): Promise<void> {
    await this.page.waitForSelector(this.confirmDialog, { state: 'visible' });
    await this.page.keyboard.press('Escape');
  }

  async doubleClickConfirmDeletion(): Promise<void> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    await this.page.locator(this.confirmDeleteBtn).dblclick();
  }

  async waitForDialogToClose(): Promise<void> {
    await this.page.locator(this.confirmDialog).waitFor({ state: 'hidden' });
  }

  async waitForDrawerToClose(): Promise<void> {
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden' });
  }

  async isSuccessToastVisible(): Promise<boolean> {
    return this.page.locator(this.successToast).isVisible();
  }

  async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible' });
  }

  async getSuccessToastText(): Promise<string> {
    await this.page.waitForSelector(this.successToast, { state: 'visible' });
    return (await this.page.locator(this.successToast).textContent()) ?? '';
  }

  async isErrorBannerVisible(): Promise<boolean> {
    return this.page.locator(this.errorBanner).isVisible();
  }

  async getErrorBannerText(): Promise<string> {
    await this.page.waitForSelector(this.errorBanner, { state: 'visible' });
    return (await this.page.locator(this.errorBanner).textContent()) ?? '';
  }

  async isDrawerErrorVisible(): Promise<boolean> {
    try {
      await this.page.locator(this.drawerError).waitFor({ state: 'visible', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async isEmptyStateVisible(): Promise<boolean> {
    return this.page.locator(this.emptyState).isVisible();
  }

  async waitForEmptyState(): Promise<void> {
    await this.page.waitForSelector(this.emptyState, { state: 'visible' });
  }

  async isEmployeeDrawerVisible(): Promise<boolean> {
    return this.page.locator(this.employeeDrawer).isVisible();
  }

  async isModalOverlayVisible(): Promise<boolean> {
    return this.page.locator(this.modalOverlay).isVisible();
  }

  async getPaginationSummaryText(): Promise<string> {
    await this.page.waitForSelector(this.paginationSummary, { state: 'visible' });
    return (await this.page.locator(this.paginationSummary).textContent()) ?? '';
  }

  async isEmployeeInList(name: string): Promise<boolean> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    const names = await this.page.locator(`${this.employeeRow} ${this.employeeName}`).allTextContents();
    return names.some((n) => n.includes(name));
  }

  async interceptDeleteWithError(statusCode: number = 500): Promise<void> {
    await this.page.route('**/api/employees/*', (route) => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({ status: statusCode, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) });
      } else {
        route.fallback();
      }
    });
  }

  async restoreNetworkRoutes(): Promise<void> {
    await this.page.unrouteAll({ behavior: 'wait' });
  }

  async interceptDeleteWithDelay(delayMs: number = 3000): Promise<void> {
    await this.page.route('**/api/employees/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        await route.fulfill({ status: 204, body: '' });
      } else {
        await route.fallback();
      }
    });
  }

  async clickBackgroundElement(selector: string): Promise<boolean> {
    try {
      await this.page.locator(selector).click({ timeout: 2000, force: false });
      return true;
    } catch {
      return false;
    }
  }

  async isConfirmDeleteButtonDisabled(): Promise<boolean> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    return !(await this.page.locator(this.confirmDeleteBtn).isEnabled());
  }
}