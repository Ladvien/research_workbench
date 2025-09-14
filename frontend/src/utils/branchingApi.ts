import type {
  EditMessageRequest,
  EditMessageResponse,
  SwitchBranchRequest,
  SwitchBranchResponse,
  ConversationTreeResponse,
  BranchOption
} from '../types/chat';

const API_BASE = '/api';

export class BranchingAPI {
  /**
   * Edit a message and create a new branch
   */
  static async editMessage(messageId: string, request: EditMessageRequest): Promise<EditMessageResponse> {
    const response = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to edit message: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Switch to a different branch in the conversation
   */
  static async switchBranch(conversationId: string, request: SwitchBranchRequest): Promise<SwitchBranchResponse> {
    const response = await fetch(`${API_BASE}/conversations/${conversationId}/switch-branch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to switch branch: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get the full conversation tree with branch information
   */
  static async getConversationTree(conversationId: string): Promise<ConversationTreeResponse> {
    const response = await fetch(`${API_BASE}/conversations/${conversationId}/tree`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get conversation tree: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get branches for a specific message
   */
  static async getMessageBranches(messageId: string): Promise<BranchOption[]> {
    const response = await fetch(`${API_BASE}/messages/${messageId}/branches`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get message branches: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a message (soft delete)
   */
  static async deleteMessage(messageId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/messages/${messageId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete message: ${response.statusText}`);
    }
  }
}