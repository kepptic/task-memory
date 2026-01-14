#!/bin/bash
# task-memory-hook.sh - Unified hook for task-memory plugin
#
# Handles all hook events:
# - SessionStart: Display current task context
# - PreToolUse: Refresh context or log research
# - PostToolUse: Remind subtasks or log errors
# - Stop: Verify task completion
#
# https://github.com/kepptic/task-memory | MIT License

set -e

# =============================================================================
# Configuration
# =============================================================================

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
RESEARCH_COUNTER="/tmp/task-memory-research-count"
PROGRESS_COUNTER="/tmp/task-memory-progress-count"

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
NOTES_DIR="$PLANNING_DIR/notes"

# =============================================================================
# Utilities
# =============================================================================

get_current_task() {
    # Returns: TASK_ID|TITLE|COMPLETED|TOTAL or empty
    if [ ! -f "$TASKS_FILE" ]; then
        return
    fi

    # Find in-progress task
    local task_line
    task_line=$(grep -B 20 '\*\*Status\*\*: in-progress' "$TASKS_FILE" 2>/dev/null | grep '^### TASK-' | tail -1)

    if [ -z "$task_line" ]; then
        return
    fi

    # Extract task ID and title
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
        head -5
}

get_counter() {
    local file="$1"
    if [ -f "$file" ]; then
        cat "$file" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

increment_counter() {
    local file="$1"
    local count
    count=$(($(get_counter "$file") + 1))
    echo "$count" > "$file"
    echo "$count"
}

ensure_tasks_structure() {
    mkdir -p "$PLANNING_DIR" "$NOTES_DIR"

    if [ ! -f "$TASKS_FILE" ]; then
        cat > "$TASKS_FILE" << 'TASKS'
# Task Board

<!-- Config: Last Task ID: 000 -->

## Configuration
**Columns**: To Do | In Progress | Done
**Categories**: Feature, Bug, Docs, Research
**Users**: @user
**Tags**: #feature #bug #docs #research

---

## To Do

---

## In Progress

---

## Done

---
TASKS
        echo "Created $TASKS_FILE" >&2
    fi

    if [ ! -f "$PLANNING_DIR/archive.md" ]; then
        cat > "$PLANNING_DIR/archive.md" << 'ARCHIVE'
# Task Archive

> Completed and archived tasks with preserved context.

---
ARCHIVE
        echo "Created $PLANNING_DIR/archive.md" >&2
    fi
}

append_log_entry() {
    local task_id="$1"
    local log_line="$2"
    local section="${3:-Visual Operations Log}"

    if [ ! -f "$TASKS_FILE" ]; then
        return 1
    fi

    # Check if section exists in task
    local task_block
    task_block=$(sed -n "/^### $task_id/,/^---$/p" "$TASKS_FILE" 2>/dev/null)

    if echo "$task_block" | grep -q "^\*\*$section\*\*:"; then
        # Append to existing section - add after the header
        sed -i.bak "/^### $task_id/,/^---$/{
            /^\*\*$section\*\*:/a\\
$log_line
        }" "$TASKS_FILE"
    elif echo "$task_block" | grep -q '^\*\*Notes\*\*:'; then
        # Add new section before ---
        sed -i.bak "/^### $task_id/,/^---$/{
            /^---$/i\\
\\
**$section**:\\
$log_line
        }" "$TASKS_FILE"
    else
        # Add Notes and section before ---
        sed -i.bak "/^### $task_id/,/^---$/{
            /^---$/i\\
\\
**Notes**:\\
\\
**$section**:\\
$log_line
        }" "$TASKS_FILE"
    fi

    rm -f "$TASKS_FILE.bak"
    return 0
}

# =============================================================================
# Event Handlers
# =============================================================================

