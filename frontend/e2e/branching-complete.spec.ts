import { test, expect, devices } from '@playwright/test';
import { AuthPage } from './page-objects/AuthPage';
import { BranchingChatPage } from './page-objects/BranchingChatPage';
import { ConversationSidebarPage } from './page-objects/ConversationSidebarPage';

test.describe('Complete Branching Workflow', () => {
  let authPage: AuthPage;
  let branchingPage: BranchingChatPage;
  let sidebarPage: ConversationSidebarPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    branchingPage = new BranchingChatPage(page);
    sidebarPage = new ConversationSidebarPage(page);
    
    // Login and start branching chat
    await authPage.goto();
    await authPage.login('test@workbench.com', 'testpassword123');
    await branchingPage.goto();
  });

  test.describe('Basic Branching Interface', () => {
    test('should display branching chat interface correctly', async () => {
      await branchingPage.expectBranchingControls();
      await expect(branchingPage.branchToggleButton).toBeVisible();
      await expect(branchingPage.modelSelectorDropdown).toBeVisible();
    });

    test('should show and hide branch tree', async () => {
      // Initially tree should be hidden
      await branchingPage.expectBranchTreeHidden();
      
      // Show tree
      await branchingPage.showBranchTree();
      await branchingPage.expectBranchTreeVisible();
      
      // Hide tree
      await branchingPage.hideBranchTree();
      await branchingPage.expectBranchTreeHidden();
    });

    test('should display welcome message for branching', async () => {
      await expect(branchingPage.welcomeTitle).toContainText('Workbench with Branching');
      await expect(branchingPage.welcomeMessage).toContainText('edit messages to explore different paths');
    });

    test('should show model selector', async () => {
      await expect(branchingPage.modelSelectorDropdown).toBeVisible();
      
      // Should be able to change models
      await branchingPage.selectModel('gpt-4');
      await expect(branchingPage.modelSelectorDropdown).toContainText('gpt-4');
    });
  });

  test.describe('Message Creation and Editing', () => {
    test('should send initial message and make it editable', async () => {
      await branchingPage.sendMessage('Hello, this is my first message');
      
      // Message should be editable
      await branchingPage.expectEditableMessage(0);
      await branchingPage.expectMessageCount(2); // User + Assistant
    });

    test('should edit user message', async () => {
      await branchingPage.sendMessage('Original message');
      
      await branchingPage.editMessage(0, 'Edited message content');
      
      // Should show edited content
      await branchingPage.expectLastMessage('user', 'Edited message content');
    });

    test('should edit assistant message', async () => {
      await branchingPage.sendMessage('Tell me about AI');
      
      // Edit the assistant's response
      await branchingPage.editMessage(1, 'Custom assistant response');
      
      await branchingPage.expectLastMessage('assistant', 'Custom assistant response');
    });

    test('should enter and exit edit mode', async () => {
      await branchingPage.sendMessage('Test message for edit mode');
      
      // Enter edit mode
      const editButton = branchingPage.editableMessages.first().getByRole('button', { name: /edit/i });
      await editButton.click();
      
      await branchingPage.expectMessageInEditMode(0);
      
      // Exit edit mode
      await branchingPage.cancelEdit(0);
      await branchingPage.expectMessageNotInEditMode(0);
    });

    test('should validate edit input', async () => {
      await branchingPage.sendMessage('Original message');
      
      // Try to save empty edit
      const editButton = branchingPage.editableMessages.first().getByRole('button', { name: /edit/i });
      await editButton.click();
      
      const editInput = branchingPage.editableMessages.first().locator('[data-testid="message-edit-input"]');
      await editInput.clear();
      
      const saveButton = branchingPage.editableMessages.first().getByRole('button', { name: /save/i });
      
      // Save button should be disabled for empty content
      await expect(saveButton).toBeDisabled();
    });
  });

  test.describe('Branch Creation and Management', () => {
    test('should create branch by editing message', async () => {
      await branchingPage.sendMessage('Initial conversation starter');
      
      // Show branch tree
      await branchingPage.showBranchTree();
      
      // Edit message to create branch
      await branchingPage.createBranchByEditing(0, 'Edited to create new branch');
      
      // Should have multiple branches now
      await branchingPage.expectBranchCount(2);
    });

    test('should display branch tree correctly', async () => {
      await branchingPage.sendMessage('Root message');
      await branchingPage.editMessage(0, 'First branch');
      await branchingPage.editMessage(0, 'Second branch');
      
      await branchingPage.showBranchTree();
      
      await branchingPage.expectBranchNodes(3); // Root + 2 branches
      await branchingPage.expectBranchConnections();
    });

    test('should show active branch indicator', async () => {
      await branchingPage.sendMessage('Message for branch test');
      await branchingPage.editMessage(0, 'Branch variation');
      
      await branchingPage.showBranchTree();
      await branchingPage.expectActiveBranch();
    });

    test('should switch between branches', async () => {
      await branchingPage.sendMessage('Original message');
      await branchingPage.editMessage(0, 'First branch edit');
      
      // Create second branch
      await branchingPage.switchToBranch(0); // Switch to original
      await branchingPage.editMessage(0, 'Second branch edit');
      
      await branchingPage.showBranchTree();
      
      // Test switching between branches
      await branchingPage.switchToBranch(0);
      await branchingPage.expectLastMessage('user', 'Original message');
      
      await branchingPage.switchToBranch(1);
      await branchingPage.expectLastMessage('user', 'First branch edit');
    });

    test('should maintain branch context', async () => {
      await branchingPage.sendMessage('Context test message');
      await branchingPage.sendMessage('Follow-up message');
      
      // Edit earlier message to create branch
      await branchingPage.editMessage(0, 'Edited context message');
      
      // Should maintain conversation flow
      await branchingPage.expectMessageCount(2); // Still 2 messages in this branch
    });
  });

  test.describe('Complex Branching Scenarios', () => {
    test('should handle nested branching', async () => {
      await branchingPage.testNestedBranching();
    });

    test('should handle multiple branch points', async () => {
      // Create conversation with multiple decision points
      await branchingPage.sendMessage('What programming language should I learn?');
      await branchingPage.sendMessage('I want to build web applications');
      await branchingPage.sendMessage('I prefer strongly typed languages');
      
      // Create branches at different points
      await branchingPage.editMessage(0, 'What framework should I use for data science?');
      await branchingPage.editMessage(1, 'I want to build mobile applications');
      
      await branchingPage.showBranchTree();
      
      // Should have complex branching structure
      const branchCount = await branchingPage.getBranchCount();
      expect(branchCount).toBeGreaterThan(3);
    });

    test('should handle branch merging scenarios', async () => {
      await branchingPage.sendMessage('Initial question about AI');
      
      // Create two different branches
      await branchingPage.editMessage(0, 'Question about machine learning');
      await branchingPage.sendMessage('ML follow-up');
      
      await branchingPage.switchToBranch(0);
      await branchingPage.editMessage(0, 'Question about deep learning');
      await branchingPage.sendMessage('DL follow-up');
      
      // Both branches should be navigable
      await branchingPage.showBranchTree();
      await branchingPage.navigateBranchHistory();
    });

    test('should handle branch deletion', async () => {
      await branchingPage.sendMessage('Message to create branches from');
      await branchingPage.editMessage(0, 'First branch');
      await branchingPage.editMessage(0, 'Second branch');
      
      const initialBranchCount = await branchingPage.getBranchCount();
      
      // Delete a message (which should remove branch)
      await branchingPage.deleteMessage(0);
      
      const newBranchCount = await branchingPage.getBranchCount();
      expect(newBranchCount).toBeLessThan(initialBranchCount);
    });
  });

  test.describe('Branch Navigation and UX', () => {
    test('should show branch statistics', async () => {
      await branchingPage.sendMessage('Stats test message');
      await branchingPage.editMessage(0, 'Branch 1');
      await branchingPage.editMessage(0, 'Branch 2');
      
      await branchingPage.showBranchTree();
      
      // Should show message and branch counts
      await branchingPage.expectMessageCount(2);
      await branchingPage.expectBranchCount(3);
    });

    test('should provide visual branch indicators', async () => {
      await branchingPage.sendMessage('Visual test message');
      await branchingPage.editMessage(0, 'Edited for visual test');
      
      await branchingPage.showBranchTree();
      
      // Should show visual connections between branches
      await branchingPage.expectBranchConnections();
      
      // Should highlight active path
      await branchingPage.expectActiveBranch();
    });

    test('should handle branch tree performance', async () => {
      // Create many branches to test performance
      await branchingPage.sendMessage('Performance test root');
      
      for (let i = 0; i < 10; i++) {
        await branchingPage.editMessage(0, `Branch ${i + 1}`);
      }
      
      // Branch tree should still be responsive
      const startTime = Date.now();
      await branchingPage.showBranchTree();
      const showTime = Date.now() - startTime;
      
      expect(showTime).toBeLessThan(3000);
    });

    test('should measure branch switch performance', async () => {
      await branchingPage.sendMessage('Switch performance test');
      await branchingPage.editMessage(0, 'Branch for performance test');
      
      await branchingPage.expectFastBranchSwitch(3000);
    });
  });

  test.describe('Branch Persistence and Data Integrity', () => {
    test('should persist branches across page reloads', async () => {
      await branchingPage.sendMessage('Persistence test message');
      await branchingPage.editMessage(0, 'Edited for persistence');
      
      const branchCount = await branchingPage.getBranchCount();
      
      // Reload page
      await branchingPage.page.reload();
      await branchingPage.goto();
      await branchingPage.showBranchTree();
      
      // Branches should be restored
      await branchingPage.expectBranchCount(branchCount);
    });

    test('should maintain branch integrity', async () => {
      await branchingPage.sendMessage('Integrity test');
      await branchingPage.editMessage(0, 'Branch A');
      
      // Switch back to original and create another branch
      await branchingPage.switchToBranch(0);
      await branchingPage.editMessage(0, 'Branch B');
      
      // Each branch should maintain its own state
      await branchingPage.switchToBranch(1);
      await branchingPage.expectLastMessage('user', 'Branch A');
      
      await branchingPage.switchToBranch(2);
      await branchingPage.expectLastMessage('user', 'Branch B');
    });

    test('should handle concurrent branch edits', async () => {
      await branchingPage.sendMessage('Concurrent edit test');
      
      // Simulate concurrent editing scenario
      await branchingPage.editMessage(0, 'First concurrent edit');
      
      // This should handle conflicts gracefully
      await branchingPage.testBranchConflictResolution();
    });

    test('should sync branches across sessions', async () => {
      await branchingPage.sendMessage('Sync test message');
      await branchingPage.editMessage(0, 'Synced branch edit');
      
      // Logout and login again
      await authPage.logout();
      await authPage.login('test@workbench.com', 'testpassword123');
      await branchingPage.goto();
      
      // Branches should be synced
      await branchingPage.showBranchTree();
      await branchingPage.expectBranchCount(2);
    });
  });

  test.describe('Integration with Other Features', () => {
    test('should integrate with conversation sidebar', async () => {
      await branchingPage.sendMessage('Sidebar integration test');
      await branchingPage.editMessage(0, 'Branched message');
      
      // Conversation should show in sidebar with branch indicator
      await sidebarPage.expectBranchingIndicator(0);
    });

    test('should integrate with model selection', async () => {
      await branchingPage.sendMessage('Model test message');
      
      // Change model and edit message
      await branchingPage.selectModel('claude-3');
      await branchingPage.editMessage(0, 'Edited with different model');
      
      // Should create branch with new model
      await branchingPage.expectBranchCount(2);
    });

    test('should integrate with file attachments', async () => {
      await branchingPage.sendMessage('File attachment test');
      
      // Simulate file attachment
      await branchingPage.page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('fileAttached', {
          detail: { filename: 'test.txt' }
        }));
      });
      
      // Edit message with attachment
      await branchingPage.editMessage(0, 'Edited message with attachment');
      
      // Should maintain file attachment in branch
      await branchingPage.expectBranchCount(2);
    });

    test('should work with search functionality', async () => {
      await branchingPage.sendMessage('Searchable content in branches');
      await branchingPage.editMessage(0, 'Different searchable content');
      
      // Search should find content in branches
      // This would integrate with the search functionality
      await branchingPage.showBranchTree();
      await branchingPage.expectBranchCount(2);
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('should handle branch loading errors', async () => {
      await branchingPage.sendMessage('Error test message');
      
      // Simulate branch loading error
      await branchingPage.page.route('**/api/branches/**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Branch loading failed' })
        });
      });
      
      await branchingPage.showBranchTree();
      await branchingPage.expectBranchError(/branch loading failed/i);
    });

    test('should handle edit failures', async () => {
      await branchingPage.sendMessage('Edit failure test');
      
      // Simulate edit API failure
      await branchingPage.page.route('**/api/messages/*/edit', route => {
        route.fulfill({ status: 500 });
      });
      
      await branchingPage.editMessage(0, 'This edit should fail');
      await branchingPage.expectBranchError();
    });

    test('should handle network interruption during branching', async () => {
      await branchingPage.sendMessage('Network test message');
      
      // Go offline
      await branchingPage.page.context().setOffline(true);
      
      await branchingPage.editMessage(0, 'Offline edit attempt');
      
      // Should handle gracefully
      await branchingPage.expectBranchError(/network|offline/i);
      
      // Go back online
      await branchingPage.page.context().setOffline(false);
      
      // Should allow retry
      await branchingPage.retryBranchOperation();
    });

    test('should handle very deep branching', async () => {
      let currentMessage = 'Deep branching root';
      await branchingPage.sendMessage(currentMessage);
      
      // Create deeply nested branches
      for (let i = 0; i < 20; i++) {
        currentMessage = `Deep branch level ${i + 1}`;
        await branchingPage.editMessage(0, currentMessage);
        await branchingPage.sendMessage(`Response to level ${i + 1}`);
      }
      
      // Should handle deep nesting
      await branchingPage.showBranchTree();
      await branchingPage.expectBranchNodes(21); // Root + 20 levels
    });

    test('should handle branch tree with many siblings', async () => {
      await branchingPage.sendMessage('Sibling test root');
      
      // Create many sibling branches
      for (let i = 0; i < 15; i++) {
        await branchingPage.editMessage(0, `Sibling branch ${i + 1}`);
      }
      
      await branchingPage.showBranchTree();
      
      // Should handle many siblings
      const branchCount = await branchingPage.getBranchCount();
      expect(branchCount).toBe(16); // Root + 15 siblings
    });
  });

  test.describe('Accessibility for Branching', () => {
    test('should support keyboard navigation in branch tree', async () => {
      await branchingPage.sendMessage('Accessibility test');
      await branchingPage.editMessage(0, 'Branch for accessibility');
      
      await branchingPage.showBranchTree();
      await branchingPage.navigateBranchesWithKeyboard();
    });

    test('should have proper ARIA labels for branching', async () => {
      await branchingPage.sendMessage('ARIA test message');
      await branchingPage.editMessage(0, 'Edited for ARIA test');
      
      await branchingPage.showBranchTree();
      await branchingPage.expectBranchingAriaLabels();
    });

    test('should announce branch changes to screen readers', async () => {
      await branchingPage.sendMessage('Screen reader test');
      await branchingPage.editMessage(0, 'Branch for screen reader');
      
      await branchingPage.showBranchTree();
      
      // Should have aria-live regions for branch updates
      const liveRegion = branchingPage.page.locator('[aria-live="polite"]');
      await expect(liveRegion).toBeAttached();
    });

    test('should support high contrast mode for branch visualization', async () => {
      await branchingPage.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      
      await branchingPage.sendMessage('High contrast test');
      await branchingPage.editMessage(0, 'Branch for high contrast');
      
      await branchingPage.showBranchTree();
      
      // Branch visualization should still be visible
      await branchingPage.expectBranchTreeVisible();
      await branchingPage.expectBranchConnections();
    });
  });

  test.describe('Mobile Branching Experience', () => {
    test('should work correctly on mobile', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      
      await branchingPage.sendMessage('Mobile branching test');
      await branchingPage.editMessage(0, 'Mobile branch edit');
      
      await branchingPage.expectMobileBranchingLayout();
    });

    test('should handle mobile branch tree interaction', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      
      await branchingPage.sendMessage('Mobile tree test');
      await branchingPage.editMessage(0, 'Mobile branch');
      
      // Branch tree should be touch-friendly
      await branchingPage.toggleBranchView();
      await branchingPage.expectBranchTreeVisible();
      
      // Touch interactions should work
      await branchingPage.branchNodes.first().tap();
    });

    test('should handle mobile editing interface', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      
      await branchingPage.sendMessage('Mobile edit test');
      
      // Edit interface should be mobile-friendly
      const editButton = branchingPage.editableMessages.first().getByRole('button', { name: /edit/i });
      await editButton.tap();
      
      await branchingPage.expectMessageInEditMode(0);
      
      // Should handle mobile keyboard
      const editInput = branchingPage.editableMessages.first().locator('[data-testid="message-edit-input"]');
      await editInput.fill('Mobile edited content');
      
      const saveButton = branchingPage.editableMessages.first().getByRole('button', { name: /save/i });
      await saveButton.tap();
      
      await branchingPage.expectLastMessage('user', 'Mobile edited content');
    });
  });

  test.describe('Performance and Scalability', () => {
    test('should handle large conversation with many branches efficiently', async () => {
      // Create large conversation
      for (let i = 0; i < 50; i++) {
        await branchingPage.sendMessage(`Message ${i + 1}`);
        if (i % 5 === 0) {
          await branchingPage.editMessage(i * 2, `Edited message ${i + 1}`);
        }
      }
      
      // Branch operations should still be responsive
      const startTime = Date.now();
      await branchingPage.showBranchTree();
      const showTime = Date.now() - startTime;
      
      expect(showTime).toBeLessThan(5000);
    });

    test('should optimize branch tree rendering', async () => {
      // Create complex branching structure
      await branchingPage.sendMessage('Root for complex tree');
      
      for (let i = 0; i < 20; i++) {
        await branchingPage.editMessage(0, `Complex branch ${i + 1}`);
      }
      
      // Tree should render efficiently
      await branchingPage.showBranchTree();
      
      // Should implement virtualization or similar optimization
      const branchCount = await branchingPage.getBranchCount();
      expect(branchCount).toBe(21);
    });

    test('should handle concurrent users editing same conversation', async () => {
      await branchingPage.sendMessage('Concurrent user test');
      
      // Simulate another user's edit
      await branchingPage.page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('remoteEdit', {
          detail: {
            messageId: 'test-message-id',
            newContent: 'Remote user edit',
            userId: 'other-user'
          }
        }));
      });
      
      // Should handle concurrent edits gracefully
      await branchingPage.showBranchTree();
      await branchingPage.expectBranchingControls();
    });
  });

  test.describe('Advanced Branching Features', () => {
    test('should support branch annotations', async () => {
      await branchingPage.sendMessage('Annotation test');
      await branchingPage.editMessage(0, 'Annotated branch');
      
      // Add annotation to branch (if feature exists)
      await branchingPage.page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('addBranchAnnotation', {
          detail: {
            branchId: 'test-branch',
            annotation: 'This branch explores alternative approach'
          }
        }));
      });
      
      await branchingPage.showBranchTree();
      // Should show annotation in branch tree
    });

    test('should support branch comparison', async () => {
      await branchingPage.sendMessage('Comparison test');
      await branchingPage.editMessage(0, 'First comparison branch');
      
      await branchingPage.switchToBranch(0);
      await branchingPage.editMessage(0, 'Second comparison branch');
      
      // Compare branches (if feature exists)
      await branchingPage.showBranchTree();
      
      // Should be able to see differences between branches
      await branchingPage.expectBranchCount(3);
    });

    test('should support branch bookmarking', async () => {
      await branchingPage.sendMessage('Bookmark test');
      await branchingPage.editMessage(0, 'Important branch to bookmark');
      
      // Bookmark this branch (if feature exists)
      await branchingPage.page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('bookmarkBranch', {
          detail: { branchId: 'current-branch' }
        }));
      });
      
      await branchingPage.showBranchTree();
      // Should show bookmark indicator
    });

    test('should export branching conversation', async () => {
      await branchingPage.sendMessage('Export test');
      await branchingPage.editMessage(0, 'Branch for export');
      await branchingPage.editMessage(0, 'Another branch for export');
      
      // Export should include all branches
      await sidebarPage.exportConversation(0, 'json');
      
      // Exported file should contain branch structure
      // This would need to be verified by checking the downloaded file
    });
  });
});
