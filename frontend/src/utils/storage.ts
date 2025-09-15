// Token storage utilities for handling JWT tokens
import { AuthTokens } from '../types';

const TOKEN_STORAGE_KEY = 'workbench_auth_tokens';

export class TokenStorage {
  /**
   * Get stored auth tokens from localStorage
   */
  static getTokens(): AuthTokens | null {
    try {
      const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!stored) return null;

      const tokens: AuthTokens = JSON.parse(stored);

      // Check if token is expired
      if (tokens.expiresAt <= Date.now()) {
        this.clearTokens();
        return null;
      }

      return tokens;
    } catch (error) {
      console.warn('Failed to parse stored tokens:', error);
      this.clearTokens();
      return null;
    }
  }

  /**
   * Store auth tokens in localStorage
   */
  static setTokens(tokens: AuthTokens): void {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
    } catch (error) {
      console.error('Failed to store tokens:', error);
    }
  }

  /**
   * Clear stored auth tokens
   */
  static clearTokens(): void {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }

  /**
   * Check if we have a valid access token
   */
  static hasValidToken(): boolean {
    const tokens = this.getTokens();
    return tokens !== null && tokens.accessToken.length > 0;
  }

  /**
   * Get just the access token string
   */
  static getAccessToken(): string | null {
    const tokens = this.getTokens();
    return tokens?.accessToken || null;
  }

  /**
   * Check if token is close to expiring (within 5 minutes)
   */
  static isTokenExpiringSoon(): boolean {
    const tokens = this.getTokens();
    if (!tokens) return false;

    const fiveMinutes = 5 * 60 * 1000;
    return tokens.expiresAt - Date.now() < fiveMinutes;
  }
}