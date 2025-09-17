import { Page, Locator, expect } from '@playwright/test';

export class FileAttachmentPage {
  readonly page: Page;

  // Upload elements
  readonly uploadArea: Locator;
  readonly fileInput: Locator;
  readonly uploadButton: Locator;
  readonly dragDropArea: Locator;

  // File list elements
  readonly attachmentsList: Locator;
  readonly attachmentItems: Locator;
  readonly downloadButtons: Locator;
  readonly deleteButtons: Locator;

  // Status elements
  readonly uploadProgress: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly loadingSpinner: Locator;

  // File preview elements
  readonly previewModal: Locator;
  readonly previewImage: Locator;
  readonly previewText: Locator;
  readonly closePreviewButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Upload
    this.uploadArea = page.locator('[data-testid="file-upload-area"]').or(
      page.locator('.border-dashed')
    );
    this.fileInput = page.locator('input[type="file"]');
    this.uploadButton = page.getByRole('button', { name: /upload|choose file/i });
    this.dragDropArea = page.locator('.border-dashed');

    // File list
    this.attachmentsList = page.locator('[data-testid="attachments-list"]').or(
      page.locator('.space-y-2').filter({ hasText: 'Attachments' })
    );
    this.attachmentItems = page.locator('[data-testid="attachment-item"]').or(
      page.locator('.bg-gray-50.border')
    );
    this.downloadButtons = page.getByRole('button', { name: /download/i });
    this.deleteButtons = page.getByRole('button', { name: /delete|remove/i });

    // Status
    this.uploadProgress = page.locator('[data-testid="upload-progress"]');
    this.errorMessage = page.locator('.bg-red-50').or(page.getByRole('alert'));
    this.successMessage = page.locator('.bg-green-50');
    this.loadingSpinner = page.locator('[data-testid="loading-spinner"]');

