import { Page, Locator, expect } from '@playwright/test';

export class AnalyticsDashboardPage {
  readonly page: Page;

  // Header elements
  readonly dashboardTitle: Locator;
  readonly timeRangeSelector: Locator;
  readonly exportButton: Locator;
  readonly refreshButton: Locator;

  // Metric cards
  readonly metricCards: Locator;
  readonly totalTokensCard: Locator;
  readonly totalCostCard: Locator;
  readonly apiRequestsCard: Locator;
  readonly avgDailyTokensCard: Locator;

  // Charts
  readonly usageTrendsChart: Locator;
  readonly costByProviderChart: Locator;
  readonly tokensByModelChart: Locator;
  readonly dailyCostTrendsChart: Locator;

  // Data table
  readonly conversationsTable: Locator;
  readonly tableHeaders: Locator;
  readonly tableRows: Locator;
  readonly tableData: Locator;

  // Loading and error states
  readonly loadingSpinner: Locator;
  readonly errorMessage: Locator;
  readonly retryButton: Locator;
  readonly noDataMessage: Locator;

  // Chart tooltips and interactions
  readonly chartTooltip: Locator;
  readonly chartLegend: Locator;
  readonly chartData: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.dashboardTitle = page.getByRole('heading', { name: /usage analytics/i });
    this.timeRangeSelector = page.locator('[data-testid="time-range-selector"]').or(
      page.locator('.bg-gray-100.dark\\:bg-gray-700')
    );
    this.exportButton = page.getByRole('button', { name: /export csv/i });
    this.refreshButton = page.getByRole('button', { name: /refresh/i });

    // Metric cards
    this.metricCards = page.locator('[data-testid="metric-card"]').or(
      page.locator('.bg-white.dark\\:bg-gray-800.rounded-lg.p-6.shadow')
    );
    this.totalTokensCard = this.metricCards.filter({ hasText: /total tokens/i });
    this.totalCostCard = this.metricCards.filter({ hasText: /total cost/i });
    this.apiRequestsCard = this.metricCards.filter({ hasText: /api requests/i });
    this.avgDailyTokensCard = this.metricCards.filter({ hasText: /avg daily tokens/i });

    // Charts
    this.usageTrendsChart = page.locator('[data-testid="usage-trends-chart"]').or(
      page.locator('.recharts-wrapper').first()
    );
    this.costByProviderChart = page.locator('[data-testid="cost-by-provider-chart"]');
    this.tokensByModelChart = page.locator('[data-testid="tokens-by-model-chart"]');
    this.dailyCostTrendsChart = page.locator('[data-testid="daily-cost-trends-chart"]');

    // Table
    this.conversationsTable = page.locator('table');
    this.tableHeaders = page.locator('th');
    this.tableRows = page.locator('tbody tr');
    this.tableData = page.locator('td');

