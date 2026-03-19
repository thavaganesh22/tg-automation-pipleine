import { Page } from '@playwright/test';

export class EmployeeValidationPage {
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly submitBtn = '[data-testid="submit-btn"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly firstNameInput = '[data-testid="firstName-input"]';
  private readonly lastNameInput = '[data-testid="lastName-input"]';
  private readonly emailInput = '[data-testid="email-input"]';
  private readonly designationInput = '[data-testid="designation-input"]';
  private readonly departmentSelect = '[data-testid="department-select"]';
  private readonly employmentTypeSelect = '[data-testid="employmentType-select"]';
  private readonly streetInput = '[data-testid="street-input"]';
  private readonly cityInput = '[data-testid="city-input"]';
  private readonly countryInput = '[data-testid="country-input"]';
  private readonly firstNameError = '[data-testid="firstName-error"]';
  private readonly lastNameError = '[data-testid="lastName-error"]';
  private readonly emailError = '[data-testid="email-error"]';
  private readonly designationError = '[data-testid="designation-error"]';
  private readonly departmentError = '[data-testid="department-error"]';
  private readonly employmentTypeError = '[data-testid="employmentType-error"]';
  private readonly addressStreetError = '[data-testid="address-street-error"]';
  private readonly addressCityError = '[data-testid="address-city-error"]';
  private readonly addressCountryError = '[data-testid="address-country-error"]';

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

  async fillAllRequiredFields(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
  }): Promise<void> {
    await this.fillFirstName(data.firstName);
    await this.fillLastName(data.lastName);
    await this.fillEmail(data.email);
    await this.fillDesignation(data.designation);
    await this.selectDepartment(data.department);
    await this.selectEmploymentType(data.employmentType);
    await this.fillStreet(data.street);
    await this.fillCity(data.city);
    await this.fillCountry(data.country);
  }

  async isFirstNameErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.firstNameError, { state: 'visible', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async isLastNameErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.lastNameError, { state: 'visible', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async isEmailErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.emailError, { state: 'visible', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async isDesignationErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.designationError, { state: 'visible', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async isDepartmentErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.departmentError, { state: 'visible', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async isEmploymentTypeErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.employmentTypeError, { state: 'visible', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async isStreetErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.addressStreetError, { state: 'visible', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async isCityErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.addressCityError, { state: 'visible', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async isCountryErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.addressCountryError, { state: 'visible', timeout: 3000 });
      return true;
    } catch { return false; }
  }

  async getFirstNameErrorText(): Promise<string> {
    return this.page.locator(this.firstNameError).innerText();
  }

  async getLastNameErrorText(): Promise<string> {
    return this.page.locator(this.lastNameError).innerText();
  }

  async getEmailErrorText(): Promise<string> {
    return this.page.locator(this.emailError).innerText();
  }

  async getDesignationErrorText(): Promise<string> {
    return this.page.locator(this.designationError).innerText();
  }

  async getDepartmentErrorText(): Promise<string> {
    return this.page.locator(this.departmentError).innerText();
  }

  async getEmploymentTypeErrorText(): Promise<string> {
    return this.page.locator(this.employmentTypeError).innerText();
  }

  async getStreetErrorText(): Promise<string> {
    return this.page.locator(this.addressStreetError).innerText();
  }

  async getCityErrorText(): Promise<string> {
    return this.page.locator(this.addressCityError).innerText();
  }

  async getCountryErrorText(): Promise<string> {
    return this.page.locator(this.addressCountryError).innerText();
  }

  async hasNoValidationErrors(): Promise<boolean> {
    const count = await this.page.locator('[data-testid$="-error"]').count();
    return count === 0;
  }
}