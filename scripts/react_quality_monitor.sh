#!/bin/bash

# REACT-SPECIALIST Continuous Quality Monitor
# Monitors frontend React/TypeScript code quality every 30 seconds

WORKDIR="/Users/ladvien/research_workbench"
FRONTEND_DIR="$WORKDIR/frontend"
MONITORING_LOG="$WORKDIR/review_notes.md"
REVIEWED_COMMITS_FILE="$WORKDIR/.reviewed_commits"

cd "$WORKDIR"

echo "🚀 REACT-SPECIALIST Quality Monitor Started"
echo "📍 Monitoring Zone: /frontend/src/ (React/TypeScript files)"
echo "⏱️  Check Interval: 30 seconds"
echo "📝 Review Log: $MONITORING_LOG"
echo ""

get_last_reviewed_commit() {
    if [[ -f "$REVIEWED_COMMITS_FILE" ]]; then
        tail -1 "$REVIEWED_COMMITS_FILE"
    else
        echo ""
    fi
}

analyze_react_hooks() {
    local file="$1"
    local violations=()

    # Check for useEffect dependency issues
    if grep -n "useEffect" "$file" > /dev/null; then
        local useeffect_lines=$(grep -n "useEffect" "$file" | cut -d: -f1)
        for line in $useeffect_lines; do
            # Check if the useEffect has proper dependencies
            local effect_block=$(sed -n "${line},$((line+5))p" "$file")
            if echo "$effect_block" | grep -q "useEffect.*\[\]" && echo "$effect_block" | grep -v "mount"; then
                violations+=("**[HOOKS] $file:L$line** - Empty dependency array may indicate missing dependencies")
            fi
        done
    fi

    # Check for missing dependency arrays
    if grep -n "useEffect.*{" "$file" | grep -v "\[" > /dev/null; then
        local missing_deps=$(grep -n "useEffect.*{" "$file" | grep -v "\[" | cut -d: -f1)
        for line in $missing_deps; do
            violations+=("**[HOOKS] $file:L$line** - useEffect missing dependency array")
        done
    fi

    # Check for inline object/function creation in JSX
    if grep -n "onClick={() =>" "$file" > /dev/null; then
        local inline_funcs=$(grep -n "onClick={() =>" "$file" | cut -d: -f1)
        for line in $inline_funcs; do
            violations+=("**[PERFORMANCE] $file:L$line** - Inline function creation in onClick | Fix: Extract to useCallback")
        done
    fi

    printf '%s\n' "${violations[@]}"
}

analyze_typescript_quality() {
    local file="$1"
    local violations=()

    # Check for any types
    if grep -n ": any" "$file" > /dev/null; then
        local any_types=$(grep -n ": any" "$file" | cut -d: -f1)
        for line in $any_types; do
            violations+=("**[TYPESCRIPT] $file:L$line** - Use of 'any' type | Fix: Add proper TypeScript interface")
        done
    fi

    # Check for missing Props interfaces
    if grep -n "React.FC<" "$file" > /dev/null && ! grep -n "Props" "$file" > /dev/null; then
        violations+=("**[TYPESCRIPT] $file** - Component missing Props interface | Fix: Add ComponentNameProps interface")
    fi

    printf '%s\n' "${violations[@]}"
}

run_lint_check() {
    cd "$FRONTEND_DIR"
    local lint_output=$(pnpm lint 2>&1)
    local error_count=$(echo "$lint_output" | grep -c "error" || echo "0")
    local warning_count=$(echo "$lint_output" | grep -c "warning" || echo "0")

    if [[ $error_count -gt 0 ]] || [[ $warning_count -gt 0 ]]; then
        echo "**[LINTING] ESLint Status** - $error_count errors, $warning_count warnings | Fix: Address linting violations"
    fi
}

monitor_commits() {
    local last_reviewed=$(get_last_reviewed_commit)

    if [[ -z "$last_reviewed" ]]; then
        echo "No previous commits to review. Starting fresh monitoring..."
        return
    fi

    # Get new commits since last review
    local new_commits=$(git log --oneline "$last_reviewed..HEAD" --pretty=format:"%H|%an|%ad|%s" --date=short)

    if [[ -z "$new_commits" ]]; then
        echo "⏸️  No new commits to review"
        return
    fi

    echo "🔍 Found new commits to review..."

    # Process each new commit
    while IFS='|' read -r sha author date message; do
        echo ""
        echo "📋 Reviewing commit: $sha"
        echo "👤 Author: $author"
        echo "📅 Date: $date"
        echo "💬 Message: $message"

        # Get changed frontend files in this commit
        local changed_files=$(git diff-tree --no-commit-id --name-only -r "$sha" | grep "^frontend/src/.*\.\(ts\|tsx\)$" || true)

        if [[ -z "$changed_files" ]]; then
            echo "   ℹ️  No React/TypeScript files changed in this commit"
            continue
        fi

        echo "   📁 Changed frontend files:"
        echo "$changed_files" | sed 's/^/      /'

        # Analyze each changed file
        local all_violations=()
        while IFS= read -r file; do
            if [[ -f "$file" ]]; then
                echo "   🔍 Analyzing: $file"

                # React hooks analysis
                local hook_violations=($(analyze_react_hooks "$file"))
                all_violations+=("${hook_violations[@]}")

                # TypeScript analysis
                local ts_violations=($(analyze_typescript_quality "$file"))
                all_violations+=("${ts_violations[@]}")
            fi
        done <<< "$changed_files"

        # Run linting check
        local lint_violations=($(run_lint_check))
        all_violations+=("${lint_violations[@]}")

        # Determine code quality rating
        local quality_rating
        if [[ ${#all_violations[@]} -eq 0 ]]; then
            quality_rating="Excellent"
        elif [[ ${#all_violations[@]} -le 3 ]]; then
            quality_rating="Good"
        elif [[ ${#all_violations[@]} -le 8 ]]; then
            quality_rating="Needs Work"
        else
            quality_rating="Poor"
        fi

        # Append to review notes
        {
            echo ""
            echo "#### Commit: ${sha:0:7} - $author - $date"
            echo "**Frontend Review by REACT-SPECIALIST**"
            echo "**Code Quality:** $quality_rating"
            echo ""
            echo "#### React Findings:"

            if [[ ${#all_violations[@]} -eq 0 ]]; then
                echo "✅ No React quality issues detected in this commit"
            else
                local count=1
                for violation in "${all_violations[@]}"; do
                    echo "$count. $violation"
                    ((count++))
                done
            fi

            echo ""
        } >> "$MONITORING_LOG"

        echo "   ✅ Review completed and logged"

    done <<< "$new_commits"

    # Update reviewed commits file
    local latest_commit=$(git rev-parse HEAD)
    echo "$latest_commit" >> "$REVIEWED_COMMITS_FILE"

    echo ""
    echo "📝 Updated last reviewed commit to: ${latest_commit:0:7}"
}

# Main monitoring loop
while true; do
    echo "🔄 $(date '+%Y-%m-%d %H:%M:%S') - Checking for new commits..."
    monitor_commits
    echo "⏳ Waiting 30 seconds before next check..."
    sleep 30
done