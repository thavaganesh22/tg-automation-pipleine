import { Page } from '@playwright/test';

export class EmployeeTablePage {
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly departmentFilter = '[data-testid="department-filter"]';
  private readonly statusFilter = '[data-testid="status-filter"]';
  private readonly clearFiltersBtn = '[data-testid="clear-filters-btn"]';
  private readonly errorBanner = '[data-testid="error-banner"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly emptyState = '[data-testid="empty-state"]';
  private readonly employeeName = '[data-testid="employee-name"]';
  private readonly employeeEmail = '[data-testid="employee-email"]';
  private readonly employeeDepartment = '[data-testid="employee-department"]';
  private readonly pagination = '[data-testid="pagination"]';
  private readonly paginationSummary = '[data-testid="pagination-summary"]';
  private readonly prevPageBtn = '[data-testid="prev-page-btn"]';
  private readonly nextPageBtn = '[data-testid="next-page-btn"]';
  private readonly paginationCurrent = '[data-testid="pagination-current"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly drawerOverlay = '[data-testid="drawer-overlay"]';
  private readonly closeDrawerBtn = '[data-testid="close-drawer-btn"]';
  private readonly drawerError = '[data-testid="drawer-error"]';
  private readonly firstNameInput = '[data-testid="firstName-input"]';
  private readonly lastNameInput = '[data-testid="lastName-input"]';
  private readonly emailInput = '[data-testid="email-input"]';
  private readonly phoneInput = '[data-testid="phone-input"]';
  private readonly designationInput = '[data-testid="designation-input"]';
  private readonly departmentSelect = '[data-testid="department-select"]';
  private readonly employmentTypeSelect = '[data-testid="employmentType-select"]';
  private readonly employmentStatusSelect = '[data-testid="employmentStatus-select"]';
  private readonly startDateInput = '[data-testid="startDate-input"]';
  private readonly streetInput = '[data-testid="street-input"]';
  private readonly cityInput = '[data-testid="city-input"]';
  private readonly stateInput = '[data-testid="state-input"]';
  private readonly postalCodeInput = '[data-testid="postalCode-input"]';
  private readonly countryInput = '[data-testid="country-input"]';
  private readonly deleteBtn = '[data-testid="delete-btn"]';
  private readonly cancelBtn = '[data-testid="cancel-btn"]';
  private readonly submitBtn = '[data-testid="submit-btn"]';
  private readonly confirmDialog = '[data-testid="confirm-dialog"]';
  private readonly confirmCancelBtn = '[data-testid="confirm-cancel-btn"]';
  private readonly confirmDeleteBtn = '[data-testid="confirm-delete-btn"]';
  private readonly employeeRowPrefix = '[data-testid^="employee-row-"]';

  constructor(private readonly page: Page) {}

  async navigateToEmployeeTable(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
  }

  async isEmployeeTableVisible(): Promise<boolean> {
    return this.page.locator(this.employeeTable).isVisible();
  }

  async isLoadingStateVisible(): Promise<boolean> {
    return this.page.locator(this.loadingRow).isVisible();
  }

