import React, { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuthContext } from './AuthContext';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test component that uses the auth context
const TestComponent = ({ testId = 'test-component' }: { testId?: string }) => {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
  } = useAuthContext();

  return (
    <div data-testid={testId}>
      <div data-testid="auth-state">
        <span data-testid="is-authenticated">{isAuthenticated.toString()}</span>
        <span data-testid="is-loading">{isLoading.toString()}</span>
        <span data-testid="user-email">{user?.email || 'none'}</span>
        <span data-testid="error">{error || 'none'}</span>
      </div>
      <div data-testid="auth-actions">
        <button
          data-testid="login-btn"
          onClick={() => login({ email: 'test@example.com', password: 'password' })}
        >
          Login
        </button>
        <button
          data-testid="register-btn"
          onClick={() => register({ email: 'test@example.com', username: 'testuser', password: 'password' })}
        >
          Register
        </button>
        <button data-testid="logout-btn" onClick={() => logout()}>
          Logout
        </button>
        <button data-testid="clear-error-btn" onClick={() => clearError()}>
          Clear Error
        </button>
      </div>
    </div>
  );
};

const renderWithAuthProvider = (children: ReactNode) => {
  return render(<AuthProvider>{children}</AuthProvider>);
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubEnv('VITE_API_URL', '');
  });

  describe('Initial State', () => {
    it('renders with default state', () => {
      renderWithAuthProvider(<TestComponent />);

      expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
      expect(screen.getByTestId('user-email')).toHaveTextContent('none');
      expect(screen.getByTestId('error')).toHaveTextContent('none');
    });

    it('checks authentication on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/v1/auth/me', {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('clears error when clearError is called', async () => {
      const user = userEvent.setup();

      // Mock failed request to set error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ csrf_token: 'mock-csrf-token' }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid credentials',
      });

      renderWithAuthProvider(<TestComponent />);

      await user.click(screen.getByTestId('login-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Invalid credentials');
      });

      await user.click(screen.getByTestId('clear-error-btn'));

      expect(screen.getByTestId('error')).toHaveTextContent('none');
    });
  });

  describe('Hook Usage', () => {
    it('throws error when used outside AuthProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent testId="outside-provider" />);
      }).toThrow('useAuthContext must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });
});