handle_session_start() {
    local task_info task_id title completed total
    task_info=$(get_current_task)

    echo "" >&2
    echo "============================================================" >&2
    echo "TASK-MEMORY SESSION START" >&2
    echo "============================================================" >&2

    if [ ! -f "$TASKS_FILE" ]; then
        echo "" >&2
        echo "No tasks.md found" >&2
        echo "Will be created when you start working." >&2
        echo "============================================================" >&2
        echo "" >&2
        return
    fi

    if [ -z "$task_info" ]; then
        echo "" >&2
        echo "Planning: $TASKS_FILE" >&2
        echo "" >&2
        echo "No in-progress tasks" >&2
        echo "" >&2
        echo "Create a task with **Status**: in-progress to start" >&2
        echo "============================================================" >&2
        echo "" >&2
        return
    fi

    IFS='|' read -r task_id title completed total <<< "$task_info"

    echo "" >&2
    echo "CURRENT: $task_id | $title" >&2

    if [ "$total" -gt 0 ]; then
        local pct=$((completed * 100 / total))
        local bar_filled=$((pct / 5))
        local bar_empty=$((20 - bar_filled))
        local bar
        bar=$(printf '%*s' "$bar_filled" '' | tr ' ' '#')$(printf '%*s' "$bar_empty" '' | tr ' ' '-')
        echo "" >&2
        echo "Progress: [$bar] $completed/$total" >&2

        echo "" >&2
        echo "Next:" >&2
        get_incomplete_subtasks "$task_id" | while read -r subtask; do
            echo "   - [ ] $subtask" >&2
        done
    fi

    echo "" >&2
    echo "============================================================" >&2
    echo "" >&2
}

handle_pre_tool_use() {
    local tool_name="$1"
    local tool_input="$2"

    case "$tool_name" in
        Write|Edit|Bash)
            # Context refresh
            local task_info task_id title completed total
            task_info=$(get_current_task)

            if [ -z "$task_info" ]; then
                return
            fi

            IFS='|' read -r task_id title completed total <<< "$task_info"

            echo "" >&2
            echo "------------------------------------------------------------" >&2
            echo "TASK: $task_id | $title" >&2
            echo "------------------------------------------------------------" >&2

            if [ "$total" -gt 0 ]; then
                local remaining=$((total - completed))
                echo "" >&2
                echo "Progress: $completed/$total | Remaining:" >&2
                get_incomplete_subtasks "$task_id" | while read -r subtask; do
                    echo "   - [ ] $subtask" >&2
                done
            fi

            echo "------------------------------------------------------------" >&2
            echo "" >&2
            ;;

        WebFetch|WebSearch)
            # Research logging
            ensure_tasks_structure

            local count
            count=$(increment_counter "$RESEARCH_COUNTER")

            local task_info task_id
            task_info=$(get_current_task)

            # Format log entry
            local timestamp log_line
            timestamp=$(date '+%Y-%m-%d %H:%M:%S')

            if [ "$tool_name" = "WebFetch" ]; then
                local url
                url=$(echo "$tool_input" | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | head -1)
                log_line="- $timestamp - WebFetch: $url"
            else
                local query
                query=$(echo "$tool_input" | grep -o '"query"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | head -1)
                log_line="- $timestamp - WebSearch: \"$query\""
            fi

            # Append to task
            if [ -n "$task_info" ]; then
                IFS='|' read -r task_id _ _ _ <<< "$task_info"
                if append_log_entry "$task_id" "$log_line" "Visual Operations Log"; then
                    echo "Logged to $task_id: $log_line" >&2
                fi
            fi

            # 2-Action Rule reminder
            if [ $((count % 2)) -eq 0 ]; then
                echo "" >&2
                echo "============================================================" >&2
                echo "2-ACTION RULE: TIME TO PRESERVE RESEARCH" >&2
                echo "============================================================" >&2
                echo "" >&2
                echo "Operations count: $count" >&2

                if [ -n "$task_info" ]; then
                    IFS='|' read -r task_id _ _ _ <<< "$task_info"
                    echo "Task: $task_id" >&2
                    echo "" >&2
                    echo "Create/update: $NOTES_DIR/$task_id.md" >&2
                else
                    echo "No in-progress task" >&2
                    echo "" >&2
                    echo "Create/update: $NOTES_DIR/TASK-XXX.md" >&2
                fi

                echo "" >&2
                echo "Preserve: observations, decisions, issues, resources" >&2
                echo "============================================================" >&2
                echo "" >&2
            fi
            ;;
    esac
}

