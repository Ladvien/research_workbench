// Core types for the workbench frontend application

export interface User {
  id: string;
  email: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title?: string;
  model: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  conversation_id: string;
  parent_id?: string;
  role: MessageRole;
  content: string;
  tokens_used?: number;
  created_at: string;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

export interface CreateConversationRequest {
  title?: string;
  model: string;
  metadata?: Record<string, any>;
}

export interface CreateMessageRequest {
  conversation_id: string;
  parent_id?: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, any>;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

// Zustand store types
export interface ConversationState {
  currentConversationId: string | null;
  conversations: Conversation[];
  currentMessages: Message[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentConversation: (id: string) => void;
  loadConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  createConversation: (request: CreateConversationRequest) => Promise<string>;
  sendMessage: (content: string) => Promise<void>;
  clearError: () => void;
}