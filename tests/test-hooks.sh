#!/bin/bash
# test-hooks.sh - Comprehensive test suite for task-memory-hook.py
#
# Run: ./tests/test-hooks.sh
# Requires: The hook script and a planning/tasks.md file

# NOTE: Do NOT use 'set -e' as it causes early exit on assertion failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOOK_SCRIPT="$PROJECT_ROOT/hooks/task-memory-hook.py"

# Test fixtures directory
FIXTURES_DIR="$SCRIPT_DIR/fixtures"
mkdir -p "$FIXTURES_DIR"

# =============================================================================
# Test Utilities
# =============================================================================

log_test() {
    echo -e "\n${YELLOW}TEST:${NC} $1"
}

log_pass() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
}

log_fail() {
    echo -e "${RED}✗ FAIL:${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
}

assert_contains() {
    local output="$1"
    local expected="$2"
    local test_name="$3"

    if echo "$output" | grep -q "$expected"; then
        log_pass "$test_name"
    else
        log_fail "$test_name - Expected to find: '$expected'"
        echo "  Output snippet: ${output:0:200}..."
    fi
}

assert_exit_code() {
    local actual="$1"
    local expected="$2"
    local test_name="$3"

    if [ "$actual" -eq "$expected" ]; then
        log_pass "$test_name"
    else
        log_fail "$test_name - Expected exit code $expected, got $actual"
    fi
}

# =============================================================================
# Setup and Teardown
# =============================================================================

setup_test_env() {
    export CLAUDE_PROJECT_DIR="$FIXTURES_DIR"
    export CLAUDE_PLUGIN_ROOT="$PROJECT_ROOT"

    # Create test planning directory
    mkdir -p "$FIXTURES_DIR/planning/notes"

    # Clear counters
    rm -f /tmp/task-memory-research-count
    rm -f /tmp/task-memory-progress-count
}

teardown_test_env() {
    rm -rf "$FIXTURES_DIR/planning"
    rm -f /tmp/task-memory-research-count
    rm -f /tmp/task-memory-progress-count
}

create_test_tasks_file() {
    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Last Task ID: 002 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

**Categories**: Feature, Bug, Docs, Research

**Users**: @user

---

## To Do

### TASK-001 | Test Task Todo
**Priority**: High | **Category**: Feature | **Status**: todo | **Assigned**: @user
**Created**: 2026-01-16
**Tags**: #test

A test task in todo status.

**Subtasks**:
- [ ] First subtask
- [ ] Second subtask

**Notes**:

**Errors Log**:

---

## In Progress

### TASK-002 | Test Task In Progress
**Priority**: Medium | **Category**: Bug | **Status**: in-progress | **Assigned**: @user
**Created**: 2026-01-16 | **Started**: 2026-01-16
**Tags**: #test

A test task currently in progress.

**Subtasks**:
- [x] Completed subtask
- [ ] Pending subtask
- [ ] Another pending

**Notes**:

**Visual Operations Log**:

**Errors Log**:

---

## Done

### TASK-000 | Completed Test Task
**Priority**: Low | **Category**: Docs | **Status**: done | **Assigned**: @user
**Created**: 2026-01-15 | **Started**: 2026-01-15 | **Finished**: 2026-01-15
**Tags**: #test

A completed test task.

**Subtasks**:
- [x] Done subtask

**Notes**:

---
EOF
}

create_empty_tasks_file() {
    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Last Task ID: 000 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## To Do

---

## In Progress

---

## Done

---
EOF
}

# =============================================================================
# Hook Tests
# =============================================================================

