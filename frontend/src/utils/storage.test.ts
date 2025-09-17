import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAvailableStorage,
  getStorageInstance,
  SecureStorage,
  tokenStorage,
  STORAGE_KEYS,
} from './storage';

// Mock console methods
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Create localStorage and sessionStorage mocks
const createStorageMock = () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

// Mock window.localStorage and window.sessionStorage
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

describe('storage utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAvailableStorage', () => {
    it('should return localStorage when available', () => {
      localStorageMock.setItem.mockImplementation(() => {});
      localStorageMock.removeItem.mockImplementation(() => {});

      const result = getAvailableStorage();

      expect(result).toBe('localStorage');
    });

    it('should return sessionStorage when localStorage fails', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('localStorage disabled');
      });
      sessionStorageMock.setItem.mockImplementation(() => {});
      sessionStorageMock.removeItem.mockImplementation(() => {});

      const result = getAvailableStorage();

      expect(result).toBe('sessionStorage');
    });

    it('should return memory when both localStorage and sessionStorage fail', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('localStorage disabled');
      });
      sessionStorageMock.setItem.mockImplementation(() => {
        throw new Error('sessionStorage disabled');
      });

      const result = getAvailableStorage();

      expect(result).toBe('memory');
    });
  });

  describe('getStorageInstance', () => {
    it('should return localStorage instance', () => {
      const instance = getStorageInstance('localStorage');

      expect(instance).toBe(window.localStorage);
    });

    it('should return sessionStorage instance', () => {
      const instance = getStorageInstance('sessionStorage');

      expect(instance).toBe(window.sessionStorage);
    });

    it('should return memory storage instance', () => {
      const instance = getStorageInstance('memory');

      expect(instance).toHaveProperty('getItem');
      expect(instance).toHaveProperty('setItem');
      expect(instance).toHaveProperty('removeItem');
      expect(instance).toHaveProperty('clear');
    });

    it('should use available storage when no preference provided', () => {
      localStorageMock.setItem.mockImplementation(() => {});
      localStorageMock.removeItem.mockImplementation(() => {});

      const instance = getStorageInstance();

      expect(instance).toBe(window.localStorage);
    });
  });

  describe('SecureStorage', () => {
    let storage: SecureStorage;

    beforeEach(() => {
      storage = new SecureStorage('memory'); // Use memory storage for predictable testing
    });

    describe('setItem and getItem', () => {
      it('should store and retrieve string values', () => {
        const value = 'test string';
        storage.setItem('test-key', value);
        const result = storage.getItem('test-key');

        expect(result).toBe(value);
      });

      it('should store and retrieve object values', () => {
        const value = { name: 'test', count: 42 };
        storage.setItem('test-object', value);
        const result = storage.getItem('test-object');

        expect(result).toEqual(value);
      });

      it('should store and retrieve array values', () => {
        const value = [1, 2, 3, 'test'];
        storage.setItem('test-array', value);
        const result = storage.getItem('test-array');

        expect(result).toEqual(value);
      });

      it('should return null for non-existent keys', () => {
        const result = storage.getItem('non-existent');

        expect(result).toBeNull();
      });

      it('should handle expiry dates', () => {
        const futureDate = new Date(Date.now() + 60000); // 1 minute from now
        storage.setItem('expiring-key', 'value', futureDate);
        
        const result = storage.getItem('expiring-key');
        expect(result).toBe('value');
      });

      it('should remove expired items', () => {
        const pastDate = new Date(Date.now() - 60000); // 1 minute ago
        storage.setItem('expired-key', 'value', pastDate);
        
        const result = storage.getItem('expired-key');
        expect(result).toBeNull();
      });

      it('should handle JSON parsing errors gracefully', () => {
        // Directly set invalid JSON in the underlying storage
        const memoryStorage = storage as any;
        memoryStorage.storage.setItem('invalid-json', '{invalid json}');
        
        const result = storage.getItem('invalid-json');
        expect(result).toBeNull();
        expect(mockConsoleError).toHaveBeenCalled();
      });

      it('should handle storage errors during set', () => {
        const failingStorage = new SecureStorage('localStorage');
        localStorageMock.setItem.mockImplementation(() => {
          throw new Error('Storage quota exceeded');
        });

        expect(() => {
          failingStorage.setItem('test', 'value');
        }).toThrow('Storage failed for key: test');

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Failed to store item test:',
          expect.any(Error)
        );
      });

      it('should handle storage errors during get', () => {
        const failingStorage = new SecureStorage('localStorage');
        localStorageMock.getItem.mockImplementation(() => {
          throw new Error('Storage access denied');
        });
        localStorageMock.removeItem.mockImplementation(() => {});

        const result = failingStorage.getItem('test');
        expect(result).toBeNull();
        expect(mockConsoleError).toHaveBeenCalled();
      });
    });

    describe('removeItem', () => {
      it('should remove stored items', () => {
        storage.setItem('remove-test', 'value');
        expect(storage.getItem('remove-test')).toBe('value');

        storage.removeItem('remove-test');
        expect(storage.getItem('remove-test')).toBeNull();
      });

      it('should handle remove errors gracefully', () => {
        const failingStorage = new SecureStorage('localStorage');
        localStorageMock.removeItem.mockImplementation(() => {
          throw new Error('Remove failed');
        });

        expect(() => {
          failingStorage.removeItem('test');
        }).not.toThrow();

        expect(mockConsoleError).toHaveBeenCalledWith(
          'Failed to remove item test:',
          expect.any(Error)
        );
      });
    });

    describe('clear', () => {
      it('should clear only app-specific keys', () => {
        storage.setItem(STORAGE_KEYS.AUTH_TOKEN, 'token');
        storage.setItem(STORAGE_KEYS.USER_DATA, { id: 1 });
        
        storage.clear();
        
        expect(storage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
        expect(storage.getItem(STORAGE_KEYS.USER_DATA)).toBeNull();
      });

      it('should handle clear errors gracefully', () => {
        const failingStorage = new SecureStorage('localStorage');
        localStorageMock.removeItem.mockImplementation(() => {
          throw new Error('Clear failed');
        });

        expect(() => {
          failingStorage.clear();
        }).not.toThrow();

        expect(mockConsoleError).toHaveBeenCalled();
      });
    });

    describe('utility methods', () => {
      it('should check if storage is available', () => {
        const memoryStorage = new SecureStorage('memory');
        const localStorageInstance = new SecureStorage('localStorage');

        expect(memoryStorage.isAvailable()).toBe(false);
        expect(localStorageInstance.isAvailable()).toBe(true);
      });

      it('should return storage type', () => {
        const memoryStorage = new SecureStorage('memory');
        const localStorageInstance = new SecureStorage('localStorage');

        expect(memoryStorage.getStorageType()).toBe('memory');
        expect(localStorageInstance.getStorageType()).toBe('localStorage');
      });

      it('should check if item exists and is not expired', () => {
        storage.setItem('existing-key', 'value');
        
        expect(storage.hasItem('existing-key')).toBe(true);
        expect(storage.hasItem('non-existent')).toBe(false);
      });

      it('should return item expiry date', () => {
        const futureDate = new Date(Date.now() + 60000);
        storage.setItem('expiring-key', 'value', futureDate);
        
        const expiry = storage.getItemExpiry('expiring-key');
        expect(expiry).toEqual(futureDate);
      });

      it('should return null expiry for non-expiring items', () => {
        storage.setItem('permanent-key', 'value');
        
        const expiry = storage.getItemExpiry('permanent-key');
        expect(expiry).toBeNull();
      });

      it('should update item expiry', () => {
        storage.setItem('update-expiry', 'value');
        const newExpiry = new Date(Date.now() + 120000);
        
        const success = storage.updateExpiry('update-expiry', newExpiry);
        expect(success).toBe(true);
        
        const expiry = storage.getItemExpiry('update-expiry');
        expect(expiry).toEqual(newExpiry);
      });

      it('should fail to update expiry for non-existent items', () => {
        const newExpiry = new Date(Date.now() + 120000);
        
        const success = storage.updateExpiry('non-existent', newExpiry);
        expect(success).toBe(false);
      });
    });
  });

  describe('tokenStorage', () => {
    beforeEach(() => {
      tokenStorage.clearAll();
    });

    describe('token management', () => {
      it('should store and retrieve auth token', () => {
        const token = 'auth-token-123';
        tokenStorage.setToken(token);
        
        expect(tokenStorage.getToken()).toBe(token);
        expect(tokenStorage.hasValidToken()).toBe(true);
      });

      it('should store token with expiry', () => {
        const token = 'auth-token-123';
        const expiry = new Date(Date.now() + 60000);
        
        tokenStorage.setToken(token, expiry);
        
        expect(tokenStorage.getToken()).toBe(token);
        expect(tokenStorage.getTokenExpiry()).toEqual(expiry);
      });

      it('should clear auth token', () => {
        tokenStorage.setToken('token');
        expect(tokenStorage.getToken()).toBe('token');
        
        tokenStorage.clearToken();
        expect(tokenStorage.getToken()).toBeNull();
        expect(tokenStorage.hasValidToken()).toBe(false);
      });
    });

    describe('refresh token management', () => {
      it('should store and retrieve refresh token', () => {
        const refreshToken = 'refresh-token-456';
        tokenStorage.setRefreshToken(refreshToken);
        
        expect(tokenStorage.getRefreshToken()).toBe(refreshToken);
      });

      it('should store refresh token with expiry', () => {
        const refreshToken = 'refresh-token-456';
        const expiry = new Date(Date.now() + 86400000); // 24 hours
        
        tokenStorage.setRefreshToken(refreshToken, expiry);
        
        expect(tokenStorage.getRefreshToken()).toBe(refreshToken);
      });

      it('should clear refresh token', () => {
        tokenStorage.setRefreshToken('refresh-token');
        expect(tokenStorage.getRefreshToken()).toBe('refresh-token');
        
        tokenStorage.clearRefreshToken();
        expect(tokenStorage.getRefreshToken()).toBeNull();
      });
    });

    describe('user data management', () => {
      it('should store and retrieve user data', () => {
        const userData = { id: 1, name: 'Test User', email: 'test@example.com' };
        tokenStorage.setUserData(userData);
        
        expect(tokenStorage.getUserData()).toEqual(userData);
      });

      it('should clear user data', () => {
        const userData = { id: 1, name: 'Test User' };
        tokenStorage.setUserData(userData);
        expect(tokenStorage.getUserData()).toEqual(userData);
        
        tokenStorage.clearUserData();
        expect(tokenStorage.getUserData()).toBeNull();
      });
    });

    describe('storage information', () => {
      it('should return storage availability', () => {
        const isAvailable = tokenStorage.isStorageAvailable();
        expect(typeof isAvailable).toBe('boolean');
      });

      it('should return storage type', () => {
        const storageType = tokenStorage.getStorageType();
        expect(['localStorage', 'sessionStorage', 'memory']).toContain(storageType);
      });
    });

    describe('clear all', () => {
      it('should clear all auth-related data', () => {
        tokenStorage.setToken('token');
        tokenStorage.setRefreshToken('refresh');
        tokenStorage.setUserData({ id: 1 });
        
        tokenStorage.clearAll();
        
        expect(tokenStorage.getToken()).toBeNull();
        expect(tokenStorage.getRefreshToken()).toBeNull();
        expect(tokenStorage.getUserData()).toBeNull();
      });
    });
  });

  describe('MemoryStorage implementation', () => {
    it('should work as a fallback storage', () => {
      const memoryStorage = getStorageInstance('memory');
      
      memoryStorage.setItem('test', 'value');
      expect(memoryStorage.getItem('test')).toBe('value');
      
      memoryStorage.removeItem('test');
      expect(memoryStorage.getItem('test')).toBeNull();
      
      memoryStorage.setItem('key1', 'value1');
      memoryStorage.setItem('key2', 'value2');
      memoryStorage.clear();
      
      expect(memoryStorage.getItem('key1')).toBeNull();
      expect(memoryStorage.getItem('key2')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined values', () => {
      const storage = new SecureStorage('memory');
      
      storage.setItem('null-test', null);
      storage.setItem('undefined-test', undefined);
      
      expect(storage.getItem('null-test')).toBe('null');
      expect(storage.getItem('undefined-test')).toBe('undefined');
    });

    it('should handle empty strings', () => {
      const storage = new SecureStorage('memory');
      
      storage.setItem('empty-string', '');
      expect(storage.getItem('empty-string')).toBe('');
    });

    it('should handle special characters in keys and values', () => {
      const storage = new SecureStorage('memory');
      const specialKey = 'key-with-\"special\"::characters';
      const specialValue = 'value with \n newlines and \"quotes\"';
      
      storage.setItem(specialKey, specialValue);
      expect(storage.getItem(specialKey)).toBe(specialValue);
    });

    it('should handle very large data', () => {
      const storage = new SecureStorage('memory');
      const largeData = 'x'.repeat(100000); // 100KB string
      
      storage.setItem('large-data', largeData);
      expect(storage.getItem('large-data')).toBe(largeData);
    });

    it('should handle circular references gracefully', () => {
      const storage = new SecureStorage('memory');
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      expect(() => {
        storage.setItem('circular', circular);
      }).toThrow(); // JSON.stringify will throw on circular reference
    });

    it('should handle Date objects', () => {
      const storage = new SecureStorage('memory');
      const date = new Date('2023-01-01T00:00:00Z');
      
      storage.setItem('date-test', date);
      const retrieved = storage.getItem('date-test');
      
      // Date will be serialized as ISO string
      expect(retrieved).toBe(date.toISOString());
    });

    it('should handle expiry edge cases', () => {
      const storage = new SecureStorage('memory');
      
      // Test with expiry exactly at current time
      const now = new Date();
      storage.setItem('edge-expiry', 'value', now);
      
      // Depending on timing, this might return null or the value
      const result = storage.getItem('edge-expiry');
      expect([null, 'value']).toContain(result);
    });
  });

  describe('STORAGE_KEYS constants', () => {
    it('should have all required storage keys', () => {
      expect(STORAGE_KEYS.AUTH_TOKEN).toBe('workbench_auth_token');
      expect(STORAGE_KEYS.USER_DATA).toBe('workbench_user_data');
      expect(STORAGE_KEYS.TOKEN_EXPIRY).toBe('workbench_token_expiry');
      expect(STORAGE_KEYS.REFRESH_TOKEN).toBe('workbench_refresh_token');
    });

    it('should be readonly', () => {
      expect(() => {
        (STORAGE_KEYS as any).AUTH_TOKEN = 'modified';
      }).toThrow();
    });
  });
});
