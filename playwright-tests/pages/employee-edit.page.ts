import { Page } from '@playwright/test';

export class EmployeeEditPage {
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
  private readonly closeDrawerBtn = '[data-testid="close-drawer-btn"]';
  private readonly firstNameInput = '[data-testid="firstName-input"]';
  private readonly lastNameInput = '[data-testid="lastName-input"]';
  private readonly emailInput = '[data-testid="email-input"]';
  private readonly designationInput = '[data-testid="designation-input"]';
  private readonly departmentSelect = '[data-testid="department-select"]';
  private readonly cancelBtn = '[data-testid="cancel-btn"]';
  private readonly submitBtn = '[data-testid="submit-btn"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly phoneInput = '[data-testid="phone-input"]';
  private readonly cellPhoneInput = '[data-testid="cellPhone-input"]';
  private readonly employmentTypeSelect = '[data-testid="employmentType-select"]';
  private readonly employmentStatusSelect = '[data-testid="employmentStatus-select"]';
  private readonly streetInput = '[data-testid="street-input"]';
  private readonly cityInput = '[data-testid="city-input"]';
  private readonly countryInput = '[data-testid="country-input"]';
  private readonly phoneError = '[data-testid="phone-error"]';
  private readonly cellPhoneError = '[data-testid="cellPhone-error"]';
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

  async getEmployeeById(id: string): Promise<{ firstName: string; lastName: string; email: string; designation: string; department: string }> {
    const res = await this.page.request.get(`${this.baseUrl}/api/employees/${id}`);
    const body = await res.json();
    return {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      designation: body.designation,
      department: body.department,
    };
  }

