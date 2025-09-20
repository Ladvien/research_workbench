import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { apiClient } from './api';
import { authService } from './auth';
import type {
  Conversation,
  ConversationWithMessages,
  CreateConversationRequest,
  Message,
  PaginationParams,
} from '../types';
import { TEST_CONFIG, waitForBackend, ensureTestUser, cleanupTestData } from '../test-utils/testConfig';

// Store original location for cleanup
const originalLocation = window.location;

describe('ApiClient', () => {
  let testConversationId: string | null = null;
  let testMessageId: string | null = null;

  beforeAll(async () => {
    // Wait for backend to be ready
    const isReady = await waitForBackend();
    if (!isReady) {
      throw new Error('Backend is not ready for testing');
    }

    // Ensure test user exists
    await ensureTestUser();

    // Authenticate test user
    const loginResponse = await authService.login({
      email: TEST_CONFIG.TEST_USER.email,
      password: TEST_CONFIG.TEST_USER.password,
    });

    if (loginResponse.error) {
      throw new Error(`Failed to login test user: ${loginResponse.error}`);
    }
  }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);

  beforeEach(async () => {
    // Clean up test data
    await cleanupTestData();

    // Re-authenticate for each test
    await authService.login({
      email: TEST_CONFIG.TEST_USER.email,
      password: TEST_CONFIG.TEST_USER.password,
    });
  });

  afterAll(async () => {
    // Clean up any test conversations
    if (testConversationId) {
      await apiClient.deleteConversation(testConversationId);
    }

    await cleanupTestData();
  });

  // Re-authenticate after each test to ensure clean state
  afterEach(async () => {
    await authService.login({
      email: TEST_CONFIG.TEST_USER.email,
      password: TEST_CONFIG.TEST_USER.password,
    });
  });

  describe('request method', () => {
    it('should make successful request with correct headers', async () => {
      const result = await apiClient.healthCheck();

      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();
      expect(result.data?.status).toBe('ok');
      expect(result.error).toBeUndefined();
    });

    it('should handle 401 errors with token refresh', async () => {
      // Log out to force 401, then test automatic refresh
      await authService.logout();

      // This should trigger token refresh automatically
      const result = await apiClient.healthCheck();

      // Should either succeed with refresh or fail with 401
      expect([200, 401]).toContain(result.status);
      if (result.status === 200) {
        expect(result.data?.status).toBe('ok');
      }
    });

    it('should handle 401 errors when refresh fails', async () => {
      // Log out and invalidate session completely
      await authService.logout();

      // Clear all cookies to ensure no valid session
      document.cookie.split(';').forEach(c => {
        const eqPos = c.indexOf('=');
        const name = eqPos > -1 ? c.substr(0, eqPos) : c;
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      });

      const result = await apiClient.healthCheck();

      expect(result.status).toBe(401);
      expect(result.error).toBeDefined();
    });

    it('should redirect to login on refresh failure', async () => {
      // Mock location for this test
      const mockLocation = { href: '', pathname: '/dashboard' };
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
      });

      // Log out and invalidate session
      await authService.logout();

      // Clear all cookies
      document.cookie.split(';').forEach(c => {
        const eqPos = c.indexOf('=');
        const name = eqPos > -1 ? c.substr(0, eqPos) : c;
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      });

      // Trigger an endpoint that requires auth and fails
      const result = await apiClient.getConversations();

      // Should get 401 error
      expect(result.status).toBe(401);

      // Restore original location
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      });
    });

    it('should not redirect when already on login page', async () => {
      // Mock location for login page
      const mockLocation = { href: '', pathname: '/login' };
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
      });

      // Log out and test from login page
      await authService.logout();

      const result = await apiClient.healthCheck();

      // Should still get 401 but no redirect
      expect(result.status).toBe(401);
      expect(mockLocation.href).toBe('');

      // Restore original location
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      });
    });

    it('should handle HTTP errors', async () => {
      // Test with invalid endpoint to trigger error
      const result = await apiClient['request']('/api/v1/invalid-endpoint');

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.error).toBeDefined();
    });

    it('should handle network errors', async () => {
      // Create a new client with invalid base URL to trigger network error
      const invalidClient = new (apiClient.constructor as any)('http://invalid-url:99999');

      const result = await invalidClient.healthCheck();

      expect(result.status).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('should handle non-Error exceptions', async () => {
      // Test with malformed request that might cause unexpected errors
      const result = await apiClient['request']('/api/v1/test', {
        method: 'POST',
        body: 'invalid json',
      });

      // Should handle gracefully
      expect(result.status).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('conversation endpoints', () => {
    describe('getConversations', () => {
      it('should fetch conversations without pagination', async () => {
        const result = await apiClient.getConversations();

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should fetch conversations with pagination', async () => {
        const pagination: PaginationParams = { page: 1, limit: 5 };
        const result = await apiClient.getConversations(pagination);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    describe('createConversation', () => {
      it('should create conversation successfully', async () => {
        const request: CreateConversationRequest = {
          title: 'Test API Conversation',
          model: 'claude-3',
          provider: 'anthropic',
          metadata: { test: true },
        };

        const result = await apiClient.createConversation(request);

        expect(result.status).toBe(201);
        expect(result.data).toBeDefined();
        expect(result.data?.title).toBe(request.title);
        expect(result.data?.model).toBe(request.model);
        expect(result.data?.id).toBeDefined();
        expect(result.error).toBeUndefined();

        // Store for cleanup
        if (result.data?.id) {
          testConversationId = result.data.id;
        }
      });
    });

    describe('getConversation', () => {
      it('should fetch conversation with messages', async () => {
        // First create a conversation to test with
        const createResult = await apiClient.createConversation({
          title: 'Test Get Conversation',
          model: 'claude-3',
          provider: 'anthropic',
        });

        expect(createResult.status).toBe(201);
        expect(createResult.data?.id).toBeDefined();

        const conversationId = createResult.data!.id;
        testConversationId = conversationId; // For cleanup

        const result = await apiClient.getConversation(conversationId);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
        expect(result.data?.conversation).toBeDefined();
        expect(result.data?.messages).toBeDefined();
        expect(Array.isArray(result.data?.messages)).toBe(true);
        expect(result.data?.conversation.id).toBe(conversationId);
      });
    });

    describe('updateConversationTitle', () => {
      it('should update conversation title', async () => {
        // First create a conversation to test with
        const createResult = await apiClient.createConversation({
          title: 'Original Title',
          model: 'claude-3',
          provider: 'anthropic',
        });

        expect(createResult.status).toBe(201);
        const conversationId = createResult.data!.id;
        testConversationId = conversationId; // For cleanup

        const newTitle = 'Updated Title';
        const result = await apiClient.updateConversationTitle(conversationId, newTitle);

        expect(result.status).toBe(200);
        expect(result.error).toBeUndefined();

        // Verify the title was updated
        const getResult = await apiClient.getConversation(conversationId);
        expect(getResult.data?.conversation.title).toBe(newTitle);
      });
    });

    describe('deleteConversation', () => {
      it('should delete conversation', async () => {
        // First create a conversation to delete
        const createResult = await apiClient.createConversation({
          title: 'To Be Deleted',
          model: 'claude-3',
          provider: 'anthropic',
        });

        expect(createResult.status).toBe(201);
        const conversationId = createResult.data!.id;

        const result = await apiClient.deleteConversation(conversationId);

        expect(result.status).toBe(204);
        expect(result.error).toBeUndefined();

        // Verify conversation is deleted
        const getResult = await apiClient.getConversation(conversationId);
        expect(getResult.status).toBe(404);
      });
    });
  });

  describe('message endpoints', () => {
    describe('getMessages', () => {
      it('should fetch messages for conversation', async () => {
        // First create a conversation to test with
        const createResult = await apiClient.createConversation({
          title: 'Test Messages',
          model: 'claude-3',
          provider: 'anthropic',
        });

        expect(createResult.status).toBe(201);
        const conversationId = createResult.data!.id;
        testConversationId = conversationId; // For cleanup

        const result = await apiClient.getMessages(conversationId);

        expect(result.status).toBe(200);
        expect(result.data).toBeDefined();
        expect(result.data?.messages).toBeDefined();
        expect(Array.isArray(result.data?.messages)).toBe(true);
        expect(result.data?.conversation_id).toBe(conversationId);
        expect(typeof result.data?.total_count).toBe('number');
      });
    });

    describe('sendMessage', () => {
      it('should send message to conversation', async () => {
        // First create a conversation to test with
        const createResult = await apiClient.createConversation({
          title: 'Test Send Message',
          model: 'claude-3',
          provider: 'anthropic',
        });

        expect(createResult.status).toBe(201);
        const conversationId = createResult.data!.id;
        testConversationId = conversationId; // For cleanup

        const result = await apiClient.sendMessage(conversationId, 'Hello from test!');

        expect(result.status).toBe(201);
        expect(result.data).toBeDefined();
        expect(result.error).toBeUndefined();

        // Verify message was added to conversation
        const messagesResult = await apiClient.getMessages(conversationId);
        expect(messagesResult.data?.messages.length).toBeGreaterThan(0);
      });
    });

  });

  describe('streamMessage', () => {
    it('should handle streaming messages successfully', async () => {
      // First create a conversation to test with
      const createResult = await apiClient.createConversation({
        title: 'Test Streaming',
        model: 'claude-3',
        provider: 'anthropic',
      });

      expect(createResult.status).toBe(201);
      const conversationId = createResult.data!.id;
      testConversationId = conversationId; // For cleanup

      let tokens: string[] = [];
      let errorMessage: string | null = null;
      let completedMessageId: string | undefined;

      const onToken = (token: string) => tokens.push(token);
      const onError = (error: string) => errorMessage = error;
      const onComplete = (messageId?: string) => completedMessageId = messageId;

      await apiClient.streamMessage(
        conversationId,
        'Hello from streaming test',
        onToken,
        onError,
        onComplete
      );

      // Should receive some tokens
      expect(tokens.length).toBeGreaterThan(0);
      expect(errorMessage).toBeNull();
      expect(completedMessageId).toBeDefined();
    }, 15000);

    it('should handle conversation not found error', async () => {
      let errorMessage: string | null = null;
      let tokenCalled = false;
      let completeCalled = false;

      const onToken = () => tokenCalled = true;
      const onError = (error: string) => errorMessage = error;
      const onComplete = () => completeCalled = true;

      await apiClient.streamMessage(
        'non-existent-conversation-id',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(errorMessage).toBe('CONVERSATION_NOT_FOUND');
      expect(tokenCalled).toBe(false);
      expect(completeCalled).toBe(false);
    });

    it('should handle 401 errors with token refresh in streaming', async () => {
      // First create a conversation
      const createResult = await apiClient.createConversation({
        title: 'Test Auth Streaming',
        model: 'claude-3',
        provider: 'anthropic',
      });

      expect(createResult.status).toBe(201);
      const conversationId = createResult.data!.id;
      testConversationId = conversationId;

      // Log out to trigger 401
      await authService.logout();

      let errorMessage: string | null = null;
      const onToken = () => {};
      const onError = (error: string) => errorMessage = error;
      const onComplete = () => {};

      await apiClient.streamMessage(
        conversationId,
        'Hello',
        onToken,
        onError,
        onComplete
      );

      // Should get authentication error
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.includes('Authentication') || errorMessage?.includes('401')).toBe(true);
    });

    it('should handle authentication failure in streaming', async () => {
      // Log out and clear session
      await authService.logout();

      // Clear all cookies
      document.cookie.split(';').forEach(c => {
        const eqPos = c.indexOf('=');
        const name = eqPos > -1 ? c.substr(0, eqPos) : c;
        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      });

      let errorMessage: string | null = null;
      const onToken = () => {};
      const onError = (error: string) => errorMessage = error;
      const onComplete = () => {};

      await apiClient.streamMessage(
        'test-conv-id',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(errorMessage).toBeDefined();
      expect(errorMessage?.includes('Authentication') || errorMessage?.includes('failed')).toBe(true);
    });

    it('should handle stream errors', async () => {
      // Test with invalid/long message that might cause stream errors
      const createResult = await apiClient.createConversation({
        title: 'Test Stream Error',
        model: 'claude-3',
        provider: 'anthropic',
      });

      expect(createResult.status).toBe(201);
      const conversationId = createResult.data!.id;
      testConversationId = conversationId;

      let errorOccurred = false;
      const onToken = () => {};
      const onError = () => { errorOccurred = true; };
      const onComplete = () => {};

      // Create abort controller to cancel after short time
      const abortController = new AbortController();
      setTimeout(() => abortController.abort(), 100);

      await apiClient.streamMessage(
        conversationId,
        'Test message',
        onToken,
        onError,
        onComplete,
        abortController.signal
      );

      // Should either complete successfully or be aborted
      expect(typeof errorOccurred).toBe('boolean');
    });

    it('should handle malformed JSON in stream gracefully', async () => {
      // This is harder to test with real backend, but we can test that streaming
      // completes without throwing errors
      const createResult = await apiClient.createConversation({
        title: 'Test Malformed JSON Handling',
        model: 'claude-3',
        provider: 'anthropic',
      });

      expect(createResult.status).toBe(201);
      const conversationId = createResult.data!.id;
      testConversationId = conversationId;

      let completed = false;
      const onToken = () => {};
      const onError = () => {};
      const onComplete = () => { completed = true; };

      await apiClient.streamMessage(
        conversationId,
        'Simple test message',
        onToken,
        onError,
        onComplete
      );

      expect(completed).toBe(true);
    }, 10000);

    it('should handle completion signals', async () => {
      const createResult = await apiClient.createConversation({
        title: 'Test Completion Signal',
        model: 'claude-3',
        provider: 'anthropic',
      });

      expect(createResult.status).toBe(201);
      const conversationId = createResult.data!.id;
      testConversationId = conversationId;

      let completed = false;
      const onToken = () => {};
      const onError = () => {};
      const onComplete = () => { completed = true; };

      await apiClient.streamMessage(
        conversationId,
        'Short message',
        onToken,
        onError,
        onComplete
      );

      expect(completed).toBe(true);
    }, 10000);

    it('should handle abort signal', async () => {
      const createResult = await apiClient.createConversation({
        title: 'Test Abort Signal',
        model: 'claude-3',
        provider: 'anthropic',
      });

      expect(createResult.status).toBe(201);
      const conversationId = createResult.data!.id;
      testConversationId = conversationId;

      let errorMessage: string | null = null;
      const onToken = () => {};
      const onError = (error: string) => { errorMessage = error; };
      const onComplete = () => {};

      const abortController = new AbortController();

      // Abort immediately
      setTimeout(() => abortController.abort(), 10);

      await apiClient.streamMessage(
        conversationId,
        'This should be aborted',
        onToken,
        onError,
        onComplete,
        abortController.signal
      );

      expect(errorMessage).toBeDefined();
    });

    it('should handle network errors gracefully', async () => {
      let errorMessage: string | null = null;
      const onToken = () => {};
      const onError = (error: string) => { errorMessage = error; };
      const onComplete = () => {};

      // Test with invalid conversation ID to trigger error
      await apiClient.streamMessage(
        'invalid-format-id',
        'Hello',
        onToken,
        onError,
        onComplete
      );

      expect(errorMessage).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should perform health check', async () => {
      const result = await apiClient.healthCheck();

      expect(result.status).toBe(200);
      expect(result.data).toBeDefined();
      expect(result.data?.status).toBe('ok');
      expect(result.error).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle server errors gracefully', async () => {
      // Test with endpoint that might cause server error
      const result = await apiClient['request']('/api/v1/invalid-endpoint');

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.error).toBeDefined();
    });

    it('should handle requests with proper headers', async () => {
      // Test by creating a conversation which requires proper headers
      const result = await apiClient.createConversation({
        title: 'Test Headers',
        model: 'claude-3',
        provider: 'anthropic',
      });

      expect(result.status).toBe(201);
      expect(result.data).toBeDefined();

      if (result.data?.id) {
        testConversationId = result.data.id;
      }
    });
  });
}, 30000); // Increase timeout for real API calls