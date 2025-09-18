/**
 * E2E CSRF Protection Tests
 * 
 * End-to-end tests for CSRF token functionality
 * Tests the complete flow from frontend to backend
 */

import { test, expect } from '@playwright/test';

test.describe('CSRF Protection E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://workbench.lolzlab.com');
  });

  test('should get CSRF token from server', async ({ page }) => {
    // Make a request to get CSRF token
    const response = await page.request.get('http://workbench.lolzlab.com/api/v1/auth/csrf-token');
    
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('csrf_token');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.csrf_token).toBe('string');
    expect(body.csrf_token.length).toBeGreaterThan(16);
    
    // Check that CSRF cookie is set
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find(c => c.name === 'csrf-token');
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie?.httpOnly).toBe(true);
  });

  test('should include CSRF token in login response', async ({ page }) => {
    // Navigate to login page
    await page.goto('http://workbench.lolzlab.com/login');
    
    // Wait for login form
    await page.waitForSelector('[data-testid="login-form"]', { timeout: 10000 });
    
    // Fill in credentials
    await page.fill('[data-testid="email-input"]', 'test@workbench.com');
    await page.fill('[data-testid="password-input"]', 'testpassword123');
    
    // Intercept the login request
    const loginPromise = page.waitForResponse(
      response => response.url().includes('/api/v1/auth/login') && response.status() === 201
    );
    
    // Submit login
    await page.click('[data-testid="login-submit"]');
    
    // Wait for login response
    const loginResponse = await loginPromise;
    const loginBody = await loginResponse.json();
    
    // Verify CSRF token is included
    expect(loginBody).toHaveProperty('csrf_token');
    expect(typeof loginBody.csrf_token).toBe('string');
    expect(loginBody.csrf_token.length).toBeGreaterThan(16);
    
    // Verify cookies are set
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find(c => c.name === 'token');
    const csrfCookie = cookies.find(c => c.name === 'csrf-token');
    
    expect(tokenCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();
  });

  test('should protect POST requests with CSRF validation', async ({ page }) => {
    // First login to get session and CSRF token
    await page.goto('http://workbench.lolzlab.com/login');
    await page.waitForSelector('[data-testid="login-form"]');
    await page.fill('[data-testid="email-input"]', 'test@workbench.com');
    await page.fill('[data-testid="password-input"]', 'testpassword123');
    await page.click('[data-testid="login-submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard');
    
    // Get the CSRF token from cookies
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find(c => c.name === 'csrf-token');
    expect(csrfCookie).toBeDefined();
    
    // Test 1: Request with valid CSRF token should succeed
    const validResponse = await page.request.post('http://workbench.lolzlab.com/api/v1/conversations', {
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfCookie!.value,
      },
      data: {
        title: 'Test Conversation',
      },
    });
    
    // Should succeed (or fail with validation, but not CSRF error)
    expect(validResponse.status()).not.toBe(403);
    
    // Test 2: Request without CSRF token should fail
    const invalidResponse = await page.request.post('http://workbench.lolzlab.com/api/v1/conversations', {
      headers: {
        'Content-Type': 'application/json',
        // No CSRF token
      },
      data: {
        title: 'Test Conversation',
      },
    });
    
    expect(invalidResponse.status()).toBe(403);
    const errorBody = await invalidResponse.json();
    expect(errorBody.error.code).toBe('CSRF_VALIDATION_FAILED');
  });

  test('should allow safe methods without CSRF token', async ({ page }) => {
    // Test GET request without CSRF token
    const getResponse = await page.request.get('http://workbench.lolzlab.com/api/v1/health');
    expect(getResponse.status()).toBe(200);
    
    // Test HEAD request without CSRF token
    const headResponse = await page.request.head('http://workbench.lolzlab.com/api/v1/health');
    expect(headResponse.status()).toBe(200);
    
    // Test OPTIONS request without CSRF token
    const optionsResponse = await page.request.fetch('http://workbench.lolzlab.com/api/v1/health', {
      method: 'OPTIONS',
    });
    expect(optionsResponse.status()).toBe(200);
  });

  test('should skip CSRF protection for auth endpoints', async ({ page }) => {
    // Login should work without existing CSRF token
    const loginResponse = await page.request.post('http://workbench.lolzlab.com/api/v1/auth/login', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        email: 'test@workbench.com',
        password: 'testpassword123',
      },
    });
    
    expect(loginResponse.status()).toBe(201);
    
    // Register should work without existing CSRF token
    const randomEmail = `test${Date.now()}@workbench.com`;
    const registerResponse = await page.request.post('http://workbench.lolzlab.com/api/v1/auth/register', {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        email: randomEmail,
        username: `user${Date.now()}`,
        password: 'testpassword123',
      },
    });
    
    // Should succeed or fail with validation, but not CSRF error
    expect(registerResponse.status()).not.toBe(403);
  });

  test('should handle CSRF token refresh on expiration', async ({ page }) => {
    // This test would require manipulating time or using expired tokens
    // For now, we'll test the refresh endpoint
    
    // First login
    await page.goto('http://workbench.lolzlab.com/login');
    await page.waitForSelector('[data-testid="login-form"]');
    await page.fill('[data-testid="email-input"]', 'test@workbench.com');
    await page.fill('[data-testid="password-input"]', 'testpassword123');
    await page.click('[data-testid="login-submit"]');
    
    await page.waitForURL('**/dashboard');
    
    // Test CSRF token refresh endpoint
    const refreshResponse = await page.request.get('http://workbench.lolzlab.com/api/v1/auth/csrf-token');
    expect(refreshResponse.status()).toBe(200);
    
    const body = await refreshResponse.json();
    expect(body).toHaveProperty('csrf_token');
    expect(body).toHaveProperty('timestamp');
  });

  test('should maintain CSRF protection across page navigation', async ({ page }) => {
    // Login
    await page.goto('http://workbench.lolzlab.com/login');
    await page.waitForSelector('[data-testid="login-form"]');
    await page.fill('[data-testid="email-input"]', 'test@workbench.com');
    await page.fill('[data-testid="password-input"]', 'testpassword123');
    await page.click('[data-testid="login-submit"]');
    
    await page.waitForURL('**/dashboard');
    
    // Navigate to different pages
    await page.goto('http://workbench.lolzlab.com/conversations');
    await page.goto('http://workbench.lolzlab.com/settings');
    
    // CSRF token should still be available
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find(c => c.name === 'csrf-token');
    expect(csrfCookie).toBeDefined();
    
    // Should be able to make protected requests
    const protectedResponse = await page.request.post('http://workbench.lolzlab.com/api/v1/conversations', {
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfCookie!.value,
      },
      data: {
        title: 'Test After Navigation',
      },
    });
    
    expect(protectedResponse.status()).not.toBe(403);
  });
});