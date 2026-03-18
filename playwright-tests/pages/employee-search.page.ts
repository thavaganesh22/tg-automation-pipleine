import { Page } from '@playwright/test';

export class EmployeeSearchPage {
  private readonly page: Page;
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly emptyState = '[data-testid="empty-state"]';
  private readonly errorBanner = '[data-testid="error-banner"]';
  private readonly successToast = '[data-testid="success-toast"]';

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
    return `${body.data[0].firstName} ${body.data[0].lastName}` as string;
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

  async clearSearch(): Promise<void> {
    const searchLoc = this.page.locator(this.searchInput);
    await searchLoc.waitFor({ state: 'visible' });
    await searchLoc.click();
    await searchLoc.fill('');
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async getSearchInputValue(): Promise<string> {
    await this.page.waitForSelector(this.searchInput, { state: 'visible' });
    return this.page.locator(this.searchInput).inputValue();
  }

  async isSearchInputVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.searchInput, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isSearchInputEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.searchInput, { state: 'visible' });
    return this.page.locator(this.searchInput).isEnabled();
  }

  async getEmployeeRowCount(): Promise<number> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return this.page.locator('[data-testid^="employee-row-"]').count();
  }

  async isEmployeeRowVisible(id: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(`[data-testid="employee-row-${id}"]`, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getEmployeeNameTexts(): Promise<string[]> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return this.page.locator('[data-testid="employee-name"]').allTextContents();
  }

  async isEmptyStateVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.emptyState, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getEmptyStateText(): Promise<string> {
    await this.page.waitForSelector(this.emptyState, { state: 'visible' });
    return this.page.locator(this.emptyState).textContent() as Promise<string>;
  }

  async isErrorBannerVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.errorBanner, { state: 'visible', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async isSuccessToastVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
  }

  async isEmployeeTableVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.employeeTable, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}