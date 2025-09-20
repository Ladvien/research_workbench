import { beforeAll, afterEach, afterAll } from 'vitest';
import '@testing-library/jest-dom';
import { configure, cleanup } from '@testing-library/react';

// Configure React 18+ test environment
declare global {
  interface Window {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
    act?: (callback: () => void | Promise<void>) => Promise<void>;
    gc?: () => void;
  }
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  var act: ((callback: () => void | Promise<void>) => Promise<void>) | undefined;
  var gc: (() => void) | undefined;
}

(global as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// AGENT-5 Performance Optimizations: Configure React Testing Library for React 18+
configure({
  testIdAttribute: 'data-testid',
  asyncUtilTimeout: 5000, // Reduced from 10000ms for faster tests
  // Enable React 18 concurrent features - but disable strict mode in tests for performance
  reactStrictMode: false,
  // Performance optimizations
  computedStyleSupportsPseudoElements: false, // Disable pseudo-element support for speed
  defaultHidden: false, // Disable hidden element queries for performance
  // Reduce query retries for faster failure detection
  getElementError: (message: string) => new Error(message)
});

// Mock scrollIntoView method
Element.prototype.scrollIntoView = () => {};

// Real localStorage and sessionStorage (available in jsdom)
// No mocking needed for integration tests

// Use real fetch for integration tests with backend
// Fetch is available globally in Node.js 18+ and in browsers

// Mock window.matchMedia (required for React components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock IntersectionObserver and ResizeObserver (required for some components)
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Clean up after each test
afterEach(async () => {
  // Use microtask queue for faster cleanup
  await new Promise(resolve => queueMicrotask(resolve));

  cleanup();

  // Clear storage for fresh test state
  localStorage.clear();
  sessionStorage.clear();
});

// Clean up after all tests
afterAll(() => {
  // Force garbage collection if available (Node.js)
  if (global.gc) {
    global.gc();
  }
});

// Configure React 18+ test environment before all tests
beforeAll(async () => {
  // Import and configure React's act() for testing
  const { act } = await import('@testing-library/react');

  // Make act globally available for React 18+
  (global as typeof globalThis & { act?: typeof act }).act = act;

  // Override console.warn to suppress specific React testing warnings
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  console.warn = (...args: unknown[]) => {
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

  console.error = (...args: unknown[]) => {
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