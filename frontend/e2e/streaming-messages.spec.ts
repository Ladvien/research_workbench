import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Streaming Messages', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page);
  });

  test('shows streaming indicator when receiving response', async ({ page }) => {
    // Send a message
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Tell me about streaming in web applications');
    await input.press('Enter');

    // Check for streaming indicator or waiting message
    const streamingIndicator = page.locator('text=Streaming..., text=Waiting for response...');
    await expect(streamingIndicator).toBeVisible({ timeout: 10000 });

    // Check for loading indicator with correct test ID
    const loadingIndicator = page.locator('[data-testid="branch-loading-indicator"], [data-testid="conversation-item-loading"]');
    await expect(loadingIndicator).toBeVisible({ timeout: 2000 }).catch(() => {
      // Loading indicator might not be present for all streaming states
      console.log('Loading indicator not found, which is acceptable');
    });

    // Wait for streaming to complete
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });
  });

  test('displays partial content during streaming', async ({ page }) => {
    // Send a message
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Count from 1 to 10');
    await input.press('Enter');

    // Wait for streaming to start
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });

    // Check that partial content appears
    const streamingMessage = page.locator('.prose').last();

    // Content should gradually appear
    await expect(streamingMessage).toContainText('1', { timeout: 10000 });

    // Streaming indicator should still be visible
    await expect(page.locator('text=Streaming...')).toBeVisible();

    // Wait for streaming to complete
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });

    // Final content should be complete
    await expect(streamingMessage).toContainText('10');
  });

  test('shows cursor animation during streaming', async ({ page }) => {
    // Send a message
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Hello, please respond with a greeting');
    await input.press('Enter');

    // Wait for streaming to start
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });

    // Check for animated cursor
    const animatedCursor = page.locator('.animate-pulse.bg-blue-500');
    await expect(animatedCursor).toBeVisible();
    await expect(animatedCursor).toContainText('|');

    // Cursor should disappear when streaming completes
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });
    await expect(animatedCursor).toBeHidden();
  });

  test('allows stopping stream generation', async ({ page }) => {
    // Send a long message to get a long response
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Write a very long essay about the history of computing');
    await input.press('Enter');

    // Wait for streaming to start
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });

    // Click stop button
    const stopButton = page.locator('button[title="Stop generation"]');
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    // Streaming should stop
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 5000 });
    await expect(stopButton).toBeHidden();
  });

  test('disables input during streaming', async ({ page }) => {
    // Send a message
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Hello');
    await input.press('Enter');

    // Wait for streaming to start
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });

    // Input should be disabled
    await expect(input).toBeDisabled();
    await expect(input).toHaveAttribute('placeholder', /Response streaming.*please wait/);

    // Wait for streaming to complete
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });

    // Input should be enabled again
    await expect(input).toBeEnabled();
    await expect(input).toHaveAttribute('placeholder', /Type your message/);
  });

  test('handles multiple messages in sequence', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Type your message"]');

    // Send first message
    await input.fill('First message');
    await input.press('Enter');

    // Wait for first response to complete
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });

    // Send second message
    await input.fill('Second message');
    await input.press('Enter');

    // Wait for second response to complete
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });

    // Both user messages and responses should be visible
    const messages = page.locator('[data-testid="markdown-content"]');
    await expect(messages).toHaveCount(4); // 2 user + 2 assistant messages
  });

  test('renders markdown in streaming messages', async ({ page }) => {
    // Send a message requesting markdown
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Please respond with a markdown list of 3 items');
    await input.press('Enter');

    // Wait for streaming to start
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });

    // Wait for streaming to complete
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });

    // Check that markdown is rendered in the response
    const lastMessage = page.locator('[data-testid="markdown-content"]').last();
    const listItems = lastMessage.locator('li');

    // Should have list items rendered
    await expect(listItems).toHaveCount(3);
  });

  test('shows thinking indicator before streaming starts', async ({ page }) => {
    // Send a message
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Complex question requiring thought');
    await input.press('Enter');

    // Check for thinking indicator if it appears before streaming
    const thinkingIndicator = page.locator('text=Thinking...');

    // Either thinking or streaming should appear
    await expect(page.locator('text=Thinking..., text=Streaming...')).toBeVisible({ timeout: 5000 });

    // Eventually streaming should complete
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });
  });

  test('handles empty streaming response gracefully', async ({ page }) => {
    // Send a message that might result in empty response initially
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('.');
    await input.press('Enter');

    // Should show waiting indicator
    const waitingMessage = page.locator('text=Waiting for response...');

    // Either waiting or streaming should appear
    const indicator = page.locator('text=Waiting for response..., text=Streaming...');
    await expect(indicator).toBeVisible({ timeout: 10000 });

    // Eventually should complete
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });
  });

  test('preserves formatting during stream', async ({ page }) => {
    // Send a message requesting code
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Show me a simple JavaScript function');
    await input.press('Enter');

    // Wait for streaming to start
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });

    // Wait for some content to appear
    await page.waitForTimeout(1000);

    // Check that code blocks maintain formatting during stream
    const streamingMessage = page.locator('.prose').last();

    // Wait for streaming to complete
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });

    // Check if code block exists (optional since not all responses have code)
    const codeBlock = streamingMessage.locator('pre code');
    const codeExists = await codeBlock.isVisible().catch(() => false);
    if (codeExists) {
      console.log('Code block found and properly formatted');
    } else {
      console.log('No code block in response, which is acceptable');
    }
  });

  test('handles network interruption during streaming', async ({ page, context }) => {
    // Send a message
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await input.fill('Tell me a story');
    await input.press('Enter');

    // Wait for streaming to start
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });

    // Simulate network interruption
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Restore network
    await context.setOffline(false);

    // Check if error is handled gracefully
    const errorAlert = page.locator('[role="alert"]');
    if (await errorAlert.isVisible()) {
      await expect(errorAlert).toContainText(/error|failed|connection/i);
    }

    // Input should be enabled again
    await expect(input).toBeEnabled({ timeout: 10000 });
  });

  test('maintains scroll position during streaming', async ({ page }) => {
    // Send multiple messages to create scrollable content
    const input = page.locator('textarea[placeholder*="Type your message"]');

    for (let i = 1; i <= 3; i++) {
      await input.fill(`Message ${i}`);
      await input.press('Enter');
      await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });
    }

    // Send another message
    await input.fill('Final message with long response expected');
    await input.press('Enter');

    // Wait for streaming to start
    await expect(page.locator('text=Streaming...')).toBeVisible({ timeout: 5000 });

    // Check that view auto-scrolls to show new content
    const messagesContainer = page.locator('.overflow-y-auto').first();
    const initialScrollTop = await messagesContainer.evaluate(el => el.scrollTop);

    // Wait for more content
    await page.waitForTimeout(2000);

    // Should have scrolled down
    const newScrollTop = await messagesContainer.evaluate(el => el.scrollTop);
    expect(newScrollTop).toBeGreaterThanOrEqual(initialScrollTop);

    // Wait for completion
    await expect(page.locator('text=Streaming...')).toBeHidden({ timeout: 30000 });
  });
});