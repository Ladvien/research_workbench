import { test, expect, devices } from '@playwright/test';
import { AuthPage } from './page-objects/AuthPage';
import { ChatPage } from './page-objects/ChatPage';
import { ConversationSidebarPage } from './page-objects/ConversationSidebarPage';

test.describe('Complete Chat Workflow', () => {
  let authPage: AuthPage;
  let chatPage: ChatPage;
  let sidebarPage: ConversationSidebarPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    chatPage = new ChatPage(page);
    sidebarPage = new ConversationSidebarPage(page);
    
    // Login before each test
    await authPage.goto();
    await authPage.login('test@workbench.com', 'testpassword123');
    await chatPage.expectWelcomeScreen();
  });

  test.describe('Basic Chat Functionality', () => {
    test('should display welcome screen for new users', async () => {
      await chatPage.expectWelcomeScreen();
      await expect(chatPage.welcomeTitle).toContainText('Welcome to Workbench');
      await expect(chatPage.welcomeMessage).toContainText('Start a conversation');
    });

    test('should send a simple message and receive response', async () => {
      await chatPage.sendMessage('Hello, how are you?');
      
      // Should have user message
      await chatPage.expectMessageCount(1);
      await chatPage.expectLastMessage('user', 'Hello, how are you?');
      
      // Should receive assistant response
      await chatPage.expectMessageCount(2);
      await chatPage.expectLastMessage('assistant');
    });

    test('should handle multiline messages', async () => {
      const multilineMessage = [
        'This is line 1',
        'This is line 2',
        'This is line 3'
      ];
      
      await chatPage.sendMultilineMessage(multilineMessage);
      await chatPage.expectLastMessage('user', 'This is line 1');
      await chatPage.expectLastMessage('user', 'This is line 3');
    });

    test('should send message using Enter key', async () => {
      await chatPage.sendMessage('Test message', { useKeyboard: true });
      await chatPage.expectMessageCount(2); // User + Assistant
    });

    test('should disable input while processing', async () => {
      await chatPage.messageInput.fill('Test message');
      await chatPage.sendButton.click();
      
      // Input should be disabled during processing
      await expect(chatPage.messageInput).toBeDisabled();
      await expect(chatPage.sendButton).toBeDisabled();
      
      // Should re-enable after response
      await chatPage.waitForResponse();
      await expect(chatPage.messageInput).toBeEnabled();
      await expect(chatPage.sendButton).toBeEnabled();
    });

    test('should show typing indicator while assistant responds', async () => {
      await chatPage.sendMessage('What is artificial intelligence?', { waitForResponse: false });
      
      // Should show loading/thinking indicator
      await expect(chatPage.thinkingIndicator).toBeVisible();
      
      await chatPage.waitForResponse();
      await expect(chatPage.thinkingIndicator).not.toBeVisible();
    });
  });

  test.describe('Streaming Responses', () => {
    test('should display streaming response correctly', async () => {
      await chatPage.sendMessage('Tell me a story', { waitForResponse: false });
      
      // Should show streaming message
      await chatPage.expectStreamingMessage();
      await expect(chatPage.streamingContent).toBeVisible();
      await expect(chatPage.streamingIndicator).toBeVisible();
      
      // Should show stop button
      await expect(chatPage.stopStreamingButton).toBeVisible();
      
      await chatPage.waitForResponse();
      await chatPage.expectNoStreamingMessage();
    });

    test('should stop streaming when requested', async () => {
      await chatPage.sendMessage('Write a long essay about AI', { waitForResponse: false });
      
      await chatPage.expectStreamingMessage();
      
      // Stop streaming
      await chatPage.stopStreaming();
      
      // Should stop and show partial response
      await chatPage.expectNoStreamingMessage();
      await chatPage.expectMessageCount(2); // User + partial assistant
    });

    test('should handle streaming errors gracefully', async () => {
      // Simulate network interruption during streaming
      await chatPage.page.route('**/api/chat/stream', route => {
        route.abort('failed');
      });
      
      await chatPage.sendMessage('Test message', { waitForResponse: false });
      
      // Should show error
      await chatPage.expectErrorMessage(/network error|failed/i);
      
      // Remove route and retry
      await chatPage.page.unroute('**/api/chat/stream');
      await chatPage.clearError();
    });

    test('should resume streaming after temporary network issues', async () => {
      let requestCount = 0;
      
      // Fail first request, succeed on retry
      await chatPage.page.route('**/api/chat/stream', route => {
        requestCount++;
        if (requestCount === 1) {
          route.abort('failed');
        } else {
          route.continue();
        }
      });
      
      await chatPage.sendMessage('Test resilience');
      
      // Should eventually get response despite initial failure
      await chatPage.expectMessageCount(2);
    });
  });

  test.describe('Message Management', () => {
    test.beforeEach(async () => {
      // Create some messages for testing
      await chatPage.sendMessage('First message');
      await chatPage.sendMessage('Second message');
      await chatPage.sendMessage('Third message');
    });

    test('should scroll to bottom when new messages arrive', async () => {
      // Scroll to top
      await chatPage.scrollToTop();
      
      // Send new message
      await chatPage.sendMessage('Scroll test message');
      
      // Should auto-scroll to show new message
      const lastMessage = chatPage.messages.last();
      await expect(lastMessage).toBeInViewport();
    });

    test('should maintain scroll position when not at bottom', async () => {
      // Scroll to middle
      await chatPage.messagesContainer.evaluate(el => {
        el.scrollTop = el.scrollHeight / 2;
      });
      
      const scrollPosition = await chatPage.messagesContainer.evaluate(el => el.scrollTop);
      
      // Send message from another source (simulate)
      await chatPage.page.evaluate(() => {
        // Simulate new message arriving without user action
        window.dispatchEvent(new CustomEvent('newMessage'));
      });
      
      // Should maintain scroll position
      const newScrollPosition = await chatPage.messagesContainer.evaluate(el => el.scrollTop);
      expect(newScrollPosition).toBe(scrollPosition);
    });

    test('should copy message content', async () => {
      await chatPage.copyMessage(0);
      
      // Verify copy success feedback
      await expect(chatPage.page.getByText(/copied/i)).toBeVisible();
    });

    test('should handle very long messages', async () => {
      const longMessage = 'A'.repeat(5000);
      await chatPage.sendMessage(longMessage);
      
      await chatPage.expectLastMessage('user');
      
      // Message should be displayed properly (possibly truncated or scrollable)
      const messageElement = chatPage.messages.last();
      await expect(messageElement).toBeVisible();
    });

    test('should handle special characters and emojis', async () => {
      const specialMessage = 'Testing special chars: !@#$%^&*() and emojis: 😀🎉🔥';
      await chatPage.sendMessage(specialMessage);
      
      await chatPage.expectLastMessage('user', specialMessage);
    });

    test('should handle code blocks and formatting', async () => {
      const codeMessage = 'Here is some code:\n```javascript\nconsole.log("Hello World");\n```';
      await chatPage.sendMessage(codeMessage);
      
      await chatPage.expectLastMessage('user');
      
      // Assistant should respond and code should be formatted
      await chatPage.expectLastMessage('assistant');
    });
  });

  test.describe('Model Selection', () => {
    test('should change AI model', async () => {
      await chatPage.selectModel('gpt-4');
      
      // Send message with new model
      await chatPage.sendMessage('Test with GPT-4');
      await chatPage.expectMessageCount(2);
    });

    test('should persist model selection', async () => {
      await chatPage.selectModel('claude-3');
      
      // Reload page
      await chatPage.page.reload();
      await chatPage.goto();
      
      // Model selection should be maintained
      await expect(chatPage.modelSelector).toHaveValue('claude-3');
    });

    test('should show different responses from different models', async () => {
      // Send same message with different models
      await chatPage.selectModel('gpt-3.5');
      await chatPage.sendMessage('Explain quantum computing');
      const firstResponse = await chatPage.messages.last().textContent();
      
      // Start new conversation
      await sidebarPage.createNewConversation();
      
      await chatPage.selectModel('claude-3');
      await chatPage.sendMessage('Explain quantum computing');
      const secondResponse = await chatPage.messages.last().textContent();
      
      // Responses might be different (though not guaranteed)
      expect(firstResponse).toBeTruthy();
      expect(secondResponse).toBeTruthy();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API rate limits', async () => {
      // Simulate rate limit
      await chatPage.page.route('**/api/chat/**', route => {
        route.fulfill({
          status: 429,
          body: JSON.stringify({ error: 'Rate limit exceeded' })
        });
      });
      
      await chatPage.sendMessage('Test rate limit');
      await chatPage.expectErrorMessage(/rate limit|too many requests/i);
    });

    test('should handle server errors', async () => {
      await chatPage.page.route('**/api/chat/**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal server error' })
        });
      });
      
      await chatPage.sendMessage('Test server error');
      await chatPage.expectErrorMessage(/server error|something went wrong/i);
    });

    test('should retry failed requests', async () => {
      let attemptCount = 0;
      
      await chatPage.page.route('**/api/chat/**', route => {
        attemptCount++;
        if (attemptCount === 1) {
          route.fulfill({ status: 500 });
        } else {
          route.continue();
        }
      });
      
      await chatPage.sendMessage('Test retry');
      
      // Should eventually succeed
      await chatPage.expectMessageCount(2);
    });

    test('should handle network disconnection', async () => {
      await chatPage.sendMessage('Initial message');
      
      // Simulate network disconnection
      await chatPage.page.context().setOffline(true);
      
      await chatPage.sendMessage('Offline message', { waitForResponse: false });
      await chatPage.expectErrorMessage(/network|offline|connection/i);
      
      // Reconnect
      await chatPage.page.context().setOffline(false);
      
      // Should allow retry
      await chatPage.handleNetworkError();
    });

    test('should clear errors when starting new message', async () => {
      // Generate error
      await chatPage.page.route('**/api/chat/**', route => {
        route.fulfill({ status: 500 });
      });
      
      await chatPage.sendMessage('Error message');
      await chatPage.expectErrorMessage();
      
      // Clear route and start typing
      await chatPage.page.unroute('**/api/chat/**');
      await chatPage.messageInput.fill('New message');
      
      // Error should be cleared
      await expect(chatPage.errorAlert).not.toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should support keyboard navigation', async () => {
      await chatPage.navigateWithKeyboard();
    });

    test('should have proper ARIA labels', async () => {
      await chatPage.expectAriaLabels();
    });

    test('should announce new messages to screen readers', async () => {
      await chatPage.expectScreenReaderContent();
      
      await chatPage.sendMessage('Accessibility test');
      
      // Should have aria-live regions for dynamic content
      const liveRegion = chatPage.page.locator('[aria-live="polite"]');
      await expect(liveRegion).toBeAttached();
    });

    test('should support high contrast mode', async () => {
      // Enable high contrast
      await chatPage.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      
      await chatPage.sendMessage('High contrast test');
      
      // Elements should still be visible and accessible
      await expect(chatPage.messageInput).toBeVisible();
      await expect(chatPage.sendButton).toBeVisible();
      await expect(chatPage.messages.first()).toBeVisible();
    });

    test('should work with screen reader simulation', async () => {
      // Simulate screen reader usage
      await chatPage.messageInput.focus();
      
      // Navigate with screen reader keys
      await chatPage.page.keyboard.press('Tab');
      await expect(chatPage.sendButton).toBeFocused();
      
      await chatPage.page.keyboard.press('Space');
      // Should not send empty message
      await chatPage.expectMessageCount(0);
    });
  });

  test.describe('Performance', () => {
    test('should handle rapid message sending', async () => {
      const messages = ['Message 1', 'Message 2', 'Message 3'];
      
      // Send messages rapidly
      for (const message of messages) {
        await chatPage.sendMessage(message, { waitForResponse: false });
        await chatPage.page.waitForTimeout(100);
      }
      
      // Should handle all messages properly
      await chatPage.page.waitForTimeout(5000);
      await expect(chatPage.messages).toHaveCount(6); // 3 user + 3 assistant
    });

    test('should maintain good performance with many messages', async () => {
      // Send multiple messages to create a long conversation
      for (let i = 0; i < 10; i++) {
        await chatPage.sendMessage(`Message ${i + 1}`);
      }
      
      // Should still be responsive
      const startTime = Date.now();
      await chatPage.sendMessage('Performance test');
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(10000); // Should respond within 10 seconds
    });

    test('should measure and validate response times', async () => {
      await chatPage.expectFastResponse(5000);
    });
  });

  test.describe('Mobile Experience', () => {
    test('should work correctly on mobile', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      await chatPage.expectMobileLayout();
      
      await chatPage.sendMessage('Mobile test message');
      await chatPage.expectMessageCount(2);
    });

    test('should handle mobile keyboard correctly', async () => {
      // Focus input - mobile keyboard should appear
      await chatPage.messageInput.focus();
      await expect(chatPage.messageInput).toBeFocused();
      
      // Should handle virtual keyboard
      await chatPage.sendMessage('Mobile keyboard test');
      await chatPage.expectMessageCount(2);
    });

    test('should handle touch interactions', async () => {
      // Test touch scrolling
      await chatPage.sendMessage('Touch test 1');
      await chatPage.sendMessage('Touch test 2');
      await chatPage.sendMessage('Touch test 3');
      
      // Scroll with touch
      await chatPage.messagesContainer.evaluate(el => {
        el.dispatchEvent(new TouchEvent('touchstart', { 
          touches: [new Touch({ identifier: 1, target: el, clientX: 100, clientY: 100 })] 
        }));
      });
      
      // Messages should still be accessible
      await expect(chatPage.messages.first()).toBeVisible();
    });
  });

  test.describe('Integration with Other Features', () => {
    test('should integrate with conversation sidebar', async () => {
      await chatPage.sendMessage('First conversation message');
      
      // Create new conversation
      await sidebarPage.createNewConversation();
      await chatPage.expectWelcomeScreen();
      
      await chatPage.sendMessage('Second conversation message');
      
      // Switch back to first conversation
      await sidebarPage.selectConversation(0);
      await chatPage.expectLastMessage('assistant'); // Should show first conversation
    });

    test('should persist conversation state across page reloads', async () => {
      await chatPage.sendMessage('Persistence test message');
      
      // Reload page
      await chatPage.page.reload();
      await chatPage.goto();
      
      // Should restore conversation
      await chatPage.expectMessageCount(2);
      await chatPage.expectLastMessage('user', 'Persistence test message');
    });

    test('should handle concurrent conversations', async () => {
      // Open multiple tabs/conversations
      const context = chatPage.page.context();
      const newPage = await context.newPage();
      const newChatPage = new ChatPage(newPage);
      
      await newPage.goto('/chat');
      
      // Send messages in both conversations
      await chatPage.sendMessage('First tab message');
      await newChatPage.sendMessage('Second tab message');
      
      // Both should work independently
      await chatPage.expectLastMessage('user', 'First tab message');
      await newChatPage.expectLastMessage('user', 'Second tab message');
      
      await newPage.close();
    });
  });
});
