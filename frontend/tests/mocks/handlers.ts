// MSW API handlers for mocking backend responses
import { http, HttpResponse } from 'msw';
import type {
  Conversation,
  Message,
  ConversationWithMessages,
  CreateConversationRequest,
  SearchResponse,
  AuthResponse,
  User
} from '../../src/types';

// Mock data
const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z'
};

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    user_id: 'user-123',
    title: 'Test Conversation 1',
    model: 'claude-code-opus',
    provider: 'anthropic',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    metadata: {}
  },
  {
    id: 'conv-2',
    user_id: 'user-123',
    title: 'Test Conversation 2',
    model: 'gpt-4',
    provider: 'open_a_i',
    created_at: '2024-01-01T11:00:00Z',
    updated_at: '2024-01-01T11:00:00Z',
    metadata: {}
  }
];

const mockMessages: Message[] = [
  {
    id: 'msg-1',
    conversation_id: 'conv-1',
    role: 'user',
    content: 'Hello, how are you?',
    created_at: '2024-01-01T10:01:00Z',
    is_active: true,
    metadata: {}
  },
  {
    id: 'msg-2',
    conversation_id: 'conv-1',
    role: 'assistant',
    content: 'I am doing well, thank you! How can I help you today?',
    created_at: '2024-01-01T10:02:00Z',
    is_active: true,
    metadata: {}
  },
  {
    id: 'msg-3',
    conversation_id: 'conv-1',
    role: 'system',
    content: 'Welcome to the chat!',
    created_at: '2024-01-01T10:00:30Z',
    is_active: true,
    metadata: {}
  }
];

// Streaming simulation utility
export const createStreamingResponse = (content: string, delay: number = 50) => {
  const chunks = content.split(' ');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let index = 0;

      const sendChunk = () => {
        if (index < chunks.length) {
          const chunk = index === 0 ? chunks[index] : ' ' + chunks[index];
          const data = `data: ${JSON.stringify({ content: chunk, done: false })}\n\n`;
          controller.enqueue(encoder.encode(data));
          index++;
          setTimeout(sendChunk, delay);
        } else {
          const finalData = `data: ${JSON.stringify({ content: '', done: true })}\n\n`;
          controller.enqueue(encoder.encode(finalData));
          controller.close();
        }
      };

      sendChunk();
    }
  });

  return new HttpResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};

export const handlers = [
  // Auth handlers
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };

    if (body.email === 'test@example.com' && body.password === 'password123') {
      return HttpResponse.json({
        user: mockUser,
        tokens: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresAt: Date.now() + 3600000
        }
      } as AuthResponse);
    }

    return HttpResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  }),

  http.post('/api/auth/register', async ({ request }) => {
    const body = await request.json() as { email: string; username: string; password: string };

    if (body.email === 'existing@example.com') {
      return HttpResponse.json(
        { error: 'Email already exists' },
        { status: 409 }
      );
    }

    return HttpResponse.json({
      user: { ...mockUser, email: body.email, username: body.username },
      tokens: {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000
      }
    } as AuthResponse);
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true });
  }),

  // Conversation handlers
  http.get('/api/conversations', () => {
    return HttpResponse.json({ data: mockConversations });
  }),

  http.get('/api/conversations/:id', ({ params }) => {
    const { id } = params;
    const conversation = mockConversations.find(c => c.id === id);

    if (!conversation) {
      return HttpResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const messages = mockMessages.filter(m => m.conversation_id === id);

    return HttpResponse.json({
      data: { conversation, messages } as ConversationWithMessages
    });
  }),

  http.post('/api/conversations', async ({ request }) => {
    const body = await request.json() as CreateConversationRequest;

    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      user_id: 'user-123',
      title: body.title || 'New Conversation',
      model: body.model,
      provider: body.provider || 'anthropic',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: body.metadata || {}
    };

    return HttpResponse.json({ data: newConversation }, { status: 201 });
  }),

  http.put('/api/conversations/:id/title', async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as { title: string };

    const conversation = mockConversations.find(c => c.id === id);
    if (!conversation) {
      return HttpResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      data: { ...conversation, title: body.title, updated_at: new Date().toISOString() }
    });
  }),

  http.delete('/api/conversations/:id', ({ params }) => {
    const { id } = params;
    const conversation = mockConversations.find(c => c.id === id);

    if (!conversation) {
      return HttpResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({ success: true });
  }),

  // Message handlers
  http.post('/api/conversations/:id/messages', async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as { content: string };

    const conversation = mockConversations.find(c => c.id === id);
    if (!conversation) {
      return HttpResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      conversation_id: id as string,
      role: 'assistant',
      content: `Response to: ${body.content}`,
      created_at: new Date().toISOString(),
      is_active: true,
      metadata: {}
    };

    return HttpResponse.json({ data: newMessage }, { status: 201 });
  }),

  // Streaming handler
  http.post('/api/conversations/:id/stream', async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as { content: string };

    const conversation = mockConversations.find(c => c.id === id);
    if (!conversation) {
      return HttpResponse.json(
        { error: 'CONVERSATION_NOT_FOUND' },
        { status: 404 }
      );
    }

    const responseContent = `This is a streaming response to: ${body.content}. The response includes **markdown** formatting and \`code blocks\`.`;
    return createStreamingResponse(responseContent);
  }),

  // Search handlers
  http.get('/api/search', ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';

    if (!query.trim()) {
      return HttpResponse.json({
        query,
        results: [],
        total_found: 0
      } as SearchResponse);
    }

    const results = [
      {
        message_id: 'msg-1',
        content: 'Hello, how are you?',
        role: 'user' as const,
        created_at: '2024-01-01T10:01:00Z',
        conversation_id: 'conv-1',
        conversation_title: 'Test Conversation 1',
        similarity: 0.9,
        preview: 'Hello, how are you?'
      }
    ];

    return HttpResponse.json({
      query,
      results,
      total_found: results.length
    } as SearchResponse);
  }),

  // File upload handlers
  http.post('/api/files/upload', async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return HttpResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      data: {
        id: `file-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type,
        url: `/api/files/file-${Date.now()}`,
        created_at: new Date().toISOString()
      }
    });
  }),

  // Analytics handlers
  http.get('/api/analytics/conversations', () => {
    return HttpResponse.json({
      data: {
        total_conversations: 25,
        conversations_this_week: 5,
        total_messages: 150,
        messages_this_week: 20,
        avg_messages_per_conversation: 6,
        most_active_day: 'Monday'
      }
    });
  }),

  // Error simulation handlers
  http.get('/api/error-test/500', () => {
    return HttpResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }),

  http.get('/api/error-test/network', () => {
    // Simulate network error by not responding
    return HttpResponse.error();
  }),

  // Rate limiting simulation
  http.get('/api/rate-limit-test', () => {
    return HttpResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  })
];

// Error handlers for different scenarios
export const errorHandlers = {
  serverError: http.get('/api/conversations', () => {
    return HttpResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }),

  networkError: http.get('/api/conversations', () => {
    return HttpResponse.error();
  }),

  unauthorized: http.get('/api/conversations', () => {
    return HttpResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  })
};