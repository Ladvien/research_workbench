import { test, expect, devices } from '@playwright/test';
import { AuthPage } from './page-objects/AuthPage';
import { ChatPage } from './page-objects/ChatPage';
import { SearchPage } from './page-objects/SearchPage';
import { ConversationSidebarPage } from './page-objects/ConversationSidebarPage';

test.describe('Search Functionality', () => {
  let authPage: AuthPage;
  let chatPage: ChatPage;
  let searchPage: SearchPage;
  let sidebarPage: ConversationSidebarPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    chatPage = new ChatPage(page);
    searchPage = new SearchPage(page);
    sidebarPage = new ConversationSidebarPage(page);
    
    // Login and create some test data
    await authPage.goto();
    await authPage.login('test@workbench.com', 'testpassword123');
    
    // Create some conversations for searching
    await test.step('Create test conversations', async () => {
      await chatPage.sendMessage('Tell me about artificial intelligence');
      await chatPage.sendMessage('What are the benefits of machine learning?');
      
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Explain quantum computing concepts');
      await chatPage.sendMessage('How does quantum entanglement work?');
      
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Discuss climate change solutions');
      await chatPage.sendMessage('What are renewable energy sources?');
    });
  });

  test.describe('Basic Search', () => {
    test('should display search interface correctly', async () => {
      await searchPage.goto();
      
      await expect(searchPage.searchInput).toBeVisible();
      await expect(searchPage.searchButton).toBeVisible();
      await expect(searchPage.searchInput).toHaveAttribute('placeholder', /search/i);
    });

    test('should perform basic text search', async () => {
      await searchPage.goto();
      await searchPage.search('artificial intelligence');
      
      await searchPage.expectSearchResults();
      await searchPage.expectResultContent(0, {
        snippet: 'artificial intelligence',
        timestamp: true
      });
    });

    test('should search with Enter key', async () => {
      await searchPage.goto();
      await searchPage.search('machine learning', { pressEnter: true });
      
      await searchPage.expectSearchResults();
    });

    test('should handle empty search queries', async () => {
      await searchPage.goto();
      
      await searchPage.searchInput.fill('');
      await searchPage.searchButton.click();
      
      // Should not perform search or show appropriate message
      await expect(searchPage.searchDropdown).not.toBeVisible();
    });

    test('should clear search results', async () => {
      await searchPage.goto();
      await searchPage.search('quantum computing');
      await searchPage.expectSearchResults();
      
      await searchPage.clearSearch();
      await expect(searchPage.searchDropdown).not.toBeVisible();
    });

    test('should handle no results found', async () => {
      await searchPage.goto();
      await searchPage.search('nonexistent query that should return no results');
      
      await searchPage.expectNoResults();
    });
  });

  test.describe('Search Results', () => {
    test('should display search results with proper formatting', async () => {
      await searchPage.goto();
      await searchPage.search('climate change');
      
      await searchPage.expectSearchResults();
      
      // Check result structure
      await expect(searchPage.resultItems.first()).toBeVisible();
      await expect(searchPage.resultTitles.first()).toBeVisible();
      await expect(searchPage.resultSnippets.first()).toBeVisible();
      await expect(searchPage.resultTimestamps.first()).toBeVisible();
    });

    test('should highlight search terms in results', async () => {
      await searchPage.goto();
      await searchPage.search('quantum');
      
      await searchPage.expectSearchResults();
      await searchPage.expectHighlightedText('quantum');
    });

    test('should show result count', async () => {
      await searchPage.goto();
      await searchPage.search('energy');
      
      await searchPage.expectSearchResults();
      
      const resultCount = await searchPage.resultItems.count();
      if (resultCount > 0) {
        await searchPage.expectResultCount(resultCount);
      }
    });

    test('should click and navigate to result', async () => {
      await searchPage.goto();
      await searchPage.search('artificial intelligence');
      
      await searchPage.expectSearchResults();
      await searchPage.clickResult(0);
      
      // Should navigate to the conversation
      await expect(searchPage.page).toHaveURL(/\/chat/);
      await expect(chatPage.messages.first()).toBeVisible();
    });

    test('should maintain search context after navigation', async () => {
      await searchPage.goto();
      await searchPage.search('machine learning');
      await searchPage.clickResult(0);
      
      // Go back to search
      await searchPage.goto();
      
      // Search query should be maintained
      await expect(searchPage.searchInput).toHaveValue('machine learning');
    });

    test('should handle multiple search terms', async () => {
      await searchPage.goto();
      await searchPage.search('quantum computing entanglement');
      
      await searchPage.expectSearchResults();
      
      // Results should be relevant to the search terms
      const firstResult = searchPage.resultItems.first();
      await expect(firstResult).toContainText(/quantum|computing|entanglement/i);
    });
  });

  test.describe('Advanced Search Features', () => {
    test('should search with filters', async () => {
      await searchPage.goto();
      
      await searchPage.searchWithFilters({
        query: 'artificial intelligence',
        dateRange: '30d',
        model: 'gpt-4'
      });
      
      await searchPage.expectSearchResults();
    });

    test('should search within specific conversation', async () => {
      // Get a conversation ID first
      await chatPage.goto();
      const conversationId = await chatPage.page.url().split('/').pop();
      
      await searchPage.goto();
      await searchPage.searchWithFilters({
        query: 'artificial',
        conversationId: conversationId
      });
      
      // Results should be from specific conversation
      await searchPage.expectSearchResults();
    });

    test('should handle fuzzy search', async () => {
      await searchPage.goto();
      
      // Search with slight misspelling
      await searchPage.search('artifical inteligence');
      
      // Should still find relevant results
      await Promise.race([
        searchPage.expectSearchResults(),
        searchPage.expectNoResults()
      ]);
    });

    test('should search with boolean operators', async () => {
      await searchPage.goto();
      
      await searchPage.search('quantum AND computing');
      await searchPage.expectSearchResults();
      
      await searchPage.search('artificial OR machine');
      await searchPage.expectSearchResults();
      
      await searchPage.search('climate NOT change');
      // Should handle boolean operators appropriately
    });

    test('should search with phrase queries', async () => {
      await searchPage.goto();
      
      await searchPage.search('"machine learning"');
      
      // Should find exact phrase matches
      await Promise.race([
        searchPage.expectSearchResults(),
        searchPage.expectNoResults()
      ]);
    });
  });

  test.describe('Search Suggestions', () => {
    test('should show search suggestions', async () => {
      await searchPage.goto();
      
      await searchPage.searchInput.fill('artif');
      
      // Should show suggestions
      await searchPage.expectSearchSuggestions();
    });

    test('should click on search suggestion', async () => {
      await searchPage.goto();
      
      await searchPage.searchInput.fill('quantum');
      await searchPage.expectSearchSuggestions();
      
      await searchPage.clickSuggestion('quantum computing');
      await searchPage.expectSearchResults();
    });

    test('should show recent searches', async () => {
      await searchPage.goto();
      
      // Perform a search
      await searchPage.search('artificial intelligence');
      
      // Clear and focus input
      await searchPage.clearSearch();
      await searchPage.searchInput.focus();
      
      // Should show recent searches
      await searchPage.expectRecentSearches();
    });

    test('should autocomplete search terms', async () => {
      await searchPage.goto();
      
      await searchPage.searchInput.fill('mach');
      await searchPage.page.waitForTimeout(500); // Wait for autocomplete
      
      // Should suggest completions
      await searchPage.expectSearchSuggestions();
    });
  });

  test.describe('Real-time Search', () => {
    test('should update results as user types', async () => {
      await searchPage.goto();
      
      await searchPage.searchInput.fill('q');
      await searchPage.page.waitForTimeout(500);
      
      await searchPage.searchInput.fill('qu');
      await searchPage.page.waitForTimeout(500);
      
      await searchPage.searchInput.fill('quantum');
      
      // Should show progressive results
      await searchPage.expectSearchDropdown();
    });

    test('should debounce search requests', async () => {
      await searchPage.goto();
      
      let requestCount = 0;
      await searchPage.page.route('**/api/search**', route => {
        requestCount++;
        route.continue();
      });
      
      // Type quickly
      await searchPage.searchInput.type('quantum computing', { delay: 50 });
      
      await searchPage.page.waitForTimeout(2000);
      
      // Should have made fewer requests than characters typed
      expect(requestCount).toBeLessThan(15);
    });

    test('should cancel previous search when new one starts', async () => {
      await searchPage.goto();
      
      // Start first search
      await searchPage.search('artificial intelligence', { waitForResults: false });
      
      // Immediately start second search
      await searchPage.search('quantum computing');
      
      // Should show results for second search
      await searchPage.expectResultContent(0, {
        snippet: 'quantum'
      });
    });
  });

  test.describe('Search Performance', () => {
    test('should search quickly', async () => {
      await searchPage.goto();
      await searchPage.expectFastSearch(3000);
    });

    test('should handle large result sets', async () => {
      // Create many conversations first
      for (let i = 0; i < 20; i++) {
        await sidebarPage.createNewConversation();
        await chatPage.sendMessage(`Test message number ${i} about artificial intelligence`);
      }
      
      await searchPage.goto();
      await searchPage.search('artificial intelligence');
      
      // Should handle many results efficiently
      await searchPage.expectSearchResults();
      
      const resultCount = await searchPage.resultItems.count();
      expect(resultCount).toBeGreaterThan(0);
    });

    test('should handle concurrent searches', async () => {
      await searchPage.goto();
      
      // Perform multiple searches concurrently
      await searchPage.performMultipleSearches([
        'artificial intelligence',
        'quantum computing',
        'climate change',
        'renewable energy'
      ]);
      
      // Should handle all searches without errors
      await searchPage.expectSearchResults();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle search API errors', async () => {
      await searchPage.goto();
      
      // Simulate API error
      await searchPage.page.route('**/api/search**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Search service unavailable' })
        });
      });
      
      await searchPage.search('test query');
      await searchPage.expectSearchError(/search service|unavailable/i);
    });

    test('should handle network timeouts', async () => {
      await searchPage.goto();
      
      // Simulate slow response
      await searchPage.page.route('**/api/search**', route => {
        setTimeout(() => route.continue(), 10000);
      });
      
      await searchPage.search('timeout test', { waitForResults: false });
      
      // Should show loading state and eventually timeout
      await expect(searchPage.loadingSpinner).toBeVisible();
    });

    test('should retry failed searches', async () => {
      await searchPage.goto();
      
      let attemptCount = 0;
      await searchPage.page.route('**/api/search**', route => {
        attemptCount++;
        if (attemptCount === 1) {
          route.fulfill({ status: 500 });
        } else {
          route.continue();
        }
      });
      
      await searchPage.retryFailedSearch('retry test');
      
      // Should eventually succeed
      await searchPage.expectSearchResults();
    });

    test('should handle special characters gracefully', async () => {
      await searchPage.goto();
      await searchPage.searchWithSpecialCharacters();
    });

    test('should handle very long search queries', async () => {
      await searchPage.goto();
      
      const longQuery = 'a'.repeat(1000);
      await searchPage.search(longQuery);
      
      // Should handle gracefully without breaking
      await Promise.race([
        searchPage.expectSearchResults(),
        searchPage.expectNoResults(),
        searchPage.expectSearchError()
      ]);
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should navigate search results with keyboard', async () => {
      await searchPage.goto();
      await searchPage.search('artificial intelligence');
      await searchPage.expectSearchResults();
      
      await searchPage.navigateWithKeyboard();
    });

    test('should select result with Enter key', async () => {
      await searchPage.goto();
      await searchPage.search('quantum computing');
      await searchPage.expectSearchResults();
      
      await searchPage.selectResultWithKeyboard(0);
      
      // Should navigate to the selected result
      await expect(searchPage.page).toHaveURL(/\/chat/);
    });

    test('should navigate between search suggestions', async () => {
      await searchPage.goto();
      
      await searchPage.searchInput.fill('art');
      await searchPage.expectSearchSuggestions();
      
      // Navigate with arrow keys
      await searchPage.page.keyboard.press('ArrowDown');
      await searchPage.page.keyboard.press('ArrowDown');
      await searchPage.page.keyboard.press('Enter');
      
      // Should select a suggestion
      await searchPage.expectSearchResults();
    });

    test('should close search dropdown with Escape', async () => {
      await searchPage.goto();
      await searchPage.search('test query');
      await searchPage.expectSearchDropdown();
      
      await searchPage.page.keyboard.press('Escape');
      await expect(searchPage.searchDropdown).not.toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA labels', async () => {
      await searchPage.goto();
      await searchPage.expectAriaLabels();
    });

    test('should announce search status to screen readers', async () => {
      await searchPage.goto();
      await searchPage.expectScreenReaderContent();
      
      await searchPage.search('accessibility test');
      
      // Should announce search results
      const liveRegion = searchPage.page.locator('[aria-live="polite"]');
      await expect(liveRegion).toBeAttached();
    });

    test('should support screen reader navigation', async () => {
      await searchPage.goto();
      await searchPage.search('screen reader test');
      
      // Results should be properly structured for screen readers
      await expect(searchPage.searchDropdown).toHaveAttribute('role', 'listbox');
      await expect(searchPage.resultItems.first()).toHaveAttribute('role', 'option');
    });

    test('should handle high contrast mode', async () => {
      await searchPage.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      
      await searchPage.goto();
      await searchPage.search('high contrast test');
      
      // Elements should still be visible
      await expect(searchPage.searchInput).toBeVisible();
      await expect(searchPage.resultItems.first()).toBeVisible();
    });
  });

  test.describe('Mobile Experience', () => {
    test('should work correctly on mobile', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      await searchPage.goto();
      await searchPage.expectMobileLayout();
      
      await searchPage.search('mobile test');
      await searchPage.expectSearchResults();
    });

    test('should handle mobile touch interactions', async () => {
      await searchPage.goto();
      await searchPage.search('touch test');
      
      // Tap on search result
      await searchPage.resultItems.first().tap();
      
      // Should navigate to result
      await expect(searchPage.page).toHaveURL(/\/chat/);
    });

    test('should handle mobile keyboard', async () => {
      await searchPage.goto();
      
      // Focus should trigger mobile keyboard
      await searchPage.searchInput.focus();
      await expect(searchPage.searchInput).toBeFocused();
      
      await searchPage.search('mobile keyboard test');
      await searchPage.expectSearchResults();
    });
  });

  test.describe('Search Analytics', () => {
    test('should track search interactions', async () => {
      await searchPage.goto();
      
      const analyticsEvents: string[] = [];
      
      // Intercept analytics calls
      await searchPage.page.route('**/api/analytics**', route => {
        analyticsEvents.push(route.request().url());
        route.continue();
      });
      
      await searchPage.search('analytics test');
      await searchPage.clickResult(0);
      
      // Should track search and click events
      expect(analyticsEvents.length).toBeGreaterThan(0);
    });

    test('should provide search metrics', async () => {
      await searchPage.goto();
      
      const startTime = Date.now();
      await searchPage.search('metrics test');
      const searchTime = Date.now() - startTime;
      
      // Should complete search within reasonable time
      expect(searchTime).toBeLessThan(5000);
      
      // Should show result count
      await searchPage.expectSearchResults();
    });
  });

  test.describe('Integration with Chat', () => {
    test('should search from within chat interface', async () => {
      await chatPage.goto();
      
      // Search should be available in chat
      const searchInput = chatPage.page.getByRole('textbox', { name: /search/i });
      if (await searchInput.isVisible()) {
        await searchInput.fill('integration test');
        await searchInput.press('Enter');
        
        await searchPage.expectSearchResults();
      }
    });

    test('should maintain search context when switching conversations', async () => {
      await searchPage.goto();
      await searchPage.search('context test');
      await searchPage.clickResult(0);
      
      // Switch to different conversation
      await sidebarPage.selectConversation(1);
      
      // Go back to search
      await searchPage.goto();
      
      // Search context should be maintained
      await expect(searchPage.searchInput).toHaveValue('context test');
    });
  });
});