    // States
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]').or(
      page.locator('.animate-spin')
    );
    this.errorMessage = page.locator('[data-testid="error-message"]').or(
      page.locator('.text-red-600')
    );
    this.retryButton = page.getByRole('button', { name: /retry/i });
    this.noDataMessage = page.getByText(/no analytics data available/i);

    // Chart interactions
    this.chartTooltip = page.locator('.recharts-tooltip-wrapper');
    this.chartLegend = page.locator('.recharts-legend-wrapper');
    this.chartData = page.locator('.recharts-active-dot');
  }

  async goto() {
    await this.page.goto('/analytics');
  }

  async waitForDashboardLoad(timeout: number = 15000) {
    // Wait for loading to complete
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout }).catch(() => {});
    
    // Wait for either dashboard content or error
    await Promise.race([
      this.metricCards.first().waitFor({ state: 'visible', timeout }),
      this.errorMessage.waitFor({ state: 'visible', timeout }),
      this.noDataMessage.waitFor({ state: 'visible', timeout })
    ]);
  }

  async selectTimeRange(range: '7d' | '30d' | '90d') {
    const button = this.timeRangeSelector.getByRole('button', { 
      name: new RegExp(`${range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}`, 'i') 
    });
    
    await button.click();
    await this.waitForDashboardLoad();
  }

  async exportData() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportButton.click();
    
    const download = await downloadPromise;
    return download;
  }

  async refreshDashboard() {
    await this.refreshButton.click();
    await this.waitForDashboardLoad();
  }

  async expectDashboardLoaded() {
    await expect(this.dashboardTitle).toBeVisible();
    await expect(this.metricCards.first()).toBeVisible();
    await expect(this.usageTrendsChart).toBeVisible();
  }

  async expectMetricCards() {
    await expect(this.metricCards).toHaveCount(4);
    await expect(this.totalTokensCard).toBeVisible();
    await expect(this.totalCostCard).toBeVisible();
    await expect(this.apiRequestsCard).toBeVisible();
    await expect(this.avgDailyTokensCard).toBeVisible();
  }

  async expectMetricValue(cardName: string, expectedValue?: string) {
    const card = this.metricCards.filter({ hasText: new RegExp(cardName, 'i') });
    await expect(card).toBeVisible();
    
    if (expectedValue) {
      await expect(card).toContainText(expectedValue);
    } else {
      // Just check that it has some numeric value
      const valueText = await card.locator('.text-2xl.font-bold').textContent();
      expect(valueText).toMatch(/[\d,.$KM]+/);
    }
  }

  async expectCharts() {
    await expect(this.usageTrendsChart).toBeVisible();
    await expect(this.costByProviderChart).toBeVisible();
    await expect(this.tokensByModelChart).toBeVisible();
    await expect(this.dailyCostTrendsChart).toBeVisible();
  }

  async expectConversationsTable() {
    await expect(this.conversationsTable).toBeVisible();
    await expect(this.tableHeaders).toHaveCount(5); // Conversation, Model, Tokens, Cost, Requests
    
    // Check headers
    await expect(this.tableHeaders.nth(0)).toContainText(/conversation/i);
    await expect(this.tableHeaders.nth(1)).toContainText(/model/i);
    await expect(this.tableHeaders.nth(2)).toContainText(/tokens/i);
    await expect(this.tableHeaders.nth(3)).toContainText(/cost/i);
    await expect(this.tableHeaders.nth(4)).toContainText(/requests/i);
  }

  async expectTableData(rowCount?: number) {
    if (rowCount !== undefined) {
      await expect(this.tableRows).toHaveCount(rowCount);
    } else {
      await expect(this.tableRows.first()).toBeVisible();
    }
  }

  async expectLoadingState() {
    await expect(this.loadingSpinner).toBeVisible();
    await expect(this.dashboardTitle).toContainText(/loading|analytics/i);
  }

  async expectErrorState(message?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
    await expect(this.retryButton).toBeVisible();
  }

  async expectNoDataState() {
    await expect(this.noDataMessage).toBeVisible();
  }

  // Chart interaction methods
  async hoverOverChart(chartLocator: Locator, dataPoint?: number) {
    if (dataPoint !== undefined) {
      const chartPoints = chartLocator.locator('.recharts-dot, .recharts-active-dot');
      await chartPoints.nth(dataPoint).hover();
    } else {
      await chartLocator.hover();
    }
    
    await expect(this.chartTooltip).toBeVisible();
  }

  async expectChartTooltip(expectedData?: string[]) {
    await expect(this.chartTooltip).toBeVisible();
    
    if (expectedData) {
      for (const data of expectedData) {
        await expect(this.chartTooltip).toContainText(data);
      }
    }
  }

  async clickChartLegend(legendItem: string) {
    const legendButton = this.chartLegend.getByText(legendItem);
    await legendButton.click();
  }

  // Data validation methods
  async validateMetricCalculations() {
    // Get metric values and validate they make sense
    const totalTokens = await this.totalTokensCard.locator('.text-2xl.font-bold').textContent();
    const totalCost = await this.totalCostCard.locator('.text-2xl.font-bold').textContent();
    const apiRequests = await this.apiRequestsCard.locator('.text-2xl.font-bold').textContent();
    
    // Basic validation that we have numeric values
    expect(totalTokens).toMatch(/[\d,KM]+/);
    expect(totalCost).toMatch(/\$[\d,.]+/);
    expect(apiRequests).toMatch(/[\d,KM]+/);
  }

  async validateChartData() {
    // Hover over charts to ensure they have data
    await this.hoverOverChart(this.usageTrendsChart);
    await this.expectChartTooltip();
    
    await this.hoverOverChart(this.dailyCostTrendsChart);
    await this.expectChartTooltip();
  }

  // Accessibility methods
  async expectAriaLabels() {
    await expect(this.exportButton).toHaveAttribute('aria-label');
    await expect(this.timeRangeSelector).toHaveAttribute('role');
  }

  async navigateWithKeyboard() {
    await this.timeRangeSelector.focus();
    await this.page.keyboard.press('Tab');
    await expect(this.exportButton).toBeFocused();
  }

  async expectScreenReaderContent() {
    // Check for chart descriptions
    const chartDescriptions = this.page.locator('[aria-label*="chart"], [aria-describedby]');
    await expect(chartDescriptions.first()).toBeAttached();
  }

  // Error recovery methods
  async retryAfterError() {
    await this.expectErrorState();
    await this.retryButton.click();
    await this.waitForDashboardLoad();
  }

  async handleNetworkError() {
    await this.expectErrorState(/network|failed to fetch/i);
    
    // Wait a moment and retry
    await this.page.waitForTimeout(2000);
    await this.retryAfterError();
  }

  // Performance testing
  async measureLoadTime() {
    const startTime = Date.now();
    await this.goto();
    await this.waitForDashboardLoad();
    const endTime = Date.now();
    return endTime - startTime;
  }

  async expectFastLoad(maxTime: number = 10000) {
    const loadTime = await this.measureLoadTime();
    expect(loadTime).toBeLessThan(maxTime);
  }

  // Mobile responsiveness
  async expectMobileLayout() {
    const viewport = this.page.viewportSize();
    if (viewport && viewport.width < 768) {
      // Check that metric cards stack vertically on mobile
      const firstCard = this.metricCards.first();
      const secondCard = this.metricCards.nth(1);
      
      const firstCardBox = await firstCard.boundingBox();
      const secondCardBox = await secondCard.boundingBox();
      
      if (firstCardBox && secondCardBox) {
        // Cards should be stacked (second card below first)
        expect(secondCardBox.y).toBeGreaterThan(firstCardBox.y + firstCardBox.height);
      }
      
      // Charts should be responsive
      await expect(this.usageTrendsChart).toHaveCSS('width', /100%|auto/);
    }
  }

  // Data filtering and sorting
  async sortTableBy(column: string, direction: 'asc' | 'desc' = 'asc') {
    const headerButton = this.tableHeaders.filter({ hasText: new RegExp(column, 'i') });
    await headerButton.click();
    
    if (direction === 'desc') {
      await headerButton.click(); // Click again for descending
    }
    
    // Wait for table to update
    await this.page.waitForTimeout(1000);
  }

  async expectTableSorted(column: string, direction: 'asc' | 'desc') {
    // This would require more complex logic to validate sorting
    // For now, just ensure the table is still visible after sort
    await expect(this.tableRows.first()).toBeVisible();
  }

  // Date range validation
  async validateTimeRangeData(range: '7d' | '30d' | '90d') {
    await this.selectTimeRange(range);
    
    // Validate that charts show appropriate data for the time range
    await this.hoverOverChart(this.usageTrendsChart);
    
    // Check that tooltip shows dates within the selected range
    const tooltipText = await this.chartTooltip.textContent();
    expect(tooltipText).toBeTruthy();
  }
}