    // Preview
    this.previewModal = page.locator('[data-testid="file-preview-modal"]');
    this.previewImage = page.locator('[data-testid="preview-image"]');
    this.previewText = page.locator('[data-testid="preview-text"]');
    this.closePreviewButton = page.getByRole('button', { name: /close|×/i });
  }

  async uploadFile(filePath: string, options?: { waitForUpload?: boolean }) {
    await this.fileInput.setInputFiles(filePath);

    if (options?.waitForUpload !== false) {
      await this.waitForUploadComplete();
    }
  }

  async uploadMultipleFiles(filePaths: string[]) {
    await this.fileInput.setInputFiles(filePaths);
    await this.waitForUploadComplete();
  }

  async dragAndDropFile(filePath: string) {
    // Simulate drag and drop
    const dataTransfer = await this.page.evaluateHandle(() => new DataTransfer());
    
    // Read file and create file object
    const fileContent = await this.page.evaluate(async (path) => {
      const response = await fetch(path);
      return response.arrayBuffer();
    }, filePath);

    await this.page.evaluate(([content, fileName]) => {
      const file = new File([content], fileName, { type: 'text/plain' });
      const dt = new DataTransfer();
      dt.items.add(file);
      
      const dragEvent = new DragEvent('drop', {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true
      });
      
      document.querySelector('.border-dashed')?.dispatchEvent(dragEvent);
    }, [fileContent, filePath.split('/').pop()]);

    await this.waitForUploadComplete();
  }

  async waitForUploadComplete(timeout: number = 10000) {
    // Wait for loading to disappear
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout }).catch(() => {});
    
    // Wait for either success or error
    await Promise.race([
      this.attachmentItems.first().waitFor({ state: 'visible', timeout }),
      this.errorMessage.waitFor({ state: 'visible', timeout })
    ]);
  }

  async downloadFile(fileName: string) {
    const attachmentItem = this.attachmentItems.filter({ hasText: fileName });
    const downloadButton = attachmentItem.getByRole('button', { name: /download/i });
    
    const downloadPromise = this.page.waitForEvent('download');
    await downloadButton.click();
    
    const download = await downloadPromise;
    return download;
  }

  async deleteFile(fileName: string) {
    const attachmentItem = this.attachmentItems.filter({ hasText: fileName });
    const deleteButton = attachmentItem.getByRole('button', { name: /delete/i });
    
    await deleteButton.click();
    
    // Confirm deletion if modal appears
    const confirmButton = this.page.getByRole('button', { name: /confirm|delete/i });
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }
    
    // Wait for item to be removed
    await attachmentItem.waitFor({ state: 'hidden' });
  }

  async previewFile(fileName: string) {
    const attachmentItem = this.attachmentItems.filter({ hasText: fileName });
    await attachmentItem.click();
    
    await expect(this.previewModal).toBeVisible();
  }

  async closePreview() {
    await this.closePreviewButton.click();
    await expect(this.previewModal).not.toBeVisible();
  }

  async expectUploadArea() {
    await expect(this.uploadArea).toBeVisible();
    await expect(this.uploadArea).toContainText(/drop files|upload/i);
  }

  async expectFileUploaded(fileName: string) {
    const attachmentItem = this.attachmentItems.filter({ hasText: fileName });
    await expect(attachmentItem).toBeVisible();
  }

  async expectFileNotUploaded(fileName: string) {
    const attachmentItem = this.attachmentItems.filter({ hasText: fileName });
    await expect(attachmentItem).not.toBeVisible();
  }

  async expectUploadError(message?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectFileCount(count: number) {
    await expect(this.attachmentItems).toHaveCount(count);
  }

  async expectFileSize(fileName: string, expectedSize: string) {
    const attachmentItem = this.attachmentItems.filter({ hasText: fileName });
    await expect(attachmentItem).toContainText(expectedSize);
  }

  async expectFileType(fileName: string, expectedType: string) {
    const attachmentItem = this.attachmentItems.filter({ hasText: fileName });
    const icon = attachmentItem.locator('svg').first();
    await expect(icon).toBeVisible();
  }

  // Accessibility methods
  async expectAriaLabels() {
    await expect(this.fileInput).toHaveAttribute('aria-label');
    await expect(this.uploadArea).toHaveAttribute('aria-label');
  }

  async navigateWithKeyboard() {
    await this.uploadArea.focus();
    await this.page.keyboard.press('Tab');
    
    if (await this.attachmentItems.first().isVisible()) {
      await expect(this.downloadButtons.first()).toBeFocused();
    }
  }

  // Error recovery
  async retryFailedUpload(filePath: string) {
    await this.expectUploadError();
    
    // Clear error and retry
    const dismissButton = this.errorMessage.getByRole('button');
    if (await dismissButton.isVisible()) {
      await dismissButton.click();
    }
    
    await this.uploadFile(filePath);
  }

  // File type validation
  async expectFileTypeValidation() {
    // Try uploading invalid file type
    const invalidFile = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';
    
    await this.page.evaluate((data) => {
      const file = new File([data], 'test.exe', { type: 'application/x-msdownload' });
      const dt = new DataTransfer();
      dt.items.add(file);
      
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, invalidFile);
    
    await this.expectUploadError(/file type not allowed/i);
  }

  // Size validation
  async expectFileSizeValidation() {
    // Try uploading oversized file (mock)
    await this.page.evaluate(() => {
      // Create large buffer (11MB to exceed 10MB limit)
      const largeBuffer = new ArrayBuffer(11 * 1024 * 1024);
      const file = new File([largeBuffer], 'large-file.txt', { type: 'text/plain' });
      const dt = new DataTransfer();
      dt.items.add(file);
      
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    
    await this.expectUploadError(/file size exceeds/i);
  }

  // Mobile responsive testing
  async expectMobileLayout() {
    const viewport = this.page.viewportSize();
    if (viewport && viewport.width < 768) {
      // Check that upload area is properly sized for mobile
      await expect(this.uploadArea).toHaveCSS('width', /100%|auto/);
      
      // Check that file list is properly stacked
      await expect(this.attachmentItems.first()).toHaveCSS('flex-direction', 'column');
    }
  }
}