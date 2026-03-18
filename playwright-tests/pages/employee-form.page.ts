import { Page } from '@playwright/test';

export class EmployeeFormPage {
  private readonly page: Page;
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly addEmployeeBtn = '[data-testid="add-employee-btn"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly employeeDrawer = '[data-testid="employee-drawer"]';
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

  // New selectors
  private readonly startDateInput = '[data-testid="startDate-input"]';
  private readonly closeDrawerBtn = '[data-testid="close-drawer-btn"]';
  private readonly drawerError = '[data-testid="drawer-error"]';
  private readonly phoneError = '[data-testid="phone-error"]';
  private readonly cellPhoneError = '[data-testid="cellPhone-error"]';

  // Additional selectors
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
    await row.waitFor({ state: 'visible', timeout: 10000 });
    const testId = await row.getAttribute('data-testid');
    if (!testId) throw new Error('No visible employee row found');
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

  async clickEmployeeRow(id: string): Promise<void> {
    const selector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.click(selector);
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

  async fillPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.fill(this.phoneInput, value);
  }

  async fillCellPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.fill(this.cellPhoneInput, value);
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

  async fillRequiredFields(data: { firstName: string; lastName: string; email: string; designation: string; department: string; employmentType: string; street: string; city: string; country: string }): Promise<void> {
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

  async getPhoneInputValue(): Promise<string> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).inputValue();
  }

  async getCellPhoneInputValue(): Promise<string> {
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

  async isCellPhoneInputEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    return this.page.locator(this.cellPhoneInput).isEnabled();
  }

  async getDrawerLabelTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    return this.page.locator(`${this.employeeDrawer} label`).allTextContents();
  }

  async isLabelVisibleInDrawer(labelText: string): Promise<boolean> {
    const labels = await this.getDrawerLabelTexts();
    return labels.some(l => l.trim() === labelText);
  }

  async isExactStandaloneLabelPresent(labelText: string): Promise<boolean> {
    const labels = await this.getDrawerLabelTexts();
    return labels.some(l => l.trim() === labelText);
  }

  async waitForDrawerToClose(): Promise<void> {
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 10000 });
  }

  // --- New methods ---

  async getFirstEmployeeName(): Promise<string> {
    const res = await this.page.request.get(`${this.baseUrl}/api/employees`);
    const body = await res.json();
    if (!body.data || body.data.length === 0) throw new Error('No employees found');
    const emp = body.data[0] as { firstName: string; lastName: string };
    return `${emp.firstName} ${emp.lastName}`;
  }

  async closeDrawer(): Promise<void> {
    await this.page.waitForSelector(this.closeDrawerBtn, { state: 'visible' });
    await this.page.click(this.closeDrawerBtn);
    await this.page.locator(this.employeeDrawer).waitFor({ state: 'hidden', timeout: 10000 });
  }

  async isPhoneErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.phoneError, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async isCellPhoneErrorVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.cellPhoneError, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getVisibleErrorTexts(): Promise<string[]> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    return this.page.locator(`${this.employeeDrawer} [data-testid$="-error"]`).allTextContents();
  }

  async isPhoneInputInViewport(): Promise<boolean> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    return this.page.locator(this.phoneInput).isVisible();
  }

  async isLabelInViewportWithoutScroll(labelText: string): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = this.page.locator(`${this.employeeDrawer} label`);
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const text = (await labels.nth(i).textContent() ?? '').trim();
      if (text === labelText) {
        const box = await labels.nth(i).boundingBox();
        if (!box) return false;
        const viewport = this.page.viewportSize();
        if (!viewport) return false;
        return box.y >= 0 && box.y + box.height <= viewport.height;
      }
    }
    return false;
  }

  async isLabelReachableByScrollingInDrawer(labelText: string): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = this.page.locator(`${this.employeeDrawer} label`);
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const text = (await labels.nth(i).textContent() ?? '').trim();
      if (text === labelText) {
        await labels.nth(i).scrollIntoViewIfNeeded();
        return labels.nth(i).isVisible();
      }
    }
    return false;
  }

  async fillStartDate(value: string): Promise<void> {
    await this.page.waitForSelector(this.startDateInput, { state: 'visible' });
    await this.page.fill(this.startDateInput, value);
  }

  async getStartDateInputValue(): Promise<string> {
    await this.page.waitForSelector(this.startDateInput, { state: 'visible' });
    return this.page.locator(this.startDateInput).inputValue();
  }

  async clearSearchInput(): Promise<void> {
    const searchLoc = this.page.locator(this.searchInput);
    await searchLoc.waitFor({ state: 'visible' });
    await searchLoc.fill('');
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async getEmployeeNameFromRow(id: string): Promise<string> {
    const rowSelector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    const nameCell = this.page.locator(`${rowSelector} [data-testid="employee-name"]`);
    await nameCell.waitFor({ state: 'visible' });
    return (await nameCell.textContent() ?? '').trim();
  }

  async getEmployeeEmailFromRow(id: string): Promise<string> {
    const rowSelector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    const emailCell = this.page.locator(`${rowSelector} [data-testid="employee-email"]`);
    await emailCell.waitFor({ state: 'visible' });
    return (await emailCell.textContent() ?? '').trim();
  }

  async getEmployeeDepartmentFromRow(id: string): Promise<string> {
    const rowSelector = `[data-testid="employee-row-${id}"]`;
    await this.page.waitForSelector(rowSelector, { state: 'visible' });
    const deptCell = this.page.locator(`${rowSelector} [data-testid="employee-department"]`);
    await deptCell.waitFor({ state: 'visible' });
    return (await deptCell.textContent() ?? '').trim();
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
    return (await this.page.locator(this.drawerError).textContent() ?? '').trim();
  }

  async isSuccessToastVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getSuccessToastText(): Promise<string> {
    await this.page.waitForSelector(this.successToast, { state: 'visible', timeout: 15000 });
    return (await this.page.locator(this.successToast).textContent() ?? '').trim();
  }

  async hasAnyVisibleErrorContaining(text: string): Promise<boolean> {
    const errors = await this.getVisibleErrorTexts();
    return errors.some(e => e.toLowerCase().includes(text.toLowerCase()));
  }

  async setViewportSize(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  // --- Additional methods for new test cases ---

  /**
   * Checks whether a standalone label with the exact text exists in the drawer.
   * "Standalone" means the label text is exactly the given string, not a substring
   * of another label (e.g. 'Phone' should not match 'Work Phone' or 'Cell Phone').
   */
  async isStandaloneLabelPresentInDrawer(labelText: string): Promise<boolean> {
    const labels = await this.getDrawerLabelTexts();
    return labels.some(l => l.trim() === labelText);
  }

  /**
   * Returns the count of phone-related labels in the drawer.
   * A label is considered phone-related if it contains the word "Phone" (case-insensitive).
   */
  async getPhoneRelatedLabelCount(): Promise<number> {
    const labels = await this.getDrawerLabelTexts();
    return labels.filter(l => l.trim().toLowerCase().includes('phone')).length;
  }

  /**
   * Returns all phone-related label texts found in the drawer.
   */
  async getPhoneRelatedLabels(): Promise<string[]> {
    const labels = await this.getDrawerLabelTexts();
    return labels.filter(l => l.trim().toLowerCase().includes('phone')).map(l => l.trim());
  }

  /**
   * Clears the Cell Phone field and enters a new value.
   */
  async clearAndFillCellPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.locator(this.cellPhoneInput).clear();
    await this.page.fill(this.cellPhoneInput, value);
  }

  /**
   * Clears the Work Phone (phone) field and enters a new value.
   */
  async clearAndFillPhone(value: string): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'visible' });
    await this.page.locator(this.phoneInput).clear();
    await this.page.fill(this.phoneInput, value);
  }

  /**
   * Checks if the Cell Phone input field is interactive by clicking into it,
   * typing a value, and verifying the value was accepted.
   */
  async isCellPhoneInputInteractive(testValue: string): Promise<boolean> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'visible' });
    await this.page.locator(this.cellPhoneInput).click();
    await this.page.fill(this.cellPhoneInput, testValue);
    const currentValue = await this.page.locator(this.cellPhoneInput).inputValue();
    return currentValue === testValue;
  }

  /**
   * Gets the first employee's data (firstName, lastName, phone, cellPhone) via API.
   */
  async getFirstEmployeeData(): Promise<{ firstName: string; lastName: string; phone: string; cellPhone: string }> {
    const res = await this.page.request.get(`${this.baseUrl}/api/employees`);
    const body = await res.json();
    if (!body.data || body.data.length === 0) throw new Error('No employees found');
    const emp = body.data[0] as { firstName: string; lastName: string; phone?: string; cellPhone?: string };
    return {
      firstName: emp.firstName,
      lastName: emp.lastName,
      phone: emp.phone ?? '',
      cellPhone: emp.cellPhone ?? '',
    };
  }

  /**
   * Scrolls to the phone input within the drawer to ensure it's visible.
   */
  async scrollToPhoneInputInDrawer(): Promise<void> {
    await this.page.waitForSelector(this.phoneInput, { state: 'attached' });
    await this.page.locator(this.phoneInput).scrollIntoViewIfNeeded();
  }

  /**
   * Scrolls to the cell phone input within the drawer to ensure it's visible.
   */
  async scrollToCellPhoneInputInDrawer(): Promise<void> {
    await this.page.waitForSelector(this.cellPhoneInput, { state: 'attached' });
    await this.page.locator(this.cellPhoneInput).scrollIntoViewIfNeeded();
  }

  /**
   * Checks if a label is fully visible (not clipped) at the current viewport size
   * by scrolling to it first, then checking its bounding box fits within the viewport.
   */
  async isLabelFullyVisibleAfterScroll(labelText: string): Promise<boolean> {
    await this.page.waitForSelector(this.employeeDrawer, { state: 'visible' });
    const labels = this.page.locator(`${this.employeeDrawer} label`);
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const text = (await labels.nth(i).textContent() ?? '').trim();
      if (text === labelText) {
        await labels.nth(i).scrollIntoViewIfNeeded();
        const box = await labels.nth(i).boundingBox();
        if (!box) return false;
        const viewport = this.page.viewportSize();
        if (!viewport) return false;
        return (
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width &&
          box.y + box.height <= viewport.height
        );
      }
    }
    return false;
  }

  /**
   * Checks that no standalone 'Phone' label exists (i.e., no label whose trimmed text
   * is exactly 'Phone'). Returns true if no such standalone label is found.
   */
  async isNoStandalonePhoneLabelPresent(): Promise<boolean> {
    const labels = await this.getDrawerLabelTexts();
    return !labels.some(l => l.trim() === 'Phone');
  }

  /**
   * Fills all required fields plus optional phone fields for a complete employee form submission.
   */
  async fillCompleteForm(data: {
    firstName: string;
    lastName: string;
    email: string;
    designation: string;
    department: string;
    employmentType: string;
    street: string;
    city: string;
    country: string;
    phone?: string;
    cellPhone?: string;
  }): Promise<void> {
    await this.fillRequiredFields(data);
    if (data.phone) {
      await this.fillPhone(data.phone);
    }
    if (data.cellPhone) {
      await this.fillCellPhone(data.cellPhone);
    }
  }

  /**
   * Waits for the loading row to disappear after a table refresh.
   */
  async waitForTableToLoad(): Promise<void> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}