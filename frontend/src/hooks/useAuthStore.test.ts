import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from './useAuthStore';
import type { User, AuthTokens, ApiResponse } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock console methods
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('useAuthStore', () => {
  const mockUser: User = {
    id: '1',
    email: 'test@example.com',
    username: 'testuser',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  const mockTokens: AuthTokens = {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-456',
    expiresAt: Date.now() + 3600000, // 1 hour from now
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    mockFetch.mockClear();
    
    // Reset store state
    useAuthStore.getState().logout();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useAuthStore());

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.tokens).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ user: mockUser, tokens: mockTokens }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
          credentials: 'include',
        }
      );

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.tokens).toEqual(mockTokens);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle login without tokens', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ user: mockUser }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.tokens).toBeNull();
    });

    it('should handle login HTTP error', async () => {
      const errorMessage = 'Invalid credentials';
      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue(errorMessage),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await expect(result.current.login('test@example.com', 'wrongpassword'))
          .rejects.toThrow(errorMessage);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.tokens).toBeNull();
      expect(result.current.error).toBe(errorMessage);
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle network error during login', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await expect(result.current.login('test@example.com', 'password123'))
          .rejects.toThrow('Network error');
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBe('Network error');
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle non-Error exceptions during login', async () => {
      mockFetch.mockRejectedValue('String error');

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await expect(result.current.login('test@example.com', 'password123'))
          .rejects.toThrow('Login failed');
      });

      expect(result.current.error).toBe('Login failed');
    });

    it('should set loading state correctly during login', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      mockFetch.mockReturnValue(promise);

      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.login('test@example.com', 'password123');
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();

      await act(async () => {
        resolvePromise!({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ user: mockUser }),
        });
        await promise;
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('register', () => {
    it('should register successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ user: mockUser, tokens: mockTokens }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.register('test@example.com', 'testuser', 'password123');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email: 'test@example.com', 
            username: 'testuser',
            password: 'password123' 
          }),
          credentials: 'include',
        }
      );

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.tokens).toEqual(mockTokens);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle registration HTTP error', async () => {
      const errorMessage = 'Email already exists';
      const mockResponse = {
        ok: false,
        status: 409,
        text: vi.fn().mockResolvedValue(errorMessage),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await expect(result.current.register('test@example.com', 'testuser', 'password123'))
          .rejects.toThrow(errorMessage);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBe(errorMessage);
    });

    it('should handle network error during registration', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await expect(result.current.register('test@example.com', 'testuser', 'password123'))
          .rejects.toThrow('Network error');
      });

      expect(result.current.error).toBe('Network error');
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      // First set authenticated state
      act(() => {
        useAuthStore.setState({
          isAuthenticated: true,
          user: mockUser,
          tokens: mockTokens,
        });
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/auth/logout',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.tokens).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should clear client state even when server logout fails', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server error'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      // First set authenticated state
      act(() => {
        useAuthStore.setState({
          isAuthenticated: true,
          user: mockUser,
          tokens: mockTokens,
        });
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.tokens).toBeNull();
      expect(mockConsoleWarn).toHaveBeenCalledWith('Server logout failed:', 'Server error');
    });

    it('should clear client state even when network request fails', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      const { result } = renderHook(() => useAuthStore());

      // First set authenticated state
      act(() => {
        useAuthStore.setState({
          isAuthenticated: true,
          user: mockUser,
          tokens: mockTokens,
        });
      });

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.tokens).toBeNull();
      expect(mockConsoleWarn).toHaveBeenCalledWith('Logout request failed:', networkError);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockUser),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      let refreshResult: boolean;
      await act(async () => {
        refreshResult = await result.current.refreshToken();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/auth/me',
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }
      );

      expect(refreshResult!).toBe(true);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.error).toBeNull();
    });

    it('should handle refresh token failure and clear auth state', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      // Set initial authenticated state
      act(() => {
        useAuthStore.setState({
          isAuthenticated: true,
          user: mockUser,
          tokens: mockTokens,
        });
      });

      let refreshResult: boolean;
      await act(async () => {
        refreshResult = await result.current.refreshToken();
      });

      expect(refreshResult!).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.tokens).toBeNull();
    });

    it('should handle network error during token refresh', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      const { result } = renderHook(() => useAuthStore());

      let refreshResult: boolean;
      await act(async () => {
        refreshResult = await result.current.refreshToken();
      });

      expect(refreshResult!).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.tokens).toBeNull();
    });

    it('should return false when no data is returned', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(null),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      let refreshResult: boolean;
      await act(async () => {
        refreshResult = await result.current.refreshToken();
      });

      expect(refreshResult!).toBe(false);
    });
  });

  describe('clearError', () => {
    it('should clear error state', () => {
      const { result } = renderHook(() => useAuthStore());

      // Set error state
      act(() => {
        useAuthStore.setState({ error: 'Some error' });
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('persistence', () => {
    it('should persist auth state to localStorage', () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        useAuthStore.setState({
          isAuthenticated: true,
          user: mockUser,
          tokens: mockTokens,
          isLoading: true, // Should not be persisted
          error: 'Some error', // Should not be persisted
        });
      });

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should restore auth state from localStorage', () => {
      const persistedState = {
        isAuthenticated: true,
        user: mockUser,
        tokens: mockTokens,
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        state: persistedState,
        version: 0,
      }));

      const { result } = renderHook(() => useAuthStore());

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.tokens).toEqual(mockTokens);
      // Non-persisted fields should have default values
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('environment configuration', () => {
    it('should use custom API URL from environment', async () => {
      // Mock environment variable
      const originalEnv = import.meta.env.VITE_API_URL;
      (import.meta.env as any).VITE_API_URL = 'https://custom-api.example.com';

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ user: mockUser }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-api.example.com/api/v1/auth/login',
        expect.any(Object)
      );

      // Restore original environment
      (import.meta.env as any).VITE_API_URL = originalEnv;
    });
  });

  describe('edge cases', () => {
    it('should handle empty response text', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await expect(result.current.login('test@example.com', 'password123'))
          .rejects.toThrow('HTTP 500');
      });

      expect(result.current.error).toBe('HTTP 500');
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await expect(result.current.login('test@example.com', 'password123'))
          .rejects.toThrow('Invalid JSON');
      });
    });

    it('should handle missing response properties gracefully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}), // Empty response
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('test@example.com', 'password123');
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toBeUndefined();
      expect(result.current.tokens).toBeNull();
    });
  });
});
