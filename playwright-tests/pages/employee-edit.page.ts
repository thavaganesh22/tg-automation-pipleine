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
  private readonly startDateInput = '[data-testid="startDate-input"]';
  private readonly streetInput = '[data-testid="street-input"]';
  private readonly cityInput = '[data-testid="city-input"]';
  private readonly stateInput = '[data-testid="state-input"]';
  private readonly postalCodeInput = '[data-testid="postalCode-input"]';
  private readonly countryInput = '[data-testid="country-input"]';
  private readonly cellPhoneError = '[data-testid="cellPhone-error"]';
  private readonly phoneError = '[data-testid="phone-error"]';
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
    phone?: string; cellPhone?: string;
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

  async clickAddEmployeeButton(): Promise<void> {
    await this.page.waitForSelector(this.addEmployeeBtn, { state: 'visible' });
    await this.page.click(this.addEmployeeBtn);
    await this.waitForDrawerOpen();
  }

  async isCellPhoneInputVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async isCellPhoneInputEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    return this.page.locator(this.cellPhoneInput).isEnabled();
  }

  async isPhoneInputVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.phoneInput, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async isPhoneInputEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).isEnabled();
  }

  async getCellPhoneValue(): Promise<string> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    return this.page.locator(this.cellPhoneInput).inputValue();
  }

  async fillCellPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.fill(this.cellPhoneInput, value);
  }

  async clearCellPhone(): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.locator(this.cellPhoneInput).clear();
  }

  async getPhoneValue(): Promise<string> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).inputValue();
  }

  async fillPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.fill(this.phoneInput, value);
  }

  async clearPhone(): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.locator(this.phoneInput).clear();
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
    await this.page.locator(this.departmentSelect).selectOption(value);
  }

  async selectEmploymentType(value: string): Promise<void> {
    await this.page.waitForSelector(this.employmentTypeSelect, { state: 'visible' });
    await this.page.locator(this.employmentTypeSelect).selectOption(value);
  }

  async selectEmploymentStatus(value: string): Promise<void> {
    await this.page.waitForSelector(this.employmentStatusSelect, { state: 'visible' });
    await this.page.locator(this.employmentStatusSelect).selectOption(value);
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

  async fillAllRequiredFields(overrides?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    designation?: string;
    department?: string;
    employmentType?: string;
    street?: string;
    city?: string;
    country?: string;
  }): Promise<void> {
    const timestamp = Date.now();
    await this.fillFirstName(overrides?.firstName ?? `TestFirst${timestamp}`);
    await this.fillLastName(overrides?.lastName ?? `TestLast${timestamp}`);
    await this.fillEmail(overrides?.email ?? `test+${timestamp}@example.com`);
    await this.fillDesignation(overrides?.designation ?? 'Engineer');
    await this.selectDepartment(overrides?.department ?? 'Engineering');
    await this.selectEmploymentType(overrides?.employmentType ?? 'Full-Time');
    await this.fillStreet(overrides?.street ?? '123 Test St');
    await this.fillCity(overrides?.city ?? 'TestCity');
    await this.fillCountry(overrides?.country ?? 'TestCountry');
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
    const text = await this.page.locator(this.cellPhoneError).textContent();
    return text?.trim() ?? '';
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
    const text = await this.page.locator(this.phoneError).textContent();
    return text?.trim() ?? '';
  }

  async getDrawerLabelTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = this.page.locator(this.employeeDrawer).locator('label');
    const count = await labels.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await labels.nth(i).textContent();
      texts.push(text?.trim() ?? '');
    }
    return texts;
  }

  async countLabelOccurrences(labelText: string): Promise<number> {
    const labels = await this.getDrawerLabelTexts();
    return labels.filter(l => l.toLowerCase() === labelText.toLowerCase()).length;
  }

  async hasExactLabel(labelText: string): Promise<boolean> {
    const labels = await this.getDrawerLabelTexts();
    return labels.some(l => l.toLowerCase() === labelText.toLowerCase());
  }

  async hasStandalonePhoneLabel(): Promise<boolean> {
    const labels = await this.getDrawerLabelTexts();
    return labels.some(l => {
      const lower = l.toLowerCase();
      return lower === 'phone';
    });
  }

  async arePhoneAndCellPhoneInputsNotOverlapping(): Promise<boolean> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    const phoneBox = await this.page.locator(this.phoneInput).boundingBox();
    const cellPhoneBox = await this.page.locator(this.cellPhoneInput).boundingBox();
    if (!phoneBox || !cellPhoneBox) return false;
    const horizontalOverlap =
      phoneBox.x < cellPhoneBox.x + cellPhoneBox.width &&
      phoneBox.x + phoneBox.width > cellPhoneBox.x;
    const verticalOverlap =
      phoneBox.y < cellPhoneBox.y + cellPhoneBox.height &&
      phoneBox.y + phoneBox.height > cellPhoneBox.y;
    return !(horizontalOverlap && verticalOverlap);
  }

  async waitForDrawerClosed(): Promise<void> {
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
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

  async getStreetValue(): Promise<string> {
    await this.page.waitForSelector(this.streetInput, { state: 'visible' });
    return this.page.locator(this.streetInput).inputValue();
  }

  async getCityValue(): Promise<string> {
    await this.page.waitForSelector(this.cityInput, { state: 'visible' });
    return this.page.locator(this.cityInput).inputValue();
  }

  async getStateValue(): Promise<string> {
    await this.page.waitForSelector(this.stateInput, { state: 'visible' });
    return this.page.locator(this.stateInput).inputValue();
  }

  async getPostalCodeValue(): Promise<string> {
    await this.page.waitForSelector(this.postalCodeInput, { state: 'visible' });
    return this.page.locator(this.postalCodeInput).inputValue();
  }

  async getCountryValue(): Promise<string> {
    await this.page.waitForSelector(this.countryInput, { state: 'visible' });
    return this.page.locator(this.countryInput).inputValue();
  }
}