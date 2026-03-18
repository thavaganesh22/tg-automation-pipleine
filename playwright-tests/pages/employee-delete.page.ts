import { Page } from '@playwright/test';

export class EmployeeDeletePage {
  private readonly page: Page;
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly deleteBtn = '[data-testid="delete-btn"]';
  private readonly confirmDialog = '[data-testid="confirm-dialog"]';
  private readonly confirmCancelBtn = '[data-testid="confirm-cancel-btn"]';
  private readonly confirmDeleteBtn = '[data-testid="confirm-delete-btn"]';

  constructor(page: Page) {
    this.page = page;
  }

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

  async getFirstEmployeeName(): Promise<string> {
    const res = await this.page.request.get(`${this.baseUrl}/api/employees`);
    const body = await res.json();
    if (!body.data || body.data.length === 0) throw new Error('No employees found');
    return `${body.data[0].firstName} ${body.data[0].lastName}`;
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
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async isEmployeeRowVisible(id: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(`[data-testid="employee-row-${id}"]`, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async clickEmployeeRow(id: string): Promise<void> {
    const selector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.click(selector);
  }

  async isDrawerVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.employeeDrawer, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async clickDeleteButton(): Promise<void> {
    await this.page.waitForSelector(this.deleteBtn, { state: 'visible' });
    await this.page.click(this.deleteBtn);
  }

  async isConfirmDialogVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.confirmDialog, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getConfirmDialogText(): Promise<string> {
    await this.page.waitForSelector(this.confirmDialog, { state: 'visible' });
    return this.page.locator(this.confirmDialog).innerText();
  }

  async isCancelButtonVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isConfirmDeleteButtonVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible', timeout: 3000 });
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

  async dismissDialogWithEscape(): Promise<void> {
    await this.page.waitForSelector(this.confirmDialog, { state: 'visible' });
    await this.page.keyboard.press('Escape');
  }

  async isConfirmDialogHidden(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.confirmDialog, { state: 'hidden', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
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

  async waitForEmployeeRowHidden(id: string): Promise<void> {
    await this.page.locator(`[data-testid="employee-row-${id}"]`).waitFor({ state: 'hidden', timeout: 5000 });
  }

  async getEmployeeRowCount(): Promise<number> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return this.page.locator('[data-testid^="employee-row-"]').count();
  }

  async openEmployeeEditDrawer(id: string): Promise<void> {
    await this.clickEmployeeRow(id);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }
}