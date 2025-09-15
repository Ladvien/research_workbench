#!/bin/bash

# Workbench LLM Chat Application - Complete Database Setup Script
# This script sets up PostgreSQL database for the Workbench application
# Run as: sudo ./setup_db.sh

set -e  # Exit on error

# ==============================================================================
# Configuration
# ==============================================================================
DB_NAME="workbench"
DB_USER="workbench"
DB_PASSWORD="${DATABASE_PASSWORD:-}"  # Get from environment variable
DB_HOST="localhost"
DB_PORT="5432"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ==============================================================================
# Helper Functions
# ==============================================================================
log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_postgres_running() {
    if ! sudo systemctl is-active --quiet postgresql@17-main.service; then
        log_warning "PostgreSQL 17 is not running. Attempting to start..."

        # Stop any conflicting services
        sudo systemctl stop postgresql-beast.service 2>/dev/null || true
        sudo systemctl stop postgresql.service 2>/dev/null || true

        # Start PostgreSQL 17
        sudo systemctl start postgresql@17-main.service
        sleep 2

        if ! sudo systemctl is-active --quiet postgresql@17-main.service; then
            log_error "Failed to start PostgreSQL 17"
            exit 1
        fi
    fi
    log_info "PostgreSQL 17 is running"
}

check_extension_available() {
    local ext_name=$1
    local package_name=$2

    sudo -u postgres psql -t -c "SELECT 1 FROM pg_available_extensions WHERE name = '$ext_name';" | grep -q 1
    if [ $? -ne 0 ]; then
        log_warning "Extension $ext_name not available. Installing $package_name..."
        sudo apt-get update && sudo apt-get install -y $package_name
        sudo systemctl restart postgresql@17-main.service
        sleep 2
    fi
}

# ==============================================================================
# Main Setup Process
# ==============================================================================

echo "🚀 Starting Workbench Database Setup..."
echo "================================================"

# Step 0: Validate environment variables
if [ -z "$DATABASE_PASSWORD" ]; then
    log_error "DATABASE_PASSWORD environment variable is not set!"
    echo "Please set DATABASE_PASSWORD or source your .env file:"
    echo "  export DATABASE_PASSWORD=your_password"
    echo "  or: source .env && ./setup_db.sh"
    exit 1
fi

# Step 1: Check PostgreSQL is running
log_info "Checking PostgreSQL service..."
check_postgres_running

# Step 2: Check required extensions are available
log_info "Checking required PostgreSQL extensions..."
check_extension_available "pgvector" "postgresql-17-pgvector"

# Step 3: Create user and databases
echo ""
log_info "Creating database user and databases..."
sudo -u postgres psql << EOF 2>/dev/null || true
-- Create user if not exists
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '${DB_USER}') THEN
      CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
      RAISE NOTICE 'User ${DB_USER} created';
   ELSE
      ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
      RAISE NOTICE 'User ${DB_USER} password updated';
   END IF;
END
\$\$;

-- Create main database if not exists
SELECT 'Database ${DB_NAME} exists' WHERE EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}');
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};

-- Create test database if not exists
SELECT 'Database ${DB_NAME}_test exists' WHERE EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}_test');
CREATE DATABASE ${DB_NAME}_test OWNER ${DB_USER};
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME}_test TO ${DB_USER};
EOF

# Step 4: Setup extensions on main database
echo ""
log_info "Setting up extensions on main database..."
sudo -u postgres psql -d ${DB_NAME} << 'EOF'
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector" CASCADE;
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Grant permissions
GRANT ALL ON SCHEMA public TO workbench;
GRANT CREATE ON SCHEMA public TO workbench;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO workbench;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO workbench;

-- Verify extensions
SELECT 'Extensions: ' || string_agg(extname, ', ') AS status
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'pgvector', 'postgis', 'vector');
EOF

# Step 5: Setup extensions on test database
echo ""
log_info "Setting up extensions on test database..."
sudo -u postgres psql -d ${DB_NAME}_test << 'EOF'
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector" CASCADE;
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Grant permissions
GRANT ALL ON SCHEMA public TO workbench;
GRANT CREATE ON SCHEMA public TO workbench;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO workbench;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO workbench;
EOF

# Step 6: Create schema tables on main database
echo ""
log_info "Creating schema tables on main database..."
export PGPASSWORD="${DB_PASSWORD}"
psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} << 'EOF'
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    model VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Messages table (supports branching)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES messages(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Message embeddings for semantic search
CREATE TABLE IF NOT EXISTS message_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- File attachments
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    size_bytes BIGINT,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    model VARCHAR(50) NOT NULL,
    tokens_prompt INTEGER,
    tokens_completion INTEGER,
    cost_cents INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_embedding
    ON message_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_created ON api_usage(user_id, created_at);

-- Add update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EOF

# Step 7: Create schema tables on test database
echo ""
log_info "Creating schema tables on test database..."
export PGPASSWORD="${DB_PASSWORD}"
psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME}_test << 'EOF'
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    model VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Messages table (supports branching)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES messages(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Message embeddings for semantic search
CREATE TABLE IF NOT EXISTS message_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- File attachments
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    size_bytes BIGINT,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage tracking
CREATE TABLE IF NOT EXISTS api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    model VARCHAR(50) NOT NULL,
    tokens_prompt INTEGER,
    tokens_completion INTEGER,
    cost_cents INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_embedding
    ON message_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_created ON api_usage(user_id, created_at);

-- Add update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EOF

# Step 8: Final verification
echo ""
echo "================================================"
log_info "Running final verification..."

# Test main database connection and count tables
export PGPASSWORD="${DB_PASSWORD}"
MAIN_TABLES=$(psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
TEST_TABLES=$(psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME}_test -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")

echo ""
echo "📊 Database Status:"
echo "==================="
log_info "Main database (${DB_NAME}): $MAIN_TABLES tables"
log_info "Test database (${DB_NAME}_test): $TEST_TABLES tables"

# List tables in main database
echo ""
echo "📋 Tables in ${DB_NAME}:"
export PGPASSWORD="${DB_PASSWORD}"
psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c "\dt"

# Test vector extension
echo ""
log_info "Testing pgvector extension..."
export PGPASSWORD="${DB_PASSWORD}"
psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT 'pgvector is working' WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector');" | grep -q "working"
if [ $? -eq 0 ]; then
    log_info "pgvector extension is functional"
else
    log_warning "pgvector extension may need attention"
fi

echo ""
echo "================================================"
echo "🎉 Database setup complete!"
echo ""
echo "📝 Connection Details:"
echo "  Host: ${DB_HOST}"
echo "  Port: ${DB_PORT}"
echo "  Database: ${DB_NAME}"
echo "  User: ${DB_USER}"
echo "  Password: (as configured in .env)"
echo ""
echo "🔗 Connection string for .env:"
echo "  DATABASE_URL=postgresql://${DB_USER}:\${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo ""
log_info "Ready for Workbench development!"