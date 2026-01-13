#!/bin/bash
# skill-eval.sh - Lightweight skill evaluation for task-memory
#
# Detects if prompt is a TASK (activate task context) or QUESTION (pass through).
# Outputs context to stdout for Claude to see.
#
# https://github.com/kepptic/task-memory | MIT License

set -e

# =============================================================================
# Configuration
# =============================================================================

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TASKS_DIR="$PROJECT_DIR/tasks"
KANBAN_FILE="$TASKS_DIR/kanban.md"

# =============================================================================
# Utilities
# =============================================================================

get_current_task() {
    if [ ! -f "$KANBAN_FILE" ]; then
        return
    fi

    local task_line
    task_line=$(grep -B 20 '\*\*Status\*\*: in-progress' "$KANBAN_FILE" 2>/dev/null | grep '^### TASK-' | tail -1)

    if [ -z "$task_line" ]; then
        return
    fi

    local task_id title
    task_id=$(echo "$task_line" | sed 's/### \(TASK-[0-9]*\).*/\1/')
    title=$(echo "$task_line" | sed 's/.*| //')

    echo "$task_id|$title"
}

is_question() {
    local prompt="$1"
    local prompt_lower
    prompt_lower=$(echo "$prompt" | tr '[:upper:]' '[:lower:]')

    # Check for question indicators
    # Starts with question words
    if echo "$prompt_lower" | grep -qE '^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does|explain|describe|tell me|show me|help me understand)\b'; then
        return 0
    fi

    # Ends with question mark
    if echo "$prompt" | grep -qE '\?[[:space:]]*$'; then
        return 0
    fi

    return 1
}

is_task() {
    local prompt="$1"
    local prompt_lower
    prompt_lower=$(echo "$prompt" | tr '[:upper:]' '[:lower:]')

    # Check for task indicators
    # Action verbs at start
    if echo "$prompt_lower" | grep -qE '^(implement|build|create|fix|add|update|modify|change|remove|develop|design|write|make|setup|configure|install|deploy|migrate|upgrade|debug|investigate|resolve|refactor|optimize)\b'; then
        return 0
    fi

    # Task-related keywords anywhere
    if echo "$prompt_lower" | grep -qE '\b(feature|bug|issue|task|ticket|todo|subtask)\b'; then
        return 0
    fi

    # References to files/code
    if echo "$prompt" | grep -qE '\.(ts|tsx|js|jsx|py|md|json|yaml|yml|css|scss|html)\b'; then
        return 0
    fi

    # References to tasks directory
    if echo "$prompt" | grep -qE '\btasks/'; then
        return 0
    fi

    return 1
}

# =============================================================================
# Main
# =============================================================================

main() {
    # Read JSON from stdin
    local input
    input=$(cat)

    # Extract hook event and prompt
    local hook_event prompt
    hook_event=$(echo "$input" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
    prompt=$(echo "$input" | grep -o '"prompt"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | head -1)

    # Only process UserPromptSubmit
    if [ "$hook_event" != "UserPromptSubmit" ]; then
        exit 0
    fi

    # Skip empty or slash commands
    if [ -z "$prompt" ] || echo "$prompt" | grep -qE '^/'; then
        exit 0
    fi

    # Classify prompt
    local prompt_type="UNKNOWN"

    if is_question "$prompt"; then
        prompt_type="QUESTION"
    elif is_task "$prompt"; then
        prompt_type="TASK"
    fi

    # Output context for tasks (stdout goes to Claude)
    if [ "$prompt_type" = "TASK" ]; then
        local task_info task_id title

        echo "============================================================"
        echo "TASK DETECTED - task-memory activated"
        echo "============================================================"

        task_info=$(get_current_task)

        if [ -n "$task_info" ]; then
            IFS='|' read -r task_id title <<< "$task_info"
            echo ""
            echo "Current task: $task_id | $title"
            echo ""
            echo "Instructions:"
            echo "   - Track progress via subtasks in kanban.md"
            echo "   - Log research to Visual Operations Log (auto)"
            echo "   - Create findings file after 2 research operations"
            echo "   - Mark subtasks [x] when complete"
            echo "   - When ALL subtasks done: move task to Done, set Status: done"
        else
            echo ""
            echo "No in-progress task found"
            echo ""
            echo "Consider creating a task in tasks/kanban.md:"
            echo "   ### TASK-XXX | Your task title"
            echo "   **Status**: in-progress"
        fi

        echo "============================================================"
    fi

    # Questions pass through silently

    exit 0
}

main
