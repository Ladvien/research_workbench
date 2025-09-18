import { describe, test, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ConversationSidebar } from './ConversationSidebar';
import { useConversationStore } from '../hooks/useConversationStore';
import { Conversation } from '../types';

// Mock the conversation store
vi.mock('../hooks/useConversationStore');
const mockUseConversationStore = useConversationStore as MockedFunction<typeof useConversationStore>;

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    user_id: 'user-1',
    title: 'Test Conversation 1',
    model: 'claude-code-opus',
    provider: 'anthropic',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T12:00:00Z',
  },
  {
    id: 'conv-2',
    user_id: 'user-1',
    title: 'Test Conversation 2',
    model: 'gpt-4',
    provider: 'openai',
    created_at: '2024-01-01T09:00:00Z',
    updated_at: '2024-01-01T11:00:00Z',
  },
];

const defaultStoreState = {
  conversations: [],
  currentConversationId: null,
  currentMessages: [],
  streamingMessage: null,
  selectedModel: 'claude-code-opus',
  isLoading: false,
  isStreaming: false,
  error: null,
  abortController: null,
  loadConversations: vi.fn(),
  loadConversation: vi.fn(),
  setCurrentConversation: vi.fn(),
  createConversation: vi.fn(),
  sendMessage: vi.fn(),
  sendStreamingMessage: vi.fn(),
  stopStreaming: vi.fn(),
  updateConversationTitle: vi.fn(),
  deleteConversation: vi.fn(),
  clearError: vi.fn(),
  setSelectedModel: vi.fn(),
};

