// Import vi for mocking
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

// Configure React 18+ test environment
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

// Configure React Testing Library for React 18+
configure({
  testIdAttribute: 'data-testid',
  asyncUtilTimeout: 10000,
  // Enable React 18 concurrent features - but disable strict mode in tests for now
  reactStrictMode: false
});

// Mock scrollIntoView method
Element.prototype.scrollIntoView = vi.fn();

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: localStorageMock
});

// Mock fetch globally if not already mocked in individual tests
global.fetch = global.fetch || vi.fn();

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation((callback) => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Enhanced cleanup after each test for React 18+
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();

  // Clear localStorage mock
  localStorageMock.clear.mockClear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();

  // Reset global fetch mock
  if (global.fetch && typeof global.fetch === 'function' && 'mockReset' in global.fetch) {
    (global.fetch as any).mockReset();
  }
});

// Configure React 18+ test environment before all tests
beforeAll(async () => {
  // Import and configure React's act() for testing
  const { act } = await import('@testing-library/react');

  // Make act globally available for React 18+
  (global as any).act = act;

  // Override console.warn to suppress specific React testing warnings
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  console.warn = (...args: any[]) => {
    const message = args[0];
    if (
      typeof message === 'string' && (
        message.includes('Warning: An update to') ||
        message.includes('Warning: The current testing environment is not configured to support act') ||
        message.includes('act(...)')
      )
    ) {
      return; // Suppress React testing warnings
    }
    originalConsoleWarn(...args);
  };

  console.error = (...args: any[]) => {
    const message = args[0];
    if (
      typeof message === 'string' && (
        message.includes('Warning: An update to') ||
        message.includes('Warning: The current testing environment is not configured to support act')
      )
    ) {
      return; // Suppress React testing errors
    }
    originalConsoleError(...args);
  };

  // Ensure DOM is ready for React 18+
  if (typeof document !== 'undefined') {
    document.body.innerHTML = '';
  }
});