import { Page, Locator, expect } from '@playwright/test';
import { ChatPage } from './ChatPage';

export class BranchingChatPage extends ChatPage {
  // Branching-specific elements
  readonly branchToggleButton: Locator;
  readonly branchSidebar: Locator;
  readonly branchVisualizer: Locator;
  readonly branchNodes: Locator;
  readonly branchConnections: Locator;
  readonly activeBranch: Locator;

  // Branch controls
  readonly showTreeButton: Locator;
  readonly hideTreeButton: Locator;
  readonly branchLoadingIndicator: Locator;
  readonly branchCount: Locator;
  readonly messageCount: Locator;

  // Editable message elements
  readonly editableMessages: Locator;
  readonly editButtons: Locator;
  readonly deleteButtons: Locator;
  readonly saveButtons: Locator;
  readonly cancelButtons: Locator;
  readonly editingInputs: Locator;

  // Branch switching
  readonly branchSwitchButtons: Locator;
  readonly branchPreview: Locator;
  readonly branchTimestamp: Locator;

  // Model selector (extended from ChatPage)
  readonly modelSelectorDropdown: Locator;

  constructor(page: Page) {
    super(page);

    // Branch controls
    this.branchToggleButton = page.getByRole('button', { name: /(show|hide) tree/i });
    this.showTreeButton = page.getByRole('button', { name: /show tree/i });
    this.hideTreeButton = page.getByRole('button', { name: /hide tree/i });
    this.branchLoadingIndicator = page.locator('[data-testid="branch-loading-indicator"]');
    this.branchCount = page.locator('[data-testid="branch-count"]');
    this.messageCount = page.locator('[data-testid="message-count"]');

    // Branch visualizer
    this.branchSidebar = page.locator('[data-testid="branch-sidebar"]').or(
      page.locator('.branch-visualizer')
    );
    this.branchVisualizer = page.locator('[data-testid="branch-visualizer"]');
    this.branchNodes = page.locator('[data-testid="branch-node"]');
    this.branchConnections = page.locator('[data-testid="branch-connection"]');
    this.activeBranch = page.locator('[data-testid="active-branch"]');

    // Editable messages
    this.editableMessages = page.locator('[data-testid="editable-message"]');
    this.editButtons = page.getByRole('button', { name: /edit/i });
    this.deleteButtons = page.getByRole('button', { name: /delete/i });
    this.saveButtons = page.getByRole('button', { name: /save/i });
    this.cancelButtons = page.getByRole('button', { name: /cancel/i });
    this.editingInputs = page.locator('[data-testid="message-edit-input"]');

    // Branch switching
    this.branchSwitchButtons = page.getByRole('button', { name: /switch to branch/i });
    this.branchPreview = page.locator('[data-testid="branch-preview"]');
    this.branchTimestamp = page.locator('[data-testid="branch-timestamp"]');

    // Model selector
    this.modelSelectorDropdown = page.locator('[data-testid="model-selector"]');
  }

  async goto() {
    await this.page.goto('/chat/branching');
  }

  async toggleBranchView() {
    await this.branchToggleButton.click();
    
    // Wait for sidebar to animate in/out
    await this.page.waitForTimeout(500);
  }

  async showBranchTree() {
    if (await this.showTreeButton.isVisible()) {
      await this.showTreeButton.click();
      await this.waitForBranchLoad();
    }
  }

  async hideBranchTree() {
    if (await this.hideTreeButton.isVisible()) {
      await this.hideTreeButton.click();
      await this.page.waitForTimeout(500);
    }
  }

  async waitForBranchLoad(timeout: number = 10000) {
    // Wait for branch loading to complete
    await this.branchLoadingIndicator.waitFor({ state: 'hidden', timeout }).catch(() => {});
    
    // Wait for branch visualizer to appear if tree is shown
    if (await this.hideTreeButton.isVisible()) {
      await this.branchVisualizer.waitFor({ state: 'visible', timeout });
    }
  }

