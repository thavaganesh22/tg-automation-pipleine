import { Page } from '@playwright/test';

export class EmployeesPagePage {
  private readonly page: Page;

  // PAGE / TABLE selectors
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

  // DRAWER selectors
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly drawerOverlay = '[data-testid="drawer-overlay"]';
  private readonly closeDrawerBtn = '[data-testid="close-drawer-btn"]';
  private readonly drawerError = '[data-testid="drawer-error"]';

  // FORM selectors
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
  private readonly firstNameError = '[data-testid="firstName-error"]';
  private readonly lastNameError = '[data-testid="lastName-error"]';
  private readonly emailError = '[data-testid="email-error"]';
  private readonly designationError = '[data-testid="designation-error"]';
  private readonly departmentError = '[data-testid="department-error"]';
  private readonly employmentTypeError = '[data-testid="employmentType-error"]';
  private readonly employmentStatusError = '[data-testid="employmentStatus-error"]';
  private readonly startDateError = '[data-testid="startDate-error"]';
  private readonly addressStreetError = '[data-testid="address-street-error"]';
  private readonly addressCityError = '[data-testid="address-city-error"]';
  private readonly addressCountryError = '[data-testid="address-country-error"]';
  private readonly deleteBtn = '[data-testid="delete-btn"]';
  private readonly cancelBtn = '[data-testid="cancel-btn"]';
  private readonly submitBtn = '[data-testid="submit-btn"]';

  // CONFIRM DIALOG selectors
  private readonly confirmDialog = '[data-testid="confirm-dialog"]';
  private readonly modalOverlay = '[data-testid="modal-overlay"]';
  private readonly confirmCancelBtn = '[data-testid="confirm-cancel-btn"]';
  private readonly confirmDeleteBtn = '[data-testid="confirm-delete-btn"]';

  constructor(page: Page) {
    this.page = page;
  }

  // ─── NAVIGATION ───────────────────────────────────────────────────────────────

  public async navigateToEmployeesPage(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
  }

  // ─── LOADING STATE ────────────────────────────────────────────────────────────

  public async waitForTableToLoad(): Promise<void> {
    // Wait for loading row to disappear (if it exists)
    await this.page.waitForSelector(this.loadingRow, { state: 'hidden' }).catch(() => {
      // loading row may never appear if data loads instantly
    });
    // Ensure the table itself is visible
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
  }

