import { Message } from './index';

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

// Branching-related types
export interface BranchOption {
  id: string;
  preview: string;
  isActive: boolean;
}

export interface BranchInfo {
  parentId: string;
  branchCount: number;
  branches: BranchOption[];
}

export interface ConversationTreeResponse {
  messages: Message[];
  branches: BranchInfo[];
  activeThread: string[];
}

export interface EditMessageRequest {
  content: string;
}

export interface EditMessageResponse {
  message: Message;
  affectedMessages: string[];
}

export interface SwitchBranchRequest {
  targetMessageId: string;
}

export interface SwitchBranchResponse {
  activeMessages: Message[];
  success: boolean;
}