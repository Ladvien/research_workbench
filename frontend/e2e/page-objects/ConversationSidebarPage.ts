import { Page, Locator, expect } from '@playwright/test';

export class ConversationSidebarPage {
  readonly page: Page;

  // Toggle elements
  readonly sidebarToggleButton: Locator;
  readonly collapseSidebarButton: Locator;
  readonly overlay: Locator;

  // Header elements
  readonly sidebarHeader: Locator;
  readonly conversationsTitle: Locator;
  readonly newConversationButton: Locator;

  // Conversation list elements
  readonly conversationsList: Locator;
  readonly conversationItems: Locator;
  readonly activeConversation: Locator;
  readonly emptyState: Locator;
  readonly loadingSkeleton: Locator;

  // Individual conversation elements
  readonly conversationTitle: Locator;
  readonly conversationModel: Locator;
  readonly conversationDate: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;

  // Edit mode elements
  readonly editInput: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  // Delete confirmation dialog
  readonly deleteDialog: Locator;
  readonly deleteDialogTitle: Locator;
  readonly deleteDialogMessage: Locator;
  readonly confirmDeleteButton: Locator;
  readonly cancelDeleteButton: Locator;

  // Error elements
  readonly errorAlert: Locator;
  readonly clearErrorButton: Locator;

  // Loading elements
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Toggle
    this.sidebarToggleButton = page.getByRole('button', { name: /open conversations/i });
    this.collapseSidebarButton = page.getByRole('button', { name: /collapse sidebar/i });
    this.overlay = page.locator('.fixed.inset-0.bg-black.bg-opacity-50');

    // Header
    this.sidebarHeader = page.locator('.flex.items-center.justify-between.p-4');
    this.conversationsTitle = page.getByRole('heading', { name: /conversations/i });
    this.newConversationButton = page.getByRole('button', { name: /new conversation/i });

    // List
    this.conversationsList = page.locator('.flex-1.overflow-y-auto');
    this.conversationItems = page.locator('[data-testid="conversation-item"]').or(
      page.locator('.group.relative.p-3.mx-2.mb-2.rounded-lg')
    );
    this.activeConversation = this.conversationItems.filter({ hasClass: /bg-blue-100|border-blue-500/ });
    this.emptyState = page.getByText(/no conversations yet/i);
    this.loadingSkeleton = page.locator('[data-testid="conversation-skeleton"]');

    // Individual conversation
    this.conversationTitle = page.locator('h3');
    this.conversationModel = page.locator('.text-xs.text-gray-500');
    this.conversationDate = page.locator('.text-xs.text-gray-400');
    this.editButton = page.getByRole('button', { name: /rename conversation/i });
    this.deleteButton = page.getByRole('button', { name: /delete conversation/i });

    // Edit mode
    this.editInput = page.getByRole('textbox').filter({ hasClass: /w-full.px-2.py-1/ });
    this.saveButton = page.getByRole('button', { name: /save/i });
    this.cancelButton = page.getByRole('button', { name: /cancel/i });

    // Delete dialog
    this.deleteDialog = page.locator('.fixed.inset-0.bg-black.bg-opacity-50').locator('.bg-white');
    this.deleteDialogTitle = page.getByRole('heading', { name: /delete conversation/i });
    this.deleteDialogMessage = page.getByText(/are you sure you want to delete/i);
    this.confirmDeleteButton = this.deleteDialog.getByRole('button', { name: /delete/i });
    this.cancelDeleteButton = this.deleteDialog.getByRole('button', { name: /cancel/i });

    // Error
    this.errorAlert = page.locator('.bg-red-50').or(page.getByRole('alert'));
    this.clearErrorButton = this.errorAlert.getByRole('button');

