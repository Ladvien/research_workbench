#!/bin/bash

# Demo script to test the commit analysis functionality
# This will analyze the most recent test-focused commit

WORKDIR="/Users/ladvien/research_workbench"
REVIEW_FILE="$WORKDIR/review_notes.md"

cd "$WORKDIR"

# Function to analyze a specific commit (copied from main monitor)
analyze_commit() {
    local commit_hash=$1
    echo "Analyzing commit: $commit_hash"

    # Get commit details
    local commit_msg=$(git show --format="%s" -s "$commit_hash")
    local commit_date=$(git show --format="%ci" -s "$commit_hash")
    local files_changed=$(git show --name-only --format="" "$commit_hash")

    # Analysis counters
    local test_files=0
    local impl_files=0
    local has_backend_tests=0
    local has_frontend_tests=0
    local has_e2e_tests=0

    # Analyze changed files
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue

        if [[ "$file" =~ \.test\.(ts|tsx|rs)$ ]] || [[ "$file" =~ _test\.rs$ ]] || [[ "$file" =~ tests/ ]] || [[ "$file" =~ \.spec\.(ts|tsx)$ ]]; then
            ((test_files++))

            if [[ "$file" =~ backend.*\.rs$ ]] || [[ "$file" =~ tests.*\.rs$ ]]; then
                has_backend_tests=1
            elif [[ "$file" =~ frontend.*\.(ts|tsx)$ ]] || [[ "$file" =~ \.spec\.(ts|tsx)$ ]]; then
                has_frontend_tests=1
            fi

            if [[ "$file" =~ e2e/ ]] || [[ "$file" =~ \.spec\.(ts|tsx)$ ]]; then
                has_e2e_tests=1
            fi
        elif [[ "$file" =~ \.(rs|ts|tsx)$ ]] && [[ ! "$file" =~ (config|scripts)/ ]]; then
            ((impl_files++))
        fi
    done <<< "$files_changed"

    # Calculate test ratio
    local test_ratio=0
    if ((impl_files > 0)); then
        test_ratio=$((test_files * 100 / impl_files))
    fi

    # Determine TDD compliance
    local tdd_compliance="❌ Unknown"
    if [[ "$commit_msg" =~ ^test:|^feat.*test|^add.*test ]]; then
        tdd_compliance="✅ Likely TDD (test-focused commit)"
    elif ((test_files > impl_files)); then
        tdd_compliance="✅ Good (more tests than implementation)"
    elif ((test_files > 0 && impl_files > 0)); then
        tdd_compliance="⚠️ Partial (tests and implementation together)"
    elif ((test_files == 0 && impl_files > 0)); then
        tdd_compliance="❌ Poor (implementation without tests)"
    fi

    # Generate coverage analysis
    local backend_coverage="N/A"
    local frontend_coverage="N/A"

    # Write analysis to review file
    cat >> "$REVIEW_FILE" << EOF

## Test Coverage Analysis: \`$commit_hash\`
**Date:** $commit_date
**Message:** $commit_msg

### Test Coverage Summary
- **Implementation files changed:** $impl_files
- **Test files changed:** $test_files
- **Test-to-implementation ratio:** ${test_ratio}%
- **Backend coverage:** $backend_coverage
- **Frontend coverage:** $frontend_coverage

### Component Coverage
- **Backend tests:** $( ((has_backend_tests)) && echo "✅ Present" || echo "❌ Missing" )
- **Frontend tests:** $( ((has_frontend_tests)) && echo "✅ Present" || echo "❌ Missing" )
- **E2E tests:** $( ((has_e2e_tests)) && echo "✅ Present" || echo "❌ Missing" )

### TDD Compliance
$tdd_compliance

### Quality Assessment
$( if ((test_files == 0 && impl_files > 0)); then
    echo "🔴 **CRITICAL:** Implementation changes without corresponding tests"
elif ((test_ratio < 50)); then
    echo "🟡 **WARNING:** Low test coverage ratio"
elif ((test_ratio >= 100)); then
    echo "🟢 **EXCELLENT:** Strong test coverage"
else
    echo "🔵 **GOOD:** Adequate test coverage"
fi )

### Files Changed
\`\`\`
$files_changed
\`\`\`

---

EOF

    echo "Analysis complete for $commit_hash"
}

# Analyze the most recent test-focused commit
echo "Running demo analysis on commit 32ee9dd (Comprehensive React Testing Library integration test suite)"
analyze_commit "32ee9dd"