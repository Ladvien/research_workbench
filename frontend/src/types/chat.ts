// Message interface is now in index.ts, import from there if needed

export interface ChatState {
  messages: any[]; // Will use Message from index.ts
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
  messages: any[]; // Will use Message from index.ts
  branches: BranchInfo[];
  activeThread: string[];
}

export interface EditMessageRequest {
  content: string;
}

export interface EditMessageResponse {
  message: any; // Will use Message from index.ts
  affectedMessages: string[];
}

export interface SwitchBranchRequest {
  targetMessageId: string;
}

export interface SwitchBranchResponse {
  activeMessages: any[]; // Will use Message from index.ts
  success: boolean;
}