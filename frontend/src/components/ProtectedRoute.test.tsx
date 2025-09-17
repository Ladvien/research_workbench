import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ProtectedRoute,
  AuthGuard,
  AuthenticatedOnly,
  UnauthenticatedOnly,
} from './ProtectedRoute';
import { useAuth } from '../hooks/useAuth';

// Mock the useAuth hook
vi.mock('../hooks/useAuth');
const mockUseAuth = vi.mocked(useAuth);

describe('ProtectedRoute', () => {
  const TestComponent = () => <div>Protected Content</div>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Checking authentication...')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('shows custom loading component when provided', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute loadingComponent={<div>Custom Loading</div>}>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Custom Loading')).toBeInTheDocument();
      expect(screen.queryByText('Checking authentication...')).not.toBeInTheDocument();
    });

    it('skips loading when showLoading is false', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute showLoading={false}>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.queryByText('Checking authentication...')).not.toBeInTheDocument();
      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    });
  });

  describe('Authentication', () => {
    it('renders children when authenticated', () => {
      mockUseAuth.mockReturnValue({
        user: { id: '1', email: 'test@example.com', username: 'test' },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('shows authentication required when not authenticated', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
      expect(screen.getByText('Please log in to access this content.')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('shows custom fallback when provided and not authenticated', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute fallback={<div>Custom Fallback</div>}>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Custom Fallback')).toBeInTheDocument();
      expect(screen.queryByText('Authentication Required')).not.toBeInTheDocument();
    });

    it('shows error message when authentication error exists', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'Authentication failed',
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    });

    it('handles refresh button click', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      // Mock window.location.reload
      const mockReload = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true,
      });

      render(
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      );

      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      expect(mockReload).toHaveBeenCalled();
    });

    it('allows access when requireAuth is false', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute requireAuth={false}>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('Permission Checks', () => {
    const mockUser = { id: '1', email: 'test@example.com', username: 'test' };

    it('allows access with basic permissions', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute permission="create_conversations">
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('denies access with admin permission for regular user', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute permission="admin_access">
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText("You don't have permission to access this content.")).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('allows access with admin permission for admin user', () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, role: 'admin' },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute permission="admin_access">
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('allows access with admin permission for lolzlab email', () => {
      mockUseAuth.mockReturnValue({
        user: { ...mockUser, email: 'admin@lolzlab.com' },
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute permission="admin_access">
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('denies access with unknown permission', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute permission="unknown_permission">
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    it('shows custom fallback for permission denial', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      });

      render(
        <ProtectedRoute
          permission="admin_access"
          fallback={<div>Permission Denied Fallback</div>}
        >
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Permission Denied Fallback')).toBeInTheDocument();
      expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    });
  });
});

describe('AuthGuard', () => {
  const TestComponent = () => <div>Guarded Content</div>;

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com', username: 'test' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    });

    render(
      <AuthGuard>
        <TestComponent />
      </AuthGuard>
    );

    expect(screen.getByText('Guarded Content')).toBeInTheDocument();
  });

  it('shows authentication required when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    });

    render(
      <AuthGuard>
        <TestComponent />
      </AuthGuard>
    );

    expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    expect(screen.queryByText('Guarded Content')).not.toBeInTheDocument();
  });

  it('respects permission prop', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com', username: 'test' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    });

    render(
      <AuthGuard permission="admin_access">
        <TestComponent />
      </AuthGuard>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByText('Guarded Content')).not.toBeInTheDocument();
  });
});

describe('AuthenticatedOnly', () => {
  const TestComponent = () => <div>Authenticated Content</div>;

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com', username: 'test' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    });

    render(
      <AuthenticatedOnly>
        <TestComponent />
      </AuthenticatedOnly>
    );

    expect(screen.getByText('Authenticated Content')).toBeInTheDocument();
  });

  it('renders nothing when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    });

    const { container } = render(
      <AuthenticatedOnly>
        <TestComponent />
      </AuthenticatedOnly>
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Authenticated Content')).not.toBeInTheDocument();
  });
});

describe('UnauthenticatedOnly', () => {
  const TestComponent = () => <div>Unauthenticated Content</div>;

  it('renders children when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    });

    render(
      <UnauthenticatedOnly>
        <TestComponent />
      </UnauthenticatedOnly>
    );

    expect(screen.getByText('Unauthenticated Content')).toBeInTheDocument();
  });

  it('renders nothing when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com', username: 'test' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      checkAuth: vi.fn(),
    });

    const { container } = render(
      <UnauthenticatedOnly>
        <TestComponent />
      </UnauthenticatedOnly>
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Unauthenticated Content')).not.toBeInTheDocument();
  });
});
