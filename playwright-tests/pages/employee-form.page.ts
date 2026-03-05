import { Page } from '@playwright/test';

export class EmployeeFormPage {
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
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

  private readonly submitBtn = '[data-testid="submit-btn"]';
  private readonly cancelBtn = '[data-testid="cancel-btn"]';
  private readonly deleteBtn = '[data-testid="delete-btn"]';

  private readonly successToast = '[data-testid="success-toast"]';
  private readonly errorBanner = '[data-testid="error-banner"]';
  private readonly employeeTable = '[data-testid="employee-table"]';

  private readonly confirmDialog = '[data-testid="confirm-dialog"]';
  private readonly confirmCancelBtn = '[data-testid="confirm-cancel-btn"]';
  private readonly confirmDeleteBtn = '[data-testid="confirm-delete-btn"]';

  constructor(private readonly page: Page) {}

  async navigateToEmployeeList(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForSelector(this.employeeTable, { state: 'visible' });
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

  async closeDrawerByOverlay(): Promise<void> {
    await this.page.waitForSelector(this.drawerOverlay, { state: 'visible' });
    await this.page.click(this.drawerOverlay);
  }

  async cancelForm(): Promise<void> {
    await this.page.waitForSelector(this.cancelBtn, { state: 'visible' });
    await this.page.click(this.cancelBtn);
  }

  async submitEmployeeForm(): Promise<void> {
    await this.page.waitForSelector(this.submitBtn, { state: 'visible' });
    await this.page.click(this.submitBtn);
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

  async fillPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.fill(this.phoneInput, value);
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

  async fillStartDate(value: string): Promise<void> {
    await this.page.waitForSelector(this.startDateInput, { state: 'visible' });
    await this.page.fill(this.startDateInput, value);
  }

  async fillStreet(value: string): Promise<void> {
    await this.page.waitForSelector(this.streetInput, { state: 'visible' });
    await this.page.fill(this.streetInput, value);
  }

  async fillCity(value: string): Promise<void> {
    await this.page.waitForSelector(this.cityInput, { state: 'visible' });
    await this.page.fill(this.cityInput, value);
  }

  async fillState(value: string): Promise<void> {
    await this.page.waitForSelector(this.stateInput, { state: 'visible' });
    await this.page.fill(this.stateInput, value);
  }

  async fillPostalCode(value: string): Promise<void> {
    await this.page.waitForSelector(this.postalCodeInput, { state: 'visible' });
    await this.page.fill(this.postalCodeInput, value);
  }

  async fillCountry(value: string): Promise<void> {
    await this.page.waitForSelector(this.countryInput, { state: 'visible' });
    await this.page.fill(this.countryInput, value);
  }

  async fillAllRequiredFields(data: {
    firstName: string;
    lastName: string;
    email: string;
    designation: string;
    department: string;
    employmentType: string;
    employmentStatus: string;
    startDate: string;
    street: string;
    city: string;
    country: string;
  }): Promise<void> {
    await this.fillFirstName(data.firstName);
    await this.fillLastName(data.lastName);
    await this.fillEmail(data.email);
    await this.fillDesignation(data.designation);
    await this.selectDepartment(data.department);
    await this.selectEmploymentType(data.employmentType);
    await this.selectEmploymentStatus(data.employmentStatus);
    await this.fillStartDate(data.startDate);
    await this.fillStreet(data.street);
    await this.fillCity(data.city);
    await this.fillCountry(data.country);
  }

  async isDrawerVisible(): Promise<boolean> {
    const locator = this.page.locator(this.employeeDrawer);
    return locator.isVisible();
  }

  async isFirstNameErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.firstNameError);
    return locator.isVisible();
  }

  async getFirstNameErrorText(): Promise<string> {
    await this.page.waitForSelector(this.firstNameError, { state: 'visible' });
    const locator = this.page.locator(this.firstNameError);
    return (await locator.textContent()) ?? '';
  }

