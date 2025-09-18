#!/bin/bash

# Rust Code Quality Monitor for Knowledge Research Workbench Backend
# RUST-ENGINEER Continuous Background Monitor
# Focus: Rust/Axum code quality, patterns, and best practices

set -euo pipefail

WORKBENCH_ROOT="/Users/ladvien/research_workbench"
BACKEND_DIR="$WORKBENCH_ROOT/backend"
REVIEWED_COMMITS_FILE="$WORKBENCH_ROOT/.reviewed_commits"
REVIEW_NOTES_FILE="$WORKBENCH_ROOT/review_notes.md"
MONITORING_ZONE="$BACKEND_DIR/src"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[RUST-MONITOR $(date '+%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[RUST-MONITOR WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[RUST-MONITOR ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[RUST-MONITOR SUCCESS]${NC} $1"
}

# Get last reviewed commit
get_last_reviewed_commit() {
    if [[ -f "$REVIEWED_COMMITS_FILE" ]]; then
        tail -1 "$REVIEWED_COMMITS_FILE" | grep -E "^[a-f0-9]{40}$" || echo ""
    else
        echo ""
    fi
}

# Update reviewed commits file
update_reviewed_commits() {
    local commit_sha="$1"
    echo "$commit_sha" >> "$REVIEWED_COMMITS_FILE"
}

# Initialize review notes file if needed
init_review_notes() {
    if [[ ! -f "$REVIEW_NOTES_FILE" ]]; then
        cat > "$REVIEW_NOTES_FILE" << 'EOF'
# Code Quality Review Notes
## RUST-ENGINEER - Continuous Background Monitor

**Active Since:** $(date)
**Monitoring Zone:** /backend/src/ (all Rust files)
**Focus Areas:**
- Rust code quality and idioms
- Error handling patterns (Result<T, E>)
- Async/await best practices
- Memory safety and ownership
- SQLx patterns and security
- Axum handler implementations
- Performance optimizations

**Review Frequency:** Every 30 seconds

---

EOF
    fi
}

# Analyze Rust code quality for a specific commit
analyze_commit() {
    local commit_sha="$1"
    local author="$2"
    local timestamp="$3"
    local message="$4"

    log "Analyzing commit $commit_sha by $author"

    # Get changed Rust files in backend
    local changed_files
    changed_files=$(cd "$WORKBENCH_ROOT" && git diff-tree --no-commit-id --name-only -r "$commit_sha" | grep "^backend/src/.*\.rs$" || true)

    if [[ -z "$changed_files" ]]; then
        log "No Rust files changed in commit $commit_sha"
        return 0
    fi

    log "Changed Rust files: $(echo "$changed_files" | tr '\n' ' ')"

    # Run cargo clippy on the entire backend
    local clippy_output
    local clippy_status=0
    cd "$BACKEND_DIR"
    clippy_output=$(cargo clippy --all-targets --all-features -- -D warnings 2>&1) || clippy_status=$?

    # Analyze clippy results
    local quality_rating="Excellent"
    local clippy_warnings=0
    local clippy_errors=0

    if [[ $clippy_status -ne 0 ]]; then
        clippy_warnings=$(echo "$clippy_output" | grep -c "warning:" || true)
        clippy_errors=$(echo "$clippy_output" | grep -c "error:" || true)

        if [[ $clippy_errors -gt 0 ]]; then
            quality_rating="Poor"
        elif [[ $clippy_warnings -gt 10 ]]; then
            quality_rating="Needs Work"
        elif [[ $clippy_warnings -gt 0 ]]; then
            quality_rating="Good"
        fi
    fi

    # Write review to notes
    {
        echo
        echo "### Commit: $commit_sha - $author - $timestamp"
        echo "**Backend Review by RUST-ENGINEER**"
        echo "**Message:** $message"
        echo "**Code Quality:** $quality_rating"
        echo
        echo "#### Rust Files Changed:"
        for file in $changed_files; do
            echo "- $file"
        done
        echo

        if [[ $clippy_status -ne 0 ]]; then
            echo "#### Clippy Analysis:"
            echo "- **Errors:** $clippy_errors"
            echo "- **Warnings:** $clippy_warnings"
            echo
            echo "#### Issues Found:"

            # Parse specific clippy issues
            echo "$clippy_output" | while IFS= read -r line; do
                if [[ "$line" =~ error:.*--\> ]]; then
                    local file_line=$(echo "$line" | grep -o "src/[^:]*:[0-9]*" || echo "unknown")
                    local issue=$(echo "$line" | sed 's/error: //')
                    echo "1. **[CLIPPY ERROR] $file_line** - $issue"
                elif [[ "$line" =~ warning:.*--\> ]]; then
                    local file_line=$(echo "$line" | grep -o "src/[^:]*:[0-9]*" || echo "unknown")
                    local issue=$(echo "$line" | sed 's/warning: //')
                    echo "1. **[CLIPPY WARNING] $file_line** - $issue"
                fi
            done
        else
            echo "#### Clippy Analysis:"
            echo "✅ No clippy warnings or errors found"
        fi

        echo
        echo "#### Pattern Analysis:"

        # Analyze each changed file for patterns
        for file in $changed_files; do
            local full_path="$WORKBENCH_ROOT/$file"
            if [[ -f "$full_path" ]]; then
                analyze_rust_patterns "$full_path" "$file"
            fi
        done

        echo
        echo "---"
        echo
    } >> "$REVIEW_NOTES_FILE"
}

# Analyze Rust patterns in a specific file
analyze_rust_patterns() {
    local file_path="$1"
    local relative_path="$2"

    # Check for common anti-patterns
    local issues=()

    # Check for unwrap() usage
    local unwrap_count=$(grep -c "\.unwrap()" "$file_path" 2>/dev/null || true)
    if [[ $unwrap_count -gt 0 ]]; then
        issues+=("**[PATTERN] $relative_path** - Found $unwrap_count .unwrap() calls | Suggestion: Use proper error handling with ?")
    fi

    # Check for expect() with static strings
    local expect_count=$(grep -c "\.expect(" "$file_path" 2>/dev/null || true)
    if [[ $expect_count -gt 0 ]]; then
        issues+=("**[PATTERN] $relative_path** - Found $expect_count .expect() calls | Review: Ensure meaningful error messages")
    fi

    # Check for blocking operations in async contexts
    if grep -q "async fn" "$file_path" 2>/dev/null; then
        if grep -q "std::thread::sleep\|std::fs::" "$file_path" 2>/dev/null; then
            issues+=("**[PATTERN] $relative_path** - Potential blocking operations in async context | Suggestion: Use tokio equivalents")
        fi
    fi

    # Check for SQL injection vulnerabilities
    if grep -q "format!\|&format!" "$file_path" 2>/dev/null && grep -q "query\|execute" "$file_path" 2>/dev/null; then
        issues+=("**[SECURITY] $relative_path** - Potential SQL injection with string formatting | Fix: Use parameterized queries")
    fi

    # Check for proper error types
    if grep -q "Result<" "$file_path" 2>/dev/null; then
        if ! grep -q "anyhow\|thiserror" "$file_path" 2>/dev/null; then
            issues+=("**[PATTERN] $relative_path** - Using Result without error handling crates | Suggestion: Consider anyhow or thiserror")
        fi
    fi

    # Check for missing connection pooling patterns
    if grep -q "PgConnection\|connect(" "$file_path" 2>/dev/null; then
        if ! grep -q "Pool\|pool" "$file_path" 2>/dev/null; then
            issues+=("**[PERFORMANCE] $relative_path** - Direct database connections | Suggestion: Use connection pooling")
        fi
    fi

    # Print found issues
    if [[ ${#issues[@]} -gt 0 ]]; then
        for issue in "${issues[@]}"; do
            echo "$issue"
        done
    else
        echo "✅ **$relative_path** - No pattern issues detected"
    fi
}

# Main monitoring loop
monitor_commits() {
    local last_commit
    last_commit=$(get_last_reviewed_commit)

    cd "$WORKBENCH_ROOT"

    # Get new commits since last review
    local git_log_cmd="git log --oneline --reverse"
    if [[ -n "$last_commit" ]]; then
        git_log_cmd="$git_log_cmd $last_commit..HEAD"
    else
        git_log_cmd="$git_log_cmd -10"  # Review last 10 commits if starting fresh
    fi

    local new_commits
    new_commits=$($git_log_cmd 2>/dev/null || true)

    if [[ -z "$new_commits" ]]; then
        return 0
    fi

    log "Found new commits to review:"
    echo "$new_commits"

    # Process each commit
    while IFS= read -r commit_line; do
        if [[ -n "$commit_line" ]]; then
            local commit_sha=$(echo "$commit_line" | cut -d' ' -f1)
            local commit_message=$(echo "$commit_line" | cut -d' ' -f2-)
            local author=$(git log -1 --format="%an" "$commit_sha")
            local timestamp=$(git log -1 --format="%ci" "$commit_sha")

            analyze_commit "$commit_sha" "$author" "$timestamp" "$commit_message"
            update_reviewed_commits "$commit_sha"
        fi
    done <<< "$new_commits"
}

# Check if monitoring is already running
check_running() {
    local pid_file="/tmp/rust_monitor.pid"
    if [[ -f "$pid_file" ]]; then
        local old_pid=$(cat "$pid_file")
        if kill -0 "$old_pid" 2>/dev/null; then
            error "Monitor already running with PID $old_pid"
            exit 1
        else
            rm -f "$pid_file"
        fi
    fi
    echo $$ > "$pid_file"
}

# Cleanup on exit
cleanup() {
    rm -f "/tmp/rust_monitor.pid"
    log "Rust quality monitor stopped"
}

# Main execution
main() {
    log "Starting Rust Code Quality Monitor for Knowledge Research Workbench"
    log "Monitoring zone: $MONITORING_ZONE"
    log "Review frequency: Every 30 seconds"

    check_running
    trap cleanup EXIT

    init_review_notes

    # Initial analysis
    log "Performing initial quality analysis..."
    monitor_commits

    # Continuous monitoring loop
    while true; do
        sleep 30
        monitor_commits
    done
}

# Handle script arguments
case "${1:-start}" in
    start)
        main
        ;;
    check)
        monitor_commits
        success "Single check completed"
        ;;
    status)
        if [[ -f "/tmp/rust_monitor.pid" ]]; then
            pid=$(cat "/tmp/rust_monitor.pid")
            if kill -0 "$pid" 2>/dev/null; then
                success "Monitor running with PID $pid"
            else
                warn "Monitor PID file exists but process not running"
            fi
        else
            warn "Monitor not running"
        fi
        ;;
    stop)
        if [[ -f "/tmp/rust_monitor.pid" ]]; then
            pid=$(cat "/tmp/rust_monitor.pid")
            if kill "$pid" 2>/dev/null; then
                success "Monitor stopped"
            else
                warn "Failed to stop monitor"
            fi
        else
            warn "Monitor not running"
        fi
        ;;
    *)
        echo "Usage: $0 {start|check|status|stop}"
        exit 1
        ;;
esac