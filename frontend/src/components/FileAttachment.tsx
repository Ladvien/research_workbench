import React, { useState, useCallback } from 'react';
import { Upload, X, File, Image, FileText, Download, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

export interface AttachmentFile {
  id: string;
  messageId: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  downloadUrl: string;
  createdAt: string;
}

interface FileAttachmentProps {
  messageId?: string;
  attachments?: AttachmentFile[];
  onUpload?: (file: File, messageId: string) => Promise<void>;
  onDelete?: (attachmentId: string) => Promise<void>;
  maxFileSize?: number; // in bytes
  allowedTypes?: string[];
  disabled?: boolean;
  className?: string;
}

const FileAttachment: React.FC<FileAttachmentProps> = ({
  messageId,
  attachments = [],
  onUpload,
  onDelete,
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  allowedTypes = ['image/*', '.pdf', '.txt', '.md', '.doc', '.docx'],
  disabled = false,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  };

  const getFileIcon = (filename: string, contentType?: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (contentType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '')) {
      return <Image className="w-4 h-4 text-blue-500" />;
    }

    if (ext === 'pdf' || contentType === 'application/pdf') {
      return <FileText className="w-4 h-4 text-red-500" />;
    }

    if (['txt', 'md'].includes(ext || '') || contentType?.startsWith('text/')) {
      return <FileText className="w-4 h-4 text-gray-500" />;
    }

    return <File className="w-4 h-4 text-gray-500" />;
  };

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxFileSize) {
      return `File size exceeds ${formatFileSize(maxFileSize)} limit`;
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
  };

  const handleFileSelect = useCallback(async (files: FileList) => {
    if (!onUpload || !messageId) return;

    const file = files[0]; // Only handle single file for now
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(file.name);

    try {
      await onUpload(file, messageId);
      setUploading(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(null);
    }
  }, [onUpload, messageId, validateFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled || !e.dataTransfer.files.length) return;
    handleFileSelect(e.dataTransfer.files);
  }, [disabled, handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFileSelect(e.target.files);
    }
  }, [handleFileSelect]);

  const handleDelete = useCallback(async (attachmentId: string) => {
    if (!onDelete) return;

    try {
      await onDelete(attachmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [onDelete]);

  const handleDownload = useCallback((attachment: AttachmentFile) => {
    // Create a temporary link to trigger download
    const link = document.createElement('a');
    link.href = attachment.downloadUrl;
    link.download = attachment.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  return (
    <div className={cn('space-y-3', className)}>
      {/* File Upload Area */}
      {onUpload && messageId && (
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-4 transition-colors',
            'hover:border-blue-300 hover:bg-blue-50',
            {
              'border-blue-400 bg-blue-50': isDragging,
              'border-gray-300': !isDragging && !disabled,
              'border-gray-200 bg-gray-50 cursor-not-allowed': disabled,
            }
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleFileInput}
            accept={allowedTypes.join(',')}
            disabled={disabled}
          />

          <label
            htmlFor="file-upload"
            className={cn(
              'flex flex-col items-center justify-center text-center cursor-pointer',
              { 'cursor-not-allowed': disabled }
            )}
          >
            <Upload className={cn(
              'w-8 h-8 mb-2',
              disabled ? 'text-gray-400' : 'text-gray-500'
            )} />
            <p className="text-sm font-medium text-gray-700">
              {uploading ? `Uploading ${uploading}...` : 'Drop files here or click to upload'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Max {formatFileSize(maxFileSize)} • {allowedTypes.join(', ')}
            </p>
          </label>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attachments List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Attachments</h4>
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
            >
              <div className="flex items-center space-x-3 min-w-0">
                {getFileIcon(attachment.filename, attachment.contentType)}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {attachment.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.sizeBytes)}
                    {attachment.createdAt && ` • ${new Date(attachment.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownload(attachment)}
                  className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                  title="Download file"
                >
                  <Download className="w-4 h-4" />
                </button>
                {onDelete && (
                  <button
                    onClick={() => handleDelete(attachment.id)}
                    className="p-1 text-red-600 hover:text-red-800 hover:bg-red-100 rounded"
                    title="Delete file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileAttachment;