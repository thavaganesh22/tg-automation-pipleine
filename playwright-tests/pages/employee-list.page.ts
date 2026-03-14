import { Page } from '@playwright/test';

export class EmployeeListPage {
  private readonly page: Page;
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly departmentFilter = '[data-testid="department-filter"]';
  private readonly statusFilter = '[data-testid="status-filter"]';
  private readonly errorBanner = '[data-testid="error-banner"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly emptyState = '[data-testid="empty-state"]';
  private readonly pagination = '[data-testid="pagination"]';
  private readonly paginationSummary = '[data-testid="pagination-summary"]';
  private readonly prevPageBtn = '[data-testid="prev-page-btn"]';
  private readonly nextPageBtn = '[data-testid="next-page-btn"]';
  private readonly paginationCurrent = '[data-testid="pagination-current"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly closeDrawerBtn = '[data-testid="close-drawer-btn"]';
  private readonly drawerError = '[data-testid="drawer-error"]';
  private readonly firstNameInput = '[data-testid="firstName-input"]';
  private readonly lastNameInput = '[data-testid="lastName-input"]';
  private readonly emailInput = '[data-testid="email-input"]';
  private readonly designationInput = '[data-testid="designation-input"]';
  private readonly departmentSelect = '[data-testid="department-select"]';
  private readonly employmentTypeSelect = '[data-testid="employmentType-select"]';
  private readonly employmentStatusSelect = '[data-testid="employmentStatus-select"]';
  private readonly streetInput = '[data-testid="street-input"]';
  private readonly cityInput = '[data-testid="city-input"]';
  private readonly countryInput = '[data-testid="country-input"]';
  private readonly submitBtn = '[data-testid="submit-btn"]';
  private readonly deleteBtn = '[data-testid="delete-btn"]';
  private readonly confirmDeleteBtn = '[data-testid="confirm-delete-btn"]';
  private readonly confirmCancelBtn = '[data-testid="confirm-cancel-btn"]';
  private readonly confirmDialog = '[data-testid="confirm-dialog"]';

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

