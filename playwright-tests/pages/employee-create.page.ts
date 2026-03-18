import { Page } from '@playwright/test';

export class EmployeeCreatePage {
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly closeDrawerBtn = '[data-testid="close-drawer-btn"]';
  private readonly successToast = '[data-testid="success-toast"]';
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
  private readonly cancelBtn = '[data-testid="cancel-btn"]';
  private readonly submitBtn = '[data-testid="submit-btn"]';
  private readonly firstNameError = '[data-testid="firstName-error"]';
  private readonly lastNameError = '[data-testid="lastName-error"]';
  private readonly emailError = '[data-testid="email-error"]';
  private readonly designationError = '[data-testid="designation-error"]';
  private readonly departmentError = '[data-testid="department-error"]';
  private readonly employmentTypeError = '[data-testid="employmentType-error"]';
  private readonly addressStreetError = '[data-testid="address-street-error"]';
  private readonly addressCityError = '[data-testid="address-city-error"]';
  private readonly addressCountryError = '[data-testid="address-country-error"]';
  private readonly phoneInput = '[data-testid="phone-input"]';
  private readonly cellPhoneInput = '[data-testid="cellPhone-input"]';
  private readonly phoneError = '[data-testid="phone-error"]';
  private readonly cellPhoneError = '[data-testid="cellPhone-error"]';
  private readonly drawerError = '[data-testid="drawer-error"]';
  private readonly employmentStatusError = '[data-testid="employmentStatus-error"]';
  private readonly startDateError = '[data-testid="startDate-error"]';
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
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    const row = this.page.locator('[data-testid^="employee-row-"]').first();
    const testId = await row.getAttribute('data-testid');
    if (!testId) throw new Error('No visible employee rows');
    return testId.replace('employee-row-', '');
  }

  async createEmployee(payload: { firstName: string; lastName: string; email: string; designation: string; department: string; employmentType: string; employmentStatus: string; startDate: string; address: { street: string; city: string; country: string }; phone?: string; cellPhone?: string }): Promise<string> {
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

  async openAddEmployeeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible' });
    await this.page.click(this.addEmployeeBtn);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  async isDrawerVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.employeeDrawer, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isDrawerHidden(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.employeeDrawer, { state: 'hidden', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
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

  async fillStartDate(value: string): Promise<void> {
    await this.page.waitForSelector(this.startDateInput, { state: 'visible' });
    await this.page.fill(this.startDateInput, value);
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

  async cancelDrawer(): Promise<void> {
    await this.page.waitForSelector(this.cancelBtn, { state: 'visible' });
    await this.page.click(this.cancelBtn);
  }

  async closeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.closeDrawerBtn, { state: 'visible' });
    await this.page.click(this.closeDrawerBtn);
  }

  async waitForSuccessToast(): Promise<void> {
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
  }

  async getFirstNameValue(): Promise<string> {
    await this.page.waitForSelector(this.firstNameInput, { state: 'visible' });
    return this.page.locator(this.firstNameInput).inputValue();
  }

  async getLastNameValue(): Promise<string> {
    await this.page.waitForSelector(this.lastNameInput, { state: 'visible' });
    return this.page.locator(this.lastNameInput).inputValue();
  }

  async getEmailValue(): Promise<string> {
    await this.page.waitForSelector(this.emailInput, { state: 'visible' });
    return this.page.locator(this.emailInput).inputValue();
  }

  async getDepartmentValue(): Promise<string> {
    await this.page.waitForSelector(this.departmentSelect, { state: 'visible' });
    return this.page.locator(this.departmentSelect).inputValue();
  }

  async getEmploymentTypeValue(): Promise<string> {
    await this.page.waitForSelector(this.employmentTypeSelect, { state: 'visible' });
    return this.page.locator(this.employmentTypeSelect).inputValue();
  }

  async getEmploymentStatusValue(): Promise<string> {
    await this.page.waitForSelector(this.employmentStatusSelect, { state: 'visible' });
    return this.page.locator(this.employmentStatusSelect).inputValue();
  }

  async getStartDateValue(): Promise<string> {
    await this.page.waitForSelector(this.startDateInput, { state: 'visible' });
    return this.page.locator(this.startDateInput).inputValue();
  }

  async isFirstNameErrorVisible(): Promise<boolean> {
    return this.page.locator(this.firstNameError).isVisible();
  }

  async isLastNameErrorVisible(): Promise<boolean> {
    return this.page.locator(this.lastNameError).isVisible();
  }

  async isEmailErrorVisible(): Promise<boolean> {
    return this.page.locator(this.emailError).isVisible();
  }

  async isDesignationErrorVisible(): Promise<boolean> {
    return this.page.locator(this.designationError).isVisible();
  }

  async isDepartmentErrorVisible(): Promise<boolean> {
    return this.page.locator(this.departmentError).isVisible();
  }

  async isEmploymentTypeErrorVisible(): Promise<boolean> {
    return this.page.locator(this.employmentTypeError).isVisible();
  }

  async isStreetErrorVisible(): Promise<boolean> {
    return this.page.locator(this.addressStreetError).isVisible();
  }

  async isCityErrorVisible(): Promise<boolean> {
    return this.page.locator(this.addressCityError).isVisible();
  }

  async isCountryErrorVisible(): Promise<boolean> {
    return this.page.locator(this.addressCountryError).isVisible();
  }

  async getFirstNameErrorText(): Promise<string> {
    await this.page.waitForSelector(this.firstNameError, { state: 'visible' });
    return this.page.locator(this.firstNameError).innerText();
  }

  async getLastNameErrorText(): Promise<string> {
    await this.page.waitForSelector(this.lastNameError, { state: 'visible' });
    return this.page.locator(this.lastNameError).innerText();
  }

  async getEmailErrorText(): Promise<string> {
    await this.page.waitForSelector(this.emailError, { state: 'visible' });
    return this.page.locator(this.emailError).innerText();
  }

  async getDesignationErrorText(): Promise<string> {
    await this.page.waitForSelector(this.designationError, { state: 'visible' });
    return this.page.locator(this.designationError).innerText();
  }

  async isAddEmployeeBtnVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getEmployeeNameFromRow(id: string): Promise<string> {
    const row = this.page.locator(`[data-testid="employee-row-${id}"]`);
    return row.locator('[data-testid="employee-name"]').innerText();
  }

  async getEmployeeEmailFromRow(id: string): Promise<string> {
    const row = this.page.locator(`[data-testid="employee-row-${id}"]`);
    return row.locator('[data-testid="employee-email"]').innerText();
  }

  // --- New methods for phone / cell phone fields ---

  async fillPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.fill(this.phoneInput, value);
  }

  async fillCellPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.fill(this.cellPhoneInput, value);
  }

  async getPhoneValue(): Promise<string> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).inputValue();
  }

  async getCellPhoneValue(): Promise<string> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    return this.page.locator(this.cellPhoneInput).inputValue();
  }

  async isPhoneInputVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.phoneInput, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isCellPhoneInputVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isPhoneInputEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).isEnabled();
  }

  async isCellPhoneInputEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    return this.page.locator(this.cellPhoneInput).isEnabled();
  }

  async focusCellPhoneInput(): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.locator(this.cellPhoneInput).click();
  }

  async focusPhoneInput(): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.locator(this.phoneInput).click();
  }

  async clearCellPhone(): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.fill(this.cellPhoneInput, '');
  }

  async clearPhone(): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.fill(this.phoneInput, '');
  }

  async isCellPhoneErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.cellPhoneError, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getCellPhoneErrorText(): Promise<string> {
    await this.page.waitForSelector(this.cellPhoneError, { state: 'visible' });
    return this.page.locator(this.cellPhoneError).innerText();
  }

  async isPhoneErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.phoneError, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getPhoneErrorText(): Promise<string> {
    await this.page.waitForSelector(this.phoneError, { state: 'visible' });
    return this.page.locator(this.phoneError).innerText();
  }

  async clickEmployeeRow(id: string): Promise<void> {
    const rowSelector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    await this.page.click(rowSelector);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  async getDrawerLabelTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = this.page.locator(`${this.employeeDrawer} label`);
    return labels.allInnerTexts();
  }

  async hasLabelWithExactText(text: string): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getDrawerLabelTexts();
    return labels.some((label) => label.trim() === text);
  }

  async hasStandaloneLabelPhone(): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getDrawerLabelTexts();
    return labels.some((label) => label.trim() === 'Phone');
  }

  async countPhoneRelatedLabels(): Promise<number> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getDrawerLabelTexts();
    return labels.filter((label) => label.trim().toLowerCase().includes('phone')).length;
  }

  async getPhoneRelatedLabelTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getDrawerLabelTexts();
    return labels.filter((label) => label.trim().toLowerCase().includes('phone')).map((l) => l.trim());
  }

  async fillAllRequiredFields(overrides?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    designation?: string;
    department?: string;
    employmentType?: string;
    employmentStatus?: string;
    startDate?: string;
    street?: string;
    city?: string;
    country?: string;
  }): Promise<void> {
    const ts = Date.now();
    await this.fillFirstName(overrides?.firstName ?? `TestFirst${ts}`);
    await this.fillLastName(overrides?.lastName ?? `TestLast${ts}`);
    await this.fillEmail(overrides?.email ?? `test+${ts}@example.com`);
    await this.fillDesignation(overrides?.designation ?? 'Engineer');
    await this.selectDepartment(overrides?.department ?? 'Engineering');
    await this.selectEmploymentType(overrides?.employmentType ?? 'Full-Time');
    await this.selectEmploymentStatus(overrides?.employmentStatus ?? 'Active');
    await this.fillStartDate(overrides?.startDate ?? '2026-03-18');
    await this.fillStreet(overrides?.street ?? '123 Test St');
    await this.fillCity(overrides?.city ?? 'TestCity');
    await this.fillCountry(overrides?.country ?? 'TestCountry');
  }

  async tabAwayFromCellPhone(): Promise<void> {
    await this.page.locator(this.cellPhoneInput).press('Tab');
  }

  async tabAwayFromPhone(): Promise<void> {
    await this.page.locator(this.phoneInput).press('Tab');
  }

  async isSuccessToastVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
      return true;
    } catch {
      return false;
    }
  }

  async getSuccessToastText(): Promise<string> {
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
    return this.page.locator(this.successToast).innerText();
  }

  async getCellPhoneInputMaxLength(): Promise<string | null> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    return this.page.locator(this.cellPhoneInput).getAttribute('maxlength');
  }

  async getPhoneInputMaxLength(): Promise<string | null> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).getAttribute('maxlength');
  }

  async isCellPhoneInputFocused(): Promise<boolean> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    return this.page.locator(this.cellPhoneInput).evaluate((el) => document.activeElement === el);
  }

  async isPhoneInputFocused(): Promise<boolean> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).evaluate((el) => document.activeElement === el);
  }

  async typeCellPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.locator(this.cellPhoneInput).click();
    await this.page.locator(this.cellPhoneInput).type(value);
  }

  async typePhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.locator(this.phoneInput).click();
    await this.page.locator(this.phoneInput).type(value);
  }

  async isDrawerErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.drawerError, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getDrawerErrorText(): Promise<string> {
    await this.page.waitForSelector(this.drawerError, { state: 'visible' });
    return this.page.locator(this.drawerError).innerText();
  }

  async waitForDrawerHidden(): Promise<void> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'hidden', timeout: 10000 });
  }

  async waitForLoadingComplete(): Promise<void> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async getEmployeeDepartmentFromRow(id: string): Promise<string> {
    const row = this.page.locator(`[data-testid="employee-row-${id}"]`);
    return row.locator('[data-testid="employee-department"]').innerText();
  }

  async setViewportSize(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  async scrollDrawerToBottom(): Promise<void> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    await this.page.locator(this.employeeDrawer).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  }

  async getVisibleErrorSelectors(): Promise<string[]> {
    const errorSelectors = [
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
      this.phoneError,
      this.cellPhoneError,
    ];
    const visible: string[] = [];
    for (const sel of errorSelectors) {
      const isVis = await this.page.locator(sel).isVisible().catch(() => false);
      if (isVis) {
        visible.push(sel);
      }
    }
    return visible;
  }
}