import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, FileText, Image, File } from 'lucide-react';
import { cn } from '../lib/utils';
import { AttachmentFile } from './FileAttachment';

interface FilePreviewModalProps {
  attachment: AttachmentFile | null;
  onClose: () => void;
  onDownload?: (attachment: AttachmentFile) => void;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  attachment,
  onClose,
  onDownload,
}) => {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [attachment]);

  if (!attachment) return null;

  const isImage = attachment.contentType?.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(
      attachment.filename.split('.').pop()?.toLowerCase() || ''
    );

  const isPdf = attachment.contentType === 'application/pdf' ||
    attachment.filename.toLowerCase().endsWith('.pdf');

  const isText = attachment.contentType?.startsWith('text/') ||
    ['txt', 'md', 'json', 'csv'].includes(
      attachment.filename.split('.').pop()?.toLowerCase() || ''
    );

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

  const handleDownload = () => {
    if (onDownload) {
      onDownload(attachment);
    } else {
      // Fallback download
      const link = document.createElement('a');
      link.href = attachment.downloadUrl;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] mx-4 bg-white rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3 min-w-0">
            {isImage && !imageError ? (
              <Image className="w-5 h-5 text-blue-500 flex-shrink-0" />
            ) : isPdf ? (
              <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
            ) : (
              <File className="w-5 h-5 text-gray-500 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {attachment.filename}
              </h3>
              <p className="text-sm text-gray-500">
                {formatFileSize(attachment.sizeBytes)}
                {attachment.createdAt && ` • ${new Date(attachment.createdAt).toLocaleDateString()}`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownload}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
              title="Download file"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto max-h-[calc(90vh-4rem)]">
          {isImage && !imageError ? (
            <div className="p-4 flex items-center justify-center">
              <img
                src={attachment.downloadUrl}
                alt={attachment.filename}
                className="max-w-full max-h-full object-contain"
                onError={() => setImageError(true)}
                onLoad={() => setImageError(false)}
              />
            </div>
          ) : isPdf ? (
            <div className="w-full h-full min-h-[60vh]">
              <iframe
                src={attachment.downloadUrl}
                className="w-full h-full border-0"
                title={attachment.filename}
                onError={() => {
                  // Fallback for browsers that don't support PDF preview
                }}
              />
            </div>
          ) : isText ? (
            <div className="p-4">
              <TextFilePreview downloadUrl={attachment.downloadUrl} />
            </div>
          ) : (
            <div className="p-8 text-center">
              <File className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">
                Preview not available
              </h4>
              <p className="text-gray-600 mb-4">
                This file type cannot be previewed in the browser.
              </p>
              <button
                onClick={handleDownload}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Download to view
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Component to preview text files
const TextFilePreview: React.FC<{ downloadUrl: string }> = ({ downloadUrl }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchText = async () => {
      try {
        setLoading(true);
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error('Failed to load file content');
        }
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load content');
      } finally {
        setLoading(false);
      }
    };

    fetchText();
  }, [downloadUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono overflow-auto max-h-96">
        {content}
      </pre>
    </div>
  );
};

export default FilePreviewModal;