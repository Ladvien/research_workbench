import { Page } from '@playwright/test';

/**
 * Helper function to login before tests
 */
export async function login(page: Page) {
  // Navigate to the app
  await page.goto('http://workbench.lolzlab.com');

  // Wait for the login page to load
  await page.waitForLoadState('networkidle');

  // Check if already logged in
  const isLoggedIn = await page.locator('textarea[placeholder*="Type your message"]').isVisible({ timeout: 1000 }).catch(() => false);

  if (isLoggedIn) {
    return; // Already logged in
  }

  // Fill in login credentials
  await page.fill('input[type="email"]', 'cthomasbrittain@yahoo.com');
  await page.fill('input[type="password"]', 'IVMPEscH33EhfnlPZcAwpkfR');

  // Click sign in button
  await page.click('button:has-text("Sign in")');

  // Wait for navigation to complete and chat interface to appear
  // The app stays at the root URL after login
  await page.waitForTimeout(2000); // Give time for login to process
  await page.waitForSelector('textarea[placeholder*="Type your message"]', { timeout: 10000 });
}

/**
 * Helper to select a model if needed
 */
export async function selectModel(page: Page, modelName: string = 'gpt-4o-mini') {
  // Check if model selector is visible
  const modelSelector = page.locator('select, [role="combobox"]').first();

  if (await modelSelector.isVisible({ timeout: 1000 }).catch(() => false)) {
    await modelSelector.selectOption({ label: modelName });
  }
}