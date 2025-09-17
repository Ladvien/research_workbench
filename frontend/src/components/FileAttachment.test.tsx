import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileAttachment, { AttachmentFile } from './FileAttachment';
import { createMockFile, createMockImage } from '../../tests/test-utils';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Upload: ({ className }: any) => <div data-testid="upload-icon" className={className} />,
  X: ({ className }: any) => <div data-testid="x-icon" className={className} />,
  File: ({ className }: any) => <div data-testid="file-icon" className={className} />,
  Image: ({ className }: any) => <div data-testid="image-icon" className={className} />,
  FileText: ({ className }: any) => <div data-testid="file-text-icon" className={className} />,
  Download: ({ className }: any) => <div data-testid="download-icon" className={className} />,
  Trash2: ({ className }: any) => <div data-testid="trash-icon" className={className} />
}));

describe('FileAttachment Component', () => {
  const mockAttachment: AttachmentFile = {
    id: 'attach-1',
    messageId: 'msg-1',
    filename: 'document.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024000, // 1MB
    downloadUrl: 'https://example.com/download/attach-1',
    createdAt: '2024-01-01T12:00:00Z'
  };

  const defaultProps = {
    messageId: 'msg-1',
    attachments: [],
    onUpload: vi.fn(),
    onDelete: vi.fn(),
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/*', '.pdf', '.txt', '.md', '.doc', '.docx'],
    disabled: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any created DOM elements
    document.body.innerHTML = '';
  });

  describe('Basic Rendering', () => {
    it('renders upload area when onUpload and messageId are provided', () => {
      render(<FileAttachment {...defaultProps} />);

      expect(screen.getByText('Drop files here or click to upload')).toBeInTheDocument();
      expect(screen.getByTestId('upload-icon')).toBeInTheDocument();
    });

    it('does not render upload area when onUpload is not provided', () => {
      render(<FileAttachment {...defaultProps} onUpload={undefined} />);

      expect(screen.queryByText('Drop files here or click to upload')).not.toBeInTheDocument();
    });

    it('does not render upload area when messageId is not provided', () => {
      render(<FileAttachment {...defaultProps} messageId={undefined} />);

      expect(screen.queryByText('Drop files here or click to upload')).not.toBeInTheDocument();
    });

    it('renders custom className', () => {
      const { container } = render(<FileAttachment {...defaultProps} className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('displays file size and type limits', () => {
      render(<FileAttachment {...defaultProps} />);

      expect(screen.getByText(/Max 10 MB/)).toBeInTheDocument();
      expect(screen.getByText(/image\/\*, \.pdf, \.txt, \.md, \.doc, \.docx/)).toBeInTheDocument();
    });
  });

  describe('File Upload', () => {
    it('handles file selection via input', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn().mockResolvedValue(undefined);

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} />);

      const file = createMockFile('test.pdf', 'application/pdf');
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, file);

      expect(onUploadSpy).toHaveBeenCalledWith(file, 'msg-1');
    });

    it('shows uploading state during upload', async () => {
      const user = userEvent.setup();
      let resolveUpload: () => void;
      const uploadPromise = new Promise<void>((resolve) => {
        resolveUpload = resolve;
      });
      const onUploadSpy = vi.fn().mockReturnValue(uploadPromise);

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} />);

      const file = createMockFile('test.pdf', 'application/pdf');
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, file);

      expect(screen.getByText('Uploading test.pdf...')).toBeInTheDocument();

      resolveUpload!();
      await waitFor(() => {
        expect(screen.queryByText('Uploading test.pdf...')).not.toBeInTheDocument();
      });
    });

    it('displays error when upload fails', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn().mockRejectedValue(new Error('Upload failed'));

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} />);

      const file = createMockFile('test.pdf', 'application/pdf');
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('Upload failed')).toBeInTheDocument();
      });
    });

    it('allows clearing error message', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn().mockRejectedValue(new Error('Upload failed'));

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} />);

      const file = createMockFile('test.pdf', 'application/pdf');
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('Upload failed')).toBeInTheDocument();
      });

      const closeButton = screen.getByTestId('x-icon').closest('button')!;
      await user.click(closeButton);

      expect(screen.queryByText('Upload failed')).not.toBeInTheDocument();
    });
  });

  describe('Drag and Drop', () => {
    it('handles drag and drop operations', async () => {
      const onUploadSpy = vi.fn().mockResolvedValue(undefined);

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} />);

      const dropArea = screen.getByText('Drop files here or click to upload').closest('div')!;
      const file = createMockFile('test.pdf', 'application/pdf');

      // Simulate drop event directly since userEvent doesn't support all drag events
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        dataTransfer: {
          files: [file],
        } as any
      });

      await userEvent.tripleClick(dropArea); // Just ensure the area is interactive
      dropArea.dispatchEvent(dropEvent);

      expect(onUploadSpy).toHaveBeenCalledWith(file, 'msg-1');
    });

    it('updates visual state during drag operations', async () => {
      render(<FileAttachment {...defaultProps} />);

      const dropArea = screen.getByText('Drop files here or click to upload').closest('div')!;

      // Check initial state
      expect(dropArea).not.toHaveClass('border-blue-400', 'bg-blue-50');

      // Simulate drag over event directly
      const dragOverEvent = new DragEvent('dragover', { bubbles: true });
      dropArea.dispatchEvent(dragOverEvent);

      // Should have dragging styles
      expect(dropArea).toHaveClass('border-blue-400', 'bg-blue-50');

      // Simulate drag leave
      const dragLeaveEvent = new DragEvent('dragleave', { bubbles: true });
      dropArea.dispatchEvent(dragLeaveEvent);

      // Should return to normal state
      expect(dropArea).not.toHaveClass('border-blue-400', 'bg-blue-50');
    });

    it('ignores drag operations when disabled', async () => {
      const onUploadSpy = vi.fn();

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} disabled />);

      const dropArea = screen.getByText('Drop files here or click to upload').closest('div')!;
      const file = createMockFile('test.pdf', 'application/pdf');

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        dataTransfer: {
          files: [file],
        } as any
      });

      dropArea.dispatchEvent(dropEvent);

      expect(onUploadSpy).not.toHaveBeenCalled();
    });
  });

  describe('File Validation', () => {
    it('rejects files exceeding size limit', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn();

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} maxFileSize={1024} />);

      const largeFile = createMockFile('large.pdf', 'application/pdf', 'x'.repeat(2048));
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, largeFile);

      expect(screen.getByText(/File size exceeds 1 KB limit/)).toBeInTheDocument();
      expect(onUploadSpy).not.toHaveBeenCalled();
    });

    it('rejects files with disallowed types', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn();

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} allowedTypes={['.pdf']} />);

      const disallowedFile = createMockFile('script.js', 'application/javascript');
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, disallowedFile);

      await waitFor(() => {
        expect(screen.getByText(/File type not allowed/)).toBeInTheDocument();
      });
      expect(onUploadSpy).not.toHaveBeenCalled();
    });

    it('accepts files matching wildcard types', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn().mockResolvedValue(undefined);

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} allowedTypes={['image/*']} />);

      const imageFile = createMockImage('image.png');
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, imageFile);

      expect(onUploadSpy).toHaveBeenCalledWith(imageFile, 'msg-1');
    });

    it('accepts files matching exact MIME types', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn().mockResolvedValue(undefined);

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} allowedTypes={['application/pdf']} />);

      const pdfFile = createMockFile('document.pdf', 'application/pdf');
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, pdfFile);

      expect(onUploadSpy).toHaveBeenCalledWith(pdfFile, 'msg-1');
    });
  });

  describe('Attachments Display', () => {
    it('renders attachments list when attachments exist', () => {
      render(<FileAttachment {...defaultProps} attachments={[mockAttachment]} />);

      expect(screen.getByText('Attachments')).toBeInTheDocument();
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      // Check for file size - it should be displayed in KB
      expect(screen.getByText(/1000 KB/)).toBeInTheDocument();
      // Check for date - it may be formatted differently based on locale
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });

    it('does not render attachments section when no attachments', () => {
      render(<FileAttachment {...defaultProps} attachments={[]} />);

      expect(screen.queryByText('Attachments')).not.toBeInTheDocument();
    });

    it('displays correct file icons based on file type', () => {
      const attachments = [
        { ...mockAttachment, id: '1', filename: 'image.png', contentType: 'image/png' },
        { ...mockAttachment, id: '2', filename: 'document.pdf', contentType: 'application/pdf' },
        { ...mockAttachment, id: '3', filename: 'text.txt', contentType: 'text/plain' },
        { ...mockAttachment, id: '4', filename: 'unknown.xyz', contentType: 'application/unknown' }
      ];

      render(<FileAttachment {...defaultProps} attachments={attachments} />);

      expect(screen.getByTestId('image-icon')).toBeInTheDocument();
      expect(screen.getAllByTestId('file-text-icon')).toHaveLength(2); // PDF and text
      expect(screen.getByTestId('file-icon')).toBeInTheDocument(); // Unknown type
    });

    it('handles missing file size gracefully', () => {
      const attachmentWithoutSize = { ...mockAttachment, sizeBytes: undefined };

      render(<FileAttachment {...defaultProps} attachments={[attachmentWithoutSize]} />);

      expect(screen.getByText(/Unknown size/)).toBeInTheDocument();
    });

    it('handles missing creation date gracefully', () => {
      const attachmentWithoutDate = { ...mockAttachment, createdAt: '' };

      render(<FileAttachment {...defaultProps} attachments={[attachmentWithoutDate]} />);

      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      // Should not crash and should display size
      expect(screen.getByText('1000 KB')).toBeInTheDocument();
    });
  });

  describe('File Operations', () => {
    it('handles file download', async () => {
      const user = userEvent.setup();

      // Mock createElement and DOM methods more thoroughly
      const mockLink = document.createElement('a');
      Object.defineProperty(mockLink, 'href', { writable: true, value: '' });
      Object.defineProperty(mockLink, 'download', { writable: true, value: '' });
      mockLink.click = vi.fn();

      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink);

      render(<FileAttachment {...defaultProps} attachments={[mockAttachment]} />);

      const downloadButton = screen.getByTitle('Download file');
      await user.click(downloadButton);

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockLink.href).toBe('https://example.com/download/attach-1');
      expect(mockLink.download).toBe('document.pdf');
      expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
      expect(mockLink.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockLink);

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('handles file deletion when onDelete is provided', async () => {
      const user = userEvent.setup();
      const onDeleteSpy = vi.fn().mockResolvedValue(undefined);

      render(<FileAttachment {...defaultProps} attachments={[mockAttachment]} onDelete={onDeleteSpy} />);

      const deleteButton = screen.getByTitle('Delete file');
      await user.click(deleteButton);

      expect(onDeleteSpy).toHaveBeenCalledWith('attach-1');
    });

    it('does not render delete button when onDelete is not provided', () => {
      render(<FileAttachment {...defaultProps} attachments={[mockAttachment]} onDelete={undefined} />);

      expect(screen.queryByTitle('Delete file')).not.toBeInTheDocument();
    });

    it('displays error when deletion fails', async () => {
      const user = userEvent.setup();
      const onDeleteSpy = vi.fn().mockRejectedValue(new Error('Delete failed'));

      render(<FileAttachment {...defaultProps} attachments={[mockAttachment]} onDelete={onDeleteSpy} />);

      const deleteButton = screen.getByTitle('Delete file');
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });
    });
  });

  describe('File Size Formatting', () => {
    it('formats bytes correctly', () => {
      const testCases = [
        { bytes: 500, expected: /500 B/ },
        { bytes: 1024, expected: /1 KB/ },
        { bytes: 1536, expected: /1\.5 KB/ },
        { bytes: 1048576, expected: /1 MB/ },
        { bytes: 1073741824, expected: /1 GB/ }
      ];

      testCases.forEach(({ bytes, expected }, index) => {
        const attachment = { ...mockAttachment, id: `test-${index}`, sizeBytes: bytes };
        const { unmount } = render(<FileAttachment {...defaultProps} attachments={[attachment]} />);

        expect(screen.getByText(expected)).toBeInTheDocument();

        // Clean up for next iteration
        unmount();
      });
    });
  });

  describe('Disabled State', () => {
    it('applies disabled styling when disabled', () => {
      const { container } = render(<FileAttachment {...defaultProps} disabled />);

      const uploadArea = container.querySelector('.border-gray-200.bg-gray-50.cursor-not-allowed');
      expect(uploadArea).toBeInTheDocument();
    });

    it('disables file input when disabled', () => {
      render(<FileAttachment {...defaultProps} disabled />);

      const input = screen.getByLabelText(/Drop files here or click to upload/) as HTMLInputElement;
      expect(input).toBeDisabled();
    });

    it('shows disabled upload icon styling', () => {
      render(<FileAttachment {...defaultProps} disabled />);

      const uploadIcon = screen.getByTestId('upload-icon');
      expect(uploadIcon).toHaveClass('text-gray-400');
    });

    it('ignores file selection when disabled', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn();

      render(<FileAttachment {...defaultProps} disabled onUpload={onUploadSpy} />);

      const input = screen.getByLabelText(/Drop files here or click to upload/);
      const file = createMockFile('test.pdf', 'application/pdf');

      // Attempt to upload file
      await user.upload(input, file);

      expect(onUploadSpy).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('provides proper labels for interactive elements', () => {
      render(<FileAttachment {...defaultProps} attachments={[mockAttachment]} />);

      expect(screen.getByLabelText(/Drop files here or click to upload/)).toBeInTheDocument();
      expect(screen.getByTitle('Download file')).toBeInTheDocument();
      expect(screen.getByTitle('Delete file')).toBeInTheDocument();
    });

    it('uses semantic HTML structure', () => {
      const { container } = render(<FileAttachment {...defaultProps} attachments={[mockAttachment]} />);

      const heading = screen.getByRole('heading', { level: 4 });
      expect(heading).toHaveTextContent('Attachments');

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('provides keyboard navigation for file input', () => {
      render(<FileAttachment {...defaultProps} />);

      const input = screen.getByRole('button', { hidden: true }) || document.querySelector('#file-upload');
      expect(input).toBeInTheDocument();

      const label = screen.getByText(/Drop files here or click to upload/);
      expect(label).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles files without extensions', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn().mockResolvedValue(undefined);

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} allowedTypes={['text/plain']} />);

      const fileWithoutExt = createMockFile('README', 'text/plain');
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, fileWithoutExt);

      expect(onUploadSpy).toHaveBeenCalledWith(fileWithoutExt, 'msg-1');
    });

    it('handles empty file lists', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn();

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} />);

      const input = screen.getByLabelText(/Drop files here or click to upload/);

      // Simulate selecting no files
      await user.upload(input, []);

      expect(onUploadSpy).not.toHaveBeenCalled();
    });

    it('handles null/undefined error objects gracefully', async () => {
      const user = userEvent.setup();
      const onUploadSpy = vi.fn().mockRejectedValue('String error');

      render(<FileAttachment {...defaultProps} onUpload={onUploadSpy} />);

      const file = createMockFile('test.pdf', 'application/pdf');
      const input = screen.getByLabelText(/Drop files here or click to upload/);

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('Upload failed')).toBeInTheDocument();
      });
    });

    it('handles very large attachment lists', () => {
      const manyAttachments = Array.from({ length: 100 }, (_, i) => ({
        ...mockAttachment,
        id: `attach-${i}`,
        filename: `file-${i}.pdf`
      }));

      render(<FileAttachment {...defaultProps} attachments={manyAttachments} />);

      expect(screen.getByText('Attachments')).toBeInTheDocument();
      expect(screen.getByText('file-0.pdf')).toBeInTheDocument();
      expect(screen.getByText('file-99.pdf')).toBeInTheDocument();
    });
  });
});