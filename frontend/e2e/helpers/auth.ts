import { Page } from '@playwright/test';
import { TEST_CONFIG } from '../config/test-config';

/**
 * Helper function to ensure user is logged in
 * With global setup, this should mostly just verify the auth state
 */
export async function login(page: Page) {
  // Navigate to the app if not already there
  if (!page.url().startsWith(TEST_CONFIG.BASE_URL)) {
    await page.goto(TEST_CONFIG.BASE_URL);
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
      await page.fill('input[type="email"]', TEST_CONFIG.TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_CONFIG.TEST_USER_PASSWORD);
      await page.click('button:has-text("Sign in")');

      // Wait for login with longer timeout
      await page.waitForSelector('textarea[placeholder*="Type your message"]', { timeout: 20000 });
    } else {
      throw new Error('Login form not found and not logged in');
    }
  }
}

/**
 * Helper function to login with admin credentials
 */
export async function loginAsAdmin(page: Page) {
  // Navigate to the app
  await page.goto(TEST_CONFIG.BASE_URL);
  await page.waitForLoadState('networkidle');

  // Check for login form
  const hasLoginForm = await page.locator('input[type="email"]')
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (hasLoginForm) {
    await page.fill('input[type="email"]', TEST_CONFIG.ADMIN_EMAIL);
    await page.fill('input[type="password"]', TEST_CONFIG.ADMIN_PASSWORD);
    await page.click('button:has-text("Sign in")');

    // Wait for login with longer timeout
    await page.waitForSelector('textarea[placeholder*="Type your message"]', { timeout: 20000 });
  } else {
    throw new Error('Login form not found');
  }
}

/**
 * Helper function to logout current user
 */
export async function logout(page: Page) {
  // Look for logout button or user menu
  const userMenu = page.locator('[data-testid="user-menu"], button[aria-label*="User"], button:has-text("Logout")');

  if (await userMenu.isVisible({ timeout: 2000 })) {
    await userMenu.click();

    // Look for logout option
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign out")');
    if (await logoutButton.isVisible({ timeout: 2000 })) {
      await logoutButton.click();
    }

    // Wait for redirect to login page
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
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