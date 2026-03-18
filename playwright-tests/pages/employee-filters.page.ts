import { Page } from '@playwright/test';

export class EmployeeFiltersPage {
  private readonly page: Page;
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly departmentFilter = '[data-testid="department-filter"]';
  private readonly statusFilter = '[data-testid="status-filter"]';
  private readonly emptyState = '[data-testid="empty-state"]';
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

  async createEmployee(payload: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; employmentStatus: string;
    startDate: string; address: { street: string; city: string; country: string };
  }): Promise<string> {
    const res = await this.page.request.post(`${this.baseUrl}/api/employees`, {
      data: payload, headers: { 'Content-Type': 'application/json' },
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

  async getEmployeeRowCount(): Promise<number> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return this.page.locator('[data-testid^="employee-row-"]').count();
  }

  async isDepartmentFilterVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.departmentFilter, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isStatusFilterVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.statusFilter, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getDepartmentFilterOptions(): Promise<string[]> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    return this.page.locator(`${this.departmentFilter} option`).allTextContents();
  }

  async getSelectedDepartmentFilter(): Promise<string> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    return this.page.locator(this.departmentFilter).inputValue();
  }

  async getSelectedStatusFilter(): Promise<string> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    return this.page.locator(this.statusFilter).inputValue();
  }

  async filterByDepartment(value: string): Promise<void> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    await this.page.selectOption(this.departmentFilter, { label: value });
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async filterByStatus(value: string): Promise<void> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    await this.page.selectOption(this.statusFilter, { label: value });
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async resetDepartmentFilter(): Promise<void> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    await this.page.selectOption(this.departmentFilter, { label: 'All departments' });
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async resetStatusFilter(): Promise<void> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    await this.page.selectOption(this.statusFilter, { label: 'All statuses' });
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async getAllVisibleDepartments(): Promise<string[]> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return this.page.locator('[data-testid="employee-department"]').allTextContents();
  }

  async getAllVisibleStatuses(): Promise<string[]> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    const rows = this.page.locator('[data-testid^="employee-row-"]');
    const count = await rows.count();
    const statuses: string[] = [];
    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator('td');
      const text = await cells.nth(3).textContent();
      statuses.push((text ?? '').trim());
    }
    return statuses;
  }

  async isEmptyStateVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.emptyState, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
  }
}