  async waitForLoadingToDisappear(): Promise<void> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 30000 });
  }

  async waitForEmployeeRows(): Promise<void> {
    await this.page.locator(this.employeeRowPrefix).first().waitFor({ state: 'visible' });
  }

  async isEmptyStateVisible(): Promise<boolean> {
    return this.page.locator(this.emptyState).isVisible();
  }

  async waitForEmptyState(): Promise<void> {
    await this.page.waitForSelector(this.emptyState, { state: 'visible' });
  }

  async getEmptyStateText(): Promise<string> {
    await this.page.waitForSelector(this.emptyState, { state: 'visible' });
    return (await this.page.locator(this.emptyState).textContent()) ?? '';
  }

  async getEmployeeRowCount(): Promise<number> {
    return this.page.locator(this.employeeRowPrefix).count();
  }

  async getEmployeeNameAtRow(index: number): Promise<string> {
    return (await this.page.locator(this.employeeRowPrefix).nth(index).locator(this.employeeName).textContent()) ?? '';
  }

  async getEmployeeEmailAtRow(index: number): Promise<string> {
    return (await this.page.locator(this.employeeRowPrefix).nth(index).locator(this.employeeEmail).textContent()) ?? '';
  }

  async getEmployeeDepartmentAtRow(index: number): Promise<string> {
    return (await this.page.locator(this.employeeRowPrefix).nth(index).locator(this.employeeDepartment).textContent()) ?? '';
  }

  async clickEmployeeRow(index: number): Promise<void> {
    await this.page.locator(this.employeeRowPrefix).nth(index).waitFor({ state: 'visible' });
    await this.page.locator(this.employeeRowPrefix).nth(index).click();
  }

  async getTableHeaderTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    return this.page.locator(`${this.employeeTable} th`).allTextContents();
  }

  async searchEmployees(query: string): Promise<void> {
    await this.page.waitForSelector(this.searchInput, { state: 'visible' });
    await this.page.fill(this.searchInput, query);
  }

  async clearSearchInput(): Promise<void> {
    await this.page.waitForSelector(this.searchInput, { state: 'visible' });
    await this.page.fill(this.searchInput, '');
  }

  async filterByDepartment(department: string): Promise<void> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    await this.page.selectOption(this.departmentFilter, department);
  }

  async filterByStatus(status: string): Promise<void> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    await this.page.selectOption(this.statusFilter, status);
  }

  async clearFilters(): Promise<void> {
    await this.page.waitForSelector(this.clearFiltersBtn, { state: 'visible' });
    await this.page.click(this.clearFiltersBtn);
  }

  async isClearFiltersButtonVisible(): Promise<boolean> {
    return this.page.locator(this.clearFiltersBtn).isVisible();
  }

  async isPaginationVisible(): Promise<boolean> {
    return this.page.locator(this.pagination).isVisible();
  }

  async getPaginationSummaryText(): Promise<string> {
    await this.page.waitForSelector(this.paginationSummary, { state: 'visible' });
    return (await this.page.locator(this.paginationSummary).textContent()) ?? '';
  }

  async getCurrentPageIndicator(): Promise<string> {
    await this.page.waitForSelector(this.paginationCurrent, { state: 'visible' });
    return (await this.page.locator(this.paginationCurrent).textContent()) ?? '';
  }

  async goToNextPage(): Promise<void> {
    await this.page.waitForSelector(this.nextPageBtn, { state: 'visible' });
    await Promise.all([
      this.page.waitForResponse((r) => r.url().includes('/api/employees') && r.status() === 200),
      this.page.click(this.nextPageBtn),
    ]);
  }

  async goToPreviousPage(): Promise<void> {
    await this.page.waitForSelector(this.prevPageBtn, { state: 'visible' });
    const isDisabled = await this.page.locator(this.prevPageBtn).isDisabled();
    if (isDisabled) {
      await this.page.click(this.prevPageBtn, { force: true });
      return;
    }
    await Promise.all([
      this.page.waitForResponse((r) => r.url().includes('/api/employees') && r.status() === 200),
      this.page.click(this.prevPageBtn),
    ]);
  }

  async isPreviousPageButtonDisabled(): Promise<boolean> {
    await this.page.waitForSelector(this.prevPageBtn, { state: 'visible' });
    return this.page.locator(this.prevPageBtn).isDisabled();
  }

  async isNextPageButtonDisabled(): Promise<boolean> {
    await this.page.waitForSelector(this.nextPageBtn, { state: 'visible' });
    return this.page.locator(this.nextPageBtn).isDisabled();
  }

  async navigateToLastPage(): Promise<void> {
    while (!(await this.isNextPageButtonDisabled())) {
      await this.goToNextPage();
      await this.page.waitForTimeout(300);
    }
  }

  async openAddEmployeeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible' });
    await this.page.click(this.addEmployeeBtn);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  async isDrawerVisible(): Promise<boolean> {
    return this.page.locator(this.employeeDrawer).isVisible();
  }

  async closeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.closeDrawerBtn, { state: 'visible' });
    await this.page.click(this.closeDrawerBtn);
  }

  async closeDrawerByOverlay(): Promise<void> {
    await this.page.waitForSelector(this.drawerOverlay, { state: 'visible' });
    await this.page.click(this.drawerOverlay, { force: true });
  }

  async fillEmployeeForm(data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    designation?: string;
    department?: string;
    employmentType?: string;
    employmentStatus?: string;
    startDate?: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }): Promise<void> {
    await this.page.waitForSelector(this.firstNameInput, { state: 'visible' });
    if (data.firstName !== undefined) await this.page.fill(this.firstNameInput, data.firstName);
    if (data.lastName !== undefined) await this.page.fill(this.lastNameInput, data.lastName);
    if (data.email !== undefined) await this.page.fill(this.emailInput, data.email);
    if (data.phone !== undefined) await this.page.fill(this.phoneInput, data.phone);
    if (data.designation !== undefined) await this.page.fill(this.designationInput, data.designation);
    if (data.department !== undefined) await this.page.selectOption(this.departmentSelect, data.department);
    if (data.employmentType !== undefined) await this.page.selectOption(this.employmentTypeSelect, data.employmentType);
    if (data.employmentStatus !== undefined) await this.page.selectOption(this.employmentStatusSelect, data.employmentStatus);
    if (data.startDate !== undefined) await this.page.fill(this.startDateInput, data.startDate);
    if (data.street !== undefined) await this.page.fill(this.streetInput, data.street);
    if (data.city !== undefined) await this.page.fill(this.cityInput, data.city);
    if (data.state !== undefined) await this.page.fill(this.stateInput, data.state);
    if (data.postalCode !== undefined) await this.page.fill(this.postalCodeInput, data.postalCode);
    if (data.country !== undefined) await this.page.fill(this.countryInput, data.country);
  }

  async submitEmployeeForm(): Promise<void> {
    await this.page.waitForSelector(this.submitBtn, { state: 'visible' });
    await this.page.click(this.submitBtn);
  }

  async cancelEmployeeForm(): Promise<void> {
    await this.page.waitForSelector(this.cancelBtn, { state: 'visible' });
    await this.page.click(this.cancelBtn);
  }

  async getFormFieldValue(field: string): Promise<string> {
    const selector = `[data-testid="${field}"]`;
    await this.page.waitForSelector(selector, { state: 'visible' });
    return this.page.locator(selector).inputValue();
  }

  async initiateDeleteEmployee(): Promise<void> {
    await this.page.waitForSelector(this.deleteBtn, { state: 'visible' });
    await this.page.click(this.deleteBtn);
  }

  async isConfirmDialogVisible(): Promise<boolean> {
    return this.page.locator(this.confirmDialog).isVisible();
  }

  async confirmDeleteEmployee(): Promise<void> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    await this.page.click(this.confirmDeleteBtn);
  }

  async cancelDeleteEmployee(): Promise<void> {
    await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible' });
    await this.page.click(this.confirmCancelBtn);
  }

  async isSuccessToastVisible(): Promise<boolean> {
    return this.page.locator(this.successToast).isVisible();
  }

  async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible' });
  }

  async isErrorBannerVisible(): Promise<boolean> {
    return this.page.locator(this.errorBanner).isVisible();
  }

  async getErrorBannerText(): Promise<string> {
    await this.page.waitForSelector(this.errorBanner, { state: 'visible' });
    return (await this.page.locator(this.errorBanner).textContent()) ?? '';
  }

  async isDrawerErrorVisible(): Promise<boolean> {
    return this.page.locator(this.drawerError).isVisible();
  }

  async getDrawerErrorText(): Promise<string> {
    await this.page.waitForSelector(this.drawerError, { state: 'visible' });
    return (await this.page.locator(this.drawerError).textContent()) ?? '';
  }

  async getFirstRowCellTexts(): Promise<string[]> {
    await this.page.locator(this.employeeRowPrefix).first().waitFor({ state: 'visible' });
    return this.page.locator(this.employeeRowPrefix).first().locator('td').allTextContents();
  }

  async waitForTableStable(): Promise<void> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    await this.page.waitForLoadState('networkidle');
  }
}