  async isLastNameErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.lastNameError);
    return locator.isVisible();
  }

  async getLastNameErrorText(): Promise<string> {
    await this.page.waitForSelector(this.lastNameError, { state: 'visible' });
    const locator = this.page.locator(this.lastNameError);
    return (await locator.textContent()) ?? '';
  }

  async isEmailErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.emailError);
    return locator.isVisible();
  }

  async getEmailErrorText(): Promise<string> {
    await this.page.waitForSelector(this.emailError, { state: 'visible' });
    const locator = this.page.locator(this.emailError);
    return (await locator.textContent()) ?? '';
  }

  async isDesignationErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.designationError);
    return locator.isVisible();
  }

  async getDesignationErrorText(): Promise<string> {
    await this.page.waitForSelector(this.designationError, { state: 'visible' });
    const locator = this.page.locator(this.designationError);
    return (await locator.textContent()) ?? '';
  }

  async isDepartmentErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.departmentError);
    return locator.isVisible();
  }

  async getDepartmentErrorText(): Promise<string> {
    await this.page.waitForSelector(this.departmentError, { state: 'visible' });
    const locator = this.page.locator(this.departmentError);
    return (await locator.textContent()) ?? '';
  }

  async isEmploymentTypeErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.employmentTypeError);
    return locator.isVisible();
  }

  async getEmploymentTypeErrorText(): Promise<string> {
    await this.page.waitForSelector(this.employmentTypeError, { state: 'visible' });
    const locator = this.page.locator(this.employmentTypeError);
    return (await locator.textContent()) ?? '';
  }

  async isEmploymentStatusErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.employmentStatusError);
    return locator.isVisible();
  }

  async getEmploymentStatusErrorText(): Promise<string> {
    await this.page.waitForSelector(this.employmentStatusError, { state: 'visible' });
    const locator = this.page.locator(this.employmentStatusError);
    return (await locator.textContent()) ?? '';
  }

  async isStartDateErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.startDateError);
    return locator.isVisible();
  }

  async getStartDateErrorText(): Promise<string> {
    await this.page.waitForSelector(this.startDateError, { state: 'visible' });
    const locator = this.page.locator(this.startDateError);
    return (await locator.textContent()) ?? '';
  }

  async isAddressStreetErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.addressStreetError);
    return locator.isVisible();
  }

  async getAddressStreetErrorText(): Promise<string> {
    await this.page.waitForSelector(this.addressStreetError, { state: 'visible' });
    const locator = this.page.locator(this.addressStreetError);
    return (await locator.textContent()) ?? '';
  }

  async isAddressCityErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.addressCityError);
    return locator.isVisible();
  }

  async getAddressCityErrorText(): Promise<string> {
    await this.page.waitForSelector(this.addressCityError, { state: 'visible' });
    const locator = this.page.locator(this.addressCityError);
    return (await locator.textContent()) ?? '';
  }

  async isAddressCountryErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.addressCountryError);
    return locator.isVisible();
  }

  async getAddressCountryErrorText(): Promise<string> {
    await this.page.waitForSelector(this.addressCountryError, { state: 'visible' });
    const locator = this.page.locator(this.addressCountryError);
    return (await locator.textContent()) ?? '';
  }

  async getVisibleValidationErrorCount(): Promise<number> {
    const allErrorSelectors = [
      this.firstNameError,
      this.lastNameError,
      this.emailError,
      this.designationError,
      this.departmentError,
      this.employmentTypeError,
      this.employmentStatusError,
      this.startDateError,
      this.addressStreetError,
      this.addressCityError,
      this.addressCountryError,
    ];

    let count = 0;
    for (const selector of allErrorSelectors) {
      const isVisible = await this.page.locator(selector).isVisible();
      if (isVisible) {
        count++;
      }
    }
    return count;
  }

  async hasNoVisibleValidationErrors(): Promise<boolean> {
    const count = await this.getVisibleValidationErrorCount();
    return count === 0;
  }

  async isSuccessToastVisible(): Promise<boolean> {
    const locator = this.page.locator(this.successToast);
    return locator.isVisible();
  }

  async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible' });
  }

  async getSuccessToastText(): Promise<string> {
    await this.page.waitForSelector(this.successToast, { state: 'visible' });
    const locator = this.page.locator(this.successToast);
    return (await locator.textContent()) ?? '';
  }

  async isErrorBannerVisible(): Promise<boolean> {
    const locator = this.page.locator(this.errorBanner);
    return locator.isVisible();
  }

  async isDrawerErrorVisible(): Promise<boolean> {
    const locator = this.page.locator(this.drawerError);
    return locator.isVisible();
  }

  async getDrawerErrorText(): Promise<string> {
    await this.page.waitForSelector(this.drawerError, { state: 'visible' });
    const locator = this.page.locator(this.drawerError);
    return (await locator.textContent()) ?? '';
  }

  async isSubmitButtonVisible(): Promise<boolean> {
    const locator = this.page.locator(this.submitBtn);
    return locator.isVisible();
  }

  async isSubmitButtonEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.submitBtn, { state: 'visible' });
    const locator = this.page.locator(this.submitBtn);
    return locator.isEnabled();
  }

  async isFirstNameInputEmpty(): Promise<boolean> {
    await this.page.waitForSelector(this.firstNameInput, { state: 'visible' });
    const value = await this.page.locator(this.firstNameInput).inputValue();
    return value === '';
  }

  async isLastNameInputEmpty(): Promise<boolean> {
    await this.page.waitForSelector(this.lastNameInput, { state: 'visible' });
    const value = await this.page.locator(this.lastNameInput).inputValue();
    return value === '';
  }

  async isEmailInputEmpty(): Promise<boolean> {
    await this.page.waitForSelector(this.emailInput, { state: 'visible' });
    const value = await this.page.locator(this.emailInput).inputValue();
    return value === '';
  }

  async clickEmployeeRow(employeeId: string): Promise<void> {
    const rowSelector = `[data-testid="employee-row-${employeeId}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    await this.page.click(rowSelector);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  async deleteEmployee(): Promise<void> {
    await this.page.waitForSelector(this.deleteBtn, { state: 'visible' });
    await this.page.click(this.deleteBtn);
    await this.page.waitForSelector(this.confirmDialog, { state: 'visible' });
  }

  async confirmDeletion(): Promise<void> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    await this.page.click(this.confirmDeleteBtn);
  }

  async cancelDeletion(): Promise<void> {
    await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible' });
    await this.page.click(this.confirmCancelBtn);
  }

  async isConfirmDialogVisible(): Promise<boolean> {
    const locator = this.page.locator(this.confirmDialog);
    return locator.isVisible();
  }

  async createEmployeeViaApi(payload: {
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
      street: string;
      city: string;
      state?: string;
      postalCode?: string;
      country: string;
    };
  }): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const result = await this.page.evaluate(async ({ url, method, body }) => {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, body: data as Record<string, unknown> | null };
    }, { url: '/api/employees', method: 'POST', body: payload });
    return result;
  }
}