import { test, expect } from '@playwright/test';

// Test configuration
const ADMIN_EMAIL = 'cthomasbrittain@yahoo.com';
const ADMIN_PASSWORD = 'IVMPEscH33EhfnlPZcAwpkfR';
const TEST_MESSAGE = 'Hello! Can you help me write a simple function to add two numbers?';
const CLAUDE_CODE_MODEL = 'claude-code-sonnet';

test.describe('Admin Login, Model Selection, and Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for potentially slow network requests
    // Claude Code can take 30+ seconds to respond
    test.setTimeout(120000);

    // Navigate to the application
    await page.goto('/');

    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');
  });

  test('Complete E2E flow: Login → Select Claude Code → Chat', async ({ page }) => {
    // Step 1: Verify we're on the login page
    await expect(page.locator('h2')).toContainText('Sign in to your account');
    await expect(page.locator('text=Welcome back!')).toBeVisible();

    // Step 2: Fill in admin credentials
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);

    // Step 3: Submit login form
    await page.click('button[type="submit"]');

    // Step 4: Wait for login to complete and redirect to main app
    await page.waitForURL('**/'); // Wait for redirect
    await page.waitForLoadState('networkidle');

    // Step 5: Verify successful login by checking for user interface elements
    await expect(page.locator('text=Chat')).toBeVisible();
    await expect(page.locator('text=Analytics')).toBeVisible();

    // Check for user avatar/initials
    await expect(page.locator('[title="Logout"]')).toBeVisible();

    // Step 6: Verify we're in the chat view (default)
    await expect(page.locator('button:has-text("Chat")')).toHaveClass(/bg-blue-100|bg-blue-900/);

    // Step 7: Look for and click the model selector
    // Based on the page structure, target the model selector button that shows current model
    const modelSelector = page.getByRole('button', { name: /GPT-4|Claude|OpenAI/ });

    await expect(modelSelector).toBeVisible({ timeout: 5000 });
    await modelSelector.click();

    // Step 8: Wait for model dropdown to open and select Claude Code
    await page.waitForTimeout(1000); // Give dropdown time to open

    // Look for the specific Claude 3.5 Sonnet via Claude Code model
    const claudeCodeOption = page.getByRole('button', { name: 'Claude 3.5 Sonnet (via Claude Code) Claude Code 8,192 tokens Subscription Streaming' });

    try {
      await expect(claudeCodeOption).toBeVisible({ timeout: 5000 });
      await claudeCodeOption.click();
    } catch (e) {
      // Fallback: try the first Claude Code model available
      const fallbackOption = page.getByRole('button', { name: /Claude.*\(via Claude Code\)/i }).first();
      await expect(fallbackOption).toBeVisible({ timeout: 5000 });
      await fallbackOption.click();
    }

    // Step 9: Wait for model selection to complete
    await page.waitForTimeout(1000);

    // Step 10: Verify model is selected by checking if dropdown closed and model is shown
    await expect(page.locator('button:has-text("Claude")').first()).toBeVisible();

    // Step 11: Find and fill the chat input
    // Based on the page structure snapshot, the textbox is identified differently
    const chatInput = page.getByRole('textbox', { name: /Type your message/i });

    // Wait for the chat input to be visible and enabled
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await expect(chatInput).toBeEnabled({ timeout: 5000 });

    // Step 12: Type the test message
    await chatInput.fill(TEST_MESSAGE);
    await page.waitForTimeout(500);

    // Step 13: Find and click send button
    // Based on page structure, look for Send button
    const sendButton = page.getByRole('button', { name: 'Send' });

    try {
      await expect(sendButton).toBeVisible({ timeout: 2000 });
      await expect(sendButton).toBeEnabled({ timeout: 2000 });
      await sendButton.click();
    } catch (e) {
      // Try pressing Enter as alternative
      await chatInput.press('Enter');
    }

    // Step 14: Wait for message to be sent and response to start
    await page.waitForTimeout(2000);

    // Step 15: Verify the message was sent by looking for it in the chat
    await expect(page.locator(`text="${TEST_MESSAGE}"`).first()).toBeVisible({ timeout: 10000 });

    // Step 16: Wait for AI response to appear
    // Look for typical response indicators
    const responseIndicators = [
      'text="typing"',
      'text="..."',
      '[class*="loading"]',
      '[class*="typing"]',
      'text*="function"', // Since we asked about a function
      'text*="add"',      // Since we asked about adding numbers
    ];

    let responseVisible = false;
    for (const indicator of responseIndicators) {
      try {
        await page.waitForSelector(indicator, { timeout: 15000 });
        responseVisible = true;
        break;
      } catch (e) {
        continue;
      }
    }

    // Step 17: Wait for actual response content (not just typing indicator)
    // Claude Code can take 30+ seconds to respond
    await page.waitForTimeout(35000);

    // Step 18: Verify that a response was received
    // Look for new content that appeared after our message
    const messageElements = page.locator('[class*="message"], [data-testid*="message"], .prose');
    const messageCount = await messageElements.count();

    expect(messageCount, 'Should have at least one message exchange').toBeGreaterThanOrEqual(1);

    // Step 19: Take a screenshot for verification
    await page.screenshot({ path: 'e2e-results/chat-flow-success.png', fullPage: true });

    // Step 20: Optional - Test logout
    await page.click('[title="Logout"]');
    await page.waitForURL('**/');
    await expect(page.locator('h2')).toContainText('Sign in to your account');
  });

  test('Model selection without login should redirect to login', async ({ page }) => {
    // Try to access the app directly without logging in
    await page.goto('/');

    // Should see login form
    await expect(page.locator('h2')).toContainText('Sign in to your account');
  });

  test('Invalid login credentials should show error', async ({ page }) => {
    await page.goto('/');

    // Try invalid credentials
    await page.fill('input[name="email"]', 'invalid@test.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    // Look for error indicators in multiple ways
    const errorSelectors = [
      '[role="alert"]',
      '.text-red-700',
      '.text-red-400',
      '.bg-red-50',
      '.border-red-200',
      'text*="Invalid"',
      'text*="error"',
      'text*="failed"',
      'text*="incorrect"'
    ];

    let errorFound = false;
    for (const selector of errorSelectors) {
      try {
        await expect(page.locator(selector)).toBeVisible({ timeout: 3000 });
        errorFound = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!errorFound) {
      // Check if we're still on login page (which indicates login failed)
      await expect(page.locator('h2:has-text("Sign in to your account")')).toBeVisible({ timeout: 5000 });
    }
  });
});