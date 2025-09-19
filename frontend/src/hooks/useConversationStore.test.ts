import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversationStore } from './useConversationStore';
import { apiClient } from '../services/api';
import type { Conversation, Message, CreateConversationRequest } from '../types';

// Mock the API client
vi.mock('../services/api');
const mockApiClient = vi.mocked(apiClient);

// Mock the error handling utilities
vi.mock('../utils/errorHandling', () => ({
  categorizeError: vi.fn((error) => ({
    userMessage: `Categorized: ${error}`,
    technicalMessage: error,
    isRetryable: true,
    category: 'server',
    suggestions: []
  })),
  formatErrorForUser: vi.fn((error, fallback) => {
    if (typeof error === 'string') return `Formatted: ${error}`;
    if (error instanceof Error) return `Formatted: ${error.message}`;
    return fallback || 'Formatted: Unknown error';
  })
}));

// Mock UUID
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-' + Date.now()
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Test data
const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    user_id: 'user-1',
    title: 'Test Conversation 1',
    model: 'claude-code-opus',
    provider: 'anthropic',
    created_at: '2025-09-18T10:00:00Z',
    updated_at: '2025-09-18T10:30:00Z',
    metadata: {}
  },
  {
    id: 'conv-2',
    user_id: 'user-1',
    title: 'Test Conversation 2',
    model: 'gpt-4',
    provider: 'open_a_i',
    created_at: '2025-09-18T09:00:00Z',
    updated_at: '2025-09-18T09:30:00Z',
    metadata: {}
  }
];

const mockMessages: Message[] = [
  {
    id: 'msg-1',
    conversation_id: 'conv-1',
    role: 'user',
    content: 'Hello, world!',
    created_at: '2025-09-18T10:00:00Z',
    is_active: true,
    metadata: {}
  },
  {
    id: 'msg-2',
    conversation_id: 'conv-1',
    role: 'assistant',
    content: 'Hello! How can I help you today?',
    created_at: '2025-09-18T10:01:00Z',
    is_active: true,
    metadata: {}
  }
];

