import React, { useState } from 'react';
import FileAttachment, { AttachmentFile } from './FileAttachment';
import FilePreviewModal from './FilePreviewModal';
import { FileService } from '../services/fileService';

// Mock data for demonstration
const mockAttachments: AttachmentFile[] = [
  {
    id: '1',
    messageId: 'msg-123',
    filename: 'example-document.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024 * 500, // 500KB
    downloadUrl: '#',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    messageId: 'msg-123',
    filename: 'screenshot.png',
    contentType: 'image/png',
    sizeBytes: 1024 * 256, // 256KB
    downloadUrl: '#',
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    messageId: 'msg-123',
    filename: 'notes.txt',
    contentType: 'text/plain',
    sizeBytes: 1024 * 2, // 2KB
    downloadUrl: '#',
    createdAt: new Date().toISOString(),
  },
];

const FileAttachmentDemo: React.FC = () => {
  const [attachments, setAttachments] = useState<AttachmentFile[]>(mockAttachments);
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (file: File, messageId: string) => {
    console.log('Uploading file:', file.name, 'for message:', messageId);

    setIsUploading(true);

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock successful upload
      const newAttachment: AttachmentFile = {
        id: Date.now().toString(),
        messageId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        downloadUrl: URL.createObjectURL(file), // Create temporary URL for demo
        createdAt: new Date().toISOString(),
      };

      setAttachments(prev => [...prev, newAttachment]);
      console.log('File uploaded successfully:', newAttachment);

      // In a real app, you would use:
      // const result = await FileService.uploadFile(file, messageId);
      // setAttachments(prev => [...prev, result]);

    } catch (error) {
      console.error('Upload failed:', error);
      throw error; // Re-throw to show error in UI
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    console.log('Deleting attachment:', attachmentId);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setAttachments(prev => prev.filter(att => att.id !== attachmentId));
      console.log('Attachment deleted successfully');

      // In a real app, you would use:
      // await FileService.deleteAttachment(attachmentId);
      // setAttachments(prev => prev.filter(att => att.id !== attachmentId));

    } catch (error) {
      console.error('Delete failed:', error);
      throw error;
    }
  };

  const handleDownload = (attachment: AttachmentFile) => {
    console.log('Downloading attachment:', attachment.filename);
    // In a real app, the FileAttachment component would handle this automatically
    // or you could use FileService.getDownloadUrl(attachment.id)
  };

  const handlePreview = (attachment: AttachmentFile) => {
    setPreviewAttachment(attachment);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">File Attachment Demo</h1>
        <p className="text-gray-600">
          This demonstrates the file upload and management functionality.
          You can drag and drop files or click to upload.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Message with Attachments</h2>

        <div className="space-y-4">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
            <p className="text-blue-800">
              This is an example message that could have file attachments.
              The FileAttachment component below handles both uploads and displaying existing attachments.
            </p>
          </div>

          <FileAttachment
            messageId="msg-123"
            attachments={attachments}
            onUpload={handleUpload}
            onDelete={handleDelete}
            maxFileSize={10 * 1024 * 1024} // 10MB
            allowedTypes={['image/*', '.pdf', '.txt', '.md', '.doc', '.docx']}
            disabled={isUploading}
          />
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Features Demonstrated:</h3>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            Drag and drop file upload
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            File type and size validation
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            Visual file type indicators (icons for different file types)
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            File size formatting and display
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            Upload progress indication
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            Error handling and display
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            File download functionality
          </li>
          <li className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            File deletion with confirmation
          </li>
          <li className="flex items-start">
            <span className="text-orange-500 mr-2">○</span>
            File preview modal (click on preview button to test)
          </li>
        </ul>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Integration Notes:</h4>
        <p className="text-blue-800 text-sm">
          In a real application, this would integrate with the backend API endpoints:
        </p>
        <ul className="text-blue-700 text-sm mt-2 space-y-1">
          <li>• <code className="bg-blue-100 px-2 py-1 rounded">POST /api/upload</code> - Upload files</li>
          <li>• <code className="bg-blue-100 px-2 py-1 rounded">GET /api/messages/:id/attachments</code> - Get attachments</li>
          <li>• <code className="bg-blue-100 px-2 py-1 rounded">GET /api/files/:id</code> - Download files</li>
          <li>• <code className="bg-blue-100 px-2 py-1 rounded">DELETE /api/files/:id</code> - Delete files</li>
        </ul>
      </div>

      {/* File Preview Modal */}
      <FilePreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        onDownload={handleDownload}
      />
    </div>
  );
};

export default FileAttachmentDemo;