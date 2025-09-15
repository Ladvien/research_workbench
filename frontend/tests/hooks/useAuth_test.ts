import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth, usePermission, useUser, useAuthState } from '../../src/hooks/useAuth';
import { AuthProvider } from '../../src/contexts/AuthContext';
import React, { ReactNode } from 'react';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Wrapper component for tests
const AuthProviderWrapper = ({ children }: { children: ReactNode }) =>
  React.createElement(AuthProvider, null, children);

describe('useAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('useAuth', () => {
    it('should return auth context values', async () => {
      // Mock initial checkAuth (unauthenticated)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: () => Promise.resolve('Unauthorized'),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProviderWrapper,
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.user).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
      });

      expect(typeof result.current.login).toBe('function');
      expect(typeof result.current.register).toBe('function');
      expect(typeof result.current.logout).toBe('function');
      expect(typeof result.current.checkAuth).toBe('function');
      expect(typeof result.current.clearError).toBe('function');
    });

    it('should return authenticated state when user is logged in', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock checkAuth success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(mockUser),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProviderWrapper,
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('usePermission', () => {
    it('should return false for unauthenticated users', async () => {
      // Mock initial checkAuth (unauthenticated)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: () => Promise.resolve('Unauthorized'),
      });

      const { result } = renderHook(() => usePermission('create_conversations'), {
        wrapper: AuthProviderWrapper,
      });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it('should return true for standard permissions when authenticated', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const standardPermissions = [
        'create_conversations',
        'delete_conversations',
        'edit_messages',
        'view_analytics',
        'upload_files',
      ];

      for (const permission of standardPermissions) {
        // Mock checkAuth success
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockUser),
        });

        const { result } = renderHook(() => usePermission(permission), {
          wrapper: AuthProviderWrapper,
        });

        await waitFor(() => {
          expect(result.current).toBe(true);
        });
      }
    });

    it('should return false for unknown permissions', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock checkAuth success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(mockUser),
      });

      const { result } = renderHook(() => usePermission('unknown_permission'), {
        wrapper: AuthProviderWrapper,
      });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });
  });

  describe('useUser', () => {
    it('should return user information for authenticated users', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock checkAuth success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(mockUser),
      });

      const { result } = renderHook(() => useUser(), {
        wrapper: AuthProviderWrapper,
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.isAnonymous).toBe(false);
        expect(result.current.displayName).toBe('testuser');
        expect(result.current.initials).toBe('TE');
      });
    });

    it('should return anonymous information for unauthenticated users', async () => {
      // Mock initial checkAuth (unauthenticated)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: () => Promise.resolve('Unauthorized'),
      });

      const { result } = renderHook(() => useUser(), {
        wrapper: AuthProviderWrapper,
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.isAnonymous).toBe(true);
        expect(result.current.displayName).toBe('Anonymous');
        expect(result.current.initials).toBe('AN');
      });
    });

    it('should handle user with email but no username', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: '',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock checkAuth success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(mockUser),
      });

      const { result } = renderHook(() => useUser(), {
        wrapper: AuthProviderWrapper,
      });

      await waitFor(() => {
        expect(result.current.displayName).toBe('test@example.com');
        expect(result.current.initials).toBe('TE');
      });
    });
  });

  describe('useAuthState', () => {
    it('should return correct auth states for unauthenticated users', async () => {
      // Mock initial checkAuth (unauthenticated)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: () => Promise.resolve('Unauthorized'),
      });

      const { result } = renderHook(() => useAuthState(), {
        wrapper: AuthProviderWrapper,
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isUnauthenticated).toBe(true);
        expect(result.current.hasError).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.isAuthenticating).toBe(false);
        expect(result.current.isReady).toBe(true);
      });
    });

    it('should return correct auth states for authenticated users', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock checkAuth success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(mockUser),
      });

      const { result } = renderHook(() => useAuthState(), {
        wrapper: AuthProviderWrapper,
      });

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isUnauthenticated).toBe(false);
        expect(result.current.hasError).toBe(false);
        expect(result.current.error).toBeNull();
        expect(result.current.isAuthenticating).toBe(false);
        expect(result.current.isReady).toBe(true);
      });
    });
  });

  describe('Error Cases', () => {
    it('should throw error when hooks are used outside AuthProvider', () => {
      // Temporarily suppress console.error for these tests
      const originalError = console.error;
      console.error = vi.fn();

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuthContext must be used within an AuthProvider');

      expect(() => {
        renderHook(() => usePermission('test'));
      }).toThrow('useAuthContext must be used within an AuthProvider');

      expect(() => {
        renderHook(() => useUser());
      }).toThrow('useAuthContext must be used within an AuthProvider');

      expect(() => {
        renderHook(() => useAuthState());
      }).toThrow('useAuthContext must be used within an AuthProvider');

      console.error = originalError;
    });
  });
});