describe('useConversationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage
    localStorageMock.clear();
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();

    // Clear any existing zustand persistence
    localStorage.removeItem('workbench-conversation-store');

    // Reset the store by ensuring getItem returns null for the store key
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'workbench-conversation-store') {
        return null;
      }
      return null;
    });
  });

  afterEach(() => {
    // Clear localStorage mock
    localStorageMock.clear();
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();

    // Clear any existing zustand persistence
    localStorage.removeItem('workbench-conversation-store');
  });

  describe('Initial State', () => {
    it('has correct initial state', () => {
      const { result } = renderHook(() => useConversationStore());

      expect(result.current.currentConversationId).toBeNull();
      expect(result.current.conversations).toEqual([]);
      expect(result.current.currentMessages).toEqual([]);
      expect(result.current.streamingMessage).toBeNull();
      expect(result.current.selectedModel).toBe('claude-code-opus');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.abortController).toBeNull();
    });

    it('persists selectedModel and currentConversationId in localStorage', async () => {
      const { result: result1 } = renderHook(() => useConversationStore());

      act(() => {
        result1.current.setSelectedModel('gpt-4');
        result1.current.setCurrentConversation('conv-1');
      });

      // Allow time for zustand persist to work
      await new Promise(resolve => setTimeout(resolve, 200));

      // Create a new hook instance to test if the state persisted
      const { result: result2 } = renderHook(() => useConversationStore());

      // The new instance should load the persisted state
      expect(result2.current.selectedModel).toBe('gpt-4');
      expect(result2.current.currentConversationId).toBe('conv-1');
    });
  });

  describe('setCurrentConversation', () => {
    it('sets current conversation and loads its messages', async () => {
      mockApiClient.getConversation.mockResolvedValue({
        data: { conversation: mockConversations[0], messages: mockMessages },
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        result.current.setCurrentConversation('conv-1');
      });

      expect(result.current.currentConversationId).toBe('conv-1');
      await waitFor(() => {
        expect(mockApiClient.getConversation).toHaveBeenCalledWith('conv-1');
        expect(result.current.currentMessages).toEqual(mockMessages);
      });
    });
  });

  describe('setSelectedModel', () => {
    it('updates selected model', () => {
      const { result } = renderHook(() => useConversationStore());

      act(() => {
        result.current.setSelectedModel('gpt-4');
      });

      expect(result.current.selectedModel).toBe('gpt-4');
    });
  });

  describe('loadConversations', () => {
    it('loads conversations successfully', async () => {
      mockApiClient.getConversations.mockResolvedValue({
        data: mockConversations,
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.loadConversations();
      });

      expect(result.current.conversations).toEqual(mockConversations);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('handles API error', async () => {
      mockApiClient.getConversations.mockResolvedValue({
        error: 'Failed to load conversations',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.loadConversations();
      });

      expect(result.current.error).toBe('Failed to load conversations');
      expect(result.current.isLoading).toBe(false);
    });

    it('handles network error', async () => {
      mockApiClient.getConversations.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.loadConversations();
      });

      expect(result.current.error).toContain('Formatted');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('loadConversation', () => {
    it('loads conversation messages successfully', async () => {
      mockApiClient.getConversation.mockResolvedValue({
        data: { conversation: mockConversations[0], messages: mockMessages },
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.loadConversation('conv-1');
      });

      expect(result.current.currentMessages).toEqual(mockMessages);
      expect(result.current.currentConversationId).toBe('conv-1');
      expect(result.current.error).toBeNull();
    });

    it('clears invalid conversation ID when not found', async () => {
      mockApiClient.getConversation.mockResolvedValue({
        error: 'Conversation not found',
        status: 404
      });

      const { result } = renderHook(() => useConversationStore());

      // Set an initial conversation ID
      act(() => {
        result.current.setCurrentConversation('invalid-id');
      });

      await act(async () => {
        await result.current.loadConversation('invalid-id');
      });

      expect(result.current.currentConversationId).toBeNull();
      expect(result.current.currentMessages).toEqual([]);
      expect(result.current.error).toBeNull(); // Error should be cleared for 404s
    });
  });

  describe('createConversation', () => {
    it('creates conversation successfully', async () => {
      const newConversation: Conversation = {
        id: 'new-conv',
        user_id: 'user-1',
        title: 'New Conversation',
        model: 'claude-code-opus',
        provider: 'anthropic',
        created_at: '2025-09-18T11:00:00Z',
        updated_at: '2025-09-18T11:00:00Z',
        metadata: {}
      };

      mockApiClient.createConversation.mockResolvedValue({
        data: newConversation,
        status: 201
      });

      const { result } = renderHook(() => useConversationStore());

      const request: CreateConversationRequest = {
        title: 'New Conversation',
        model: 'claude-code-opus'
      };

      let conversationId: string;
      await act(async () => {
        conversationId = await result.current.createConversation(request);
      });

      expect(conversationId!).toBe('new-conv');
      expect(result.current.conversations).toContainEqual(newConversation);
      expect(result.current.currentConversationId).toBe('new-conv');
      expect(result.current.currentMessages).toEqual([]);
    });

    it('handles creation error', async () => {
      mockApiClient.createConversation.mockResolvedValue({
        error: 'Failed to create conversation',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      const request: CreateConversationRequest = {
        title: 'New Conversation',
        model: 'claude-code-opus'
      };

      // Test the error case
      await expect(result.current.createConversation(request)).rejects.toThrow();

      // The error should be set in the store with the mocked format
      expect(result.current.error).toContain('Formatted');
    });
  });

  describe('sendMessage', () => {
    it('creates new conversation and sends message when no current conversation', async () => {
      const newConversation: Conversation = {
        id: 'auto-conv',
        user_id: 'user-1',
        title: 'Hello world',
        model: 'claude-code-opus',
        provider: 'anthropic',
        created_at: '2025-09-18T11:00:00Z',
        updated_at: '2025-09-18T11:00:00Z',
        metadata: {}
      };

      mockApiClient.createConversation.mockResolvedValue({
        data: newConversation,
        status: 201
      });
      mockApiClient.sendMessage.mockResolvedValue({ status: 200 });
      mockApiClient.getConversation.mockResolvedValue({
        data: { conversation: newConversation, messages: [] },
        status: 200
      });

      // Reset localStorage to ensure clean state for this test
      localStorage.removeItem('workbench-conversation-store');

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.sendMessage('Hello world!');
      });

      expect(mockApiClient.createConversation).toHaveBeenCalledWith({
        title: 'Hello world!',
        model: 'claude-code-opus'
      });
      expect(result.current.currentConversationId).toBe('auto-conv');
    });

    it('sends message to existing conversation', async () => {
      mockApiClient.sendMessage.mockResolvedValue({ status: 200 });
      mockApiClient.getConversation.mockResolvedValue({
        data: { conversation: mockConversations[0], messages: [...mockMessages] },
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      // Set current conversation
      act(() => {
        result.current.setCurrentConversation('conv-1');
      });

      await act(async () => {
        await result.current.sendMessage('New message');
      });

      expect(mockApiClient.sendMessage).toHaveBeenCalledWith('conv-1', 'New message');
    });

    it('handles send message error', async () => {
      mockApiClient.sendMessage.mockResolvedValue({
        error: 'Failed to send message',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      // Set current conversation
      act(() => {
        result.current.setCurrentConversation('conv-1');
      });

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(result.current.error).toBe('Failed to send message');
    });
  });

  describe('updateConversationTitle', () => {
    it('updates conversation title successfully', async () => {
      mockApiClient.updateConversationTitle.mockResolvedValue({ status: 200 });

      const { result } = renderHook(() => useConversationStore());

      // Set initial conversations
      act(() => {
        result.current.conversations = mockConversations;
      });

      await act(async () => {
        await result.current.updateConversationTitle('conv-1', 'Updated Title');
      });

      const updatedConversation = result.current.conversations.find(c => c.id === 'conv-1');
      expect(updatedConversation?.title).toBe('Updated Title');
      expect(mockApiClient.updateConversationTitle).toHaveBeenCalledWith('conv-1', 'Updated Title');
    });

    it('handles update title error', async () => {
      mockApiClient.updateConversationTitle.mockResolvedValue({
        error: 'Failed to update title',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      await expect(result.current.updateConversationTitle('conv-1', 'New Title')).rejects.toThrow();

      expect(result.current.error).toContain('Formatted');
    });
  });

  describe('deleteConversation', () => {
    it('deletes conversation successfully', async () => {
      mockApiClient.deleteConversation.mockResolvedValue({ status: 200 });

      const { result } = renderHook(() => useConversationStore());

      // Set initial conversations and current conversation
      act(() => {
        result.current.conversations = mockConversations;
        result.current.currentConversationId = 'conv-1';
      });

      await act(async () => {
        await result.current.deleteConversation('conv-1');
      });

      expect(result.current.conversations).not.toContain(
        expect.objectContaining({ id: 'conv-1' })
      );
      expect(result.current.currentConversationId).toBe('conv-2'); // Should switch to next available
    });

    it('clears current conversation when deleting the last conversation', async () => {
      mockApiClient.deleteConversation.mockResolvedValue({ status: 200 });

      const { result } = renderHook(() => useConversationStore());

      // Set single conversation
      act(() => {
        result.current.conversations = [mockConversations[0]];
        result.current.currentConversationId = 'conv-1';
      });

      await act(async () => {
        await result.current.deleteConversation('conv-1');
      });

      expect(result.current.conversations).toEqual([]);
      expect(result.current.currentConversationId).toBeNull();
    });

    it('handles delete error', async () => {
      mockApiClient.deleteConversation.mockResolvedValue({
        error: 'Failed to delete conversation',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      await expect(result.current.deleteConversation('conv-1')).rejects.toThrow();

      expect(result.current.error).toContain('Formatted');
    });
  });

  describe('streaming functionality', () => {
    it('stops streaming when requested', () => {
      const { result } = renderHook(() => useConversationStore());

      // Set up streaming state
      const mockAbortController = { abort: vi.fn() } as any;
      act(() => {
        result.current.isStreaming = true;
        result.current.abortController = mockAbortController;
        result.current.streamingMessage = {
          id: 'streaming-msg',
          conversation_id: 'conv-1',
          role: 'assistant',
          content: 'Partial response...',
          created_at: '2025-09-18T11:00:00Z',
          isStreaming: true
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

      // Set error
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
      const newConversation: Conversation = {
        id: 'title-test',
        user_id: 'user-1',
        title: 'How to write unit tests',
        model: 'claude-code-opus',
        provider: 'anthropic',
        created_at: '2025-09-18T11:00:00Z',
        updated_at: '2025-09-18T11:00:00Z',
        metadata: {}
      };

      mockApiClient.createConversation.mockResolvedValue({
        data: newConversation,
        status: 201
      });
      mockApiClient.sendMessage.mockResolvedValue({ status: 200 });
      mockApiClient.getConversation.mockResolvedValue({
        data: { conversation: newConversation, messages: [] },
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      // Explicitly set the selectedModel for this test
      act(() => {
        result.current.setSelectedModel('claude-code-opus');
      });

      // Ensure the selectedModel is set correctly
      expect(result.current.selectedModel).toBe('claude-code-opus');

      await act(async () => {
        await result.current.sendMessage('How to write unit tests for React components?');
      });

      await waitFor(() => {
        expect(mockApiClient.createConversation).toHaveBeenCalled();
      });

      // Check the actual call made to createConversation
      const createCall = mockApiClient.createConversation.mock.calls[0];
      expect(createCall[0]).toEqual({
        title: 'How to write unit tests for React components',
        model: 'claude-code-opus'
      });
    });

    it('truncates long titles appropriately', async () => {
      const longMessage = 'This is a very long message that should be truncated because it exceeds the maximum title length that we want to display in the sidebar interface';

      const newConversation: Conversation = {
        id: 'truncate-test',
        user_id: 'user-1',
        title: 'This is a very long message that should be',
        model: 'claude-code-opus',
        provider: 'anthropic',
        created_at: '2025-09-18T11:00:00Z',
        updated_at: '2025-09-18T11:00:00Z',
        metadata: {}
      };

      mockApiClient.createConversation.mockResolvedValue({
        data: newConversation,
        status: 201
      });

      // Reset localStorage to ensure clean state for this test
      localStorage.removeItem('workbench-conversation-store');

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.sendMessage(longMessage);
      });

      // Wait for the API call to be made
      await waitFor(() => {
        expect(mockApiClient.createConversation).toHaveBeenCalled();
      });

      // Should be called with truncated title
      const createCall = mockApiClient.createConversation.mock.calls[0];
      expect(createCall).toBeDefined();
      expect(createCall[0].title.length).toBeLessThanOrEqual(50);
    });
  });
});