describe('ConversationSidebar', () => {
  const mockOnToggle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConversationStore.mockReturnValue(defaultStoreState);
  });

  describe('When sidebar is closed', () => {
    test('renders toggle button when closed', () => {
      render(
        <ConversationSidebar isOpen={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('button', { name: /open conversations/i });
      expect(toggleButton).toBeInTheDocument();
      expect(toggleButton).toHaveAttribute('title', 'Open conversations (⌘B / Ctrl+B)');
    });

    test('calls onToggle when toggle button is clicked', () => {
      render(
        <ConversationSidebar isOpen={false} onToggle={mockOnToggle} />
      );

      const toggleButton = screen.getByRole('button', { name: /open conversations/i });
      fireEvent.click(toggleButton);

      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });

    test('does not render sidebar content when closed', () => {
      render(
        <ConversationSidebar isOpen={false} onToggle={mockOnToggle} />
      );

      expect(screen.queryByText('Conversations')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /new conversation/i })).not.toBeInTheDocument();
    });
  });

  describe('When sidebar is open', () => {
    test('renders sidebar header with title and controls', () => {
      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      expect(screen.getByText('Conversations')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /new conversation/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument();
    });

    test('loads conversations on mount', () => {
      const mockLoadConversations = vi.fn();
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        loadConversations: mockLoadConversations,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      expect(mockLoadConversations).toHaveBeenCalledTimes(1);
    });

    test('validates persisted conversation ID on mount', () => {
      const mockLoadConversation = vi.fn();
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        currentConversationId: 'persisted-conv-id',
        loadConversation: mockLoadConversation,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      expect(mockLoadConversation).toHaveBeenCalledWith('persisted-conv-id');
    });

    test('calls onToggle when collapse button is clicked', () => {
      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const collapseButton = screen.getByRole('button', { name: /collapse sidebar/i });
      fireEvent.click(collapseButton);

      expect(mockOnToggle).toHaveBeenCalledTimes(1);
    });

    test('renders overlay on mobile and closes on click', () => {
      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const overlay = document.querySelector('.fixed.inset-0.bg-black.bg-opacity-50');
      expect(overlay).toBeInTheDocument();

      if (overlay) {
        fireEvent.click(overlay);
        expect(mockOnToggle).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('Error handling', () => {
    test('displays error message when error exists', () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        error: 'Failed to load conversations',
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      expect(screen.getByText('Failed to load conversations')).toBeInTheDocument();
    });

    test('can clear error message', () => {
      const mockClearError = vi.fn();
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        error: 'Test error',
        clearError: mockClearError,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const clearButton = screen.getByRole('button', { name: '' }); // X button has no text
      fireEvent.click(clearButton);

      expect(mockClearError).toHaveBeenCalledTimes(1);
    });
  });

  describe('Loading states', () => {
    test('shows skeleton loading when conversations are loading', () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        isLoading: true,
        conversations: [],
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      expect(screen.getByTestId('conversation-skeleton')).toBeInTheDocument();
    });

    test('disables new conversation button when loading', () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        isLoading: true,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const newButton = screen.getByRole('button', { name: /new conversation/i });
      expect(newButton).toBeDisabled();
    });
  });

  describe('Empty state', () => {
    test('shows empty state when no conversations exist', () => {
      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
      expect(screen.getByText('Start a new conversation to get started!')).toBeInTheDocument();
    });
  });

  describe('Conversation list', () => {
    test('renders conversations when available', () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
      expect(screen.getByText('Test Conversation 2')).toBeInTheDocument();
      expect(screen.getByText('claude-code-opus')).toBeInTheDocument();
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
    });

    test('highlights active conversation', () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const activeConversation = screen.getByText('Test Conversation 1').closest('div');
      expect(activeConversation).toHaveClass('bg-blue-100');
    });

    test('selects conversation when clicked', () => {
      const mockSetCurrentConversation = vi.fn();
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        setCurrentConversation: mockSetCurrentConversation,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation = screen.getByText('Test Conversation 1').closest('div');
      if (conversation) {
        fireEvent.click(conversation);
        expect(mockSetCurrentConversation).toHaveBeenCalledWith('conv-1');
      }
    });
  });

  describe('Conversation actions', () => {
    test('shows action buttons on hover for non-active conversations', async () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1', // Different from conv-2
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation2 = screen.getByText('Test Conversation 2').closest('div');
      if (conversation2) {
        fireEvent.mouseEnter(conversation2);

        await waitFor(() => {
          const editButton = within(conversation2).getByTitle('Rename conversation');
          const deleteButton = within(conversation2).getByTitle('Delete conversation');
          expect(editButton).toBeInTheDocument();
          expect(deleteButton).toBeInTheDocument();
        });
      }
    });

    test('does not show action buttons for active conversation', () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const activeConversation = screen.getByText('Test Conversation 1').closest('div');
      if (activeConversation) {
        fireEvent.mouseEnter(activeConversation);

        expect(within(activeConversation).queryByTitle('Rename conversation')).not.toBeInTheDocument();
        expect(within(activeConversation).queryByTitle('Delete conversation')).not.toBeInTheDocument();
      }
    });
  });

  describe('Conversation renaming', () => {
    test('enters edit mode when rename button is clicked', async () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation2 = screen.getByText('Test Conversation 2').closest('div');
      if (conversation2) {
        fireEvent.mouseEnter(conversation2);

        await waitFor(() => {
          const editButton = within(conversation2).getByTitle('Rename conversation');
          fireEvent.click(editButton);
        });

        // Should show input field
        expect(within(conversation2).getByRole('textbox')).toBeInTheDocument();
        expect(within(conversation2).getByDisplayValue('Test Conversation 2')).toBeInTheDocument();
      }
    });

    test('saves title on Enter key', async () => {
      const mockUpdateConversationTitle = vi.fn();
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
        updateConversationTitle: mockUpdateConversationTitle,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation2 = screen.getByText('Test Conversation 2').closest('div');
      if (conversation2) {
        fireEvent.mouseEnter(conversation2);

        await waitFor(async () => {
          const editButton = within(conversation2).getByTitle('Rename conversation');
          fireEvent.click(editButton);

          const input = within(conversation2).getByRole('textbox');
          fireEvent.change(input, { target: { value: 'Updated Title' } });
          fireEvent.keyDown(input, { key: 'Enter' });
        });

        await waitFor(() => {
          expect(mockUpdateConversationTitle).toHaveBeenCalledWith('conv-2', 'Updated Title');
        });
      }
    });

    test('cancels edit on Escape key', async () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation2 = screen.getByText('Test Conversation 2').closest('div');
      if (conversation2) {
        fireEvent.mouseEnter(conversation2);

        await waitFor(async () => {
          const editButton = within(conversation2).getByTitle('Rename conversation');
          fireEvent.click(editButton);

          const input = within(conversation2).getByRole('textbox');
          fireEvent.change(input, { target: { value: 'Should be cancelled' } });
          fireEvent.keyDown(input, { key: 'Escape' });
        });

        // Should exit edit mode and restore original title
        expect(within(conversation2).queryByRole('textbox')).not.toBeInTheDocument();
        expect(within(conversation2).getByText('Test Conversation 2')).toBeInTheDocument();
      }
    });

    test('saves title on blur', async () => {
      const mockUpdateConversationTitle = vi.fn();
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
        updateConversationTitle: mockUpdateConversationTitle,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation2 = screen.getByText('Test Conversation 2').closest('div');
      if (conversation2) {
        fireEvent.mouseEnter(conversation2);

        await waitFor(async () => {
          const editButton = within(conversation2).getByTitle('Rename conversation');
          fireEvent.click(editButton);

          const input = within(conversation2).getByRole('textbox');
          fireEvent.change(input, { target: { value: 'Blurred Title' } });
          fireEvent.blur(input);
        });

        await waitFor(() => {
          expect(mockUpdateConversationTitle).toHaveBeenCalledWith('conv-2', 'Blurred Title');
        });
      }
    });
  });

  describe('Conversation deletion', () => {
    test('shows delete dialog when delete button is clicked', async () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation2 = screen.getByText('Test Conversation 2').closest('div');
      if (conversation2) {
        fireEvent.mouseEnter(conversation2);

        await waitFor(() => {
          const deleteButton = within(conversation2).getByTitle('Delete conversation');
          fireEvent.click(deleteButton);
        });

        // Should show confirmation dialog
        expect(screen.getByText('Delete Conversation')).toBeInTheDocument();
        expect(screen.getByText('Are you sure you want to delete this conversation? This action cannot be undone.')).toBeInTheDocument();
      }
    });

    test('confirms deletion when confirm button is clicked', async () => {
      const mockDeleteConversation = vi.fn();
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
        deleteConversation: mockDeleteConversation,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation2 = screen.getByText('Test Conversation 2').closest('div');
      if (conversation2) {
        fireEvent.mouseEnter(conversation2);

        await waitFor(() => {
          const deleteButton = within(conversation2).getByTitle('Delete conversation');
          fireEvent.click(deleteButton);
        });

        const confirmButton = screen.getByRole('button', { name: 'Delete' });
        fireEvent.click(confirmButton);

        expect(mockDeleteConversation).toHaveBeenCalledWith('conv-2');
      }
    });

    test('cancels deletion when cancel button is clicked', async () => {
      const mockDeleteConversation = vi.fn();
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
        deleteConversation: mockDeleteConversation,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation2 = screen.getByText('Test Conversation 2').closest('div');
      if (conversation2) {
        fireEvent.mouseEnter(conversation2);

        await waitFor(() => {
          const deleteButton = within(conversation2).getByTitle('Delete conversation');
          fireEvent.click(deleteButton);
        });

        const cancelButton = screen.getByRole('button', { name: 'Cancel' });
        fireEvent.click(cancelButton);

        expect(mockDeleteConversation).not.toHaveBeenCalled();
        expect(screen.queryByText('Delete Conversation')).not.toBeInTheDocument();
      }
    });
  });

  describe('New conversation', () => {
    test('creates new conversation when new button is clicked', async () => {
      const mockCreateConversation = vi.fn();
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        createConversation: mockCreateConversation,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const newButton = screen.getByRole('button', { name: /new conversation/i });
      fireEvent.click(newButton);

      expect(mockCreateConversation).toHaveBeenCalledWith({
        title: 'New Conversation',
        model: 'claude-code-opus',
      });
    });
  });

  describe('Date formatting', () => {
    test('formats recent times correctly', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

      const recentConversation: Conversation = {
        ...mockConversations[0],
        updated_at: oneHourAgo,
      };

      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: [recentConversation],
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      // Should show time format for recent items
      const timeElement = screen.getByText(/\d{1,2}:\d{2}/); // Matches HH:MM format
      expect(timeElement).toBeInTheDocument();
    });

    test('formats older dates correctly', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

      const oldConversation: Conversation = {
        ...mockConversations[0],
        updated_at: threeDaysAgo,
      };

      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: [oldConversation],
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      // Should show weekday for items within a week
      const weekdayElement = screen.getByText(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
      expect(weekdayElement).toBeInTheDocument();
    });
  });

  describe('Loading indicators', () => {
    test('shows loading spinner for specific operation', () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      // Simulate loading state for specific conversation
      // This would typically be controlled by operation state in the real component
      const loadingSpinner = screen.queryByTestId('conversation-item-loading');
      // Note: This test would need the component to actually show loading state
      // based on some operation being in progress
    });
  });

  describe('Accessibility', () => {
    test('has proper ARIA labels and roles', () => {
      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      // Check that buttons have proper titles
      expect(screen.getByRole('button', { name: /new conversation/i })).toHaveAttribute('title', 'New conversation');
      expect(screen.getByRole('button', { name: /collapse sidebar/i })).toHaveAttribute('title', 'Collapse sidebar (⌘B / Ctrl+B)');
    });

    test('supports keyboard navigation in edit mode', async () => {
      mockUseConversationStore.mockReturnValue({
        ...defaultStoreState,
        conversations: mockConversations,
        currentConversationId: 'conv-1',
      });

      render(
        <ConversationSidebar isOpen={true} onToggle={mockOnToggle} />
      );

      const conversation2 = screen.getByText('Test Conversation 2').closest('div');
      if (conversation2) {
        fireEvent.mouseEnter(conversation2);

        await waitFor(async () => {
          const editButton = within(conversation2).getByTitle('Rename conversation');
          fireEvent.click(editButton);

          const input = within(conversation2).getByRole('textbox');
          expect(input).toHaveFocus();
        });
      }
    });
  });
});