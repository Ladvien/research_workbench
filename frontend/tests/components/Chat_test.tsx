import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Chat } from '../../src/components/Chat';
import { useConversationStore } from '../../src/hooks/useConversationStore';
import type { Message } from '../../src/types';

// Mock the Message component to simplify testing
vi.mock('../../src/components/Message', () => ({
  Message: ({ message }: { message: Message }) => (
    <div data-testid={`message-${message.id}`} data-role={message.role}>
      {message.content}
    </div>
  ),
}));

// Mock the conversation store
vi.mock('../../src/hooks/useConversationStore');

const mockUseConversationStore = vi.mocked(useConversationStore);

const mockMessages: Message[] = [
  {
    id: 'msg1',
    conversation_id: '1',
    role: 'system',
    content: 'Welcome to the Workbench LLM Chat Application! I\'m your AI assistant.',
    created_at: '2025-09-14T10:00:00Z',
    is_active: true,
    metadata: {}
  }
];

const mockStoreActions = {
  currentMessages: mockMessages,
  currentConversationId: '1',
  isLoading: false,
  error: null,
  sendMessage: vi.fn(),
  clearError: vi.fn()
};

describe('Chat', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockUseConversationStore.mockReturnValue(mockStoreActions);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the chat interface with conversation header', () => {
    render(<Chat />);

    expect(screen.getByText('Workbench LLM Chat')).toBeInTheDocument();
    expect(screen.getByText('Chat with your AI assistant')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')).toBeInTheDocument();
  });

  it('renders welcome screen when no conversation exists', () => {
    mockUseConversationStore.mockReturnValue({
      ...mockStoreActions,
      currentConversationId: null,
      currentMessages: []
    });

    render(<Chat />);

    expect(screen.getByText('Start a New Conversation')).toBeInTheDocument();
    expect(screen.getByText('Send a message to begin chatting')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Workbench')).toBeInTheDocument();
  });

  it('displays messages when conversation exists', () => {
    render(<Chat />);

    expect(screen.getByText('Welcome to the Workbench LLM Chat Application! I\'m your AI assistant.')).toBeInTheDocument();
  });

  it('shows error message and allows clearing it', () => {
    mockUseConversationStore.mockReturnValue({
      ...mockStoreActions,
      error: 'Test error message'
    });

    render(<Chat />);

    expect(screen.getByText('Test error message')).toBeInTheDocument();

    const clearButton = screen.getByText('Test error message').nextElementSibling as HTMLElement;
    fireEvent.click(clearButton);

    expect(mockStoreActions.clearError).toHaveBeenCalled();
  });

  it('calls sendMessage when form is submitted', () => {
    render(<Chat />);

    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)');
    const form = input.closest('form');

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.submit(form!);

    expect(mockStoreActions.sendMessage).toHaveBeenCalledWith('Test message');
  });

  it('shows loading state when isLoading is true', () => {
    mockUseConversationStore.mockReturnValue({
      ...mockStoreActions,
      isLoading: true
    });

    render(<Chat />);

    expect(screen.getByText('Thinking...')).toBeInTheDocument();

    // Input should be disabled during loading
    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)');
    expect(input).toBeDisabled();
  });

  it('input field is present and accepts text input', () => {
    render(<Chat />);

    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)');
    expect(input).toBeInTheDocument();

    // Simulate typing
    fireEvent.change(input, { target: { value: 'Hello world' } });
    expect(input).toHaveValue('Hello world');
  });
});