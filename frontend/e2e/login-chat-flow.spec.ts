import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

// Test configuration
const ADMIN_EMAIL = 'cthomasbrittain@yahoo.com';
const ADMIN_PASSWORD = 'IVMPEscH33EhfnlPZcAwpkfR';
const TEST_MESSAGE = 'What is 2 + 2? Please respond with just the number.';
const CLAUDE_CODE_MODEL = 'claude-code-sonnet';

test.describe('Admin Login, Model Selection, and Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for Claude Code integration
    // Claude Code CLI can take 60-90 seconds to execute and respond
    test.setTimeout(180000);

    // Navigate to the application
    await page.goto('/');

    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');
  });

  test('Complete E2E flow: Login → Select Claude Code → Chat', async ({ page }) => {
    // Ensure user is logged in using global auth state
    await login(page);

    // Step 1: Verify we're on the chat page with the expected UI elements
    await expect(page.locator('h2')).toContainText('Conversations');
    await page.waitForTimeout(2000); // Allow UI to settle

    // Step 2: Verify successful login by checking for chat interface elements
    await expect(page.locator('textarea[placeholder*="Type your message"]')).toBeVisible();

    // Check for model selector (indicates we're in the chat interface)
    await expect(page.locator('button:has-text("Claude"), select')).toBeVisible();

    // Check for workbench title (it might be split across elements)
    await expect(page.locator('text=Workbench')).toBeVisible();

    // Step 3: Look for and click the model selector
    // Target the model selector dropdown button (look for Claude model button)
    const modelSelector = page.locator('button:has-text("Claude"), select').first();

    const modelSelectorExists = await modelSelector.isVisible({ timeout: 5000 }).catch(() => false);
    if (modelSelectorExists) {
      console.log('Found model selector, clicking...');
      await modelSelector.click();
    } else {
      console.log('No model selector found, continuing with existing model...');
    }

    // Step 5: Wait for model dropdown to open and select Claude Code
    await page.waitForTimeout(1000); // Give dropdown time to open

    // Look specifically for Claude Code Sonnet model - try multiple possible text patterns
    console.log('Looking for Claude Code model option...');

    let claudeCodeSelected = false;
    const possibleSelectors = [
      'Claude 3.5 Sonnet (via Claude Code)',
      /Claude.*Sonnet.*via Claude Code/i,
      /Claude.*Claude Code/i,
      'claude-code-sonnet'
    ];

    for (const selector of possibleSelectors) {
      try {
        const option = typeof selector === 'string'
          ? page.getByText(selector).first()
          : page.getByRole('button', { name: selector }).first();

        if (await option.isVisible({ timeout: 2000 })) {
          console.log(`Found Claude Code option with selector: ${selector}`);
          await option.click();
          claudeCodeSelected = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!claudeCodeSelected) {
      throw new Error('Could not find Claude Code model option in dropdown');
    }

    // Step 6: Wait for model selection to complete and verify
    await page.waitForTimeout(1000);
    console.log('Claude Code model selected, verifying...');

    // Verify model is selected by checking if dropdown closed and Claude Code is shown
    await expect(page.locator('button:has-text("Claude")').first()).toBeVisible({ timeout: 5000 });

    // Step 7: Find and fill the chat input
    // Based on the page structure snapshot, the textbox is identified differently
    const chatInput = page.getByRole('textbox', { name: /Type your message/i });

    // Wait for the chat input to be visible and enabled
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await expect(chatInput).toBeEnabled({ timeout: 5000 });

    // Step 7: Type the test message
    console.log(`Typing test message: "${TEST_MESSAGE}"`);
    await chatInput.fill(TEST_MESSAGE);
    await page.waitForTimeout(500);

    // Step 7: Set up network monitoring for streaming endpoint
    console.log('Setting up network monitoring for streaming endpoint...');
    const streamingResponse = page.waitForResponse(response => {
      const isStreamEndpoint = response.url().includes('/api/v1/conversations/') &&
                               response.url().includes('/stream');
      const isSuccess = response.status() === 200;

      if (isStreamEndpoint) {
        console.log(`Stream endpoint called: ${response.url()} - Status: ${response.status()}`);
      }

      return isStreamEndpoint && isSuccess;
    }, { timeout: 90000 });

    // Step 7: Find and click send button
    const sendButton = page.getByRole('button', { name: 'Send' });

    try {
      await expect(sendButton).toBeVisible({ timeout: 2000 });
      await expect(sendButton).toBeEnabled({ timeout: 2000 });
      console.log('Clicking Send button...');
      await sendButton.click();
    } catch (e) {
      console.log('Send button not found, trying Enter key...');
      await chatInput.press('Enter');
    }

    // Step 7: Verify the message was sent
    console.log('Verifying user message appears in chat...');
    await expect(page.locator(`text="${TEST_MESSAGE}"`).first()).toBeVisible({ timeout: 10000 });

    // Step 7: Wait for streaming endpoint to be called
    console.log('Waiting for streaming API call...');
    try {
      await streamingResponse;
      console.log('Streaming endpoint successfully called');
    } catch (e) {
      console.error('Streaming endpoint not called or failed:', e);
      throw new Error('Backend streaming endpoint was not called successfully');
    }

    // Step 7: Wait for Claude Code response with intelligent content validation
    console.log('Waiting for Claude Code AI response...');

    // Use waitForFunction to check for intelligent response content
    await page.waitForFunction(() => {
      // First check for streaming content specifically
      const streamingContent = document.querySelector('[data-testid="streaming-content"]');
      if (streamingContent) {
        const text = (streamingContent.textContent || '').toLowerCase();
        if (text.includes('4') && text.length > 0 && !text.includes('waiting for response')) {
          console.log('Found response in streaming content:', text.substring(0, 100));
          return true;
        }
      }

      // Also check for regular messages (after streaming completes)
      const messageElements = document.querySelectorAll('[class*="message"], [data-testid*="message"], .prose, [role="article"]');
      for (const el of messageElements) {
        const text = (el.textContent || '').toLowerCase();
        // Look for response containing "4" (answer to 2+2)
        if (text.includes('4') && text.length > 0 && !text.includes('2 + 2')) {
          console.log('Found response containing "4":', text.substring(0, 100));
          return true;
        }
      }
      return false;
    }, { timeout: 90000 }); // Claude Code can take 60+ seconds

    // Step 7: Verify response quality and content
    console.log('Verifying response quality...');

    // Check for streaming content or regular message content
    let responseText = '';
    const streamingContent = page.locator('[data-testid="streaming-content"]');
    if (await streamingContent.isVisible({ timeout: 1000 }).catch(() => false)) {
      responseText = await streamingContent.textContent() || '';
    } else {
      const messageElements = page.locator('[class*="message"], [data-testid*="message"], .prose, [role="article"]');
      responseText = await messageElements.last().textContent() || '';
    }

    console.log('AI Response received:', responseText?.substring(0, 200));

    // Verify the response contains the correct answer
    expect(responseText, 'Response should contain the answer "4"').toMatch(/4|four/i);

    // For Claude Code, the response may be just "4" which is acceptable
    expect(responseText?.length || 0, 'Response should have content').toBeGreaterThan(0);

    // Verify this is not an error message or the user's question
    expect(responseText.toLowerCase()).not.toContain('error');
    expect(responseText).not.toContain('2 + 2');

    // Step 7: Take a screenshot for verification
    await page.screenshot({ path: 'e2e-results/chat-flow-success.png', fullPage: true });

    // Step 8: Test successful completion
    console.log('E2E test completed successfully!');
  });

  test('App loads correctly with authentication', async ({ page }) => {
    // With global auth, we should see the chat interface
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should see chat interface (not login form)
    await expect(page.locator('textarea[placeholder*="Type your message"]')).toBeVisible({ timeout: 10000 });
  });

  test('Chat interface basic functionality', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify chat interface is functional
    const input = page.locator('textarea[placeholder*="Type your message"]');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();

    // Verify we can type in the input
    await input.fill('Hello');
    await expect(input).toHaveValue('Hello');
  });
});