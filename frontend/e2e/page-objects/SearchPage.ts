import { Page, Locator, expect } from '@playwright/test';

export class SearchPage {
  readonly page: Page;

  // Search input elements
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly clearButton: Locator;
  readonly loadingSpinner: Locator;

  // Search dropdown
  readonly searchDropdown: Locator;
  readonly searchResults: Locator;
  readonly resultItems: Locator;
  readonly noResultsMessage: Locator;
  readonly errorMessage: Locator;
  readonly resultCount: Locator;

  // Search result items
  readonly resultTitles: Locator;
  readonly resultSnippets: Locator;
  readonly resultTimestamps: Locator;
  readonly resultConversationIds: Locator;

  // Quick search suggestions
  readonly searchSuggestions: Locator;
  readonly suggestionItems: Locator;
  readonly recentSearches: Locator;

  constructor(page: Page) {
    this.page = page;

    // Search input
    this.searchInput = page.getByRole('textbox', { name: /search/i });
    this.searchButton = page.getByRole('button', { name: /search/i });
    this.clearButton = page.getByRole('button', { name: /clear/i });
    this.loadingSpinner = page.locator('.animate-spin');

    // Dropdown
    this.searchDropdown = page.locator('[data-testid="search-dropdown"]').or(
      page.locator('.absolute.top-full')
    );
    this.searchResults = page.locator('[data-testid="search-results"]');
    this.resultItems = page.locator('[data-testid="search-result-item"]');
    this.noResultsMessage = page.getByText(/no results found/i);
    this.errorMessage = page.locator('.text-red-600');
    this.resultCount = page.locator('[data-testid="result-count"]');

    // Result content
    this.resultTitles = this.resultItems.locator('[data-testid="result-title"]');
    this.resultSnippets = this.resultItems.locator('[data-testid="result-snippet"]');
    this.resultTimestamps = this.resultItems.locator('[data-testid="result-timestamp"]');
    this.resultConversationIds = this.resultItems.locator('[data-testid="conversation-id"]');

    // Suggestions
    this.searchSuggestions = page.locator('[data-testid="search-suggestions"]');
    this.suggestionItems = page.locator('[data-testid="suggestion-item"]');
    this.recentSearches = page.locator('[data-testid="recent-searches"]');
  }

  async goto() {
    await this.page.goto('/search');
  }

  async search(query: string, options?: { pressEnter?: boolean; waitForResults?: boolean }) {
    await this.searchInput.fill(query);

    if (options?.pressEnter) {
      await this.searchInput.press('Enter');
    } else {
      await this.searchButton.click();
    }

    if (options?.waitForResults !== false) {
      await this.waitForSearchResults();
    }
  }

  async searchAndSelect(query: string, resultIndex: number = 0) {
    await this.search(query);
    await this.clickResult(resultIndex);
  }

  async clearSearch() {
    await this.clearButton.click();
    await expect(this.searchInput).toHaveValue('');
    await expect(this.searchDropdown).not.toBeVisible();
  }

