#!/bin/bash
# skill-eval.sh - Provides task context for Claude to make decisions
#
# This hook provides current task state on every prompt.
# Claude decides what to do with this context - the script doesn't classify prompts.
#
# https://github.com/kepptic/task-memory | MIT License

set -e

# =============================================================================
# Configuration
# =============================================================================

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Find planning directory with priority:
# 1. .task-memory.json config (explicit mapping)
# 2. Nearest planning/ directory walking up from cwd
# 3. Project root planning/ directory
find_planning_dir() {
    local config_file="$PROJECT_DIR/.task-memory.json"

    # Option C: Check for explicit config
    if [ -f "$config_file" ]; then
        local config_dir
        config_dir=$(grep -o '"planning_dir"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" 2>/dev/null | sed 's/.*"\([^"]*\)"$/\1/' | head -1)
        if [ -n "$config_dir" ]; then
            if [[ "$config_dir" = /* ]]; then
                echo "$config_dir"
            else
                echo "$PROJECT_DIR/$config_dir"
            fi
            return
        fi
    fi

    # Option A: Walk up from current directory to find nearest planning/
    local search_dir="${PWD:-$PROJECT_DIR}"
    while [ "$search_dir" != "/" ] && [[ "$search_dir" == "$PROJECT_DIR"* ]]; do
        if [ -d "$search_dir/planning" ] && [ -f "$search_dir/planning/tasks.md" ]; then
            echo "$search_dir/planning"
            return
        fi
        search_dir=$(dirname "$search_dir")
    done

    # Default: Project root planning/
    echo "$PROJECT_DIR/planning"
}

PLANNING_DIR=$(find_planning_dir)
TASKS_FILE="$PLANNING_DIR/tasks.md"

# =============================================================================
# Utilities
# =============================================================================

get_current_task() {
    if [ ! -f "$TASKS_FILE" ]; then
        return
    fi

    local task_line
    task_line=$(grep -B 20 '\*\*Status\*\*: in-progress' "$TASKS_FILE" 2>/dev/null | grep '^### TASK-' | tail -1)

    if [ -z "$task_line" ]; then
        return
    fi

    local task_id title
    task_id=$(echo "$task_line" | sed 's/### \(TASK-[0-9]*\).*/\1/')
    title=$(echo "$task_line" | sed 's/.*| //')

    # Count subtasks
    local task_block completed total
    task_block=$(sed -n "/^### $task_id/,/^---$/p" "$TASKS_FILE" 2>/dev/null | head -n -1)
    completed=$(echo "$task_block" | grep -c '\- \[x\]' 2>/dev/null) || completed=0
    total=$(echo "$task_block" | grep -c '\- \[.\]' 2>/dev/null) || total=0

    echo "$task_id|$title|$completed|$total"
}

get_incomplete_subtasks() {
    local task_id="$1"
    if [ ! -f "$TASKS_FILE" ]; then
        return
    fi

    sed -n "/^### $task_id/,/^---$/p" "$TASKS_FILE" 2>/dev/null | \
        grep '\- \[ \]' | \
        sed 's/- \[ \] //' | \
        head -3
}

# =============================================================================
# Main
# =============================================================================

main() {
    # Read JSON from stdin
    local input
    input=$(cat)

    # Extract hook event
    local hook_event
    hook_event=$(echo "$input" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

    # Only process UserPromptSubmit
    if [ "$hook_event" != "UserPromptSubmit" ]; then
        exit 0
    fi

    # Skip slash commands
    local prompt
    prompt=$(echo "$input" | grep -o '"prompt"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | head -1)

    if echo "$prompt" | grep -qE '^/'; then
        exit 0
    fi

    # Always provide context - let Claude decide what to do with it
    local task_info task_id title completed total

    task_info=$(get_current_task)

    if [ -n "$task_info" ]; then
        IFS='|' read -r task_id title completed total <<< "$task_info"

        echo "────────────────────────────────────────────────────────────"
        echo "📋 TASK CONTEXT"
        echo "────────────────────────────────────────────────────────────"
        echo ""
        echo "🎯 Current: $task_id | $title"

        if [ "$total" -gt 0 ]; then
            echo "📊 Progress: $completed/$total subtasks"
            echo ""
            echo "Remaining:"
            get_incomplete_subtasks "$task_id" | while read -r subtask; do
                echo "   - [ ] $subtask"
            done
        fi

        echo ""
        echo "📁 Planning: $TASKS_FILE"
        echo "────────────────────────────────────────────────────────────"
    fi

    # No output if no task in progress - that's fine, Claude will work without it

    exit 0
}

main
