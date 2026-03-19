import { Page } from '@playwright/test';

export class EmployeeDeletePage {
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly confirmDialog = '[data-testid="confirm-dialog"]';
  private readonly confirmDeleteBtn = '[data-testid="confirm-delete-btn"]';
  private readonly confirmCancelBtn = '[data-testid="confirm-cancel-btn"]';
  private readonly closeDrawerBtn = '[data-testid="close-drawer-btn"]';
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForSelector(this.employeeTable, { timeout: 10000 });
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.page.waitForSelector('[data-testid^="employee-row-"]', { timeout: 10000 }).catch(() => {});
  }

  async getFirstEmployeeId(): Promise<string> {
    const res = await this.page.request.get(`${this.baseUrl}/api/employees`);
    const body = await res.json();
    if (!body.data || body.data.length === 0) throw new Error('No employees found');
    return body.data[0]._id as string;
  }

  async getFirstVisibleEmployeeId(): Promise<string> {
    const row = this.page.locator('[data-testid^="employee-row-"]').first();
    const testid = await row.getAttribute('data-testid');
    if (!testid) throw new Error('No visible employee row found');
    return testid.replace('employee-row-', '');
  }

  async createEmployee(payload: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; employmentStatus: string;
    startDate: string; address: { street: string; city: string; country: string };
  }): Promise<string> {
    const res = await this.page.request.post(`${this.baseUrl}/api/employees`, {
      data: payload,
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await res.json();
    return body._id as string;
  }

  async deleteEmployee(id: string): Promise<void> {
    await this.page.request.delete(`${this.baseUrl}/api/employees/${id}`);
  }

  async searchEmployees(query: string): Promise<void> {
    const searchLoc = this.page.locator(this.searchInput);
    await searchLoc.waitFor({ state: 'visible' });
    await searchLoc.click();
    await searchLoc.fill(query);
    await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async isEmployeeRowVisible(id: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(`[data-testid="employee-row-${id}"]`, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getEmployeeRowCount(): Promise<number> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return this.page.locator('[data-testid^="employee-row-"]').count();
  }

  async clickDeleteButtonOnRow(id: string): Promise<void> {
    // The delete button is inside the edit drawer, not on the row itself.
    // Click the row to open the drawer, then click the delete button.
    const rowSelector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    await this.page.click(rowSelector);
    await this.page.waitForSelector('[data-testid="delete-btn"]', { state: 'visible', timeout: 5000 });
    await this.page.click('[data-testid="delete-btn"]');
  }

  async isConfirmDialogVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.confirmDialog, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isConfirmDialogHidden(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.confirmDialog, { state: 'hidden', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getConfirmDialogText(): Promise<string> {
    await this.page.waitForSelector(this.confirmDialog, { state: 'visible' });
    return this.page.locator(this.confirmDialog).innerText();
  }

  async isConfirmDeleteButtonVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isConfirmCancelButtonVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async confirmDeletion(): Promise<void> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    await this.page.click(this.confirmDeleteBtn);
  }

  async cancelDeletion(): Promise<void> {
    await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible' });
    await this.page.click(this.confirmCancelBtn);
  }

  async closeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.closeDrawerBtn, { state: 'visible', timeout: 5000 });
    await this.page.click(this.closeDrawerBtn);
    await this.page.locator('[data-testid="drawer-overlay"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async pressEscapeKey(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
  }

  async isSuccessToastVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getEmployeeNameFromRow(id: string): Promise<string> {
    const row = this.page.locator(`[data-testid="employee-row-${id}"]`);
    await row.waitFor({ state: 'visible' });
    return row.locator('[data-testid="employee-name"]').innerText();
  }

  async getFirstEmployeeNameAndId(): Promise<{ id: string; firstName: string; lastName: string }> {
    const res = await this.page.request.get(`${this.baseUrl}/api/employees`);
    const body = await res.json();
    if (!body.data || body.data.length === 0) throw new Error('No employees found');
    const emp = body.data[0];
    return { id: emp._id as string, firstName: emp.firstName as string, lastName: emp.lastName as string };
  }
}