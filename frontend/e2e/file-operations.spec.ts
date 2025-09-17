import { test, expect, devices } from '@playwright/test';
import { AuthPage } from './page-objects/AuthPage';
import { ChatPage } from './page-objects/ChatPage';
import { FileAttachmentPage } from './page-objects/FileAttachmentPage';
import path from 'path';

test.describe('File Operations', () => {
  let authPage: AuthPage;
  let chatPage: ChatPage;
  let filePage: FileAttachmentPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    chatPage = new ChatPage(page);
    filePage = new FileAttachmentPage(page);
    
    // Login and start a conversation
    await authPage.goto();
    await authPage.login('test@workbench.com', 'testpassword123');
    await chatPage.sendMessage('Hello, I want to test file attachments');
  });

  test.describe('File Upload', () => {
    test('should display file upload area', async () => {
      await filePage.expectUploadArea();
      
      await expect(filePage.uploadArea).toContainText(/drop files|upload/i);
      await expect(filePage.fileInput).toBeAttached();
    });

    test('should upload a text file successfully', async () => {
      // Create a test file
      const testFilePath = path.join(__dirname, '../fixtures/test.txt');
      
      // Ensure test file exists
      await test.step('Create test file', async () => {
        await filePage.page.evaluate(() => {
          const content = 'This is a test file for upload testing.';
          const blob = new Blob([content], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          
          // Download the blob as a file for testing
          const a = document.createElement('a');
          a.href = url;
          a.download = 'test.txt';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      });
      
      await filePage.uploadFile(testFilePath);
      await filePage.expectFileUploaded('test.txt');
    });

    test('should upload an image file successfully', async () => {
      // Create a test image file
      await test.step('Create test image', async () => {
        await filePage.page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 100;
          canvas.height = 100;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = 'red';
            ctx.fillRect(0, 0, 100, 100);
          }
          
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'test-image.png';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }
          }, 'image/png');
        });
      });
      
      const imagePath = path.join(__dirname, '../fixtures/test-image.png');
      await filePage.uploadFile(imagePath);
      await filePage.expectFileUploaded('test-image.png');
    });

    test('should handle drag and drop upload', async () => {
      const testContent = 'Drag and drop test content';
      
      await filePage.page.evaluate((content) => {
        const file = new File([content], 'drag-drop-test.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const dragDropArea = document.querySelector('.border-dashed');
        if (dragDropArea) {
          const dragEvent = new DragEvent('drop', {
            dataTransfer,
            bubbles: true,
            cancelable: true
          });
          
          dragDropArea.dispatchEvent(dragEvent);
        }
      }, testContent);
      
      await filePage.waitForUploadComplete();
      await filePage.expectFileUploaded('drag-drop-test.txt');
    });

    test('should handle multiple file uploads', async () => {
      const files = ['file1.txt', 'file2.txt', 'file3.txt'];
      
      for (const fileName of files) {
        await filePage.page.evaluate((name) => {
          const content = `Content of ${name}`;
          const file = new File([content], name, { type: 'text/plain' });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          
          const input = document.querySelector('input[type="file"]') as HTMLInputElement;
          if (input) {
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, fileName);
        
        await filePage.waitForUploadComplete();
      }
      
      await filePage.expectFileCount(3);
    });

    test('should show upload progress', async () => {
      // Create larger file to see progress
      await filePage.page.evaluate(() => {
        const largeContent = 'A'.repeat(100000); // 100KB file
        const file = new File([largeContent], 'large-file.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      // Should show progress indicator
      await expect(filePage.loadingSpinner).toBeVisible();
      await filePage.waitForUploadComplete();
      await expect(filePage.loadingSpinner).not.toBeVisible();
    });
  });

  test.describe('File Validation', () => {
    test('should reject files that are too large', async () => {
      await filePage.expectFileSizeValidation();
    });

    test('should reject invalid file types', async () => {
      await filePage.expectFileTypeValidation();
    });

    test('should validate file extension', async () => {
      await filePage.page.evaluate(() => {
        const file = new File(['content'], 'malicious.exe', { type: 'application/octet-stream' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      await filePage.expectUploadError(/file type not allowed/i);
    });

    test('should validate file content matches extension', async () => {
      // Try to upload a text file with .jpg extension
      await filePage.page.evaluate(() => {
        const file = new File(['text content'], 'fake-image.jpg', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      // Should either reject or handle gracefully
      await Promise.race([
        filePage.expectUploadError(),
        filePage.expectFileUploaded('fake-image.jpg')
      ]);
    });

    test('should handle empty files', async () => {
      await filePage.page.evaluate(() => {
        const file = new File([''], 'empty.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      // Should handle empty files appropriately
      await Promise.race([
        filePage.expectUploadError(/empty file/i),
        filePage.expectFileUploaded('empty.txt')
      ]);
    });
  });

  test.describe('File Management', () => {
    test.beforeEach(async () => {
      // Upload a test file for management tests
      await filePage.page.evaluate(() => {
        const content = 'Test file for management operations';
        const file = new File([content], 'management-test.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      await filePage.waitForUploadComplete();
    });

    test('should display uploaded file in list', async () => {
      await filePage.expectFileUploaded('management-test.txt');
      await filePage.expectFileSize('management-test.txt', /\d+\s*(B|KB|MB)/);
    });

    test('should download uploaded file', async () => {
      const download = await filePage.downloadFile('management-test.txt');
      
      expect(download.suggestedFilename()).toBe('management-test.txt');
      
      // Verify file content
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
    });

    test('should delete uploaded file', async () => {
      await filePage.deleteFile('management-test.txt');
      await filePage.expectFileNotUploaded('management-test.txt');
    });

    test('should preview text file', async () => {
      await filePage.previewFile('management-test.txt');
      
      await expect(filePage.previewModal).toBeVisible();
      await expect(filePage.previewText).toContainText('Test file for management operations');
      
      await filePage.closePreview();
    });

    test('should preview image file', async () => {
      // Upload an image first
      await filePage.page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 50;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'blue';
          ctx.fillRect(0, 0, 50, 50);
        }
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'preview-image.png', { type: 'image/png' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            
            const input = document.querySelector('input[type="file"]') as HTMLInputElement;
            if (input) {
              input.files = dataTransfer.files;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, 'image/png');
      });
      
      await filePage.waitForUploadComplete();
      await filePage.previewFile('preview-image.png');
      
      await expect(filePage.previewModal).toBeVisible();
      await expect(filePage.previewImage).toBeVisible();
      
      await filePage.closePreview();
    });

    test('should show file metadata', async () => {
      const fileItem = filePage.attachmentItems.filter({ hasText: 'management-test.txt' });
      
      // Should show file size
      await expect(fileItem).toContainText(/\d+\s*(B|KB|MB)/);
      
      // Should show upload date
      await expect(fileItem).toContainText(/\d{1,2}\/\d{1,2}\/\d{4}/);
      
      // Should show file type icon
      const icon = fileItem.locator('svg').first();
      await expect(icon).toBeVisible();
    });
  });

  test.describe('File Integration with Chat', () => {
    test('should attach file to message', async () => {
      // Upload file
      await filePage.page.evaluate(() => {
        const content = 'File content for chat integration';
        const file = new File([content], 'chat-attachment.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      await filePage.waitForUploadComplete();
      
      // Send message referencing the file
      await chatPage.sendMessage('Please analyze the attached file');
      
      // Should show file attachment in message
      const lastMessage = chatPage.messages.last();
      await expect(lastMessage).toContainText('chat-attachment.txt');
    });

    test('should handle file references in conversation', async () => {
      // Upload multiple files
      const files = ['document1.txt', 'image1.png', 'data.csv'];
      
      for (const fileName of files) {
        await filePage.page.evaluate((name) => {
          const content = `Content of ${name}`;
          const type = name.endsWith('.png') ? 'image/png' : 
                      name.endsWith('.csv') ? 'text/csv' : 'text/plain';
          const file = new File([content], name, { type });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          
          const input = document.querySelector('input[type="file"]') as HTMLInputElement;
          if (input) {
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, fileName);
        
        await filePage.waitForUploadComplete();
      }
      
      // Ask about all files
      await chatPage.sendMessage('What files do I have attached?');
      
      // Response should reference the files
      const response = chatPage.messages.last();
      await expect(response).toContainText(/document1|image1|data/);
    });

    test('should maintain file context across messages', async () => {
      // Upload file and reference it
      await filePage.page.evaluate(() => {
        const content = 'Important document content for context testing';
        const file = new File([content], 'context-file.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      await filePage.waitForUploadComplete();
      
      await chatPage.sendMessage('Analyze the content of context-file.txt');
      await chatPage.sendMessage('Based on that file, what recommendations do you have?');
      
      // Second message should maintain context of the file
      const lastResponse = chatPage.messages.last();
      await expect(lastResponse).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle upload failures gracefully', async () => {
      // Simulate upload failure
      await filePage.page.route('**/api/upload/**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Upload failed' })
        });
      });
      
      await filePage.page.evaluate(() => {
        const content = 'Content that will fail to upload';
        const file = new File([content], 'fail-upload.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      await filePage.expectUploadError(/upload failed|server error/i);
      
      // Should allow retry
      await filePage.page.unroute('**/api/upload/**');
      await filePage.retryFailedUpload('retry-file.txt');
    });

    test('should handle network interruption during upload', async () => {
      let uploadStarted = false;
      
      await filePage.page.route('**/api/upload/**', route => {
        if (!uploadStarted) {
          uploadStarted = true;
          route.abort('failed');
        } else {
          route.continue();
        }
      });
      
      await filePage.page.evaluate(() => {
        const content = 'Content for network interruption test';
        const file = new File([content], 'network-test.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      await filePage.expectUploadError(/network|failed/i);
    });

    test('should handle virus scan failures', async () => {
      await filePage.page.route('**/api/upload/**', route => {
        route.fulfill({
          status: 400,
          body: JSON.stringify({ error: 'Virus detected' })
        });
      });
      
      await filePage.page.evaluate(() => {
        const content = 'Simulated malicious content';
        const file = new File([content], 'malicious.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      await filePage.expectUploadError(/virus|malicious|security/i);
    });
  });

  test.describe('Accessibility', () => {
    test('should support keyboard navigation', async () => {
      await filePage.navigateWithKeyboard();
    });

    test('should have proper ARIA labels', async () => {
      await filePage.expectAriaLabels();
    });

    test('should announce upload status to screen readers', async () => {
      await filePage.page.evaluate(() => {
        const content = 'Accessibility test content';
        const file = new File([content], 'accessibility.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      // Should have aria-live regions for status updates
      const liveRegion = filePage.page.locator('[aria-live="polite"]');
      await expect(liveRegion).toBeAttached();
    });
  });

  test.describe('Mobile Experience', () => {
    test('should work correctly on mobile', async ({ page, browser }) => {
      const context = await browser.newContext(devices['iPhone 12']);
      page = await context.newPage();
      await filePage.expectMobileLayout();
      
      // Mobile file picker should work
      await filePage.uploadArea.click();
      
      // Should trigger mobile file picker
      await expect(filePage.fileInput).toBeAttached();
    });

    test('should handle mobile camera capture', async () => {
      // On mobile, file input might offer camera option
      await expect(filePage.fileInput).toHaveAttribute('accept');
    });
  });

  test.describe('Performance', () => {
    test('should handle multiple simultaneous uploads', async () => {
      const files = Array.from({ length: 5 }, (_, i) => `concurrent-${i}.txt`);
      
      // Start multiple uploads simultaneously
      await Promise.all(files.map(fileName => 
        filePage.page.evaluate((name) => {
          const content = `Content of ${name}`;
          const file = new File([content], name, { type: 'text/plain' });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          
          const input = document.querySelector('input[type="file"]') as HTMLInputElement;
          if (input) {
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, fileName)
      ));
      
      // All files should eventually be uploaded
      await filePage.expectFileCount(5);
    });

    test('should handle large file uploads efficiently', async () => {
      // Create a larger file (within limits)
      await filePage.page.evaluate(() => {
        const largeContent = 'Large file content\n'.repeat(50000); // ~1MB
        const file = new File([largeContent], 'large-file.txt', { type: 'text/plain' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) {
          input.files = dataTransfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      const startTime = Date.now();
      await filePage.waitForUploadComplete();
      const uploadTime = Date.now() - startTime;
      
      // Should complete within reasonable time
      expect(uploadTime).toBeLessThan(30000); // 30 seconds max
    });
  });
});
