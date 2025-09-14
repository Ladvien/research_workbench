import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationSidebar } from '../../src/components/ConversationSidebar';
import { useConversationStore } from '../../src/hooks/useConversationStore';
import type { Conversation } from '../../src/types';

// Mock the conversation store
vi.mock('../../src/hooks/useConversationStore');

const mockUseConversationStore = vi.mocked(useConversationStore);

const mockConversations: Conversation[] = [
  {
    id: '1',
    user_id: 'user1',
    title: 'Test Conversation 1',
    model: 'gpt-4',
    created_at: '2025-09-14T10:00:00Z',
    updated_at: '2025-09-14T10:30:00Z',
    metadata: {}
  },
  {
    id: '2',
    user_id: 'user1',
    title: 'Test Conversation 2',
    model: 'gpt-3.5-turbo',
    created_at: '2025-09-14T09:00:00Z',
    updated_at: '2025-09-14T09:30:00Z',
    metadata: {}
  }
];

const mockStoreActions = {
  conversations: mockConversations,
  currentConversationId: '1',
  isLoading: false,
  error: null,
  loadConversations: vi.fn(),
  setCurrentConversation: vi.fn(),
  createConversation: vi.fn(),
  updateConversationTitle: vi.fn(),
  deleteConversation: vi.fn(),
  clearError: vi.fn()
};

describe('ConversationSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConversationStore.mockReturnValue(mockStoreActions);
  });

  it('renders closed sidebar with toggle button', () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={false} onToggle={onToggle} />);

    expect(screen.getByTitle('Open conversations')).toBeInTheDocument();
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

    expect(mockStoreActions.loadConversations).toHaveBeenCalledOnce();
  });

  it('highlights active conversation', () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    const activeConversation = screen.getByText('Test Conversation 1').closest('div');
    expect(activeConversation).toHaveClass('bg-blue-100', 'dark:bg-blue-900/30');
  });

  it('switches conversation when clicking on different conversation', () => {
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByText('Test Conversation 2'));

    expect(mockStoreActions.setCurrentConversation).toHaveBeenCalledWith('2');
  });

  it('creates new conversation when clicking new button', async () => {
    mockStoreActions.createConversation.mockResolvedValue('new-id');
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByTitle('New conversation'));

    expect(mockStoreActions.createConversation).toHaveBeenCalledWith({
      title: 'New Conversation',
      model: 'gpt-4'
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
    mockStoreActions.updateConversationTitle.mockResolvedValue();
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
      expect(mockStoreActions.updateConversationTitle).toHaveBeenCalledWith('2', 'Renamed Conversation');
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
    expect(mockStoreActions.updateConversationTitle).not.toHaveBeenCalled();
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
    mockStoreActions.deleteConversation.mockResolvedValue();
    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    // Show delete dialog
    const conversationItem = screen.getByText('Test Conversation 2').closest('div')!;
    fireEvent.mouseEnter(conversationItem);
    fireEvent.click(screen.getByTitle('Delete conversation'));

    // Confirm deletion
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockStoreActions.deleteConversation).toHaveBeenCalledWith('2');
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
    expect(mockStoreActions.deleteConversation).not.toHaveBeenCalled();
  });

  it('displays loading state', () => {
    mockUseConversationStore.mockReturnValue({
      ...mockStoreActions,
      conversations: [],
      isLoading: true
    });

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    expect(screen.getByText('Loading conversations...')).toBeInTheDocument();
  });

  it('displays empty state when no conversations', () => {
    mockUseConversationStore.mockReturnValue({
      ...mockStoreActions,
      conversations: [],
      isLoading: false
    });

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    expect(screen.getByText('No conversations yet.')).toBeInTheDocument();
    expect(screen.getByText('Start a new conversation to get started!')).toBeInTheDocument();
  });

  it('displays error message', () => {
    mockUseConversationStore.mockReturnValue({
      ...mockStoreActions,
      error: 'Failed to load conversations'
    });

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    expect(screen.getByText('Failed to load conversations')).toBeInTheDocument();
  });

  it('clears error when clicking close button', () => {
    mockUseConversationStore.mockReturnValue({
      ...mockStoreActions,
      error: 'Test error message'
    });

    const onToggle = vi.fn();
    render(<ConversationSidebar isOpen={true} onToggle={onToggle} />);

    const errorCloseButton = screen.getByText('Test error message').nextElementSibling as HTMLElement;
    fireEvent.click(errorCloseButton);

    expect(mockStoreActions.clearError).toHaveBeenCalled();
  });

  it('formats dates correctly', () => {
    const recentDate = new Date();
    recentDate.setHours(recentDate.getHours() - 2);

    const conversationsWithRecentDate: Conversation[] = [{
      ...mockConversations[0],
      updated_at: recentDate.toISOString()
    }];

    mockUseConversationStore.mockReturnValue({
      ...mockStoreActions,
      conversations: conversationsWithRecentDate
    });

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
    mockUseConversationStore.mockReturnValue({
      ...mockStoreActions,
      isLoading: true
    });

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
    expect(mockStoreActions.setCurrentConversation).not.toHaveBeenCalledWith('2');
  });
});