  async waitForSearchResults(timeout: number = 10000) {
    // Wait for loading to complete
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout }).catch(() => {});
    
    // Wait for dropdown to appear
    await this.searchDropdown.waitFor({ state: 'visible', timeout });
    
    // Wait for either results or no results message
    await Promise.race([
      this.resultItems.first().waitFor({ state: 'visible', timeout }),
      this.noResultsMessage.waitFor({ state: 'visible', timeout }),
      this.errorMessage.waitFor({ state: 'visible', timeout })
    ]);
  }

  async clickResult(index: number) {
    const result = this.resultItems.nth(index);
    await result.click();
    
    // Wait for navigation
    await this.page.waitForLoadState('networkidle');
  }

  async clickSuggestion(suggestionText: string) {
    const suggestion = this.suggestionItems.filter({ hasText: suggestionText });
    await suggestion.click();
    await this.waitForSearchResults();
  }

  async expectSearchDropdown() {
    await expect(this.searchDropdown).toBeVisible();
  }

  async expectSearchResults(count?: number) {
    await expect(this.searchDropdown).toBeVisible();
    
    if (count !== undefined) {
      await expect(this.resultItems).toHaveCount(count);
    } else {
      await expect(this.resultItems.first()).toBeVisible();
    }
  }

  async expectNoResults() {
    await expect(this.searchDropdown).toBeVisible();
    await expect(this.noResultsMessage).toBeVisible();
    await expect(this.resultItems).toHaveCount(0);
  }

  async expectSearchError(message?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectResultCount(count: number) {
    await expect(this.resultCount).toContainText(count.toString());
  }

  async expectResultContent(index: number, options: {
    title?: string;
    snippet?: string;
    timestamp?: boolean;
  }) {
    const result = this.resultItems.nth(index);
    
    if (options.title) {
      const title = result.locator('[data-testid="result-title"]');
      await expect(title).toContainText(options.title);
    }
    
    if (options.snippet) {
      const snippet = result.locator('[data-testid="result-snippet"]');
      await expect(snippet).toContainText(options.snippet);
    }
    
    if (options.timestamp) {
      const timestamp = result.locator('[data-testid="result-timestamp"]');
      await expect(timestamp).toBeVisible();
    }
  }

  async expectHighlightedText(query: string) {
    const highlighted = this.resultItems.locator('mark, .highlight').first();
    await expect(highlighted).toContainText(query);
  }

  async expectSearchSuggestions() {
    await expect(this.searchSuggestions).toBeVisible();
    await expect(this.suggestionItems.first()).toBeVisible();
  }

  async expectRecentSearches() {
    await expect(this.recentSearches).toBeVisible();
  }

  // Advanced search functionality
  async searchWithFilters(options: {
    query: string;
    dateRange?: '7d' | '30d' | '90d';
    model?: string;
    conversationId?: string;
  }) {
    await this.searchInput.fill(options.query);
    
    // Apply filters if available
    if (options.dateRange) {
      const dateFilter = this.page.getByRole('combobox', { name: /date range/i });
      await dateFilter.selectOption(options.dateRange);
    }
    
    if (options.model) {
      const modelFilter = this.page.getByRole('combobox', { name: /model/i });
      await modelFilter.selectOption(options.model);
    }
    
    await this.searchButton.click();
    await this.waitForSearchResults();
  }

  // Keyboard navigation
  async navigateWithKeyboard() {
    await this.searchInput.focus();
    await expect(this.searchInput).toBeFocused();
    
    // Type search query
    await this.searchInput.type('test query');
    
    // Navigate to first result with arrow keys
    await this.page.keyboard.press('ArrowDown');
    
    if (await this.resultItems.first().isVisible()) {
      // First result should be highlighted/focused
      const firstResult = this.resultItems.first();
      await expect(firstResult).toHaveClass(/focused|highlighted|selected/);
    }
  }

  async selectResultWithKeyboard(index: number) {
    await this.searchInput.focus();
    
    // Navigate down to the desired result
    for (let i = 0; i <= index; i++) {
      await this.page.keyboard.press('ArrowDown');
    }
    
    // Select with Enter
    await this.page.keyboard.press('Enter');
    await this.page.waitForLoadState('networkidle');
  }

  // Accessibility checks
  async expectAriaLabels() {
    await expect(this.searchInput).toHaveAttribute('aria-label');
    await expect(this.searchDropdown).toHaveAttribute('role', 'listbox');
    await expect(this.resultItems.first()).toHaveAttribute('role', 'option');
  }

  async expectScreenReaderContent() {
    // Check for aria-live regions for search status
    const liveRegion = this.page.locator('[aria-live="polite"]');
    await expect(liveRegion).toBeAttached();
    
    // Check result count announcement
    await expect(this.resultCount).toHaveAttribute('aria-label');
  }

  // Error recovery
  async retryFailedSearch(query: string) {
    await this.expectSearchError();
    
    // Clear error and retry
    const retryButton = this.page.getByRole('button', { name: /retry|try again/i });
    if (await retryButton.isVisible()) {
      await retryButton.click();
    } else {
      await this.search(query);
    }
  }

  // Performance testing
  async measureSearchTime() {
    const startTime = Date.now();
    await this.search('test query');
    const endTime = Date.now();
    return endTime - startTime;
  }

  async expectFastSearch(maxTime: number = 3000) {
    const searchTime = await this.measureSearchTime();
    expect(searchTime).toBeLessThan(maxTime);
  }

  // Mobile responsiveness
  async expectMobileLayout() {
    const viewport = this.page.viewportSize();
    if (viewport && viewport.width < 768) {
      // Check that search input takes full width on mobile
      await expect(this.searchInput).toHaveCSS('width', /100%|auto/);
      
      // Check that dropdown is properly positioned
      await expect(this.searchDropdown).toHaveCSS('width', /100%|auto/);
    }
  }

  // Stress testing
  async performMultipleSearches(queries: string[]) {
    for (const query of queries) {
      await this.search(query);
      await this.page.waitForTimeout(1000); // Brief pause between searches
    }
  }

  async searchWithSpecialCharacters() {
    const specialQueries = [
      'test "quoted text"',
      'test & special * chars',
      'test emoji 🔍',
      'test unicode ñáéíóú',
    ];
    
    for (const query of specialQueries) {
      await this.search(query);
      // Should handle special characters gracefully
      await expect(this.searchDropdown).toBeVisible();
    }
  }
}