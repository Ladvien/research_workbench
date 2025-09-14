import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversationStore } from '../../src/hooks/useConversationStore';
import { apiClient } from '../../src/services/api';
import type { Conversation, Message, ConversationWithMessages } from '../../src/types';

// Mock the API client
vi.mock('../../src/services/api');

const mockApiClient = vi.mocked(apiClient);

const mockConversations: Conversation[] = [
  {
    id: '1',
    user_id: 'user1',
    title: 'Test Conversation',
    model: 'gpt-4',
    created_at: '2025-09-14T10:00:00Z',
    updated_at: '2025-09-14T10:30:00Z',
    metadata: {}
  }
];

const mockMessages: Message[] = [
  {
    id: 'msg1',
    conversation_id: '1',
    role: 'user',
    content: 'Hello',
    created_at: '2025-09-14T10:00:00Z',
    is_active: true,
    metadata: {}
  },
  {
    id: 'msg2',
    conversation_id: '1',
    role: 'assistant',
    content: 'Hi there!',
    created_at: '2025-09-14T10:01:00Z',
    is_active: true,
    metadata: {}
  }
];

const mockConversationWithMessages: ConversationWithMessages = {
  conversation: mockConversations[0],
  messages: mockMessages
};

describe('useConversationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the store state before each test
    useConversationStore.getState().conversations = [];
    useConversationStore.getState().currentConversationId = null;
    useConversationStore.getState().currentMessages = [];
    useConversationStore.getState().isLoading = false;
    useConversationStore.getState().error = null;
  });

  describe('initial state', () => {
    it('has correct initial state', () => {
      const { result } = renderHook(() => useConversationStore());

      expect(result.current.currentConversationId).toBe(null);
      expect(result.current.conversations).toEqual([]);
      expect(result.current.currentMessages).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
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

      expect(mockApiClient.getConversations).toHaveBeenCalled();
      expect(result.current.conversations).toEqual(mockConversations);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('handles load conversations error', async () => {
      mockApiClient.getConversations.mockResolvedValue({
        error: 'Failed to load conversations',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.loadConversations();
      });

      expect(result.current.conversations).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Failed to load conversations');
    });
  });

  describe('loadConversation', () => {
    it('loads conversation with messages successfully', async () => {
      mockApiClient.getConversation.mockResolvedValue({
        data: mockConversationWithMessages,
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.loadConversation('1');
      });

      expect(mockApiClient.getConversation).toHaveBeenCalledWith('1');
      expect(result.current.currentConversationId).toBe('1');
      expect(result.current.currentMessages).toEqual(mockMessages);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('handles load conversation error', async () => {
      mockApiClient.getConversation.mockResolvedValue({
        error: 'Conversation not found',
        status: 404
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.loadConversation('1');
      });

      expect(result.current.currentMessages).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Conversation not found');
    });
  });

  describe('createConversation', () => {
    it('creates conversation successfully', async () => {
      const newConversation = { ...mockConversations[0], id: 'new-id' };
      mockApiClient.createConversation.mockResolvedValue({
        data: newConversation,
        status: 201
      });

      const { result } = renderHook(() => useConversationStore());

      let createdId: string = '';
      await act(async () => {
        createdId = await result.current.createConversation({
          title: 'New Conversation',
          model: 'gpt-4'
        });
      });

      expect(mockApiClient.createConversation).toHaveBeenCalledWith({
        title: 'New Conversation',
        model: 'gpt-4'
      });
      expect(createdId).toBe('new-id');
      expect(result.current.conversations).toContainEqual(newConversation);
      expect(result.current.currentConversationId).toBe('new-id');
      expect(result.current.currentMessages).toEqual([]);
    });

    it('handles create conversation error', async () => {
      mockApiClient.createConversation.mockResolvedValue({
        error: 'Failed to create conversation',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await expect(result.current.createConversation({
          title: 'New Conversation',
          model: 'gpt-4'
        })).rejects.toThrow('Failed to create conversation');
      });

      expect(result.current.error).toBe('Failed to create conversation');
    });
  });

  describe('sendMessage', () => {
    it('creates new conversation and sends message when no current conversation', async () => {
      const newConversation = { ...mockConversations[0], id: 'new-id' };
      mockApiClient.createConversation.mockResolvedValue({
        data: newConversation,
        status: 201
      });

      mockApiClient.sendMessage.mockResolvedValue({
        data: { messageId: 'new-msg' },
        status: 200
      });

      mockApiClient.getConversation.mockResolvedValue({
        data: mockConversationWithMessages,
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.sendMessage('Hello world');
      });

      expect(mockApiClient.createConversation).toHaveBeenCalledWith({
        title: 'Hello world',
        model: 'gpt-4'
      });
    });

    it('sends message to existing conversation', async () => {
      mockApiClient.sendMessage.mockResolvedValue({
        data: { messageId: 'new-msg' },
        status: 200
      });

      mockApiClient.getConversation.mockResolvedValue({
        data: mockConversationWithMessages,
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      // Set current conversation
      act(() => {
        result.current.setCurrentConversation('1');
      });

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(mockApiClient.sendMessage).toHaveBeenCalledWith('1', 'Test message');
      expect(mockApiClient.getConversation).toHaveBeenCalledWith('1');
    });

    it('handles send message error', async () => {
      mockApiClient.sendMessage.mockResolvedValue({
        error: 'Failed to send message',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      // Set current conversation
      act(() => {
        result.current.setCurrentConversation('1');
      });

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(result.current.error).toBe('Failed to send message');
    });
  });

  describe('updateConversationTitle', () => {
    beforeEach(() => {
      // Set up initial state with conversations
      act(() => {
        useConversationStore.setState({
          conversations: mockConversations
        });
      });
    });

    it('updates conversation title successfully', async () => {
      mockApiClient.updateConversationTitle.mockResolvedValue({
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.updateConversationTitle('1', 'Updated Title');
      });

      expect(mockApiClient.updateConversationTitle).toHaveBeenCalledWith('1', 'Updated Title');

      const updatedConversation = result.current.conversations.find(c => c.id === '1');
      expect(updatedConversation?.title).toBe('Updated Title');
    });

    it('handles update title error', async () => {
      mockApiClient.updateConversationTitle.mockResolvedValue({
        error: 'Failed to update title',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await expect(result.current.updateConversationTitle('1', 'Updated Title'))
          .rejects.toThrow('Failed to update title');
      });

      expect(result.current.error).toBe('Failed to update title');
    });
  });

  describe('deleteConversation', () => {
    beforeEach(() => {
      // Set up initial state with conversations
      act(() => {
        useConversationStore.setState({
          conversations: [...mockConversations, { ...mockConversations[0], id: '2', title: 'Conversation 2' }],
          currentConversationId: '1',
          currentMessages: mockMessages
        });
      });
    });

    it('deletes conversation successfully', async () => {
      mockApiClient.deleteConversation.mockResolvedValue({
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.deleteConversation('1');
      });

      expect(mockApiClient.deleteConversation).toHaveBeenCalledWith('1');
      expect(result.current.conversations).not.toContainEqual(mockConversations[0]);
      expect(result.current.currentConversationId).toBe('2'); // Should switch to next conversation
      expect(result.current.currentMessages).toEqual([]); // Should clear messages
    });

    it('clears current conversation when deleting last conversation', async () => {
      mockApiClient.deleteConversation.mockResolvedValue({
        status: 200
      });

      // Set up state with only one conversation
      act(() => {
        useConversationStore.setState({
          conversations: [mockConversations[0]],
          currentConversationId: '1',
          currentMessages: mockMessages
        });
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.deleteConversation('1');
      });

      expect(result.current.conversations).toEqual([]);
      expect(result.current.currentConversationId).toBe(null);
      expect(result.current.currentMessages).toEqual([]);
    });

    it('handles delete conversation error', async () => {
      mockApiClient.deleteConversation.mockResolvedValue({
        error: 'Failed to delete conversation',
        status: 500
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await expect(result.current.deleteConversation('1'))
          .rejects.toThrow('Failed to delete conversation');
      });

      expect(result.current.error).toBe('Failed to delete conversation');
    });
  });

  describe('title generation', () => {
    it('generates title from short messages', async () => {
      const newConversation = { ...mockConversations[0], id: 'new-id' };
      mockApiClient.createConversation.mockResolvedValue({
        data: newConversation,
        status: 201
      });

      mockApiClient.sendMessage.mockResolvedValue({
        data: { messageId: 'new-msg' },
        status: 200
      });

      mockApiClient.getConversation.mockResolvedValue({
        data: mockConversationWithMessages,
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.sendMessage('Hi there');
      });

      expect(mockApiClient.createConversation).toHaveBeenCalledWith({
        title: 'Hi there',
        model: 'gpt-4'
      });
    });

    it('generates title from first sentence', async () => {
      const newConversation = { ...mockConversations[0], id: 'new-id' };
      mockApiClient.createConversation.mockResolvedValue({
        data: newConversation,
        status: 201
      });

      mockApiClient.sendMessage.mockResolvedValue({
        data: { messageId: 'new-msg' },
        status: 200
      });

      mockApiClient.getConversation.mockResolvedValue({
        data: mockConversationWithMessages,
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      await act(async () => {
        await result.current.sendMessage('Hello world! How are you today?');
      });

      expect(mockApiClient.createConversation).toHaveBeenCalledWith({
        title: 'Hello world',
        model: 'gpt-4'
      });
    });

    it('truncates long titles at word boundary', async () => {
      const newConversation = { ...mockConversations[0], id: 'new-id' };
      mockApiClient.createConversation.mockResolvedValue({
        data: newConversation,
        status: 201
      });

      mockApiClient.sendMessage.mockResolvedValue({
        data: { messageId: 'new-msg' },
        status: 200
      });

      mockApiClient.getConversation.mockResolvedValue({
        data: mockConversationWithMessages,
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      const longMessage = 'This is a very long message that should be truncated at a word boundary to create a reasonable title';

      await act(async () => {
        await result.current.sendMessage(longMessage);
      });

      const createCall = mockApiClient.createConversation.mock.calls[0][0];
      expect(createCall.title.length).toBeLessThanOrEqual(40);
      expect(createCall.title).not.toEndWith(' '); // Should not end with space
      expect(createCall.title.split(' ').length).toBeGreaterThan(1); // Should contain multiple words
    });
  });

  describe('setCurrentConversation', () => {
    it('sets current conversation and loads it', () => {
      mockApiClient.getConversation.mockResolvedValue({
        data: mockConversationWithMessages,
        status: 200
      });

      const { result } = renderHook(() => useConversationStore());

      act(() => {
        result.current.setCurrentConversation('1');
      });

      expect(result.current.currentConversationId).toBe('1');
      expect(mockApiClient.getConversation).toHaveBeenCalledWith('1');
    });
  });

  describe('clearError', () => {
    it('clears error state', () => {
      const { result } = renderHook(() => useConversationStore());

      // Set error state
      act(() => {
        useConversationStore.setState({ error: 'Test error' });
      });

      expect(result.current.error).toBe('Test error');

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });
});