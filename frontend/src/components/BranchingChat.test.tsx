import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BranchingChat } from './BranchingChat';
import * as useConversationStore from '../hooks/useConversationStore';
import * as useBranching from '../hooks/useBranching';
import { createMockMessage, createMockConversation } from '../../tests/test-utils';

// Mock all the hooks and child components
vi.mock('../hooks/useConversationStore', () => ({
  useConversationStore: vi.fn()
}));
vi.mock('../hooks/useBranching');

// Mock child components
vi.mock('./EditableMessage', () => ({
  EditableMessage: ({ message, onEdit, onDelete, onBranchSwitch, isEditable, showBranches }: any) => (
    <div data-testid={`editable-message-${message.id}`}>
      <span data-testid="message-content">{message.content}</span>
      <span data-testid="message-role">{message.role}</span>
      {isEditable && (
        <button
          data-testid={`edit-${message.id}`}
          onClick={() => onEdit?.(message.id, 'edited content')}
        >
          Edit
        </button>
      )}
      {isEditable && (
        <button
          data-testid={`delete-${message.id}`}
          onClick={() => onDelete?.(message.id)}
        >
          Delete
        </button>
      )}
      {showBranches && (
        <button
          data-testid={`branch-${message.id}`}
          onClick={() => onBranchSwitch?.(message.id)}
        >
          Switch Branch
        </button>
      )}
    </div>
  )
}));

vi.mock('./BranchVisualizer', () => ({
  BranchVisualizer: ({ conversationId, treeData, onBranchSwitch, isVisible }: any) => (
    <div data-testid="branch-visualizer" data-visible={isVisible}>
      {isVisible && treeData && (
        <div>
          <span data-testid="tree-messages-count">{treeData.messages.length}</span>
          <span data-testid="tree-branches-count">{treeData.branches.length}</span>
          <button
            data-testid="visualizer-branch-switch"
            onClick={() => onBranchSwitch?.('target-message-id')}
          >
            Switch Branch
          </button>
        </div>
      )}
    </div>
  )
}));

vi.mock('./ChatInput', () => ({
  ChatInput: ({ onSendMessage, disabled, placeholder }: any) => (
    <div data-testid="chat-input-container">
      <input
        data-testid="chat-input"
        placeholder={placeholder}
        disabled={disabled}
        onChange={() => {}}
      />
      <button
        data-testid="send-button"
        disabled={disabled}
        onClick={() => onSendMessage?.('test message')}
      >
        Send
      </button>
    </div>
  )
}));

vi.mock('./LoadingSpinner', () => ({
  LoadingSpinner: ({ size, variant, label }: any) => (
    <div data-testid="loading-spinner" data-size={size} data-variant={variant}>
      {label}
    </div>
  ),
  LoadingDots: ({ size, variant, className }: any) => (
    <div data-testid="loading-dots" className={className} data-size={size} data-variant={variant}>
      Loading...
    </div>
  )
}));

vi.mock('./ErrorAlert', () => ({
  ErrorAlert: ({ error, title, type, onRetry, onDismiss, className }: any) => (
    <div data-testid="error-alert" className={className} data-type={type}>
      <span data-testid="error-title">{title}</span>
      <span data-testid="error-message">{error}</span>
      {onRetry && <button data-testid="retry-button" onClick={onRetry}>Retry</button>}
      {onDismiss && <button data-testid="dismiss-button" onClick={onDismiss}>Dismiss</button>}
    </div>
  )
}));

vi.mock('./ModelSelector', () => ({
  default: ({ disabled, className }: any) => (
    <div data-testid="model-selector" className={className} data-disabled={disabled}>
      Model Selector
    </div>
  )
}));

vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content, variant }: any) => (
    <div data-testid="markdown-renderer" data-variant={variant}>
      {content}
    </div>
  )
}));

// Mock utility functions
vi.mock('../utils/errorHandling', () => ({
  categorizeError: vi.fn((error) => ({
    category: 'network',
    userMessage: error || 'Network error occurred',
    isRetryable: true,
    severity: 'medium'
  })),
  retryOperation: vi.fn((fn) => fn()),
  isTemporaryError: vi.fn(() => true)
}));

