---
name: task-status
version: "1.3.0"
description: Provides quick context verification using the 5-Question Reboot Test. Shows current task progress, workflow type, complexity, phase dependencies, and remaining subtasks. Use when starting new sessions, resuming after breaks, when context feels uncertain, or before making major implementation decisions.
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

## Format Reference

For complete format documentation, see `/task-memory` skill.

**Required Task Structure:**
```markdown
### TASK-XXX | Title                                    # Must be h3 (###)
**Priority**: 🟠 High | **Category**: Feature | **Status**: in-progress | **Assigned**: @user
**Workflow**: Feature | **Complexity**: Standard
**Created**: 2026-01-15 | **Started**: 2026-01-15 | **Finished**:
**Tags**: #tag1 #tag2

Description text...

**Subtasks**:
- [x] Phase 1: Completed task
- [ ] Phase 2: Current task (depends: Phase 1)
- [ ] Phase 3: Future task (depends: Phase 2)

**Pre-Work Checklist**:
- [x] Read relevant files
- [x] Searched for similar implementations
- [x] Identified patterns to follow
- [x] Reviewed known gotchas

**Notes**:

**Visual Operations Log**:

**Errors Log**:
```

**Key Format Rules:**
| Rule | Requirement |
|------|-------------|
| Task header | Must be `### TASK-XXX` (h3 level) |
| Column sections | Must be `## Name` (h2 level) |
| Status values | `todo`, `in-progress`, `done` |
| Date format | `YYYY-MM-DD` |
| Dependencies | `(depends: Phase X)` or `(depends: Phase X, Phase Y)` |

**Workflow Types:** Feature, Refactor, Investigation, Migration, Simple

**Complexity Levels:** Simple (1-2 files), Standard (3-10 files), Complex (10+ files)

---

**Version:** 1.2.0
**License:** MIT
