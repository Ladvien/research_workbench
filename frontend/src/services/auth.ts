/**
 * Authentication service for JWT token management and user authentication
 */

import { tokenStorage } from '../utils/storage';
import { User } from '../types';

// Auth types
export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token?: string; // JWT token (if not HttpOnly cookie)
  expires_at?: string; // Token expiration timestamp
}

export interface AuthError {
  message: string;
  status?: number;
  code?: string;
}

// JWT Token payload structure
export interface JWTPayload {
  sub: string; // user ID
  email: string;
  username: string;
  exp: number; // expiration timestamp
  iat: number; // issued at timestamp
  iss?: string; // issuer
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4512';

/**
 * Parse JWT token to extract payload (client-side verification for UI purposes only)
 */
export function parseJWTToken(token: string): JWTPayload | null {
  try {
    // Split JWT token into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode base64 payload
    const payload = atob(parts[1]);
    return JSON.parse(payload) as JWTPayload;
  } catch (error) {
    console.error('Failed to parse JWT token:', error);
    return null;
  }
}

/**
 * Check if JWT token is expired
 */
export function isTokenExpired(token: string): boolean {
  const payload = parseJWTToken(token);
  if (!payload) {
    return true;
  }

  // Check expiration (exp is in seconds, Date.now() is in milliseconds)
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
}

/**
 * Get time until token expires (in milliseconds)
 */
export function getTokenTimeToExpiry(token: string): number | null {
  const payload = parseJWTToken(token);
  if (!payload) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const timeLeft = payload.exp - now;
  return timeLeft > 0 ? timeLeft * 1000 : 0; // Convert to milliseconds
}

/**
 * Authentication service class
 */
export class AuthService {
  private refreshTimeout: NodeJS.Timeout | null = null;

  constructor() {
    // Check for existing token and set up refresh timer
    this.initializeAuth();
  }

  /**
   * Initialize authentication state from stored token
   */
  private initializeAuth(): void {
    const token = this.getStoredToken();
    if (token && this.isTokenValid(token)) {
      this.scheduleTokenRefresh(token);
    } else if (token) {
      // Token exists but is invalid, clear it
      this.logout();
    }
  }