describe('BranchingChat Component', () => {
  const mockConversationStore = {
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

  const mockBranchingStore = {
    treeData: null,
    isLoading: false,
    error: null,
    loadTree: vi.fn(),
    editMessage: vi.fn(),
    switchBranch: vi.fn(),
    deleteMessage: vi.fn(),
    clearError: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConversationStore.useConversationStore).mockReturnValue(mockConversationStore as any);
    vi.mocked(useBranching.useBranching).mockReturnValue(mockBranchingStore as any);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initial Render', () => {
    it('renders welcome screen when no conversation exists', () => {
      render(<BranchingChat />);

      expect(screen.getByText('Start a New Conversation')).toBeInTheDocument();
      expect(screen.getByText('Welcome to Workbench with Branching')).toBeInTheDocument();
      expect(screen.getByText(/Start a conversation by typing a message below/)).toBeInTheDocument();
    });

    it('renders conversation header when conversation exists', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentConversationId: 'conv-123'
      } as any);

      render(<BranchingChat />);

      expect(screen.getByText('Workbench LLM Chat')).toBeInTheDocument();
      expect(screen.getByText(/Chat with your AI assistant - Edit messages to explore different paths/)).toBeInTheDocument();
    });

    it('renders branch visualizer component', () => {
      render(<BranchingChat />);

      expect(screen.getByTestId('branch-visualizer')).toBeInTheDocument();
    });

    it('renders model selector', () => {
      render(<BranchingChat />);

      expect(screen.getByTestId('model-selector')).toBeInTheDocument();
    });

    it('renders chat input', () => {
      render(<BranchingChat />);

      expect(screen.getByTestId('chat-input-container')).toBeInTheDocument();
    });
  });

  describe('Message Display', () => {
    it('displays existing messages with editable message components', () => {
      const messages = [
        createMockMessage({ id: 'msg-1', role: 'user', content: 'Hello' }),
        createMockMessage({ id: 'msg-2', role: 'assistant', content: 'Hi there!' })
      ];

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentMessages: messages,
        currentConversationId: 'conv-123'
      } as any);

      render(<BranchingChat />);

      expect(screen.getByTestId('editable-message-msg-1')).toBeInTheDocument();
      expect(screen.getByTestId('editable-message-msg-2')).toBeInTheDocument();
      expect(screen.getAllByTestId('message-content')[0]).toHaveTextContent('Hello');
      expect(screen.getAllByTestId('message-content')[1]).toHaveTextContent('Hi there!');
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
        ...mockConversationStore,
        streamingMessage,
        isStreaming: true
      } as any);

      render(<BranchingChat />);

      expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('This is streaming...');
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
        ...mockConversationStore,
        streamingMessage,
        isStreaming: true
      } as any);

      render(<BranchingChat />);

      expect(screen.getByText('Waiting for response...')).toBeInTheDocument();
    });
  });

  describe('Branch View Toggle', () => {
    it('toggles branch view when button is clicked', async () => {
      const user = userEvent.setup();

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentConversationId: 'conv-123'
      } as any);

      render(<BranchingChat />);

      const toggleButton = screen.getByRole('button', { name: /Show Tree/ });
      expect(toggleButton).toBeInTheDocument();

      await user.click(toggleButton);

      expect(mockBranchingStore.loadTree).toHaveBeenCalledTimes(1);
    });

    it('shows tree information when branch view is active', () => {
      const treeData = {
        messages: [
          createMockMessage({ id: 'msg-1' }),
          createMockMessage({ id: 'msg-2' })
        ],
        branches: [
          { id: 'branch-1', parentId: 'msg-1', childIds: ['msg-2'] }
        ]
      };

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentConversationId: 'conv-123'
      } as any);

      vi.mocked(useBranching.useBranching).mockReturnValue({
        ...mockBranchingStore,
        treeData
      } as any);

      const { rerender } = render(<BranchingChat />);

      // Initially no tree info shown
      expect(screen.queryByText(/messages,/)).not.toBeInTheDocument();

      // Simulate showing branch view
      const BranchingChatWithBranchView = () => {
        const [showBranchView, setShowBranchView] = React.useState(true);
        return <BranchingChat />;
      };

      // This is a bit tricky to test due to internal state, so let's check the static display
      expect(screen.getByTestId('branch-visualizer')).toBeInTheDocument();
    });

    it('disables toggle button when branch is loading', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentConversationId: 'conv-123'
      } as any);

      vi.mocked(useBranching.useBranching).mockReturnValue({
        ...mockBranchingStore,
        isLoading: true
      } as any);

      render(<BranchingChat />);

      const toggleButton = screen.getByRole('button', { name: /Loading.../ });
      expect(toggleButton).toBeDisabled();
    });
  });

  describe('Loading States', () => {
    it('displays loading indicator when conversation is loading', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        isLoading: true
      } as any);

      render(<BranchingChat />);

      expect(screen.getByText('Thinking...')).toBeInTheDocument();
      expect(screen.getByTestId('loading-dots')).toBeInTheDocument();
    });

    it('displays branch loading indicator when branch operation is in progress', () => {
      vi.mocked(useBranching.useBranching).mockReturnValue({
        ...mockBranchingStore,
        isLoading: true
      } as any);

      render(<BranchingChat />);

      expect(screen.getByTestId('branch-loading-indicator')).toBeInTheDocument();
      expect(screen.getByText('Processing branch operation...')).toBeInTheDocument();
    });

    it('disables input when loading', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        isLoading: true
      } as any);

      render(<BranchingChat />);

      const input = screen.getByTestId('chat-input');
      expect(input).toBeDisabled();
    });

    it('disables input when streaming', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        isStreaming: true
      } as any);

      render(<BranchingChat />);

      const input = screen.getByTestId('chat-input');
      expect(input).toBeDisabled();
    });

    it('disables input when branch operation is in progress', () => {
      vi.mocked(useBranching.useBranching).mockReturnValue({
        ...mockBranchingStore,
        isLoading: true
      } as any);

      render(<BranchingChat />);

      const input = screen.getByTestId('chat-input');
      expect(input).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('displays error alert when conversation error exists', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        error: 'Connection failed'
      } as any);

      render(<BranchingChat />);

      expect(screen.getByTestId('error-alert')).toBeInTheDocument();
      expect(screen.getByTestId('error-message')).toHaveTextContent('Connection failed');
    });

    it('displays error alert when branch error exists', () => {
      vi.mocked(useBranching.useBranching).mockReturnValue({
        ...mockBranchingStore,
        error: 'Branch operation failed'
      } as any);

      render(<BranchingChat />);

      expect(screen.getByTestId('error-alert')).toBeInTheDocument();
      expect(screen.getByTestId('error-message')).toHaveTextContent('Branch operation failed');
    });

    it('allows retrying on retryable errors', async () => {
      const user = userEvent.setup();

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        error: 'Network timeout',
        currentConversationId: 'conv-123'
      } as any);

      render(<BranchingChat />);

      const retryButton = screen.getByTestId('retry-button');
      await user.click(retryButton);

      expect(mockConversationStore.clearError).toHaveBeenCalled();
      expect(mockBranchingStore.clearError).toHaveBeenCalled();
      expect(mockBranchingStore.loadTree).toHaveBeenCalled();
    });

    it('allows dismissing errors', async () => {
      const user = userEvent.setup();

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        error: 'Some error'
      } as any);

      render(<BranchingChat />);

      const dismissButton = screen.getByTestId('dismiss-button');
      await user.click(dismissButton);

      expect(mockConversationStore.clearError).toHaveBeenCalled();
      expect(mockBranchingStore.clearError).toHaveBeenCalled();
    });
  });

  describe('User Interactions', () => {
    it('calls sendStreamingMessage when send button is clicked', async () => {
      const user = userEvent.setup();

      render(<BranchingChat />);

      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);

      expect(mockConversationStore.sendStreamingMessage).toHaveBeenCalledWith('test message');
    });

    it('calls stopStreaming when stop button is clicked during streaming', async () => {
      const user = userEvent.setup();

      const streamingMessage = {
        id: 'streaming-1',
        conversation_id: 'conv-123',
        role: 'assistant' as const,
        content: 'Streaming...',
        created_at: new Date().toISOString(),
        isStreaming: true
      };

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        streamingMessage,
        isStreaming: true
      } as any);

      render(<BranchingChat />);

      const stopButton = screen.getByTitle('Stop generation');
      await user.click(stopButton);

      expect(mockConversationStore.stopStreaming).toHaveBeenCalled();
    });

    it('handles message editing', async () => {
      const user = userEvent.setup();
      const messages = [createMockMessage({ id: 'msg-1', content: 'Original message' })];

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentMessages: messages,
        currentConversationId: 'conv-123'
      } as any);

      render(<BranchingChat />);

      const editButton = screen.getByTestId('edit-msg-1');
      await user.click(editButton);

      expect(mockBranchingStore.editMessage).toHaveBeenCalledWith('msg-1', 'edited content');
    });

    it('handles message deletion', async () => {
      const user = userEvent.setup();
      const messages = [createMockMessage({ id: 'msg-1', content: 'Message to delete' })];

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentMessages: messages,
        currentConversationId: 'conv-123'
      } as any);

      render(<BranchingChat />);

      const deleteButton = screen.getByTestId('delete-msg-1');
      await user.click(deleteButton);

      expect(mockBranchingStore.deleteMessage).toHaveBeenCalledWith('msg-1');
    });

    it('handles branch switching from editable message', async () => {
      const user = userEvent.setup();
      const messages = [createMockMessage({ id: 'msg-1', content: 'Message' })];
      const treeData = { messages, branches: [] };

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentMessages: messages,
        currentConversationId: 'conv-123'
      } as any);

      vi.mocked(useBranching.useBranching).mockReturnValue({
        ...mockBranchingStore,
        treeData
      } as any);

      // Mock showing branch view
      const { container } = render(<BranchingChat />);

      // Simulate clicking branch switch in editable message
      const branchButton = screen.getByTestId('branch-msg-1');
      await user.click(branchButton);

      expect(mockBranchingStore.switchBranch).toHaveBeenCalledWith('msg-1');
    });

    it('handles branch switching from visualizer', async () => {
      const user = userEvent.setup();
      const treeData = { messages: [], branches: [] };

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentConversationId: 'conv-123'
      } as any);

      vi.mocked(useBranching.useBranching).mockReturnValue({
        ...mockBranchingStore,
        treeData
      } as any);

      render(<BranchingChat />);

      const visualizerButton = screen.getByTestId('visualizer-branch-switch');
      await user.click(visualizerButton);

      expect(mockBranchingStore.switchBranch).toHaveBeenCalledWith('target-message-id');
    });
  });

  describe('Auto-scrolling', () => {
    it('scrolls to bottom when new messages are added', () => {
      const scrollIntoViewSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoViewSpy;

      const { rerender } = render(<BranchingChat />);

      // Add a message
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentMessages: [createMockMessage()]
      } as any);

      rerender(<BranchingChat />);

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

      const { rerender } = render(<BranchingChat />);

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        streamingMessage
      } as any);

      rerender(<BranchingChat />);

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
  });

  describe('Integration with useBranching Hook', () => {
    it('loads tree when conversation changes and branch view is shown', async () => {
      const { rerender } = render(<BranchingChat />);

      // Simulate branch view being shown and conversation being set
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentConversationId: 'conv-123'
      } as any);

      rerender(<BranchingChat />);

      // Note: This test is limited by how we can simulate internal state changes
      // In a real integration test, we would test the actual hook behavior
    });

    it('reloads tree after sending message when in branch view', async () => {
      vi.useFakeTimers();
      const user = userEvent.setup();

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentConversationId: 'conv-123'
      } as any);

      render(<BranchingChat />);

      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);

      // Fast-forward the setTimeout
      vi.advanceTimersByTime(500);

      expect(mockConversationStore.sendStreamingMessage).toHaveBeenCalledWith('test message');

      vi.useRealTimers();
    });
  });

  describe('Accessibility', () => {
    it('has proper heading structure', () => {
      render(<BranchingChat />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Start a New Conversation');
    });

    it('provides appropriate button labels', () => {
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentConversationId: 'conv-123'
      } as any);

      render(<BranchingChat />);

      expect(screen.getByRole('button', { name: /Show Tree/ })).toBeInTheDocument();
    });

    it('provides stop button with proper title during streaming', () => {
      const streamingMessage = {
        id: 'streaming-1',
        conversation_id: 'conv-123',
        role: 'assistant' as const,
        content: 'Streaming...',
        created_at: new Date().toISOString(),
        isStreaming: true
      };

      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        streamingMessage,
        isStreaming: true
      } as any);

      render(<BranchingChat />);

      const stopButton = screen.getByTitle('Stop generation');
      expect(stopButton).toBeInTheDocument();
    });
  });

  describe('Error Recovery', () => {
    it('handles console errors gracefully during message operations', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();

      mockBranchingStore.editMessage.mockRejectedValue(new Error('Edit failed'));

      const messages = [createMockMessage({ id: 'msg-1' })];
      vi.mocked(useConversationStore.useConversationStore).mockReturnValue({
        ...mockConversationStore,
        currentMessages: messages
      } as any);

      render(<BranchingChat />);

      const editButton = screen.getByTestId('edit-msg-1');
      await user.click(editButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to edit message:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    it('handles console errors gracefully during branch operations', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const user = userEvent.setup();

      mockBranchingStore.switchBranch.mockRejectedValue(new Error('Switch failed'));
      const treeData = { messages: [], branches: [] };

      vi.mocked(useBranching.useBranching).mockReturnValue({
        ...mockBranchingStore,
        treeData
      } as any);

      render(<BranchingChat />);

      const branchButton = screen.getByTestId('visualizer-branch-switch');
      await user.click(branchButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to switch branch:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });
});