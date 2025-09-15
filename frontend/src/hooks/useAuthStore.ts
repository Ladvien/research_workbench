// Zustand store for managing authentication state

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AuthState, AuthTokens, User, ApiResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Auth API functions
const authApi = {
  async login(email: string, password: string): Promise<ApiResponse<{ user: User; tokens?: AuthTokens }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include', // Important for HttpOnly cookies
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: errorText || `HTTP ${response.status}`,
          status: response.status,
        };
      }

      const data = await response.json();
      return {
        data,
        status: response.status,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Network error',
        status: 0,
      };
    }
  },

  async register(email: string, username: string, password: string): Promise<ApiResponse<{ user: User; tokens?: AuthTokens }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, username, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: errorText || `HTTP ${response.status}`,
          status: response.status,
        };
      }

      const data = await response.json();
      return {
        data,
        status: response.status,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Network error',
        status: 0,
      };
    }
  },

  async logout(): Promise<ApiResponse<void>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: errorText || `HTTP ${response.status}`,
          status: response.status,
        };
      }

      return {
        status: response.status,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Network error',
        status: 0,
      };
    }
  },

  async getCurrentUser(): Promise<ApiResponse<User>> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: errorText || `HTTP ${response.status}`,
          status: response.status,
        };
      }

      const data = await response.json();
      return {
        data,
        status: response.status,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Network error',
        status: 0,
      };
    }
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: null,
      tokens: null,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authApi.login(email, password);

          if (response.error) {
            set({
              error: response.error,
              isLoading: false,
              isAuthenticated: false,
              user: null,
              tokens: null
            });
            throw new Error(response.error);
          }

          if (response.data) {
            set({
              isAuthenticated: true,
              user: response.data.user,
              tokens: response.data.tokens || null,
              isLoading: false,
              error: null,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Login failed';
          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            user: null,
            tokens: null,
          });
          throw error;
        }
      },

      register: async (email: string, username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authApi.register(email, username, password);

          if (response.error) {
            set({
              error: response.error,
              isLoading: false,
              isAuthenticated: false,
              user: null,
              tokens: null
            });
            throw new Error(response.error);
          }

          if (response.data) {
            set({
              isAuthenticated: true,
              user: response.data.user,
              tokens: response.data.tokens || null,
              isLoading: false,
              error: null,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Registration failed';
          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            user: null,
            tokens: null,
          });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true, error: null });

        try {
          // Call backend logout endpoint to clear server session
          const response = await authApi.logout();

          // Clear auth state regardless of server response
          // (in case server is down but we still want to clear client state)
          set({
            isAuthenticated: false,
            user: null,
            tokens: null,
            isLoading: false,
            error: null,
          });

          // If server logout failed, show a warning but still clear client state
          if (response.error) {
            console.warn('Server logout failed:', response.error);
            // Don't throw error here as we've already cleared client state
          }
        } catch (error) {
          console.warn('Logout request failed:', error);
          // Still clear client state even if request failed
          set({
            isAuthenticated: false,
            user: null,
            tokens: null,
            isLoading: false,
            error: null,
          });
        }
      },

      refreshToken: async (): Promise<boolean> => {
        try {
          const response = await authApi.getCurrentUser();

          if (response.error) {
            // Token is invalid, clear auth state
            set({
              isAuthenticated: false,
              user: null,
              tokens: null,
              error: null,
            });
            return false;
          }

          if (response.data) {
            set({
              isAuthenticated: true,
              user: response.data,
              error: null,
            });
            return true;
          }

          return false;
        } catch (error) {
          set({
            isAuthenticated: false,
            user: null,
            tokens: null,
            error: null,
          });
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'workbench-auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        tokens: state.tokens,
        // Don't persist isLoading or error
      }),
    }
  )
);