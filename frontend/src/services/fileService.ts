import { AttachmentFile } from '../components/FileAttachment';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export interface FileUploadResponse {
  id: string;
  messageId: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  uploadUrl: string;
  createdAt: string;
}

export class FileService {
  /**
   * Upload a file for a specific message
   */
  static async uploadFile(file: File, messageId: string): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('message_id', messageId);

    const response = await fetch(`${API_BASE_URL}/api/v1/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include', // Include cookies for authentication
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get attachments for a specific message
   */
  static async getMessageAttachments(messageId: string): Promise<AttachmentFile[]> {
    const response = await fetch(`${API_BASE_URL}/api/v1/messages/${messageId}/attachments`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch attachments: ${response.statusText}`);
    }

    const attachments = await response.json();

    // Transform API response to match our AttachmentFile interface
    return attachments.map((att: any) => ({
      id: att.id,
      messageId: att.message_id,
      filename: att.filename,
      contentType: att.content_type,
      sizeBytes: att.size_bytes,
      downloadUrl: att.download_url,
      createdAt: att.created_at,
    }));
  }

  /**
   * Delete an attachment
   */
  static async deleteAttachment(attachmentId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/v1/files/${attachmentId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Delete failed: ${response.statusText}`);
    }
  }

  /**
   * Get download URL for an attachment (already included in attachment data)
   */
  static getDownloadUrl(attachmentId: string): string {
    return `${API_BASE_URL}/api/v1/files/${attachmentId}`;
  }

  /**
   * Validate file before upload
   */
  static validateFile(
    file: File,
    maxSize: number = 10 * 1024 * 1024, // 10MB default
    allowedTypes: string[] = ['image/*', '.pdf', '.txt', '.md', '.doc', '.docx']
  ): string | null {
    // Check file size
    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      return `File size exceeds ${maxSizeMB}MB limit`;
    }

    // Check file type
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    const isAllowed = allowedTypes.some(type => {
      if (type.startsWith('.')) {
        return type === fileExt;
      }
      if (type.includes('*')) {
        return file.type.startsWith(type.replace('*', ''));
      }
      return file.type === type;
    });

    if (!isAllowed) {
      return `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`;
    }

    return null;
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }

  /**
   * Get file type icon based on filename and content type
   */
  static getFileType(filename: string, contentType?: string): 'image' | 'pdf' | 'text' | 'other' {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (contentType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '')) {
      return 'image';
    }

    if (ext === 'pdf' || contentType === 'application/pdf') {
      return 'pdf';
    }

    if (['txt', 'md'].includes(ext || '') || contentType?.startsWith('text/')) {
      return 'text';
    }

    return 'other';
  }
}