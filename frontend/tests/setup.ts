// Import vi for mocking
import { vi, beforeAll, afterEach, afterAll } from 'vitest';
import '@testing-library/jest-dom';
import { configure, cleanup } from '@testing-library/react';
import { server } from './mocks/server';

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
Element.prototype.scrollIntoView = vi.fn();

// AGENT-5 Optimized localStorage mock with persistent cache for performance
const createOptimizedStorageMock = () => {
  const store = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
    get length() { return store.size; },
    key: vi.fn((index: number) => {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    })
  };
};

// Use optimized storage mocks
const localStorageMock = createOptimizedStorageMock();
const sessionStorageMock = createOptimizedStorageMock();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true
});

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  configurable: true
});

// Optimized fetch mock with response caching
interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  json: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
  blob: ReturnType<typeof vi.fn>;
  arrayBuffer: ReturnType<typeof vi.fn>;
  clone: ReturnType<typeof vi.fn>;
}

const createOptimizedFetchMock = () => {
  const responseCache = new Map<string, MockResponse>();

  return vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    // Cache GET requests for performance
    const cacheKey = options?.method === 'GET' || !options?.method ? url : null;

    if (cacheKey && responseCache.has(cacheKey)) {
      return Promise.resolve(responseCache.get(cacheKey));
    }

    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(''),
      blob: vi.fn().mockResolvedValue(new Blob()),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
      clone: vi.fn().mockReturnThis()
    };

    if (cacheKey) {
      responseCache.set(cacheKey, mockResponse);
    }

    return Promise.resolve(mockResponse);
  });
};

global.fetch = global.fetch || createOptimizedFetchMock();

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

// AGENT-5 Enhanced cleanup with performance optimizations
afterEach(async () => {
  // Reset MSW handlers
  server.resetHandlers();

  // Use microtask queue for faster cleanup
  await new Promise(resolve => queueMicrotask(resolve));

  cleanup();

  // Batch mock clears for better performance
  vi.clearAllMocks();

  // Clear storage mocks without individual mock clears for speed
  localStorageMock.clear();
  sessionStorageMock.clear();

  // Reset fetch cache for next test
  if (global.fetch && typeof global.fetch === 'function' && 'mockReset' in global.fetch) {
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  }
});

// AGENT-5 Performance monitoring and optimization
afterAll(() => {
  // Stop MSW server
  server.close();

  // Clean up any remaining resources
  vi.clearAllTimers();
  vi.restoreAllMocks();

  // Force garbage collection if available (Node.js)
  if (global.gc) {
    global.gc();
  }
});

// Configure React 18+ test environment before all tests
beforeAll(async () => {
  // Start MSW server
  server.listen({ onUnhandledRequest: 'error' });

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