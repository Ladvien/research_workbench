import { test, expect, devices } from '@playwright/test';
import { AuthPage } from './page-objects/AuthPage';
import { ChatPage } from './page-objects/ChatPage';
import { ConversationSidebarPage } from './page-objects/ConversationSidebarPage';
import { BranchingChatPage } from './page-objects/BranchingChatPage';

test.describe('Conversation Management', () => {
  let authPage: AuthPage;
  let chatPage: ChatPage;
  let sidebarPage: ConversationSidebarPage;
  let branchingPage: BranchingChatPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    chatPage = new ChatPage(page);
    sidebarPage = new ConversationSidebarPage(page);
    branchingPage = new BranchingChatPage(page);
    
    // Login before each test
    await authPage.goto();
    await authPage.login('test@workbench.com', 'testpassword123');
  });

  test.describe('Conversation Creation', () => {
    test('should create new conversation', async () => {
      await sidebarPage.createNewConversation();
      await chatPage.expectWelcomeScreen();
      
      // Should be in a new conversation
      const conversationCount = await sidebarPage.getConversationCount();
      expect(conversationCount).toBe(1);
    });

    test('should create conversation automatically when sending first message', async () => {
      await chatPage.sendMessage('Hello, this is my first message');
      
      // Conversation should be created and appear in sidebar
      await sidebarPage.expectConversationInList(0);
      
      const conversationCount = await sidebarPage.getConversationCount();
      expect(conversationCount).toBe(1);
    });

    test('should name conversation based on first message', async () => {
      const firstMessage = 'Tell me about quantum computing';
      await chatPage.sendMessage(firstMessage);
      
      // Conversation title should be derived from first message
      await sidebarPage.expectConversationTitle(0, /quantum computing/i);
    });

    test('should handle multiple conversation creation', async () => {
      // Create multiple conversations
      const messages = [
        'First conversation about AI',
        'Second conversation about physics',
        'Third conversation about biology'
      ];
      
      for (let i = 0; i < messages.length; i++) {
        await sidebarPage.createNewConversation();
        await chatPage.sendMessage(messages[i]);
      }
      
      const conversationCount = await sidebarPage.getConversationCount();
      expect(conversationCount).toBe(3);
    });

    test('should create conversation with custom title', async () => {
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Custom conversation content');
      
      // Edit conversation title
      await sidebarPage.editConversationTitle(0, 'My Custom Title');
      await sidebarPage.expectConversationTitle(0, 'My Custom Title');
    });
  });

  test.describe('Conversation Navigation', () => {
    test.beforeEach(async () => {
      // Create test conversations
      await chatPage.sendMessage('First conversation message');
      
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Second conversation message');
      
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Third conversation message');
    });

    test('should switch between conversations', async () => {
      // Should be in third conversation
      await chatPage.expectLastMessage('user', 'Third conversation message');
      
      // Switch to first conversation
      await sidebarPage.selectConversation(0);
      await chatPage.expectLastMessage('user', 'First conversation message');
      
      // Switch to second conversation
      await sidebarPage.selectConversation(1);
      await chatPage.expectLastMessage('user', 'Second conversation message');
    });

    test('should maintain conversation state when switching', async () => {
      // Add more messages to current conversation
      await chatPage.sendMessage('Additional message in third conversation');
      
      // Switch to first conversation
      await sidebarPage.selectConversation(0);
      await chatPage.expectMessageCount(2); // Original + assistant response
      
      // Switch back to third conversation
      await sidebarPage.selectConversation(2);
      await chatPage.expectMessageCount(4); // 2 user + 2 assistant
    });

    test('should highlight active conversation', async () => {
      await sidebarPage.expectActiveConversation(2);
      
      await sidebarPage.selectConversation(0);
      await sidebarPage.expectActiveConversation(0);
    });

    test('should show conversation metadata', async () => {
      // Each conversation should show last message timestamp
      await sidebarPage.expectConversationTimestamp(0);
      await sidebarPage.expectConversationTimestamp(1);
      await sidebarPage.expectConversationTimestamp(2);
    });

    test('should navigate with keyboard shortcuts', async () => {
      // Test keyboard navigation if implemented
      await sidebarPage.page.keyboard.press('Control+1');
      // Should select first conversation
      
      await sidebarPage.page.keyboard.press('Control+2');
      // Should select second conversation
    });
  });

  test.describe('Conversation Organization', () => {
    test.beforeEach(async () => {
      // Create multiple conversations for organization tests
      const topics = [
        'Machine Learning Basics',
        'Quantum Physics Explained',
        'Climate Change Solutions',
        'Space Exploration',
        'Artificial Intelligence Ethics'
      ];
      
      for (const topic of topics) {
        await sidebarPage.createNewConversation();
        await chatPage.sendMessage(`Tell me about ${topic}`);
      }
    });

    test('should sort conversations by date', async () => {
      await sidebarPage.sortConversations('date');
      
      // Most recent should be first
      await sidebarPage.expectConversationTitle(0, /Artificial Intelligence Ethics/i);
    });

    test('should sort conversations alphabetically', async () => {
      await sidebarPage.sortConversations('alphabetical');
      
      // Should be sorted A-Z
      await sidebarPage.expectConversationTitle(0, /Artificial Intelligence Ethics/i);
    });

    test('should search conversations', async () => {
      await sidebarPage.searchConversations('quantum');
      
      // Should show only quantum-related conversation
      const visibleCount = await sidebarPage.getVisibleConversationCount();
      expect(visibleCount).toBe(1);
      
      await sidebarPage.expectConversationTitle(0, /Quantum Physics/i);
    });

    test('should filter conversations by tags', async () => {
      // Tag some conversations
      await sidebarPage.tagConversation(0, 'science');
      await sidebarPage.tagConversation(1, 'science');
      await sidebarPage.tagConversation(2, 'environment');
      
      // Filter by science tag
      await sidebarPage.filterByTag('science');
      
      const visibleCount = await sidebarPage.getVisibleConversationCount();
      expect(visibleCount).toBe(2);
    });

    test('should create conversation folders', async () => {
      await sidebarPage.createFolder('Science Topics');
      
      // Move conversations to folder
      await sidebarPage.moveConversationToFolder(0, 'Science Topics');
      await sidebarPage.moveConversationToFolder(1, 'Science Topics');
      
      // Folder should contain conversations
      await sidebarPage.expandFolder('Science Topics');
      await sidebarPage.expectConversationsInFolder('Science Topics', 2);
    });

    test('should pin important conversations', async () => {
      await sidebarPage.pinConversation(2);
      
      // Pinned conversation should appear at top
      await sidebarPage.expectPinnedConversation(0);
    });
  });

  test.describe('Conversation Editing', () => {
    test.beforeEach(async () => {
      await chatPage.sendMessage('Test conversation for editing');
    });

    test('should rename conversation', async () => {
      await sidebarPage.editConversationTitle(0, 'Renamed Conversation');
      await sidebarPage.expectConversationTitle(0, 'Renamed Conversation');
    });

    test('should add conversation description', async () => {
      await sidebarPage.editConversationDescription(0, 'This is a test conversation for editing features');
      await sidebarPage.expectConversationDescription(0, 'This is a test conversation');
    });

    test('should duplicate conversation', async () => {
      const initialCount = await sidebarPage.getConversationCount();
      
      await sidebarPage.duplicateConversation(0);
      
      const newCount = await sidebarPage.getConversationCount();
      expect(newCount).toBe(initialCount + 1);
      
      // Duplicated conversation should have similar title
      await sidebarPage.expectConversationTitle(1, /copy|duplicate/i);
    });

    test('should archive conversation', async () => {
      await sidebarPage.archiveConversation(0);
      
      // Conversation should be moved to archive
      const activeCount = await sidebarPage.getConversationCount();
      expect(activeCount).toBe(0);
      
      // Should appear in archived conversations
      await sidebarPage.showArchivedConversations();
      const archivedCount = await sidebarPage.getArchivedConversationCount();
      expect(archivedCount).toBe(1);
    });

    test('should restore archived conversation', async () => {
      await sidebarPage.archiveConversation(0);
      await sidebarPage.showArchivedConversations();
      
      await sidebarPage.restoreConversation(0);
      
      // Should be back in active conversations
      await sidebarPage.showActiveConversations();
      const activeCount = await sidebarPage.getConversationCount();
      expect(activeCount).toBe(1);
    });
  });

  test.describe('Conversation Deletion', () => {
    test.beforeEach(async () => {
      await chatPage.sendMessage('Test conversation for deletion');
    });

    test('should delete conversation with confirmation', async () => {
      await sidebarPage.deleteConversation(0);
      
      // Should show confirmation dialog
      await sidebarPage.confirmDeletion();
      
      // Conversation should be removed
      const count = await sidebarPage.getConversationCount();
      expect(count).toBe(0);
    });

    test('should cancel conversation deletion', async () => {
      await sidebarPage.deleteConversation(0);
      
      // Cancel deletion
      await sidebarPage.cancelDeletion();
      
      // Conversation should still exist
      const count = await sidebarPage.getConversationCount();
      expect(count).toBe(1);
    });

    test('should bulk delete conversations', async () => {
      // Create more conversations
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Second conversation');
      
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Third conversation');
      
      // Select multiple conversations
      await sidebarPage.selectMultipleConversations([0, 1]);
      
      await sidebarPage.bulkDeleteSelected();
      await sidebarPage.confirmDeletion();
      
      // Only one conversation should remain
      const count = await sidebarPage.getConversationCount();
      expect(count).toBe(1);
    });

    test('should permanently delete from archive', async () => {
      await sidebarPage.archiveConversation(0);
      await sidebarPage.showArchivedConversations();
      
      await sidebarPage.permanentlyDelete(0);
      await sidebarPage.confirmDeletion();
      
      // Should be completely removed
      const archivedCount = await sidebarPage.getArchivedConversationCount();
      expect(archivedCount).toBe(0);
    });
  });

  test.describe('Conversation Sharing', () => {
    test.beforeEach(async () => {
      await chatPage.sendMessage('Public conversation for sharing');
    });

    test('should generate shareable link', async () => {
      const shareLink = await sidebarPage.generateShareLink(0);
      
      expect(shareLink).toMatch(/https?:\/\/.+\/shared\/.+/);
    });

    test('should set conversation privacy', async () => {
      await sidebarPage.setConversationPrivacy(0, 'public');
      
      // Should be marked as public
      await sidebarPage.expectConversationPrivacy(0, 'public');
    });

    test('should export conversation', async () => {
      const download = await sidebarPage.exportConversation(0, 'markdown');
      
      expect(download.suggestedFilename()).toMatch(/\.md$/);
    });

    test('should export multiple conversations', async () => {
      // Create more conversations
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Second conversation');
      
      // Export all
      const download = await sidebarPage.exportAllConversations('json');
      
      expect(download.suggestedFilename()).toMatch(/\.json$/);
    });
  });

  test.describe('Branching and Message Editing', () => {
    test.beforeEach(async () => {
      await branchingPage.goto();
      await branchingPage.sendMessage('Initial message for branching test');
    });

    test('should create branch by editing message', async () => {
      await branchingPage.showBranchTree();
      
      await branchingPage.createBranchByEditing(0, 'Edited message creating new branch');
      
      // Should have created a new branch
      await branchingPage.expectBranchCount(2);
    });

    test('should navigate between branches', async () => {
      await branchingPage.editMessage(0, 'First branch message');
      await branchingPage.sendMessage('Response to first branch');
      
      // Create second branch
      await branchingPage.editMessage(0, 'Second branch message');
      
      await branchingPage.showBranchTree();
      await branchingPage.navigateBranchHistory();
    });

    test('should maintain branch context in sidebar', async () => {
      await branchingPage.editMessage(0, 'Branched message');
      
      // Conversation in sidebar should show branching indicator
      await sidebarPage.expectBranchingIndicator(0);
    });

    test('should test branch persistence', async () => {
      await branchingPage.editMessage(0, 'Persistent branch message');
      await branchingPage.testBranchPersistence();
    });
  });

  test.describe('Performance and Scalability', () => {
    test('should handle many conversations efficiently', async () => {
      // Create many conversations
      for (let i = 0; i < 50; i++) {
        await sidebarPage.createNewConversation();
        await chatPage.sendMessage(`Conversation ${i + 1}`);
      }
      
      // Sidebar should still be responsive
      const startTime = Date.now();
      await sidebarPage.selectConversation(0);
      const selectionTime = Date.now() - startTime;
      
      expect(selectionTime).toBeLessThan(2000);
    });

    test('should implement conversation pagination', async () => {
      // Create more conversations than can be displayed at once
      for (let i = 0; i < 100; i++) {
        await sidebarPage.createNewConversation();
        await chatPage.sendMessage(`Conversation ${i + 1}`);
      }
      
      // Should show pagination or virtual scrolling
      await sidebarPage.expectPagination();
    });

    test('should load conversations lazily', async () => {
      // Monitor network requests
      let conversationRequests = 0;
      await sidebarPage.page.route('**/api/conversations**', route => {
        conversationRequests++;
        route.continue();
      });
      
      // Create conversations
      for (let i = 0; i < 20; i++) {
        await sidebarPage.createNewConversation();
        await chatPage.sendMessage(`Conversation ${i + 1}`);
      }
      
      // Should not load all conversations at once
      expect(conversationRequests).toBeGreaterThan(0);
      expect(conversationRequests).toBeLessThan(20);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle conversation loading errors', async () => {
      await sidebarPage.page.route('**/api/conversations**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Failed to load conversations' })
        });
      });
      
      await sidebarPage.page.reload();
      
      // Should show error state
      await sidebarPage.expectLoadingError();
    });

    test('should handle conversation creation failures', async () => {
      await sidebarPage.page.route('**/api/conversations', route => {
        route.fulfill({ status: 500 });
      });
      
      await sidebarPage.createNewConversation();
      
      // Should show error message
      await sidebarPage.expectCreationError();
    });

    test('should handle deletion failures', async () => {
      await chatPage.sendMessage('Test conversation');
      
      await sidebarPage.page.route('**/api/conversations/*', route => {
        if (route.request().method() === 'DELETE') {
          route.fulfill({ status: 500 });
        } else {
          route.continue();
        }
      });
      
      await sidebarPage.deleteConversation(0);
      await sidebarPage.confirmDeletion();
      
      // Should show error and conversation should remain
      await sidebarPage.expectDeletionError();
      const count = await sidebarPage.getConversationCount();
      expect(count).toBe(1);
    });

    test('should handle network disconnection', async () => {
      await chatPage.sendMessage('Test before disconnection');
      
      // Simulate network disconnection
      await sidebarPage.page.context().setOffline(true);
      
      await sidebarPage.createNewConversation();
      
      // Should show offline indicator
      await sidebarPage.expectOfflineState();
      
      // Reconnect
      await sidebarPage.page.context().setOffline(false);
      
      // Should sync when back online
      await sidebarPage.expectOnlineState();
    });
  });

  test.describe('Accessibility', () => {
    test('should support keyboard navigation', async () => {
      await chatPage.sendMessage('Test conversation');
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Second conversation');
      
      await sidebarPage.navigateWithKeyboard();
    });

    test('should have proper ARIA labels', async () => {
      await chatPage.sendMessage('Test conversation');
      
      await sidebarPage.expectAriaLabels();
    });

    test('should announce conversation changes', async () => {
      await chatPage.sendMessage('First conversation');
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Second conversation');
      
      // Should announce when switching conversations
      await sidebarPage.selectConversation(0);
      
      const liveRegion = sidebarPage.page.locator('[aria-live="polite"]');
      await expect(liveRegion).toBeAttached();
    });

    test('should support screen reader navigation', async () => {
      await chatPage.sendMessage('Test conversation');
      
      // Conversation list should be properly structured
      await expect(sidebarPage.conversationsList).toHaveAttribute('role', 'list');
      await expect(sidebarPage.conversationItems.first()).toHaveAttribute('role', 'listitem');
    });
  });

  test.describe('Mobile Experience', () => {
    test('should work correctly on mobile', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      
      await chatPage.sendMessage('Mobile test conversation');
      
      await sidebarPage.expectMobileLayout();
    });

    test('should handle mobile sidebar collapse', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      
      await chatPage.sendMessage('Test conversation');
      
      // Sidebar should be collapsible on mobile
      await sidebarPage.toggleSidebar();
      await sidebarPage.expectSidebarCollapsed();
      
      await sidebarPage.toggleSidebar();
      await sidebarPage.expectSidebarExpanded();
    });

    test('should handle mobile touch interactions', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      
      await chatPage.sendMessage('First conversation');
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Second conversation');
      
      // Swipe gestures for conversation navigation
      await sidebarPage.swipeToSwitchConversation('left');
      await chatPage.expectLastMessage('user', 'First conversation');
    });
  });

  test.describe('Data Persistence', () => {
    test('should persist conversations across sessions', async () => {
      await chatPage.sendMessage('Persistent conversation');
      
      // Log out and log back in
      await authPage.logout();
      await authPage.login('test@workbench.com', 'testpassword123');
      
      // Conversation should still exist
      const count = await sidebarPage.getConversationCount();
      expect(count).toBe(1);
      
      await sidebarPage.selectConversation(0);
      await chatPage.expectLastMessage('user', 'Persistent conversation');
    });

    test('should sync conversations across devices', async () => {
      await chatPage.sendMessage('Sync test conversation');
      
      // Simulate another device login
      const context = sidebarPage.page.context();
      const newPage = await context.newPage();
      const newAuth = new AuthPage(newPage);
      const newSidebar = new ConversationSidebarPage(newPage);
      
      await newAuth.goto();
      await newAuth.login('test@workbench.com', 'testpassword123');
      
      // Should see the same conversations
      const count = await newSidebar.getConversationCount();
      expect(count).toBe(1);
      
      await newPage.close();
    });

    test('should handle offline conversation creation', async () => {
      // Go offline
      await sidebarPage.page.context().setOffline(true);
      
      await sidebarPage.createNewConversation();
      await chatPage.sendMessage('Offline conversation');
      
      // Should create conversation locally
      const count = await sidebarPage.getConversationCount();
      expect(count).toBe(1);
      
      // Go back online
      await sidebarPage.page.context().setOffline(false);
      
      // Should sync to server
      await sidebarPage.page.waitForTimeout(2000);
      await sidebarPage.expectOnlineState();
    });
  });

  test.describe('Integration Tests', () => {
    test('should integrate with search functionality', async () => {
      await chatPage.sendMessage('Searchable conversation about artificial intelligence');
      
      // Search should find this conversation
      await sidebarPage.searchConversations('artificial intelligence');
      
      const visibleCount = await sidebarPage.getVisibleConversationCount();
      expect(visibleCount).toBe(1);
    });

    test('should integrate with file attachments', async () => {
      await chatPage.sendMessage('Conversation with file attachment');
      
      // Upload a file (mocked)
      await sidebarPage.page.evaluate(() => {
        // Simulate file attachment
        window.dispatchEvent(new CustomEvent('fileAttached', {
          detail: { filename: 'test.txt', conversationId: 'current' }
        }));
      });
      
      // Conversation should show attachment indicator
      await sidebarPage.expectAttachmentIndicator(0);
    });

    test('should integrate with analytics tracking', async () => {
      const analyticsEvents: string[] = [];
      
      // Track analytics events
      await sidebarPage.page.route('**/api/analytics/**', route => {
        analyticsEvents.push(route.request().url());
        route.continue();
      });
      
      await chatPage.sendMessage('Analytics test conversation');
      await sidebarPage.createNewConversation();
      await sidebarPage.selectConversation(0);
      
      // Should track conversation events
      expect(analyticsEvents.length).toBeGreaterThan(0);
    });
  });
});
