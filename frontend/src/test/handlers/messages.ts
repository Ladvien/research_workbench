import { http, HttpResponse } from 'msw';
import type { Message } from '../../types';
import { mockMessages } from '../fixtures/conversations';

export const messageHandlers = [
  // POST /api/v1/conversations/:id/messages
  http.post('/api/v1/conversations/:id/messages', async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as { content: string };
    
    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      conversation_id: id as string,
      role: 'user',
      content: body.content,
      created_at: new Date().toISOString(),
      is_active: true,
      metadata: {}
    };

    return HttpResponse.json({
      data: { messageId: newMessage.id },
      status: 200
    });
  }),

  // POST /api/v1/conversations/:id/stream
  http.post('/api/v1/conversations/:id/stream', async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as { content: string };
    
    // For testing, return a simple response
    // In reality, this would be a streaming response
    return new Response('data: {"token": "Hello"} \n\ndata: {"token": " world"} \n\ndata: {"done": true} \n\n', {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }),

  // PUT /api/v1/messages/:id
  http.put('/api/v1/messages/:id', async ({ params, request }) => {
    const { id } = params;
    const body = await request.json() as { content: string };
    
    const message = mockMessages.find(m => m.id === id);
    if (!message) {
      return HttpResponse.json({
        error: 'Message not found',
        status: 404
      }, { status: 404 });
    }

    return HttpResponse.json({
      data: { ...message, content: body.content, updated_at: new Date().toISOString() },
      status: 200
    });
  }),

  // DELETE /api/v1/messages/:id
  http.delete('/api/v1/messages/:id', ({ params }) => {
    const { id } = params;
    const message = mockMessages.find(m => m.id === id);
    
    if (!message) {
      return HttpResponse.json({
        error: 'Message not found',
        status: 404
      }, { status: 404 });
    }

    return HttpResponse.json({
      data: { message: 'Message deleted successfully' },
      status: 200
    });
  }),
];
