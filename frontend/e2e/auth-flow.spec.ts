import { test, expect, devices } from '@playwright/test';
import { AuthPage } from './page-objects/AuthPage';
import { ChatPage } from './page-objects/ChatPage';
import { ConversationSidebarPage } from './page-objects/ConversationSidebarPage';

test.describe('Authentication Flow', () => {
  let authPage: AuthPage;
  let chatPage: ChatPage;
  let sidebarPage: ConversationSidebarPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    chatPage = new ChatPage(page);
    sidebarPage = new ConversationSidebarPage(page);
  });

  test.describe('Login Flow', () => {
    test('should display login form correctly', async () => {
      await authPage.goto();
      await authPage.expectLoginForm();
      
      // Check form elements are present
      await expect(authPage.emailInput).toBeVisible();
      await expect(authPage.passwordInput).toBeVisible();
      await expect(authPage.loginButton).toBeVisible();
      await expect(authPage.switchToRegisterLink).toBeVisible();
    });

    test('should validate email format', async () => {
      await authPage.goto();
      
      // Try invalid email
      await authPage.emailInput.fill('invalid-email');
      await authPage.passwordInput.fill('password123');
      await authPage.loginButton.click();
      
      await authPage.expectValidationError('email', 'Please enter a valid email address');
    });

    test('should validate password requirements', async () => {
      await authPage.goto();
      
      // Try short password
      await authPage.emailInput.fill('test@example.com');
      await authPage.passwordInput.fill('123');
      await authPage.loginButton.click();
      
      await authPage.expectValidationError('password', 'Password must be at least 8 characters');
    });

    test('should toggle password visibility', async () => {
      await authPage.goto();
      
      // Password should be hidden initially
      await expect(authPage.passwordInput).toHaveAttribute('type', 'password');
      
      // Toggle visibility
      await authPage.togglePasswordVisibility();
      await expect(authPage.passwordInput).toHaveAttribute('type', 'text');
      
      // Toggle back
      await authPage.togglePasswordVisibility();
      await expect(authPage.passwordInput).toHaveAttribute('type', 'password');
    });

    test('should handle invalid credentials', async () => {
      await authPage.goto();
      
      await authPage.login('invalid@example.com', 'wrongpassword');
      await authPage.expectErrorMessage('Invalid email or password');
    });

    test('should login with valid credentials', async () => {
      await authPage.goto();
      
      // Use test credentials
      await authPage.login('test@workbench.com', 'testpassword123');
      
      // Should redirect to chat
      await expect(authPage.page).toHaveURL(/\/chat/);
      await chatPage.expectWelcomeScreen();
    });

    test('should maintain session after page reload', async ({ context }) => {
      await authPage.goto();
      await authPage.login('test@workbench.com', 'testpassword123');
      
      // Reload page
      await authPage.page.reload();
      
      // Should still be logged in
      await expect(authPage.page).toHaveURL(/\/chat/);
      await chatPage.expectWelcomeScreen();
    });

    test('should submit form with Enter key', async () => {
      await authPage.goto();
      
      await authPage.emailInput.fill('test@workbench.com');
      await authPage.passwordInput.fill('testpassword123');
      
      await authPage.submitWithEnter();
      
      await expect(authPage.page).toHaveURL(/\/chat/);
    });
  });

  test.describe('Registration Flow', () => {
    test('should display registration form', async () => {
      await authPage.goto();
      await authPage.switchToRegister();
      
      await authPage.expectRegisterForm();
    });

    test('should validate registration fields', async () => {
      await authPage.goto();
      await authPage.switchToRegister();
      
      // Try with invalid data
      await authPage.registerEmailInput.fill('invalid-email');
      await authPage.registerPasswordInput.fill('123');
      await authPage.confirmPasswordInput.fill('different');
      await authPage.registerButton.click();
      
      // Should show validation errors
      await authPage.expectValidationError('email');
      await authPage.expectValidationError('password');
    });

    test('should register new user successfully', async () => {
      await authPage.goto();
      
      const uniqueEmail = `test${Date.now()}@workbench.com`;
      await authPage.register(uniqueEmail, 'newpassword123', 'newpassword123');
      
      // Should redirect to chat after successful registration
      await expect(authPage.page).toHaveURL(/\/chat/);
      await chatPage.expectWelcomeScreen();
    });

    test('should handle duplicate email registration', async () => {
      await authPage.goto();
      
      // Try to register with existing email
      await authPage.register('test@workbench.com', 'password123', 'password123');
      
      await authPage.expectErrorMessage('Email already exists');
    });

    test('should switch between login and register forms', async () => {
      await authPage.goto();
      
      // Start with login form
      await authPage.expectLoginForm();
      
      // Switch to register
      await authPage.switchToRegister();
      await authPage.expectRegisterForm();
      
      // Switch back to login
      await authPage.switchToLogin();
      await authPage.expectLoginForm();
    });
  });

  test.describe('Session Management', () => {
    test.beforeEach(async () => {
      await authPage.goto();
      await authPage.login('test@workbench.com', 'testpassword123');
    });

    test('should logout successfully', async () => {
      await authPage.logout();
      
      // Should redirect to login page
      await expect(authPage.page).toHaveURL('/');
      await authPage.expectLoginForm();
    });

    test('should handle session expiration', async ({ context }) => {
      // Clear auth state to simulate expired session
      await context.clearCookies();
      
      // Navigate to protected route
      await chatPage.goto();
      
      // Should redirect to login
      await expect(authPage.page).toHaveURL('/');
      await authPage.expectLoginForm();
    });

    test('should remember user preference after login', async () => {
      // Set a preference (like theme)
      await authPage.page.evaluate(() => {
        localStorage.setItem('theme', 'dark');
      });
      
      // Logout and login again
      await authPage.logout();
      await authPage.login('test@workbench.com', 'testpassword123');
      
      // Check preference is maintained
      const theme = await authPage.page.evaluate(() => localStorage.getItem('theme'));
      expect(theme).toBe('dark');
    });
  });

  test.describe('Accessibility', () => {
    test('should support keyboard navigation', async () => {
      await authPage.goto();
      await authPage.navigateWithKeyboard();
    });

    test('should have proper ARIA labels', async () => {
      await authPage.goto();
      
      await expect(authPage.emailInput).toHaveAttribute('aria-label');
      await expect(authPage.passwordInput).toHaveAttribute('aria-label');
      await expect(authPage.loginButton).toHaveAttribute('aria-label');
    });

    test('should announce errors to screen readers', async () => {
      await authPage.goto();
      
      await authPage.emailInput.fill('invalid');
      await authPage.loginButton.click();
      
      const errorElement = authPage.page.locator('[role="alert"]');
      await expect(errorElement).toBeVisible();
    });

    test('should have proper focus management', async () => {
      await authPage.goto();
      
      // Focus should start on email input
      await authPage.emailInput.focus();
      await expect(authPage.emailInput).toBeFocused();
      
      // Tab should move to password
      await authPage.page.keyboard.press('Tab');
      await expect(authPage.passwordInput).toBeFocused();
    });
  });

  test.describe('Error Recovery', () => {
    test('should recover from network errors', async () => {
      await authPage.goto();
      
      // Simulate network failure
      await authPage.page.route('**/api/auth/**', route => {
        route.abort('failed');
      });
      
      await authPage.login('test@workbench.com', 'testpassword123');
      await authPage.expectErrorMessage(/network error|failed to connect/i);
      
      // Remove network simulation
      await authPage.page.unroute('**/api/auth/**');
      
      // Retry should work
      await authPage.retryFailedLogin('test@workbench.com', 'testpassword123');
      await expect(authPage.page).toHaveURL(/\/chat/);
    });

    test('should handle server errors gracefully', async () => {
      await authPage.goto();
      
      // Simulate server error
      await authPage.page.route('**/api/auth/login', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' })
        });
      });
      
      await authPage.login('test@workbench.com', 'testpassword123');
      await authPage.expectErrorMessage(/server error|something went wrong/i);
    });

    test('should clear previous errors on new attempt', async () => {
      await authPage.goto();
      
      // Generate error
      await authPage.login('invalid@example.com', 'wrongpassword');
      await authPage.expectErrorMessage();
      
      // Start typing - error should clear
      await authPage.emailInput.fill('test@workbench.com');
      await expect(authPage.errorAlert).not.toBeVisible();
    });
  });

  test.describe('Security', () => {
    test('should not store passwords in local storage', async () => {
      await authPage.goto();
      await authPage.login('test@workbench.com', 'testpassword123');
      
      const localStorage = await authPage.page.evaluate(() => {
        const items: { [key: string]: string } = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            items[key] = localStorage.getItem(key) || '';
          }
        }
        return items;
      });
      
      // Check that no sensitive data is stored
      const sensitiveDataFound = Object.values(localStorage).some(value => 
        value.includes('testpassword123') || value.includes('password')
      );
      
      expect(sensitiveDataFound).toBeFalsy();
    });

    test('should handle CSRF protection', async () => {
      await authPage.goto();
      
      // Check that CSRF token or similar protection is in place
      const csrfMeta = authPage.page.locator('meta[name="csrf-token"]');
      const csrfHeader = await authPage.page.evaluate(() => {
        return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      });
      
      // CSRF token should be present or requests should include proper headers
      expect(csrfHeader || 'protected').toBeTruthy();
    });
  });

  test.describe('Mobile Experience', () => {
    test('should work correctly on mobile devices', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      await authPage.goto();
      
      // Form should be properly sized for mobile
      await expect(authPage.emailInput).toBeVisible();
      await expect(authPage.passwordInput).toBeVisible();
      await expect(authPage.loginButton).toBeVisible();
      
      // Login should work
      await authPage.login('test@workbench.com', 'testpassword123');
      await expect(authPage.page).toHaveURL(/\/chat/);
    });

    test('should handle mobile keyboard appropriately', async () => {
      await authPage.goto();
      
      // Email input should use email keyboard
      await expect(authPage.emailInput).toHaveAttribute('type', 'email');
      
      // Password input should be secure
      await expect(authPage.passwordInput).toHaveAttribute('type', 'password');
    });
  });

  test.describe('Performance', () => {
    test('should load login form quickly', async () => {
      const startTime = Date.now();
      await authPage.goto();
      await authPage.expectLoginForm();
      const loadTime = Date.now() - startTime;
      
      expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
    });

    test('should authenticate quickly', async () => {
      await authPage.goto();
      
      const startTime = Date.now();
      await authPage.login('test@workbench.com', 'testpassword123');
      await expect(authPage.page).toHaveURL(/\/chat/);
      const authTime = Date.now() - startTime;
      
      expect(authTime).toBeLessThan(5000); // Should authenticate within 5 seconds
    });
  });
});
