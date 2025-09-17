import type { Message } from '../../types/chat';

export const createMockMessage = (overrides?: Partial<Message>): Message => ({
  id: 'test-msg-id',
  conversation_id: 'test-conv-id',
  role: 'user',
  content: 'Test message content',
  created_at: new Date().toISOString(),
  is_active: true,
  metadata: {},
  timestamp: new Date(),
  ...overrides,
});

export const createMockAssistantMessage = (content: string = 'Assistant response'): Message => 
  createMockMessage({
    role: 'assistant',
    content,
  });

export const createMockSystemMessage = (content: string = 'System message'): Message => 
  createMockMessage({
    role: 'system',
    content,
  });

export const createMockUserMessage = (content: string = 'User message'): Message => 
  createMockMessage({
    role: 'user',
    content,
  });
