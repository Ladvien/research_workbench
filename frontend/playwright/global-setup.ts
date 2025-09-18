import { chromium, FullConfig } from '@playwright/test';

// Test configuration that reads from environment variables
// All testing via workbench.lolzlab.com as per CLAUDE.md requirements
const TEST_CONFIG = {
  TEST_USER_EMAIL: process.env.TEST_USER_EMAIL || 'test@workbench.com',
  TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD || 'testpassword123',
  BASE_URL: process.env.BASE_URL || 'https://workbench.lolzlab.com',
};

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0];
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Navigate to the app using the configured base URL
    const url = baseURL || TEST_CONFIG.BASE_URL;
    console.log(`Global setup: navigating to ${url}`);
    await page.goto(url);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check if already logged in
    const isLoggedIn = await page.locator('textarea[placeholder*="Type your message"]')
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (!isLoggedIn) {
      // Look for login form
      const hasLoginForm = await page.locator('input[type="email"]')
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (hasLoginForm) {
        // Perform login with environment-configured credentials
        console.log(`Global setup: logging in as ${TEST_CONFIG.TEST_USER_EMAIL}`);
        await page.fill('input[type="email"]', TEST_CONFIG.TEST_USER_EMAIL);
        await page.fill('input[type="password"]', TEST_CONFIG.TEST_USER_PASSWORD);
        await page.click('button:has-text("Sign in")');

        // Wait for successful login
        await page.waitForSelector('textarea[placeholder*="Type your message"]', { timeout: 30000 });
        console.log('Global setup: login successful');
      } else {
        console.log('Global setup: no login form found, continuing...');
      }
    } else {
      console.log('Global setup: already logged in');
    }

    // Save authentication state
    await page.context().storageState({ path: 'playwright/.auth/user.json' });
    console.log('Global setup: authentication state saved');

  } catch (error) {
    console.error('Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;