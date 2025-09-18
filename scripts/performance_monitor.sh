#!/bin/bash

# Performance Monitor for Research Workbench
# Continuously monitors commits for performance issues

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKBENCH_DIR="$(dirname "$SCRIPT_DIR")"
REVIEWED_COMMITS_FILE="$WORKBENCH_DIR/.reviewed_commits_performance"
REVIEW_NOTES_FILE="$WORKBENCH_DIR/review_notes.md"
LOG_FILE="$WORKBENCH_DIR/performance_monitor.log"

# Performance patterns to check for
PERF_PATTERNS=(
    # Database patterns
    "SELECT.*IN.*\(.*SELECT"  # N+1 query patterns
    "for.*in.*{[^}]*SELECT"    # Loop with queries
    "execute.*loop|for.*execute" # Queries in loops
    "prepare.*loop|for.*prepare" # Statement prep in loops

    # Async patterns
    "await.*for.*in"           # Async in loops
    "\bsync\b.*fn"             # Sync functions
    "block_on.*loop"           # Blocking in loops
    "spawn.*loop"              # Task spawn in loops

    # Memory patterns
    "clone\(\)"                # Unnecessary clones
    "to_owned\(\)"             # Unnecessary ownership
    "String::from.*loop"       # String creation in loops
    "Vec::new\(\).*loop"       # Vector creation in loops
    "HashMap::new\(\).*loop"   # HashMap creation in loops

    # Error handling
    "unwrap\(\)"               # Panic-prone code
    "expect\(.*\)"             # Panic-prone code

    # Collection patterns
    "collect\(\).*collect"     # Double collection
    "into_iter.*collect.*into_iter" # Iterator chain issues

    # Frontend patterns
    "useEffect.*\[\].*fetch"   # Missing deps in useEffect
    "useState.*\{\}"           # Complex state objects
    "new.*Array\(.*\)"         # Array constructor
    "new.*Object\(\)"          # Object constructor
)

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