test_session_start_with_task() {
    log_test "SessionStart with in-progress task"

    create_test_tasks_file

    local output
    output=$(echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "TASK-MEMORY SESSION START" "Header displayed"
    assert_contains "$output" "TASK-002" "Current task ID shown"
    assert_contains "$output" "Test Task In Progress" "Task title shown"
    assert_contains "$output" "1/3" "Progress shown (1 completed, 3 total)"
}

test_session_start_no_tasks() {
    log_test "SessionStart with no in-progress tasks"

    create_empty_tasks_file

    local output
    output=$(echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "TASK-MEMORY SESSION START" "Header displayed"
    assert_contains "$output" "No in-progress tasks" "No task message shown"
}

test_session_start_no_file() {
    log_test "SessionStart with no tasks.md file"

    rm -f "$FIXTURES_DIR/planning/tasks.md"

    local output
    output=$(echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "No tasks.md found" "Missing file message shown"
}

test_pre_tool_use_write() {
    log_test "PreToolUse with Write tool"

    create_test_tasks_file

    local output
    output=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"/test/file.js"}}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "TASK: TASK-002" "Task context shown"
    assert_contains "$output" "Progress: 1/3" "Progress shown"
}

test_pre_tool_use_webfetch() {
    log_test "PreToolUse with WebFetch tool"

    create_test_tasks_file

    local output
    output=$(echo '{"hook_event_name":"PreToolUse","tool_name":"WebFetch","tool_input":{"url":"https://example.com/docs"}}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "Logged to TASK-002" "Research logged"
    assert_contains "$output" "WebFetch: https://example.com/docs" "URL logged"
}

test_pre_tool_use_websearch() {
    log_test "PreToolUse with WebSearch tool"

    create_test_tasks_file

    local output
    output=$(echo '{"hook_event_name":"PreToolUse","tool_name":"WebSearch","tool_input":{"query":"test query"}}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "Logged to TASK-002" "Research logged"
    assert_contains "$output" "WebSearch:" "Query logged"
}

test_2_action_rule() {
    log_test "2-Action Rule triggers after 2 research operations"

    create_test_tasks_file

    # Reset counter
    rm -f /tmp/task-memory-research-count

    # First WebFetch
    echo '{"hook_event_name":"PreToolUse","tool_name":"WebFetch","tool_input":{"url":"https://example.com/1"}}' | "$HOOK_SCRIPT" 2>&1 || true

    # Second WebFetch - should trigger 2-action rule
    local output
    output=$(echo '{"hook_event_name":"PreToolUse","tool_name":"WebFetch","tool_input":{"url":"https://example.com/2"}}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "2-ACTION RULE" "2-Action Rule reminder shown"
}

test_post_tool_use_subtask_reminder() {
    log_test "PostToolUse subtask reminder after 3 write operations"

    create_test_tasks_file

    # Reset counter
    rm -f /tmp/task-memory-progress-count

    # Run 3 write operations
    echo '{"hook_event_name":"PostToolUse","tool_name":"Write","tool_result":"success"}' | "$HOOK_SCRIPT" 2>&1 || true
    echo '{"hook_event_name":"PostToolUse","tool_name":"Write","tool_result":"success"}' | "$HOOK_SCRIPT" 2>&1 || true

    local output
    output=$(echo '{"hook_event_name":"PostToolUse","tool_name":"Write","tool_result":"success"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "UPDATE SUBTASKS?" "Subtask reminder shown"
}

test_post_tool_use_error_logging() {
    log_test "PostToolUse error logging for Bash"

    create_test_tasks_file

    local output
    output=$(echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_result":"Error: Command failed"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "Error logged to TASK-002" "Error logged"
}

test_stop_incomplete_tasks() {
    log_test "Stop event with incomplete subtasks"

    create_test_tasks_file

    local exit_code=0
    local output
    output=$(echo '{"hook_event_name":"Stop"}' | "$HOOK_SCRIPT" 2>&1) || exit_code=$?

    assert_contains "$output" "INCOMPLETE: TASK-002" "Incomplete status shown"
    assert_contains "$output" "Progress: 1/3" "Progress shown"
    assert_exit_code "$exit_code" 1 "Exit code is 1 (blocking)"
}

test_session_end_same_as_stop() {
    log_test "SessionEnd event behaves same as Stop"

    create_test_tasks_file

    local exit_code=0
    local output
    output=$(echo '{"hook_event_name":"SessionEnd"}' | "$HOOK_SCRIPT" 2>&1) || exit_code=$?

    assert_contains "$output" "TASK COMPLETION CHECK" "Completion check shown"
    assert_exit_code "$exit_code" 1 "Exit code is 1 (blocking)"
}

test_multifile_session_start() {
    log_test "Multi-file mode: SessionStart lists tasks from all kanbans"

    local MFROOT="$FIXTURES_DIR/multifile"
    rm -rf "$MFROOT"
    mkdir -p "$MFROOT/docs/todo/api" "$MFROOT/docs/todo/admin" "$MFROOT/docs/todo/public"

    cat > "$MFROOT/.task-memory.json" << 'EOF'
{ "task_files_glob": "docs/todo/*/tasks.md" }
EOF

    local i=1
    for domain in api admin public; do
        cat > "$MFROOT/docs/todo/$domain/tasks.md" << EOF
# $domain Kanban

<!-- Config: Last Task ID: 00$i -->

## In Progress

### TASK-60$i | MF task $domain
**Status**: in-progress

**Subtasks**:
- [x] done
- [ ] pending

---

## Done

---
EOF
        i=$((i+1))
    done

    local output
    output=$(CLAUDE_PROJECT_DIR="$MFROOT" echo '{"hook_event_name":"SessionStart","session_id":"mf-test"}' | CLAUDE_PROJECT_DIR="$MFROOT" "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "TASK-601" "API task listed"
    assert_contains "$output" "TASK-602" "Admin task listed"
    assert_contains "$output" "TASK-603" "Public task listed"
    assert_contains "$output" "(api)" "API file label shown"
    assert_contains "$output" "(admin)" "Admin file label shown"
    assert_contains "$output" "(public)" "Public file label shown"

    rm -rf "$MFROOT"
}

test_checkbox_regex() {
    log_test "Checkbox regex correctly counts [x] and [ ] only"

    # Create a task with various checkbox-like patterns
    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Last Task ID: 001 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## In Progress

### TASK-001 | Regex Test
**Priority**: High | **Category**: Feature | **Status**: in-progress
**Created**: 2026-01-16

**Subtasks**:
- [x] Completed task
- [ ] Pending task
- [a] Not a checkbox (should not count)
- [*] Not a checkbox (should not count)

**Notes**:

---

## Done

---
EOF

    local output
    output=$(echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1) || true

    # Should show 1/2 (1 completed [x], 2 total [x] and [ ])
    assert_contains "$output" "1/2" "Correct subtask count (ignores non-checkboxes)"
}

# =============================================================================
# Run Tests
# =============================================================================

echo "============================================================"
echo "TASK-MEMORY HOOK TESTS"
echo "============================================================"
echo ""
echo "Hook script: $HOOK_SCRIPT"
echo "Fixtures dir: $FIXTURES_DIR"
echo ""

# Verify hook script exists and is executable
if [ ! -f "$HOOK_SCRIPT" ]; then
    echo -e "${RED}ERROR: Hook script not found at $HOOK_SCRIPT${NC}"
    exit 1
fi

if [ ! -x "$HOOK_SCRIPT" ]; then
    echo -e "${YELLOW}WARNING: Hook script not executable, adding +x${NC}"
    chmod +x "$HOOK_SCRIPT"
fi

# Setup
setup_test_env

# Run all tests
test_session_start_with_task
test_session_start_no_tasks
test_session_start_no_file
test_pre_tool_use_write
test_pre_tool_use_webfetch
test_pre_tool_use_websearch
test_2_action_rule
test_post_tool_use_subtask_reminder
test_post_tool_use_error_logging
test_stop_incomplete_tasks
test_session_end_same_as_stop
test_checkbox_regex
test_multifile_session_start

# Teardown
teardown_test_env

# Summary
echo ""
echo "============================================================"
echo "TEST SUMMARY"
echo "============================================================"
echo ""
echo "Total:  $TESTS_RUN"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ "$TESTS_FAILED" -gt 0 ]; then
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
