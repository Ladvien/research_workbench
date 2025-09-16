// Tests for authentication service
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../../src/services/auth';
import { LoginRequest, RegisterRequest } from '../../src/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AuthService', () => {
  let authService: AuthService;

  const mockLoginRequest: LoginRequest = {
    email: 'test@example.com',
    password: 'password123',
  };

  const mockRegisterRequest: RegisterRequest = {
    email: 'test@example.com',
    username: 'testuser',
    password: 'password123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService();

    // Default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        user: { id: '1', email: 'test@example.com', username: 'testuser' },
        tokens: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresAt: Date.now() + (60 * 60 * 1000),
        }
      }),
      text: () => Promise.resolve(''),
    });

    // No token storage setup needed for cookie-based auth
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('should send login request with correct parameters', async () => {
      const result = await authService.login(mockLoginRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(mockLoginRequest),
        }
      );

      expect(result.status).toBe(200);
      expect(result.data?.user.email).toBe('test@example.com');
    });

    it('should handle login failure with error message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid credentials'),
      });

      const result = await authService.login(mockLoginRequest);

      expect(result.status).toBe(401);
      expect(result.error).toBe('Invalid credentials');
      expect(result.data).toBeUndefined();
    });

    it('should handle network errors during login', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await authService.login(mockLoginRequest);

      expect(result.status).toBe(0);
      expect(result.error).toBe('Network error');
      expect(result.data).toBeUndefined();
    });
  });

  describe('register', () => {
    it('should send register request with correct parameters', async () => {
      const result = await authService.register(mockRegisterRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(mockRegisterRequest),
        }
      );

      expect(result.status).toBe(200);
      expect(result.data?.user.email).toBe('test@example.com');
    });

    it('should handle registration failure with validation errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Email already exists'),
      });

      const result = await authService.register(mockRegisterRequest);

      expect(result.status).toBe(400);
      expect(result.error).toBe('Email already exists');
    });
  });

  describe('logout', () => {
    it('should send logout request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const result = await authService.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/logout',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.status).toBe(200);
    });

    it('should handle logout errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });

      const result = await authService.logout();

      expect(result.status).toBe(500);
      expect(result.error).toBe('Server error');
    });
  });

  describe('getCurrentUser', () => {
    it('should send getCurrentUser request with credentials', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: '1',
          email: 'test@example.com',
          username: 'testuser'
        }),
      });

      const result = await authService.getCurrentUser();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/me',
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.status).toBe(200);
      expect(result.data?.email).toBe('test@example.com');
    });

    it('should handle unauthorized response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await authService.getCurrentUser();

      expect(result.status).toBe(401);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('refreshToken', () => {
    it('should send refresh token request', async () => {
      const result = await authService.refreshToken();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/refresh',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.status).toBe(200);
      expect(result.data?.tokens?.accessToken).toBe('mock-access-token');
    });

    it('should handle refresh token failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Refresh token expired'),
      });

      const result = await authService.refreshToken();

      expect(result.status).toBe(401);
      expect(result.error).toBe('Refresh token expired');
    });

    it('should handle refresh token network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Connection failed'));

      const result = await authService.refreshToken();

      expect(result.status).toBe(0);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('healthCheck', () => {
    it('should send health check request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'healthy' }),
      });

      const result = await authService.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/health',
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.status).toBe(200);
      expect(result.data?.status).toBe('healthy');
    });
  });

  describe('Custom base URL', () => {
    it('should use custom base URL when provided', async () => {
      const customAuthService = new AuthService('https://api.example.com');

      await customAuthService.login(mockLoginRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/login',
        expect.any(Object)
      );
    });
  });

  describe('Error handling', () => {
    it('should handle empty error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(''),
      });

      const result = await authService.login(mockLoginRequest);

      expect(result.error).toBe('HTTP 500');
    });

    it('should include credentials in all requests', async () => {
      await authService.login(mockLoginRequest);
      await authService.register(mockRegisterRequest);
      await authService.logout();
      await authService.getCurrentUser();
      await authService.refreshToken();
      await authService.healthCheck();

      // Check that all 6 calls included credentials
      expect(mockFetch).toHaveBeenCalledTimes(6);

      for (let i = 0; i < 6; i++) {
        expect(mockFetch).toHaveBeenNthCalledWith(
          i + 1,
          expect.any(String),
          expect.objectContaining({
            credentials: 'include',
          })
        );
      }
    });
  });
});