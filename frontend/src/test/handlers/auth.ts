import { http, HttpResponse } from 'msw';
import type { User } from '../../types';

const mockUser: User = {
  id: 'test-user-id',
  email: 'test@example.com',
  username: 'testuser',
  created_at: '2025-09-17T10:00:00Z',
  last_login: '2025-09-17T10:00:00Z',
};

export const authHandlers = [
  // GET /api/v1/auth/me
  http.get('/api/v1/auth/me', () => {
    return HttpResponse.json({
      data: mockUser,
      status: 200
    });
  }),

  // POST /api/v1/auth/login
  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    
    if (body.email === 'test@example.com' && body.password === 'password') {
      return HttpResponse.json({
        data: { token: 'mock-jwt-token', user: mockUser },
        status: 200
      });
    }
    
    return HttpResponse.json({
      error: 'Invalid credentials',
      status: 401
    }, { status: 401 });
  }),

  // POST /api/v1/auth/logout
  http.post('/api/v1/auth/logout', () => {
    return HttpResponse.json({
      data: { message: 'Logged out successfully' },
      status: 200
    });
  }),

  // POST /api/v1/auth/register
  http.post('/api/v1/auth/register', async ({ request }) => {
    const body = await request.json() as { email: string; password: string; username: string };
    
    return HttpResponse.json({
      data: { user: { ...mockUser, email: body.email, username: body.username } },
      status: 201
    });
  }),
];