  public async isLoadingIndicatorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.loadingRow);
    return locator.isVisible();
  }

  // ─── TABLE QUERIES ────────────────────────────────────────────────────────────

  public async getEmployeeRowCount(): Promise<number> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    const locator = this.page.locator(this.employeeTable).locator('tbody tr').filter({ hasNot: this.page.locator(this.loadingRow) }).filter({ hasNot: this.page.locator(this.emptyState) });
    // Use a more reliable approach: count rows that have employee-name cells
    const nameLocator = this.page.locator(this.employeeName);
    return nameLocator.count();
  }

  public async isEmployeeTableVisible(): Promise<boolean> {
    const locator = this.page.locator(this.employeeTable);
    return locator.isVisible();
  }

  public async getTableHeaderTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    const headers = this.page.locator(this.employeeTable).locator('th');
    const count = await headers.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await headers.nth(i).innerText();
      texts.push(text.trim());
    }
    return texts;
  }

  // ─── EMPLOYEE ROW DATA ────────────────────────────────────────────────────────

  public async getEmployeeNameByIndex(index: number): Promise<string> {
    await this.page.waitForSelector(this.employeeName, { state: 'visible' });
    const locator = this.page.locator(this.employeeName).nth(index);
    return (await locator.innerText()).trim();
  }

  public async getEmployeeDepartmentByIndex(index: number): Promise<string> {
    await this.page.waitForSelector(this.employeeDepartment, { state: 'visible' });
    const locator = this.page.locator(this.employeeDepartment).nth(index);
    return (await locator.innerText()).trim();
  }

  public async getEmployeeEmailByIndex(index: number): Promise<string> {
    await this.page.waitForSelector(this.employeeEmail, { state: 'visible' });
    const locator = this.page.locator(this.employeeEmail).nth(index);
    return (await locator.innerText()).trim();
  }

  public async getAllEmployeeNames(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    const locator = this.page.locator(this.employeeName);
    const count = await locator.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await locator.nth(i).innerText();
      names.push(text.trim());
    }
    return names;
  }

  public async getAllEmployeeDepartments(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    const locator = this.page.locator(this.employeeDepartment);
    const count = await locator.count();
    const departments: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await locator.nth(i).innerText();
      departments.push(text.trim());
    }
    return departments;
  }

  public async getEmployeeRowDataByRowId(rowId: string): Promise<{ name: string; email: string; department: string }> {
    const rowSelector = `[data-testid="employee-row-${rowId}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    const row = this.page.locator(rowSelector);
    const name = (await row.locator(this.employeeName).innerText()).trim();
    const email = (await row.locator(this.employeeEmail).innerText()).trim();
    const department = (await row.locator(this.employeeDepartment).innerText()).trim();
    return { name, email, department };
  }

  public async isEmployeeRowVisible(rowId: string): Promise<boolean> {
    const rowSelector = `[data-testid="employee-row-${rowId}"]`;
    const locator = this.page.locator(rowSelector);
    return locator.isVisible();
  }

  public async clickEmployeeRow(rowId: string): Promise<void> {
    const rowSelector = `[data-testid="employee-row-${rowId}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    await this.page.click(rowSelector);
  }

  // ─── EMPTY STATE ──────────────────────────────────────────────────────────────

  public async isEmptyStateVisible(): Promise<boolean> {
    const locator = this.page.locator(this.emptyState);
    return locator.isVisible();
  }

  public async getEmptyStateText(): Promise<string> {
    await this.page.waitForSelector(this.emptyState, { state: 'visible' });
    const locator = this.page.locator(this.emptyState);
    return (await locator.innerText()).trim();
  }

  // ─── ERROR BANNER ─────────────────────────────────────────────────────────────

  public async isErrorBannerVisible(): Promise<boolean> {
    const locator = this.page.locator(this.errorBanner);
    return locator.isVisible();
  }

  public async getErrorBannerText(): Promise<string> {
    await this.page.waitForSelector(this.errorBanner, { state: 'visible' });
    const locator = this.page.locator(this.errorBanner);
    return (await locator.innerText()).trim();
  }

  // ─── SUCCESS TOAST ────────────────────────────────────────────────────────────

  public async isSuccessToastVisible(): Promise<boolean> {
    const locator = this.page.locator(this.successToast);
    return locator.isVisible();
  }

  public async getSuccessToastText(): Promise<string> {
    await this.page.waitForSelector(this.successToast, { state: 'visible' });
    const locator = this.page.locator(this.successToast);
    return (await locator.innerText()).trim();
  }

  // ─── SEARCH ───────────────────────────────────────────────────────────────────

  public async searchEmployeeByName(searchTerm: string): Promise<void> {
    await this.page.waitForSelector(this.searchInput, { state: 'visible' });
    await this.page.fill(this.searchInput, searchTerm);
  }

  public async clearSearchInput(): Promise<void> {
    await this.page.waitForSelector(this.searchInput, { state: 'visible' });
    await this.page.fill(this.searchInput, '');
  }

  public async getSearchInputValue(): Promise<string> {
    await this.page.waitForSelector(this.searchInput, { state: 'visible' });
    return this.page.locator(this.searchInput).inputValue();
  }

  public async isSearchInputVisible(): Promise<boolean> {
    const locator = this.page.locator(this.searchInput);
    return locator.isVisible();
  }

  // ─── DEPARTMENT FILTER ────────────────────────────────────────────────────────

  public async filterByDepartment(department: string): Promise<void> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    await this.page.selectOption(this.departmentFilter, { label: department });
  }

  public async filterByDepartmentValue(value: string): Promise<void> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    await this.page.selectOption(this.departmentFilter, value);
  }

  public async getDepartmentFilterValue(): Promise<string> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    return this.page.locator(this.departmentFilter).inputValue();
  }

  public async getDepartmentFilterOptions(): Promise<string[]> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    const options = this.page.locator(this.departmentFilter).locator('option');
    const count = await options.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).innerText();
      labels.push(text.trim());
    }
    return labels;
  }

  public async resetDepartmentFilter(): Promise<void> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    // Select the first option (default/all departments)
    const firstOptionValue = await this.page.locator(this.departmentFilter).locator('option').first().getAttribute('value');
    await this.page.selectOption(this.departmentFilter, firstOptionValue ?? '');
  }

  // ─── STATUS FILTER ────────────────────────────────────────────────────────────

  public async filterByStatus(status: string): Promise<void> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    await this.page.selectOption(this.statusFilter, { label: status });
  }

  public async filterByStatusValue(value: string): Promise<void> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    await this.page.selectOption(this.statusFilter, value);
  }

  public async getStatusFilterValue(): Promise<string> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    return this.page.locator(this.statusFilter).inputValue();
  }

  public async getStatusFilterOptions(): Promise<string[]> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    const options = this.page.locator(this.statusFilter).locator('option');
    const count = await options.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).innerText();
      labels.push(text.trim());
    }
    return labels;
  }

  public async resetStatusFilter(): Promise<void> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    const firstOptionValue = await this.page.locator(this.statusFilter).locator('option').first().getAttribute('value');
    await this.page.selectOption(this.statusFilter, firstOptionValue ?? '');
  }

  // ─── CLEAR FILTERS ───────────────────────────────────────────────────────────

  public async clearAllFilters(): Promise<void> {
    await this.page.waitForSelector(this.clearFiltersBtn, { state: 'visible' });
    await this.page.click(this.clearFiltersBtn);
  }

  public async isClearFiltersButtonVisible(): Promise<boolean> {
    const locator = this.page.locator(this.clearFiltersBtn);
    return locator.isVisible();
  }

  // ─── WAIT FOR TABLE UPDATE ────────────────────────────────────────────────────

  public async waitForTableUpdate(): Promise<void> {
    // Small wait for debounce/filter to take effect, then wait for loading to finish
    await this.page.waitForTimeout(500);
    await this.page.waitForSelector(this.loadingRow, { state: 'hidden' }).catch(() => {
      // loading row may not appear
    });
  }

  // ─── ADD EMPLOYEE ─────────────────────────────────────────────────────────────

  public async openAddEmployeeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible' });
    await this.page.click(this.addEmployeeBtn);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  // ─── DRAWER ───────────────────────────────────────────────────────────────────

  public async isDrawerVisible(): Promise<boolean> {
    const locator = this.page.locator(this.employeeDrawer);
    return locator.isVisible();
  }

  public async closeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.closeDrawerBtn, { state: 'visible' });
    await this.page.click(this.closeDrawerBtn);
  }

  public async closeDrawerByOverlayClick(): Promise<void> {
    await this.page.waitForSelector(this.drawerOverlay, { state: 'visible' });
    await this.page.click(this.drawerOverlay);
  }

  public async getDrawerErrorText(): Promise<string> {
    await this.page.waitForSelector(this.drawerError, { state: 'visible' });
    return (await this.page.locator(this.drawerError).innerText()).trim();
  }

  public async isDrawerErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.drawerError);
    return locator.isVisible();
  }

  // ─── FORM ACTIONS ─────────────────────────────────────────────────────────────

  public async fillFirstName(value: string): Promise<void> {
    await this.page.waitForSelector(this.firstNameInput, { state: 'visible' });
    await this.page.fill(this.firstNameInput, value);
  }

  public async fillLastName(value: string): Promise<void> {
    await this.page.waitForSelector(this.lastNameInput, { state: 'visible' });
    await this.page.fill(this.lastNameInput, value);
  }

  public async fillEmail(value: string): Promise<void> {
    await this.page.waitForSelector(this.emailInput, { state: 'visible' });
    await this.page.fill(this.emailInput, value);
  }

  public async fillPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.fill(this.phoneInput, value);
  }

  public async fillDesignation(value: string): Promise<void> {
    await this.page.waitForSelector(this.designationInput, { state: 'visible' });
    await this.page.fill(this.designationInput, value);
  }

  public async selectDepartment(department: string): Promise<void> {
    await this.page.waitForSelector(this.departmentSelect, { state: 'visible' });
    await this.page.selectOption(this.departmentSelect, { label: department });
  }

  public async selectEmploymentType(employmentType: string): Promise<void> {
    await this.page.waitForSelector(this.employmentTypeSelect, { state: 'visible' });
    await this.page.selectOption(this.employmentTypeSelect, { label: employmentType });
  }

  public async selectEmploymentStatus(status: string): Promise<void> {
    await this.page.waitForSelector(this.employmentStatusSelect, { state: 'visible' });
    await this.page.selectOption(this.employmentStatusSelect, { label: status });
  }

  public async fillStartDate(value: string): Promise<void> {
    await this.page.waitForSelector(this.startDateInput, { state: 'visible' });
    await this.page.fill(this.startDateInput, value);
  }

  public async fillStreet(value: string): Promise<void> {
    await this.page.waitForSelector(this.streetInput, { state: 'visible' });
    await this.page.fill(this.streetInput, value);
  }

  public async fillCity(value: string): Promise<void> {
    await this.page.waitForSelector(this.cityInput, { state: 'visible' });
    await this.page.fill(this.cityInput, value);
  }

  public async fillState(value: string): Promise<void> {
    await this.page.waitForSelector(this.stateInput, { state: 'visible' });
    await this.page.fill(this.stateInput, value);
  }

  public async fillPostalCode(value: string): Promise<void> {
    await this.page.waitForSelector(this.postalCodeInput, { state: 'visible' });
    await this.page.fill(this.postalCodeInput, value);
  }

  public async fillCountry(value: string): Promise<void> {
    await this.page.waitForSelector(this.countryInput, { state: 'visible' });
    await this.page.fill(this.countryInput, value);
  }

  public async submitEmployeeForm(): Promise<void> {
    await this.page.waitForSelector(this.submitBtn, { state: 'visible' });
    await this.page.click(this.submitBtn);
  }

  public async cancelEmployeeForm(): Promise<void> {
    await this.page.waitForSelector(this.cancelBtn, { state: 'visible' });
    await this.page.click(this.cancelBtn);
  }

  public async initiateDeleteEmployee(): Promise<void> {
    await this.page.waitForSelector(this.deleteBtn, { state: 'visible' });
    await this.page.click(this.deleteBtn);
  }

  // ─── FORM VALIDATION ERRORS ───────────────────────────────────────────────────

  public async getFirstNameError(): Promise<string> {
    await this.page.waitForSelector(this.firstNameError, { state: 'visible' });
    return (await this.page.locator(this.firstNameError).innerText()).trim();
  }

  public async getLastNameError(): Promise<string> {
    await this.page.waitForSelector(this.lastNameError, { state: 'visible' });
    return (await this.page.locator(this.lastNameError).innerText()).trim();
  }

  public async getEmailError(): Promise<string> {
    await this.page.waitForSelector(this.emailError, { state: 'visible' });
    return (await this.page.locator(this.emailError).innerText()).trim();
  }

  public async getDesignationError(): Promise<string> {
    await this.page.waitForSelector(this.designationError, { state: 'visible' });
    return (await this.page.locator(this.designationError).innerText()).trim();
  }

  public async getDepartmentFormError(): Promise<string> {
    await this.page.waitForSelector(this.departmentError, { state: 'visible' });
    return (await this.page.locator(this.departmentError).innerText()).trim();
  }

  public async getEmploymentTypeError(): Promise<string> {
    await this.page.waitForSelector(this.employmentTypeError, { state: 'visible' });
    return (await this.page.locator(this.employmentTypeError).innerText()).trim();
  }

  public async getEmploymentStatusError(): Promise<string> {
    await this.page.waitForSelector(this.employmentStatusError, { state: 'visible' });
    return (await this.page.locator(this.employmentStatusError).innerText()).trim();
  }

  public async getStartDateError(): Promise<string> {
    await this.page.waitForSelector(this.startDateError, { state: 'visible' });
    return (await this.page.locator(this.startDateError).innerText()).trim();
  }

  public async getAddressStreetError(): Promise<string> {
    await this.page.waitForSelector(this.addressStreetError, { state: 'visible' });
    return (await this.page.locator(this.addressStreetError).innerText()).trim();
  }

  public async getAddressCityError(): Promise<string> {
    await this.page.waitForSelector(this.addressCityError, { state: 'visible' });
    return (await this.page.locator(this.addressCityError).innerText()).trim();
  }

  public async getAddressCountryError(): Promise<string> {
    await this.page.waitForSelector(this.addressCountryError, { state: 'visible' });
    return (await this.page.locator(this.addressCountryError).innerText()).trim();
  }

  // ─── CONFIRM DIALOG ──────────────────────────────────────────────────────────

  public async isConfirmDialogVisible(): Promise<boolean> {
    const locator = this.page.locator(this.confirmDialog);
    return locator.isVisible();
  }

  public async confirmDeletion(): Promise<void> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    await this.page.click(this.confirmDeleteBtn);
  }

  public async cancelDeletion(): Promise<void> {
    await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible' });
    await this.page.click(this.confirmCancelBtn);
  }

  // ─── PAGINATION ───────────────────────────────────────────────────────────────

  public async isPaginationVisible(): Promise<boolean> {
    const locator = this.page.locator(this.pagination);
    return locator.isVisible();
  }

  public async getPaginationSummaryText(): Promise<string> {
    await this.page.waitForSelector(this.paginationSummary, { state: 'visible' });
    return (await this.page.locator(this.paginationSummary).innerText()).trim();
  }

  public async getPaginationCurrentText(): Promise<string> {
    await this.page.waitForSelector(this.paginationCurrent, { state: 'visible' });
    return (await this.page.locator(this.paginationCurrent).innerText()).trim();
  }

  public async goToNextPage(): Promise<void> {
    await this.page.waitForSelector(this.nextPageBtn, { state: 'visible' });
    await this.page.click(this.nextPageBtn);
  }

  public async goToPreviousPage(): Promise<void> {
    await this.page.waitForSelector(this.prevPageBtn, { state: 'visible' });
    await this.page.click(this.prevPageBtn);
  }

  public async isNextPageButtonEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.nextPageBtn, { state: 'visible' });
    return this.page.locator(this.nextPageBtn).isEnabled();
  }

  public async isPreviousPageButtonEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.prevPageBtn, { state: 'visible' });
    return this.page.locator(this.prevPageBtn).isEnabled();
  }

  // ─── API HELPERS ──────────────────────────────────────────────────────────────

  public async createEmployeeViaApi(payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    designation: string;
    department: string;
    employmentType: string;
    employmentStatus: string;
    startDate: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  }): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const result = await this.page.evaluate(async ({ url, method, body }) => {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, body: data };
    }, { url: '/api/employees', method: 'POST', body: payload });
    return result as { status: number; body: Record<string, unknown> | null };
  }

  public async deleteEmployeeViaApi(employeeId: string): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const result = await this.page.evaluate(async ({ url, method }) => {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, body: data };
    }, { url: `/api/employees/${employeeId}`, method: 'DELETE' });
    return result as { status: number; body: Record<string, unknown> | null };
  }

  public async fetchEmployeesViaApi(): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const result = await this.page.evaluate(async ({ url, method }) => {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, body: data };
    }, { url: '/api/employees', method: 'GET' });
    return result as { status: number; body: Record<string, unknown> | null };
  }
}