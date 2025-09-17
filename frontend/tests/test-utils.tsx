// React 18+ Test utilities for React Testing Library
import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult, act } from '@testing-library/react';
import { vi } from 'vitest';
import { User } from '../src/types/auth';

// Mock Auth Provider for testing
const MockAuthProvider: React.FC<{
  children: React.ReactNode;
  user?: User | null;
  isAuthenticated?: boolean;
  loading?: boolean;
}> = ({ children, user = null, isAuthenticated = false, loading = false }) => {
  const mockAuthValue = {
    user,
    isAuthenticated,
    loading,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    checkAuth: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
    error: null
  };

  // Mock the AuthContext
  const AuthContext = React.createContext(mockAuthValue);

  return (
    <AuthContext.Provider value={mockAuthValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Comprehensive providers wrapper
const AllTheProviders: React.FC<{
  children: React.ReactNode;
  authProps?: {
    user?: User | null;
    isAuthenticated?: boolean;
    loading?: boolean;
  };
}> = ({ children, authProps }) => {
  return (
    <MockAuthProvider {...authProps}>
      {children}
    </MockAuthProvider>
  );
};

// Custom render function with providers and React 18+ act() support
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & {
    authProps?: {
      user?: User | null;
      isAuthenticated?: boolean;
      loading?: boolean;
    };
  }
): RenderResult => {
  const { authProps, ...renderOptions } = options || {};

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <AllTheProviders authProps={authProps}>
      {children}
    </AllTheProviders>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// React 18+ compatible render with authentication
export const renderWithAuth = (
  ui: ReactElement,
  authProps: {
    user?: User | null;
    isAuthenticated?: boolean;
    loading?: boolean;
  } = {},
  options?: Omit<RenderOptions, 'wrapper'>
): RenderResult => {
  return customRender(ui, { ...options, authProps });
};

// Helper to create a mock function with proper typing
export const createMockFunction = <T extends (...args: any[]) => any>(
  implementation?: T
): T => {
  return vi.fn(implementation) as T;
};

// Helper to wait for async state updates
export const waitForStateUpdate = async (timeout = 100): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, timeout));
};

// Helper to simulate user interaction with proper act wrapping for React 18+
export const simulateUserAction = async (action: () => Promise<any>): Promise<any> => {
  let result: any;
  await act(async () => {
    result = await action();
  });
  return result;
};

// Helper for React 18+ state updates with proper act() wrapping
export const actAsync = async (fn: () => Promise<any>): Promise<any> => {
  let result: any;
  await act(async () => {
    result = await fn();
  });
  return result;
};

// Helper for synchronous state updates
export const actSync = (fn: () => any): any => {
  let result: any;
  act(() => {
    result = fn();
  });
  return result;
};

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Override render with our custom render
export { customRender as render };

// Export common test helpers
export const mockLocalStorage = () => {
  const store: { [key: string]: string } = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    get length() { return Object.keys(store).length; }
  };
};

// Mock for window.fetch
export const mockFetch = (response: any = {}, options: { ok?: boolean; status?: number } = {}) => {
  const mockResponse = {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: vi.fn().mockResolvedValue(response),
    text: vi.fn().mockResolvedValue(JSON.stringify(response)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(response)])),
    body: response.stream ? {
      getReader: () => ({
        read: response.stream,
        releaseLock: vi.fn()
      })
    } : undefined
  };

  return vi.fn().mockResolvedValue(mockResponse);
};

// Helper for mocking Zustand stores with React 18+ compatibility
export const mockZustandStore = (initialState: Partial<any>) => {
  return {
    ...initialState,
    getState: vi.fn(() => initialState),
    setState: vi.fn((updates: Partial<any>) => {
      Object.assign(initialState, updates);
    }),
    subscribe: vi.fn(),
    destroy: vi.fn()
  };
};

// Helper to create mock user for testing
export const createMockUser = (overrides?: Partial<User>): User => ({
  id: 'test-user-id',
  email: 'test@example.com',
  username: 'testuser',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides
});

// Helper to create mock auth state
export const createMockAuthState = (overrides?: {
  user?: User | null;
  isAuthenticated?: boolean;
  loading?: boolean;
}) => ({
  user: null,
  isAuthenticated: false,
  loading: false,
  ...overrides
});

// Enhanced mock for streaming responses
export const mockStreamingResponse = (chunks: string[], delay = 100) => {
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, delay));
          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }
          const chunk = chunks[index++];
          const encoder = new TextEncoder();
          return { done: false, value: encoder.encode(chunk) };
        }),
        releaseLock: vi.fn()
      })
    }
  };
};

// Mock factory functions
export const createMockFile = (
  name: string = 'test-file.txt',
  type: string = 'text/plain',
  content: string = 'test content'
): File => {
  const file = new File([content], name, { type });
  return file;
};

export const createMockImage = (
  name: string = 'test-image.png',
  width: number = 100,
  height: number = 100
): File => {
  // Create a simple PNG data URL
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, width, height);
  }

  return new File([canvas.toDataURL()], name, { type: 'image/png' });
};

// Message factory for testing
export const createMockMessage = (overrides = {}) => ({
  id: 'msg-test-' + Math.random().toString(36).substr(2, 9),
  conversation_id: 'conv-test',
  role: 'user',
  content: 'Test message content',
  created_at: new Date().toISOString(),
  is_active: true,
  metadata: {},
  timestamp: new Date(),
  ...overrides
});

// Conversation factory for testing
export const createMockConversation = (overrides = {}) => ({
  id: 'conv-test-' + Math.random().toString(36).substr(2, 9),
  user_id: 'user-test',
  title: 'Test Conversation',
  model: 'claude-code-opus',
  provider: 'anthropic',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  metadata: {},
  ...overrides
});