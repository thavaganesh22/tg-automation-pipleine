import { Page } from '@playwright/test';

export class EmployeePaginationPage {
  private readonly page: Page;
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  private readonly employeeTable = '[data-testid="employee-table"]';
  private readonly loadingRow = '[data-testid="loading-row"]';
  private readonly searchInput = '[data-testid="search-input"]';
  private readonly pagination = '[data-testid="pagination"]';
  private readonly paginationSummary = '[data-testid="pagination-summary"]';
  private readonly prevPageBtn = '[data-testid="prev-page-btn"]';
  private readonly nextPageBtn = '[data-testid="next-page-btn"]';
  private readonly paginationCurrent = '[data-testid="pagination-current"]';
  private readonly employeeRowPrefix = '[data-testid^="employee-row-"]';
  private readonly employeeName = '[data-testid="employee-name"]';

  constructor(page: Page) {
    this.page = page;
  }

  async navigate(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForSelector(this.employeeTable, { timeout: 10000 });
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.page.waitForSelector(this.employeeRowPrefix, { timeout: 10000 }).catch(() => {});
  }

  async getFirstEmployeeId(): Promise<string> {
    const res = await this.page.request.get(`${this.baseUrl}/api/employees`);
    const body = await res.json();
    if (!body.data || body.data.length === 0) throw new Error('No employees found');
    return body.data[0]._id as string;
  }

  async getFirstVisibleEmployeeId(): Promise<string> {
    const testid = await this.page.locator(this.employeeRowPrefix).first().getAttribute('data-testid');
    if (!testid) throw new Error('No visible employee row');
    return testid.replace('employee-row-', '');
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
    return this.page.locator(this.employeeRowPrefix).count();
  }

  async getVisibleEmployeeNames(): Promise<string[]> {
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return this.page.locator(this.employeeName).allTextContents();
  }

  async isPaginationVisible(): Promise<boolean> {
    try {
      await this.page.waitForSelector(this.pagination, { state: 'visible', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getPaginationSummaryText(): Promise<string> {
    await this.page.waitForSelector(this.paginationSummary, { state: 'visible' });
    return (await this.page.locator(this.paginationSummary).textContent()) ?? '';
  }

  async getPaginationCurrentText(): Promise<string> {
    await this.page.waitForSelector(this.paginationCurrent, { state: 'visible' });
    return (await this.page.locator(this.paginationCurrent).textContent()) ?? '';
  }

  async getCurrentPageNumber(): Promise<number> {
    const text = await this.getPaginationCurrentText();
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  async getTotalPageCount(): Promise<number> {
    const text = await this.getPaginationCurrentText();
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    return match ? parseInt(match[2], 10) : 1;
  }

  async isNextPageButtonEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.nextPageBtn, { state: 'visible' });
    return !(await this.page.locator(this.nextPageBtn).isDisabled());
  }

  async isPrevPageButtonEnabled(): Promise<boolean> {
    await this.page.waitForSelector(this.prevPageBtn, { state: 'visible' });
    return !(await this.page.locator(this.prevPageBtn).isDisabled());
  }

  async goToNextPage(): Promise<void> {
    await this.page.waitForSelector(this.nextPageBtn, { state: 'visible' });
    await Promise.all([
      this.page.waitForResponse(res => res.url().includes('/api/employees') && res.status() === 200),
      this.page.click(this.nextPageBtn),
    ]);
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async goToPrevPage(): Promise<void> {
    await this.page.waitForSelector(this.prevPageBtn, { state: 'visible' });
    await Promise.all([
      this.page.waitForResponse(res => res.url().includes('/api/employees') && res.status() === 200),
      this.page.click(this.prevPageBtn),
    ]);
    await this.page.locator(this.loadingRow).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async clickNextPageButton(): Promise<void> {
    await this.page.waitForSelector(this.nextPageBtn, { state: 'visible' });
    await this.page.click(this.nextPageBtn);
  }

  async clickPrevPageButton(): Promise<void> {
    await this.page.waitForSelector(this.prevPageBtn, { state: 'visible' });
    await this.page.click(this.prevPageBtn);
  }

  async goToLastPage(): Promise<void> {
    let totalPages = await this.getTotalPageCount();
    let currentPage = await this.getCurrentPageNumber();
    while (currentPage < totalPages) {
      await this.goToNextPage();
      currentPage = await this.getCurrentPageNumber();
      totalPages = await this.getTotalPageCount();
    }
  }
}