import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatWithConversation } from './useChatWithConversation';
import { useConversationStore } from './useConversationStore';

// Mock the AI SDK's useChat hook
const mockUseChat = vi.fn();
vi.mock('@ai-sdk/react', () => ({
  useChat: (props: any) => mockUseChat(props),
}));

// Mock the conversation store
vi.mock('./useConversationStore', () => ({
  useConversationStore: vi.fn(),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

describe('useChatWithConversation Hook', () => {
  const mockConversationStore = {
    currentConversationId: null as string | null,
    conversations: [],
    selectedModel: 'gpt-4',
    currentMessages: [],
    createConversation: vi.fn(),
    loadConversation: vi.fn(),
    setCurrentConversation: vi.fn(),
  };

  const mockChatHook = {
    messages: [],
    input: '',
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
    error: null,
    reload: vi.fn(),
    stop: vi.fn(),
    append: vi.fn(),
    setMessages: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup store mock
    (useConversationStore as any).mockReturnValue(mockConversationStore);
    (useConversationStore as any).getState = () => mockConversationStore;

    // Setup useChat mock
    mockUseChat.mockImplementation((config) => {
      // Store the config for assertions
      mockChatHook.handleSubmit = vi.fn((e) => {
        if (e) e.preventDefault();
        config.onFinish?.({ role: 'assistant', content: 'Response' });
      });
      return mockChatHook;
    });
  });

  describe('Initialization', () => {
    it('initializes with correct API endpoint when no conversation exists', () => {
      renderHook(() => useChatWithConversation());

      expect(mockUseChat).toHaveBeenCalledWith(
        expect.objectContaining({
          api: '/api/v1/conversations/stream',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: {
            model: 'gpt-4',
            conversationId: null,
          },
        })
      );
    });

    it('initializes with conversation-specific endpoint when conversation exists', () => {
      mockConversationStore.currentConversationId = 'conv-123';

      renderHook(() => useChatWithConversation());

      expect(mockUseChat).toHaveBeenCalledWith(
        expect.objectContaining({
          api: '/api/v1/conversations/conv-123/stream',
          body: {
            model: 'gpt-4',
            conversationId: 'conv-123',
          },
        })
      );
    });
  });

  describe('Conversation Creation', () => {
    it('creates new conversation on first message', async () => {
      mockChatHook.input = 'Hello, this is my first message';
      mockConversationStore.createConversation.mockResolvedValue('new-conv-id');

      const { result } = renderHook(() => useChatWithConversation());

      await act(async () => {
        const event = { preventDefault: vi.fn() } as any;
        await result.current.handleSubmit(event);
      });

      expect(mockConversationStore.createConversation).toHaveBeenCalledWith({
        title: 'Hello, this is my first message',
        model: 'gpt-4',
      });
    });

    it('truncates long messages for conversation title', async () => {
      const longMessage = 'A'.repeat(100);
      mockChatHook.input = longMessage;
      mockConversationStore.createConversation.mockResolvedValue('new-conv-id');

      const { result } = renderHook(() => useChatWithConversation());

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockConversationStore.createConversation).toHaveBeenCalledWith({
        title: 'A'.repeat(50),
        model: 'gpt-4',
      });
    });

    it('uses default title when input is empty', async () => {
      mockChatHook.input = '';
      mockConversationStore.createConversation.mockResolvedValue('new-conv-id');

      const { result } = renderHook(() => useChatWithConversation());

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockConversationStore.createConversation).toHaveBeenCalledWith({
        title: 'New Conversation',
        model: 'gpt-4',
      });
    });

    it('submits message after conversation creation', async () => {
      mockChatHook.input = 'Test message';
      mockConversationStore.createConversation.mockResolvedValue('new-conv-id');

      const { result } = renderHook(() => useChatWithConversation());

      await act(async () => {
        await result.current.handleSubmit();
      });

      await waitFor(() => {
        expect(mockChatHook.handleSubmit).toHaveBeenCalled();
      }, { timeout: 200 });
    });

    it('handles conversation creation failure', async () => {
      mockChatHook.input = 'Test message';
      mockConversationStore.createConversation.mockRejectedValue(new Error('Creation failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useChatWithConversation());

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(consoleSpy).toHaveBeenCalledWith('Failed to create conversation:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('prevents duplicate conversation creation', async () => {
      mockChatHook.input = 'Test message';
      mockConversationStore.createConversation.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('new-conv-id'), 100))
      );

      const { result } = renderHook(() => useChatWithConversation());

      // Submit multiple times quickly
      await act(async () => {
        result.current.handleSubmit();
        result.current.handleSubmit();
        result.current.handleSubmit();
      });

      // Should only create one conversation
      expect(mockConversationStore.createConversation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Existing Conversation', () => {
    it('submits directly when conversation exists', async () => {
      mockConversationStore.currentConversationId = 'existing-conv';
      mockChatHook.input = 'New message';

      const { result } = renderHook(() => useChatWithConversation());

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(mockConversationStore.createConversation).not.toHaveBeenCalled();
      expect(mockChatHook.handleSubmit).toHaveBeenCalled();
    });

    it('reloads conversation after message finishes', async () => {
      mockConversationStore.currentConversationId = 'conv-123';
      mockConversationStore.loadConversation.mockResolvedValue(undefined);

      renderHook(() => useChatWithConversation());

      // Get the onFinish callback from the useChat call
      const onFinish = mockUseChat.mock.calls[0][0].onFinish;

      await act(async () => {
        onFinish({ role: 'assistant', content: 'Response text' });
      });

      expect(mockConversationStore.loadConversation).toHaveBeenCalledWith('conv-123');
    });
  });

  describe('Message Synchronization', () => {
    it('loads and converts messages when conversation changes', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          created_at: '2024-01-01T12:00:00Z',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          created_at: '2024-01-01T12:01:00Z',
        },
      ];

      mockConversationStore.currentMessages = mockMessages;
      mockConversationStore.loadConversation.mockResolvedValue(undefined);

      // Start with no conversation
      const { rerender } = renderHook(() => useChatWithConversation());

      // Change to a conversation
      mockConversationStore.currentConversationId = 'conv-123';
      rerender();

      await waitFor(() => {
        expect(mockConversationStore.loadConversation).toHaveBeenCalledWith('conv-123');
      });

      await waitFor(() => {
        expect(mockChatHook.setMessages).toHaveBeenCalledWith([
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            createdAt: new Date('2024-01-01T12:00:00Z'),
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Hi there',
            createdAt: new Date('2024-01-01T12:01:00Z'),
          },
        ]);
      });
    });

    it('clears messages when conversation is removed', () => {
      mockConversationStore.currentConversationId = 'conv-123';

      const { rerender } = renderHook(() => useChatWithConversation());

      // Clear conversation
      mockConversationStore.currentConversationId = null;
      rerender();

      expect(mockChatHook.setMessages).toHaveBeenCalledWith([]);
    });
  });

  describe('Loading States', () => {
    it('combines loading states from chat and conversation creation', () => {
      mockChatHook.isLoading = true;

      const { result } = renderHook(() => useChatWithConversation());

      expect(result.current.isLoading).toBe(true);
    });

    it('shows loading during conversation creation', async () => {
      mockChatHook.input = 'Test';
      mockConversationStore.createConversation.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('new-conv'), 100))
      );

      const { result } = renderHook(() => useChatWithConversation());

      act(() => {
        result.current.handleSubmit();
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 200 });
    });
  });

  describe('Error Handling', () => {
    it('logs errors from chat', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderHook(() => useChatWithConversation());

      const onError = mockUseChat.mock.calls[0][0].onError;
      const error = new Error('Chat error');

      onError(error);

      expect(consoleSpy).toHaveBeenCalledWith('Chat error:', error);
      consoleSpy.mockRestore();
    });

    it('logs message completion', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      renderHook(() => useChatWithConversation());

      const onFinish = mockUseChat.mock.calls[0][0].onFinish;
      const message = { role: 'assistant', content: 'Test response' };

      onFinish(message);

      expect(consoleSpy).toHaveBeenCalledWith('Message finished:', message);
      consoleSpy.mockRestore();
    });
  });

  describe('Return Values', () => {
    it('returns all necessary chat and conversation properties', () => {
      mockConversationStore.currentConversationId = 'conv-123';
      mockConversationStore.conversations = [
        { id: 'conv-1', title: 'Conv 1' },
        { id: 'conv-2', title: 'Conv 2' },
      ];
      mockChatHook.messages = [
        { id: '1', role: 'user', content: 'Test' },
      ];
      mockChatHook.input = 'Current input';
      mockChatHook.isLoading = true;
      mockChatHook.error = new Error('Test error');

      const { result } = renderHook(() => useChatWithConversation());

      expect(result.current).toMatchObject({
        messages: mockChatHook.messages,
        input: 'Current input',
        isLoading: true,
        error: expect.any(Error),
        handleInputChange: expect.any(Function),
        handleSubmit: expect.any(Function),
        reload: expect.any(Function),
        stop: expect.any(Function),
        append: expect.any(Function),
        currentConversationId: 'conv-123',
        conversations: mockConversationStore.conversations,
        selectedModel: 'gpt-4',
        setCurrentConversation: expect.any(Function),
      });
    });
  });
});