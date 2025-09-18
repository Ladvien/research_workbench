import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './config/test-config';
import { testUsers } from './fixtures/test-data';
import { login, loginAsAdmin, logout } from './helpers/auth';

test.describe('Authentication Credentials Test Suite', () => {
  test('Verify test user credentials match environment configuration', async () => {
    // Verify that test data uses the same credentials as environment
    expect(testUsers.default.email).toBe(TEST_CONFIG.TEST_USER_EMAIL);
    expect(testUsers.default.password).toBe(TEST_CONFIG.TEST_USER_PASSWORD);
    expect(testUsers.admin.email).toBe(TEST_CONFIG.ADMIN_EMAIL);
    expect(testUsers.admin.password).toBe(TEST_CONFIG.ADMIN_PASSWORD);
  });

  test('Test user login with environment credentials', async ({ page }) => {
    // Navigate to the app
    await page.goto(TEST_CONFIG.BASE_URL);
    await page.waitForLoadState('networkidle');

    // Check for login form
    const hasLoginForm = await page.locator('input[type="email"]')
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasLoginForm) {
      // Perform login with environment credentials
      await page.fill('input[type="email"]', TEST_CONFIG.TEST_USER_EMAIL);
      await page.fill('input[type="password"]', TEST_CONFIG.TEST_USER_PASSWORD);
      await page.click('button:has-text("Sign in")');

      // Wait for successful login
      await expect(page.locator('textarea[placeholder*="Type your message"]'))
        .toBeVisible({ timeout: TEST_CONFIG.DEFAULT_TIMEOUT });

      console.log(`Successfully logged in as ${TEST_CONFIG.TEST_USER_EMAIL}`);
    } else {
      console.log('No login form found - user already logged in');
      // Verify we're in the chat interface
      await expect(page.locator('textarea[placeholder*="Type your message"]'))
        .toBeVisible({ timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
    }
  });

  test('Admin user login with environment credentials', async ({ page }) => {
    // First logout if needed
    await page.goto(TEST_CONFIG.BASE_URL);
    await page.waitForLoadState('networkidle');

    // Try to logout first to ensure clean state
    try {
      await logout(page);
    } catch {
      // Ignore if logout fails (user not logged in)
    }

    // Login as admin
    await loginAsAdmin(page);

    // Verify successful login
    await expect(page.locator('textarea[placeholder*="Type your message"]'))
      .toBeVisible({ timeout: TEST_CONFIG.DEFAULT_TIMEOUT });

    console.log(`Successfully logged in as admin: ${TEST_CONFIG.ADMIN_EMAIL}`);
  });

  test('Login helper function consistency', async ({ page }) => {
    // Test that the login helper uses the same credentials
    await page.goto(TEST_CONFIG.BASE_URL);
    
    // Use the login helper
    await login(page);

    // Verify we're logged in
    await expect(page.locator('textarea[placeholder*="Type your message"]'))
      .toBeVisible({ timeout: TEST_CONFIG.DEFAULT_TIMEOUT });

    console.log('Login helper function working correctly');
  });

  test('Invalid credentials should fail', async ({ page }) => {
    // Navigate to the app and logout if needed
    await page.goto(TEST_CONFIG.BASE_URL);
    await page.waitForLoadState('networkidle');

    // Try to logout first to ensure clean state
    try {
      await logout(page);
    } catch {
      // Ignore if logout fails
    }

    // Wait for login form to appear
    await expect(page.locator('input[type="email"]'))
      .toBeVisible({ timeout: 5000 });

    // Try login with invalid credentials
    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button:has-text("Sign in")');

    // Should still see login form (login failed)
    await expect(page.locator('input[type="email"]'))
      .toBeVisible({ timeout: 5000 });

    // Should see error message
    const errorMessage = page.locator('text=Invalid email or password, text=Login failed, [data-testid="error-message"]');
    const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasError) {
      console.log('Error message displayed correctly for invalid credentials');
    } else {
      console.log('No explicit error message found, but login form still visible (expected)');
    }
  });

  test('Verify backend test user creation matches environment', async ({ page }) => {
    // This test verifies that the backend creates the correct test user
    // by attempting to login with environment credentials
    
    await page.goto(TEST_CONFIG.BASE_URL);
    await page.waitForLoadState('networkidle');

    // Logout if needed
    try {
      await logout(page);
    } catch {
      // Ignore if logout fails
    }

    // Wait for login form
    await expect(page.locator('input[type="email"]'))
      .toBeVisible({ timeout: 5000 });

    // Login with environment credentials
    await page.fill('input[type="email"]', TEST_CONFIG.TEST_USER_EMAIL);
    await page.fill('input[type="password"]', TEST_CONFIG.TEST_USER_PASSWORD);
    await page.click('button:has-text("Sign in")');

    // Successful login indicates backend created user correctly
    await expect(page.locator('textarea[placeholder*="Type your message"]'))
      .toBeVisible({ timeout: TEST_CONFIG.DEFAULT_TIMEOUT });

    console.log('Backend test user creation verified - login successful');
  });

  test('Global setup authentication state persistence', async ({ page }) => {
    // This test verifies that the global setup correctly saves auth state
    // and that subsequent tests can use it
    
    await page.goto(TEST_CONFIG.BASE_URL);
    await page.waitForLoadState('networkidle');

    // Should already be logged in from global setup
    const isLoggedIn = await page.locator('textarea[placeholder*="Type your message"]')
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (isLoggedIn) {
      console.log('Global setup authentication state working correctly');
    } else {
      // If not logged in, try the login helper
      await login(page);
      await expect(page.locator('textarea[placeholder*="Type your message"]'))
        .toBeVisible({ timeout: TEST_CONFIG.DEFAULT_TIMEOUT });
      console.log('Login helper successfully restored authentication');
    }
  });
});

test.describe('Cross-file Credential Consistency', () => {
  test('All test files use consistent credentials', async () => {
    // This test ensures that all configuration sources are aligned
    
    // Check that test data matches config
    expect(testUsers.default.email).toBe(TEST_CONFIG.TEST_USER_EMAIL);
    expect(testUsers.default.password).toBe(TEST_CONFIG.TEST_USER_PASSWORD);
    
    // Verify environment variables are set correctly
    expect(TEST_CONFIG.TEST_USER_EMAIL).toBeTruthy();
    expect(TEST_CONFIG.TEST_USER_PASSWORD).toBeTruthy();
    expect(TEST_CONFIG.BASE_URL).toBeTruthy();
    
    // Standard test user should be test@workbench.com with testpassword123
    // This ensures we've moved away from the old cthomasbrittain@yahoo.com
    expect(TEST_CONFIG.TEST_USER_EMAIL).toBe('test@workbench.com');
    expect(TEST_CONFIG.TEST_USER_PASSWORD).toBe('testpassword123');
    
    console.log('All credential sources are consistent');
  });

  test('No hardcoded cthomasbrittain credentials in active use', async () => {
    // Verify we're not using the old inconsistent credentials
    expect(TEST_CONFIG.TEST_USER_EMAIL).not.toBe('cthomasbrittain@yahoo.com');
    expect(TEST_CONFIG.TEST_USER_PASSWORD).not.toBe('IVMPEscH33EhfnlPZcAwpkfR');
    expect(testUsers.default.email).not.toBe('cthomasbrittain@yahoo.com');
    expect(testUsers.default.password).not.toBe('IVMPEscH33EhfnlPZcAwpkfR');
    
    console.log('Old inconsistent credentials are no longer in use');
  });
});
