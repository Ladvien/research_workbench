// Test configuration that reads from environment variables
// This ensures consistency with backend seeding

export const TEST_CONFIG = {
  // Test user credentials from environment or defaults
  TEST_USER_EMAIL: process.env.TEST_USER_EMAIL || 'test@workbench.com',
  TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD || 'testpassword123',
  
  // Admin credentials from environment or defaults
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@workbench.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'adminpassword123',
  
  // Base URLs for testing
  BASE_URL: process.env.BASE_URL || 'http://localhost:4510',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:4512/api',
  
  // Test timeouts
  DEFAULT_TIMEOUT: 30000,
  LONG_TIMEOUT: 90000, // For Claude Code responses
  NETWORK_TIMEOUT: 10000,
  
  // Test data
  TEST_MESSAGE: 'What is 2 + 2? Please respond with just the number.',
  CLAUDE_CODE_MODEL: 'claude-code-sonnet',
};

// Validate required configuration
if (!TEST_CONFIG.TEST_USER_EMAIL || !TEST_CONFIG.TEST_USER_PASSWORD) {
  throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in environment or .env file');
}

export default TEST_CONFIG;
