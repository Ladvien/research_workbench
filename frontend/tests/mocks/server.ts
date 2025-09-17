// MSW server setup for testing
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Setup MSW server with default handlers
export const server = setupServer(...handlers);

// Export utility functions for test customization
export { server as mswServer };

// Helper to reset handlers between tests
export const resetHandlers = () => {
  server.resetHandlers();
};

// Helper to use custom handlers for specific tests
export const useCustomHandlers = (...customHandlers: Parameters<typeof server.use>) => {
  server.use(...customHandlers);
};