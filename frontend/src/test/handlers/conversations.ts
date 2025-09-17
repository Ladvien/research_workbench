import { http, HttpResponse } from 'msw';
import type { Conversation, ConversationWithMessages } from '../../types';
import { mockConversations, mockMessages } from '../fixtures/conversations';

export const conversationHandlers = [
  // GET /api/v1/conversations
  http.get('/api/v1/conversations', () => {
    return HttpResponse.json({
      data: mockConversations,
      status: 200
    });
  }),

  // GET /api/v1/conversations/:id
  http.get('/api/v1/conversations/:id', ({ params }) => {
    const { id } = params;
    const conversation = mockConversations.find(c => c.id === id);
    
    if (!conversation) {
      return HttpResponse.json({
        error: 'Conversation not found',
        status: 404
      }, { status: 404 });
    }

    const conversationMessages = mockMessages.filter(m => m.conversation_id === id);
    const conversationWithMessages: ConversationWithMessages = {
      conversation,
      messages: conversationMessages
    };

    return HttpResponse.json({
      data: conversationWithMessages,
      status: 200
    });
  }),

  // POST /api/v1/conversations
  http.post('/api/v1/conversations', async ({ request }) => {
    const body = await request.json() as { title: string; model: string };
    
    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      user_id: 'test-user-id',
      title: body.title,
      model: body.model,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {}
    };

    return HttpResponse.json({
      data: newConversation,
      status: 201
    });
  }),

  // PUT /api/v1/conversations/:id/title
  http.put('/api/v1/conversations/:id/title', async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as { title: string };
    
    const conversation = mockConversations.find(c => c.id === id);
    if (!conversation) {
      return HttpResponse.json({
        error: 'Conversation not found',
        status: 404
      }, { status: 404 });
    }

    return HttpResponse.json({
      data: { ...conversation, title: body.title, updated_at: new Date().toISOString() },
      status: 200
    });
  }),

  // DELETE /api/v1/conversations/:id
  http.delete('/api/v1/conversations/:id', ({ params }) => {
    const { id } = params;
    const conversation = mockConversations.find(c => c.id === id);
    
    if (!conversation) {
      return HttpResponse.json({
        error: 'Conversation not found',
        status: 404
      }, { status: 404 });
    }

    return HttpResponse.json({
      data: { message: 'Conversation deleted successfully' },
      status: 200
    });
  }),
];
