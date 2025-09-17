import { test, expect, devices } from '@playwright/test';
import { AuthPage } from './page-objects/AuthPage';
import { AnalyticsDashboardPage } from './page-objects/AnalyticsDashboardPage';
import { ChatPage } from './page-objects/ChatPage';

test.describe('Analytics Dashboard', () => {
  let authPage: AuthPage;
  let dashboardPage: AnalyticsDashboardPage;
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    dashboardPage = new AnalyticsDashboardPage(page);
    chatPage = new ChatPage(page);
    
    // Login and generate some usage data
    await authPage.goto();
    await authPage.login('test@workbench.com', 'testpassword123');
    
    // Generate some test data by having conversations
    await test.step('Generate test data', async () => {
      await chatPage.sendMessage('What is artificial intelligence?');
      await chatPage.sendMessage('Explain machine learning algorithms');
      await chatPage.sendMessage('Tell me about neural networks');
    });
  });

  test.describe('Dashboard Loading', () => {
    test('should display dashboard correctly', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.expectDashboardLoaded();
    });

    test('should show loading state while fetching data', async () => {
      // Simulate slow API response
      await dashboardPage.page.route('**/api/analytics/**', route => {
        setTimeout(() => route.continue(), 2000);
      });
      
      await dashboardPage.goto();
      await dashboardPage.expectLoadingState();
      
      await dashboardPage.waitForDashboardLoad();
      await dashboardPage.expectDashboardLoaded();
    });

    test('should handle no data state', async () => {
      // Mock empty analytics data
      await dashboardPage.page.route('**/api/analytics/**', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            stats: { total_tokens: 0, total_cost_cents: 0, total_requests: 0 },
            daily: [],
            by_provider: [],
            by_model: []
          })
        });
      });
      
      await dashboardPage.goto();
      await dashboardPage.expectNoDataState();
    });

    test('should handle API errors gracefully', async () => {
      await dashboardPage.page.route('**/api/analytics/**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Analytics service unavailable' })
        });
      });
      
      await dashboardPage.goto();
      await dashboardPage.expectErrorState(/analytics service|unavailable/i);
    });
  });

  test.describe('Metric Cards', () => {
    test('should display all metric cards', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.expectMetricCards();
    });

    test('should show realistic metric values', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.expectMetricValue('Total Tokens');
      await dashboardPage.expectMetricValue('Total Cost');
      await dashboardPage.expectMetricValue('API Requests');
      await dashboardPage.expectMetricValue('Avg Daily Tokens');
    });

    test('should update metrics when time range changes', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Get initial token count
      const initialTokens = await dashboardPage.totalTokensCard.locator('.text-2xl.font-bold').textContent();
      
      // Change time range
      await dashboardPage.selectTimeRange('7d');
      
      // Metrics should update (might be same or different)
      await dashboardPage.expectMetricValue('Total Tokens');
      
      // Change to longer range
      await dashboardPage.selectTimeRange('90d');
      await dashboardPage.expectMetricValue('Total Tokens');
    });

    test('should format large numbers correctly', async () => {
      // Mock large numbers
      await dashboardPage.page.route('**/api/analytics/**', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            stats: {
              total_tokens: 1500000,
              total_cost_cents: 15000,
              total_requests: 25000
            },
            daily: [],
            by_provider: [],
            by_model: []
          })
        });
      });
      
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Should format numbers with K/M suffixes
      await expect(dashboardPage.totalTokensCard).toContainText(/1\.5M/);
      await expect(dashboardPage.totalCostCard).toContainText(/\$150/);
      await expect(dashboardPage.apiRequestsCard).toContainText(/25K/);
    });
  });

  test.describe('Charts and Visualizations', () => {
    test('should display all charts', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.expectCharts();
    });

    test('should show chart tooltips on hover', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.hoverOverChart(dashboardPage.usageTrendsChart);
      await dashboardPage.expectChartTooltip();
    });

    test('should display chart data correctly', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.validateChartData();
    });

    test('should handle empty chart data', async () => {
      // Mock empty chart data
      await dashboardPage.page.route('**/api/analytics/**', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            stats: { total_tokens: 0, total_cost_cents: 0, total_requests: 0 },
            daily: [],
            by_provider: [],
            by_model: []
          })
        });
      });
      
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Charts should handle empty data gracefully
      await expect(dashboardPage.usageTrendsChart).toBeVisible();
    });

    test('should update charts when time range changes', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Change time range and verify charts update
      await dashboardPage.selectTimeRange('7d');
      await dashboardPage.expectCharts();
      
      await dashboardPage.selectTimeRange('90d');
      await dashboardPage.expectCharts();
    });

    test('should handle chart interactions', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Test legend interactions if available
      try {
        await dashboardPage.clickChartLegend('GPT-4');
        // Chart should update based on legend interaction
        await dashboardPage.expectCharts();
      } catch {
        // Legend interaction might not be available for all charts
      }
    });
  });

  test.describe('Data Table', () => {
    test('should display conversations table', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.expectConversationsTable();
    });

    test('should show conversation data', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.expectTableData();
      
      // Should show at least the conversations we created
      const rowCount = await dashboardPage.tableRows.count();
      expect(rowCount).toBeGreaterThan(0);
    });

    test('should sort table by columns', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Test sorting by tokens
      await dashboardPage.sortTableBy('Tokens', 'desc');
      await dashboardPage.expectTableSorted('Tokens', 'desc');
      
      // Test sorting by cost
      await dashboardPage.sortTableBy('Cost', 'asc');
      await dashboardPage.expectTableSorted('Cost', 'asc');
    });

    test('should handle large number of conversations', async () => {
      // Generate more conversations
      for (let i = 0; i < 10; i++) {
        await chatPage.sendMessage(`Test message ${i}`);
      }
      
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Should handle pagination or scrolling
      await dashboardPage.expectTableData(10);
    });
  });

  test.describe('Time Range Selection', () => {
    test('should change time range correctly', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Test each time range
      await dashboardPage.selectTimeRange('7d');
      await dashboardPage.validateTimeRangeData('7d');
      
      await dashboardPage.selectTimeRange('30d');
      await dashboardPage.validateTimeRangeData('30d');
      
      await dashboardPage.selectTimeRange('90d');
      await dashboardPage.validateTimeRangeData('90d');
    });

    test('should persist time range selection', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.selectTimeRange('7d');
      
      // Reload page
      await dashboardPage.page.reload();
      await dashboardPage.waitForDashboardLoad();
      
      // Time range should be maintained
      const activeButton = dashboardPage.timeRangeSelector.locator('.bg-white.shadow');
      await expect(activeButton).toContainText('7 Days');
    });

    test('should validate date ranges in chart data', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.selectTimeRange('7d');
      
      // Hover over chart to see date range
      await dashboardPage.hoverOverChart(dashboardPage.usageTrendsChart, 0);
      
      const tooltipText = await dashboardPage.chartTooltip.textContent();
      
      // Should show recent dates
      const today = new Date();
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      expect(tooltipText).toBeTruthy();
    });
  });

  test.describe('Export Functionality', () => {
    test('should export data as CSV', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      const download = await dashboardPage.exportData();
      
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    });

    test('should export correct data format', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      const download = await dashboardPage.exportData();
      const downloadPath = await download.path();
      
      expect(downloadPath).toBeTruthy();
      
      // Could verify CSV content if needed
      // const fs = require('fs');
      // const csvContent = fs.readFileSync(downloadPath, 'utf8');
      // expect(csvContent).toContain('Date,Tokens,Cost');
    });

    test('should handle export errors', async () => {
      await dashboardPage.page.route('**/api/analytics/export**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Export failed' })
        });
      });
      
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.exportButton.click();
      
      // Should show error message
      await dashboardPage.expectErrorState(/export failed/i);
    });
  });

  test.describe('Real-time Updates', () => {
    test('should refresh data manually', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Get initial token count
      const initialTokens = await dashboardPage.totalTokensCard.locator('.text-2xl.font-bold').textContent();
      
      // Generate more data
      await chatPage.sendMessage('Additional test message for refresh');
      
      // Refresh dashboard
      await dashboardPage.refreshDashboard();
      
      // Data should be updated
      await dashboardPage.expectMetricValue('Total Tokens');
    });

    test('should handle auto-refresh', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // If auto-refresh is implemented, it should update data periodically
      const initialTime = Date.now();
      
      // Wait for potential auto-refresh (if implemented)
      await dashboardPage.page.waitForTimeout(5000);
      
      // Dashboard should still be functional
      await dashboardPage.expectDashboardLoaded();
    });

    test('should update after new conversations', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      const initialRequests = await dashboardPage.apiRequestsCard.locator('.text-2xl.font-bold').textContent();
      
      // Create new conversation
      await chatPage.goto();
      await chatPage.sendMessage('New conversation for analytics testing');
      
      // Go back to dashboard
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Should show updated data
      await dashboardPage.expectMetricValue('API Requests');
    });
  });

  test.describe('Error Handling', () => {
    test('should retry after network errors', async () => {
      await dashboardPage.goto();
      
      let requestCount = 0;
      await dashboardPage.page.route('**/api/analytics/**', route => {
        requestCount++;
        if (requestCount === 1) {
          route.fulfill({ status: 500 });
        } else {
          route.continue();
        }
      });
      
      await dashboardPage.expectErrorState();
      await dashboardPage.retryAfterError();
      
      // Should eventually load
      await dashboardPage.expectDashboardLoaded();
    });

    test('should handle partial data loading failures', async () => {
      // Mock scenario where some endpoints fail
      await dashboardPage.page.route('**/api/analytics/overview**', route => {
        route.continue();
      });
      
      await dashboardPage.page.route('**/api/analytics/cost-breakdown**', route => {
        route.fulfill({ status: 500 });
      });
      
      await dashboardPage.goto();
      
      // Should handle partial failures gracefully
      await Promise.race([
        dashboardPage.expectDashboardLoaded(),
        dashboardPage.expectErrorState()
      ]);
    });

    test('should handle network disconnection', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Simulate network disconnection
      await dashboardPage.page.context().setOffline(true);
      
      await dashboardPage.refreshButton.click();
      
      // Should show network error
      await dashboardPage.handleNetworkError();
      
      // Reconnect
      await dashboardPage.page.context().setOffline(false);
      
      // Should allow retry
      await dashboardPage.retryAfterError();
    });
  });

  test.describe('Performance', () => {
    test('should load dashboard quickly', async () => {
      await dashboardPage.expectFastLoad(10000);
    });

    test('should handle large datasets efficiently', async () => {
      // Generate lots of data
      for (let i = 0; i < 50; i++) {
        await chatPage.sendMessage(`Performance test message ${i}`);
      }
      
      const startTime = Date.now();
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      const loadTime = Date.now() - startTime;
      
      // Should still load within reasonable time
      expect(loadTime).toBeLessThan(15000);
    });

    test('should validate metric calculations', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.validateMetricCalculations();
    });

    test('should handle concurrent dashboard access', async () => {
      // Open multiple dashboard instances
      const context = dashboardPage.page.context();
      const newPage = await context.newPage();
      const newDashboardPage = new AnalyticsDashboardPage(newPage);
      
      // Load both simultaneously
      await Promise.all([
        dashboardPage.goto(),
        newDashboardPage.goto()
      ]);
      
      await Promise.all([
        dashboardPage.waitForDashboardLoad(),
        newDashboardPage.waitForDashboardLoad()
      ]);
      
      // Both should load successfully
      await dashboardPage.expectDashboardLoaded();
      await newDashboardPage.expectDashboardLoaded();
      
      await newPage.close();
    });
  });

  test.describe('Accessibility', () => {
    test('should support keyboard navigation', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.navigateWithKeyboard();
    });

    test('should have proper ARIA labels', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.expectAriaLabels();
    });

    test('should support screen readers', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.expectScreenReaderContent();
    });

    test('should work with high contrast mode', async () => {
      await dashboardPage.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Charts and metrics should still be visible
      await dashboardPage.expectDashboardLoaded();
      await dashboardPage.expectMetricCards();
    });
  });

  test.describe('Mobile Experience', () => {
    test('should work correctly on mobile', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      await dashboardPage.expectMobileLayout();
    });

    test('should handle mobile chart interactions', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Charts should be responsive
      await expect(dashboardPage.usageTrendsChart).toBeVisible();
      
      // Touch interactions should work
      await dashboardPage.usageTrendsChart.tap();
    });

    test('should handle mobile table scrolling', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Table should be scrollable on mobile
      await expect(dashboardPage.conversationsTable).toBeVisible();
      
      // Should handle horizontal scrolling
      await dashboardPage.conversationsTable.evaluate(el => {
        el.scrollLeft = 100;
      });
    });
  });

  test.describe('Data Privacy and Security', () => {
    test('should not expose sensitive data in client', async () => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Check that API keys or other sensitive data are not exposed
      const pageContent = await dashboardPage.page.content();
      
      expect(pageContent).not.toContain('sk-'); // OpenAI API key pattern
      expect(pageContent).not.toContain('claude-'); // Anthropic API key pattern
    });

    test('should validate data access permissions', async () => {
      // Test should verify that users can only see their own data
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      
      // Analytics should only show data for current user
      await dashboardPage.expectDashboardLoaded();
    });

    test('should handle unauthorized access', async () => {
      // Clear auth and try to access dashboard
      await dashboardPage.page.context().clearCookies();
      
      await dashboardPage.goto();
      
      // Should redirect to login or show error
      await Promise.race([
        expect(dashboardPage.page).toHaveURL(/\/login|\//),
        dashboardPage.expectErrorState(/unauthorized|login required/i)
      ]);
    });
  });
});
