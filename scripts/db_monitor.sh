#!/bin/bash

# Database Monitor for Research Workbench
# Monitors git commits for database-related changes
# Runs every 30 seconds in background

set -euo pipefail

# Configuration
WORKDIR="/Users/ladvien/research_workbench"
REVIEW_FILE="$WORKDIR/review_notes.md"
TRACKED_FILE="$WORKDIR/.reviewed_commits"
LOG_FILE="$WORKDIR/db_monitor.log"
CHECK_INTERVAL=30

# Database-related file patterns
DB_PATTERNS=(
    "*.sql"
    "*migration*"
    "src/database.rs"
    "src/models.rs"
    "src/repositories/*"
    "migrations/*"
    "sqlx-data.json"
    "Cargo.toml"
)

# Database-related keywords to search for in commits
DB_KEYWORDS=(
    "CREATE TABLE"
    "ALTER TABLE"
    "DROP TABLE"
    "CREATE INDEX"
    "DROP INDEX"
    "CONSTRAINT"
    "FOREIGN KEY"
    "PRIMARY KEY"
    "pgvector"
    "embedding"
    "connection pool"
    "sqlx"
    "PostgreSQL"
    "database"
    "migration"
    "schema"
)

cd "$WORKDIR"

# Initialize files if they don't exist
if [[ ! -f "$TRACKED_FILE" ]]; then
    echo "# Database monitor reviewed commits" > "$TRACKED_FILE"
    echo "# Started: $(date)" >> "$TRACKED_FILE"
fi

if [[ ! -f "$REVIEW_FILE" ]]; then
    cat > "$REVIEW_FILE" << 'EOF'
# Database Review Notes - Research Workbench

**[AGENT-DATABASE]** - Continuous monitoring of database-related changes

## Monitor Status
- Started: $(date)
- Check Interval: 30 seconds
- Tracking: SQL patterns, migrations, indexes, constraints, connection pooling

---

EOF
fi

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to check if commit is already reviewed
is_reviewed() {
    local commit_hash="$1"
    grep -q "^$commit_hash$" "$TRACKED_FILE" 2>/dev/null
}

# Function to mark commit as reviewed
mark_reviewed() {
    local commit_hash="$1"
    echo "$commit_hash" >> "$TRACKED_FILE"
}

