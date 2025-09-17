import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditableMessage } from './EditableMessage';
import type { Message as MessageType, BranchInfo } from '../types/chat';
import { BranchingAPI } from '../utils/branchingApi';

// Mock the ReactMarkdown component to render content directly
vi.mock('react-markdown', () => ({
  default: ({ children, className }: { children: string; className?: string }) => (
    <span className={className}>
      {children}
    </span>
  ),
}));

vi.mock('remark-gfm', () => ({
  default: vi.fn(),
}));

// Mock the BranchingAPI
vi.mock('../utils/branchingApi', () => ({
  BranchingAPI: {
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
  },
}));

describe('EditableMessage Component', () => {
  const mockDate = new Date('2024-01-01T12:00:00');

  const createMockMessage = (overrides?: Partial<MessageType>): MessageType => ({
    id: 'test-id',
    conversation_id: 'conv-id',
    role: 'user',
    content: 'Test message content',
    created_at: mockDate.toISOString(),
    is_active: true,
    metadata: {},
    timestamp: mockDate,
    ...overrides,
  });

  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnBranchSwitch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders message content with markdown', () => {
      const message = createMockMessage({ content: '# Hello\n**Bold text**' });
      render(<EditableMessage message={message} />);

      // The mock ReactMarkdown renders content directly
      expect(screen.getByText('# Hello **Bold text**')).toBeInTheDocument();
    });

    it('shows edit and delete buttons for user messages when editable', () => {
      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} isEditable={true} />);

      // Buttons are hidden by default, shown on hover
      const editButton = screen.getByTitle('Edit message');
      const deleteButton = screen.getByTitle('Delete message');

      expect(editButton).toBeInTheDocument();
      expect(deleteButton).toBeInTheDocument();
    });

    it('hides edit buttons when not editable', () => {
      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} isEditable={false} />);

      expect(screen.queryByTitle('Edit message')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Delete message')).not.toBeInTheDocument();
    });

    it('does not show edit buttons for assistant messages', () => {
      const message = createMockMessage({ role: 'assistant' });
      render(<EditableMessage message={message} isEditable={true} />);

      expect(screen.queryByTitle('Edit message')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Delete message')).not.toBeInTheDocument();
    });

    it('displays role indicators correctly', () => {
      const assistantMessage = createMockMessage({ role: 'assistant' });
      const { rerender } = render(<EditableMessage message={assistantMessage} />);
      expect(screen.getByText('Assistant')).toBeInTheDocument();

      const systemMessage = createMockMessage({ role: 'system' });
      rerender(<EditableMessage message={systemMessage} />);
      expect(screen.getByText('System')).toBeInTheDocument();

      const userMessage = createMockMessage({ role: 'user' });
      rerender(<EditableMessage message={userMessage} />);
      expect(screen.queryByText('User')).not.toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    it('enters edit mode when edit button is clicked', async () => {
      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Edit your message...')).toBeInTheDocument();
      });
    });

    it('shows original content in textarea when entering edit mode', async () => {
      const content = 'Original content';
      const message = createMockMessage({ role: 'user', content });
      render(<EditableMessage message={message} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const textarea = screen.getByPlaceholderText('Edit your message...') as HTMLTextAreaElement;
      expect(textarea.value).toBe(content);
    });

    it('cancels edit mode when Cancel button is clicked', async () => {
      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Edit your message...')).not.toBeInTheDocument();
        expect(screen.getByText('Test message content')).toBeInTheDocument();
      });
    });

    it('cancels edit mode when Escape key is pressed', async () => {
      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const textarea = screen.getByPlaceholderText('Edit your message...');
      fireEvent.keyDown(textarea, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Edit your message...')).not.toBeInTheDocument();
      });
    });

    it('saves edited content when Save button is clicked', async () => {
      const message = createMockMessage({ role: 'user', content: 'Original' });
      render(<EditableMessage message={message} onEdit={mockOnEdit} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const textarea = screen.getByPlaceholderText('Edit your message...');
      await userEvent.clear(textarea);
      await userEvent.type(textarea, 'Edited content');

      const saveButton = screen.getByText(/Save/);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnEdit).toHaveBeenCalledWith('test-id', 'Edited content');
      });
    });

    it('saves edited content when Cmd+Enter is pressed', async () => {
      const message = createMockMessage({ role: 'user', content: 'Original' });
      render(<EditableMessage message={message} onEdit={mockOnEdit} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const textarea = screen.getByPlaceholderText('Edit your message...');
      await userEvent.clear(textarea);
      await userEvent.type(textarea, 'Edited content');

      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

      await waitFor(() => {
        expect(mockOnEdit).toHaveBeenCalledWith('test-id', 'Edited content');
      });
    });

    it('does not save if content is unchanged', async () => {
      const content = 'Original content';
      const message = createMockMessage({ role: 'user', content });
      render(<EditableMessage message={message} onEdit={mockOnEdit} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const saveButton = screen.getByText(/Save/);
      fireEvent.click(saveButton);

      expect(mockOnEdit).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Edit your message...')).not.toBeInTheDocument();
      });
    });

    it('disables Save button when content is empty', async () => {
      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const textarea = screen.getByPlaceholderText('Edit your message...');
      await userEvent.clear(textarea);

      const saveButton = screen.getByText(/Save/);
      expect(saveButton).toBeDisabled();
    });

    it('falls back to direct API call when onEdit is not provided', async () => {
      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const textarea = screen.getByPlaceholderText('Edit your message...');
      await userEvent.clear(textarea);
      await userEvent.type(textarea, 'New content');

      const saveButton = screen.getByText(/Save/);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(BranchingAPI.editMessage).toHaveBeenCalledWith('test-id', { content: 'New content' });
      });
    });

    it('shows error message when edit fails', async () => {
      const errorMessage = 'Failed to save changes';
      mockOnEdit.mockRejectedValueOnce(new Error(errorMessage));

      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} onEdit={mockOnEdit} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const textarea = screen.getByPlaceholderText('Edit your message...');
      await userEvent.type(textarea, ' edited');

      const saveButton = screen.getByText(/Save/);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });
  });

  describe('Delete Functionality', () => {
    it('shows confirmation dialog when delete button is clicked', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} onDelete={mockOnDelete} isEditable={true} />);

      const deleteButton = screen.getByTitle('Delete message');
      fireEvent.click(deleteButton);

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this message?');
      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('deletes message when confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} onDelete={mockOnDelete} isEditable={true} />);

      const deleteButton = screen.getByTitle('Delete message');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith('test-id');
      });
    });

    it('falls back to direct API call when onDelete is not provided', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} isEditable={true} />);

      const deleteButton = screen.getByTitle('Delete message');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(BranchingAPI.deleteMessage).toHaveBeenCalledWith('test-id');
      });
    });

    it('shows error message when delete fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const errorMessage = 'Failed to delete message';
      mockOnDelete.mockRejectedValueOnce(new Error(errorMessage));

      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} onDelete={mockOnDelete} isEditable={true} />);

      const deleteButton = screen.getByTitle('Delete message');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });
  });

  describe('Branch Management', () => {
    it('displays branch selector when branches exist', () => {
      const message = createMockMessage();
      const branches: BranchInfo[] = [{
        parentId: 'test-id',
        branchCount: 3,
        branches: [
          { id: 'branch-1', isActive: true, preview: 'Branch 1 preview' },
          { id: 'branch-2', isActive: false, preview: 'Branch 2 preview' },
          { id: 'branch-3', isActive: false, preview: 'Branch 3 preview' },
        ],
      }];

      render(
        <EditableMessage
          message={message}
          branches={branches}
          showBranches={true}
        />
      );

      expect(screen.getByText('3 branches:')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('highlights active branch', () => {
      const message = createMockMessage();
      const branches: BranchInfo[] = [{
        parentId: 'test-id',
        branchCount: 2,
        branches: [
          { id: 'branch-1', isActive: true, preview: 'Active branch' },
          { id: 'branch-2', isActive: false, preview: 'Inactive branch' },
        ],
      }];

      render(
        <EditableMessage
          message={message}
          branches={branches}
          showBranches={true}
        />
      );

      const activeButton = screen.getByTitle('Active branch');
      const inactiveButton = screen.getByTitle('Inactive branch');

      expect(activeButton).toHaveClass('bg-blue-500', 'text-white');
      expect(inactiveButton).toHaveClass('bg-gray-100');
    });

    it('switches branches when branch button is clicked', async () => {
      const message = createMockMessage();
      const branches: BranchInfo[] = [{
        parentId: 'test-id',
        branchCount: 2,
        branches: [
          { id: 'branch-1', isActive: true, preview: 'Branch 1' },
          { id: 'branch-2', isActive: false, preview: 'Branch 2' },
        ],
      }];

      render(
        <EditableMessage
          message={message}
          branches={branches}
          showBranches={true}
          onBranchSwitch={mockOnBranchSwitch}
        />
      );

      const inactiveBranchButton = screen.getByText('2');
      fireEvent.click(inactiveBranchButton);

      await waitFor(() => {
        expect(mockOnBranchSwitch).toHaveBeenCalledWith('branch-2');
      });
    });

    it('does not show branches when showBranches is false', () => {
      const message = createMockMessage();
      const branches: BranchInfo[] = [{
        parentId: 'test-id',
        branchCount: 2,
        branches: [
          { id: 'branch-1', isActive: true, preview: 'Branch 1' },
          { id: 'branch-2', isActive: false, preview: 'Branch 2' },
        ],
      }];

      render(
        <EditableMessage
          message={message}
          branches={branches}
          showBranches={false}
        />
      );

      expect(screen.queryByText('2 branches:')).not.toBeInTheDocument();
    });

    it('shows error when branch switch fails', async () => {
      const errorMessage = 'Failed to switch branch';
      mockOnBranchSwitch.mockRejectedValueOnce(new Error(errorMessage));

      const message = createMockMessage();
      const branches: BranchInfo[] = [{
        parentId: 'test-id',
        branchCount: 2,
        branches: [
          { id: 'branch-1', isActive: true, preview: 'Branch 1' },
          { id: 'branch-2', isActive: false, preview: 'Branch 2' },
        ],
      }];

      render(
        <EditableMessage
          message={message}
          branches={branches}
          showBranches={true}
          onBranchSwitch={mockOnBranchSwitch}
        />
      );

      const inactiveBranchButton = screen.getByText('2');
      fireEvent.click(inactiveBranchButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading state during save', async () => {
      mockOnEdit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      const message = createMockMessage({ role: 'user' });
      render(<EditableMessage message={message} onEdit={mockOnEdit} isEditable={true} />);

      const editButton = screen.getByTitle('Edit message');
      fireEvent.click(editButton);

      const textarea = screen.getByPlaceholderText('Edit your message...');
      await userEvent.type(textarea, ' edited');

      const saveButton = screen.getByText(/Save/);
      fireEvent.click(saveButton);

      expect(screen.getByText('Saving...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
      });
    });

    it('disables buttons during loading', async () => {
      mockOnDelete.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      const message = createMockMessage({ role: 'user' });
      const { container } = render(
        <EditableMessage message={message} onDelete={mockOnDelete} isEditable={true} />
      );

      const deleteButton = screen.getByTitle('Delete message');
      fireEvent.click(deleteButton);

      // Check that the container has opacity class indicating loading
      await waitFor(() => {
        const messageContainer = container.querySelector('.opacity-50');
        expect(messageContainer).toBeInTheDocument();
      });
    });
  });

  describe('Styling', () => {
    it('applies correct styles for user messages', () => {
      const message = createMockMessage({ role: 'user' });
      const { container } = render(<EditableMessage message={message} />);

      const wrapper = container.querySelector('.flex.w-full');
      expect(wrapper).toHaveClass('justify-end');

      const messageBox = container.querySelector('.bg-blue-500');
      expect(messageBox).toBeInTheDocument();
      expect(messageBox).toHaveClass('text-white');
    });

    it('applies correct styles for assistant messages', () => {
      const message = createMockMessage({ role: 'assistant' });
      const { container } = render(<EditableMessage message={message} />);

      const wrapper = container.querySelector('.flex.w-full');
      expect(wrapper).toHaveClass('justify-start');

      const messageBox = container.querySelector('.bg-white');
      expect(messageBox).toBeInTheDocument();
    });

    it('applies correct styles for system messages', () => {
      const message = createMockMessage({ role: 'system' });
      const { container } = render(<EditableMessage message={message} />);

      const messageBox = container.querySelector('.bg-yellow-50');
      expect(messageBox).toBeInTheDocument();
    });
  });
});