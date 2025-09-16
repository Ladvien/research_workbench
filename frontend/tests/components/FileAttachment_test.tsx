import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileAttachment, { AttachmentFile } from '../../src/components/FileAttachment';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Upload: ({ className, ...props }: any) => <div data-testid="upload-icon" className={className} {...props} />,
  X: ({ className, ...props }: any) => <div data-testid="x-icon" className={className} {...props} />,
  File: ({ className, ...props }: any) => <div data-testid="file-icon" className={className} {...props} />,
  Image: ({ className, ...props }: any) => <div data-testid="image-icon" className={className} {...props} />,
  FileText: ({ className, ...props }: any) => <div data-testid="filetext-icon" className={className} {...props} />,
  Download: ({ className, ...props }: any) => <div data-testid="download-icon" className={className} {...props} />,
  Trash2: ({ className, ...props }: any) => <div data-testid="trash-icon" className={className} {...props} />,
}));

const mockAttachments: AttachmentFile[] = [
  {
    id: '1',
    messageId: 'msg-123',
    filename: 'example.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024 * 500,
    downloadUrl: '/api/files/1',
    createdAt: '2023-01-01T00:00:00Z',
  },
  {
    id: '2',
    messageId: 'msg-123',
    filename: 'image.png',
    contentType: 'image/png',
    sizeBytes: 1024 * 256,
    downloadUrl: '/api/v1/files/2',
    createdAt: '2023-01-01T00:00:00Z',
  },
];

describe('FileAttachment', () => {
  const mockOnUpload = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders upload area when messageId and onUpload provided', () => {
    render(
      <FileAttachment
        messageId="msg-123"
        onUpload={mockOnUpload}
      />
    );

    expect(screen.getByText('Drop files here or click to upload')).toBeInTheDocument();
    expect(screen.getByTestId('upload-icon')).toBeInTheDocument();
  });

  it('does not render upload area when no messageId provided', () => {
    render(
      <FileAttachment
        attachments={mockAttachments}
        onUpload={mockOnUpload}
      />
    );

    expect(screen.queryByText('Drop files here or click to upload')).not.toBeInTheDocument();
  });

  it('renders attachments list', () => {
    render(
      <FileAttachment
        attachments={mockAttachments}
      />
    );

    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.getByText('example.pdf')).toBeInTheDocument();
    expect(screen.getByText('image.png')).toBeInTheDocument();
    expect(screen.getByText('500 KB')).toBeInTheDocument();
    expect(screen.getByText('256 KB')).toBeInTheDocument();
  });

  it('shows correct file type icons', () => {
    render(
      <FileAttachment
        attachments={mockAttachments}
      />
    );

    // Should have filetext icon for PDF
    expect(screen.getByTestId('filetext-icon')).toBeInTheDocument();

    // Should have image icon for PNG
    expect(screen.getByTestId('image-icon')).toBeInTheDocument();
  });

  it('calls onDelete when delete button clicked', async () => {
    const user = userEvent.setup();

    render(
      <FileAttachment
        attachments={mockAttachments}
        onDelete={mockOnDelete}
      />
    );

    const deleteButtons = screen.getAllByTestId('trash-icon');
    await user.click(deleteButtons[0]);

    expect(mockOnDelete).toHaveBeenCalledWith('1');
  });

  it('formats file sizes correctly', () => {
    const attachmentsWithVariousSizes: AttachmentFile[] = [
      {
        id: '1',
        messageId: 'msg-123',
        filename: 'small.txt',
        sizeBytes: 512, // 512 B
        downloadUrl: '/api/v1/files/1',
        createdAt: '2023-01-01T00:00:00Z',
      },
      {
        id: '2',
        messageId: 'msg-123',
        filename: 'medium.pdf',
        sizeBytes: 1024 * 1024 * 2, // 2 MB
        downloadUrl: '/api/v1/files/2',
        createdAt: '2023-01-01T00:00:00Z',
      },
    ];

    render(
      <FileAttachment
        attachments={attachmentsWithVariousSizes}
      />
    );

    expect(screen.getByText('512 B')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
  });

  it('shows error message when provided', () => {
    render(
      <FileAttachment
        messageId="msg-123"
        onUpload={mockOnUpload}
      />
    );

    // Simulate error by creating a large file
    const file = new File(['test'], 'large-file.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 }); // 20MB

    const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText(/File size exceeds/)).toBeInTheDocument();
  });

  it('shows disabled state correctly', () => {
    render(
      <FileAttachment
        messageId="msg-123"
        onUpload={mockOnUpload}
        disabled={true}
      />
    );

    const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it('handles file validation for allowed types', () => {
    render(
      <FileAttachment
        messageId="msg-123"
        onUpload={mockOnUpload}
        allowedTypes={['.txt', '.pdf']}
      />
    );

    // Try to upload a disallowed file type
    const file = new File(['test'], 'test.exe', { type: 'application/x-executable' });
    const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText(/File type not allowed/)).toBeInTheDocument();
  });

  it('creates download link when download button clicked', async () => {
    const user = userEvent.setup();

    // Mock createElement and other DOM methods
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);

    render(
      <FileAttachment
        attachments={mockAttachments}
      />
    );

    const downloadButtons = screen.getAllByTestId('download-icon');
    await user.click(downloadButtons[0]);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(mockLink.href).toBe('/api/v1/files/1');
    expect(mockLink.download).toBe('example.pdf');
    expect(mockLink.click).toHaveBeenCalled();
    expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
    expect(removeChildSpy).toHaveBeenCalledWith(mockLink);

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});

describe('FileAttachment - File Size Formatting', () => {
  it('formats bytes correctly', () => {
    const attachment: AttachmentFile = {
      id: '1',
      messageId: 'msg-123',
      filename: 'test.txt',
      sizeBytes: 512,
      downloadUrl: '/api/v1/files/1',
      createdAt: '2023-01-01T00:00:00Z',
    };

    render(<FileAttachment attachments={[attachment]} />);
    expect(screen.getByText('512 B')).toBeInTheDocument();
  });

  it('formats kilobytes correctly', () => {
    const attachment: AttachmentFile = {
      id: '1',
      messageId: 'msg-123',
      filename: 'test.txt',
      sizeBytes: 1536, // 1.5 KB
      downloadUrl: '/api/v1/files/1',
      createdAt: '2023-01-01T00:00:00Z',
    };

    render(<FileAttachment attachments={[attachment]} />);
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();
  });

  it('formats megabytes correctly', () => {
    const attachment: AttachmentFile = {
      id: '1',
      messageId: 'msg-123',
      filename: 'test.txt',
      sizeBytes: 2 * 1024 * 1024, // 2 MB
      downloadUrl: '/api/v1/files/1',
      createdAt: '2023-01-01T00:00:00Z',
    };

    render(<FileAttachment attachments={[attachment]} />);
    expect(screen.getByText('2 MB')).toBeInTheDocument();
  });
});