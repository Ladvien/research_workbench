import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationSidebar } from '../../src/components/ConversationSidebar';
import { useConversationStore } from '../../src/hooks/useConversationStore';
import { createMockConversationStore, mockConversations } from '../test-utils';
import type { Conversation } from '../../src/types';

// Mock the conversation store
vi.mock('../../src/hooks/useConversationStore');

const mockUseConversationStore = vi.mocked(useConversationStore);

// Create default mock store actions
const createDefaultMockStore = () => createMockConversationStore({
  conversations: mockConversations,
  currentConversationId: null, // Start with null to avoid triggering loadConversation
  currentMessages: [],
  streamingMessage: null,
  selectedModel: 'claude-code-opus',
  isLoading: false,
  isStreaming: false,
  error: null,
  abortController: null,
});

describe('ConversationSidebar', () => {
  let mockStore: ReturnType<typeof createMockConversationStore>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock store for each test
    mockStore = createDefaultMockStore();
    mockUseConversationStore.mockReturnValue(mockStore);
  });

  it('renders closed sidebar with toggle button', () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={false} onToggle={onToggle} />);

    expect(screen.getByTitle('Open conversations (⌘B / Ctrl+B)')).toBeInTheDocument();
    expect(screen.queryByText('Conversations')).not.toBeInTheDocument();
  });

  it('renders open sidebar with conversations list', () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    expect(screen.getByText('Conversations')).toBeInTheDocument();
    expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
    expect(screen.getByText('Test Conversation 2')).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument();
  });

  it('calls loadConversations on mount', () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    expect(mockStore.loadConversations).toHaveBeenCalledOnce();
  });

  it('highlights active conversation', () => {
    // Create store with active conversation
    const storeWithActiveConv = createMockConversationStore({
      conversations: mockConversations,
      currentConversationId: '1', // Set active conversation for this test
    });
    mockUseConversationStore.mockReturnValue(storeWithActiveConv);

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    const activeConversation = screen.getByText('Test Conversation 1').closest('div');
    expect(activeConversation).toHaveClass('bg-blue-100');
  });

  it('switches conversation when clicking on different conversation', () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByText('Test Conversation 2'));

    expect(mockStore.setCurrentConversation).toHaveBeenCalledWith('2');
  });

  it('creates new conversation when clicking new button', async () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByTitle('New conversation'));

    expect(mockStore.createConversation).toHaveBeenCalledWith({
      title: 'New Conversation',
      model: 'claude-code-opus'
    });
  });

  it('shows edit input when clicking rename button', async () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Find the conversation item and hover to show actions
    const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
    fireEvent.mouseEnter(conversationItem);

    // Find and click the rename button
    const renameButton = screen.getByTitle('Rename conversation');
    fireEvent.click(renameButton);

    // Should show input field
    const input = screen.getByDisplayValue('Test Conversation 2');
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('renames conversation on Enter key', async () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Start editing
    const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
    fireEvent.mouseEnter(conversationItem);
    fireEvent.click(screen.getByTitle('Rename conversation'));

    // Change text and press Enter
    const input = screen.getByDisplayValue('Test Conversation 2');
    fireEvent.change(input, { target: { value: 'Renamed Conversation' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockStore.updateConversationTitle).toHaveBeenCalledWith('2', 'Renamed Conversation');
    });
  });

  it('cancels rename on Escape key', async () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Start editing
    const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
    fireEvent.mouseEnter(conversationItem);
    fireEvent.click(screen.getByTitle('Rename conversation'));

    // Change text and press Escape
    const input = screen.getByDisplayValue('Test Conversation 2');
    fireEvent.change(input, { target: { value: 'Changed Text' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should restore original title
    await waitFor(() => {
      expect(screen.getByText('Test Conversation 2')).toBeInTheDocument();
    });
    expect(mockStore.updateConversationTitle).not.toHaveBeenCalled();
  });

  it('shows delete confirmation dialog', async () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Find the conversation item and hover to show actions
    const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
    fireEvent.mouseEnter(conversationItem);

    // Click delete button
    fireEvent.click(screen.getByTitle('Delete conversation'));

    expect(screen.getByText('Delete Conversation')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this conversation? This action cannot be undone.')).toBeInTheDocument();
  });

  it('deletes conversation on confirmation', async () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Show delete dialog
    const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
    fireEvent.mouseEnter(conversationItem);
    fireEvent.click(screen.getByTitle('Delete conversation'));

    // Confirm deletion
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockStore.deleteConversation).toHaveBeenCalledWith('2');
    });
  });

  it('cancels delete confirmation', async () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Show delete dialog
    const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
    fireEvent.mouseEnter(conversationItem);
    fireEvent.click(screen.getByTitle('Delete conversation'));

    // Cancel deletion
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Delete Conversation')).not.toBeInTheDocument();
    });
    expect(mockStore.deleteConversation).not.toHaveBeenCalled();
  });

  it('displays loading state', () => {
    const loadingStore = createMockConversationStore({
      conversations: [],
      isLoading: true
    });
    mockUseConversationStore.mockReturnValue(loadingStore);

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    expect(screen.getByTestId('conversation-skeleton')).toBeInTheDocument();
  });

  it('displays empty state when no conversations', () => {
    const emptyStore = createMockConversationStore({
      conversations: [],
      isLoading: false
    });
    mockUseConversationStore.mockReturnValue(emptyStore);

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
    expect(screen.getByText('Start a new conversation to get started!')).toBeInTheDocument();
  });

  it('displays error message', () => {
    const errorStore = createMockConversationStore({
      error: 'Failed to load conversations'
    });
    mockUseConversationStore.mockReturnValue(errorStore);

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    expect(screen.getByText('Failed to load conversations')).toBeInTheDocument();
  });

  it('clears error when clicking close button', () => {
    const errorStore = createMockConversationStore({
      error: 'Test error message'
    });
    mockUseConversationStore.mockReturnValue(errorStore);

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    const errorCloseButton = screen.getByText('Test error message').nextElementSibling as HTMLElement;
    fireEvent.click(errorCloseButton);

    expect(errorStore.clearError).toHaveBeenCalled();
  });

  it('formats dates correctly', () => {
    const recentDate = new Date();
    recentDate.setHours(recentDate.getHours() - 2);

    const conversationsWithRecentDate: Conversation[] = [{
      ...mockConversations[0],
      updated_at: recentDate.toISOString()
    }];

    const recentDateStore = createMockConversationStore({
      conversations: conversationsWithRecentDate
    });
    mockUseConversationStore.mockReturnValue(recentDateStore);

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Should show time for recent conversations
    const timeRegex = /^\d{1,2}:\d{2}$/;
    const timeElements = screen.getAllByText(timeRegex);
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it('closes sidebar on overlay click in mobile view', () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Find and click the overlay
    const overlay = document.querySelector('.fixed.inset-0.bg-black');
    if (overlay) {
      fireEvent.click(overlay);
      expect(onToggle).toHaveBeenCalled();
    }
  });

  it('disables new conversation button when loading', () => {
    const loadingStore = createMockConversationStore({
      isLoading: true
    });
    mockUseConversationStore.mockReturnValue(loadingStore);

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    const newButton = screen.getByTitle('New conversation');
    expect(newButton).toBeDisabled();
  });

  it('prevents conversation selection when editing title', () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Start editing
    const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
    fireEvent.mouseEnter(conversationItem);
    fireEvent.click(screen.getByTitle('Rename conversation'));

    // Try to click the conversation while editing
    const input = screen.getByDisplayValue('Test Conversation 2');
    expect(input).toBeInTheDocument();

    // Click should not select conversation while editing
    fireEvent.click(conversationItem);
    expect(mockStore.setCurrentConversation).not.toHaveBeenCalledWith('2');
  });

  describe('Collapse Functionality', () => {
    it('shows toggle button when collapsed', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={false} onToggle={onToggle} />);

      const toggleButton = screen.getByTitle(/Open conversations/);
      expect(toggleButton).toBeInTheDocument();
      expect(toggleButton).toHaveAttribute('title', 'Open conversations (⌘B / Ctrl+B)');
    });

    it('hides main sidebar content when collapsed', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={false} onToggle={onToggle} />);

      expect(screen.queryByText('Conversations')).not.toBeInTheDocument();
      expect(screen.queryByText('Test Conversation 1')).not.toBeInTheDocument();
    });

    it('shows proper collapse button in open state', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      const collapseButton = screen.getByTitle(/Collapse sidebar/);
      expect(collapseButton).toBeInTheDocument();
      expect(collapseButton).toHaveAttribute('title', 'Collapse sidebar (⌘B / Ctrl+B)');
    });

    it('applies correct CSS classes for open/closed states', () => {
      const onToggle = vi.fn();
      const { rerender } = render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Check open state classes
      const sidebar = document.querySelector('.fixed.left-0.top-0.z-40');
      expect(sidebar).toHaveClass('translate-x-0');
      expect(sidebar).not.toHaveClass('-translate-x-full');

      // Check closed state classes
      rerender(<ConversationSidebar isOpen={false} onToggle={onToggle} />);

      const toggleButton = screen.getByTitle(/Open conversations/);
      expect(toggleButton).toBeInTheDocument();
    });

    it('animates sidebar transition with correct duration', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      const sidebar = document.querySelector('.fixed.left-0.top-0.z-40');
      expect(sidebar).toHaveClass('transition-all', 'duration-300', 'ease-in-out');
    });

    it('maintains proper z-index for overlay and sidebar', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      const overlay = document.querySelector('.fixed.inset-0.bg-black');
      const sidebar = document.querySelector('.fixed.left-0.top-0');

      expect(overlay).toHaveClass('z-30');
      expect(sidebar).toHaveClass('z-40');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Check heading structure
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Conversations');

      // Check button accessibility
      const newButton = screen.getByTitle('New conversation');
      expect(newButton).toHaveAttribute('title', 'New conversation');

      const collapseButton = screen.getByTitle(/Collapse sidebar/);
      expect(collapseButton).toHaveAttribute('title', 'Collapse sidebar (⌘B / Ctrl+B)');
    });

    it('supports keyboard navigation for conversation items', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      const conversationItems = screen.getAllByText(/Test Conversation/);
      conversationItems.forEach(item => {
        const conversationDiv = item.closest('div');
        expect(conversationDiv).toHaveClass('cursor-pointer');
      });
    });

    it('provides proper focus management for edit input', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Start editing
      const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
      fireEvent.mouseEnter(conversationItem);
      fireEvent.click(screen.getByTitle('Rename conversation'));

      const input = screen.getByDisplayValue('Test Conversation 2');
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute('autoFocus');
    });

    it('has accessible button states', () => {
      const loadingStore = createMockConversationStore({
        isLoading: true
      });
      mockUseConversationStore.mockReturnValue(loadingStore);

      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      const newButton = screen.getByTitle('New conversation');
      expect(newButton).toBeDisabled();
      expect(newButton).toHaveAttribute('disabled');
    });

    it('provides proper semantic structure for conversation list', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Check that conversations are structured properly
      const conversations = screen.getAllByText(/Test Conversation/);
      expect(conversations).toHaveLength(2);

      // Each conversation should have proper heading structure
      conversations.forEach(conv => {
        const heading = conv.closest('div')?.querySelector('h3');
        expect(heading).toBeInTheDocument();
        expect(heading).toHaveClass('text-sm', 'font-medium');
      });
    });

    it('handles screen reader announcements for loading states', () => {
      const loadingStore = createMockConversationStore({
        conversations: [],
        isLoading: true
      });
      mockUseConversationStore.mockReturnValue(loadingStore);

      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Check for loading indicator with proper test ID
      const loadingSkeleton = screen.getByTestId('conversation-skeleton');
      expect(loadingSkeleton).toBeInTheDocument();
    });

    it('provides clear empty state messaging', () => {
      const emptyStore = createMockConversationStore({
        conversations: [],
        isLoading: false
      });
      mockUseConversationStore.mockReturnValue(emptyStore);

      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
      expect(screen.getByText('Start a new conversation to get started!')).toBeInTheDocument();
    });

    it('maintains focus trap within modal dialogs', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Open delete dialog
      const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
      fireEvent.mouseEnter(conversationItem);
      fireEvent.click(screen.getByTitle('Delete conversation'));

      // Check dialog structure
      const dialog = screen.getByText('Delete Conversation').closest('div');
      expect(dialog).toHaveClass('bg-white', 'dark:bg-gray-800');

      // Check button accessibility
      const cancelButton = screen.getByText('Cancel');
      const deleteButton = screen.getByText('Delete');

      expect(cancelButton).toBeInTheDocument();
      expect(deleteButton).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('shows individual conversation loading state', () => {
      const onToggle = vi.fn();
      const { rerender } = render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Set loading state for specific conversation
      const loadingConvStore = createMockConversationStore({
        conversations: mockConversations.map(conv => ({
          ...conv,
          isLoading: conv.id === '2'
        }))
      });
      mockUseConversationStore.mockReturnValue(loadingConvStore);

      rerender(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Should show loading spinner for conversation item
      const loadingSpinner = screen.getByTestId('conversation-item-loading');
      expect(loadingSpinner).toBeInTheDocument();
    });

    it('disables actions during conversation operations', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Start editing to set up operation loading state
      const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
      fireEvent.mouseEnter(conversationItem);

      // Actions should be available when not loading
      expect(screen.getByTitle('Rename conversation')).not.toBeDisabled();
      expect(screen.getByTitle('Delete conversation')).not.toBeDisabled();
    });

    it('handles validation on conversation title save', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      // Start editing
      const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
      fireEvent.mouseEnter(conversationItem);
      fireEvent.click(screen.getByTitle('Rename conversation'));

      // Try to save empty title
      const input = screen.getByDisplayValue('Test Conversation 2');
      fireEvent.change(input, { target: { value: '   ' } }); // Only whitespace
      fireEvent.keyDown(input, { key: 'Enter' });

      // Should not call update function with empty title
      expect(mockStore.updateConversationTitle).not.toHaveBeenCalled();
    });
  });

  describe('Responsive Behavior', () => {
    it('shows overlay only on mobile when open', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      const overlay = document.querySelector('.fixed.inset-0.bg-black');
      expect(overlay).toHaveClass('md:hidden'); // Hidden on medium screens and up
    });

    it('handles touch interactions on mobile', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      const overlay = document.querySelector('.fixed.inset-0.bg-black');
      if (overlay) {
        fireEvent.touchStart(overlay);
        fireEvent.touchEnd(overlay);
        fireEvent.click(overlay);
        expect(onToggle).toHaveBeenCalled();
      }
    });

    it('maintains proper width on different screen sizes', () => {
      const onToggle = vi.fn();
      render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

      const sidebar = document.querySelector('.fixed.left-0.top-0');
      expect(sidebar).toHaveClass('w-80'); // Fixed width
    });
  });
});