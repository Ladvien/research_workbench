/**
 * Tests for storage utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SecureStorage,
  tokenStorage,
  getAvailableStorage,
  getStorageInstance,
  STORAGE_KEYS,
  type StorageType
} from '../../src/utils/storage';

// Mock localStorage and sessionStorage
const createMockStorage = () => {
  let store: { [key: string]: string } = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    })
  };
};

describe('Storage Utils', () => {
  let mockLocalStorage: ReturnType<typeof createMockStorage>;
  let mockSessionStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockLocalStorage = createMockStorage();
    mockSessionStorage = createMockStorage();

    // Mock window.localStorage and window.sessionStorage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true
    });

    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAvailableStorage', () => {
    it('should return localStorage when available', () => {
      const storageType = getAvailableStorage();
      expect(storageType).toBe('localStorage');
    });

    it('should fall back to sessionStorage when localStorage fails', () => {
      // Make localStorage throw an error
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const storageType = getAvailableStorage();
      expect(storageType).toBe('sessionStorage');
    });

    it('should fall back to memory when both storages fail', () => {
      // Make both storages throw errors
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });
      mockSessionStorage.setItem.mockImplementation(() => {
        throw new Error('sessionStorage not available');
      });

      const storageType = getAvailableStorage();
      expect(storageType).toBe('memory');
    });
  });

  describe('getStorageInstance', () => {
    it('should return localStorage instance when specified', () => {
      const storage = getStorageInstance('localStorage');
      expect(storage).toBe(window.localStorage);
    });

    it('should return sessionStorage instance when specified', () => {
      const storage = getStorageInstance('sessionStorage');
      expect(storage).toBe(window.sessionStorage);
    });

    it('should return memory storage instance when specified', () => {
      const storage = getStorageInstance('memory');
      expect(storage).not.toBe(window.localStorage);
      expect(storage).not.toBe(window.sessionStorage);
    });
  });

  describe('SecureStorage', () => {
    let secureStorage: SecureStorage;

    beforeEach(() => {
      secureStorage = new SecureStorage('localStorage');
    });

    describe('setItem and getItem', () => {
      it('should store and retrieve string values', () => {
        const key = 'test_key';
        const value = 'test_value';

        secureStorage.setItem(key, value);
        const retrieved = secureStorage.getItem(key);

        expect(retrieved).toBe(value);
        expect(mockLocalStorage.setItem).toHaveBeenCalled();
      });

      it('should store and retrieve object values', () => {
        const key = 'test_object';
        const value = { name: 'test', id: 123 };

        secureStorage.setItem(key, value);
        const retrieved = secureStorage.getItem(key);

        expect(retrieved).toEqual(value);
      });

      it('should handle expiry dates', () => {
        const key = 'test_expiry';
        const value = 'test_value';
        const futureDate = new Date(Date.now() + 60000); // 1 minute from now

        secureStorage.setItem(key, value, futureDate);
        const retrieved = secureStorage.getItem(key);

        expect(retrieved).toBe(value);
      });

      it('should return null for expired items', () => {
        const key = 'test_expired';
        const value = 'test_value';
        const pastDate = new Date(Date.now() - 60000); // 1 minute ago

        secureStorage.setItem(key, value, pastDate);
        const retrieved = secureStorage.getItem(key);

        expect(retrieved).toBeNull();
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(key);
      });

      it('should return null for non-existent items', () => {
        const retrieved = secureStorage.getItem('non_existent');
        expect(retrieved).toBeNull();
      });

      it('should handle corrupted data gracefully', () => {
        const key = 'corrupted_key';
        mockLocalStorage.getItem.mockReturnValue('invalid_json');

        const retrieved = secureStorage.getItem(key);
        expect(retrieved).toBeNull();
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(key);
      });
    });

    describe('removeItem', () => {
      it('should remove items from storage', () => {
        const key = 'test_remove';
        secureStorage.setItem(key, 'test_value');
        secureStorage.removeItem(key);

        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(key);
        expect(secureStorage.getItem(key)).toBeNull();
      });
    });

    describe('clear', () => {
      it('should clear only workbench-specific keys', () => {
        secureStorage.clear();

        Object.values(STORAGE_KEYS).forEach(key => {
          expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(key);
        });
      });
    });

    describe('hasItem', () => {
      it('should return true for existing valid items', () => {
        const key = 'test_has';
        secureStorage.setItem(key, 'test_value');

        expect(secureStorage.hasItem(key)).toBe(true);
      });

      it('should return false for non-existent items', () => {
        expect(secureStorage.hasItem('non_existent')).toBe(false);
      });

      it('should return false for expired items', () => {
        const key = 'test_expired';
        const pastDate = new Date(Date.now() - 60000);
        secureStorage.setItem(key, 'test_value', pastDate);

        expect(secureStorage.hasItem(key)).toBe(false);
      });
    });

    describe('getItemExpiry', () => {
      it('should return expiry date when set', () => {
        const key = 'test_expiry';
        const expiryDate = new Date(Date.now() + 60000);
        secureStorage.setItem(key, 'test_value', expiryDate);

        const retrievedExpiry = secureStorage.getItemExpiry(key);
        expect(retrievedExpiry?.getTime()).toBe(expiryDate.getTime());
      });

      it('should return null for items without expiry', () => {
        const key = 'test_no_expiry';
        secureStorage.setItem(key, 'test_value');

        const retrievedExpiry = secureStorage.getItemExpiry(key);
        expect(retrievedExpiry).toBeNull();
      });

      it('should return null for non-existent items', () => {
        const retrievedExpiry = secureStorage.getItemExpiry('non_existent');
        expect(retrievedExpiry).toBeNull();
      });
    });

    describe('updateExpiry', () => {
      it('should update expiry date for existing items', () => {
        const key = 'test_update_expiry';
        const value = 'test_value';
        const newExpiryDate = new Date(Date.now() + 120000); // 2 minutes

        secureStorage.setItem(key, value);
        const updated = secureStorage.updateExpiry(key, newExpiryDate);

        expect(updated).toBe(true);
        expect(secureStorage.getItemExpiry(key)?.getTime()).toBe(newExpiryDate.getTime());
      });

      it('should return false for non-existent items', () => {
        const newExpiryDate = new Date(Date.now() + 120000);
        const updated = secureStorage.updateExpiry('non_existent', newExpiryDate);

        expect(updated).toBe(false);
      });
    });

    describe('isAvailable', () => {
      it('should return true for browser storage types', () => {
        expect(secureStorage.isAvailable()).toBe(true);
      });

      it('should return false for memory storage', () => {
        const memoryStorage = new SecureStorage('memory');
        expect(memoryStorage.isAvailable()).toBe(false);
      });
    });

    describe('getStorageType', () => {
      it('should return the correct storage type', () => {
        expect(secureStorage.getStorageType()).toBe('localStorage');
      });
    });
  });

  describe('tokenStorage', () => {
    beforeEach(() => {
      // Clear any existing tokens
      tokenStorage.clearAll();
    });

    describe('token management', () => {
      it('should store and retrieve tokens', () => {
        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';
        tokenStorage.setToken(token);

        const retrieved = tokenStorage.getToken();
        expect(retrieved).toBe(token);
      });

      it('should store tokens with expiry', () => {
        const token = 'test.jwt.token';
        const expiryDate = new Date(Date.now() + 60000);

        tokenStorage.setToken(token, expiryDate);

        expect(tokenStorage.hasValidToken()).toBe(true);
        expect(tokenStorage.getTokenExpiry()?.getTime()).toBe(expiryDate.getTime());
      });

      it('should clear tokens', () => {
        tokenStorage.setToken('test.token');
        tokenStorage.clearToken();

        expect(tokenStorage.getToken()).toBeNull();
        expect(tokenStorage.hasValidToken()).toBe(false);
      });

      it('should return false for hasValidToken when no token exists', () => {
        expect(tokenStorage.hasValidToken()).toBe(false);
      });
    });

    describe('user data management', () => {
      it('should store and retrieve user data', () => {
        const userData = {
          id: '123',
          email: 'test@example.com',
          username: 'testuser',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z'
        };

        tokenStorage.setUserData(userData);
        const retrieved = tokenStorage.getUserData();

        expect(retrieved).toEqual(userData);
      });

      it('should clear user data', () => {
        const userData = { id: '123', name: 'Test User' };
        tokenStorage.setUserData(userData);
        tokenStorage.clearUserData();

        expect(tokenStorage.getUserData()).toBeNull();
      });
    });

    describe('refresh token management', () => {
      it('should store and retrieve refresh tokens', () => {
        const refreshToken = 'refresh.jwt.token';
        tokenStorage.setRefreshToken(refreshToken);

        const retrieved = tokenStorage.getRefreshToken();
        expect(retrieved).toBe(refreshToken);
      });

      it('should store refresh tokens with expiry', () => {
        const refreshToken = 'refresh.token';
        const expiryDate = new Date(Date.now() + 60000);

        tokenStorage.setRefreshToken(refreshToken, expiryDate);

        expect(tokenStorage.getRefreshToken()).toBe(refreshToken);
      });

      it('should clear refresh tokens', () => {
        tokenStorage.setRefreshToken('refresh.token');
        tokenStorage.clearRefreshToken();

        expect(tokenStorage.getRefreshToken()).toBeNull();
      });
    });

    describe('clearAll', () => {
      it('should clear all auth-related data', () => {
        tokenStorage.setToken('access.token');
        tokenStorage.setRefreshToken('refresh.token');
        tokenStorage.setUserData({ id: '123' });

        tokenStorage.clearAll();

        expect(tokenStorage.getToken()).toBeNull();
        expect(tokenStorage.getRefreshToken()).toBeNull();
        expect(tokenStorage.getUserData()).toBeNull();
      });
    });

    describe('storage availability', () => {
      it('should report storage availability', () => {
        expect(tokenStorage.isStorageAvailable()).toBe(true);
      });

      it('should return storage type', () => {
        expect(tokenStorage.getStorageType()).toBe('localStorage');
      });
    });
  });

  describe('error handling', () => {
    it('should handle storage setItem failures gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const secureStorage = new SecureStorage('localStorage');

      expect(() => {
        secureStorage.setItem('test', 'value');
      }).toThrow('Storage failed for key: test');
    });

    it('should handle storage getItem failures gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      const secureStorage = new SecureStorage('localStorage');
      const result = secureStorage.getItem('test');

      expect(result).toBeNull();
    });

    it('should handle storage removeItem failures gracefully', () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      const secureStorage = new SecureStorage('localStorage');

      // Should not throw
      expect(() => {
        secureStorage.removeItem('test');
      }).not.toThrow();
    });
  });
});