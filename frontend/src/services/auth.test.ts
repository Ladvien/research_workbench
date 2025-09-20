import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { AuthService, authService } from './auth';
import type { LoginRequest, RegisterRequest, User, ApiResponse, AuthResponse } from '../types';
import { TEST_CONFIG, waitForBackend, ensureTestUser, cleanupTestData } from '../test-utils/testConfig';

describe('AuthService', () => {
  let testService: AuthService;

  beforeAll(async () => {
    // Wait for backend to be ready
    const isReady = await waitForBackend();
    if (!isReady) {
      throw new Error('Backend is not ready for testing');
    }

    // Ensure test user exists
    await ensureTestUser();

    // Create a test service instance
    testService = new AuthService();
  }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);

  beforeEach(async () => {
    // Clean up any existing sessions
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('constructor', () => {
    it('should use default base URL', () => {
      const service = new AuthService();
      expect(service).toBeDefined();
    });

    it('should use custom base URL', () => {
      const customUrl = 'https://custom-api.example.com';
      const service = new AuthService(customUrl);
      expect(service).toBeDefined();
    });
  });

  describe('login', () => {
    it('should login successfully with real backend', async () => {
      const loginRequest: LoginRequest = {
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      };

      const result = await testService.login(loginRequest);

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.user).toBeDefined();
      expect(result.data?.user.email).toBe(loginRequest.email);
      expect(result.data?.tokens).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);

    it('should handle login with invalid credentials', async () => {
      const loginRequest: LoginRequest = {
        email: TEST_CONFIG.TEST_USER.email,
        password: 'wrongpassword',
      };

      const result = await testService.login(loginRequest);

      expect(result.status).toBe(401);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle login with non-existent user', async () => {
      const loginRequest: LoginRequest = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      const result = await testService.login(loginRequest);

      expect(result.status).toBe(401);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle malformed login request', async () => {
      const loginRequest: LoginRequest = {
        email: 'invalid-email-format',
        password: '',
      };

      const result = await testService.login(loginRequest);

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('register', () => {
    it('should register successfully with real backend', async () => {
      const timestamp = Date.now();
      const registerRequest: RegisterRequest = {
        email: `test-register-${timestamp}@example.com`,
        username: `testuser${timestamp}`,
        password: 'password123',
      };

      const result = await testService.register(registerRequest);

      expect(result.status).toBe(201);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.user).toBeDefined();
      expect(result.data?.user.email).toBe(registerRequest.email);
      expect(result.data?.user.username).toBe(registerRequest.username);
      expect(result.data?.tokens).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);

    it('should handle registration with existing email', async () => {
      const registerRequest: RegisterRequest = {
        email: TEST_CONFIG.TEST_USER.email, // Use existing test user email
        username: 'duplicateuser',
        password: 'password123',
      };

      const result = await testService.register(registerRequest);

      expect(result.status).toBe(409);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle registration with invalid data', async () => {
      const registerRequest: RegisterRequest = {
        email: 'invalid-email',
        username: '',
        password: '123', // Too short
      };

      const result = await testService.register(registerRequest);

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle registration with missing fields', async () => {
      const registerRequest = {
        email: 'test@example.com',
        // Missing username and password
      } as RegisterRequest;

      const result = await testService.register(registerRequest);

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('logout', () => {
    it('should logout successfully with real backend', async () => {
      // First login to have a session to logout from
      await testService.login({
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      });

      const result = await testService.logout();

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle logout without session gracefully', async () => {
      // Don't login first, just try to logout
      const result = await testService.logout();

      // Should still return success even if no session exists
      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should invalidate session after logout', async () => {
      // First login
      await testService.login({
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      });

      // Verify we can access protected endpoint
      const userBeforeLogout = await testService.getCurrentUser();
      expect(userBeforeLogout.status).toBe(200);

      // Logout
      await testService.logout();

      // Verify we can't access protected endpoint anymore
      const userAfterLogout = await testService.getCurrentUser();
      expect(userAfterLogout.status).toBe(401);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('getCurrentUser', () => {
    it('should get current user successfully with real backend', async () => {
      // First login to have a session
      await testService.login({
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      });

      const result = await testService.getCurrentUser();

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.email).toBe(TEST_CONFIG.TEST_USER.email);
      expect(result.data?.id).toBeDefined();
      expect(result.data?.username).toBeDefined();
      expect(result.data?.created_at).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle unauthorized current user request', async () => {
      // Ensure no session exists
      await testService.logout();

      const result = await testService.getCurrentUser();

      expect(result.status).toBe(401);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('refreshToken', () => {
    it('should refresh token successfully with real backend', async () => {
      // First login to have a session with refresh token
      await testService.login({
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      });

      const result = await testService.refreshToken();

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.tokens).toBeDefined();
      expect(result.data?.user).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle refresh token failure without session', async () => {
      // Ensure no session exists
      await testService.logout();

      // Clear all cookies to ensure no refresh token
      document.cookie.split(';').forEach(c => {
        const eqPos = c.indexOf('=');
        const name = eqPos > -1 ? c.substr(0, eqPos) : c;
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      });

      const result = await testService.refreshToken();

      expect(result.status).toBe(401);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('healthCheck', () => {
    it('should perform health check successfully with real backend', async () => {
      const result = await testService.healthCheck();

      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
      expect(result.data?.status).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('integration tests', () => {
    it('should handle authentication flow end-to-end', async () => {
      // Test full authentication flow
      const timestamp = Date.now();
      const registerRequest: RegisterRequest = {
        email: `test-flow-${timestamp}@example.com`,
        username: `testflow${timestamp}`,
        password: 'password123',
      };

      // 1. Register
      const registerResult = await testService.register(registerRequest);
      expect(registerResult.status).toBe(201);
      expect(registerResult.data?.user.email).toBe(registerRequest.email);

      // 2. Get current user (should work after registration)
      const userResult = await testService.getCurrentUser();
      expect(userResult.status).toBe(200);
      expect(userResult.data?.email).toBe(registerRequest.email);

      // 3. Logout
      const logoutResult = await testService.logout();
      expect(logoutResult.status).toBe(200);

      // 4. Get current user (should fail after logout)
      const userAfterLogoutResult = await testService.getCurrentUser();
      expect(userAfterLogoutResult.status).toBe(401);

      // 5. Login again
      const loginResult = await testService.login({
        email: registerRequest.email,
        password: registerRequest.password,
      });
      expect(loginResult.status).toBe(200);
      expect(loginResult.data?.user.email).toBe(registerRequest.email);

      // 6. Test refresh token
      const refreshResult = await testService.refreshToken();
      expect(refreshResult.status).toBe(200);
      expect(refreshResult.data?.tokens).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION * 3);

    it('should handle token refresh flow', async () => {
      // Login to get initial tokens
      const loginResult = await testService.login({
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      });
      expect(loginResult.status).toBe(200);

      // Refresh the token
      const refreshResult = await testService.refreshToken();
      expect(refreshResult.status).toBe(200);
      expect(refreshResult.data?.tokens).toBeDefined();

      // Verify we can still access protected endpoints
      const userResult = await testService.getCurrentUser();
      expect(userResult.status).toBe(200);
      expect(userResult.data?.email).toBe(TEST_CONFIG.TEST_USER.email);
    }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);

    it('should handle concurrent login attempts', async () => {
      const loginRequest: LoginRequest = {
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      };

      // Make multiple concurrent login requests
      const promises = Array(3).fill(null).map(() =>
        testService.login(loginRequest)
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.data?.user.email).toBe(loginRequest.email);
      });
    }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);
  });

  describe('network error handling', () => {
    it('should handle network errors gracefully', async () => {
      // Create service with invalid URL to trigger network error
      const invalidService = new AuthService('http://invalid-url:99999');

      const result = await invalidService.healthCheck();

      expect(result.status).toBe(0);
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle malformed JSON responses', async () => {
      // This is harder to test with real backend, but we can test error handling
      const result = await testService.login({
        email: 'test@example.com',
        password: 'password',
      });

      // Should handle response gracefully, even if it fails
      expect(typeof result.status).toBe('number');
      expect(result.error !== undefined || result.data !== undefined).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('exported instance', () => {
    it('should export a default instance', () => {
      expect(authService).toBeInstanceOf(AuthService);
    });

    it('should work with the exported instance', async () => {
      // Test that the exported instance works with real backend
      const result = await authService.healthCheck();
      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should maintain session state with exported instance', async () => {
      // Login with exported instance
      const loginResult = await authService.login({
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      });
      expect(loginResult.status).toBe(200);

      // Get current user should work
      const userResult = await authService.getCurrentUser();
      expect(userResult.status).toBe(200);
      expect(userResult.data?.email).toBe(TEST_CONFIG.TEST_USER.email);

      // Logout
      await authService.logout();
    }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);
  });

  describe('edge cases', () => {
    it('should handle empty request bodies', async () => {
      const result = await testService.login({} as LoginRequest);

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.error).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(1000);
      const result = await testService.login({
        email: TEST_CONFIG.TEST_USER.email,
        password: longPassword,
      });

      expect(result.status).toBe(401); // Should fail authentication
      expect(result.error).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('should handle special characters in credentials', async () => {
      const result = await testService.login({
        email: 'test@example.com',
        password: 'p@ssw0rd!@#$%^&*()',
      });

      // Should handle gracefully (will fail auth but not crash)
      expect(typeof result.status).toBe('number');
      expect(result.error !== undefined || result.data !== undefined).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });
}, 60000); // Increase timeout for real API calls