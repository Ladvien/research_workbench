import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AuthProvider, useAuthContext } from '../../src/contexts/AuthContext';
import React from 'react';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test component to interact with auth context
const TestComponent: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    checkAuth,
    clearError,
  } = useAuthContext();

  return (
    <div>
      <div data-testid="auth-state">
        {isLoading && <span>Loading</span>}
        {isAuthenticated ? (
          <span>Authenticated: {user?.username}</span>
        ) : (
          <span>Not Authenticated</span>
        )}
        {error && <span>Error: {error}</span>}
      </div>

      <button
        onClick={() =>
          login({ email: 'test@example.com', password: 'password' })
        }
      >
        Login
      </button>

      <button
        onClick={() =>
          register({
            email: 'test@example.com',
            username: 'testuser',
            password: 'password',
          })
        }
      >
        Register
      </button>

      <button onClick={() => logout()}>Logout</button>
      <button onClick={() => checkAuth()}>Check Auth</button>
      <button onClick={() => clearError()}>Clear Error</button>
    </div>
  );
};

const renderWithAuthProvider = () => {
  return render(
    <AuthProvider>
      <TestComponent />
    </AuthProvider>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial State', () => {
    it('should start with unauthenticated state', () => {
      // Mock the initial checkAuth call
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: () => Promise.resolve('Unauthorized'),
      });

      renderWithAuthProvider();

      expect(screen.getByText('Not Authenticated')).toBeInTheDocument();
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });

    it('should call checkAuth on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: () => Promise.resolve('Unauthorized'),
      });

      renderWithAuthProvider();

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:8080/api/v1/auth/me',
          expect.objectContaining({
            credentials: 'include',
          })
        );
      });
    });
  });

  describe('Login', () => {
    it('should successfully login user', async () => {
      const user = userEvent.setup();
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock initial checkAuth (unauthenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        // Mock login success
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockUser),
        });

      renderWithAuthProvider();

      await act(async () => {
        await user.click(screen.getByText('Login'));
      });

      await waitFor(() => {
        expect(screen.getByText(`Authenticated: ${mockUser.username}`)).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/auth/login',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password',
          }),
        })
      );
    });

    it('should handle login failure', async () => {
      const user = userEvent.setup();

      // Mock initial checkAuth (unauthenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        // Mock login failure
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: { get: () => null },
          text: () => Promise.resolve('Invalid credentials'),
        });

      renderWithAuthProvider();

      await act(async () => {
        await user.click(screen.getByText('Login'));
      });

      await waitFor(() => {
        expect(screen.getByText('Error: Invalid credentials')).toBeInTheDocument();
        expect(screen.getByText('Not Authenticated')).toBeInTheDocument();
      });
    });

    it('should show loading state during login', async () => {
      const user = userEvent.setup();

      // Mock initial checkAuth (unauthenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        // Mock slow login response
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    ok: false,
                    status: 401,
                    headers: { get: () => null },
                    text: () => Promise.resolve('Invalid credentials'),
                  }),
                100
              )
            )
        );

      renderWithAuthProvider();

      await act(async () => {
        await user.click(screen.getByText('Login'));
      });

      // Should show loading state
      expect(screen.getByText('Loading')).toBeInTheDocument();

      // Wait for login to complete
      await waitFor(() => {
        expect(screen.getByText('Error: Invalid credentials')).toBeInTheDocument();
      });
    });
  });

  describe('Register', () => {
    it('should successfully register user', async () => {
      const user = userEvent.setup();
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock initial checkAuth (unauthenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        // Mock register success
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockUser),
        });

      renderWithAuthProvider();

      await act(async () => {
        await user.click(screen.getByText('Register'));
      });

      await waitFor(() => {
        expect(screen.getByText(`Authenticated: ${mockUser.username}`)).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/auth/register',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            email: 'test@example.com',
            username: 'testuser',
            password: 'password',
          }),
        })
      );
    });

    it('should handle register failure', async () => {
      const user = userEvent.setup();

      // Mock initial checkAuth (unauthenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        // Mock register failure
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          headers: { get: () => null },
          text: () => Promise.resolve('Email already exists'),
        });

      renderWithAuthProvider();

      await act(async () => {
        await user.click(screen.getByText('Register'));
      });

      await waitFor(() => {
        expect(screen.getByText('Error: Email already exists')).toBeInTheDocument();
        expect(screen.getByText('Not Authenticated')).toBeInTheDocument();
      });
    });
  });

  describe('Logout', () => {
    it('should successfully logout user', async () => {
      const user = userEvent.setup();
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock initial checkAuth (authenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockUser),
        })
        // Mock logout success
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => null },
        });

      renderWithAuthProvider();

      await waitFor(() => {
        expect(screen.getByText(`Authenticated: ${mockUser.username}`)).toBeInTheDocument();
      });

      await act(async () => {
        await user.click(screen.getByText('Logout'));
      });

      await waitFor(() => {
        expect(screen.getByText('Not Authenticated')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );
    });

    it('should logout locally even if API call fails', async () => {
      const user = userEvent.setup();
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock initial checkAuth (authenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockUser),
        })
        // Mock logout API failure
        .mockRejectedValueOnce(new Error('Network error'));

      renderWithAuthProvider();

      await waitFor(() => {
        expect(screen.getByText(`Authenticated: ${mockUser.username}`)).toBeInTheDocument();
      });

      await act(async () => {
        await user.click(screen.getByText('Logout'));
      });

      // Should still logout locally
      await waitFor(() => {
        expect(screen.getByText('Not Authenticated')).toBeInTheDocument();
      });
    });
  });

  describe('Check Auth', () => {
    it('should detect authenticated user on checkAuth', async () => {
      const user = userEvent.setup();
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Mock initial checkAuth (unauthenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        // Mock manual checkAuth (authenticated)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockUser),
        });

      renderWithAuthProvider();

      expect(screen.getByText('Not Authenticated')).toBeInTheDocument();

      await act(async () => {
        await user.click(screen.getByText('Check Auth'));
      });

      await waitFor(() => {
        expect(screen.getByText(`Authenticated: ${mockUser.username}`)).toBeInTheDocument();
      });
    });

    it('should handle checkAuth failure', async () => {
      const user = userEvent.setup();

      // Mock initial checkAuth (unauthenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        // Mock manual checkAuth failure
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

      renderWithAuthProvider();

      expect(screen.getByText('Not Authenticated')).toBeInTheDocument();

      await act(async () => {
        await user.click(screen.getByText('Check Auth'));
      });

      await waitFor(() => {
        expect(screen.getByText('Not Authenticated')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should clear error when clearError is called', async () => {
      const user = userEvent.setup();

      // Mock initial checkAuth (unauthenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        // Mock login failure
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: { get: () => null },
          text: () => Promise.resolve('Invalid credentials'),
        });

      renderWithAuthProvider();

      // Trigger an error
      await act(async () => {
        await user.click(screen.getByText('Login'));
      });

      await waitFor(() => {
        expect(screen.getByText('Error: Invalid credentials')).toBeInTheDocument();
      });

      // Clear error
      await act(async () => {
        await user.click(screen.getByText('Clear Error'));
      });

      expect(screen.queryByText('Error: Invalid credentials')).not.toBeInTheDocument();
    });

    it('should handle network errors', async () => {
      const user = userEvent.setup();

      // Mock initial checkAuth (unauthenticated)
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        })
        // Mock network error
        .mockRejectedValueOnce(new Error('Network error'));

      renderWithAuthProvider();

      await act(async () => {
        await user.click(screen.getByText('Login'));
      });

      await waitFor(() => {
        expect(screen.getByText('Error: Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Context Provider', () => {
    it('should throw error when used outside provider', () => {
      // Temporarily suppress console.error for this test
      const originalError = console.error;
      console.error = vi.fn();

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuthContext must be used within an AuthProvider');

      console.error = originalError;
    });
  });
});