import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth, usePermission, useUser, useAuthState } from './useAuth';
import { useAuthContext } from '../contexts/AuthContext';
import type { AuthContextType } from '../contexts/AuthContext';

// Mock the auth context
vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: vi.fn(),
}));

const mockUseAuthContext = vi.mocked(useAuthContext);

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return auth context', () => {
    const mockAuthContext: AuthContextType = {
      user: { id: '1', username: 'test', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    };

    mockUseAuthContext.mockReturnValue(mockAuthContext);

    const { result } = renderHook(() => useAuth());

    expect(result.current).toBe(mockAuthContext);
    expect(mockUseAuthContext).toHaveBeenCalledOnce();
  });

  it('should handle null context gracefully', () => {
    mockUseAuthContext.mockReturnValue(null as any);

    const { result } = renderHook(() => useAuth());

    expect(result.current).toBeNull();
  });
});

describe('usePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false for unauthenticated user', () => {
    mockUseAuthContext.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => usePermission('create_conversations'));

    expect(result.current).toBe(false);
  });

  it('should return false when user is null', () => {
    mockUseAuthContext.mockReturnValue({
      user: null,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => usePermission('create_conversations'));

    expect(result.current).toBe(false);
  });

  it('should return true for valid permissions when authenticated', () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: '1', username: 'test', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const permissions = [
      'create_conversations',
      'delete_conversations',
      'edit_messages',
      'view_analytics',
      'upload_files',
    ];

    permissions.forEach(permission => {
      const { result } = renderHook(() => usePermission(permission));
      expect(result.current).toBe(true);
    });
  });

  it('should return false for invalid permissions', () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: '1', username: 'test', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => usePermission('invalid_permission'));

    expect(result.current).toBe(false);
  });
});

describe('useUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user info with helpers for authenticated user', () => {
    const mockUser = { id: '1', username: 'testuser', email: 'test@example.com' };
    mockUseAuthContext.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => useUser());

    expect(result.current).toEqual({
      user: mockUser,
      isAuthenticated: true,
      isAnonymous: false,
      displayName: 'testuser',
      initials: 'TE',
    });
  });

  it('should return email-based initials when no username', () => {
    const mockUser = { id: '1', username: '', email: 'test@example.com' };
    mockUseAuthContext.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => useUser());

    expect(result.current).toEqual({
      user: mockUser,
      isAuthenticated: true,
      isAnonymous: false,
      displayName: 'test@example.com',
      initials: 'TE',
    });
  });

  it('should return anonymous data for unauthenticated user', () => {
    mockUseAuthContext.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => useUser());

    expect(result.current).toEqual({
      user: null,
      isAuthenticated: false,
      isAnonymous: true,
      displayName: 'Anonymous',
      initials: 'AN',
    });
  });

  it('should handle user with undefined username and email', () => {
    const mockUser = { id: '1' } as any;
    mockUseAuthContext.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => useUser());

    expect(result.current).toEqual({
      user: mockUser,
      isAuthenticated: true,
      isAnonymous: false,
      displayName: 'Anonymous',
      initials: 'AN',
    });
  });
});

describe('useAuthState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return correct state for authenticated user', () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: '1', username: 'test', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => useAuthState());

    expect(result.current).toEqual({
      isAuthenticated: true,
      isLoading: false,
      isUnauthenticated: false,
      hasError: false,
      error: null,
      isAuthenticating: false,
      isReady: true,
    });
  });

  it('should return correct state for unauthenticated user', () => {
    mockUseAuthContext.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => useAuthState());

    expect(result.current).toEqual({
      isAuthenticated: false,
      isLoading: false,
      isUnauthenticated: true,
      hasError: false,
      error: null,
      isAuthenticating: false,
      isReady: true,
    });
  });

  it('should return correct state during loading', () => {
    mockUseAuthContext.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => useAuthState());

    expect(result.current).toEqual({
      isAuthenticated: false,
      isLoading: true,
      isUnauthenticated: false,
      hasError: false,
      error: null,
      isAuthenticating: true,
      isReady: false,
    });
  });

  it('should return correct state with error', () => {
    const error = 'Authentication failed';
    mockUseAuthContext.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });

    const { result } = renderHook(() => useAuthState());

    expect(result.current).toEqual({
      isAuthenticated: false,
      isLoading: false,
      isUnauthenticated: true,
      hasError: true,
      error,
      isAuthenticating: false,
      isReady: true,
    });
  });
});
