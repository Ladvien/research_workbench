-- Add unique constraint and improved indexes for message embeddings
-- This migration ensures one embedding per message and optimizes search queries

-- Add unique constraint on message_id (if not already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'message_embeddings_message_id_unique'
    ) THEN
        ALTER TABLE message_embeddings
        ADD CONSTRAINT message_embeddings_message_id_unique UNIQUE (message_id);
    END IF;
END $$;

-- Improve the vector similarity index for better performance
-- Drop the old index if it exists and recreate with optimal settings
DROP INDEX IF EXISTS idx_message_embeddings_embedding;

-- Create optimized HNSW index for vector similarity search
-- HNSW is better for high-dimensional vectors than IVFFlat
CREATE INDEX idx_message_embeddings_embedding_hnsw
ON message_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add index for efficient lookup of active messages
CREATE INDEX IF NOT EXISTS idx_messages_active_created
ON messages (id, created_at)
WHERE is_active = true;

-- Add index for user-specific conversation searches
CREATE INDEX IF NOT EXISTS idx_conversations_user_created
ON conversations (user_id, created_at);

-- Performance statistics
ANALYZE message_embeddings;
ANALYZE messages;
ANALYZE conversations;