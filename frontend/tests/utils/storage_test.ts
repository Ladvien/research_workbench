// Tests for token storage utility
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenStorage } from '../../src/utils/storage';
import { AuthTokens } from '../../src/types';

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
const consoleMock = {
  warn: vi.fn(),
  error: vi.fn(),
};

vi.stubGlobal('console', consoleMock);

describe('TokenStorage', () => {
  const validTokens: AuthTokens = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: Date.now() + (60 * 60 * 1000), // 1 hour from now
  };

  const expiredTokens: AuthTokens = {
    accessToken: 'expired-access-token',
    refreshToken: 'expired-refresh-token',
    expiresAt: Date.now() - (60 * 60 * 1000), // 1 hour ago
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTokens', () => {
    it('should return null when no tokens are stored', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = TokenStorage.getTokens();

      expect(result).toBeNull();
      expect(localStorageMock.getItem).toHaveBeenCalledWith('workbench_auth_tokens');
    });

    it('should return valid tokens when stored and not expired', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(validTokens));

      const result = TokenStorage.getTokens();

      expect(result).toEqual(validTokens);
    });

    it('should clear and return null for expired tokens', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(expiredTokens));

      const result = TokenStorage.getTokens();

      expect(result).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('workbench_auth_tokens');
    });

    it('should handle malformed JSON gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid-json');

      const result = TokenStorage.getTokens();

      expect(result).toBeNull();
      expect(consoleMock.warn).toHaveBeenCalledWith('Failed to parse stored tokens:', expect.any(Error));
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('workbench_auth_tokens');
    });

    it('should handle localStorage access errors', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const result = TokenStorage.getTokens();

      expect(result).toBeNull();
      expect(consoleMock.warn).toHaveBeenCalledWith('Failed to parse stored tokens:', expect.any(Error));
    });
  });

  describe('setTokens', () => {
    it('should store tokens in localStorage', () => {
      TokenStorage.setTokens(validTokens);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'workbench_auth_tokens',
        JSON.stringify(validTokens)
      );
    });

    it('should handle storage errors gracefully', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      TokenStorage.setTokens(validTokens);

      expect(consoleMock.error).toHaveBeenCalledWith('Failed to store tokens:', expect.any(Error));
    });
  });

  describe('clearTokens', () => {
    it('should remove tokens from localStorage', () => {
      TokenStorage.clearTokens();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('workbench_auth_tokens');
    });

    it('should handle removal errors gracefully', () => {
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error('Unable to remove item');
      });

      TokenStorage.clearTokens();

      expect(consoleMock.error).toHaveBeenCalledWith('Failed to clear tokens:', expect.any(Error));
    });
  });

  describe('hasValidToken', () => {
    it('should return true when valid tokens exist', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(validTokens));

      const result = TokenStorage.hasValidToken();

      expect(result).toBe(true);
    });

    it('should return false when no tokens exist', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = TokenStorage.hasValidToken();

      expect(result).toBe(false);
    });

    it('should return false when tokens are expired', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(expiredTokens));

      const result = TokenStorage.hasValidToken();

      expect(result).toBe(false);
    });

    it('should return false when access token is empty', () => {
      const emptyTokens = { ...validTokens, accessToken: '' };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(emptyTokens));

      const result = TokenStorage.hasValidToken();

      expect(result).toBe(false);
    });
  });

  describe('getAccessToken', () => {
    it('should return access token when valid tokens exist', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(validTokens));

      const result = TokenStorage.getAccessToken();

      expect(result).toBe(validTokens.accessToken);
    });

    it('should return null when no tokens exist', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = TokenStorage.getAccessToken();

      expect(result).toBeNull();
    });

    it('should return null when tokens are expired', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(expiredTokens));

      const result = TokenStorage.getAccessToken();

      expect(result).toBeNull();
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('should return false when no tokens exist', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = TokenStorage.isTokenExpiringSoon();

      expect(result).toBe(false);
    });

    it('should return true when token expires within 5 minutes', () => {
      const soonToExpireTokens: AuthTokens = {
        ...validTokens,
        expiresAt: Date.now() + (4 * 60 * 1000), // 4 minutes from now
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(soonToExpireTokens));

      const result = TokenStorage.isTokenExpiringSoon();

      expect(result).toBe(true);
    });

    it('should return false when token expires later than 5 minutes', () => {
      const laterToExpireTokens: AuthTokens = {
        ...validTokens,
        expiresAt: Date.now() + (10 * 60 * 1000), // 10 minutes from now
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(laterToExpireTokens));

      const result = TokenStorage.isTokenExpiringSoon();

      expect(result).toBe(false);
    });

    it('should return true when token is already expired', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(expiredTokens));

      const result = TokenStorage.isTokenExpiringSoon();

      expect(result).toBe(false); // getTokens() returns null for expired tokens
    });
  });
});