import { Page, Locator, expect } from '@playwright/test';

export class ChatPage {
  readonly page: Page;

  // Header elements
  readonly chatHeader: Locator;
  readonly chatTitle: Locator;
  readonly chatSubtitle: Locator;

  // Message elements
  readonly messagesContainer: Locator;
  readonly messages: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;
  readonly streamingMessage: Locator;
  readonly streamingContent: Locator;
  readonly streamingIndicator: Locator;
  readonly stopStreamingButton: Locator;

  // Input elements
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly attachmentButton: Locator;
  readonly modelSelector: Locator;

  // Loading elements
  readonly loadingIndicator: Locator;
  readonly thinkingIndicator: Locator;

  // Error elements
  readonly errorAlert: Locator;
  readonly clearErrorButton: Locator;

  // Welcome screen
  readonly welcomeScreen: Locator;
  readonly welcomeTitle: Locator;
  readonly welcomeMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.chatHeader = page.locator('[data-testid="chat-header"]').or(
      page.locator('.bg-white.dark\\:bg-gray-800').first()
    );
    this.chatTitle = page.getByRole('heading', { name: /workbench llm chat|start a new conversation/i });
    this.chatSubtitle = page.getByText(/chat with your ai assistant|send a message to begin/i);

    // Messages
    this.messagesContainer = page.locator('.flex-1.overflow-y-auto');
    this.messages = page.locator('[data-testid="message"]').or(
      page.locator('.bg-white.dark\\:bg-gray-800.border')
    );
    this.userMessages = this.messages.filter({ hasText: /^user$/i });
    this.assistantMessages = this.messages.filter({ hasText: /^assistant$/i });
    this.streamingMessage = page.locator('[data-testid="streaming-message"]');
    this.streamingContent = page.locator('[data-testid="streaming-content"]');
    this.streamingIndicator = page.getByText('Streaming...');
    this.stopStreamingButton = page.getByRole('button', { name: /stop generation/i });

    // Input
    this.messageInput = page.getByRole('textbox', { name: /type your message/i });
    this.sendButton = page.getByRole('button', { name: /send message/i });
    this.attachmentButton = page.getByRole('button', { name: /attach file/i });
    this.modelSelector = page.getByRole('combobox', { name: /select model/i });

    // Loading
    this.loadingIndicator = page.locator('[data-testid="loading-dots"]');
    this.thinkingIndicator = page.getByText('Thinking...');

    // Error
    this.errorAlert = page.locator('.bg-red-50').or(page.getByRole('alert'));
    this.clearErrorButton = this.errorAlert.getByRole('button');

