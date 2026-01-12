---
name: task-status
description: Quick context check using the 5-Question Reboot Test. Shows where you are, where you're going, your goal, what you've learned, and what you've done.
allowed-tools:
  - Read
  - Glob
---

# /task-status - 5-Question Reboot Test

Quickly verify your context is solid by answering 5 key questions from your task files.

---

## Usage

```
/task-status
```

---

## The 5 Questions

| Question | Answer Source | What to Check |
|----------|---------------|---------------|
| **Where am I?** | Current subtask in kanban.md | Which subtask is in progress? |
| **Where am I going?** | Remaining subtasks | What's left to complete? |
| **What's the goal?** | Task description | Why are we doing this? |
| **What have I learned?** | Notes + findings/ | Research discoveries |
| **What have I done?** | Visual Operations Log | Actions taken this session |

---

## Instructions

When the user runs `/task-status`, perform these steps:

### Step 1: Read the kanban file

```bash
Read tasks/kanban.md
```

Find the task with `**Status**: in-progress`

### Step 2: Extract and display the 5 answers

Format your response as:

```
═══════════════════════════════════════════════════════════════
📋 TASK STATUS: [TASK-XXX] | [Title]
═══════════════════════════════════════════════════════════════

1️⃣  WHERE AM I?
    Current phase: [First unchecked subtask or "Implementation"]
    Progress: [X/Y] subtasks complete

2️⃣  WHERE AM I GOING?
    Remaining:
    - [ ] [Subtask 1]
    - [ ] [Subtask 2]
    - [ ] [Subtask 3]

3️⃣  WHAT'S THE GOAL?
    [Task description from kanban.md]

4️⃣  WHAT HAVE I LEARNED?
    [Summary from Notes section]
    [If findings/TASK-XXX.md exists, mention key points]

5️⃣  WHAT HAVE I DONE?
    Recent operations:
    - [Last 3-5 Visual Operations Log entries]

═══════════════════════════════════════════════════════════════
✅ Context verified | Ready to continue
═══════════════════════════════════════════════════════════════
```

### Step 3: Check for findings file

```bash
Read tasks/findings/TASK-XXX.md (if exists)
```

Include key discoveries in "What have I learned?"

---

## Example Output

```
═══════════════════════════════════════════════════════════════
📋 TASK STATUS: TASK-004 | Test hook functionality
═══════════════════════════════════════════════════════════════

1️⃣  WHERE AM I?
    Current phase: Run a WebSearch
    Progress: 0/2 subtasks complete

2️⃣  WHERE AM I GOING?
    Remaining:
    - [ ] Run a WebSearch
    - [ ] Verify log appears in Notes

3️⃣  WHAT'S THE GOAL?
    Testing that the PreToolUse hook logs WebFetch/WebSearch
    operations correctly.

4️⃣  WHAT HAVE I LEARNED?
    No findings file yet (tasks/findings/TASK-004.md)
    Notes: Empty

5️⃣  WHAT HAVE I DONE?
    Recent operations:
    - 2026-01-12 01:34:37 - WebSearch: "Claude Code plugin development"

═══════════════════════════════════════════════════════════════
✅ Context verified | Ready to continue
═══════════════════════════════════════════════════════════════
```

---

## When Context is Broken

If you can't answer these questions, context needs repair:

```
═══════════════════════════════════════════════════════════════
⚠️  CONTEXT CHECK FAILED
═══════════════════════════════════════════════════════════════

Missing information:
- [ ] No in-progress task found
- [ ] Task has no subtasks defined
- [ ] No Visual Operations Log

Recommended actions:
1. Review tasks/kanban.md for task status
2. Add subtasks to break down the work
3. Continue research to populate logs

═══════════════════════════════════════════════════════════════
```

---

## Integration

This skill works with:
- **kanban.md** - Task board with subtasks and status
- **archive.md** - Completed tasks with preserved logs
- **findings/** - Research documentation per task
- **Visual Operations Log** - Auto-logged WebFetch/WebSearch

---

**Skill Version:** 1.0.0
**Created:** 2026-01-12
**License:** MIT
