---
name: task-status
version: "1.1.0"
description: Quick context check using the 5-Question Reboot Test. Verifies your working context is solid before continuing.
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
| Where am I going? | Remaining subtasks | What's left |
| What's the goal? | Task description | Why we're doing this |
| What have I learned? | Notes + notes/ | Research insights |
| What have I done? | Visual Operations Log | Recent actions |

### Step 3: Check for Notes File

```bash
Read planning/notes/TASK-XXX.md (if exists)
```

### Step 4: Display Status

```
═══════════════════════════════════════════════════════════════
📋 TASK STATUS: TASK-XXX | [Title]
═══════════════════════════════════════════════════════════════

1️⃣  WHERE AM I?
    Current phase: [First unchecked subtask]
    Progress: [X/Y] subtasks complete

2️⃣  WHERE AM I GOING?
    Remaining:
    - [ ] [Subtask 1]
    - [ ] [Subtask 2]
    - [ ] [Subtask 3]

3️⃣  WHAT'S THE GOAL?
    [Task description from tasks.md]

4️⃣  WHAT HAVE I LEARNED?
    [Summary from Notes section]
    [Key points from notes file if exists]

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

1️⃣  WHERE AM I?
    Current phase: Test WebSearch logging
    Progress: 1/3 subtasks complete

2️⃣  WHERE AM I GOING?
    Remaining:
    - [ ] Test WebSearch logging
    - [ ] Verify 2-Action Rule reminder

3️⃣  WHAT'S THE GOAL?
    Ensure PreToolUse hook correctly logs research operations
    to the Visual Operations Log in tasks.md

4️⃣  WHAT HAVE I LEARNED?
    Notes: Hook triggers on WebFetch/WebSearch
    Documentation: None yet (planning/notes/TASK-004.md not created)

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

**Version:** 1.1.0
**License:** MIT
