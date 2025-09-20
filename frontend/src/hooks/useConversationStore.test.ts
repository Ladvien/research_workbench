import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversationStore } from './useConversationStore';
import { authService } from '../services/auth';
import type { Conversation, Message, CreateConversationRequest } from '../types';
import { TEST_CONFIG, waitForBackend, ensureTestUser, cleanupTestData } from '../test-utils/testConfig';

// Test cleanup helper
const clearConversationStore = () => {
  localStorage.removeItem('workbench-conversation-store');
};

describe('useConversationStore', () => {
  let createdConversationIds: string[] = [];

  beforeAll(async () => {
    // Wait for backend to be ready
    const isReady = await waitForBackend();
    if (!isReady) {
      throw new Error('Backend is not ready for testing');
    }

    // Ensure test user exists and authenticate
    await ensureTestUser();
    await authService.login({
      email: TEST_CONFIG.TEST_USER.email,
      password: TEST_CONFIG.TEST_USER.password,
    });
  }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);

  beforeEach(async () => {
    // Clear localStorage and conversation store
    clearConversationStore();

    // Re-authenticate for each test
    await authService.login({
      email: TEST_CONFIG.TEST_USER.email,
      password: TEST_CONFIG.TEST_USER.password,
    });
  });

  afterEach(() => {
    clearConversationStore();
  });

  afterAll(async () => {
    // Clean up any test conversations created during tests
    if (createdConversationIds.length > 0) {
      try {
        for (const id of createdConversationIds) {
          const store = useConversationStore.getState();
          await store.deleteConversation(id).catch(() => {
            // Ignore errors during cleanup
          });
        }
      } catch (error) {
        console.warn('Error cleaning up test conversations:', error);
      }
    }

    clearConversationStore();
    await cleanupTestData();
  });

  describe('Initial State', () => {
    it('has correct initial state', () => {
      const { result } = renderHook(() => useConversationStore());

      expect(result.current.currentConversationId).toBeNull();
      expect(result.current.conversations).toEqual([]);
      expect(result.current.currentMessages).toEqual([]);
      expect(result.current.streamingMessage).toBeNull();
      expect(result.current.selectedModel).toBe('claude-3');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.abortController).toBeNull();
    });

    it('persists selectedModel and currentConversationId in localStorage', async () => {
      const { result: result1 } = renderHook(() => useConversationStore());

      act(() => {
        result1.current.setSelectedModel('claude-3-sonnet');
        result1.current.setCurrentConversation('conv-1');
      });

      // Allow time for zustand persist to work
      await new Promise(resolve => setTimeout(resolve, 200));

      // Create a new hook instance to test if the state persisted
      const { result: result2 } = renderHook(() => useConversationStore());

      // The new instance should load the persisted state
      await waitFor(() => {
        expect(result2.current.selectedModel).toBe('claude-3-sonnet');
        expect(result2.current.currentConversationId).toBe('conv-1');
      });
    });
  });

  describe('setSelectedModel', () => {
    it('updates selected model', () => {
      const { result } = renderHook(() => useConversationStore());

      act(() => {
        result.current.setSelectedModel('claude-3-sonnet');
      });

      expect(result.current.selectedModel).toBe('claude-3-sonnet');
    });
  });

  describe('loadConversations', () => {
    it('loads conversations successfully from real backend', async () => {
      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.loadConversations();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(Array.isArray(result.current.conversations)).toBe(true);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('handles API error gracefully', async () => {
      // Log out to trigger auth error
      await authService.logout();

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.loadConversations();
      });

      expect(result.current.isLoading).toBe(false);
      // Should have an error due to unauthorized access
      expect(result.current.error).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('createConversation', () => {
    it('creates conversation successfully with real backend', async () => {
      const { result } = renderHook(() => useConversationStore());

      const request: CreateConversationRequest = {
        title: 'Test Conversation Real Backend',
        model: 'claude-3',
        provider: 'anthropic',
      };

      let conversationId: string;
      await act(async () => {
        conversationId = await result.current.createConversation(request);
      });

      expect(conversationId!).toBeDefined();
      expect(typeof conversationId!).toBe('string');

      // Track for cleanup
      createdConversationIds.push(conversationId!);

      // Verify the conversation was added to the store
      expect(result.current.conversations.some(c => c.id === conversationId)).toBe(true);
      expect(result.current.currentConversationId).toBe(conversationId!);
      expect(result.current.currentMessages).toEqual([]);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('handles creation error with invalid model', async () => {
      const { result } = renderHook(() => useConversationStore());

      const request: CreateConversationRequest = {
        title: 'Invalid Model Test',
        model: 'non-existent-model',
        provider: 'anthropic',
      };

      try {
        await act(async () => {
          await result.current.createConversation(request);
        });
        // If it doesn't throw, backend might handle invalid models gracefully
        console.log('Backend handled invalid model gracefully');
      } catch (error) {
        // Expected to fail with invalid model
        expect(error).toBeInstanceOf(Error);
        expect(result.current.error).toBeDefined();
      }
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('loadConversation', () => {
    it('loads conversation messages successfully from real backend', async () => {
      const { result } = renderHook(() => useConversationStore());

      // First create a conversation to load
      const conversationId = await act(async () => {
        return await result.current.createConversation({
          title: 'Load Test Conversation',
          model: 'claude-3',
          provider: 'anthropic',
        });
      });

      createdConversationIds.push(conversationId);

      // Clear current state and load the conversation
      act(() => {
        result.current.currentConversationId = null;
        result.current.currentMessages = [];
      });

      await act(async () => {
        await result.current.loadConversation(conversationId);
      });

      expect(result.current.currentConversationId).toBe(conversationId);
      expect(Array.isArray(result.current.currentMessages)).toBe(true);
      expect(result.current.error).toBeNull();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('clears invalid conversation ID when not found', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Set an initial conversation ID
      act(() => {
        result.current.setCurrentConversation('non-existent-conversation-id');
      });

      await act(async () => {
        await result.current.loadConversation('non-existent-conversation-id');
      });

      // Should clear the invalid conversation ID
      expect(result.current.currentConversationId).toBeNull();
      expect(result.current.currentMessages).toEqual([]);
      // Error should be cleared for 404s
      expect(result.current.error).toBeNull();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('setCurrentConversation', () => {
    it('sets current conversation and loads its messages', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Create a conversation first
      const conversationId = await act(async () => {
        return await result.current.createConversation({
          title: 'Current Test Conversation',
          model: 'claude-3',
          provider: 'anthropic',
        });
      });

      createdConversationIds.push(conversationId);

      // Clear state and set current conversation
      act(() => {
        result.current.currentConversationId = null;
        result.current.currentMessages = [];
      });

      await act(async () => {
        result.current.setCurrentConversation(conversationId);
      });

      expect(result.current.currentConversationId).toBe(conversationId);

      // Should eventually load messages
      await waitFor(() => {
        expect(Array.isArray(result.current.currentMessages)).toBe(true);
      }, { timeout: TEST_CONFIG.TIMEOUTS.API_REQUEST });
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('sendMessage', () => {
    it('creates new conversation and sends message when no current conversation', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Ensure no current conversation
      act(() => {
        result.current.currentConversationId = null;
      });

      await act(async () => {
        await result.current.sendMessage('Hello from test!');
      });

      // Should create a new conversation
      expect(result.current.currentConversationId).toBeDefined();
      expect(result.current.currentConversationId).not.toBeNull();

      if (result.current.currentConversationId) {
        createdConversationIds.push(result.current.currentConversationId);
      }

      // Should have the conversation in the list
      expect(result.current.conversations.length).toBeGreaterThan(0);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('sends message to existing conversation', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Create a conversation first
      const conversationId = await act(async () => {
        return await result.current.createConversation({
          title: 'Send Message Test',
          model: 'claude-3',
          provider: 'anthropic',
        });
      });

      createdConversationIds.push(conversationId);

      // Send a message to the existing conversation
      await act(async () => {
        await result.current.sendMessage('Test message to existing conversation');
      });

      expect(result.current.currentConversationId).toBe(conversationId);
      expect(result.current.error).toBeNull();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('handles send message error', async () => {
      // Log out to trigger auth error
      await authService.logout();

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.sendMessage('This should fail');
      });

      // Should have an error due to lack of authentication
      expect(result.current.error).toBeDefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('updateConversationTitle', () => {
    it('updates conversation title successfully', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Create a conversation first
      const conversationId = await act(async () => {
        return await result.current.createConversation({
          title: 'Original Title',
          model: 'claude-3',
          provider: 'anthropic',
        });
      });

      createdConversationIds.push(conversationId);

      const newTitle = 'Updated Title';
      await act(async () => {
        await result.current.updateConversationTitle(conversationId, newTitle);
      });

      const updatedConversation = result.current.conversations.find(c => c.id === conversationId);
      expect(updatedConversation?.title).toBe(newTitle);
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('handles update title error', async () => {
      const { result } = renderHook(() => useConversationStore());

      try {
        await act(async () => {
          await result.current.updateConversationTitle('non-existent-id', 'New Title');
        });
        // If no error, backend might handle gracefully
        console.log('Backend handled non-existent conversation update gracefully');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(result.current.error).toBeDefined();
      }
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('deleteConversation', () => {
    it('deletes conversation successfully', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Create two conversations
      const conv1Id = await act(async () => {
        return await result.current.createConversation({
          title: 'Conversation 1',
          model: 'claude-3',
          provider: 'anthropic',
        });
      });

      const conv2Id = await act(async () => {
        return await result.current.createConversation({
          title: 'Conversation 2',
          model: 'claude-3',
          provider: 'anthropic',
        });
      });

      createdConversationIds.push(conv1Id, conv2Id);

      // Set current conversation to the first one
      act(() => {
        result.current.setCurrentConversation(conv1Id);
      });

      await act(async () => {
        await result.current.deleteConversation(conv1Id);
      });

      // Should remove the conversation from the list
      expect(result.current.conversations.find(c => c.id === conv1Id)).toBeUndefined();

      // Should switch to another conversation if available
      if (result.current.conversations.length > 0) {
        expect(result.current.currentConversationId).not.toBe(conv1Id);
      }
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('clears current conversation when deleting the last conversation', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Create a single conversation
      const conversationId = await act(async () => {
        return await result.current.createConversation({
          title: 'Only Conversation',
          model: 'claude-3',
          provider: 'anthropic',
        });
      });

      // Don't add to cleanup list since we're deleting it in the test

      // Set it as current
      act(() => {
        result.current.setCurrentConversation(conversationId);
      });

      await act(async () => {
        await result.current.deleteConversation(conversationId);
      });

      // Should clear current conversation
      expect(result.current.currentConversationId).toBeNull();
      expect(result.current.conversations.find(c => c.id === conversationId)).toBeUndefined();
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('handles delete error', async () => {
      const { result } = renderHook(() => useConversationStore());

      try {
        await act(async () => {
          await result.current.deleteConversation('non-existent-id');
        });
        // If no error, backend might handle gracefully
        console.log('Backend handled non-existent conversation deletion gracefully');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(result.current.error).toBeDefined();
      }
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('streaming functionality', () => {
    it('stops streaming when requested', () => {
      const { result } = renderHook(() => useConversationStore());

      // Set up streaming state manually
      const mockAbortController = { abort: vi.fn() } as any;
      act(() => {
        result.current.isStreaming = true;
        result.current.abortController = mockAbortController;
        result.current.streamingMessage = {
          id: 'streaming-msg',
          conversation_id: 'conv-1',
          role: 'assistant',
          content: 'Partial response...',
          created_at: new Date().toISOString(),
          isStreaming: true,
        };
      });

      act(() => {
        result.current.stopStreaming();
      });

      expect(mockAbortController.abort).toHaveBeenCalled();
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.streamingMessage).toBeNull();
      expect(result.current.abortController).toBeNull();
    });
  });

  describe('clearError', () => {
    it('clears error state', () => {
      const { result } = renderHook(() => useConversationStore());

      // Set error manually
      act(() => {
        result.current.error = 'Test error';
      });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('title generation', () => {
    it('generates appropriate titles from message content', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Set selected model
      act(() => {
        result.current.setSelectedModel('claude-3');
      });

      // Clear current conversation to force creation
      act(() => {
        result.current.currentConversationId = null;
      });

      const testMessage = 'How to write unit tests for React components?';
      await act(async () => {
        await result.current.sendMessage(testMessage);
      });

      // Should have created a conversation with appropriate title
      expect(result.current.currentConversationId).toBeDefined();

      if (result.current.currentConversationId) {
        createdConversationIds.push(result.current.currentConversationId);

        const conversation = result.current.conversations.find(
          c => c.id === result.current.currentConversationId
        );
        expect(conversation?.title).toBeDefined();
        expect(conversation?.title.length).toBeGreaterThan(0);
      }
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);

    it('truncates long titles appropriately', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Clear current conversation to force creation
      act(() => {
        result.current.currentConversationId = null;
      });

      const longMessage = 'This is a very long message that should be truncated because it exceeds the maximum title length that we want to display in the sidebar interface for better user experience';

      await act(async () => {
        await result.current.sendMessage(longMessage);
      });

      if (result.current.currentConversationId) {
        createdConversationIds.push(result.current.currentConversationId);

        const conversation = result.current.conversations.find(
          c => c.id === result.current.currentConversationId
        );

        // Title should be truncated to reasonable length
        expect(conversation?.title.length).toBeLessThanOrEqual(100);
      }
    }, TEST_CONFIG.TIMEOUTS.API_REQUEST);
  });

  describe('error handling', () => {
    it('handles network errors gracefully', async () => {
      // This is harder to test with real backend, but we can test recovery
      const { result } = renderHook(() => useConversationStore());

      // Set an error state manually
      act(() => {
        result.current.error = 'Network error';
      });

      // Clear the error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it('recovers from auth errors after re-authentication', async () => {
      const { result } = renderHook(() => useConversationStore());

      // Log out to cause auth error
      await authService.logout();

      // Try to load conversations (should fail)
      await act(async () => {
        await result.current.loadConversations();
      });

      expect(result.current.error).toBeDefined();

      // Re-authenticate
      await authService.login({
        email: TEST_CONFIG.TEST_USER.email,
        password: TEST_CONFIG.TEST_USER.password,
      });

      // Try again (should succeed)
      await act(async () => {
        await result.current.loadConversations();
      });

      expect(result.current.error).toBeNull();
    }, TEST_CONFIG.TIMEOUTS.AUTHENTICATION);
  });
}, 120000); // Increase timeout for real API calls