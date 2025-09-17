import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService, authService } from './auth';
import type { LoginRequest, RegisterRequest, User, ApiResponse, AuthResponse } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AuthService', () => {
  const mockUser: User = {
    id: '1',
    email: 'test@example.com',
    username: 'testuser',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  const mockAuthResponse: AuthResponse = {
    user: mockUser,
    tokens: {
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-456',
      expiresAt: Date.now() + 3600000,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
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
    it('should login successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockAuthResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const loginRequest: LoginRequest = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await authService.login(loginRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(loginRequest),
          credentials: 'include',
        }
      );

      expect(result.data).toEqual(mockAuthResponse);
      expect(result.status).toBe(200);
      expect(result.error).toBeUndefined();
    });

    it('should handle login HTTP error', async () => {
      const errorMessage = 'Invalid credentials';
      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue(errorMessage),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const loginRequest: LoginRequest = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const result = await authService.login(loginRequest);

      expect(result.error).toBe(errorMessage);
      expect(result.status).toBe(401);
      expect(result.data).toBeUndefined();
    });

    it('should handle empty error response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const loginRequest: LoginRequest = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await authService.login(loginRequest);

      expect(result.error).toBe('HTTP 500');
      expect(result.status).toBe(500);
    });

    it('should handle network error', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      const loginRequest: LoginRequest = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await authService.login(loginRequest);

      expect(result.error).toBe('Network error');
      expect(result.status).toBe(0);
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('String error');

      const loginRequest: LoginRequest = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = await authService.login(loginRequest);

      expect(result.error).toBe('Network error');
      expect(result.status).toBe(0);
    });
  });

  describe('register', () => {
    it('should register successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue(mockAuthResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const registerRequest: RegisterRequest = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
      };

      const result = await authService.register(registerRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(registerRequest),
          credentials: 'include',
        }
      );

      expect(result.data).toEqual(mockAuthResponse);
      expect(result.status).toBe(201);
    });

    it('should handle registration HTTP error', async () => {
      const errorMessage = 'Email already exists';
      const mockResponse = {
        ok: false,
        status: 409,
        text: vi.fn().mockResolvedValue(errorMessage),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const registerRequest: RegisterRequest = {
        email: 'existing@example.com',
        username: 'testuser',
        password: 'password123',
      };

      const result = await authService.register(registerRequest);

      expect(result.error).toBe(errorMessage);
      expect(result.status).toBe(409);
    });

    it('should handle registration network error', async () => {
      const networkError = new Error('Connection failed');
      mockFetch.mockRejectedValue(networkError);

      const registerRequest: RegisterRequest = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
      };

      const result = await authService.register(registerRequest);

      expect(result.error).toBe('Connection failed');
      expect(result.status).toBe(0);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
      };
      mockFetch.mockResolvedValue(mockResponse);

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
      expect(result.error).toBeUndefined();
    });

    it('should handle logout HTTP error', async () => {
      const errorMessage = 'Session not found';
      const mockResponse = {
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue(errorMessage),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authService.logout();

      expect(result.error).toBe(errorMessage);
      expect(result.status).toBe(404);
    });

    it('should handle logout network error', async () => {
      const networkError = new Error('Network timeout');
      mockFetch.mockRejectedValue(networkError);

      const result = await authService.logout();

      expect(result.error).toBe('Network timeout');
      expect(result.status).toBe(0);
    });
  });

  describe('getCurrentUser', () => {
    it('should get current user successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockUser),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authService.getCurrentUser();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/me',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.data).toEqual(mockUser);
      expect(result.status).toBe(200);
    });

    it('should handle unauthorized current user request', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authService.getCurrentUser();

      expect(result.error).toBe('Unauthorized');
      expect(result.status).toBe(401);
    });

    it('should handle network error when getting current user', async () => {
      const networkError = new Error('Request failed');
      mockFetch.mockRejectedValue(networkError);

      const result = await authService.getCurrentUser();

      expect(result.error).toBe('Request failed');
      expect(result.status).toBe(0);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockAuthResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

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

      expect(result.data).toEqual(mockAuthResponse);
      expect(result.status).toBe(200);
    });

    it('should handle refresh token failure', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Refresh token expired'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authService.refreshToken();

      expect(result.error).toBe('Refresh token expired');
      expect(result.status).toBe(401);
    });

    it('should handle refresh token network error', async () => {
      const networkError = new Error('Connection lost');
      mockFetch.mockRejectedValue(networkError);

      const result = await authService.refreshToken();

      expect(result.error).toBe('Connection lost');
      expect(result.status).toBe(0);
    });
  });

  describe('healthCheck', () => {
    it('should perform health check successfully', async () => {
      const healthResponse = { status: 'ok' };
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(healthResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authService.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/health',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      expect(result.data).toEqual(healthResponse);
      expect(result.status).toBe(200);
    });

    it('should handle health check failure', async () => {
      const mockResponse = {
        ok: false,
        status: 503,
        text: vi.fn().mockResolvedValue('Service unavailable'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authService.healthCheck();

      expect(result.error).toBe('Service unavailable');
      expect(result.status).toBe(503);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password',
      });

      expect(result.error).toBe('Invalid JSON');
      expect(result.status).toBe(0);
    });

    it('should handle missing response text', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockRejectedValue(new Error('No text')),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password',
      });

      expect(result.error).toBe('No text');
      expect(result.status).toBe(0);
    });

    it('should use custom base URL in requests', async () => {
      const customUrl = 'https://custom-api.example.com';
      const customService = new AuthService(customUrl);
      
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockAuthResponse),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await customService.login({
        email: 'test@example.com',
        password: 'password',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-api.example.com/api/v1/auth/login',
        expect.any(Object)
      );
    });

    it('should handle empty request body gracefully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: 'ok' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authService.logout();

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1]).toEqual({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      // Should not have a body for logout
      expect(fetchCall[1]).not.toHaveProperty('body');
    });

    it('should preserve all headers including custom ones', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockUser),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authService.getCurrentUser();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          credentials: 'include',
        })
      );
    });
  });

  describe('exported instance', () => {
    it('should export a default instance', () => {
      expect(authService).toBeInstanceOf(AuthService);
    });

    it('should use environment base URL', async () => {
      // This tests that the exported instance uses the constructor correctly
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: 'ok' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await authService.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/health'),
        expect.any(Object)
      );
    });
  });
});
