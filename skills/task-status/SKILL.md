---
name: task-status
version: "1.2.0"
description: Quick context check using the 5-Question Reboot Test. Shows workflow type, complexity, phase dependencies, and verification status.
user-invocable: true
allowed-tools:
  - Read
  - Glob
---

# /task-status - 5-Question Reboot Test

Quickly verify your context is solid by answering 5 key questions.

## Quick Start

When invoked, perform these steps:

### Step 1: Read Tasks

```bash
Read planning/tasks.md
```

Find the task with `**Status**: in-progress`

### Step 2: Extract the 5 Answers

| Question | Source | Extract |
|----------|--------|---------|
| Where am I? | First unchecked subtask | Current phase |
| Where am I going? | Remaining subtasks with dependencies | What's left |
| What's the goal? | Task description | Why we're doing this |
| What have I learned? | Notes + notes/ (patterns, gotchas) | Research insights |
| What have I done? | Visual Operations Log | Recent actions |

Also extract:
- **Workflow type** (Feature/Refactor/Investigation/Migration/Simple)
- **Complexity** (Simple/Standard/Complex)
- **Pre-Work Checklist** status
- **Phase dependencies** for remaining subtasks

### Step 3: Check for Notes File

```bash
Read planning/notes/TASK-XXX.md (if exists)
```

### Step 4: Display Status

```
═══════════════════════════════════════════════════════════════
📋 TASK STATUS: TASK-XXX | [Title]
═══════════════════════════════════════════════════════════════
Workflow: [Type] | Complexity: [Level] | Pre-Work: [✓/✗]
═══════════════════════════════════════════════════════════════

1️⃣  WHERE AM I?
    Current phase: [First unchecked subtask]
    Progress: [X/Y] subtasks complete
    Dependencies: [Any blockers for current phase]

2️⃣  WHERE AM I GOING?
    Remaining:
    - [ ] [Subtask 1]
    - [ ] [Subtask 2] (depends: Subtask 1)
    - [ ] [Subtask 3] (depends: Subtask 2)

3️⃣  WHAT'S THE GOAL?
    [Task description from tasks.md]

4️⃣  WHAT HAVE I LEARNED?
    Patterns: [From notes file if exists]
    Gotchas: [From notes file if exists]
    Notes: [Summary from Notes section]

5️⃣  WHAT HAVE I DONE?
    Recent operations:
    - [Last 3-5 Visual Operations Log entries]

═══════════════════════════════════════════════════════════════
✅ Context verified | Ready to continue
═══════════════════════════════════════════════════════════════
```

---

## When Context is Broken

If you can't answer these questions, display:

```
═══════════════════════════════════════════════════════════════
⚠️  CONTEXT CHECK FAILED
═══════════════════════════════════════════════════════════════

Missing information:
- [ ] No in-progress task found
- [ ] Task has no subtasks defined
- [ ] No Visual Operations Log

Recommended actions:
1. Review planning/tasks.md for task status
2. Add subtasks to break down the work
3. Continue research to populate logs

═══════════════════════════════════════════════════════════════
```

---

## When to Use

Run `/task-status` when:
- Starting a new session
- Resuming after a break
- Context feels uncertain
- Before making major decisions

---

## Example Output

```
═══════════════════════════════════════════════════════════════
📋 TASK STATUS: TASK-004 | Fix hook functionality
═══════════════════════════════════════════════════════════════
Workflow: Investigation | Complexity: Standard | Pre-Work: ✓
═══════════════════════════════════════════════════════════════

1️⃣  WHERE AM I?
    Current phase: Test WebSearch logging
    Progress: 1/3 subtasks complete
    Dependencies: None (ready to proceed)

2️⃣  WHERE AM I GOING?
    Remaining:
    - [ ] Test WebSearch logging
    - [ ] Verify 2-Action Rule reminder (depends: Test WebSearch)

3️⃣  WHAT'S THE GOAL?
    Ensure PreToolUse hook correctly logs research operations
    to the Visual Operations Log in tasks.md

4️⃣  WHAT HAVE I LEARNED?
    Patterns: Hook triggers on WebFetch/WebSearch
    Gotchas: Must check for planning/ directory first
    Notes: See planning/notes/TASK-004.md

5️⃣  WHAT HAVE I DONE?
    Recent operations:
    - 2026-01-12 10:30:45 - WebFetch: https://docs.example.com
    - 2026-01-12 10:31:22 - WebSearch: "Claude Code hooks"

═══════════════════════════════════════════════════════════════
✅ Context verified | Ready to continue
═══════════════════════════════════════════════════════════════
```

---

## Integration

This skill reads from:
- **planning/tasks.md** - Task status, subtasks, notes, operations log
- **planning/notes/** - Task documentation (research, audits, reviews)

Use with `/task-memory` to preserve research before checking status.

---

**Version:** 1.2.0
**License:** MIT
