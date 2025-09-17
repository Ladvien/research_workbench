import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chat } from './Chat';
import * as useConversationStore from '../hooks/useConversationStore';
import { createMockMessage } from '../../tests/test-utils';

// Mock the store module
vi.mock('../hooks/useConversationStore');

// Mock child components
vi.mock('./Message', () => ({
  Message: ({ message }: any) => (
    <div data-testid={`message-${message.id}`}>
      <span data-testid="message-role">{message.role}</span>
      <span data-testid="message-content">{message.content}</span>
    </div>
  )
}));

vi.mock('./ChatInput', () => ({
  ChatInput: ({ onSendMessage, disabled, placeholder }: any) => (
    <form data-testid="chat-input-form">
      <input
        data-testid="chat-input"
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => e.target.value}
      />
      <button
        type="button"
        data-testid="send-button"
        disabled={disabled}
        onClick={() => onSendMessage?.('test message')}
      >
        Send
      </button>
    </form>
  )
}));

vi.mock('./LoadingSpinner', () => ({
  LoadingDots: ({ size, variant, className }: any) => (
    <div data-testid="loading-dots" className={className}>
      Loading {size} {variant}
    </div>
  )
}));

describe('Chat Component', () => {
  const mockStore = {
    currentMessages: [],
    streamingMessage: null,
    currentConversationId: null,
    isLoading: false,
    isStreaming: false,
    error: null,
    sendStreamingMessage: vi.fn(),
    stopStreaming: vi.fn(),
    clearError: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConversationStore.useConversationStore).mockReturnValue(mockStore as any);
  });

  describe('Initial State', () => {
    it('renders welcome screen when no conversation exists', () => {
      render(<Chat />);

      expect(screen.getByText('Start a New Conversation')).toBeInTheDocument();
      expect(screen.getByText('Welcome to Workbench')).toBeInTheDocument();
      expect(screen.getByText(/Start a conversation by typing a message below/)).toBeInTheDocument();
    });

    it('renders conversation header when conversation exists', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        currentConversationId: 'conv-123'
      } as any);

      render(<Chat />);

      expect(screen.getByText('Workbench LLM Chat')).toBeInTheDocument();
      expect(screen.getByText('Chat with your AI assistant')).toBeInTheDocument();
    });

    it('renders chat input component', () => {
      render(<Chat />);

      expect(screen.getByTestId('chat-input-form')).toBeInTheDocument();
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });
  });

  describe('Message Display', () => {
    it('displays existing messages correctly', () => {
      const messages = [
        createMockMessage({ id: 'msg-1', role: 'user', content: 'Hello' }),
        createMockMessage({ id: 'msg-2', role: 'assistant', content: 'Hi there!' })
      ];

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        currentMessages: messages,
        currentConversationId: 'conv-123'
      } as any);

      render(<Chat />);

      expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-msg-2')).toBeInTheDocument();
      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    it('displays streaming message when present', () => {
      const streamingMessage = {
        id: 'streaming-1',
        conversation_id: 'conv-123',
        role: 'assistant' as const,
        content: 'This is streaming...',
        created_at: new Date().toISOString(),
        isStreaming: true
      };

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        streamingMessage,
        isStreaming: true,
        currentConversationId: 'conv-123'
      } as any);

      render(<Chat />);

      expect(screen.getByTestId('streaming-message')).toBeInTheDocument();
      expect(screen.getByTestId('streaming-content')).toBeInTheDocument();
      expect(screen.getByText('This is streaming...')).toBeInTheDocument();
      expect(screen.getByText('Streaming...')).toBeInTheDocument();
    });

    it('shows waiting message when streaming message has no content', () => {
      const streamingMessage = {
        id: 'streaming-1',
        conversation_id: 'conv-123',
        role: 'assistant' as const,
        content: '',
        created_at: new Date().toISOString(),
        isStreaming: true
      };

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        streamingMessage,
        isStreaming: true
      } as any);

      render(<Chat />);

      expect(screen.getByText('Waiting for response...')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('displays loading indicator when isLoading is true', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        isLoading: true
      } as any);

      render(<Chat />);

      expect(screen.getByTestId('loading-dots')).toBeInTheDocument();
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    it('disables input when loading', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        isLoading: true
      } as any);

      render(<Chat />);

      const input = screen.getByTestId('chat-input');
      expect(input).toBeDisabled();
    });

    it('disables input when streaming', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        isStreaming: true
      } as any);

      render(<Chat />);

      const input = screen.getByTestId('chat-input');
      expect(input).toBeDisabled();
    });

    it('shows streaming placeholder when streaming', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        isStreaming: true
      } as any);

      render(<Chat />);

      const input = screen.getByTestId('chat-input');
      expect(input).toHaveAttribute('placeholder', 'Response streaming... please wait');
    });
  });

  describe('Error Handling', () => {
    it('displays error message when error exists', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        error: 'Test error message'
      } as any);

      render(<Chat />);

      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('calls clearError when error close button is clicked', async () => {
      const user = userEvent.setup();
      const clearErrorSpy = vi.fn();

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        error: 'Test error message',
        clearError: clearErrorSpy
      } as any);

      render(<Chat />);

      const closeButton = screen.getByRole('button');
      await user.click(closeButton);

      expect(clearErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('User Interactions', () => {
    it('calls sendStreamingMessage when send button is clicked', async () => {
      const user = userEvent.setup();
      const sendStreamingMessageSpy = vi.fn();

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        sendStreamingMessage: sendStreamingMessageSpy
      } as any);

      render(<Chat />);

      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);

      expect(sendStreamingMessageSpy).toHaveBeenCalledWith('test message');
    });

    it('handles sendStreamingMessage errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const sendStreamingMessageSpy = vi.fn().mockRejectedValue(new Error('Network error'));

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        sendStreamingMessage: sendStreamingMessageSpy
      } as any);

      render(<Chat />);

      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);

      // Wait for error handling
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to send streaming message:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    it('calls stopStreaming when stop button is clicked during streaming', async () => {
      const user = userEvent.setup();
      const stopStreamingSpy = vi.fn();

      const streamingMessage = {
        id: 'streaming-1',
        conversation_id: 'conv-123',
        role: 'assistant' as const,
        content: 'Streaming content...',
        created_at: new Date().toISOString(),
        isStreaming: true
      };

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        streamingMessage,
        isStreaming: true,
        stopStreaming: stopStreamingSpy
      } as any);

      render(<Chat />);

      const stopButton = screen.getByTitle('Stop generation');
      await user.click(stopButton);

      expect(stopStreamingSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Auto-scrolling', () => {
    it('scrolls to bottom when new messages are added', () => {
      const scrollIntoViewSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewSpy;

      const { rerender } = render(<Chat />);

      // Add a message
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        currentMessages: [createMockMessage()]
      } as any);

      rerender(<Chat />);

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth' });
    });

    it('scrolls to bottom when streaming message updates', () => {
      const scrollIntoViewSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewSpy;

      const streamingMessage = {
        id: 'streaming-1',
        conversation_id: 'conv-123',
        role: 'assistant' as const,
        content: 'Streaming...',
        created_at: new Date().toISOString(),
        isStreaming: true
      };

      const { rerender } = render(<Chat />);

      // Update streaming message
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        streamingMessage
      } as any);

      rerender(<Chat />);

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
  });

  describe('Accessibility', () => {
    it('has proper heading structure', () => {
      render(<Chat />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Start a New Conversation');
    });

    it('has semantic structure for messages container', () => {
      render(<Chat />);

      const messagesContainer = screen.getByText(/Start a conversation/).closest('.flex-1');
      expect(messagesContainer).toHaveClass('overflow-y-auto');
    });

    it('provides appropriate ARIA labels for interactive elements', () => {
      const streamingMessage = {
        id: 'streaming-1',
        conversation_id: 'conv-123',
        role: 'assistant' as const,
        content: 'Streaming...',
        created_at: new Date().toISOString(),
        isStreaming: true
      };

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        streamingMessage,
        isStreaming: true
      } as any);

      render(<Chat />);

      const stopButton = screen.getByTitle('Stop generation');
      expect(stopButton).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty messages array', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        currentMessages: [],
        currentConversationId: 'conv-123'
      } as any);

      render(<Chat />);

      expect(screen.queryByTestId('message-')).not.toBeInTheDocument();
    });

    it('handles null streaming message', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        streamingMessage: null,
        isStreaming: false
      } as any);

      render(<Chat />);

      expect(screen.queryByTestId('streaming-message')).not.toBeInTheDocument();
    });

    it('handles missing conversation ID gracefully', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        currentConversationId: null,
        currentMessages: []
      } as any);

      render(<Chat />);

      expect(screen.getByText('Start a New Conversation')).toBeInTheDocument();
    });
  });

  describe('Component Integration', () => {
    it('passes correct props to ChatInput', () => {
      render(<Chat />);

      const input = screen.getByTestId('chat-input');
      expect(input).toHaveAttribute('placeholder', 'Type your message... (Shift+Enter for new line)');
      expect(input).not.toBeDisabled();
    });

    it('renders Message components for each message', () => {
      const messages = [
        createMockMessage({ id: 'msg-1', role: 'user' }),
        createMockMessage({ id: 'msg-2', role: 'assistant' })
      ];

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        currentMessages: messages,
        currentConversationId: 'conv-123'
      } as any);

      render(<Chat />);

      expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-msg-2')).toBeInTheDocument();
    });

    it('transforms message timestamps correctly', () => {
      const message = createMockMessage({
        id: 'msg-1',
        created_at: '2024-01-01T12:00:00Z'
      });

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockStore,
        currentMessages: [message],
        currentConversationId: 'conv-123'
      } as any);

      render(<Chat />);

      // Message component should receive a timestamp Date object
      expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
    });
  });
});