  async createEmployee(payload: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; employmentStatus: string;
    startDate: string; address: { street: string; city: string; country: string };
  }): Promise<string> {
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

  async clickEmployeeRow(id: string): Promise<void> {
    const selector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.click(selector);
  }

  async waitForDrawerOpen(): Promise<void> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible', timeout: 5000 });
  }

  async isDrawerVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.employeeDrawer, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
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

  async getDesignationValue(): Promise<string> {
    await this.page.waitForSelector(this.designationInput, { state: 'visible' });
    return this.page.locator(this.designationInput).inputValue();
  }

  async getDepartmentValue(): Promise<string> {
    await this.page.waitForSelector(this.departmentSelect, { state: 'visible' });
    return this.page.locator(this.departmentSelect).inputValue();
  }

  async getDrawerTitle(): Promise<string> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const heading = this.page.locator(this.employeeDrawer).locator('h2, h3, [class*="title"], [class*="header"]').first();
    return heading.textContent().then(t => t?.trim() ?? '');
  }

  async fillFirstName(value: string): Promise<void> {
    await this.page.waitForSelector(this.firstNameInput, { state: 'visible' });
    await this.page.fill(this.firstNameInput, value);
  }

  async fillEmail(value: string): Promise<void> {
    await this.page.waitForSelector(this.emailInput, { state: 'visible' });
    await this.page.fill(this.emailInput, value);
  }

  async closeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.closeDrawerBtn, { state: 'visible' });
    await this.page.click(this.closeDrawerBtn);
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async cancelForm(): Promise<void> {
    await this.page.waitForSelector(this.cancelBtn, { state: 'visible' });
    await this.page.click(this.cancelBtn);
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
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

  async isSuccessToastVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getEmployeeRowCount(): Promise<number> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return this.page.locator('[data-testid^="employee-row-"]').count();
  }

  async openEmployeeEditDrawer(id: string): Promise<void> {
    await this.clickEmployeeRow(id);
    await this.waitForDrawerOpen();
  }

  async clickAddEmployee(): Promise<void> {
    await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible' });
    await this.page.click(this.addEmployeeBtn);
    await this.waitForDrawerOpen();
  }

  async fillLastName(value: string): Promise<void> {
    await this.page.waitForSelector(this.lastNameInput, { state: 'visible' });
    await this.page.fill(this.lastNameInput, value);
  }

  async fillDesignation(value: string): Promise<void> {
    await this.page.waitForSelector(this.designationInput, { state: 'visible' });
    await this.page.fill(this.designationInput, value);
  }

  async selectDepartment(value: string): Promise<void> {
    await this.page.waitForSelector(this.departmentSelect, { state: 'visible' });
    await this.page.selectOption(this.departmentSelect, { label: value });
  }

  async selectEmploymentType(value: string): Promise<void> {
    await this.page.waitForSelector(this.employmentTypeSelect, { state: 'visible' });
    await this.page.selectOption(this.employmentTypeSelect, { label: value });
  }

  async selectEmploymentStatus(value: string): Promise<void> {
    await this.page.waitForSelector(this.employmentStatusSelect, { state: 'visible' });
    await this.page.selectOption(this.employmentStatusSelect, { label: value });
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

  async isPhoneErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.phoneError, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getPhoneErrorText(): Promise<string> {
    await this.page.waitForSelector(this.phoneError, { state: 'visible', timeout: 5000 });
    return this.page.locator(this.phoneError).textContent().then(t => t?.trim() ?? '');
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
    await this.page.waitForSelector(this.cellPhoneError, { state: 'visible', timeout: 5000 });
    return this.page.locator(this.cellPhoneError).textContent().then(t => t?.trim() ?? '');
  }

  async getFormLabels(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.page.locator(this.employeeDrawer).locator('label').allTextContents();
    return labels.map(l => l.trim());
  }

  async isLabelVisible(labelText: string): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = this.page.locator(this.employeeDrawer).locator('label');
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const text = await labels.nth(i).textContent();
      if (text?.trim() === labelText) {
        return labels.nth(i).isVisible();
      }
    }
    return false;
  }

  async clickLabel(labelText: string): Promise<void> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = this.page.locator(this.employeeDrawer).locator('label');
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const text = await labels.nth(i).textContent();
      if (text?.trim() === labelText) {
        await labels.nth(i).click();
        return;
      }
    }
    throw new Error(`Label "${labelText}" not found in drawer`);
  }

  async isPhoneInputFocused(): Promise<boolean> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).evaluate(el => el === document.activeElement);
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

  async fillRequiredFieldsForAdd(overrides?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    designation?: string;
    department?: string;
    employmentType?: string;
    street?: string;
    city?: string;
    country?: string;
  }): Promise<{ firstName: string; lastName: string; email: string }> {
    const ts = Date.now();
    const firstName = overrides?.firstName ?? `TestFirst${ts}`;
    const lastName = overrides?.lastName ?? `TestLast${ts}`;
    const email = overrides?.email ?? `test${ts}@example.com`;
    const designation = overrides?.designation ?? 'Engineer';
    const department = overrides?.department ?? 'Engineering';
    const employmentType = overrides?.employmentType ?? 'Full-Time';
    const street = overrides?.street ?? '123 Test St';
    const city = overrides?.city ?? 'TestCity';
    const country = overrides?.country ?? 'TestCountry';

    await this.fillFirstName(firstName);
    await this.fillLastName(lastName);
    await this.fillEmail(email);
    await this.fillDesignation(designation);
    await this.selectDepartment(department);
    await this.selectEmploymentType(employmentType);
    await this.fillStreet(street);
    await this.fillCity(city);
    await this.fillCountry(country);

    return { firstName, lastName, email };
  }

  async getFirstEmployeeDetails(): Promise<{
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    designation: string;
    department: string;
  }> {
    const res = await this.page.request.get(`${this.baseUrl}/api/employees`);
    const body = await res.json();
    if (!body.data || body.data.length === 0) throw new Error('No employees found');
    const emp = body.data[0];
    return {
      _id: emp._id as string,
      firstName: emp.firstName as string,
      lastName: emp.lastName as string,
      email: emp.email as string,
      phone: emp.phone as string | undefined,
      designation: emp.designation as string,
      department: emp.department as string,
    };
  }

  async setViewportSize(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  async scrollToPhoneInput(): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible', timeout: 5000 }).catch(() => {});
    await this.page.locator(this.phoneInput).scrollIntoViewIfNeeded();
  }

  async isDrawerOpen(): Promise<boolean> {
    return this.isDrawerVisible();
  }

  async hasValidationErrors(): Promise<boolean> {
    try {
      await this.page.waitForSelector('[data-testid$="-error"]', { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getVisibleValidationErrors(): Promise<string[]> {
    const errorLocators = this.page.locator('[data-testid$="-error"]');
    const count = await errorLocators.count();
    const errors: string[] = [];
    for (let i = 0; i < count; i++) {
      const visible = await errorLocators.nth(i).isVisible();
      if (visible) {
        const text = await errorLocators.nth(i).textContent();
        if (text) errors.push(text.trim());
      }
    }
    return errors;
  }
}