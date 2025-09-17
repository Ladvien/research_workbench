import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileService } from './fileService';
import type { AttachmentFile } from '../components/FileAttachment';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock URL for download functionality
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
});

// Mock document for download functionality
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockClick = vi.fn();
const mockLink = {
  href: '',
  download: '',
  click: mockClick,
};
const mockCreateElement = vi.fn().mockReturnValue(mockLink);

Object.defineProperty(document, 'createElement', {
  value: mockCreateElement,
});
Object.defineProperty(document.body, 'appendChild', {
  value: mockAppendChild,
});
Object.defineProperty(document.body, 'removeChild', {
  value: mockRemoveChild,
});

describe('FileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockFile = new File(['test content'], 'test.txt', {
        type: 'text/plain',
      });
      const messageId = 'msg-123';
      const mockResponse = {
        id: 'file-456',
        messageId,
        filename: 'test.txt',
        contentType: 'text/plain',
        sizeBytes: 12,
        uploadUrl: '/uploads/test.txt',
        createdAt: '2023-01-01T00:00:00Z',
      };

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      const result = await FileService.uploadFile(mockFile, messageId);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/upload',
        {
          method: 'POST',
          body: expect.any(FormData),
          credentials: 'include',
        }
      );

      // Verify FormData content
      const formData = mockFetch.mock.calls[0][1].body;
      expect(formData.get('file')).toBe(mockFile);
      expect(formData.get('message_id')).toBe(messageId);

      expect(result).toEqual(mockResponse);
    });

    it('should handle upload failure with JSON error', async () => {
      const mockFile = new File(['test'], 'test.txt');
      const mockFetchResponse = {
        ok: false,
        json: vi.fn().mockResolvedValue({ error: 'File too large' }),
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await expect(FileService.uploadFile(mockFile, 'msg-123'))
        .rejects.toThrow('File too large');
    });

    it('should handle upload failure with non-JSON error', async () => {
      const mockFile = new File(['test'], 'test.txt');
      const mockFetchResponse = {
        ok: false,
        statusText: 'Bad Request',
        json: vi.fn().mockRejectedValue(new Error('Not JSON')),
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await expect(FileService.uploadFile(mockFile, 'msg-123'))
        .rejects.toThrow('Upload failed: Bad Request');
    });

    it('should handle network error', async () => {
      const mockFile = new File(['test'], 'test.txt');
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      await expect(FileService.uploadFile(mockFile, 'msg-123'))
        .rejects.toThrow('Network error');
    });
  });

  describe('getMessageAttachments', () => {
    it('should fetch message attachments successfully', async () => {
      const messageId = 'msg-123';
      const mockApiResponse = [
        {
          id: 'file-1',
          message_id: messageId,
          filename: 'doc1.pdf',
          content_type: 'application/pdf',
          size_bytes: 1024,
          download_url: '/files/doc1.pdf',
          created_at: '2023-01-01T00:00:00Z',
        },
        {
          id: 'file-2',
          message_id: messageId,
          filename: 'image.png',
          content_type: 'image/png',
          size_bytes: 2048,
          download_url: '/files/image.png',
          created_at: '2023-01-02T00:00:00Z',
        },
      ];

      const expectedResponse: AttachmentFile[] = [
        {
          id: 'file-1',
          messageId,
          filename: 'doc1.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
          downloadUrl: '/files/doc1.pdf',
          createdAt: '2023-01-01T00:00:00Z',
        },
        {
          id: 'file-2',
          messageId,
          filename: 'image.png',
          contentType: 'image/png',
          sizeBytes: 2048,
          downloadUrl: '/files/image.png',
          createdAt: '2023-01-02T00:00:00Z',
        },
      ];

      const mockFetchResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockApiResponse),
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      const result = await FileService.getMessageAttachments(messageId);

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:8080/api/v1/messages/${messageId}/attachments`,
        {
          credentials: 'include',
        }
      );
      expect(result).toEqual(expectedResponse);
    });

    it('should handle fetch attachments failure', async () => {
      const messageId = 'msg-123';
      const mockFetchResponse = {
        ok: false,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({ error: 'Message not found' }),
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await expect(FileService.getMessageAttachments(messageId))
        .rejects.toThrow('Message not found');
    });

    it('should handle network error when fetching attachments', async () => {
      const messageId = 'msg-123';
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      await expect(FileService.getMessageAttachments(messageId))
        .rejects.toThrow('Network error');
    });
  });

  describe('deleteAttachment', () => {
    it('should delete attachment successfully', async () => {
      const attachmentId = 'file-123';
      const mockFetchResponse = {
        ok: true,
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await FileService.deleteAttachment(attachmentId);

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:8080/api/v1/files/${attachmentId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );
    });

    it('should handle delete failure', async () => {
      const attachmentId = 'file-123';
      const mockFetchResponse = {
        ok: false,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({ error: 'File not found' }),
      };
      mockFetch.mockResolvedValue(mockFetchResponse);

      await expect(FileService.deleteAttachment(attachmentId))
        .rejects.toThrow('File not found');
    });
  });

  describe('getDownloadUrl', () => {
    it('should return correct download URL', () => {
      const attachmentId = 'file-123';
      const url = FileService.getDownloadUrl(attachmentId);

      expect(url).toBe('http://localhost:8080/api/v1/files/file-123');
    });
  });

  describe('validateFile', () => {
    it('should validate file within size limit', () => {
      const file = new File(['small content'], 'test.txt', {
        type: 'text/plain',
      });

      const result = FileService.validateFile(file);

      expect(result).toBeNull();
    });

    it('should reject file exceeding size limit', () => {
      // Create a mock file with large size
      const file = new File(['content'], 'large.txt', {
        type: 'text/plain',
      });
      Object.defineProperty(file, 'size', {
        value: 15 * 1024 * 1024, // 15MB
        writable: false,
      });

      const result = FileService.validateFile(file);

      expect(result).toBe('File size exceeds 10MB limit');
    });

    it('should accept allowed file types', () => {
      const imageFile = new File(['content'], 'image.png', {
        type: 'image/png',
      });
      const pdfFile = new File(['content'], 'doc.pdf', {
        type: 'application/pdf',
      });
      const textFile = new File(['content'], 'text.txt', {
        type: 'text/plain',
      });

      expect(FileService.validateFile(imageFile)).toBeNull();
      expect(FileService.validateFile(pdfFile)).toBeNull();
      expect(FileService.validateFile(textFile)).toBeNull();
    });

    it('should reject disallowed file types', () => {
      const execFile = new File(['content'], 'virus.exe', {
        type: 'application/x-msdownload',
      });

      const result = FileService.validateFile(execFile);

      expect(result).toContain('File type not allowed');
    });

    it('should validate file by extension when type is not set', () => {
      const file = new File(['content'], 'document.pdf', {
        type: '',
      });

      const result = FileService.validateFile(file);

      expect(result).toBeNull();
    });

    it('should use custom validation parameters', () => {
      const file = new File(['content'], 'test.txt');
      Object.defineProperty(file, 'size', {
        value: 2 * 1024 * 1024, // 2MB
        writable: false,
      });

      const result = FileService.validateFile(
        file,
        1 * 1024 * 1024, // 1MB limit
        ['.jpg', '.png'] // Only images allowed
      );

      expect(result).toBe('File size exceeds 1MB limit');
    });

    it('should handle files without extension', () => {
      const file = new File(['content'], 'noextension', {
        type: 'application/octet-stream',
      });

      const result = FileService.validateFile(file);

      expect(result).toContain('File type not allowed');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(FileService.formatFileSize(0)).toBe('0 B');
      expect(FileService.formatFileSize(512)).toBe('512 B');
      expect(FileService.formatFileSize(1024)).toBe('1 KB');
      expect(FileService.formatFileSize(1536)).toBe('1.5 KB'); // 1.5 * 1024
      expect(FileService.formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(FileService.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(FileService.formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1024 GB'); // Max unit
    });

    it('should handle decimal precision', () => {
      expect(FileService.formatFileSize(1536)).toBe('1.5 KB');
      expect(FileService.formatFileSize(1843)).toBe('1.8 KB'); // 1843 / 1024 = 1.7998...
      expect(FileService.formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });
  });

  describe('getFileType', () => {
    it('should identify image files by content type', () => {
      expect(FileService.getFileType('image.png', 'image/png')).toBe('image');
      expect(FileService.getFileType('photo.jpg', 'image/jpeg')).toBe('image');
      expect(FileService.getFileType('graphic.svg', 'image/svg+xml')).toBe('image');
    });

    it('should identify image files by extension', () => {
      expect(FileService.getFileType('image.png')).toBe('image');
      expect(FileService.getFileType('photo.jpg')).toBe('image');
      expect(FileService.getFileType('photo.jpeg')).toBe('image');
      expect(FileService.getFileType('animation.gif')).toBe('image');
      expect(FileService.getFileType('graphic.svg')).toBe('image');
    });

    it('should identify PDF files', () => {
      expect(FileService.getFileType('document.pdf', 'application/pdf')).toBe('pdf');
      expect(FileService.getFileType('document.pdf')).toBe('pdf');
    });

    it('should identify text files by content type', () => {
      expect(FileService.getFileType('file.txt', 'text/plain')).toBe('text');
      expect(FileService.getFileType('code.js', 'text/javascript')).toBe('text');
    });

    it('should identify text files by extension', () => {
      expect(FileService.getFileType('file.txt')).toBe('text');
      expect(FileService.getFileType('readme.md')).toBe('text');
    });

    it('should return other for unknown file types', () => {
      expect(FileService.getFileType('archive.zip')).toBe('other');
      expect(FileService.getFileType('program.exe')).toBe('other');
      expect(FileService.getFileType('unknown.xyz')).toBe('other');
    });

    it('should handle files without extension', () => {
      expect(FileService.getFileType('Dockerfile')).toBe('other');
      expect(FileService.getFileType('README')).toBe('other');
    });

    it('should be case insensitive for extensions', () => {
      expect(FileService.getFileType('IMAGE.PNG')).toBe('image');
      expect(FileService.getFileType('DOCUMENT.PDF')).toBe('pdf');
      expect(FileService.getFileType('TEXT.TXT')).toBe('text');
    });
  });

  describe('edge cases', () => {
    it('should handle empty filename gracefully', () => {
      expect(FileService.getFileType('')).toBe('other');
    });

    it('should handle filename with multiple dots', () => {
      expect(FileService.getFileType('file.backup.txt')).toBe('text');
      expect(FileService.getFileType('image.final.version.png')).toBe('image');
    });

    it('should handle very large file sizes in formatting', () => {
      const largeSize = Number.MAX_SAFE_INTEGER;
      const result = FileService.formatFileSize(largeSize);
      expect(result).toContain('GB');
      expect(result).not.toBe('NaN GB');
    });

    it('should handle zero file size', () => {
      const file = new File([], 'empty.txt');
      expect(FileService.validateFile(file)).toBeNull();
      expect(FileService.formatFileSize(0)).toBe('0 B');
    });
  });
});
