import type { Conversation, Message, ConversationWithMessages, User } from '../../types';

export const mockUser: User = {
  id: 'test-user-id',
  email: 'test@example.com',
  username: 'testuser',
  created_at: '2025-09-17T10:00:00Z',
  last_login: '2025-09-17T10:00:00Z',
};

export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    user_id: 'test-user-id',
    title: 'Test Conversation',
    model: 'claude-code-opus',
    created_at: '2025-09-17T10:00:00Z',
    updated_at: '2025-09-17T10:30:00Z',
    metadata: {}
  },
  {
    id: 'conv-2',
    user_id: 'test-user-id',
    title: 'Another Conversation',
    model: 'claude-code-opus',
    created_at: '2025-09-17T09:00:00Z',
    updated_at: '2025-09-17T09:30:00Z',
    metadata: {}
  }
];

export const mockMessages: Message[] = [
  {
    id: 'msg-1',
    conversation_id: 'conv-1',
    role: 'user',
    content: 'Hello, how are you?',
    created_at: '2025-09-17T10:00:00Z',
    is_active: true,
    metadata: {}
  },
  {
    id: 'msg-2',
    conversation_id: 'conv-1',
    role: 'assistant',
    content: 'Hi there! I\'m doing well, thank you for asking. How can I help you today?',
    created_at: '2025-09-17T10:01:00Z',
    is_active: true,
    metadata: {}
  },
  {
    id: 'msg-3',
    conversation_id: 'conv-2',
    role: 'user',
    content: 'What\'s the weather like?',
    created_at: '2025-09-17T09:00:00Z',
    is_active: true,
    metadata: {}
  },
  {
    id: 'msg-4',
    conversation_id: 'conv-2',
    role: 'assistant',
    content: 'I don\'t have access to current weather data, but I can help you find weather information if you\'d like.',
    created_at: '2025-09-17T09:01:00Z',
    is_active: true,
    metadata: {}
  }
];

export const mockConversationWithMessages: ConversationWithMessages = {
  conversation: mockConversations[0],
  messages: mockMessages.filter(m => m.conversation_id === 'conv-1')
};
