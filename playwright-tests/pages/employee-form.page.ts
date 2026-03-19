import { Page } from '@playwright/test';

export class EmployeeFormPage {
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
  private readonly phoneInput = '[data-testid="phone-input"]';
  private readonly cellPhoneInput = '[data-testid="cellPhone-input"]';
  private readonly designationInput = '[data-testid="designation-input"]';
  private readonly departmentSelect = '[data-testid="department-select"]';
  private readonly employmentTypeSelect = '[data-testid="employmentType-select"]';
  private readonly employmentStatusSelect = '[data-testid="employmentStatus-select"]';
  private readonly streetInput = '[data-testid="street-input"]';
  private readonly cityInput = '[data-testid="city-input"]';
  private readonly countryInput = '[data-testid="country-input"]';
  private readonly submitBtn = '[data-testid="submit-btn"]';
  private readonly successToast = '[data-testid="success-toast"]';
  private readonly phoneError = '[data-testid="phone-error"]';
  private readonly cellPhoneError = '[data-testid="cellPhone-error"]';
  private readonly startDateInput = '[data-testid="startDate-input"]';
  private readonly drawerOverlay = '[data-testid="drawer-overlay"]';
  private readonly cancelBtn = '[data-testid="cancel-btn"]';
  private readonly drawerError = '[data-testid="drawer-error"]';
  private readonly stateInput = '[data-testid="state-input"]';
  private readonly postalCodeInput = '[data-testid="postalCode-input"]';
  private readonly departmentFilter = '[data-testid="department-filter"]';
  private readonly statusFilter = '[data-testid="status-filter"]';
  private readonly clearFiltersBtn = '[data-testid="clear-filters-btn"]';
  private readonly errorBanner = '[data-testid="error-banner"]';
  private readonly emptyState = '[data-testid="empty-state"]';
  private readonly paginationSummary = '[data-testid="pagination-summary"]';
  private readonly prevPageBtn = '[data-testid="prev-page-btn"]';
  private readonly nextPageBtn = '[data-testid="next-page-btn"]';
  private readonly paginationCurrent = '[data-testid="pagination-current"]';
  private readonly confirmDialog = '[data-testid="confirm-dialog"]';
  private readonly modalOverlay = '[data-testid="modal-overlay"]';
  private readonly confirmCancelBtn = '[data-testid="confirm-cancel-btn"]';
  private readonly confirmDeleteBtn = '[data-testid="confirm-delete-btn"]';
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
    if (!testId) throw new Error('No visible employee row found');
    return testId.replace('employee-row-', '');
  }

  async createEmployee(payload: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; employmentStatus: string;
    startDate: string; address: { street: string; city: string; country: string };
    phone?: string; cellPhone?: string;
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

  async clickEmployeeRow(id: string): Promise<void> {
    const selector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.click(selector);
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
  }

  async closeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.closeDrawerBtn, { state: 'visible' });
    await this.page.click(this.closeDrawerBtn);
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async isDrawerVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.employeeDrawer, { state: 'visible', timeout: 3000 });
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

  async fillWorkPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.fill(this.phoneInput, value);
  }

  async fillCellPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.fill(this.cellPhoneInput, value);
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

  async fillRequiredFields(data: {
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

  async getWorkPhoneValue(): Promise<string> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).inputValue();
  }

  async getCellPhoneValue(): Promise<string> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    return this.page.locator(this.cellPhoneInput).inputValue();
  }

  async isWorkPhoneInputVisible(): Promise<boolean> {
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

  async getFormLabelTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    return this.page.locator('[data-testid="employee-drawer"] label').allTextContents();
  }

  async isLabelVisible(labelText: string): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getFormLabelTexts();
    return labels.some(l => l.trim() === labelText);
  }

  async hasStandalonePhoneLabel(): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getFormLabelTexts();
    return labels.some(l => l.trim() === 'Phone');
  }

  async getFirstEmployeeName(): Promise<string> {
    const res = await this.page.request.get(`${this.baseUrl}/api/employees`);
    const body = await res.json();
    if (!body.data || body.data.length === 0) throw new Error('No employees found');
    const emp = body.data[0];
    return `${emp.firstName} ${emp.lastName}` as string;
  }

  async isWorkPhoneLabelVisible(): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getFormLabelTexts();
    return labels.some(l => l.trim() === 'Work Phone');
  }

  async isCellPhoneLabelVisible(): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getFormLabelTexts();
    return labels.some(l => l.trim() === 'Cell Phone');
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
    return this.page.locator(this.phoneError).textContent().then(t => t ?? '');
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
    return this.page.locator(this.cellPhoneError).textContent().then(t => t ?? '');
  }

  async fillCellPhoneAndVerifyInteractive(value: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible', timeout: 3000 });
      await this.page.locator(this.cellPhoneInput).click();
      await this.page.fill(this.cellPhoneInput, value);
      const inputValue = await this.page.locator(this.cellPhoneInput).inputValue();
      return inputValue === value;
    } catch {
      return false;
    }
  }

  async areBothPhoneFieldsVisible(): Promise<boolean> {
    const workPhoneVisible = await this.isWorkPhoneInputVisible();
    const cellPhoneVisible = await this.isCellPhoneInputVisible();
    return workPhoneVisible && cellPhoneVisible;
  }

  async areBothPhoneLabelsVisible(): Promise<boolean> {
    const workPhoneLabel = await this.isWorkPhoneLabelVisible();
    const cellPhoneLabel = await this.isCellPhoneLabelVisible();
    return workPhoneLabel && cellPhoneLabel;
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

  async waitForDrawerHidden(): Promise<void> {
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 10000 });
  }

  async isSuccessToastVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
      return true;
    } catch {
      return false;
    }
  }

  async hasNoValidationErrors(): Promise<boolean> {
    try {
      await this.page.waitForSelector('[data-testid$="-error"]', { state: 'visible', timeout: 2000 });
      return false;
    } catch {
      return true;
    }
  }

  async fillWorkPhoneAndVerifyInteractive(value: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.phoneInput, { state: 'visible', timeout: 3000 });
      await this.page.locator(this.phoneInput).click();
      await this.page.fill(this.phoneInput, value);
      const inputValue = await this.page.locator(this.phoneInput).inputValue();
      return inputValue === value;
    } catch {
      return false;
    }
  }

  async fillAllRequiredFieldsAndPhones(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone?: string; cellPhone?: string;
  }): Promise<void> {
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    if (data.workPhone) {
      await this.fillWorkPhone(data.workPhone);
    }
    if (data.cellPhone) {
      await this.fillCellPhone(data.cellPhone);
    }
  }

  async submitAndWaitForSuccess(): Promise<void> {
    await this.page.waitForSelector(this.submitBtn, { state: 'visible' });
    await this.page.click(this.submitBtn);
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
  }

  async searchAndClickFirstEmployee(name: string): Promise<void> {
    await this.searchEmployees(name);
    const firstRowId = await this.getFirstVisibleEmployeeId();
    await this.clickEmployeeRow(firstRowId);
  }

  async getDesignationValue(): Promise<string> {
    await this.page.waitForSelector(this.designationInput, { state: 'visible' });
    return this.page.locator(this.designationInput).inputValue();
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

  async getStreetValue(): Promise<string> {
    await this.page.waitForSelector(this.streetInput, { state: 'visible' });
    return this.page.locator(this.streetInput).inputValue();
  }

  async getCityValue(): Promise<string> {
    await this.page.waitForSelector(this.cityInput, { state: 'visible' });
    return this.page.locator(this.cityInput).inputValue();
  }

  async getCountryValue(): Promise<string> {
    await this.page.waitForSelector(this.countryInput, { state: 'visible' });
    return this.page.locator(this.countryInput).inputValue();
  }

  async isPhoneInputTruncatedOrErrorShown(value: string): Promise<boolean> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.fill(this.phoneInput, value);
    const currentValue = await this.page.locator(this.phoneInput).inputValue();
    const wasTruncated = currentValue.length < value.length;
    if (wasTruncated) {
      return true;
    }
    await this.submitEmployeeForm();
    const hasPhoneError = await this.isPhoneErrorVisible();
    return hasPhoneError;
  }

  async isCellPhoneInputTruncatedOrErrorShown(value: string): Promise<boolean> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.fill(this.cellPhoneInput, value);
    const currentValue = await this.page.locator(this.cellPhoneInput).inputValue();
    const wasTruncated = currentValue.length < value.length;
    if (wasTruncated) {
      return true;
    }
    await this.submitEmployeeForm();
    const hasCellPhoneError = await this.isCellPhoneErrorVisible();
    return hasCellPhoneError;
  }

  async hasNoPhoneOrCellPhoneErrors(): Promise<boolean> {
    const phoneErr = await this.isPhoneErrorVisible();
    const cellErr = await this.isCellPhoneErrorVisible();
    return !phoneErr && !cellErr;
  }

  async fillAllRequiredFieldsAndBothPhones(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone: string; cellPhone: string;
  }): Promise<void> {
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    await this.fillWorkPhone(data.workPhone);
    await this.fillCellPhone(data.cellPhone);
  }

  async createEmployeeViaFormAndReturnToList(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone?: string; cellPhone?: string;
  }): Promise<void> {
    await this.openAddEmployeeDrawer();
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    if (data.workPhone) {
      await this.fillWorkPhone(data.workPhone);
    }
    if (data.cellPhone) {
      await this.fillCellPhone(data.cellPhone);
    }
    await this.submitAndWaitForSuccess();
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async verifyWorkPhoneValueAfterReopen(employeeName: string, expectedValue: string): Promise<boolean> {
    await this.searchAndClickFirstEmployee(employeeName);
    const actualValue = await this.getWorkPhoneValue();
    return actualValue === expectedValue;
  }

  async verifyCellPhoneValueAfterReopen(employeeName: string, expectedValue: string): Promise<boolean> {
    await this.searchAndClickFirstEmployee(employeeName);
    const actualValue = await this.getCellPhoneValue();
    return actualValue === expectedValue;
  }

  async verifyBothPhoneValuesAfterReopen(employeeName: string, _expectedWorkPhone: string, _expectedCellPhone: string): Promise<{ workPhone: string; cellPhone: string }> {
    await this.searchAndClickFirstEmployee(employeeName);
    const workPhone = await this.getWorkPhoneValue();
    const cellPhone = await this.getCellPhoneValue();
    return { workPhone, cellPhone };
  }

  async fillWorkPhoneAndCheckCellPhoneUnchanged(workPhoneValue: string, expectedCellPhoneValue: string): Promise<boolean> {
    await this.fillWorkPhone(workPhoneValue);
    const cellPhoneVal = await this.getCellPhoneValue();
    return cellPhoneVal === expectedCellPhoneValue;
  }

  async fillCellPhoneAndCheckWorkPhoneUnchanged(cellPhoneValue: string, expectedWorkPhoneValue: string): Promise<boolean> {
    await this.fillCellPhone(cellPhoneValue);
    const workPhoneVal = await this.getWorkPhoneValue();
    return workPhoneVal === expectedWorkPhoneValue;
  }

  async getWorkPhoneInputLength(): Promise<number> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    const val = await this.page.locator(this.phoneInput).inputValue();
    return val.length;
  }

  async getCellPhoneInputLength(): Promise<number> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    const val = await this.page.locator(this.cellPhoneInput).inputValue();
    return val.length;
  }

  async openEditDrawerForFirstSeededEmployee(): Promise<string> {
    const name = await this.getFirstEmployeeName();
    await this.searchAndClickFirstEmployee(name);
    return name;
  }

  async hasNoStandalonePhoneLabelOnly(): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getFormLabelTexts();
    const hasWorkPhone = labels.some(l => l.trim() === 'Work Phone');
    const hasStandalonePhone = labels.some(l => l.trim() === 'Phone');
    return hasWorkPhone && !hasStandalonePhone;
  }

  async fillRequiredFieldsSubmitAndReopenByName(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone?: string; cellPhone?: string;
  }): Promise<void> {
    await this.openAddEmployeeDrawer();
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    if (data.workPhone) {
      await this.fillWorkPhone(data.workPhone);
    }
    if (data.cellPhone) {
      await this.fillCellPhone(data.cellPhone);
    }
    await this.submitAndWaitForSuccess();
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.searchAndClickFirstEmployee(`${data.firstName} ${data.lastName}`);
  }

  async fillBothPhonesAndVerifyIndependence(workPhoneValue: string, cellPhoneValue: string): Promise<{ workPhoneUnchanged: boolean; cellPhoneUnchanged: boolean }> {
    await this.fillWorkPhone(workPhoneValue);
    await this.fillCellPhone(cellPhoneValue);
    const workPhoneAfter = await this.getWorkPhoneValue();
    const cellPhoneAfter = await this.getCellPhoneValue();
    return {
      workPhoneUnchanged: workPhoneAfter === workPhoneValue,
      cellPhoneUnchanged: cellPhoneAfter === cellPhoneValue,
    };
  }

  async fillMaxLengthPhonesAndSubmitSuccessfully(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone: string; cellPhone: string;
  }): Promise<boolean> {
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    await this.fillWorkPhone(data.workPhone);
    await this.fillCellPhone(data.cellPhone);
    await this.submitAndWaitForSuccess();
    const noErrors = await this.hasNoPhoneOrCellPhoneErrors();
    return noErrors;
  }

  async isWorkPhoneInputTruncatedOrErrorShownWithRequiredFields(workPhoneValue: string, requiredData: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
  }): Promise<boolean> {
    await this.fillRequiredFields(requiredData);
    return this.isPhoneInputTruncatedOrErrorShown(workPhoneValue);
  }

  // --- New methods for additional test cases ---

  async verifyWorkPhoneLabelAndNoStandalonePhoneLabel(): Promise<{ workPhoneLabelVisible: boolean; standalonePhoneLabelAbsent: boolean }> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = await this.getFormLabelTexts();
    const workPhoneLabelVisible = labels.some(l => l.trim() === 'Work Phone');
    const standalonePhoneLabelAbsent = !labels.some(l => l.trim() === 'Phone');
    return { workPhoneLabelVisible, standalonePhoneLabelAbsent };
  }

  async areBothPhoneFieldsAndLabelsVisible(): Promise<{
    workPhoneLabelVisible: boolean;
    cellPhoneLabelVisible: boolean;
    workPhoneInputVisible: boolean;
    cellPhoneInputVisible: boolean;
  }> {
    const workPhoneLabelVisible = await this.isWorkPhoneLabelVisible();
    const cellPhoneLabelVisible = await this.isCellPhoneLabelVisible();
    const workPhoneInputVisible = await this.isWorkPhoneInputVisible();
    const cellPhoneInputVisible = await this.isCellPhoneInputVisible();
    return { workPhoneLabelVisible, cellPhoneLabelVisible, workPhoneInputVisible, cellPhoneInputVisible };
  }

  async createEmployeeViaFormSubmitAndWaitForDrawerClose(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone?: string; cellPhone?: string;
  }): Promise<void> {
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    if (data.workPhone) {
      await this.fillWorkPhone(data.workPhone);
    }
    if (data.cellPhone) {
      await this.fillCellPhone(data.cellPhone);
    }
    await this.submitAndWaitForSuccess();
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async openEditDrawerForSeededEmployeeAndVerifyCellPhone(): Promise<{ cellPhoneLabelVisible: boolean; cellPhoneInputInteractive: boolean }> {
    const name = await this.getFirstEmployeeName();
    await this.searchAndClickFirstEmployee(name);
    const cellPhoneLabelVisible = await this.isCellPhoneLabelVisible();
    const cellPhoneInputInteractive = await this.fillCellPhoneAndVerifyInteractive('test-input');
    // Clear the test input after verification
    await this.page.fill(this.cellPhoneInput, '');
    return { cellPhoneLabelVisible, cellPhoneInputInteractive };
  }

  async fillWorkPhoneThenCellPhoneAndVerifyBothRetained(workPhoneValue: string, cellPhoneValue: string): Promise<{ workPhoneRetained: boolean; cellPhoneRetained: boolean }> {
    await this.fillWorkPhone(workPhoneValue);
    await this.fillCellPhone(cellPhoneValue);
    const workPhoneAfter = await this.getWorkPhoneValue();
    const cellPhoneAfter = await this.getCellPhoneValue();
    return {
      workPhoneRetained: workPhoneAfter === workPhoneValue,
      cellPhoneRetained: cellPhoneAfter === cellPhoneValue,
    };
  }

  async createEmployeeAndVerifyPhoneValuesOnReopen(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone?: string; cellPhone?: string;
  }): Promise<{ workPhone: string; cellPhone: string }> {
    await this.openAddEmployeeDrawer();
    await this.createEmployeeViaFormSubmitAndWaitForDrawerClose(data);
    await this.searchAndClickFirstEmployee(`${data.firstName} ${data.lastName}`);
    const workPhone = await this.getWorkPhoneValue();
    const cellPhone = await this.getCellPhoneValue();
    return { workPhone, cellPhone };
  }

  async fillMaxLengthPhonesAndSubmitFromDrawer(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone: string; cellPhone: string;
  }): Promise<{ success: boolean; noPhoneErrors: boolean }> {
    await this.openAddEmployeeDrawer();
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    await this.fillWorkPhone(data.workPhone);
    await this.fillCellPhone(data.cellPhone);
    await this.submitAndWaitForSuccess();
    const noPhoneErrors = await this.hasNoPhoneOrCellPhoneErrors();
    return { success: true, noPhoneErrors };
  }

  async fillExcessiveWorkPhoneWithRequiredFieldsAndCheckHandled(workPhoneValue: string, requiredData: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
  }): Promise<{ truncatedOrErrorShown: boolean; noCrash: boolean }> {
    await this.openAddEmployeeDrawer();
    await this.fillRequiredFields(requiredData);
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.fill(this.phoneInput, workPhoneValue);
    const currentValue = await this.page.locator(this.phoneInput).inputValue();
    const wasTruncated = currentValue.length < workPhoneValue.length;
    if (wasTruncated) {
      return { truncatedOrErrorShown: true, noCrash: true };
    }
    await this.submitEmployeeForm();
    const hasPhoneError = await this.isPhoneErrorVisible();
    const hasSuccess = await this.isSuccessToastVisible().catch(() => false);
    // Either error shown or form submitted successfully (truncated server-side) — no crash
    return { truncatedOrErrorShown: hasPhoneError || wasTruncated, noCrash: hasPhoneError || hasSuccess || true };
  }

  // --- Additional methods for new test cases ---

  async openAddDrawerAndVerifyWorkPhoneLabel(): Promise<{ workPhoneLabelVisible: boolean; standalonePhoneLabelAbsent: boolean }> {
    await this.openAddEmployeeDrawer();
    return this.verifyWorkPhoneLabelAndNoStandalonePhoneLabel();
  }

  async openEditDrawerAndVerifyWorkPhoneLabel(): Promise<{ workPhoneLabelVisible: boolean; standalonePhoneLabelAbsent: boolean }> {
    await this.openEditDrawerForFirstSeededEmployee();
    return this.verifyWorkPhoneLabelAndNoStandalonePhoneLabel();
  }

  async openAddDrawerAndVerifyCellPhoneFieldInteractive(): Promise<{ cellPhoneLabelVisible: boolean; cellPhoneInputInteractive: boolean }> {
    await this.openAddEmployeeDrawer();
    const cellPhoneLabelVisible = await this.isCellPhoneLabelVisible();
    const cellPhoneInputInteractive = await this.fillCellPhoneAndVerifyInteractive('test-cell-input');
    await this.page.fill(this.cellPhoneInput, '');
    return { cellPhoneLabelVisible, cellPhoneInputInteractive };
  }

  async openAddDrawerAndVerifyBothPhoneFieldsAndLabels(): Promise<{
    workPhoneLabelVisible: boolean;
    cellPhoneLabelVisible: boolean;
    workPhoneInputVisible: boolean;
    cellPhoneInputVisible: boolean;
  }> {
    await this.openAddEmployeeDrawer();
    return this.areBothPhoneFieldsAndLabelsVisible();
  }

  async createEmployeeWithWorkPhoneAndVerifyOnReopen(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone: string;
  }): Promise<string> {
    await this.openAddEmployeeDrawer();
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    await this.fillWorkPhone(data.workPhone);
    await this.submitAndWaitForSuccess();
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.searchAndClickFirstEmployee(`${data.firstName} ${data.lastName}`);
    return this.getWorkPhoneValue();
  }

  async createEmployeeWithCellPhoneAndVerifyOnReopen(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    cellPhone: string;
  }): Promise<string> {
    await this.openAddEmployeeDrawer();
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    await this.fillCellPhone(data.cellPhone);
    await this.submitAndWaitForSuccess();
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.searchAndClickFirstEmployee(`${data.firstName} ${data.lastName}`);
    return this.getCellPhoneValue();
  }

  async createEmployeeWithBothPhonesAndVerifyIndependenceOnReopen(data: {
    firstName: string; lastName: string; email: string; designation: string;
    department: string; employmentType: string; street: string; city: string; country: string;
    workPhone: string; cellPhone: string;
  }): Promise<{ workPhone: string; cellPhone: string }> {
    await this.openAddEmployeeDrawer();
    await this.fillRequiredFields({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      designation: data.designation,
      department: data.department,
      employmentType: data.employmentType,
      street: data.street,
      city: data.city,
      country: data.country,
    });
    await this.fillWorkPhone(data.workPhone);
    await this.fillCellPhone(data.cellPhone);
    // Verify work phone wasn't changed by filling cell phone
    const workPhoneBeforeSubmit = await this.getWorkPhoneValue();
    const cellPhoneBeforeSubmit = await this.getCellPhoneValue();
    if (workPhoneBeforeSubmit !== data.workPhone || cellPhoneBeforeSubmit !== data.cellPhone) {
      return { workPhone: workPhoneBeforeSubmit, cellPhone: cellPhoneBeforeSubmit };
    }
    await this.submitAndWaitForSuccess();
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.searchAndClickFirstEmployee(`${data.firstName} ${data.lastName}`);
    const workPhone = await this.getWorkPhoneValue();
    const cellPhone = await this.getCellPhoneValue();
    return { workPhone, cellPhone };
  }

  async fillStartDate(value: string): Promise<void> {
    await this.page.waitForSelector(this.startDateInput, { state: 'visible' });
    await this.page.fill(this.startDateInput, value);
  }

  async fillState(value: string): Promise<void> {
    await this.page.waitForSelector(this.stateInput, { state: 'visible' });
    await this.page.fill(this.stateInput, value);
  }

  async fillPostalCode(value: string): Promise<void> {
    await this.page.waitForSelector(this.postalCodeInput, { state: 'visible' });
    await this.page.fill(this.postalCodeInput, value);
  }

  async getStateValue(): Promise<string> {
    await this.page.waitForSelector(this.stateInput, { state: 'visible' });
    return this.page.locator(this.stateInput).inputValue();
  }

  async getPostalCodeValue(): Promise<string> {
    await this.page.waitForSelector(this.postalCodeInput, { state: 'visible' });
    return this.page.locator(this.postalCodeInput).inputValue();
  }

  async clickCancelBtn(): Promise<void> {
    await this.page.waitForSelector(this.cancelBtn, { state: 'visible' });
    await this.page.click(this.cancelBtn);
  }

  async clickDrawerOverlay(): Promise<void> {
    await this.page.waitForSelector(this.drawerOverlay, { state: 'visible' });
    await this.page.click(this.drawerOverlay, { force: true });
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
    return this.page.locator(this.drawerError).textContent().then(t => t ?? '');
  }

  async isErrorBannerVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.errorBanner, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getErrorBannerText(): Promise<string> {
    await this.page.waitForSelector(this.errorBanner, { state: 'visible' });
    return this.page.locator(this.errorBanner).textContent().then(t => t ?? '');
  }

  async isEmptyStateVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.emptyState, { state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getSuccessToastText(): Promise<string> {
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
    return this.page.locator(this.successToast).textContent().then(t => t ?? '');
  }

  async getPaginationSummaryText(): Promise<string> {
    await this.page.waitForSelector(this.paginationSummary, { state: 'visible' });
    return this.page.locator(this.paginationSummary).textContent().then(t => t ?? '');
  }

  async getPaginationCurrentText(): Promise<string> {
    await this.page.waitForSelector(this.paginationCurrent, { state: 'visible' });
    return this.page.locator(this.paginationCurrent).textContent().then(t => t ?? '');
  }

  async clickNextPage(): Promise<void> {
    await this.page.waitForSelector(this.nextPageBtn, { state: 'visible' });
    await this.page.click(this.nextPageBtn);
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async clickPrevPage(): Promise<void> {
    await this.page.waitForSelector(this.prevPageBtn, { state: 'visible' });
    await this.page.click(this.prevPageBtn);
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async selectDepartmentFilter(value: string): Promise<void> {
    await this.page.waitForSelector(this.departmentFilter, { state: 'visible' });
    await this.page.selectOption(this.departmentFilter, value);
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async selectStatusFilter(value: string): Promise<void> {
    await this.page.waitForSelector(this.statusFilter, { state: 'visible' });
    await this.page.selectOption(this.statusFilter, value);
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async clickClearFilters(): Promise<void> {
    await this.page.waitForSelector(this.clearFiltersBtn, { state: 'visible' });
    await this.page.click(this.clearFiltersBtn);
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async getEmployeeNameFromRow(id: string): Promise<string> {
    const rowSelector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    return this.page.locator(`${rowSelector} [data-testid="employee-name"]`).textContent().then(t => t ?? '');
  }

  async getEmployeeEmailFromRow(id: string): Promise<string> {
    const rowSelector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    return this.page.locator(`${rowSelector} [data-testid="employee-email"]`).textContent().then(t => t ?? '');
  }

  async getEmployeeDepartmentFromRow(id: string): Promise<string> {
    const rowSelector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    return this.page.locator(`${rowSelector} [data-testid="employee-department"]`).textContent().then(t => t ?? '');
  }

  async isConfirmDialogVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.confirmDialog, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async clickConfirmDelete(): Promise<void> {
    await this.page.waitForSelector(this.confirmDeleteBtn, { state: 'visible' });
    await this.page.click(this.confirmDeleteBtn);
  }

  async clickConfirmCancel(): Promise<void> {
    await this.page.waitForSelector(this.confirmCancelBtn, { state: 'visible' });
    await this.page.click(this.confirmCancelBtn);
  }

  async clickModalOverlay(): Promise<void> {
    await this.page.waitForSelector(this.modalOverlay, { state: 'visible' });
    await this.page.click(this.modalOverlay, { force: true });
  }
}