    // Welcome
    this.welcomeScreen = page.locator('.flex.flex-col.items-center.justify-center.h-full');
    this.welcomeTitle = page.getByRole('heading', { name: /welcome to workbench/i });
    this.welcomeMessage = page.getByText(/start a conversation by typing/i);
  }

  async goto() {
    await this.page.goto('/chat');
  }

  async sendMessage(message: string, options?: { waitForResponse?: boolean; useKeyboard?: boolean }) {
    await this.messageInput.fill(message);

    if (options?.useKeyboard) {
      await this.messageInput.press('Enter');
    } else {
      await this.sendButton.click();
    }

    if (options?.waitForResponse !== false) {
      await this.waitForResponse();
    }
  }

  async sendMultilineMessage(lines: string[]) {
    const message = lines.join('\n');
    await this.messageInput.fill(message);

    // Use Shift+Enter for multiline
    for (let i = 0; i < lines.length - 1; i++) {
      await this.messageInput.press('Shift+Enter');
    }

    await this.sendButton.click();
    await this.waitForResponse();
  }

  async waitForResponse(timeout: number = 30000) {
    // Wait for any existing loading to finish
    await this.loadingIndicator.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    // Wait for streaming to start
    await this.streamingMessage.waitFor({ state: 'visible', timeout }).catch(() => {});

    // Wait for streaming to complete
    await this.streamingIndicator.waitFor({ state: 'hidden', timeout }).catch(() => {});

    // Wait for message to be persisted
    await this.page.waitForLoadState('networkidle');
  }

  async stopStreaming() {
    if (await this.stopStreamingButton.isVisible()) {
      await this.stopStreamingButton.click();
      await this.streamingIndicator.waitFor({ state: 'hidden' });
    }
  }

  async expectWelcomeScreen() {
    await expect(this.welcomeScreen).toBeVisible();
    await expect(this.welcomeTitle).toBeVisible();
    await expect(this.welcomeMessage).toBeVisible();
  }

  async expectMessageCount(count: number) {
    await expect(this.messages).toHaveCount(count);
  }

  async expectLastMessage(role: 'user' | 'assistant', content?: string) {
    const lastMessage = this.messages.last();
    await expect(lastMessage).toBeVisible();

    if (role === 'user') {
      await expect(lastMessage.getByText('User')).toBeVisible();
    } else {
      await expect(lastMessage.getByText('Assistant')).toBeVisible();
    }

    if (content) {
      await expect(lastMessage).toContainText(content);
    }
  }

  async expectStreamingMessage() {
    await expect(this.streamingMessage).toBeVisible();
    await expect(this.streamingIndicator).toBeVisible();
  }

  async expectNoStreamingMessage() {
    await expect(this.streamingMessage).not.toBeVisible();
    await expect(this.streamingIndicator).not.toBeVisible();
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

  async selectModel(model: string) {
    await this.modelSelector.selectOption(model);
  }

  async scrollToBottom() {
    await this.messagesContainer.evaluate(el => {
      el.scrollTop = el.scrollHeight;
    });
  }

  async scrollToTop() {
    await this.messagesContainer.evaluate(el => {
      el.scrollTop = 0;
    });
  }

  // Accessibility methods
  async navigateWithKeyboard() {
    await this.messageInput.focus();
    await expect(this.messageInput).toBeFocused();

    await this.page.keyboard.press('Tab');
    await expect(this.sendButton).toBeFocused();
  }

  async expectAriaLabels() {
    await expect(this.messageInput).toHaveAttribute('aria-label');
    await expect(this.sendButton).toHaveAttribute('aria-label');
  }

  async expectScreenReaderContent() {
    // Check for aria-live regions for streaming updates
    const liveRegion = this.page.locator('[aria-live="polite"]');
    await expect(liveRegion).toBeAttached();
  }

  // Message interaction methods
  async editMessage(messageIndex: number, newContent: string) {
    const message = this.messages.nth(messageIndex);
    const editButton = message.getByRole('button', { name: /edit/i });

    await editButton.click();

    const editInput = message.getByRole('textbox');
    await editInput.clear();
    await editInput.fill(newContent);

    const saveButton = message.getByRole('button', { name: /save/i });
    await saveButton.click();
  }

  async deleteMessage(messageIndex: number) {
    const message = this.messages.nth(messageIndex);
    const deleteButton = message.getByRole('button', { name: /delete/i });

    await deleteButton.click();

    // Confirm deletion
    const confirmButton = this.page.getByRole('button', { name: /confirm|delete/i });
    await confirmButton.click();
  }

  async copyMessage(messageIndex: number) {
    const message = this.messages.nth(messageIndex);
    const copyButton = message.getByRole('button', { name: /copy/i });

    await copyButton.click();

    // Verify copy success feedback
    await expect(this.page.getByText(/copied/i)).toBeVisible();
  }

  // Mobile responsiveness
  async expectMobileLayout() {
    await expect(this.chatHeader).toBeVisible();
    await expect(this.messageInput).toBeVisible();

    // Check that messages are properly stacked
    const viewport = this.page.viewportSize();
    if (viewport && viewport.width < 768) {
      await expect(this.messagesContainer).toHaveCSS('padding', /\d+px/);
    }
  }

  // Network error recovery
  async handleNetworkError() {
    await this.expectErrorMessage();

    // Try to resend the last message
    const retryButton = this.page.getByRole('button', { name: /retry|try again/i });
    if (await retryButton.isVisible()) {
      await retryButton.click();
    }
  }

  // Performance testing helpers
  async measureResponseTime() {
    const startTime = Date.now();
    await this.sendMessage('Hello', { waitForResponse: true });
    const endTime = Date.now();
    return endTime - startTime;
  }

  async expectFastResponse(maxTime: number = 5000) {
    const responseTime = await this.measureResponseTime();
    expect(responseTime).toBeLessThan(maxTime);
  }
}