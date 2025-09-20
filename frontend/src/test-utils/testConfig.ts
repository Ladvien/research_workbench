// Test configuration for real backend integration
export const TEST_CONFIG = {
  // Backend API endpoint (using proxy configured in vite.config.ts)
  API_BASE_URL: '/api',

  // Test user credentials from environment
  TEST_USER: {
    email: process.env.TEST_USER_EMAIL || 'test@workbench.com',
    password: process.env.TEST_USER_PASSWORD || 'testpassword123',
  },

  // Admin user credentials from environment
  ADMIN_USER: {
    email: process.env.ADMIN_EMAIL || 'admin@workbench.com',
    password: process.env.ADMIN_PASSWORD || 'adminpassword123',
  },

  // Test timeouts for real API calls
  TIMEOUTS: {
    API_REQUEST: 5000,
    AUTHENTICATION: 10000,
    FILE_UPLOAD: 15000,
  },

  // Test retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY_MS: 1000,
  },
} as const;

// Helper function to wait for backend to be ready
export async function waitForBackend(retries = 5): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return true;
      }
    } catch (error) {
      console.warn(`Backend not ready, attempt ${i + 1}/${retries}:`, error);
    }

    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return false;
}

// Helper to create a test user if needed
export async function ensureTestUser(): Promise<void> {
  try {
    // Try to login with test user
    const loginResponse = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      }),
      credentials: 'include',
    });

    if (loginResponse.ok) {
      // User exists and can login
      return;
    }

    if (loginResponse.status === 401) {
      // User doesn't exist, try to register
      const registerResponse = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_CONFIG.TEST_USER.email,
          username: 'testuser',
          password: TEST_CONFIG.TEST_USER.password,
        }),
        credentials: 'include',
      });

      if (!registerResponse.ok) {
        throw new Error(`Failed to register test user: ${registerResponse.status}`);
      }
    }
  } catch (error) {
    console.error('Failed to ensure test user exists:', error);
    throw error;
  }
}

// Helper to cleanup test data after tests
export async function cleanupTestData(): Promise<void> {
  try {
    // This could be expanded to clean up test conversations, messages, etc.
    // For now, just logout to clean session
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    // Ignore cleanup errors
    console.warn('Failed to cleanup test data:', error);
  }
}