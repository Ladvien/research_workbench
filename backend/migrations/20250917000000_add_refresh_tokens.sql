-- Add refresh tokens table and account lockout fields
-- Based on AUTH-SEC-001 and AUTH-SEC-003 from BACKLOG.md

-- Add account lockout fields to users table
ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;

-- Create refresh tokens table
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_users_failed_attempts ON users(failed_attempts);
CREATE INDEX idx_users_locked_until ON users(locked_until);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Add trigger to clean up expired refresh tokens
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM refresh_tokens WHERE expires_at < NOW();
    RETURN NULL;
END;
$$ LANGUAGE 'plpgsql';

-- Create trigger to run cleanup daily
CREATE OR REPLACE FUNCTION trigger_cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM refresh_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE 'plpgsql';
