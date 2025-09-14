-- Add support for multiple LLM providers
-- Expand the conversations table to include provider information

-- Add provider column to conversations table
ALTER TABLE conversations
ADD COLUMN provider VARCHAR(20) DEFAULT 'openai';

-- Add temperature and max_tokens to conversation metadata for per-conversation model settings
-- These will be stored in the metadata JSONB column as:
-- { "temperature": 0.7, "max_tokens": 2048 }

-- Update existing conversations to have provider based on model
UPDATE conversations
SET provider = CASE
    WHEN model LIKE 'gpt-%' THEN 'openai'
    WHEN model LIKE 'claude-%' THEN 'anthropic'
    ELSE 'openai'
END;

-- Add provider to api_usage table for cost tracking per provider
ALTER TABLE api_usage
ADD COLUMN provider VARCHAR(20) DEFAULT 'openai';

-- Update existing api_usage records based on model
UPDATE api_usage
SET provider = CASE
    WHEN model LIKE 'gpt-%' THEN 'openai'
    WHEN model LIKE 'claude-%' THEN 'anthropic'
    ELSE 'openai'
END;

-- Create index on provider for faster queries
CREATE INDEX idx_conversations_provider ON conversations(provider);
CREATE INDEX idx_api_usage_provider ON api_usage(provider);

-- Update the model field to support longer model names (Claude models have longer names)
ALTER TABLE conversations ALTER COLUMN model TYPE VARCHAR(100);
ALTER TABLE api_usage ALTER COLUMN model TYPE VARCHAR(100);