analyze_commit() {
    local commit_hash="$1"
    local findings=()
    
    log_message "Analyzing commit: $commit_hash"
    
    # Get commit info
    local commit_info=$(git show --name-only --pretty=format:"%h %s" "$commit_hash" 2>/dev/null | head -1)
    local changed_files=$(git show --name-only --pretty=format:"" "$commit_hash" 2>/dev/null | grep -v '^$')
    
    if [[ -z "$commit_info" ]]; then
        log_message "Warning: Could not get info for commit $commit_hash"
        return
    fi
    
    # Analyze each changed file
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        
        # Skip non-code files
        if [[ ! "$file" =~ \.(rs|ts|tsx|js|jsx)$ ]]; then
            continue
        fi
        
        # Get the diff for this file
        local diff_content=$(git show "$commit_hash" -- "$file" 2>/dev/null | grep '^+' | grep -v '^+++')
        
        # Check for performance anti-patterns
        for pattern in "${PERF_PATTERNS[@]}"; do
            if echo "$diff_content" | grep -qE "$pattern"; then
                case "$pattern" in
                    "SELECT.*IN.*\(.*SELECT")
                        findings+=("⚠️  Potential N+1 query detected in $file")
                        ;;
                    "for.*in.*{[^}]*SELECT")
                        findings+=("⚠️  Database query in loop detected in $file")
                        ;;
                    "execute.*loop|for.*execute")
                        findings+=("⚠️  SQL execution in loop - consider batch operations in $file")
                        ;;
                    "prepare.*loop|for.*prepare")
                        findings+=("⚠️  Statement preparation in loop - move outside loop in $file")
                        ;;
                    "await.*for.*in")
                        findings+=("⚠️  Async operation in loop - consider parallel processing in $file")
                        ;;
                    "\bsync\b.*fn")
                        findings+=("⚠️  Synchronous function may block async operations in $file")
                        ;;
                    "block_on.*loop")
                        findings+=("⚠️  Blocking async in loop - consider stream processing in $file")
                        ;;
                    "spawn.*loop")
                        findings+=("⚠️  Task spawning in loop - consider batch processing in $file")
                        ;;
                    "clone\(\)")
                        findings+=("💾 Unnecessary clone() detected - consider borrowing in $file")
                        ;;
                    "to_owned\(\)")
                        findings+=("💾 to_owned() usage - consider borrowing in $file")
                        ;;
                    "String::from.*loop")
                        findings+=("📝 String creation in loop - consider pre-allocation in $file")
                        ;;
                    "Vec::new\(\).*loop")
                        findings+=("📊 Vec creation in loop - consider pre-allocation in $file")
                        ;;
                    "HashMap::new\(\).*loop")
                        findings+=("🗂️  HashMap creation in loop - consider reusing in $file")
                        ;;
                    "unwrap\(\)")
                        findings+=("💥 unwrap() usage - consider proper error handling in $file")
                        ;;
                    "expect\(.*\)")
                        findings+=("💥 expect() usage - consider proper error handling in $file")
                        ;;
                    "collect\(\).*collect")
                        findings+=("🔄 Double collection detected - optimize iterator chain in $file")
                        ;;
                    "into_iter.*collect.*into_iter")
                        findings+=("🔄 Complex iterator chain - consider optimization in $file")
                        ;;
                    "useEffect.*\[\].*fetch")
                        findings+=("⚠️  useEffect missing dependencies - potential stale closure in $file")
                        ;;
                    "useState.*\{\}")
                        findings+=("📊 Complex state object - consider useReducer in $file")
                        ;;
                    "new.*Array\(.*\)")
                        findings+=("📊 Array constructor usage - consider literal syntax in $file")
                        ;;
                    "new.*Object\(\)")
                        findings+=("🗂️  Object constructor usage - consider literal syntax in $file")
                        ;;
                esac
            fi
        done
        
        # Check for missing caching opportunities
        if echo "$diff_content" | grep -qE "(SELECT|fetch|request)" && ! echo "$diff_content" | grep -qE "(cache|memoize|store)"; then
            findings+=("🔄 Potential caching opportunity in $file")
        fi
        
        # Check for streaming implementation
        if echo "$diff_content" | grep -qE "(collect_all|to_vec|into_iter.*collect)" && echo "$diff_content" | grep -qE "(large|batch|bulk)"; then
            findings+=("🌊 Consider streaming for large data processing in $file")
        fi
        
        # Check for memory allocation patterns
        if echo "$diff_content" | grep -qE "(Box::new|Rc::new|Arc::new)" && echo "$diff_content" | grep -qE "(loop|for|while)"; then
            findings+=("🧠 Memory allocation in loop - consider pre-allocation in $file")
        fi
        
    done <<< "$changed_files"
    
    # Write findings to review notes
    if [[ ${#findings[@]} -gt 0 ]]; then
        {
            echo "## [AGENT-PERFORMANCE] Analysis for commit $commit_info"
            echo "**Date:** $(date '+%Y-%m-%d %H:%M:%S')"
            echo "**Files changed:** $(echo "$changed_files" | wc -l | tr -d ' ')"
            echo ""
            echo "### Performance Findings:"
            for finding in "${findings[@]}"; do
                echo "- $finding"
            done
            echo ""
            echo "### Recommendations:"
            echo "- Review flagged patterns for optimization opportunities"
            echo "- Consider implementing caching where appropriate"
            echo "- Ensure async operations are properly parallelized"
            echo "- Monitor memory usage in production"
            echo ""
            echo "---"
            echo ""
        } >> "$REVIEW_NOTES_FILE"
        
        log_message "Found ${#findings[@]} performance issues in commit $commit_hash"
    else
        log_message "No performance issues found in commit $commit_hash"
    fi
}

initialize_review_notes() {
    # File should exist with our header already added
    if [[ ! -f "$REVIEW_NOTES_FILE" ]]; then
        log_message "Warning: review_notes.md not found, creating basic file"
        {
            echo "# Code Review Notes - Research Workbench"
            echo ""
            echo "**[AGENT-PERFORMANCE]** Continuous monitoring of performance patterns, N+1 queries, caching, async operations, memory usage, streaming."
            echo ""
            echo "---"
            echo ""
        } > "$REVIEW_NOTES_FILE"
    fi
}

get_reviewed_commits() {
    if [[ -f "$REVIEWED_COMMITS_FILE" ]]; then
        cat "$REVIEWED_COMMITS_FILE"
    fi
}

mark_commit_reviewed() {
    echo "$1" >> "$REVIEWED_COMMITS_FILE"
}

get_recent_commits() {
    git rev-list --max-count=5 HEAD
}

get_new_commits() {
    local reviewed_commits=$(get_reviewed_commits)
    local all_commits=$(git rev-list HEAD)
    
    if [[ -z "$reviewed_commits" ]]; then
        # First run - analyze last 5 commits
        get_recent_commits
    else
        # Find commits not yet reviewed
        comm -23 <(echo "$all_commits" | sort) <(echo "$reviewed_commits" | sort)
    fi
}

main_loop() {
    cd "$WORKBENCH_DIR" || exit 1
    
    log_message "Performance monitor started - PID: $$"
    log_message "Monitoring directory: $WORKBENCH_DIR"
    
    initialize_review_notes
    
    # Initial analysis of last 5 commits if no previous reviews
    if [[ ! -f "$REVIEWED_COMMITS_FILE" ]]; then
        log_message "Initial analysis: reviewing last 5 commits"
        local initial_commits=("32ee9dd" "131e0e9" "6ec4c0e" "2931ece" "874ecb6")
        
        for commit in "${initial_commits[@]}"; do
            analyze_commit "$commit"
            mark_commit_reviewed "$commit"
        done
    fi
    
    # Continuous monitoring loop
    while true; do
        # Check for new commits
        git fetch origin main 2>/dev/null || true
        
        local new_commits=$(get_new_commits)
        
        if [[ -n "$new_commits" ]]; then
            while IFS= read -r commit; do
                [[ -z "$commit" ]] && continue
                analyze_commit "$commit"
                mark_commit_reviewed "$commit"
            done <<< "$new_commits"
        fi
        
        # Wait 30 seconds before next check
        sleep 30
    done
}

# Handle signals for graceful shutdown
trap 'log_message "Performance monitor stopping - PID: $$"; exit 0' SIGTERM SIGINT

# Run main loop
main_loop