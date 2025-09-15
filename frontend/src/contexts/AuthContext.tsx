import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { User, ApiResponse } from '../types';

// API Base URL - use empty string to leverage Vite proxy
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Auth request/response types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthUser extends User {
  // Additional auth-specific fields can be added here
}

// Auth state interface
export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// Auth actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: AuthUser }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CLEAR_ERROR' };

// Auth context interface
export interface AuthContextType extends AuthState {
  login: (credentials: LoginRequest) => Promise<boolean>;
  register: (userData: RegisterRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

// Initial state
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

// Auth reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'AUTH_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    case 'AUTH_LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth API functions
class AuthAPI {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const fullUrl = `${API_BASE_URL}${endpoint}`;
      console.log('AuthAPI: Making request to:', fullUrl, 'with options:', options);
      const response = await fetch(fullUrl, {
        credentials: 'include', // Include cookies for JWT
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      // Handle non-JSON responses (like logout success)
      const contentType = response.headers.get('content-type');

      if (!response.ok) {
        const errorText = await response.text();
        return {
          error: errorText || `HTTP ${response.status}`,
          status: response.status,
        };
      }

      // If response is empty or not JSON, return empty success response
      if (!contentType?.includes('application/json')) {
        return {
          data: {} as T,
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
  }

  async login(credentials: LoginRequest): Promise<ApiResponse<AuthUser>> {
    return this.request<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(userData: RegisterRequest): Promise<ApiResponse<AuthUser>> {
    return this.request<AuthUser>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.request<void>('/api/auth/logout', {
      method: 'POST',
    });
  }

  async getCurrentUser(): Promise<ApiResponse<AuthUser>> {
    return this.request<AuthUser>('/api/auth/me');
  }
}

// Auth provider component
export interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const authAPI = new AuthAPI();

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Auth methods
  const login = async (credentials: LoginRequest): Promise<boolean> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authAPI.login(credentials);

      if (response.error) {
        dispatch({ type: 'AUTH_FAILURE', payload: response.error });
        return false;
      }

      if (response.data) {
        // Backend returns { message: "Login successful", user: {...} }
        // Extract the user from the response
        const user = response.data.user || response.data;
        dispatch({ type: 'AUTH_SUCCESS', payload: user });
        return true;
      }

      dispatch({ type: 'AUTH_FAILURE', payload: 'Login failed: No user data received' });
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      dispatch({ type: 'AUTH_FAILURE', payload: errorMessage });
      return false;
    }
  };

  const register = async (userData: RegisterRequest): Promise<boolean> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authAPI.register(userData);

      if (response.error) {
        dispatch({ type: 'AUTH_FAILURE', payload: response.error });
        return false;
      }

      if (response.data) {
        // Backend returns { message: "Registration successful", user: {...} }
        // Extract the user from the response
        const user = response.data.user || response.data;
        dispatch({ type: 'AUTH_SUCCESS', payload: user });
        return true;
      }

      dispatch({ type: 'AUTH_FAILURE', payload: 'Registration failed: No user data received' });
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      dispatch({ type: 'AUTH_FAILURE', payload: errorMessage });
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    dispatch({ type: 'AUTH_START' });

    try {
      await authAPI.logout();
      // Always dispatch logout success, even if API call fails
      // This ensures user is logged out locally
      dispatch({ type: 'AUTH_LOGOUT' });
    } catch (error) {
      // Log error but still log out locally
      console.warn('Logout API call failed, but logging out locally:', error);
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  const checkAuth = async (): Promise<void> => {
    // Don't show loading state for initial auth check
    // This prevents flash of loading spinner on page load
    const isInitialCheck = !state.isAuthenticated && !state.user;

    if (!isInitialCheck) {
      dispatch({ type: 'AUTH_START' });
    }

    try {
      const response = await authAPI.getCurrentUser();

      if (response.error || !response.data) {
        dispatch({ type: 'AUTH_LOGOUT' });
        return;
      }

      dispatch({ type: 'AUTH_SUCCESS', payload: response.data });
    } catch (error) {
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const contextValue: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    checkAuth,
    clearError,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use auth context
export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};