import { Page } from '@playwright/test';

export class EmployeeDrawerPage {
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly errorBanner = '[data-testid="error-banner"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly emptyState = '[data-testid="empty-state"]';
  private readonly employeeName = '[data-testid="employee-name"]';
  private readonly paginationSummary = '[data-testid="pagination-summary"]';

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

  private readonly confirmDialog = '[data-testid="confirm-dialog"]';
  private readonly confirmCancelBtn = '[data-testid="confirm-cancel-btn"]';
  private readonly confirmDeleteBtn = '[data-testid="confirm-delete-btn"]';

  constructor(private readonly page: Page) {}

  // ─── NAVIGATION ──────────────────────────────────────────────

  public async navigateToEmployeesPage(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible' });
  }

  // ─── ADD EMPLOYEE DRAWER ────────────────────────────────────

  public async openAddEmployeeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible' });
    await this.page.click(this.addEmployeeBtn);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  public async closeDrawerWithCloseButton(): Promise<void> {
    await this.page.waitForSelector(this.closeDrawerBtn, { state: 'visible' });
    await this.page.click(this.closeDrawerBtn);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'hidden' });
  }

  public async closeDrawerByClickingOverlay(): Promise<void> {
    await this.page.waitForSelector(this.drawerOverlay, { state: 'visible' });
    await this.page.click(this.drawerOverlay, { force: true });
    await this.page.waitForSelector(this.employeeDrawer, { state: 'hidden' });
  }

  public async cancelDrawerForm(): Promise<void> {
    await this.page.waitForSelector(this.cancelBtn, { state: 'visible' });
    await this.page.click(this.cancelBtn);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'hidden' });
  }

  public async isDrawerVisible(): Promise<boolean> {
    const locator = this.page.locator(this.employeeDrawer);
    return locator.isVisible();
  }

  // ─── FORM FILL METHODS ──────────────────────────────────────

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

  public async selectDepartment(value: string): Promise<void> {
    await this.page.waitForSelector(this.departmentSelect, { state: 'visible' });
    await this.page.selectOption(this.departmentSelect, value);
  }

  public async selectEmploymentType(value: string): Promise<void> {
    await this.page.waitForSelector(this.employmentTypeSelect, { state: 'visible' });
    await this.page.selectOption(this.employmentTypeSelect, value);
  }

  public async selectEmploymentStatus(value: string): Promise<void> {
    await this.page.waitForSelector(this.employmentStatusSelect, { state: 'visible' });
    await this.page.selectOption(this.employmentStatusSelect, value);
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

  // ─── FORM READ METHODS ──────────────────────────────────────

  public async getFirstNameValue(): Promise<string> {
    const locator = this.page.locator(this.firstNameInput);
    await locator.waitFor({ state: 'visible' });
    return locator.inputValue();
  }

  public async getLastNameValue(): Promise<string> {
    const locator = this.page.locator(this.lastNameInput);
    await locator.waitFor({ state: 'visible' });
    return locator.inputValue();
  }

  public async getEmailValue(): Promise<string> {
    const locator = this.page.locator(this.emailInput);
    await locator.waitFor({ state: 'visible' });
    return locator.inputValue();
  }

  public async getPhoneValue(): Promise<string> {
    const locator = this.page.locator(this.phoneInput);
    await locator.waitFor({ state: 'visible' });
    return locator.inputValue();
  }

  public async getDesignationValue(): Promise<string> {
    const locator = this.page.locator(this.designationInput);
    await locator.waitFor({ state: 'visible' });
    return locator.inputValue();
  }

  // ─── FORM SUBMISSION ────────────────────────────────────────

  public async submitEmployeeForm(): Promise<void> {
    await this.page.waitForSelector(this.submitBtn, { state: 'visible' });
    await this.page.click(this.submitBtn);
  }

  // ─── VALIDATION ERROR QUERIES ───────────────────────────────

  public async isFirstNameErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.firstNameError);
    return locator.isVisible();
  }

  public async getFirstNameErrorText(): Promise<string> {
    const locator = this.page.locator(this.firstNameError);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  public async isLastNameErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.lastNameError);
    return locator.isVisible();
  }

  public async getLastNameErrorText(): Promise<string> {
    const locator = this.page.locator(this.lastNameError);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  public async isEmailErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.emailError);
    return locator.isVisible();
  }

  public async getEmailErrorText(): Promise<string> {
    const locator = this.page.locator(this.emailError);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  public async isDesignationErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.designationError);
    return locator.isVisible();
  }

  public async getDesignationErrorText(): Promise<string> {
    const locator = this.page.locator(this.designationError);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  public async isDepartmentErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.departmentError);
    return locator.isVisible();
  }

  public async getDepartmentErrorText(): Promise<string> {
    const locator = this.page.locator(this.departmentError);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  public async isEmploymentTypeErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.employmentTypeError);
    return locator.isVisible();
  }

  public async getEmploymentTypeErrorText(): Promise<string> {
    const locator = this.page.locator(this.employmentTypeError);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  public async isEmploymentStatusErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.employmentStatusError);
    return locator.isVisible();
  }

  public async getEmploymentStatusErrorText(): Promise<string> {
    const locator = this.page.locator(this.employmentStatusError);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  public async isStartDateErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.startDateError);
    return locator.isVisible();
  }

  public async getStartDateErrorText(): Promise<string> {
    const locator = this.page.locator(this.startDateError);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  public async isAddressStreetErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.addressStreetError);
    return locator.isVisible();
  }

  public async isAddressCityErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.addressCityError);
    return locator.isVisible();
  }

  public async isAddressCountryErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.addressCountryError);
    return locator.isVisible();
  }

  public async isDrawerErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.drawerError);
    return locator.isVisible();
  }

  public async getDrawerErrorText(): Promise<string> {
    const locator = this.page.locator(this.drawerError);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  // ─── SUCCESS TOAST ──────────────────────────────────────────

  public async isSuccessToastVisible(): Promise<boolean> {
    const locator = this.page.locator(this.successToast);
    return locator.isVisible();
  }

  public async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible' });
  }

  public async getSuccessToastText(): Promise<string> {
    const locator = this.page.locator(this.successToast);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  // ─── EMPLOYEE LIST QUERIES ──────────────────────────────────

  public async isAddEmployeeButtonVisible(): Promise<boolean> {
    const locator = this.page.locator(this.addEmployeeBtn);
    return locator.isVisible();
  }

  public async isEmployeeTableVisible(): Promise<boolean> {
    const locator = this.page.locator(this.employeeTable);
    return locator.isVisible();
  }

  public async getEmployeeRowCount(): Promise<number> {
    const locator = this.page.locator(this.employeeName);
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    return locator.count();
  }

  public async getAllEmployeeNames(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    const locator = this.page.locator(this.employeeName);
    return locator.allInnerTexts();
  }

  public async isEmployeeInList(fullName: string): Promise<boolean> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    const names = await this.page.locator(this.employeeName).allInnerTexts();
    return names.some((name) => name.includes(fullName));
  }

  public async getEmployeeRowByName(fullName: string): Promise<string | null> {
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
    const nameLocators = this.page.locator(this.employeeName);
    const count = await nameLocators.count();
    for (let i = 0; i < count; i++) {
      const text = await nameLocators.nth(i).innerText();
      if (text.includes(fullName)) {
        return text;
      }
    }
    return null;
  }

  public async isEmptyStateVisible(): Promise<boolean> {
    const locator = this.page.locator(this.emptyState);
    return locator.isVisible();
  }

  public async isLoadingVisible(): Promise<boolean> {
    const locator = this.page.locator(this.loadingRow);
    return locator.isVisible();
  }

  public async waitForLoadingToDisappear(): Promise<void> {
    await this.page.waitForSelector(this.loadingRow, { state: 'hidden' });
  }

  public async waitForDrawerToClose(): Promise<void> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'hidden' });
  }

  public async getPaginationSummaryText(): Promise<string> {
    const locator = this.page.locator(this.paginationSummary);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }

  // ─── CONFIRM DIALOG ─────────────────────────────────────────

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

  public async clickDeleteEmployee(): Promise<void> {
    await this.page.waitForSelector(this.deleteBtn, { state: 'visible' });
    await this.page.click(this.deleteBtn);
  }

  // ─── ERROR BANNER ───────────────────────────────────────────

  public async isErrorBannerVisible(): Promise<boolean> {
    const locator = this.page.locator(this.errorBanner);
    return locator.isVisible();
  }

  public async getErrorBannerText(): Promise<string> {
    const locator = this.page.locator(this.errorBanner);
    await locator.waitFor({ state: 'visible' });
    return locator.innerText();
  }
}