# Function to analyze commit for database changes
analyze_commit() {
    local commit_hash="$1"
    local commit_msg="$2"
    local findings=()
    
    log "Analyzing commit: $commit_hash"
    
    # Get list of changed files
    local changed_files
    changed_files=$(git show --name-only "$commit_hash" 2>/dev/null || echo "")
    
    # Check for database-related file changes
    local db_files_changed=()
    for pattern in "${DB_PATTERNS[@]}"; do
        while IFS= read -r file; do
            if [[ -n "$file" ]] && [[ "$file" == $pattern ]]; then
                db_files_changed+=("$file")
            fi
        done <<< "$changed_files"
    done
    
    # Check commit message for database keywords
    local keyword_matches=()
    for keyword in "${DB_KEYWORDS[@]}"; do
        if echo "$commit_msg" | grep -qi "$keyword"; then
            keyword_matches+=("$keyword")
        fi
    done
    
    # Get actual file changes for analysis
    local file_changes
    file_changes=$(git show "$commit_hash" 2>/dev/null || echo "")
    
    # Analyze specific database patterns in the diff
    local sql_patterns=()
    
    # Check for SQL statements
    if echo "$file_changes" | grep -qi "CREATE TABLE\|ALTER TABLE\|DROP TABLE"; then
        sql_patterns+=("Table schema changes detected")
    fi
    
    if echo "$file_changes" | grep -qi "CREATE INDEX\|DROP INDEX"; then
        sql_patterns+=("Index changes detected")
    fi
    
    if echo "$file_changes" | grep -qi "CONSTRAINT\|FOREIGN KEY\|PRIMARY KEY"; then
        sql_patterns+=("Constraint changes detected")
    fi
    
    if echo "$file_changes" | grep -qi "pgvector\|embedding"; then
        sql_patterns+=("Vector/embedding changes detected")
    fi
    
    if echo "$file_changes" | grep -qi "pool\|connection"; then
        sql_patterns+=("Connection pooling changes detected")
    fi
    
    if echo "$file_changes" | grep -qi "migration"; then
        sql_patterns+=("Migration-related changes detected")
    fi
    
    # Generate findings report if any database activity detected
    if [[ ${#db_files_changed[@]} -gt 0 ]] || [[ ${#keyword_matches[@]} -gt 0 ]] || [[ ${#sql_patterns[@]} -gt 0 ]]; then
        {
            echo "## Database Review - Commit $commit_hash"
            echo "**Date:** $(date)"
            echo "**Commit:** $commit_hash"
            echo "**Message:** $commit_msg"
            echo ""
            
            if [[ ${#db_files_changed[@]} -gt 0 ]]; then
                echo "### Database Files Changed:"
                printf '- %s\n' "${db_files_changed[@]}"
                echo ""
            fi
            
            if [[ ${#keyword_matches[@]} -gt 0 ]]; then
                echo "### Database Keywords Found:"
                printf '- %s\n' "${keyword_matches[@]}"
                echo ""
            fi
            
            if [[ ${#sql_patterns[@]} -gt 0 ]]; then
                echo "### SQL Pattern Analysis:"
                printf '- %s\n' "${sql_patterns[@]}"
                echo ""
            fi
            
            # Check for specific migration files
            if echo "$changed_files" | grep -q "migrations/.*\.sql"; then
                echo "### Migration Files:"
                echo "$changed_files" | grep "migrations/.*\.sql" | sed 's/^/- /'
                echo ""
            fi
            
            # Extract SQL snippets from diff (first 10 lines of SQL)
            local sql_snippets
            sql_snippets=$(echo "$file_changes" | grep -A 5 -B 5 "CREATE\|ALTER\|DROP\|INSERT\|UPDATE\|DELETE" | head -20)
            if [[ -n "$sql_snippets" ]]; then
                echo "### SQL Code Snippets:"
                echo '```sql'
                echo "$sql_snippets"
                echo '```'
                echo ""
            fi
            
            echo "---"
            echo ""
        } >> "$REVIEW_FILE"
        
        log "Database changes found in commit $commit_hash - review updated"
        return 0
    else
        log "No database changes in commit $commit_hash"
        return 1
    fi
}

# Function to process initial commits
process_initial_commits() {
    local initial_commits=("32ee9dd" "131e0e9" "6ec4c0e" "2931ece" "874ecb6")
    
    log "Processing initial 5 commits for database analysis"
    
    for commit in "${initial_commits[@]}"; do
        if ! is_reviewed "$commit"; then
            local commit_msg
            commit_msg=$(git log -1 --format="%s" "$commit" 2>/dev/null || echo "Commit not found")
            
            if analyze_commit "$commit" "$commit_msg"; then
                mark_reviewed "$commit"
            else
                mark_reviewed "$commit"  # Mark as reviewed even if no DB changes
            fi
        fi
    done
}

# Function to check for new commits
check_new_commits() {
    # Get all commits since last check
    local all_commits
    all_commits=$(git log --format="%H" --since="1 hour ago" 2>/dev/null || echo "")
    
    if [[ -z "$all_commits" ]]; then
        return 0
    fi
    
    while IFS= read -r commit; do
        if [[ -n "$commit" ]] && ! is_reviewed "$commit"; then
            local commit_msg
            commit_msg=$(git log -1 --format="%s" "$commit" 2>/dev/null || echo "Unknown")
            
            if analyze_commit "$commit" "$commit_msg"; then
                mark_reviewed "$commit"
            else
                mark_reviewed "$commit"  # Mark as reviewed even if no DB changes
            fi
        fi
    done <<< "$all_commits"
}

# Function to update monitor status
update_status() {
    local temp_file
    temp_file=$(mktemp)
    
    # Update the status line in review notes
    sed "s/- Last Check: .*/- Last Check: $(date)/" "$REVIEW_FILE" > "$temp_file" || {
        # If the line doesn't exist, add it
        head -10 "$REVIEW_FILE" > "$temp_file"
        echo "- Last Check: $(date)" >> "$temp_file"
        tail -n +11 "$REVIEW_FILE" >> "$temp_file"
    }
    
    mv "$temp_file" "$REVIEW_FILE"
}

# Main monitoring loop
main() {
    log "Starting Database Monitor for Research Workbench"
    log "Working directory: $WORKDIR"
    log "Review file: $REVIEW_FILE"
    log "Tracked commits file: $TRACKED_FILE"
    
    # Process initial commits
    process_initial_commits
    
    # Main loop
    while true; do
        log "Checking for new commits..."
        
        # Fetch latest changes
        git fetch origin main 2>/dev/null || log "Warning: Could not fetch from origin"
        
        # Check for new commits
        check_new_commits
        
        # Update status
        update_status
        
        log "Check complete. Sleeping for $CHECK_INTERVAL seconds..."
        sleep "$CHECK_INTERVAL"
    done
}

# Handle script termination
trap 'log "Database monitor stopped"; exit 0' SIGTERM SIGINT

# Run main function
main