  /**
   * Login user with email/username and password
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include HttpOnly cookies
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Login failed: ${response.status}`);
      }

      const data: AuthResponse = await response.json();

      // Store token if provided (for non-HttpOnly implementation)
      if (data.token) {
        this.storeToken(data.token, data.expires_at);
        this.scheduleTokenRefresh(data.token);
      }

      // Store user data
      if (data.user) {
        tokenStorage.setUserData(data.user);
      }

      return data;
    } catch (error) {
      const authError: AuthError = {
        message: error instanceof Error ? error.message : 'Login failed',
        status: error instanceof Error && 'status' in error ? (error as any).status : undefined,
      };
      throw authError;
    }
  }

  /**
   * Register new user
   */
  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include HttpOnly cookies
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Registration failed: ${response.status}`);
      }

      const data: AuthResponse = await response.json();

      // Store token if provided
      if (data.token) {
        this.storeToken(data.token, data.expires_at);
        this.scheduleTokenRefresh(data.token);
      }

      // Store user data
      if (data.user) {
        tokenStorage.setUserData(data.user);
      }

      return data;
    } catch (error) {
      const authError: AuthError = {
        message: error instanceof Error ? error.message : 'Registration failed',
        status: error instanceof Error && 'status' in error ? (error as any).status : undefined,
      };
      throw authError;
    }
  }

  /**
   * Logout user and clear all auth data
   */
  async logout(): Promise<void> {
    try {
      // Clear refresh timeout
      if (this.refreshTimeout) {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = null;
      }

      // Call backend logout endpoint to clear HttpOnly cookies
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with client-side cleanup even if API call fails
    } finally {
      // Clear all stored auth data
      this.clearTokens();
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<User | null> {
    // First check if we have user data stored
    const storedUser = tokenStorage.getUserData();
    if (storedUser) {
      return storedUser;
    }

    // If no stored user data, try to fetch from API
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include', // Include HttpOnly cookies
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          this.logout();
          return null;
        }
        throw new Error(`Failed to get user: ${response.status}`);
      }

      const user: User = await response.json();

      // Store user data for future use
      tokenStorage.setUserData(user);
      return user;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getStoredToken();
    if (!token) {
      // If no stored token, check if we have user data (HttpOnly cookie scenario)
      return tokenStorage.getUserData() !== null;
    }

    return this.isTokenValid(token);
  }

  /**
   * Get stored JWT token
   */
  getStoredToken(): string | null {
    return tokenStorage.getToken();
  }

  /**
   * Check if token is valid (exists and not expired)
   */
  isTokenValid(token?: string): boolean {
    const authToken = token || this.getStoredToken();
    if (!authToken) {
      return false;
    }

    return !isTokenExpired(authToken);
  }

  /**
   * Get authorization headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    const token = this.getStoredToken();
    if (token && this.isTokenValid(token)) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Store JWT token with expiry
   */
  private storeToken(token: string, expiresAt?: string): void {
    try {
      let expiryDate: Date | undefined;

      if (expiresAt) {
        expiryDate = new Date(expiresAt);
      } else {
        // Parse expiry from token
        const payload = parseJWTToken(token);
        if (payload?.exp) {
          expiryDate = new Date(payload.exp * 1000); // Convert from seconds to milliseconds
        }
      }

      tokenStorage.setToken(token, expiryDate);
    } catch (error) {
      console.error('Failed to store token:', error);
      throw new Error('Failed to store authentication token');
    }
  }

  /**
   * Clear all authentication tokens and data
   */
  private clearTokens(): void {
    tokenStorage.clearAll();
  }

  /**
   * Schedule automatic token refresh before expiry
   */
  private scheduleTokenRefresh(token: string): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    const timeToExpiry = getTokenTimeToExpiry(token);
    if (!timeToExpiry || timeToExpiry <= 0) {
      return;
    }

    // Refresh 5 minutes before expiry, or halfway if token expires sooner
    const refreshTime = Math.min(timeToExpiry - 5 * 60 * 1000, timeToExpiry / 2);

    if (refreshTime > 0) {
      this.refreshTimeout = setTimeout(() => {
        this.refreshToken();
      }, refreshTime);
    }
  }

  /**
   * Refresh JWT token (if refresh endpoint is available)
   */
  private async refreshToken(): Promise<void> {
    try {
      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) {
        // No refresh token, user needs to login again
        this.logout();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        // Refresh failed, user needs to login again
        this.logout();
        return;
      }

      const data: AuthResponse = await response.json();

      if (data.token) {
        this.storeToken(data.token, data.expires_at);
        this.scheduleTokenRefresh(data.token);
      }

      if (data.user) {
        tokenStorage.setUserData(data.user);
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.logout();
    }
  }

  /**
   * Handle API response for authentication errors
   */
  handleAuthError(status: number): void {
    if (status === 401) {
      // Unauthorized - token expired or invalid
      this.logout();
    }
  }

  /**
   * Get token expiry information
   */
  getTokenInfo(): { token: string | null; expiresAt: Date | null; timeToExpiry: number | null } {
    const token = this.getStoredToken();
    const expiresAt = token ? tokenStorage.getTokenExpiry() : null;
    const timeToExpiry = token ? getTokenTimeToExpiry(token) : null;

    return {
      token,
      expiresAt,
      timeToExpiry,
    };
  }

  /**
   * Cleanup method for component unmount
   */
  cleanup(): void {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
  }
}

// Default auth service instance
export const authService = new AuthService();

// Helper functions for common operations
export const auth = {
  /**
   * Login user
   */
  login: (credentials: LoginRequest) => authService.login(credentials),

  /**
   * Register user
   */
  register: (userData: RegisterRequest) => authService.register(userData),

  /**
   * Logout user
   */
  logout: () => authService.logout(),

  /**
   * Get current user
   */
  getCurrentUser: () => authService.getCurrentUser(),

  /**
   * Check if authenticated
   */
  isAuthenticated: () => authService.isAuthenticated(),

  /**
   * Get auth headers for API requests
   */
  getAuthHeaders: () => authService.getAuthHeaders(),

  /**
   * Get stored token
   */
  getToken: () => authService.getStoredToken(),

  /**
   * Check if token is valid
   */
  isTokenValid: (token?: string) => authService.isTokenValid(token),

  /**
   * Handle auth errors from API responses
   */
  handleAuthError: (status: number) => authService.handleAuthError(status),

  /**
   * Get token information
   */
  getTokenInfo: () => authService.getTokenInfo(),
};