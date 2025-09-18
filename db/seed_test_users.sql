-- Test user seed data
-- Password for all test users: testpassword123
-- This hash is generated using Argon2id with the backend's salt

-- Insert test users
-- Note: These password hashes are for 'testpassword123' - generate new ones for production
INSERT INTO users (id, email, password_hash) VALUES
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'test@workbench.com', '$argon2id$v=19$m=19456,t=2,p=1$cnVzdHlfc2FsdF9mb3JfYXJnb24$placeholder_hash_1'),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'admin@workbench.com', '$argon2id$v=19$m=19456,t=2,p=1$cnVzdHlfc2FsdF9mb3JfYXJnb24$placeholder_hash_2'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'cthomasbrittain@yahoo.com', '$argon2id$v=19$m=19456,t=2,p=1$cnVzdHlfc2FsdF9mb3JfYXJnb24$placeholder_hash_3')
ON CONFLICT (email) DO NOTHING;

-- Create sample conversations for test user
INSERT INTO conversations (id, user_id, title) VALUES
    ('d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Test Conversation 1'),
    ('e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Test Conversation 2')
ON CONFLICT (id) DO NOTHING;

-- Create sample messages
INSERT INTO messages (id, conversation_id, user_id, role, content) VALUES
    ('f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'user', 'Hello, this is a test message'),
    ('f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a17', 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'assistant', 'Hello! This is a test response')
ON CONFLICT (id) DO NOTHING;