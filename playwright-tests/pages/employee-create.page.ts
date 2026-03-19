import { Page } from '@playwright/test';

export class EmployeeCreatePage {
  private readonly page: Page;
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly closeDrawerBtn = '[data-testid="close-drawer-btn"]';
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

  async getFirstVisibleEmployeeId(): Promise<string> {
    const row = this.page.locator('[data-testid^="employee-row-"]').first();
    const testId = await row.getAttribute('data-testid');
    return testId!.replace('employee-row-', '');
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

  async getFieldValue(selector: string): Promise<string> {
    await this.page.waitForSelector(selector, { state: 'visible' });
    return this.page.locator(selector).inputValue();
  }

  async getFirstNameValue(): Promise<string> {
    return this.getFieldValue(this.firstNameInput);
  }

  async getLastNameValue(): Promise<string> {
    return this.getFieldValue(this.lastNameInput);
  }

  async getEmailValue(): Promise<string> {
    return this.getFieldValue(this.emailInput);
  }

  async getDepartmentValue(): Promise<string> {
    return this.getFieldValue(this.departmentSelect);
  }

  async getEmploymentTypeValue(): Promise<string> {
    return this.getFieldValue(this.employmentTypeSelect);
  }

  async getEmploymentStatusValue(): Promise<string> {
    return this.getFieldValue(this.employmentStatusSelect);
  }

  async getStartDateValue(): Promise<string> {
    return this.getFieldValue(this.startDateInput);
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

  async cancelEmployeeForm(): Promise<void> {
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

  async isSuccessToastVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async isValidationErrorVisible(testId: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(`[data-testid="${testId}"]`, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isFirstNameErrorVisible(): Promise<boolean> {
    return this.isValidationErrorVisible('firstName-error');
  }

  async isLastNameErrorVisible(): Promise<boolean> {
    return this.isValidationErrorVisible('lastName-error');
  }

  async isEmailErrorVisible(): Promise<boolean> {
    return this.isValidationErrorVisible('email-error');
  }

  async isDesignationErrorVisible(): Promise<boolean> {
    return this.isValidationErrorVisible('designation-error');
  }

  async isDepartmentErrorVisible(): Promise<boolean> {
    return this.isValidationErrorVisible('department-error');
  }

  async isEmploymentTypeErrorVisible(): Promise<boolean> {
    return this.isValidationErrorVisible('employmentType-error');
  }

  async isStreetErrorVisible(): Promise<boolean> {
    return this.isValidationErrorVisible('address-street-error');
  }

  async isCityErrorVisible(): Promise<boolean> {
    return this.isValidationErrorVisible('address-city-error');
  }

  async isCountryErrorVisible(): Promise<boolean> {
    return this.isValidationErrorVisible('address-country-error');
  }

  async getValidationErrorText(testId: string): Promise<string> {
    await this.page.waitForSelector(`[data-testid="${testId}"]`, { state: 'visible' });
    return this.page.locator(`[data-testid="${testId}"]`).innerText();
  }

  async getEmailErrorText(): Promise<string> {
    return this.getValidationErrorText('email-error');
  }

  async getEmployeeNameFromRow(id: string): Promise<string> {
    const row = this.page.locator(`[data-testid="employee-row-${id}"]`);
    return row.locator('[data-testid="employee-name"]').innerText();
  }

  async getEmployeeEmailFromRow(id: string): Promise<string> {
    const row = this.page.locator(`[data-testid="employee-row-${id}"]`);
    return row.locator('[data-testid="employee-email"]').innerText();
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