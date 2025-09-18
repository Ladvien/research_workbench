-- Performance optimization indexes
-- Add these indexes to improve query performance

-- Composite index for conversation lookup with ownership check
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_id_user_id 
    ON conversations(id, user_id);

-- Index for message loading by conversation with active filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_active_created 
    ON messages(conversation_id, is_active, created_at) 
    WHERE is_active = true;

-- Index for user message queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_user_role_created 
    ON messages(conversation_id, role, created_at) 
    WHERE is_active = true;

-- Partial index for active messages only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_active_only 
    ON messages(conversation_id, created_at) 
    WHERE is_active = true;

-- Index for conversation updated_at ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_user_updated 
    ON conversations(user_id, updated_at DESC);

-- Index for provider-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_provider_model 
    ON conversations(provider, model);

-- Performance monitoring indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_usage_created_model 
    ON api_usage(created_at, model) 
    WHERE created_at > NOW() - INTERVAL '24 hours';

-- Session management indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_expires_active 
    ON sessions(expires_at) 
    WHERE expires_at > NOW();

-- Refresh token cleanup index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_expires_cleanup 
    ON refresh_tokens(expires_at) 
    WHERE expires_at < NOW();

-- Statistics for query planner
ANALYZE conversations;
ANALYZE messages;
ANALYZE users;
ANALYZE sessions;
ANALYZE refresh_tokens;