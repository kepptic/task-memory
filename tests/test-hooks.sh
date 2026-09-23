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

    # Clear counters. NOTE: the hook's actual counter files live under
    # STATE_DIR (PROJECT_DIR/.claude/state/task-memory/{research,progress}-count),
    # NOT /tmp — the /tmp paths below are stale (pre-date STATE_DIR moving
    # under the project dir) and are kept only so any old local /tmp state
    # from a prior plugin version gets swept too. Without also clearing the
    # real path, PROGRESS_COUNTER accumulates across every invocation of this
    # script (teardown never deleted .claude/), which made
    # test_post_tool_use_subtask_reminder's "3rd call triggers" assertion
    # flaky the moment any OTHER test also incremented it (e.g. a PostToolUse
    # Edit in a TASK-017 reorganize test) and drifted the running total off
    # a multiple of 3.
    rm -f /tmp/task-memory-research-count
    rm -f /tmp/task-memory-progress-count
    rm -rf "$FIXTURES_DIR/.claude/state/task-memory"
}

teardown_test_env() {
    rm -rf "$FIXTURES_DIR/planning"
    rm -rf "$FIXTURES_DIR/owner"
    rm -f /tmp/task-memory-research-count
    rm -f /tmp/task-memory-progress-count
    rm -rf "$FIXTURES_DIR/.claude"
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

# TASK-017: fixture with a namespaced-prefix in-progress task (TASK-GR-678,
# 1/2 subtasks, with a Visual Operations Log entry so precompact append has
# something to append) plus a legacy done task (TASK-676), to exercise the
# widened TASK_ID_CORE grammar across session-start, note routing,
# precompact, and reorganize.
create_prefixed_tasks_file() {
    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 678 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

**Categories**: Feature, Bug, Docs, Research

**Users**: @user

---

## To Do

---

## In Progress

### TASK-GR-678 | Prefixed task in progress
**Priority**: High | **Category**: Feature | **Status**: in-progress | **Assigned**: @user
**Created**: 2026-01-16 | **Started**: 2026-01-16
**Tags**: #test

A prefixed (namespaced) task currently in progress.

**Subtasks**:
- [x] Completed subtask
- [ ] Pending subtask

**Notes**:

**Visual Operations Log**:
- 2026-01-16 10:00:00 - WebFetch: https://example.com/prior-research

**Errors Log**:

---

## Done

### TASK-676 | Legacy done task
**Priority**: Low | **Category**: Docs | **Status**: done | **Assigned**: @user
**Created**: 2026-01-15 | **Started**: 2026-01-15 | **Finished**: 2026-01-15
**Tags**: #test

A completed legacy (unprefixed) task, sitting right next to prefixed ones.

**Subtasks**:
- [x] Done subtask

**Notes**:

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
    log_test "PreToolUse with Edit tool (task-relevant — touches tasks.md)"

    create_test_tasks_file

    # v3.3+ relevance gating: context banner only appears when the tool use
    # actually touches the task. Editing tasks.md itself is clearly relevant.
    # (Using Edit instead of Write because Write on tasks.md is correctly
    # blocked by the anti-clobber guard.)
    local input
    input=$(printf '{"hook_event_name":"PreToolUse","tool_name":"Edit","session_id":"prewrite-test","tool_input":{"file_path":"%s/planning/tasks.md","old_string":"x","new_string":"y"}}' "$FIXTURES_DIR")
    local output
    output=$(echo "$input" | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "TASK: TASK-002" "Task context shown"
    assert_contains "$output" "Progress: 1/3" "Progress shown"
}

# Research logging is a PostToolUse concern — it captures the FINDING, so it
# has to run after the tool. These asserted on PreToolUse until v3.7.0 and had
# been failing since 3.0.
test_post_tool_use_webfetch() {
    log_test "PostToolUse with WebFetch tool logs the URL to the current task"

    create_test_tasks_file

    local output
    output=$(echo '{"hook_event_name":"PostToolUse","tool_name":"WebFetch","tool_input":{"url":"https://example.com/docs"},"tool_response":"fetched"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "Logged to TASK-002" "Research logged"
    assert_contains "$output" "WebFetch: https://example.com/docs" "URL logged"
}

test_post_tool_use_websearch() {
    log_test "PostToolUse with WebSearch tool logs the query to the current task"

    create_test_tasks_file

    local output
    output=$(echo '{"hook_event_name":"PostToolUse","tool_name":"WebSearch","tool_input":{"query":"test query"},"tool_response":"results"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "Logged to TASK-002" "Research logged"
    assert_contains "$output" "WebSearch:" "Query logged"
}

test_2_action_rule() {
    log_test "2-Action Rule triggers after 2 research operations"

    create_test_tasks_file
    rm -f "$FIXTURES_DIR/.claude/state/task-memory/research-count"

    # Two DIFFERENT urls: identical entries are deduped since v3.7.0, but the
    # research counter increments either way.
    echo '{"hook_event_name":"PostToolUse","tool_name":"WebFetch","tool_input":{"url":"https://example.com/1"},"tool_response":"a"}' | "$HOOK_SCRIPT" 2>&1 || true

    local output
    output=$(echo '{"hook_event_name":"PostToolUse","tool_name":"WebFetch","tool_input":{"url":"https://example.com/2"},"tool_response":"b"}' | "$HOOK_SCRIPT" 2>&1) || true

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

# Stop signals a block with {"decision":"block"} on stdout and exit 0 — the
# exit-1 protocol and the "INCOMPLETE:" / "TASK COMPLETION CHECK" banners were
# removed in 3.0. It also needs the session to have actually engaged with the
# task (v3.3 relevance gate + engagement threshold).
test_stop_incomplete_tasks() {
    log_test "Stop event with incomplete subtasks blocks with JSON"

    create_test_tasks_file
    reset_v33_state

    local sid="stop-incomplete-session"
    for _ in 1 2 3 4; do
        echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep TASK-002 planning/tasks.md"}}' \
            | "$HOOK_SCRIPT" 2>&1 || true
    done

    local exit_code=0
    local output
    output=$(echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' | "$HOOK_SCRIPT" 2>&1) || exit_code=$?

    assert_contains "$output" '"decision": "block"' "Stop emits a block decision"
    assert_contains "$output" "TASK-002 has 2 incomplete subtasks" "Block reason names the task and the remaining count"
    assert_exit_code "$exit_code" 0 "Exit code is 0 (block is signalled via JSON, not exit status)"
}

test_session_end_never_blocks() {
    log_test "SessionEnd flushes state and never blocks"

    create_test_tasks_file
    reset_v33_state

    local sid="session-end-session"
    echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep TASK-002 planning/tasks.md"}}' \
        | "$HOOK_SCRIPT" 2>&1 || true

    local exit_code=0
    local output
    output=$(echo '{"hook_event_name":"SessionEnd","session_id":"'"$sid"'"}' | "$HOOK_SCRIPT" 2>&1) || exit_code=$?

    if echo "$output" | grep -q '"decision"'; then
        log_fail "SessionEnd must never emit a decision - got: ${output:0:120}"
    else
        log_pass "SessionEnd emits no decision"
    fi
    assert_exit_code "$exit_code" 0 "Exit code is 0"

    if [ -f "$FIXTURES_DIR/.claude/state/task-memory/session-$sid.txt" ]; then
        log_fail "SessionEnd left the session stamp behind"
    else
        log_pass "SessionEnd removed the session stamp"
    fi
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

# =============================================================================
# TASK-020 — warn when task_files_glob is set but planning_dir is not
# =============================================================================

test_planning_dir_warning_missing() {
    log_test "TASK-020: SessionStart warns when task_files_glob is set but planning_dir is not"

    local PDROOT="$FIXTURES_DIR/planning-dir-warn-missing"
    rm -rf "$PDROOT"
    mkdir -p "$PDROOT/docs/todo/api"

    cat > "$PDROOT/.task-memory.json" << 'EOF'
{ "task_files_glob": "docs/todo/*/tasks.md" }
EOF

    cat > "$PDROOT/docs/todo/api/tasks.md" << 'EOF'
# api Kanban

<!-- Config: Last Task ID: 001 -->

## In Progress

---

## Done

---
EOF

    local output
    output=$(CLAUDE_PROJECT_DIR="$PDROOT" "$HOOK_SCRIPT" <<< '{"hook_event_name":"SessionStart","session_id":"pd-warn-test"}' 2>&1) || true

    assert_contains "$output" "task_files_glob is set but planning_dir is not" "Warning printed when planning_dir is absent from config"
    assert_contains "$output" "planning_dir" "Warning mentions planning_dir as the fix"

    rm -rf "$PDROOT"
}

test_planning_dir_warning_control_no_warning() {
    log_test "TASK-020: control — no warning when planning_dir IS set alongside task_files_glob"

    local PDROOT="$FIXTURES_DIR/planning-dir-warn-control"
    rm -rf "$PDROOT"
    mkdir -p "$PDROOT/docs/todo/api"

    cat > "$PDROOT/.task-memory.json" << 'EOF'
{ "task_files_glob": "docs/todo/*/tasks.md", "planning_dir": "docs/todo" }
EOF

    cat > "$PDROOT/docs/todo/api/tasks.md" << 'EOF'
# api Kanban

<!-- Config: Last Task ID: 001 -->

## In Progress

---

## Done

---
EOF

    local output
    output=$(CLAUDE_PROJECT_DIR="$PDROOT" "$HOOK_SCRIPT" <<< '{"hook_event_name":"SessionStart","session_id":"pd-warn-control"}' 2>&1) || true

    if echo "$output" | grep -q "task_files_glob is set but planning_dir is not"; then
        log_fail "No warning expected when planning_dir is set - Warning was printed unexpectedly"
    else
        log_pass "No warning expected when planning_dir is set"
    fi

    rm -rf "$PDROOT"
}

# =============================================================================
# TASK-017 — namespaced (initials-prefixed) task ids
# =============================================================================

test_prefixed_session_start() {
    log_test "TASK-017: SessionStart shows a namespaced task id and its own progress"

    create_prefixed_tasks_file

    local output
    output=$(echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "TASK-MEMORY SESSION START" "Header displayed"
    assert_contains "$output" "TASK-GR-678" "Prefixed task id shown"
    assert_contains "$output" "Prefixed task in progress" "Task title shown"
    assert_contains "$output" "1/2" "Progress shown (1 completed, 2 total)"
}

test_mixed_block_termination() {
    log_test "TASK-017: consecutive legacy + prefixed blocks each report their own counts (NEXT_SECTION_RE tripwire)"

    local MFROOT="$FIXTURES_DIR/mixed-termination"
    rm -rf "$MFROOT"
    mkdir -p "$MFROOT/docs/todo/proj"

    cat > "$MFROOT/.task-memory.json" << 'EOF'
{ "task_files_glob": "docs/todo/*/tasks.md" }
EOF

    # No blank line / section header between the two task headings — before
    # TASK-017's regex widening, TASK-676's block would have swallowed
    # TASK-GR-677 whole (NEXT_SECTION_RE never recognized "### TASK-GR-677"
    # as a boundary, and the old TASK_HEADING_RE never matched it as a
    # heading at all).
    cat > "$MFROOT/docs/todo/proj/tasks.md" << 'EOF'
# proj Kanban

<!-- Config: Task Prefix: GR | Last Task ID: 677 -->

## In Progress

### TASK-676 | Legacy block immediately followed by a prefixed one
**Status**: in-progress

**Subtasks**:
- [ ] pending only
### TASK-GR-677 | Prefixed block, no section header before it
**Status**: in-progress

**Subtasks**:
- [x] done one
- [ ] pending one

---

## Done

---
EOF

    local output
    output=$(CLAUDE_PROJECT_DIR="$MFROOT" echo '{"hook_event_name":"SessionStart"}' | CLAUDE_PROJECT_DIR="$MFROOT" "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "TASK-676" "Legacy block listed"
    assert_contains "$output" "TASK-GR-677" "Prefixed block listed"
    assert_contains "$output" "[0/1]" "Legacy block reports its own 0/1 (not absorbed into the next block)"
    assert_contains "$output" "[1/2]" "Prefixed block reports its own 1/2 (not absorbed by the previous block)"

    rm -rf "$MFROOT"
}

test_prefixed_notes_skeleton() {
    log_test "TASK-017: a notes skeleton is created for a namespaced task id"

    create_prefixed_tasks_file
    reset_v33_state
    rm -f "$FIXTURES_DIR/planning/notes/TASK-GR-678.md"
    cat > "$FIXTURES_DIR/.task-memory.json" << 'EOF'
{ "notes_skeleton": "session-start" }
EOF

    echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1 > /dev/null || true
    rm -f "$FIXTURES_DIR/.task-memory.json"

    if [ -f "$FIXTURES_DIR/planning/notes/TASK-GR-678.md" ]; then
        log_pass "notes skeleton created at planning/notes/TASK-GR-678.md"
    else
        log_fail "notes skeleton not created at planning/notes/TASK-GR-678.md"
    fi
}

test_prefixed_note_logging() {
    log_test "TASK-017: PostToolUse WebFetch logs research to a namespaced task id"

    create_prefixed_tasks_file

    local output
    output=$(echo '{"hook_event_name":"PostToolUse","tool_name":"WebFetch","tool_input":{"url":"https://example.com/docs"},"tool_response":"some fetched content"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "Logged to TASK-GR-678" "Research logged to prefixed task id"
    assert_contains "$output" "WebFetch: https://example.com/docs" "URL logged"
}

test_prefixed_precompact() {
    log_test "TASK-017: PreCompact writes a prefixed snapshot filename and appends the ops log"

    create_prefixed_tasks_file
    rm -f "$FIXTURES_DIR/planning/notes/TASK-GR-678"*.md
    rm -rf "$FIXTURES_DIR/planning/notes/archive"

    local output
    output=$(echo '{"hook_event_name":"PreCompact","trigger":"manual"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "Pre-compact snapshot:" "Snapshot message shown"

    # v3.7.0: snapshots land under planning/notes/archive/ (precompact_dir).
    local snapshot
    snapshot=$(ls "$FIXTURES_DIR/planning/notes/archive/TASK-GR-678-precompact-"*.md 2>/dev/null | head -1)
    if [ -n "$snapshot" ] && [ -f "$snapshot" ]; then
        log_pass "precompact snapshot written with the prefixed id in its filename"
    else
        log_fail "precompact snapshot not found for prefixed task id (looked for TASK-GR-678-precompact-*.md)"
    fi

    if [ -f "$FIXTURES_DIR/planning/notes/TASK-GR-678.md" ]; then
        local content
        content=$(cat "$FIXTURES_DIR/planning/notes/TASK-GR-678.md")
        assert_contains "$content" "Pre-Compact Ops Log" "Ops log appended to the prefixed task's notes file"
    else
        log_fail "notes file for prefixed id missing after precompact"
    fi
}

test_reorg_mixed() {
    log_test "TASK-017: reorganize moves a prefixed done-block out of In Progress; legacy in-progress block stays"

    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 678 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## To Do

---

## In Progress

### TASK-GR-678 | Prefixed task actually done
**Status**: done

**Subtasks**:
- [x] only one

### TASK-676 | Legacy task correctly in progress
**Status**: in-progress

**Subtasks**:
- [ ] pending

---

## Done

---
EOF

    local input
    input=$(printf '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"%s/planning/tasks.md"}}' "$FIXTURES_DIR")
    echo "$input" | "$HOOK_SCRIPT" > /dev/null 2>&1 || true

    local done_section in_progress_section
    done_section=$(awk '/^## Done/{flag=1} flag' "$FIXTURES_DIR/planning/tasks.md")
    in_progress_section=$(awk '/^## In Progress/{flag=1} /^## Done/{flag=0} flag' "$FIXTURES_DIR/planning/tasks.md")

    if echo "$done_section" | grep -q "TASK-GR-678"; then
        log_pass "prefixed done-block moved into the Done section"
    else
        log_fail "prefixed done-block was NOT moved into the Done section"
    fi

    if echo "$in_progress_section" | grep -q "TASK-676" && ! echo "$in_progress_section" | grep -q "TASK-GR-678"; then
        log_pass "legacy in-progress block stayed in In Progress; prefixed block left"
    else
        log_fail "In Progress section content unexpected after reorganize"
    fi
}

test_reorg_gate_prefixed_filename() {
    log_test "TASK-017: reorg gate (widened to .md) reorganizes a configured tasks-gr.md, ignores an unconfigured random.md"

    local MFROOT="$FIXTURES_DIR/reorg-gate"
    rm -rf "$MFROOT"
    mkdir -p "$MFROOT/planning"

    cat > "$MFROOT/.task-memory.json" << 'EOF'
{ "task_files_glob": "planning/tasks-gr.md" }
EOF

    cat > "$MFROOT/planning/tasks-gr.md" << 'EOF'
# GR Kanban

<!-- Config: Task Prefix: GR | Last Task ID: 678 -->

## To Do

## In Progress

### TASK-GR-678 | Actually done, still filed under In Progress
**Status**: done

**Subtasks**:
- [x] one

## Done

EOF

    cat > "$MFROOT/planning/random.md" << 'EOF'
# Not a configured task file

## In Progress

### TASK-GR-900 | Should never be touched by the hook
**Status**: done

**Subtasks**:
- [x] one

## Done

EOF

    # Write on the configured per-dev file -> reorganizes.
    local input_gr
    input_gr=$(printf '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"%s/planning/tasks-gr.md"}}' "$MFROOT")
    echo "$input_gr" | CLAUDE_PROJECT_DIR="$MFROOT" "$HOOK_SCRIPT" > /dev/null 2>&1 || true

    local gr_done_section
    gr_done_section=$(awk '/^## Done/{flag=1} flag' "$MFROOT/planning/tasks-gr.md")
    if echo "$gr_done_section" | grep -q "TASK-GR-678"; then
        log_pass "configured tasks-gr.md was reorganized (gate widened to .md)"
    else
        log_fail "configured tasks-gr.md was NOT reorganized"
    fi

    # Write on an UNCONFIGURED file -> must NOT reorganize (membership check
    # via task_files() still holds even though the suffix gate is now any .md).
    local input_random
    input_random=$(printf '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"%s/planning/random.md"}}' "$MFROOT")
    echo "$input_random" | CLAUDE_PROJECT_DIR="$MFROOT" "$HOOK_SCRIPT" > /dev/null 2>&1 || true

    local random_done_section
    random_done_section=$(awk '/^## Done/{flag=1} flag' "$MFROOT/planning/random.md")
    if echo "$random_done_section" | grep -q "TASK-GR-900"; then
        log_fail "unconfigured random.md was incorrectly reorganized"
    else
        log_pass "unconfigured random.md was left untouched"
    fi

    rm -rf "$MFROOT"
}

test_malformed_heading_ignored() {
    log_test "TASK-017: malformed heading TASK-GR-12X is never treated as a task (tail boundary)"

    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 12 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## To Do

---

## In Progress

### TASK-GR-12X | Malformed id, should never parse as a task
**Status**: in-progress

**Subtasks**:
- [ ] should not be counted anywhere

---

## Done

---
EOF

    local output
    output=$(echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1) || true

    # Despite "**Status**: in-progress", TASK-GR-12X's heading never matches
    # TASK_HEADING_RE (tail-bounded), so it's never yielded as a task block —
    # SessionStart must report no in-progress tasks at all.
    assert_contains "$output" "No in-progress tasks" "Malformed heading produced no parsed task"
}

test_stop_block_prefixed() {
    log_test "TASK-017: Stop-block JSON names the prefixed task id"

    create_prefixed_tasks_file
    reset_v33_state

    local sid="prefixed-stop-session"

    # Emit enough relevant engagements to pass the v3.3 threshold (3).
    for _ in 1 2 3 4; do
        echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep TASK-GR-678 planning/tasks.md"}}' \
            | "$HOOK_SCRIPT" 2>&1 || true
    done

    local output
    output=$(echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' \
        | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" '"decision": "block"' "Stop blocks after relevant engagement on a prefixed task"
    assert_contains "$output" "TASK-GR-678" "Block JSON names the prefixed task id"
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
# v3.3.0 Tests — relevance gating, sticky release, engagement threshold
# =============================================================================

# Helper: reset all v3.3 session state between tests so we get a clean slate.
reset_v33_state() {
    local state_dir="$FIXTURES_DIR/.claude/state/task-memory"
    [ -d "$state_dir" ] || return 0
    rm -f "$state_dir"/session-*.txt "$state_dir"/stop-blocks-*.txt \
          "$state_dir"/released-*.flag "$state_dir"/engagement-*.txt \
          "$state_dir"/off-topic-*.flag 2>/dev/null || true
}

test_stamping_scoped_to_relevant_tool_use() {
    log_test "v3.3: ambient Bash does NOT stamp session as worked-on"

    create_test_tasks_file
    reset_v33_state

    local sid="scope-test-session"

    # Unrelated Bash call — should NOT trigger the Stop block, because the
    # command doesn't mention TASK-002 or any path in the task block.
    echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"ls /tmp"}}' \
        | "$HOOK_SCRIPT" 2>&1 || true

    # Now fire Stop. If the ambient Bash stamped us, this would block.
    local output
    output=$(echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' \
        | "$HOOK_SCRIPT" 2>&1) || true

    # Expect NO blocking JSON — empty stdout is fine.
    if echo "$output" | grep -q '"decision": "block"'; then
        log_fail "ambient Bash should not cause Stop block (got blocking JSON)"
    else
        log_pass "ambient Bash did not stamp session"
    fi
}

test_stamping_stamps_on_task_id_in_bash() {
    log_test "v3.3: Bash command mentioning task id DOES stamp"

    create_test_tasks_file
    reset_v33_state

    local sid="stamp-test-session"

    # Emit enough engagements to pass the threshold (3 by default).
    for _ in 1 2 3 4; do
        echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep TASK-002 planning/tasks.md"}}' \
            | "$HOOK_SCRIPT" 2>&1 || true
    done

    local output
    output=$(echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' \
        | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" '"decision": "block"' "Stop blocks after relevant engagement"
    assert_contains "$output" "TASK-002" "Block message names the task"
}

test_engagement_threshold_releases_short_sessions() {
    log_test "v3.3: Stop does not block when engagement < threshold"

    create_test_tasks_file
    reset_v33_state

    local sid="short-session"

    # One relevant tool use — below the default threshold of 3.
    echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep TASK-002 planning/tasks.md"}}' \
        | "$HOOK_SCRIPT" 2>&1 || true

    local output
    output=$(echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' \
        | "$HOOK_SCRIPT" 2>&1) || true

    if echo "$output" | grep -q '"decision": "block"'; then
        log_fail "short engagement should not block Stop"
    else
        log_pass "short engagement released with warning"
    fi
    assert_contains "$output" "Not blocking" "Warning mentions non-blocking behavior"
}

test_off_topic_flag_disables_blocking() {
    log_test "v3.3: off-topic flag disables Stop blocking for the session"

    create_test_tasks_file
    reset_v33_state

    local sid="off-topic-session"
    local state_dir="$FIXTURES_DIR/.claude/state/task-memory"
    mkdir -p "$state_dir"

    # Accumulate enough engagements to pass threshold (would normally block).
    for _ in 1 2 3 4; do
        echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep TASK-002 planning/tasks.md"}}' \
            | "$HOOK_SCRIPT" 2>&1 || true
    done

    # Drop the off-topic flag.
    touch "$state_dir/off-topic-$sid.flag"

    local output
    output=$(echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' \
        | "$HOOK_SCRIPT" 2>&1) || true

    if echo "$output" | grep -q '"decision": "block"'; then
        log_fail "off-topic flag should have disabled blocking"
    else
        log_pass "off-topic flag suppressed Stop block"
    fi
}

test_sticky_release_after_max_blocks() {
    log_test "v3.3: release flag is written after MAX_STOP_BLOCKS; subsequent Stops don't re-nag"

    create_test_tasks_file
    reset_v33_state

    local sid="sticky-session"

    # Accumulate engagements.
    for _ in 1 2 3 4; do
        echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep TASK-002 planning/tasks.md"}}' \
            | "$HOOK_SCRIPT" 2>&1 || true
    done

    # Trigger the block cycle: 1st block → counter=1, 2nd block → counter=2,
    # 3rd Stop sees counter>=MAX and releases.
    echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' | "$HOOK_SCRIPT" 2>&1 > /dev/null || true
    echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' | "$HOOK_SCRIPT" 2>&1 > /dev/null || true
    echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' | "$HOOK_SCRIPT" 2>&1 > /dev/null || true

    local state_dir="$FIXTURES_DIR/.claude/state/task-memory"
    if [ -f "$state_dir/released-$sid-TASK-002.flag" ]; then
        log_pass "released flag was written"
    else
        log_fail "released flag missing at $state_dir/released-$sid-TASK-002.flag"
    fi

    # Next Stop should be silent — no blocking JSON.
    local output
    output=$(echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' \
        | "$HOOK_SCRIPT" 2>&1) || true
    if echo "$output" | grep -q '"decision": "block"'; then
        log_fail "sticky release should have suppressed subsequent block"
    else
        log_pass "subsequent Stop suppressed by release flag"
    fi
}

test_session_start_no_skeleton_under_on_start() {
    log_test "v3.7: SessionStart creates NO notes skeleton under the default on-start policy"

    create_test_tasks_file
    reset_v33_state
    rm -f "$FIXTURES_DIR/planning/notes/TASK-002.md"
    rm -f "$FIXTURES_DIR/.task-memory.json"

    echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1 > /dev/null || true

    if [ -f "$FIXTURES_DIR/planning/notes/TASK-002.md" ]; then
        log_fail "SessionStart created a skeleton under notes_skeleton=on-start"
    else
        log_pass "SessionStart created no skeleton under notes_skeleton=on-start"
    fi
}

test_session_start_skeleton_under_session_start_policy() {
    log_test "v3.7: notes_skeleton=session-start restores pre-3.7 SessionStart skeleton creation"

    create_test_tasks_file
    reset_v33_state
    rm -f "$FIXTURES_DIR/planning/notes/TASK-002.md"
    cat > "$FIXTURES_DIR/.task-memory.json" << 'EOF'
{ "notes_skeleton": "session-start" }
EOF

    echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1 > /dev/null || true

    if [ -f "$FIXTURES_DIR/planning/notes/TASK-002.md" ]; then
        log_pass "notes skeleton created on SessionStart under the session-start policy"
        local content
        content=$(cat "$FIXTURES_DIR/planning/notes/TASK-002.md")
        assert_contains "$content" "Patterns Discovered" "Skeleton has Patterns section"
        assert_contains "$content" "Gotchas" "Skeleton has Gotchas section"
        assert_contains "$content" "Decisions" "Skeleton has Decisions section"
    else
        log_fail "notes skeleton not created under notes_skeleton=session-start"
    fi

    rm -f "$FIXTURES_DIR/.task-memory.json"
}

test_session_start_gcs_stale_state() {
    log_test "v3.3: SessionStart GCs session-state files older than 24h"

    create_test_tasks_file
    reset_v33_state

    local state_dir="$FIXTURES_DIR/.claude/state/task-memory"
    mkdir -p "$state_dir"

    # Fresh file — should survive GC.
    local fresh="$state_dir/session-fresh.txt"
    echo "TASK-002" > "$fresh"

    # Stale file — 48h old, should be collected.
    local stale="$state_dir/session-stale.txt"
    echo "TASK-002" > "$stale"
    touch -t "$(date -v-48H +%Y%m%d%H%M 2>/dev/null || date -d '-48 hours' +%Y%m%d%H%M)" "$stale"

    echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1 > /dev/null || true

    if [ -f "$fresh" ]; then
        log_pass "fresh session file preserved"
    else
        log_fail "fresh session file was incorrectly GC'd"
    fi

    if [ ! -f "$stale" ]; then
        log_pass "stale session file GC'd"
    else
        log_fail "stale session file survived GC"
    fi
}

# =============================================================================
# ADO bridge (TASK-019) — ANY_ID_CORE widening exercised via the hook.
# Mirrors the TASK-017 prefixed-id fixtures above, but with `### ADO-<n>`
# headings, to prove notes routing, precompact, Stop-gate, stamping, and
# reorganize all fall out of the single ANY_ID_CORE regex change (no other
# hook code was touched — see PLAN-ado.md §3.1).
# =============================================================================

# Fixture: one ADO-synced in-progress task (1/2 subtasks, one Visual Ops Log
# entry, Sprint/ADO fields present) plus a legacy done task sitting right
# next to it, to exercise the widened grammar across every hook code path.
create_ado_tasks_file() {
    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Last Task ID: 000 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

**Categories**: Feature, Bug, Docs, Research

**Users**: @user

---

## To Do

---

## In Progress

### ADO-12345 | ADO task in progress
**Priority**: High | **Category**: Feature | **Status**: in-progress | **Assigned**: @user
**Created**: 2026-01-16 | **Started**: 2026-01-16
**Sprint**: Sprint 42 | **ADO**: https://dev.azure.com/org/proj/_workitems/edit/12345
**Tags**: #test

A synced Azure DevOps task currently in progress.

**Subtasks**:
- [x] Completed subtask
- [ ] Pending subtask

**Notes**:

**Visual Operations Log**:
- 2026-01-16 10:00:00 - WebFetch: https://example.com/prior-research

**Errors Log**:

---

## Done

### TASK-676 | Legacy done task
**Priority**: Low | **Category**: Docs | **Status**: done | **Assigned**: @user
**Created**: 2026-01-15 | **Started**: 2026-01-15 | **Finished**: 2026-01-15
**Tags**: #test

A completed legacy (unprefixed) task, sitting right next to an ADO-synced one.

**Subtasks**:
- [x] Done subtask

**Notes**:

---
EOF
}

test_ado_session_start() {
    log_test "TASK-019: SessionStart shows an ADO work-item id and its own progress"

    create_ado_tasks_file
    reset_v33_state
    rm -f "$FIXTURES_DIR/planning/notes/ADO-12345.md"

    local output
    output=$(echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "TASK-MEMORY SESSION START" "Header displayed"
    assert_contains "$output" "ADO-12345" "ADO task id shown"
    assert_contains "$output" "ADO task in progress" "Task title shown"
    assert_contains "$output" "1/2" "Progress shown (1 completed, 2 total)"
}

test_ado_mixed_block_termination() {
    log_test "TASK-019: consecutive TASK-676 / ADO-12345 / TASK-GR-9 blocks each report their own counts (NEXT_SECTION_RE tripwire)"

    local MFROOT="$FIXTURES_DIR/ado-mixed-termination"
    rm -rf "$MFROOT"
    mkdir -p "$MFROOT/docs/todo/proj"

    cat > "$MFROOT/.task-memory.json" << 'EOF'
{ "task_files_glob": "docs/todo/*/tasks.md" }
EOF

    # No blank line / section header between the three headings — proves
    # NEXT_SECTION_RE recognizes "### ADO-12345" as a boundary between a
    # legacy TASK block and a following prefixed TASK block, in both
    # directions, without absorbing either neighbor's subtasks.
    cat > "$MFROOT/docs/todo/proj/tasks.md" << 'EOF'
# proj Kanban

<!-- Config: Task Prefix: GR | Last Task ID: 9 -->

## In Progress

### TASK-676 | Legacy block immediately followed by an ADO block
**Status**: in-progress

**Subtasks**:
- [ ] pending only
### ADO-12345 | ADO block sandwiched between two TASK blocks
**Status**: in-progress

**Subtasks**:
- [x] done one
- [ ] pending one
### TASK-GR-9 | Prefixed block immediately following an ADO block
**Status**: in-progress

**Subtasks**:
- [x] a
- [x] b
- [ ] c

---

## Done

---
EOF

    local output
    output=$(CLAUDE_PROJECT_DIR="$MFROOT" echo '{"hook_event_name":"SessionStart"}' | CLAUDE_PROJECT_DIR="$MFROOT" "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "TASK-676" "Legacy block listed"
    assert_contains "$output" "ADO-12345" "ADO block listed"
    assert_contains "$output" "TASK-GR-9" "Prefixed block listed"
    assert_contains "$output" "[0/1]" "Legacy block reports its own 0/1 (not absorbed into the ADO block)"
    assert_contains "$output" "[1/2]" "ADO block reports its own 1/2 (not absorbed by either neighbor)"
    assert_contains "$output" "[2/3]" "Trailing prefixed block reports its own 2/3 (not absorbed by the ADO block)"

    rm -rf "$MFROOT"
}

test_ado_reorg() {
    log_test "TASK-019: reorganize moves an ADO done-block out of In Progress into Done; legacy in-progress block stays (mirrors test_reorg_mixed)"

    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Last Task ID: 000 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## To Do

---

## In Progress

### ADO-12345 | ADO task actually done
**Status**: done

**Subtasks**:
- [x] only one

### TASK-676 | Legacy task correctly in progress
**Status**: in-progress

**Subtasks**:
- [ ] pending

---

## Done

---
EOF

    local input
    input=$(printf '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"%s/planning/tasks.md"}}' "$FIXTURES_DIR")
    echo "$input" | "$HOOK_SCRIPT" > /dev/null 2>&1 || true

    local done_section in_progress_section
    done_section=$(awk '/^## Done/{flag=1} flag' "$FIXTURES_DIR/planning/tasks.md")
    in_progress_section=$(awk '/^## In Progress/{flag=1} /^## Done/{flag=0} flag' "$FIXTURES_DIR/planning/tasks.md")

    if echo "$done_section" | grep -q "ADO-12345"; then
        log_pass "ADO done-block moved into the Done section"
    else
        log_fail "ADO done-block was NOT moved into the Done section"
    fi

    if echo "$in_progress_section" | grep -q "TASK-676" && ! echo "$in_progress_section" | grep -q "ADO-12345"; then
        log_pass "legacy in-progress block stayed in In Progress; ADO block left"
    else
        log_fail "In Progress section content unexpected after reorganize"
    fi
}

test_ado_stop_block() {
    log_test "TASK-019: Stop-block JSON names the ADO work-item id"

    create_ado_tasks_file
    reset_v33_state

    local sid="ado-stop-session"

    # Emit enough relevant engagements to pass the v3.3 threshold (3).
    for _ in 1 2 3 4; do
        echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep ADO-12345 planning/tasks.md"}}' \
            | "$HOOK_SCRIPT" 2>&1 || true
    done

    local output
    output=$(echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' \
        | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" '"decision": "block"' "Stop blocks after relevant engagement on an ADO task"
    assert_contains "$output" "ADO-12345" "Block JSON names the ADO work-item id"
}

test_ado_precompact() {
    log_test "TASK-019: PreCompact writes an ADO-prefixed snapshot filename and appends the ops log"

    create_ado_tasks_file
    rm -f "$FIXTURES_DIR/planning/notes/ADO-12345"*.md
    rm -rf "$FIXTURES_DIR/planning/notes/archive"

    local output
    output=$(echo '{"hook_event_name":"PreCompact","trigger":"manual"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "Pre-compact snapshot:" "Snapshot message shown"

    # v3.7.0: snapshots land under planning/notes/archive/ (precompact_dir).
    local snapshot
    snapshot=$(ls "$FIXTURES_DIR/planning/notes/archive/ADO-12345-precompact-"*.md 2>/dev/null | head -1)
    if [ -n "$snapshot" ] && [ -f "$snapshot" ]; then
        log_pass "precompact snapshot written with the ADO id in its filename"
    else
        log_fail "precompact snapshot not found for ADO id (looked for ADO-12345-precompact-*.md)"
    fi

    if [ -f "$FIXTURES_DIR/planning/notes/ADO-12345.md" ]; then
        local content
        content=$(cat "$FIXTURES_DIR/planning/notes/ADO-12345.md")
        assert_contains "$content" "Pre-Compact Ops Log" "Ops log appended to the ADO task's notes file"
    else
        log_fail "notes file for ADO id missing after precompact"
    fi
}

test_ado_malformed_heading_ignored() {
    log_test "TASK-019: malformed heading ADO-012 (leading zero) is never treated as a task"

    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Last Task ID: 000 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## To Do

---

## In Progress

### ADO-012 | Malformed id (leading zero), should never parse as a task
**Status**: in-progress

**Subtasks**:
- [ ] should not be counted anywhere

---

## Done

---
EOF

    local output
    output=$(echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1) || true

    # Despite "**Status**: in-progress", ADO-012's heading never matches
    # TASK_HEADING_RE (leading zero rejected by ADO_ID_CORE), so it's never
    # yielded as a task block — SessionStart must report no in-progress tasks.
    assert_contains "$output" "No in-progress tasks" "Malformed ADO heading produced no parsed task"
}

test_ado_hyphen_continuation_not_boundary() {
    log_test "TASK-019 (Codex review finding #14): a bare '### ADO-12-foo' line (no title/pipe) inside a block body is NOT read as a new task boundary"

    cat > "$FIXTURES_DIR/planning/tasks.md" << 'EOF'
# Kanban Board

<!-- Config: Last Task ID: 000 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## To Do

---

## In Progress

### ADO-777 | Real task with a stray hyphen-glued mention in its body
**Status**: in-progress

Notes mention ADO-12-foo inline, and even a stray markdown H3 line:
### ADO-12-foo
which must NOT be read as a new task boundary — ADO_ID_CORE's tail lookahead
excludes a following "-", so this whole line fails to match TASK_HEADING_RE
at all and stays inside THIS block.

**Subtasks**:
- [x] one
- [ ] two
- [ ] three

---

## Done

---
EOF

    local output
    output=$(echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" "ADO-777" "Real task still recognized"
    assert_contains "$output" "[1/3]" "Subtask count is the FULL block's (1/3) — not truncated at the bogus '### ADO-12-foo' line"
}

test_ado_notes_skeleton() {
    log_test "TASK-019: a notes skeleton is created for an ADO work-item id"

    create_ado_tasks_file
    reset_v33_state
    rm -f "$FIXTURES_DIR/planning/notes/ADO-12345.md"
    cat > "$FIXTURES_DIR/.task-memory.json" << 'EOF'
{ "notes_skeleton": "session-start" }
EOF

    echo '{"hook_event_name":"SessionStart"}' | "$HOOK_SCRIPT" 2>&1 > /dev/null || true
    rm -f "$FIXTURES_DIR/.task-memory.json"

    if [ -f "$FIXTURES_DIR/planning/notes/ADO-12345.md" ]; then
        log_pass "notes skeleton created at planning/notes/ADO-12345.md"
    else
        log_fail "notes skeleton not created at planning/notes/ADO-12345.md"
    fi
}

test_ado_stamping_bash() {
    log_test "TASK-019: Bash command mentioning an ADO id DOES stamp"

    create_ado_tasks_file
    reset_v33_state

    local sid="ado-stamp-session"

    # Emit enough engagements to pass the threshold (3 by default).
    for _ in 1 2 3 4; do
        echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep ADO-12345 planning/tasks.md"}}' \
            | "$HOOK_SCRIPT" 2>&1 || true
    done

    local output
    output=$(echo '{"hook_event_name":"Stop","session_id":"'"$sid"'"}' \
        | "$HOOK_SCRIPT" 2>&1) || true

    assert_contains "$output" '"decision": "block"' "Stop blocks after relevant engagement"
    assert_contains "$output" "ADO-12345" "Block message names the ADO task"
}

# =============================================================================
# JS UI suite (TASK-017) — node:test against production taskId.js /
# markdown.js / fileSystem.js. Guarded behind `command -v node`; skips
# cleanly (not a failure) on a machine without node on PATH. Also runnable
# standalone via `node tests/test-ui.mjs` or `npm run test:ui`.
# =============================================================================

run_js_ui_tests() {
    if ! command -v node >/dev/null 2>&1; then
        echo -e "\n${YELLOW}SKIP:${NC} tests/test-ui.mjs (node not found on PATH — JS UI suite not run)"
        return
    fi

    log_test "JS UI: node tests/test-ui.mjs (taskId.js / markdown.js / fileSystem.js)"

    local js_output js_exit
    js_output=$(node "$SCRIPT_DIR/test-ui.mjs" 2>&1)
    js_exit=$?

    local js_pass js_fail
    js_pass=$(echo "$js_output" | grep -oE '^ℹ pass [0-9]+' | grep -oE '[0-9]+' || true)
    js_fail=$(echo "$js_output" | grep -oE '^ℹ fail [0-9]+' | grep -oE '[0-9]+' || true)
    js_pass=${js_pass:-0}
    js_fail=${js_fail:-0}

    if [ "$js_exit" -eq 0 ] && [ "$js_fail" -eq 0 ]; then
        log_pass "JS UI suite green ($js_pass passed)"
    else
        log_fail "JS UI suite has failures ($js_fail failed / $js_pass passed)"
        echo "$js_output" | grep -E '^not ok|✖' | head -20
    fi
}

# =============================================================================
# JS file-watcher suite (TASK-018) — node:test regression coverage for the
# watcher-rebind bug: switching task files must rebind fileWatcher's polling
# interval to the new handle (no leaked interval, old handle stops being
# polled). Guarded behind `command -v node`; skips cleanly (not a failure) on
# a machine without node on PATH. Also runnable standalone via
# `node tests/test-watcher.mjs` or `npm run test:watcher`.
# =============================================================================

run_js_watcher_tests() {
    if ! command -v node >/dev/null 2>&1; then
        echo -e "\n${YELLOW}SKIP:${NC} tests/test-watcher.mjs (node not found on PATH — watcher suite not run)"
        return
    fi

    log_test "JS watcher: node tests/test-watcher.mjs (fileWatcher.js rebind-on-switch)"

    local js_output js_exit
    js_output=$(node "$SCRIPT_DIR/test-watcher.mjs" 2>&1)
    js_exit=$?

    local js_pass js_fail
    js_pass=$(echo "$js_output" | grep -oE '^ℹ pass [0-9]+' | grep -oE '[0-9]+' || true)
    js_fail=$(echo "$js_output" | grep -oE '^ℹ fail [0-9]+' | grep -oE '[0-9]+' || true)
    js_pass=${js_pass:-0}
    js_fail=${js_fail:-0}

    if [ "$js_exit" -eq 0 ] && [ "$js_fail" -eq 0 ]; then
        log_pass "JS watcher suite green ($js_pass passed)"
    else
        log_fail "JS watcher suite has failures ($js_fail failed / $js_pass passed)"
        echo "$js_output" | grep -E '^not ok|✖' | head -20
    fi
}

# =============================================================================
# v3.7.0: owner resolution, focus-aware selection, dedupe, epics
# =============================================================================

OWNER_ROOT=""

# A two-developer board behind one glob — the shape that made every pre-3.7
# session work on the other developer's card.
create_owner_fixture() {
    OWNER_ROOT="$FIXTURES_DIR/owner"
    rm -rf "$OWNER_ROOT"
    mkdir -p "$OWNER_ROOT/planning"

    cat > "$OWNER_ROOT/.task-memory.json" << 'EOF'
{
  "planning_dir": "planning",
  "task_files_glob": "planning/tasks-*.md",
  "todowrite_mirror_file": {
    "GR": "planning/tasks-gr.md",
    "DG": "planning/tasks-dg.md"
  }
}
EOF

    cat > "$OWNER_ROOT/planning/tasks-gr.md" << 'EOF'
# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 895 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## To Do

---

## In Progress

### TASK-GR-880 | EPIC: Owner-aware hooks
**Priority**: High | **Status**: 🚀 In Progress
**Created**: 2026-09-01 | **Started**: 2026-09-01

**Subtasks**:
- [ ] ship the whole thing

### TASK-GR-890 | Middle card
**Status**: In Progress | **Epic**: 880
**Created**: 2026-09-02 | **Started**: 2026-09-02

**Subtasks**:
- [x] one
- [ ] two

**Pre-Work Checklist**:
- [ ] read the files

**Visual Operations Log**:

### TASK-GR-895 | Newest card
**Status**: in_progress
**Created**: 2026-09-10 | **Started**: 2026-09-10

**Subtasks**:
- [ ] alpha
- [ ] beta

---

## Done

---
EOF

    cat > "$OWNER_ROOT/planning/tasks-dg.md" << 'EOF'
# Kanban Board

<!-- Config: Task Prefix: DG | Last Task ID: 775 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## In Progress

### TASK-DG-775 | Other developer card
**Status**: 🚀 In Progress
**Created**: 2026-08-01 | **Started**: 2026-08-01

**Subtasks**:
- [ ] not mine

---

## Done

---
EOF
}

owner_hook() {
    # usage: owner_hook '<json payload>'  (env for the call comes from caller)
    printf '%s' "$1" | CLAUDE_PROJECT_DIR="$OWNER_ROOT" "$HOOK_SCRIPT" 2>&1
}

pin_focus() {
    mkdir -p "$OWNER_ROOT/.claude/state/task-memory"
    printf '%s\n' "$1" > "$OWNER_ROOT/.claude/state/task-memory/focus.txt"
}

test_owner_from_env() {
    log_test "v3.7: TASK_MEMORY_OWNER selects whose board this session works on"

    create_owner_fixture

    local output
    output=$(TASK_MEMORY_OWNER=DG owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-env-dg"}')
    assert_contains "$output" "owner DG" "Env owner reported in the banner"
    assert_contains "$output" "focus TASK-DG-775" "Focus lands on DG's own card"

    output=$(TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-env-gr"}')
    assert_contains "$output" "owner GR" "Env owner switches the scope"
    if echo "$output" | grep -q "focus TASK-DG-775"; then
        log_fail "GR's session focused DG's card"
    else
        log_pass "GR's session does not focus DG's card"
    fi
}

test_owner_from_branch_pattern() {
    log_test "v3.7: owner_branch_pattern derives the owner from the git branch"

    create_owner_fixture
    cat > "$OWNER_ROOT/.task-memory.json" << 'EOF'
{
  "planning_dir": "planning",
  "task_files_glob": "planning/tasks-*.md",
  "owner_branch_pattern": "^v5\\.([a-z]{2})\\d*-dev$"
}
EOF
    git init -q "$OWNER_ROOT" 2>/dev/null || true
    git -C "$OWNER_ROOT" symbolic-ref HEAD refs/heads/v5.dg1-dev

    local output
    output=$(owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-branch"}')
    assert_contains "$output" "owner DG" "Branch v5.dg1-dev resolves owner DG"
    assert_contains "$output" "focus TASK-DG-775" "Branch owner scopes selection to DG's file"

    git -C "$OWNER_ROOT" symbolic-ref HEAD refs/heads/v5.gr1-dev
    output=$(owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-branch2"}')
    assert_contains "$output" "owner GR" "Branch v5.gr1-dev resolves owner GR"

    rm -rf "$OWNER_ROOT/.git"
}

test_selection_prefers_focus_pin() {
    log_test "v3.7: a focus pin outranks the most-recently-started task"

    create_owner_fixture
    pin_focus "TASK-GR-890"

    local output
    output=$(TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-pin"}')
    assert_contains "$output" "focus TASK-GR-890 (pinned)" "Pinned task wins and says so"
}

test_selection_latest_started_excludes_epics() {
    log_test "v3.7: with no pin, the most recently Started non-epic task wins"

    create_owner_fixture

    local output
    output=$(TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-latest"}')
    assert_contains "$output" "focus TASK-GR-895 (latest)" "Newest Started task selected"
    if echo "$output" | grep -q "focus TASK-GR-880"; then
        log_fail "epic card was selected as the current task"
    else
        log_pass "epic card not selected as the current task"
    fi
}

test_selection_scoped_to_my_files() {
    log_test "v3.7: other developers' in-progress tasks are counted, never selected"

    create_owner_fixture

    local output
    output=$(TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-scope"}')
    assert_contains "$output" "Other in-progress (others): 1" "DG's card counted as somebody else's"
    if echo "$output" | grep -q "TASK-DG-775"; then
        log_fail "DG's task id leaked into GR's banner"
    else
        log_pass "DG's task id does not appear in GR's banner"
    fi
}

test_emoji_status_is_in_progress() {
    log_test "v3.7: '🚀 In Progress' is recognized as in-progress"

    create_owner_fixture

    # DG's only card uses the emoji form; if it were not recognized the banner
    # would report no task in progress at all.
    local output
    output=$(TASK_MEMORY_OWNER=DG owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-emoji"}')
    assert_contains "$output" "focus TASK-DG-775" "Emoji status parsed as in-progress"

    # And the underscore form on GR's newest card.
    output=$(TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-emoji2"}')
    assert_contains "$output" "TASK-GR-895" "in_progress (underscore) parsed as in-progress"
}

test_prompt_context_creates_no_files() {
    log_test "v3.7: the UserPromptSubmit path creates nothing on disk"

    create_owner_fixture

    TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"UserPromptSubmit","session_id":"own-readonly"}' > /dev/null

    if [ -e "$OWNER_ROOT/.claude" ]; then
        log_fail "UserPromptSubmit created $OWNER_ROOT/.claude"
    else
        log_pass "no state directory created"
    fi

    if [ -e "$OWNER_ROOT/planning/notes" ]; then
        log_fail "UserPromptSubmit created a notes directory"
    else
        log_pass "no notes directory or skeleton created"
    fi
}

test_append_log_entry_dedupe() {
    log_test "v3.7: an identical research entry is not logged twice"

    create_owner_fixture
    pin_focus "TASK-GR-890"

    local payload='{"hook_event_name":"PostToolUse","tool_name":"WebFetch","session_id":"own-dedupe","tool_input":{"url":"https://example.com/same"},"tool_response":"identical body"}'
    TASK_MEMORY_OWNER=GR owner_hook "$payload" > /dev/null
    TASK_MEMORY_OWNER=GR owner_hook "$payload" > /dev/null
    TASK_MEMORY_OWNER=GR owner_hook "$payload" > /dev/null

    local count
    count=$(grep -c "WebFetch: https://example.com/same" "$OWNER_ROOT/planning/tasks-gr.md" || true)
    if [ "$count" = "1" ]; then
        log_pass "three identical WebFetch ops produced one log entry"
    else
        log_fail "expected 1 log entry, found $count"
    fi

    # A different url still logs.
    TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"PostToolUse","tool_name":"WebFetch","session_id":"own-dedupe","tool_input":{"url":"https://example.com/other"},"tool_response":"identical body"}' > /dev/null
    count=$(grep -c "WebFetch: https://example.com/other" "$OWNER_ROOT/planning/tasks-gr.md" || true)
    if [ "$count" = "1" ]; then
        log_pass "a distinct entry is still appended"
    else
        log_fail "distinct entry not appended (found $count)"
    fi
}

test_precompact_dedupe_and_no_unknown() {
    log_test "v3.7: PreCompact skips identical snapshots and writes nothing without a task"

    create_owner_fixture
    pin_focus "TASK-GR-895"

    TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"PreCompact","session_id":"own-pc","trigger":"manual"}' > /dev/null
    local second
    second=$(TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"PreCompact","session_id":"own-pc","trigger":"manual"}')

    assert_contains "$second" "not writing a duplicate" "Second identical snapshot is skipped"

    local count
    count=$(ls "$OWNER_ROOT/planning/notes/archive/" 2>/dev/null | grep -c "TASK-GR-895-precompact-" || true)
    if [ "$count" = "1" ]; then
        log_pass "exactly one snapshot on disk after two compactions"
    else
        log_fail "expected 1 snapshot, found $count"
    fi

    # No in-progress task anywhere -> no snapshot at all, and no UNKNOWN file.
    create_owner_fixture
    sed -i.bak 's/\*\*Status\*\*: .*/**Status**: todo/' "$OWNER_ROOT/planning/tasks-gr.md" "$OWNER_ROOT/planning/tasks-dg.md"
    rm -f "$OWNER_ROOT/planning/"*.bak

    local output
    output=$(TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"PreCompact","session_id":"own-pc2","trigger":"manual"}')
    assert_contains "$output" "nothing to snapshot" "No task means no snapshot"

    if ls "$OWNER_ROOT/planning/notes/"*UNKNOWN* >/dev/null 2>&1 || \
       ls "$OWNER_ROOT/planning/notes/archive/"*UNKNOWN* >/dev/null 2>&1; then
        log_fail "an UNKNOWN-precompact file was written"
    else
        log_pass "no UNKNOWN-precompact file written"
    fi
}

test_epic_skipped_by_stop_gate() {
    log_test "v3.7: the Stop gate skips an epic but still blocks on a real task"

    create_owner_fixture
    pin_focus "TASK-GR-880"

    local sid="own-stop-epic"
    for _ in 1 2 3 4; do
        TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep TASK-GR-880 planning/tasks-gr.md"}}' > /dev/null
    done

    local output
    output=$(TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"Stop","session_id":"'"$sid"'"}')
    if echo "$output" | grep -q '"decision": "block"'; then
        log_fail "Stop blocked on an epic card"
    else
        log_pass "Stop does not block on an epic card"
    fi

    # Control: the same treatment on a non-epic card does block.
    create_owner_fixture
    pin_focus "TASK-GR-895"
    sid="own-stop-real"
    for _ in 1 2 3 4; do
        TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"'"$sid"'","tool_input":{"command":"grep TASK-GR-895 planning/tasks-gr.md"}}' > /dev/null
    done
    output=$(TASK_MEMORY_OWNER=GR owner_hook '{"hook_event_name":"Stop","session_id":"'"$sid"'"}')
    assert_contains "$output" '"decision": "block"' "Stop still blocks on a real in-progress task"
    assert_contains "$output" "TASK-GR-895" "Block names the real task"
}

test_per_owner_todowrite_mirror() {
    log_test "v3.7: todowrite_mirror_file routes each owner's TodoWrite to their own board"

    create_owner_fixture

    local todos='{"hook_event_name":"PostToolUse","tool_name":"TodoWrite","session_id":"own-mirror","tool_input":{"todos":[{"content":"mirror probe item","status":"pending","activeForm":"Probing"}]}}'
    TASK_MEMORY_OWNER=GR owner_hook "$todos" > /dev/null

    if grep -q "mirror probe item" "$OWNER_ROOT/planning/tasks-gr.md"; then
        log_pass "GR's TodoWrite mirrored into tasks-gr.md"
    else
        log_fail "GR's TodoWrite did not reach tasks-gr.md"
    fi
    if grep -q "mirror probe item" "$OWNER_ROOT/planning/tasks-dg.md"; then
        log_fail "GR's TodoWrite leaked into tasks-dg.md"
    else
        log_pass "GR's TodoWrite stayed out of tasks-dg.md"
    fi

    create_owner_fixture
    TASK_MEMORY_OWNER=DG owner_hook "$todos" > /dev/null
    if grep -q "mirror probe item" "$OWNER_ROOT/planning/tasks-dg.md"; then
        log_pass "DG's TodoWrite mirrored into tasks-dg.md"
    else
        log_fail "DG's TodoWrite did not reach tasks-dg.md"
    fi
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
test_post_tool_use_webfetch
test_post_tool_use_websearch
test_2_action_rule
test_post_tool_use_subtask_reminder
test_post_tool_use_error_logging
test_stop_incomplete_tasks
test_session_end_never_blocks
test_checkbox_regex
test_multifile_session_start

# TASK-020: task_files_glob-without-planning_dir SessionStart warning
test_planning_dir_warning_missing
test_planning_dir_warning_control_no_warning

# v3.3.0 regression tests
test_stamping_scoped_to_relevant_tool_use
test_stamping_stamps_on_task_id_in_bash
test_engagement_threshold_releases_short_sessions
test_off_topic_flag_disables_blocking
test_sticky_release_after_max_blocks
test_session_start_no_skeleton_under_on_start
test_session_start_skeleton_under_session_start_policy
test_session_start_gcs_stale_state

# TASK-017: namespaced (initials-prefixed) task ids
test_prefixed_session_start
test_mixed_block_termination
test_prefixed_notes_skeleton
test_prefixed_note_logging
test_prefixed_precompact
test_reorg_mixed
test_reorg_gate_prefixed_filename
test_malformed_heading_ignored
test_stop_block_prefixed

# TASK-019: ADO bridge id acceptance (ANY_ID_CORE widening)
test_ado_session_start
test_ado_mixed_block_termination
test_ado_reorg
test_ado_stop_block
test_ado_precompact
test_ado_malformed_heading_ignored
test_ado_hyphen_continuation_not_boundary
test_ado_notes_skeleton
test_ado_stamping_bash

# v3.7.0: owner resolution, focus-aware selection, dedupe, epics
test_owner_from_env
test_owner_from_branch_pattern
test_selection_prefers_focus_pin
test_selection_latest_started_excludes_epics
test_selection_scoped_to_my_files
test_emoji_status_is_in_progress
test_prompt_context_creates_no_files
test_append_log_entry_dedupe
test_precompact_dedupe_and_no_unknown
test_epic_skipped_by_stop_gate
test_per_owner_todowrite_mirror

# JS UI suite (taskId.js / markdown.js / fileSystem.js) — guarded, see below
run_js_ui_tests

# JS file-watcher suite (rebind-on-switch, TASK-018) — guarded, see below
run_js_watcher_tests

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
