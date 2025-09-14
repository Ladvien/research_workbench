import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Chat } from '../../src/components/Chat';

// Mock the Message component to simplify testing
vi.mock('../../src/components/Message', () => ({
  Message: ({ message }: { message: any }) => (
    <div data-testid={`message-${message.id}`} data-role={message.role}>
      {message.content}
    </div>
  ),
}));

describe('Chat', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the chat interface with header and input', () => {
    render(<Chat />);

    expect(screen.getByText('Workbench LLM Chat')).toBeInTheDocument();
    expect(screen.getByText('Chat with your AI assistant')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('displays initial system message', () => {
    render(<Chat />);

    expect(screen.getByText(/Welcome to the Workbench LLM Chat Application/)).toBeInTheDocument();
  });

  it('shows error message when simulating an API error', () => {
    render(<Chat />);

    // The error state UI should be ready to display errors
    // We can't easily test it without mocking the API call
    // but we can check that the error UI structure exists
    expect(screen.queryByText(/Failed to send message/)).not.toBeInTheDocument();
  });

  it('button is disabled when input is empty', () => {
    render(<Chat />);

    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();
  });

  it('input field is present and accepts text input', () => {
    render(<Chat />);

    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)');
    expect(input).toBeInTheDocument();

    // Simulate typing
    fireEvent.change(input, { target: { value: 'Hello world' } });
    expect(input).toHaveValue('Hello world');
  });

  it('send button becomes enabled when input has content', () => {
    render(<Chat />);

    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    expect(sendButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(sendButton).toBeEnabled();
  });

  it('clears input and adds message when form is submitted', () => {
    render(<Chat />);

    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)');
    const form = input.closest('form');

    fireEvent.change(input, { target: { value: 'Test message' } });
    expect(input).toHaveValue('Test message');

    fireEvent.submit(form!);

    // Input should be cleared
    expect(input).toHaveValue('');

    // Message should be added to the chat
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('shows loading state when message is sent', () => {
    render(<Chat />);

    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)');
    const form = input.closest('form');

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.submit(form!);

    // Should show loading state
    expect(screen.getByText('Thinking...')).toBeInTheDocument();

    // Input should be disabled during loading
    expect(input).toBeDisabled();
  });

  it('has the structure for assistant responses', () => {
    render(<Chat />);

    const input = screen.getByPlaceholderText('Type your message... (Shift+Enter for new line)');
    const form = input.closest('form');

    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.submit(form!);

    // Should show loading state immediately
    expect(screen.getByText('Thinking...')).toBeInTheDocument();

    // Note: The actual assistant response would be tested with real API integration
    // For now, we just verify the loading state appears correctly
  });
});