  async createEmployee(payload: { firstName: string; lastName: string; email: string; designation: string; department: string; employmentType: string; employmentStatus: string; startDate: string; address: { street: string; city: string; country: string } }): Promise<string> {
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

  async isErrorBannerVisible(): Promise<boolean> {
    return this.page.locator(this.errorBanner).isVisible();
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
    return this.page.locator(this.emptyState).innerText();
  }

  async isPaginationVisible(): Promise<boolean> {
    return this.page.locator(this.pagination).isVisible();
  }

  async getPaginationSummaryText(): Promise<string> {
    await this.page.waitForSelector(this.paginationSummary, { state: 'visible' });
    return this.page.locator(this.paginationSummary).innerText();
  }

  async getPaginationCurrentText(): Promise<string> {
    await this.page.waitForSelector(this.paginationCurrent, { state: 'visible' });
    return this.page.locator(this.paginationCurrent).innerText();
  }

  async goToNextPage(): Promise<void> {
    await this.page.waitForSelector(this.nextPageBtn, { state: 'visible' });
    await this.page.click(this.nextPageBtn);
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async goToPreviousPage(): Promise<void> {
    await this.page.waitForSelector(this.prevPageBtn, { state: 'visible' });
    await this.page.click(this.prevPageBtn);
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async getFirstRowName(): Promise<string> {
    await this.page.waitForSelector('[data-testid^="employee-row-"]', { state: 'visible' });
    return this.page.locator('[data-testid^="employee-row-"]').first().locator('[data-testid="employee-name"]').innerText();
  }

  async getFirstRowEmail(): Promise<string> {
    await this.page.waitForSelector('[data-testid^="employee-row-"]', { state: 'visible' });
    return this.page.locator('[data-testid^="employee-row-"]').first().locator('[data-testid="employee-email"]').innerText();
  }

  async getFirstRowDepartment(): Promise<string> {
    await this.page.waitForSelector('[data-testid^="employee-row-"]', { state: 'visible' });
    return this.page.locator('[data-testid^="employee-row-"]').first().locator('[data-testid="employee-department"]').innerText();
  }

  async getTableHeaderTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    return this.page.locator(`${this.employeeTable} thead th`).allInnerTexts();
  }

  async getRowCellTexts(rowIndex: number): Promise<string[]> {
    await this.page.waitForSelector('[data-testid^="employee-row-"]', { state: 'visible' });
    return this.page.locator('[data-testid^="employee-row-"]').nth(rowIndex).locator('td').allInnerTexts();
  }

  async clickEmployeeRow(id: string): Promise<void> {
    const selector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.click(selector);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  async openAddEmployeeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible' });
    await this.page.click(this.addEmployeeBtn);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  async closeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.closeDrawerBtn, { state: 'visible' });
    await this.page.click(this.closeDrawerBtn);
  }

  async isDrawerVisible(): Promise<boolean> {
    return this.page.locator(this.employeeDrawer).isVisible();
  }

  async fillFirstName(value: string): Promise<void> {
    await this.page.waitForSelector(this.firstNameInput, { state: 'visible' });
    await this.page.fill(this.firstNameInput, value);
  }

  async fillLastName(value: string): Promise<void> {
    await this.page.waitForSelector(this.lastNameInput, { state: 'visible' });
    await this.page.fill(this.lastNameInput, value);
  }

  async fillEmail(value: string): Promise<void> {
    await this.page.waitForSelector(this.emailInput, { state: 'visible' });
    await this.page.fill(this.emailInput, value);
  }

  async fillDesignation(value: string): Promise<void> {
    await this.page.waitForSelector(this.designationInput, { state: 'visible' });
    await this.page.fill(this.designationInput, value);
  }

  async selectDepartment(value: string): Promise<void> {
    await this.page.waitForSelector(this.departmentSelect, { state: 'visible' });
    await this.page.selectOption(this.departmentSelect, value);
  }

  async selectEmploymentType(value: string): Promise<void> {
    await this.page.waitForSelector(this.employmentTypeSelect, { state: 'visible' });
    await this.page.selectOption(this.employmentTypeSelect, value);
  }

  async selectEmploymentStatus(value: string): Promise<void> {
    await this.page.waitForSelector(this.employmentStatusSelect, { state: 'visible' });
    await this.page.selectOption(this.employmentStatusSelect, value);
  }

  async fillStreet(value: string): Promise<void> {
    await this.page.waitForSelector(this.streetInput, { state: 'visible' });
    await this.page.fill(this.streetInput, value);
  }

  async fillCity(value: string): Promise<void> {
    await this.page.waitForSelector(this.cityInput, { state: 'visible' });
    await this.page.fill(this.cityInput, value);
  }

  async fillCountry(value: string): Promise<void> {
    await this.page.waitForSelector(this.countryInput, { state: 'visible' });
    await this.page.fill(this.countryInput, value);
  }

  async submitEmployeeForm(): Promise<void> {
    await this.page.waitForSelector(this.submitBtn, { state: 'visible' });
    await this.page.click(this.submitBtn);
    await Promise.race([
      this.page.waitForSelector('[data-testid$="-error"]', { state: 'visible', timeout: 5000 }),
      this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 5000 }),
      this.page.waitForSelector(this.drawerError, { state: 'visible', timeout: 5000 }),
    ]).catch(() => {});
  }

  async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
  }

  async filterByDepartment(value: string): Promise<void> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    await this.page.selectOption(this.departmentFilter, value);
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async filterByStatus(value: string): Promise<void> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    await this.page.selectOption(this.statusFilter, value);
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async isSearchInputVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.searchInput, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getSearchInputValue(): Promise<string> {
    await this.page.waitForSelector(this.searchInput, { state: 'visible' });
    return this.page.locator(this.searchInput).inputValue();
  }

  async isEmptyStateHidden(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.emptyState, { state: 'hidden', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async confirmDelete(): Promise<void> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    await this.page.click(this.confirmDeleteBtn);
  }

  async cancelConfirmDialog(): Promise<void> {
    await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible' });
    await this.page.click(this.confirmCancelBtn);
  }

  async clickDeleteButton(): Promise<void> {
    await this.page.waitForSelector(this.deleteBtn, { state: 'visible' });
    await this.page.click(this.deleteBtn);
    await this.page.waitForSelector(this.confirmDialog, { state: 'visible' });
  }

  async getPageHeadingText(): Promise<string> {
    await this.page.waitForSelector('h1', { state: 'visible' });
    return this.page.locator('h1').innerText();
  }
}