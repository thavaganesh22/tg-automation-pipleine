import { Page } from '@playwright/test';

export class EmployeeListPage {
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly emptyState = '[data-testid="empty-state"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly errorBanner = '[data-testid="error-banner"]';
  private readonly paginationSummary = '[data-testid="pagination-summary"]';
  private readonly pagination = '[data-testid="pagination"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly firstNameInput = '[data-testid="firstName-input"]';
  private readonly lastNameInput = '[data-testid="lastName-input"]';
  private readonly emailInput = '[data-testid="email-input"]';
  private readonly designationInput = '[data-testid="designation-input"]';
  private readonly departmentSelect = '[data-testid="department-select"]';
  private readonly employmentTypeSelect = '[data-testid="employmentType-select"]';
  private readonly employmentStatusSelect = '[data-testid="employmentStatus-select"]';
  private readonly startDateInput = '[data-testid="startDate-input"]';
  private readonly streetInput = '[data-testid="street-input"]';
  private readonly cityInput = '[data-testid="city-input"]';
  private readonly countryInput = '[data-testid="country-input"]';
  private readonly submitBtn = '[data-testid="submit-btn"]';
  private readonly departmentFilter = '[data-testid="department-filter"]';
  private readonly statusFilter = '[data-testid="status-filter"]';

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
    const testId = await row.getAttribute('data-testid');
    if (!testId) throw new Error('No visible employee row found');
    return testId.replace('employee-row-', '');
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
    await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator('[data-testid="loading-row"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async clearSearch(): Promise<void> {
    const searchLoc = this.page.locator(this.searchInput);
    await searchLoc.waitFor({ state: 'visible' });
    await searchLoc.click();
    await searchLoc.fill('');
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

  async isEmployeeTableVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.employeeTable, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async isLoadingIndicatorVisible(): Promise<boolean> {
    return this.page.locator(this.loadingRow).isVisible();
  }

  async isEmptyStateVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.emptyState, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getEmptyStateText(): Promise<string> {
    await this.page.waitForSelector(this.emptyState, { state: 'visible', timeout: 5000 });
    return this.page.locator(this.emptyState).innerText();
  }

  async isErrorBannerVisible(): Promise<boolean> {
    return this.page.locator(this.errorBanner).isVisible();
  }

  async getFirstRowName(): Promise<string> {
    const row = this.page.locator('[data-testid^="employee-row-"]').first();
    return row.locator('[data-testid="employee-name"]').innerText();
  }

  async getFirstRowEmail(): Promise<string> {
    const row = this.page.locator('[data-testid^="employee-row-"]').first();
    return row.locator('[data-testid="employee-email"]').innerText();
  }

  async getFirstRowDepartment(): Promise<string> {
    const row = this.page.locator('[data-testid^="employee-row-"]').first();
    return row.locator('[data-testid="employee-department"]').innerText();
  }

  async getTableHeaderTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    return this.page.locator(`${this.employeeTable} thead th`).allInnerTexts();
  }

  async getRowCellTexts(rowIndex: number): Promise<string[]> {
    const row = this.page.locator('[data-testid^="employee-row-"]').nth(rowIndex);
    return row.locator('td').allInnerTexts();
  }

  async isPaginationVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.pagination, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getPaginationSummaryText(): Promise<string> {
    await this.page.waitForSelector(this.paginationSummary, { state: 'visible' });
    return this.page.locator(this.paginationSummary).innerText();
  }

  async filterByDepartment(department: string): Promise<void> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    await Promise.all([
      this.page.waitForResponse(res => res.url().includes('/api/employees') && res.status() === 200),
      this.page.selectOption(this.departmentFilter, department),
    ]);
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async filterByStatus(status: string): Promise<void> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    await Promise.all([
      this.page.waitForResponse(res => res.url().includes('/api/employees') && res.status() === 200),
      this.page.selectOption(this.statusFilter, status),
    ]);
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
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

  async openAddEmployeeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible' });
    await this.page.click(this.addEmployeeBtn);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  async fillEmployeeForm(data: {
    firstName?: string; lastName?: string; email?: string; designation?: string;
    department?: string; employmentType?: string; employmentStatus?: string;
    startDate?: string; street?: string; city?: string; country?: string;
  }): Promise<void> {
    if (data.firstName !== undefined) { await this.page.waitForSelector(this.firstNameInput, { state: 'visible' }); await this.page.fill(this.firstNameInput, data.firstName); }
    if (data.lastName !== undefined) { await this.page.fill(this.lastNameInput, data.lastName); }
    if (data.email !== undefined) { await this.page.fill(this.emailInput, data.email); }
    if (data.designation !== undefined) { await this.page.fill(this.designationInput, data.designation); }
    if (data.department !== undefined) { await this.page.selectOption(this.departmentSelect, data.department); }
    if (data.employmentType !== undefined) { await this.page.selectOption(this.employmentTypeSelect, data.employmentType); }
    if (data.employmentStatus !== undefined) { await this.page.selectOption(this.employmentStatusSelect, data.employmentStatus); }
    if (data.startDate !== undefined) { await this.page.fill(this.startDateInput, data.startDate); }
    if (data.street !== undefined) { await this.page.fill(this.streetInput, data.street); }
    if (data.city !== undefined) { await this.page.fill(this.cityInput, data.city); }
    if (data.country !== undefined) { await this.page.fill(this.countryInput, data.country); }
  }

  async submitEmployeeForm(): Promise<void> {
    await this.page.waitForSelector(this.submitBtn, { state: 'visible' });
    await this.page.click(this.submitBtn);
    await Promise.race([
      this.page.waitForSelector('[data-testid$="-error"]', { state: 'visible', timeout: 5000 }),
      this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 5000 }),
      this.page.waitForSelector('[data-testid="drawer-error"]', { state: 'visible', timeout: 5000 }),
    ]).catch(() => {});
  }

  async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
  }

  async clickEmployeeRow(id: string): Promise<void> {
    const selector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.click(selector);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  async isAddEmployeeButtonVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}