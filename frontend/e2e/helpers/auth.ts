import { Page } from '@playwright/test';

/**
 * Helper function to ensure user is logged in
 * With global setup, this should mostly just verify the auth state
 */
export async function login(page: Page) {
  // Navigate to the app if not already there
  const baseURL = 'http://localhost:4510';
  if (!page.url().startsWith(baseURL)) {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
  }

  // Wait a moment for the app to initialize
  await page.waitForTimeout(1000);

  // Check if chat interface is visible (should be if auth state is loaded)
  const isLoggedIn = await page.locator('textarea[placeholder*="Type your message"]')
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (!isLoggedIn) {
    // Auth state might not be loaded, try manual login
    console.warn('Auth state not loaded, attempting manual login...');

    // Check for login form
    const hasLoginForm = await page.locator('input[type="email"]')
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasLoginForm) {
      await page.fill('input[type="email"]', 'cthomasbrittain@yahoo.com');
      await page.fill('input[type="password"]', 'IVMPEscH33EhfnlPZcAwpkfR');
      await page.click('button:has-text("Sign in")');

      // Wait for login with longer timeout
      await page.waitForSelector('textarea[placeholder*="Type your message"]', { timeout: 20000 });
    } else {
      throw new Error('Login form not found and not logged in');
    }
  }
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