handle_post_tool_use() {
    local tool_name="$1"
    local tool_result="$2"

    case "$tool_name" in
        Write|Edit)
            # Subtask reminder every 3rd operation
            local task_info task_id title completed total
            task_info=$(get_current_task)

            if [ -z "$task_info" ]; then
                return
            fi

            IFS='|' read -r task_id title completed total <<< "$task_info"

            if [ "$completed" -eq "$total" ] || [ "$total" -eq 0 ]; then
                return
            fi

            local count
            count=$(increment_counter "$PROGRESS_COUNTER")

            if [ $((count % 3)) -ne 0 ]; then
                return
            fi

            echo "" >&2
            echo "--------------------------------------------------" >&2
            echo "UPDATE SUBTASKS? ($task_id)" >&2
            echo "--------------------------------------------------" >&2
            echo "" >&2
            echo "Mark completed items [x]:" >&2
            get_incomplete_subtasks "$task_id" | while read -r subtask; do
                echo "   - [ ] $subtask" >&2
            done
            echo "" >&2
            echo "Edit: $TASKS_FILE" >&2
            echo "--------------------------------------------------" >&2
            echo "" >&2
            ;;

        Bash)
            # Error logging
            if ! echo "$tool_result" | grep -qi 'error\|failed\|not found\|denied\|exception'; then
                return
            fi

            local task_info task_id
            task_info=$(get_current_task)

            if [ -z "$task_info" ]; then
                return
            fi

            IFS='|' read -r task_id _ _ _ <<< "$task_info"

            # Extract error summary
            local error_msg timestamp log_line
            error_msg=$(echo "$tool_result" | grep -i 'error\|failed\|not found\|denied\|exception' | head -1 | cut -c1-80)
            timestamp=$(date '+%Y-%m-%d %H:%M:%S')
            log_line="- $timestamp - Error: $error_msg"

            if append_log_entry "$task_id" "$log_line" "Errors Log"; then
                echo "" >&2
                echo "Error logged to $task_id" >&2
                echo "   $error_msg" >&2
            fi
            ;;
    esac
}

handle_stop() {
    local task_info task_id title completed total
    task_info=$(get_current_task)

    echo "" >&2
    echo "============================================================" >&2
    echo "TASK COMPLETION CHECK" >&2
    echo "============================================================" >&2

    if [ -z "$task_info" ]; then
        echo "" >&2
        echo "No in-progress tasks" >&2
        echo "============================================================" >&2
        echo "" >&2
        exit 0
    fi

    IFS='|' read -r task_id title completed total <<< "$task_info"

    if [ "$total" -eq 0 ]; then
        echo "" >&2
        echo "$task_id has no subtasks" >&2
        echo "============================================================" >&2
        echo "" >&2
        exit 0
    fi

    if [ "$completed" -eq "$total" ]; then
        echo "" >&2
        echo "✅ $task_id - all $total subtasks complete!" >&2
        echo "" >&2
        echo "⚠️  TASK STILL IN PROGRESS - Please complete:" >&2
        echo "   1. Move task to '## Done' section in tasks.md" >&2
        echo "   2. Change **Status**: in-progress → done" >&2
        echo "   3. Add **Finished**: $(date '+%Y-%m-%d')" >&2
        echo "" >&2
        echo "Edit: $TASKS_FILE" >&2
        echo "============================================================" >&2
        echo "" >&2
        exit 1  # Block until task moved to Done
    fi

    # Incomplete - warn and block
    local remaining=$((total - completed))

    echo "" >&2
    echo "INCOMPLETE: $task_id | $title" >&2
    echo "" >&2
    echo "Progress: $completed/$total" >&2
    echo "" >&2
    echo "Remaining:" >&2
    get_incomplete_subtasks "$task_id" | while read -r subtask; do
        echo "   - [ ] $subtask" >&2
    done
    echo "" >&2
    echo "Complete subtasks before stopping" >&2
    echo "" >&2
    echo "Or move task to 'To Do' if pausing" >&2
    echo "============================================================" >&2
    echo "" >&2

    exit 1  # Block stop
}

# =============================================================================
# Main
# =============================================================================

main() {
    # Read JSON from stdin
    local input
    input=$(cat)

    # Extract hook event and data
    local hook_event tool_name tool_input tool_result
    hook_event=$(echo "$input" | grep -o '"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
    tool_name=$(echo "$input" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
    tool_input=$(echo "$input" | grep -o '"tool_input"[[:space:]]*:[[:space:]]*{[^}]*}' || echo "{}")
    tool_result=$(echo "$input" | grep -o '"tool_result"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' || echo "")

    case "$hook_event" in
        SessionStart)
            handle_session_start
            ;;
        PreToolUse)
            handle_pre_tool_use "$tool_name" "$tool_input"
            ;;
        PostToolUse)
            handle_post_tool_use "$tool_name" "$tool_result"
            ;;
        Stop)
            handle_stop
            ;;
    esac

    exit 0
}

main
