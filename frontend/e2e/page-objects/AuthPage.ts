import { Page, Locator, expect } from '@playwright/test';

export class AuthPage {
  readonly page: Page;

  // Navigation elements
  readonly loginTab: Locator;
  readonly registerTab: Locator;

  // Login form elements
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly togglePasswordButton: Locator;
  readonly loginButton: Locator;
  readonly switchToRegisterLink: Locator;

  // Register form elements
  readonly registerEmailInput: Locator;
  readonly registerPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly registerButton: Locator;
  readonly switchToLoginLink: Locator;

  // Common elements
  readonly errorAlert: Locator;
  readonly loadingSpinner: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Navigation
    this.loginTab = page.getByRole('tab', { name: /login|sign in/i });
    this.registerTab = page.getByRole('tab', { name: /register|sign up/i });

    // Login form
    this.emailInput = page.getByRole('textbox', { name: /email/i });
    this.passwordInput = page.getByRole('textbox', { name: /password/i });
    this.togglePasswordButton = page.getByRole('button', { name: /toggle password visibility/i });
    this.loginButton = page.getByRole('button', { name: /sign in/i });
    this.switchToRegisterLink = page.getByRole('button', { name: /sign up here/i });

    // Register form
    this.registerEmailInput = page.getByRole('textbox', { name: /email/i });
    this.registerPasswordInput = page.getByRole('textbox', { name: /^password$/i });
    this.confirmPasswordInput = page.getByRole('textbox', { name: /confirm password/i });
    this.registerButton = page.getByRole('button', { name: /sign up|register/i });
    this.switchToLoginLink = page.getByRole('button', { name: /sign in here/i });

    // Common
    this.errorAlert = page.getByRole('alert');
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]');
    this.submitButton = page.getByRole('button', { name: /(sign in|sign up|register)/ });
  }

  async goto() {
    await this.page.goto('/');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async register(email: string, password: string, confirmPassword?: string) {
    await this.switchToRegister();
    await this.registerEmailInput.fill(email);
    await this.registerPasswordInput.fill(password);
    if (confirmPassword) {
      await this.confirmPasswordInput.fill(confirmPassword);
    }
    await this.registerButton.click();
  }

  async switchToRegister() {
    if (await this.switchToRegisterLink.isVisible()) {
      await this.switchToRegisterLink.click();
    }
  }

  async switchToLogin() {
    if (await this.switchToLoginLink.isVisible()) {
      await this.switchToLoginLink.click();
    }
  }

  async togglePasswordVisibility() {
    await this.togglePasswordButton.click();
  }

  async expectLoginForm() {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.loginButton).toBeVisible();
  }

  async expectRegisterForm() {
    await expect(this.registerEmailInput).toBeVisible();
    await expect(this.registerPasswordInput).toBeVisible();
    await expect(this.registerButton).toBeVisible();
  }

  async expectErrorMessage(message?: string) {
    await expect(this.errorAlert).toBeVisible();
    if (message) {
      await expect(this.errorAlert).toContainText(message);
    }
  }

  async expectLoading() {
    await expect(this.submitButton).toBeDisabled();
    await expect(this.submitButton).toContainText(/signing in|signing up/i);
  }

  async expectValidationError(field: 'email' | 'password' | 'confirmPassword', message?: string) {
    const fieldLocator = field === 'email' ? this.emailInput :
                        field === 'password' ? this.passwordInput :
                        this.confirmPasswordInput;

    await expect(fieldLocator).toHaveAttribute('aria-invalid', 'true');

    if (message) {
      const errorElement = this.page.locator(`[aria-describedby="${await fieldLocator.getAttribute('aria-describedby')}"]`);
      await expect(errorElement).toContainText(message);
    }
  }

  async expectSuccessfulLogin() {
    await this.page.waitForURL(/\/chat|\/dashboard/);
    await expect(this.page.getByTestId('user-avatar')).toBeVisible();
  }

  async logout() {
    const userMenu = this.page.getByTestId('user-menu');
    await userMenu.click();
    await this.page.getByRole('menuitem', { name: /logout|sign out/i }).click();
    await this.page.waitForURL('/');
  }

  // Accessibility methods
  async navigateWithKeyboard() {
    await this.emailInput.focus();
    await this.page.keyboard.press('Tab');
    await expect(this.passwordInput).toBeFocused();

    await this.page.keyboard.press('Tab');
    await expect(this.togglePasswordButton).toBeFocused();

    await this.page.keyboard.press('Tab');
    await expect(this.loginButton).toBeFocused();
  }

  async submitWithEnter() {
    await this.passwordInput.focus();
    await this.page.keyboard.press('Enter');
  }

  // Error recovery methods
  async retryFailedLogin(email: string, password: string) {
    await this.expectErrorMessage();
    await this.emailInput.clear();
    await this.passwordInput.clear();
    await this.login(email, password);
  }

  async clearForm() {
    await this.emailInput.clear();
    await this.passwordInput.clear();
    if (await this.confirmPasswordInput.isVisible()) {
      await this.confirmPasswordInput.clear();
    }
  }
}