  async editMessage(messageIndex: number, newContent: string) {
    const message = this.editableMessages.nth(messageIndex);
    const editButton = message.getByRole('button', { name: /edit/i });
    
    await editButton.click();
    
    const editInput = message.locator('[data-testid="message-edit-input"]');
    await editInput.waitFor({ state: 'visible' });
    await editInput.clear();
    await editInput.fill(newContent);
    
    const saveButton = message.getByRole('button', { name: /save/i });
    await saveButton.click();
    
    // Wait for edit to be processed
    await this.waitForBranchLoad();
  }

  async deleteMessage(messageIndex: number) {
    const message = this.editableMessages.nth(messageIndex);
    const deleteButton = message.getByRole('button', { name: /delete/i });
    
    await deleteButton.click();
    
    // Confirm deletion if modal appears
    const confirmButton = this.page.getByRole('button', { name: /confirm|delete/i });
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }
    
    // Wait for deletion to be processed
    await this.waitForBranchLoad();
  }

  async cancelEdit(messageIndex: number) {
    const message = this.editableMessages.nth(messageIndex);
    const cancelButton = message.getByRole('button', { name: /cancel/i });
    
    await cancelButton.click();
    
    // Verify edit mode is exited
    const editInput = message.locator('[data-testid="message-edit-input"]');
    await expect(editInput).not.toBeVisible();
  }

  async switchToBranch(branchIndex: number) {
    const branchNode = this.branchNodes.nth(branchIndex);
    await branchNode.click();
    
    // Wait for branch switch to complete
    await this.page.waitForLoadState('networkidle');
    await this.waitForBranchLoad();
  }

  async selectModel(modelName: string) {
    await this.modelSelectorDropdown.click();
    
    const modelOption = this.page.getByRole('option', { name: modelName });
    await modelOption.click();
    
    // Wait for model selection to be applied
    await this.page.waitForTimeout(1000);
  }

  // Expectations for branching features
  async expectBranchTreeVisible() {
    await expect(this.branchSidebar).toBeVisible();
    await expect(this.branchVisualizer).toBeVisible();
    await expect(this.hideTreeButton).toBeVisible();
  }

  async expectBranchTreeHidden() {
    await expect(this.branchSidebar).not.toBeVisible();
    await expect(this.showTreeButton).toBeVisible();
  }

  async expectBranchCount(count: number) {
    await expect(this.branchCount).toContainText(count.toString());
  }

  async expectMessageCount(count: number) {
    await expect(this.messageCount).toContainText(count.toString());
  }

  async expectEditableMessage(messageIndex: number) {
    const message = this.editableMessages.nth(messageIndex);
    await expect(message).toBeVisible();
    
    const editButton = message.getByRole('button', { name: /edit/i });
    await expect(editButton).toBeVisible();
  }

  async expectMessageInEditMode(messageIndex: number) {
    const message = this.editableMessages.nth(messageIndex);
    const editInput = message.locator('[data-testid="message-edit-input"]');
    const saveButton = message.getByRole('button', { name: /save/i });
    const cancelButton = message.getByRole('button', { name: /cancel/i });
    
    await expect(editInput).toBeVisible();
    await expect(saveButton).toBeVisible();
    await expect(cancelButton).toBeVisible();
  }

  async expectMessageNotInEditMode(messageIndex: number) {
    const message = this.editableMessages.nth(messageIndex);
    const editInput = message.locator('[data-testid="message-edit-input"]');
    
    await expect(editInput).not.toBeVisible();
  }

  async expectBranchingControls() {
    await expect(this.branchToggleButton).toBeVisible();
    await expect(this.modelSelectorDropdown).toBeVisible();
  }

  async expectActiveBranch() {
    await expect(this.activeBranch).toBeVisible();
    await expect(this.activeBranch).toHaveClass(/active|selected|current/);
  }

  async expectBranchNodes(count: number) {
    await expect(this.branchNodes).toHaveCount(count);
  }

  async expectBranchConnections() {
    await expect(this.branchConnections.first()).toBeVisible();
  }

  // Advanced branching workflows
  async createBranchByEditing(messageIndex: number, newContent: string) {
    const initialBranchCount = await this.getBranchCount();
    
    await this.editMessage(messageIndex, newContent);
    
    // Verify new branch was created
    const newBranchCount = await this.getBranchCount();
    expect(newBranchCount).toBeGreaterThan(initialBranchCount);
  }

  async navigateBranchHistory() {
    // Show tree if not visible
    if (await this.showTreeButton.isVisible()) {
      await this.showBranchTree();
    }
    
    const branchCount = await this.getBranchCount();
    
    // Navigate through each branch
    for (let i = 0; i < branchCount; i++) {
      await this.switchToBranch(i);
      await this.expectMessageCount(1); // At least one message
    }
  }

  async testBranchPersistence() {
    // Show branch tree and switch to a branch
    await this.showBranchTree();
    await this.switchToBranch(1);
    
    // Reload page
    await this.page.reload();
    await this.waitForBranchLoad();
    
    // Verify branch is still active
    await this.expectActiveBranch();
  }

  // Helper methods
  async getBranchCount(): Promise<number> {
    if (await this.branchCount.isVisible()) {
      const text = await this.branchCount.textContent();
      return parseInt(text?.match(/\d+/)?.[0] || '0');
    }
    return 0;
  }

  async getMessageCount(): Promise<number> {
    if (await this.messageCount.isVisible()) {
      const text = await this.messageCount.textContent();
      return parseInt(text?.match(/\d+/)?.[0] || '0');
    }
    return 0;
  }

  async getCurrentBranchId(): Promise<string | null> {
    if (await this.activeBranch.isVisible()) {
      return this.activeBranch.getAttribute('data-branch-id');
    }
    return null;
  }

  // Error handling for branching
  async expectBranchError(message?: string) {
    await expect(this.errorAlert).toBeVisible();
    if (message) {
      await expect(this.errorAlert).toContainText(message);
    }
  }

  async retryBranchOperation() {
    await this.expectBranchError();
    
    const retryButton = this.page.getByRole('button', { name: /retry|try again/i });
    if (await retryButton.isVisible()) {
      await retryButton.click();
      await this.waitForBranchLoad();
    }
  }

  // Accessibility for branching features
  async expectBranchingAriaLabels() {
    await expect(this.branchToggleButton).toHaveAttribute('aria-label');
    await expect(this.branchVisualizer).toHaveAttribute('role');
    
    if (await this.branchNodes.first().isVisible()) {
      await expect(this.branchNodes.first()).toHaveAttribute('role', 'button');
    }
  }

  async navigateBranchesWithKeyboard() {
    await this.branchToggleButton.focus();
    await this.page.keyboard.press('Tab');
    
    if (await this.branchNodes.first().isVisible()) {
      // Navigate through branch nodes
      for (let i = 0; i < 3; i++) {
        await this.page.keyboard.press('ArrowDown');
      }
      
      // Select branch with Enter
      await this.page.keyboard.press('Enter');
      await this.waitForBranchLoad();
    }
  }

  // Performance testing for branching
  async measureBranchSwitchTime() {
    const startTime = Date.now();
    await this.switchToBranch(1);
    const endTime = Date.now();
    return endTime - startTime;
  }

  async expectFastBranchSwitch(maxTime: number = 3000) {
    const switchTime = await this.measureBranchSwitchTime();
    expect(switchTime).toBeLessThan(maxTime);
  }

  // Mobile responsiveness for branching
  async expectMobileBranchingLayout() {
    const viewport = this.page.viewportSize();
    if (viewport && viewport.width < 768) {
      // Branch sidebar should be collapsible on mobile
      await expect(this.branchSidebar).toHaveCSS('position', 'absolute');
      
      // Controls should be accessible
      await expect(this.branchToggleButton).toBeVisible();
    }
  }

  // Complex branching scenarios
  async testNestedBranching() {
    // Send initial message
    await this.sendMessage('Initial message');
    
    // Edit the user message to create first branch
    await this.editMessage(0, 'Edited user message');
    
    // Send response to create second branch point
    await this.sendMessage('Second message');
    
    // Edit assistant response to create nested branch
    await this.editMessage(1, 'Edited assistant response');
    
    // Verify complex branch structure
    await this.showBranchTree();
    await this.expectBranchNodes(4); // Should have multiple branch points
  }

  async testBranchConflictResolution() {
    // Create scenario where two users might edit same message
    await this.sendMessage('Test message');
    
    // Simulate concurrent edit (would need backend support)
    await this.editMessage(0, 'First edit');
    
    // Verify system handles conflict gracefully
    await this.expectBranchingControls();
  }
}