    // Loading
    this.loadingSpinner = page.locator('[data-testid="conversation-item-loading"]');
  }

  async openSidebar() {
    if (await this.sidebarToggleButton.isVisible()) {
      await this.sidebarToggleButton.click();
      await expect(this.conversationsTitle).toBeVisible();
    }
  }

  async closeSidebar() {
    if (await this.collapseSidebarButton.isVisible()) {
      await this.collapseSidebarButton.click();
      await expect(this.sidebarToggleButton).toBeVisible();
    }
  }

  async closeSidebarWithOverlay() {
    if (await this.overlay.isVisible()) {
      await this.overlay.click();
      await expect(this.sidebarToggleButton).toBeVisible();
    }
  }

  async toggleSidebarWithKeyboard() {
    // Cmd+B or Ctrl+B shortcut
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.page.keyboard.press(`${modifier}+KeyB`);
  }

  async createNewConversation(title?: string) {
    await this.openSidebar();
    await this.newConversationButton.click();

    if (title) {
      // Wait for the new conversation to be created and selected
      await this.page.waitForTimeout(1000);
      await this.renameActiveConversation(title);
    }

    await this.page.waitForLoadState('networkidle');
  }

  async selectConversation(index: number) {
    const conversation = this.conversationItems.nth(index);
    await conversation.click();
    await this.page.waitForLoadState('networkidle');
  }

  async selectConversationByTitle(title: string) {
    const conversation = this.conversationItems.filter({ hasText: title });
    await conversation.click();
    await this.page.waitForLoadState('networkidle');
  }

  async renameConversation(index: number, newTitle: string) {
    const conversation = this.conversationItems.nth(index);

    // Hover to show action buttons
    await conversation.hover();
    await this.editButton.click();

    // Edit the title
    await this.editInput.clear();
    await this.editInput.fill(newTitle);
    await this.editInput.press('Enter');

    await this.page.waitForLoadState('networkidle');
  }

  async renameActiveConversation(newTitle: string) {
    await this.activeConversation.hover();
    await this.editButton.click();

    await this.editInput.clear();
    await this.editInput.fill(newTitle);
    await this.editInput.press('Enter');

    await this.page.waitForLoadState('networkidle');
  }

  async deleteConversation(index: number) {
    const conversation = this.conversationItems.nth(index);

    // Hover to show action buttons
    await conversation.hover();
    await this.deleteButton.click();

    // Confirm deletion
    await expect(this.deleteDialog).toBeVisible();
    await this.confirmDeleteButton.click();

    await this.page.waitForLoadState('networkidle');
  }

  async deleteConversationByTitle(title: string) {
    const conversation = this.conversationItems.filter({ hasText: title });

    await conversation.hover();
    await this.deleteButton.click();

    await expect(this.deleteDialog).toBeVisible();
    await this.confirmDeleteButton.click();

    await this.page.waitForLoadState('networkidle');
  }

  async cancelConversationDeletion() {
    await expect(this.deleteDialog).toBeVisible();
    await this.cancelDeleteButton.click();
    await expect(this.deleteDialog).not.toBeVisible();
  }

  async expectSidebarOpen() {
    await expect(this.conversationsTitle).toBeVisible();
    await expect(this.newConversationButton).toBeVisible();
  }

  async expectSidebarClosed() {
    await expect(this.sidebarToggleButton).toBeVisible();
    await expect(this.conversationsTitle).not.toBeVisible();
  }

  async expectConversationCount(count: number) {
    if (count === 0) {
      await expect(this.emptyState).toBeVisible();
    } else {
      await expect(this.conversationItems).toHaveCount(count);
    }
  }

  async expectActiveConversation(title?: string) {
    await expect(this.activeConversation).toBeVisible();

    if (title) {
      await expect(this.activeConversation).toContainText(title);
    }
  }

  async expectConversationTitle(index: number, title: string) {
    const conversation = this.conversationItems.nth(index);
    await expect(conversation).toContainText(title);
  }

  async expectLoadingState() {
    await expect(this.loadingSkeleton).toBeVisible();
  }

  async expectErrorMessage(message?: string) {
    await expect(this.errorAlert).toBeVisible();
    if (message) {
      await expect(this.errorAlert).toContainText(message);
    }
  }

  async clearError() {
    if (await this.clearErrorButton.isVisible()) {
      await this.clearErrorButton.click();
      await expect(this.errorAlert).not.toBeVisible();
    }
  }

  // Accessibility methods
  async navigateWithKeyboard() {
    await this.openSidebar();

    // Focus on new conversation button
    await this.newConversationButton.focus();
    await expect(this.newConversationButton).toBeFocused();

    // Navigate to first conversation
    await this.page.keyboard.press('Tab');
    if (await this.conversationItems.first().isVisible()) {
      await expect(this.conversationItems.first()).toBeFocused();
    }
  }

  async expectAriaLabels() {
    await expect(this.newConversationButton).toHaveAttribute('title');
    await expect(this.collapseSidebarButton).toHaveAttribute('title');
  }

  async expectKeyboardShortcuts() {
    // Test keyboard shortcut hint in tooltip
    await expect(this.collapseSidebarButton).toHaveAttribute('title', /⌘B|Ctrl\+B/);
  }

  // Mobile responsiveness
  async expectMobileLayout() {
    const viewport = this.page.viewportSize();
    if (viewport && viewport.width < 768) {
      // Should show overlay on mobile
      await this.openSidebar();
      await expect(this.overlay).toBeVisible();

      // Should close on overlay click
      await this.overlay.click();
      await expect(this.conversationsTitle).not.toBeVisible();
    }
  }

  // Performance testing
  async expectFastConversationSwitch() {
    const startTime = Date.now();
    await this.selectConversation(0);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(2000);
  }

  // Conversation metadata verification
  async expectConversationMetadata(index: number, model?: string, date?: string) {
    const conversation = this.conversationItems.nth(index);

    if (model) {
      await expect(conversation.locator('.text-xs').first()).toContainText(model);
    }

    if (date) {
      await expect(conversation.locator('.text-xs').last()).toContainText(date);
    }
  }

  // Batch operations
  async deleteAllConversations() {
    const count = await this.conversationItems.count();

    for (let i = count - 1; i >= 0; i--) {
      await this.deleteConversation(i);
    }

    await expect(this.emptyState).toBeVisible();
  }

  async createMultipleConversations(titles: string[]) {
    for (const title of titles) {
      await this.createNewConversation(title);
    }
  }

  // Search and filtering (if implemented)
  async searchConversations(query: string) {
    const searchInput = this.page.getByRole('textbox', { name: /search conversations/i });
    if (await searchInput.isVisible()) {
      await searchInput.fill(query);
      await this.page.waitForLoadState('networkidle');
    }
  }

  // Sorting and ordering
  async expectConversationOrder(titles: string[]) {
    for (let i = 0; i < titles.length; i++) {
      await expect(this.conversationItems.nth(i)).toContainText(titles[i]);
    }
  }
}