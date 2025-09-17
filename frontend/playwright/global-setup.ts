import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const { baseURL, use } = config.projects[0];
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Navigate to the app
    await page.goto(baseURL || 'https://workbench.lolzlab.com');

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
        // Perform login
        await page.fill('input[type="email"]', 'cthomasbrittain@yahoo.com');
        await page.fill('input[type="password"]', 'IVMPEscH33EhfnlPZcAwpkfR');
        await page.click('button:has-text("Sign in")');

        // Wait for successful login
        await page.waitForSelector('textarea[placeholder*="Type your message"]', { timeout: 30000 });
      }
    }

    // Save authentication state
    await page.context().storageState({ path: 'playwright/.auth/user.json' });

  } catch (error) {
    console.error('Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;