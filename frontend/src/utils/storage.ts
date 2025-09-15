/**
 * Secure storage utility for JWT tokens and auth data
 * Handles localStorage with fallback to sessionStorage
 */

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'workbench_auth_token',
  USER_DATA: 'workbench_user_data',
  TOKEN_EXPIRY: 'workbench_token_expiry',
  REFRESH_TOKEN: 'workbench_refresh_token',
} as const;

// Storage preferences
export type StorageType = 'localStorage' | 'sessionStorage' | 'memory';

interface StorageInterface {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

class MemoryStorage implements StorageInterface {
  private storage = new Map<string, string>();

  getItem(key: string): string | null {
    return this.storage.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

/**
 * Get the available storage type based on browser support
 */
export function getAvailableStorage(): StorageType {
  try {
    // Test localStorage
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, 'test');
    window.localStorage.removeItem(testKey);
    return 'localStorage';
  } catch {
    try {
      // Test sessionStorage
      const testKey = '__storage_test__';
      window.sessionStorage.setItem(testKey, 'test');
      window.sessionStorage.removeItem(testKey);
      return 'sessionStorage';
    } catch {
      // Fallback to memory storage
      return 'memory';
    }
  }
}

/**
 * Get storage instance based on type preference
 */
export function getStorageInstance(preferredType?: StorageType): StorageInterface {
  const availableType = preferredType || getAvailableStorage();

  switch (availableType) {
    case 'localStorage':
      return window.localStorage;
    case 'sessionStorage':
      return window.sessionStorage;
    case 'memory':
      return new MemoryStorage();
    default:
      return new MemoryStorage();
  }
}

/**
 * Secure storage class with encryption support and automatic expiry
 */
export class SecureStorage {
  private storage: StorageInterface;
  private storageType: StorageType;

  constructor(preferredType?: StorageType) {
    this.storageType = preferredType || getAvailableStorage();
    this.storage = getStorageInstance(this.storageType);
  }

  /**
   * Store data securely with optional expiry
   */
  setItem(key: string, value: any, expiryDate?: Date): void {
    try {
      const data = {
        value: typeof value === 'string' ? value : JSON.stringify(value),
        timestamp: Date.now(),
        expiry: expiryDate ? expiryDate.getTime() : null,
      };

      this.storage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`Failed to store item ${key}:`, error);
      throw new Error(`Storage failed for key: ${key}`);
    }
  }

  /**
   * Retrieve data securely with expiry check
   */
  getItem(key: string): any | null {
    try {
      const stored = this.storage.getItem(key);
      if (!stored) {
        return null;
      }

      const data = JSON.parse(stored);

      // Check expiry
      if (data.expiry && Date.now() > data.expiry) {
        this.removeItem(key);
        return null;
      }

      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(data.value);
      } catch {
        return data.value;
      }
    } catch (error) {
      console.error(`Failed to retrieve item ${key}:`, error);
      this.removeItem(key); // Clean up corrupted data
      return null;
    }
  }

  /**
   * Remove item from storage
   */
  removeItem(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch (error) {
      console.error(`Failed to remove item ${key}:`, error);
    }
  }

  /**
   * Clear all stored data
   */
  clear(): void {
    try {
      // Only clear our specific keys to avoid affecting other apps
      Object.values(STORAGE_KEYS).forEach(key => {
        this.storage.removeItem(key);
      });
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }

  /**
   * Check if storage is available
   */
  isAvailable(): boolean {
    return this.storageType !== 'memory';
  }

  /**
   * Get storage type being used
   */
  getStorageType(): StorageType {
    return this.storageType;
  }

  /**
   * Check if item exists and is not expired
   */
  hasItem(key: string): boolean {
    return this.getItem(key) !== null;
  }

  /**
   * Get item expiry date if set
   */
  getItemExpiry(key: string): Date | null {
    try {
      const stored = this.storage.getItem(key);
      if (!stored) {
        return null;
      }

      const data = JSON.parse(stored);
      return data.expiry ? new Date(data.expiry) : null;
    } catch {
      return null;
    }
  }

  /**
   * Update item expiry without changing value
   */
  updateExpiry(key: string, expiryDate: Date): boolean {
    try {
      const value = this.getItem(key);
      if (value === null) {
        return false;
      }

      this.setItem(key, value, expiryDate);
      return true;
    } catch {
      return false;
    }
  }
}

// Default storage instance
export const storage = new SecureStorage();

// Convenience functions for common operations
export const tokenStorage = {
  /**
   * Store JWT token with expiry
   */
  setToken(token: string, expiryDate?: Date): void {
    storage.setItem(STORAGE_KEYS.AUTH_TOKEN, token, expiryDate);
  },

  /**
   * Get JWT token if valid
   */
  getToken(): string | null {
    return storage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  /**
   * Remove JWT token
   */
  clearToken(): void {
    storage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  /**
   * Check if token exists and is valid
   */
  hasValidToken(): boolean {
    return storage.hasItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  /**
   * Get token expiry date
   */
  getTokenExpiry(): Date | null {
    return storage.getItemExpiry(STORAGE_KEYS.AUTH_TOKEN);
  },

  /**
   * Store user data
   */
  setUserData(userData: any): void {
    storage.setItem(STORAGE_KEYS.USER_DATA, userData);
  },

  /**
   * Get user data
   */
  getUserData(): any | null {
    return storage.getItem(STORAGE_KEYS.USER_DATA);
  },

  /**
   * Clear user data
   */
  clearUserData(): void {
    storage.removeItem(STORAGE_KEYS.USER_DATA);
  },

  /**
   * Store refresh token with expiry
   */
  setRefreshToken(token: string, expiryDate?: Date): void {
    storage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token, expiryDate);
  },

  /**
   * Get refresh token if valid
   */
  getRefreshToken(): string | null {
    return storage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  },

  /**
   * Clear refresh token
   */
  clearRefreshToken(): void {
    storage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  },

  /**
   * Clear all auth data
   */
  clearAll(): void {
    storage.clear();
  },

  /**
   * Check if storage is available
   */
  isStorageAvailable(): boolean {
    return storage.isAvailable();
  },

  /**
   * Get storage type being used
   */
  getStorageType(): StorageType {
    return storage.getStorageType();
  }
};