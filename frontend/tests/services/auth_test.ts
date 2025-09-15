/**
 * Tests for auth service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AuthService,
  parseJWTToken,
  isTokenExpired,
  getTokenTimeToExpiry,
  type LoginRequest,
  type RegisterRequest,
  type AuthResponse,
  type JWTPayload
} from '../../src/services/auth';
import { tokenStorage } from '../../src/utils/storage';

// Mock tokenStorage
vi.mock('../../src/utils/storage', () => ({
  tokenStorage: {
    setToken: vi.fn(),
    getToken: vi.fn(),
    clearToken: vi.fn(),
    hasValidToken: vi.fn(),
    getTokenExpiry: vi.fn(),
    setUserData: vi.fn(),
    getUserData: vi.fn(),
    clearUserData: vi.fn(),
    setRefreshToken: vi.fn(),
    getRefreshToken: vi.fn(),
    clearRefreshToken: vi.fn(),
    clearAll: vi.fn(),
    isStorageAvailable: vi.fn(),
    getStorageType: vi.fn(() => 'localStorage')
  }
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Auth Service', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('JWT Token Utilities', () => {
    describe('parseJWTToken', () => {
      it('should parse valid JWT token', () => {
        // Mock JWT payload (base64 encoded)
        const payload: JWTPayload = {
          sub: '123',
          email: 'test@example.com',
          username: 'testuser',
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          iat: Math.floor(Date.now() / 1000),
        };

        const encodedPayload = btoa(JSON.stringify(payload));
        const mockToken = `header.${encodedPayload}.signature`;

        const parsed = parseJWTToken(mockToken);

        expect(parsed).toEqual(payload);
      });

      it('should return null for invalid token format', () => {
        const parsed = parseJWTToken('invalid.token');
        expect(parsed).toBeNull();
      });

      it('should return null for malformed payload', () => {
        const parsed = parseJWTToken('header.invalid_base64.signature');
        expect(parsed).toBeNull();
      });
    });

    describe('isTokenExpired', () => {
      it('should return false for valid token', () => {
        const payload = {
          sub: '123',
          email: 'test@example.com',
          username: 'testuser',
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          iat: Math.floor(Date.now() / 1000),
        };

        const encodedPayload = btoa(JSON.stringify(payload));
        const token = `header.${encodedPayload}.signature`;

        expect(isTokenExpired(token)).toBe(false);
      });

      it('should return true for expired token', () => {
        const payload = {
          sub: '123',
          email: 'test@example.com',
          username: 'testuser',
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
          iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        };

        const encodedPayload = btoa(JSON.stringify(payload));
        const token = `header.${encodedPayload}.signature`;

        expect(isTokenExpired(token)).toBe(true);
      });

      it('should return true for invalid token', () => {
        expect(isTokenExpired('invalid.token')).toBe(true);
      });
    });

    describe('getTokenTimeToExpiry', () => {
      it('should return correct time to expiry', () => {
        const expiryTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const payload = {
          sub: '123',
          email: 'test@example.com',
          username: 'testuser',
          exp: expiryTime,
          iat: Math.floor(Date.now() / 1000),
        };

        const encodedPayload = btoa(JSON.stringify(payload));
        const token = `header.${encodedPayload}.signature`;

        const timeToExpiry = getTokenTimeToExpiry(token);
        expect(timeToExpiry).toBeCloseTo(3600 * 1000, -2); // ~1 hour in milliseconds
      });

      it('should return 0 for expired token', () => {
        const payload = {
          sub: '123',
          email: 'test@example.com',
          username: 'testuser',
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
          iat: Math.floor(Date.now() / 1000) - 7200,
        };

        const encodedPayload = btoa(JSON.stringify(payload));
        const token = `header.${encodedPayload}.signature`;

        const timeToExpiry = getTokenTimeToExpiry(token);
        expect(timeToExpiry).toBe(0);
      });

      it('should return null for invalid token', () => {
        const timeToExpiry = getTokenTimeToExpiry('invalid.token');
        expect(timeToExpiry).toBeNull();
      });
    });
  });

  describe('AuthService', () => {
    const mockUser = {
      id: '123',
      email: 'test@example.com',
      username: 'testuser',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    };

    const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwiZXhwIjo5OTk5OTk5OTk5LCJpYXQiOjE2OTk5OTk5OTl9.signature';

    describe('login', () => {
      it('should login successfully with email', async () => {
        const loginRequest: LoginRequest = {
          email: 'test@example.com',
          password: 'password123'
        };

        const mockResponse: AuthResponse = {
          user: mockUser,
          token: mockToken,
          expires_at: new Date(Date.now() + 3600000).toISOString()
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse)
        });

        const result = await authService.login(loginRequest);

        expect(result).toEqual(mockResponse);
        expect(tokenStorage.setUserData).toHaveBeenCalledWith(mockUser);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:4512/api/auth/login',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(loginRequest)
          })
        );
      });

      it('should login successfully with username', async () => {
        const loginRequest: LoginRequest = {
          username: 'testuser',
          password: 'password123'
        };

        const mockResponse: AuthResponse = {
          user: mockUser
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse)
        });

        const result = await authService.login(loginRequest);

        expect(result).toEqual(mockResponse);
        expect(tokenStorage.setUserData).toHaveBeenCalledWith(mockUser);
      });

      it('should throw error on failed login', async () => {
        const loginRequest: LoginRequest = {
          email: 'test@example.com',
          password: 'wrongpassword'
        };

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ message: 'Invalid credentials' })
        });

        await expect(authService.login(loginRequest)).rejects.toThrow('Invalid credentials');
      });

      it('should handle network errors', async () => {
        const loginRequest: LoginRequest = {
          email: 'test@example.com',
          password: 'password123'
        };

        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        await expect(authService.login(loginRequest)).rejects.toThrow('Network error');
      });
    });

    describe('register', () => {
      it('should register successfully', async () => {
        const registerRequest: RegisterRequest = {
          email: 'test@example.com',
          username: 'testuser',
          password: 'password123'
        };

        const mockResponse: AuthResponse = {
          user: mockUser,
          token: mockToken
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse)
        });

        const result = await authService.register(registerRequest);

        expect(result).toEqual(mockResponse);
        expect(tokenStorage.setUserData).toHaveBeenCalledWith(mockUser);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:4512/api/auth/register',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(registerRequest)
          })
        );
      });

      it('should throw error on failed registration', async () => {
        const registerRequest: RegisterRequest = {
          email: 'test@example.com',
          username: 'testuser',
          password: 'password123'
        };

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ message: 'Email already exists' })
        });

        await expect(authService.register(registerRequest)).rejects.toThrow('Email already exists');
      });
    });

    describe('logout', () => {
      it('should logout successfully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true
        });

        await authService.logout();

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:4512/api/auth/logout',
          expect.objectContaining({
            method: 'POST',
            credentials: 'include'
          })
        );
        expect(tokenStorage.clearAll).toHaveBeenCalled();
      });

      it('should clear tokens even if API call fails', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        await authService.logout();

        expect(tokenStorage.clearAll).toHaveBeenCalled();
      });
    });

    describe('getCurrentUser', () => {
      it('should return stored user data if available', async () => {
        (tokenStorage.getUserData as any).mockReturnValue(mockUser);

        const result = await authService.getCurrentUser();

        expect(result).toEqual(mockUser);
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('should fetch user data from API if not stored', async () => {
        (tokenStorage.getUserData as any).mockReturnValue(null);
        (authService as any).getStoredToken = vi.fn().mockReturnValue(mockToken);

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockUser)
        });

        const result = await authService.getCurrentUser();

        expect(result).toEqual(mockUser);
        expect(tokenStorage.setUserData).toHaveBeenCalledWith(mockUser);
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:4512/api/auth/me',
          expect.objectContaining({
            credentials: 'include'
          })
        );
      });

      it('should handle 401 response by calling logout', async () => {
        (tokenStorage.getUserData as any).mockReturnValue(null);

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401
        });

        const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue();

        const result = await authService.getCurrentUser();

        expect(result).toBeNull();
        expect(logoutSpy).toHaveBeenCalled();
      });

      it('should return null on API failure', async () => {
        (tokenStorage.getUserData as any).mockReturnValue(null);

        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const result = await authService.getCurrentUser();

        expect(result).toBeNull();
      });
    });

    describe('isAuthenticated', () => {
      it('should return true for valid token', () => {
        (tokenStorage.getToken as any).mockReturnValue(mockToken);
        const isTokenValidSpy = vi.spyOn(authService, 'isTokenValid').mockReturnValue(true);

        const result = authService.isAuthenticated();

        expect(result).toBe(true);
        expect(isTokenValidSpy).toHaveBeenCalledWith(mockToken);
      });

      it('should return true for HttpOnly cookie scenario with stored user data', () => {
        (tokenStorage.getToken as any).mockReturnValue(null);
        (tokenStorage.getUserData as any).mockReturnValue(mockUser);

        const result = authService.isAuthenticated();

        expect(result).toBe(true);
      });

      it('should return false when no token and no user data', () => {
        (tokenStorage.getToken as any).mockReturnValue(null);
        (tokenStorage.getUserData as any).mockReturnValue(null);

        const result = authService.isAuthenticated();

        expect(result).toBe(false);
      });
    });

    describe('getAuthHeaders', () => {
      it('should return authorization header when valid token exists', () => {
        (authService as any).getStoredToken = vi.fn().mockReturnValue(mockToken);
        const isTokenValidSpy = vi.spyOn(authService, 'isTokenValid').mockReturnValue(true);

        const headers = authService.getAuthHeaders();

        expect(headers).toEqual({
          Authorization: `Bearer ${mockToken}`
        });
        expect(isTokenValidSpy).toHaveBeenCalledWith(mockToken);
      });

      it('should return empty headers when no valid token', () => {
        (authService as any).getStoredToken = vi.fn().mockReturnValue(null);

        const headers = authService.getAuthHeaders();

        expect(headers).toEqual({});
      });

      it('should return empty headers when token is invalid', () => {
        (authService as any).getStoredToken = vi.fn().mockReturnValue('invalid.token');
        const isTokenValidSpy = vi.spyOn(authService, 'isTokenValid').mockReturnValue(false);

        const headers = authService.getAuthHeaders();

        expect(headers).toEqual({});
        expect(isTokenValidSpy).toHaveBeenCalledWith('invalid.token');
      });
    });

    describe('handleAuthError', () => {
      it('should call logout on 401 error', () => {
        const logoutSpy = vi.spyOn(authService, 'logout').mockResolvedValue();

        authService.handleAuthError(401);

        expect(logoutSpy).toHaveBeenCalled();
      });

      it('should not call logout on non-401 errors', () => {
        const logoutSpy = vi.spyOn(authService, 'logout');

        authService.handleAuthError(400);
        authService.handleAuthError(500);

        expect(logoutSpy).not.toHaveBeenCalled();
      });
    });

    describe('getTokenInfo', () => {
      it('should return token information when token exists', () => {
        const expiryDate = new Date(Date.now() + 3600000);

        // Create a proper mock token with the right expiry
        const currentTime = Math.floor(Date.now() / 1000);
        const payload = {
          sub: '123',
          email: 'test@example.com',
          username: 'testuser',
          exp: currentTime + 3600, // 1 hour from now
          iat: currentTime,
        };
        const encodedPayload = btoa(JSON.stringify(payload));
        const properMockToken = `header.${encodedPayload}.signature`;

        (authService as any).getStoredToken = vi.fn().mockReturnValue(properMockToken);
        (tokenStorage.getTokenExpiry as any).mockReturnValue(expiryDate);

        const tokenInfo = authService.getTokenInfo();

        expect(tokenInfo.token).toBe(properMockToken);
        expect(tokenInfo.expiresAt).toBe(expiryDate);
        expect(tokenInfo.timeToExpiry).toBeCloseTo(3600000, -2);
      });

      it('should return null values when no token exists', () => {
        (authService as any).getStoredToken = vi.fn().mockReturnValue(null);

        const tokenInfo = authService.getTokenInfo();

        expect(tokenInfo.token).toBeNull();
        expect(tokenInfo.expiresAt).toBeNull();
        expect(tokenInfo.timeToExpiry).toBeNull();
      });
    });

    describe('token refresh', () => {
      it('should schedule token refresh on login', async () => {
        const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const payload = {
          sub: '123',
          email: 'test@example.com',
          username: 'testuser',
          exp: futureTime,
          iat: Math.floor(Date.now() / 1000),
        };

        const encodedPayload = btoa(JSON.stringify(payload));
        const tokenWithExpiry = `header.${encodedPayload}.signature`;

        const loginRequest: LoginRequest = {
          email: 'test@example.com',
          password: 'password123'
        };

        const mockResponse: AuthResponse = {
          user: mockUser,
          token: tokenWithExpiry
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse)
        });

        await authService.login(loginRequest);

        // Verify timeout was scheduled
        expect(vi.getTimerCount()).toBeGreaterThan(0);
      });
    });

    describe('cleanup', () => {
      it('should clear refresh timeout', () => {
        // Set up a timeout
        (authService as any).refreshTimeout = setTimeout(() => {}, 1000);

        authService.cleanup();

        expect(vi.getTimerCount()).toBe(0);
      });
    });
  });
});