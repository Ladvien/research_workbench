-- Add account lockout mechanism to prevent brute force attacks
-- AUTH-SEC-003: Missing Account Lockout

-- Add failed_attempts and locked_until fields to users table
ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;

-- Add indexes for performance on lockout queries
CREATE INDEX idx_users_failed_attempts ON users(failed_attempts);
CREATE INDEX idx_users_locked_until ON users(locked_until);

-- Add constraint to ensure failed_attempts is non-negative
ALTER TABLE users ADD CONSTRAINT check_failed_attempts_non_negative 
    CHECK (failed_attempts >= 0);

-- Add constraint to ensure locked_until is in the future when set
ALTER TABLE users ADD CONSTRAINT check_locked_until_future 
    CHECK (locked_until IS NULL OR locked_until > NOW());

-- Add a function to automatically unlock accounts when lockout period expires
CREATE OR REPLACE FUNCTION unlock_expired_accounts()
RETURNS INTEGER AS $$
DECLARE
    unlocked_count INTEGER;
BEGIN
    UPDATE users 
    SET locked_until = NULL, failed_attempts = 0
    WHERE locked_until IS NOT NULL AND locked_until <= NOW();
    
    GET DIAGNOSTICS unlocked_count = ROW_COUNT;
    RETURN unlocked_count;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically reset failed_attempts on successful login
-- This will be called from the application layer after successful password verification
CREATE OR REPLACE FUNCTION reset_failed_attempts()
RETURNS TRIGGER AS $$
BEGIN
    -- Reset failed attempts when password_hash is updated (password change)
    IF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
        NEW.failed_attempts = 0;
        NEW.locked_until = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reset_failed_attempts
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION reset_failed_attempts();