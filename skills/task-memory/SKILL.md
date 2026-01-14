---
name: task-memory
version: "2.4.0"
description: Task planning and context preservation. Create tasks, update status, and save task documentation using Manus principles.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - WebFetch
  - WebSearch
---

# /task-memory - Task Planning & Context Preservation

Persistent task tracking with documentation. Work survives context resets.

---

## Critical Rules

### Rule 1: NO WORK WITHOUT TASK

Before writing code, editing files, or implementing anything:

**STOP. Create task in tasks.md FIRST.**

### Rule 2: NEVER MOVE TASK BLOCKS

Task sections are rendered by the viewer based on `Status:` field.

**To change status:**
- ✅ ONLY change `**Status**: todo` → `**Status**: in-progress` → `**Status**: done`
- ✅ Add `**Started**: YYYY-MM-DD` when starting
- ✅ Add `**Finished**: YYYY-MM-DD` when completing
- ❌ NEVER cut/paste task blocks between sections
- ❌ NEVER move the `### TASK-XXX` block

### Rule 3: PRESERVE RESEARCH (2-Action Rule)

After every 2 visual operations (screenshots, PDFs, web searches):

**STOP. Create/update notes file NOW.**

### Rule 4: NEVER REPEAT FAILURES

```
if action_failed:
    next_action != same_action
```

Track what you tried. Mutate the approach. Log errors.

---

## Workflow

### Step 1: Create Task

**Location:** `planning/tasks.md`

**Get next ID:**
```markdown
<!-- Config: Last Task ID: XXX -->
```
Read current ID, increment by 1.

**Task Template:**
```markdown
### TASK-XXX | [Brief Title]

**Priority**: [Critical|High|Medium|Low] | **Category**: [Feature|Bug|Docs|Research] | **Status**: todo
**Assigned**: @user
**Created**: YYYY-MM-DD
**Tags**: #tag1 #tag2

[Description of what needs to be done]

**Subtasks**:
- [ ] First subtask
- [ ] Second subtask
- [ ] Third subtask

**Notes**:

**Errors Log**:

---
```

**Update config after creating:**
```markdown
<!-- Config: Last Task ID: XXX -->  ← Increment this
```

### Step 2: Start Work (Change Status)

**Before starting**, edit the Status field:

```markdown
# BEFORE:
**Priority**: High | **Category**: Feature | **Status**: todo

# AFTER (only edit Status, add Started):
**Priority**: High | **Category**: Feature | **Status**: in-progress
**Created**: 2026-01-13 | **Started**: 2026-01-13
```

**DO NOT move the task block.**

### Step 3: Work and Update

Mark subtasks as completed:
```markdown
**Subtasks**:
- [x] Completed subtask
- [x] Another completed
- [ ] Still pending
```

Add progress to Notes:
```markdown
**Notes**:
- Investigated issue
- Found root cause in file.ts:42
- Implemented fix
```

Log errors as they occur:
```markdown
**Errors Log**:
| Error | Attempt | Resolution |
|-------|---------|------------|
| Module not found | 1 | Installed missing dep |
| Type mismatch | 2 | Fixed interface |
```

### Step 4: Complete Task (Change Status)

**When ALL subtasks done**, edit the Status field:

```markdown
# BEFORE:
**Priority**: High | **Category**: Feature | **Status**: in-progress
**Created**: 2026-01-13 | **Started**: 2026-01-13

# AFTER (only edit Status, add Finished):
**Priority**: High | **Category**: Feature | **Status**: done
**Created**: 2026-01-13 | **Started**: 2026-01-13 | **Finished**: 2026-01-13
```

**DO NOT move the task block.**

### Step 5: Commit with Task Reference

```bash
git commit -m "feat: description (TASK-XXX)"
```

---

## The 3-Strike Error Protocol

When errors occur, follow this escalation:

```
ATTEMPT 1: Diagnose & Fix
  → Read error carefully
  → Identify root cause
  → Apply targeted fix
  → Log to Errors Log

ATTEMPT 2: Alternative Approach
  → Same error? Try different method
  → Different tool? Different library?
  → NEVER repeat exact same failing action
  → Log attempt to Errors Log

ATTEMPT 3: Broader Rethink
  → Question assumptions
  → Search for solutions
  → Consider updating the plan
  → Log attempt to Errors Log

AFTER 3 FAILURES: Escalate to User
  → Explain what you tried
  → Share the specific error
  → Ask for guidance
```

**Key principle:** Error recovery is a signal of true agentic behavior. Leave wrong turns in context - they inform better decisions.

---

## Read vs Write Decision Matrix

| Situation | Action | Reason |
|-----------|--------|--------|
| Just wrote a file | DON'T read | Content still in context |
| Viewed image/PDF | Write notes NOW | Multimodal → text before lost |
| Browser returned data | Write to notes | Screenshots don't persist |
| Starting new phase | Read plan/notes | Re-orient if context stale |
| Error occurred | Read relevant file | Need current state to fix |
| Resuming after gap | Read tasks.md + notes/ | Recover full state |

---

## Task Documentation (notes/)

The `planning/notes/` folder stores task-related documentation that persists across sessions:

- **Research findings** - Visual analysis, web research, documentation review
- **Audit results** - Security audits, performance audits, accessibility checks
- **Code review notes** - Review feedback, suggested changes, approval notes
- **Meeting notes** - Decisions made, action items, stakeholder input
- **Decision logs** - Architecture decisions, trade-off analysis, rationale
- **Test results** - Test analysis, failure investigation, coverage reports

### The 2-Action Rule

After every 2 visual operations, save to notes immediately:

```
Action 1: View screenshot
Action 2: Read PDF
→ STOP: Create planning/notes/TASK-XXX.md NOW
```

**Why:** Screenshots, PDFs, browser results don't persist in context. Text in markdown persists forever.

### When to Create Notes

**Trigger after 2 of:**
- Screenshots (Claude in Chrome, browser automation)
- PDFs or images
- Search results
- Documentation pages
- Code reviews
- Any content worth preserving

### Notes File Template

**Location:** `planning/notes/TASK-XXX.md`

```markdown
# Notes: TASK-XXX | [Task Title]

## Summary

[Brief overview of what this document covers]

## Analysis

### [Source/Topic]: [Description] (YYYY-MM-DD HH:MM)
- Observation 1
- Observation 2
- Key insight

## Decisions

| Decision | Rationale |
|----------|-----------|
| [Choice] | [Why] |

## Issues

| Issue | Impact | Resolution |
|-------|--------|------------|
| [Problem] | [Effect] | [Fix] |

## Resources

- [Link or path to source]

## Action Items

- [ ] Follow-up task 1
- [ ] Follow-up task 2
```

### Link Notes to Task

Add to task in tasks.md:
```markdown
**Notes**:
Documentation in notes/TASK-XXX.md
```

---

## Status Values

| Status | Description | Required Fields |
|--------|-------------|-----------------|
| `todo` | Not started | Created |
| `in-progress` | Active work | Created, Started |
| `done` | Completed | Created, Started, Finished |

**Valid transitions:**
```
todo → in-progress → done
```

---

## Visual Operations Log

WebFetch and WebSearch are auto-logged by hooks:

```markdown
**Visual Operations Log**:
- 2026-01-13 10:30:45 - WebFetch: https://docs.example.com
- 2026-01-13 10:31:22 - WebSearch: "query"
```

This is separate from notes - logs capture WHAT you did, notes capture WHAT YOU LEARNED.

---

## Directory Structure

```
planning/
├── tasks.md            ← Active tasks
├── archive.md          ← Completed tasks (preserved)
└── notes/              ← Task documentation
    ├── TASK-001.md
    ├── TASK-002.md
    └── ...
```

---

## File Format for UI Compatibility

The task-memory UI (`task-memory.html`) requires a specific format. Tasks MUST be nested under column sections.

### Required Structure

```markdown
# Kanban Board

<!-- Config: Last Task ID: XXX -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

**Categories**: Feature, Bug, Docs, Research

**Users**: @alice, @bob

**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

**Tags**: #tag1 #tag2 #tag3

---

## 📝 To Do

### TASK-001 | Task Title
**Priority**: High | **Category**: Feature | **Status**: todo
...

## 🚧 In Progress

### TASK-002 | Another Task
**Priority**: Medium | **Category**: Bug | **Status**: in-progress
...

## ✅ Done

### TASK-003 | Completed Task
**Priority**: Low | **Category**: Docs | **Status**: done
...
```

### Critical Requirements

1. **Configuration section**: Must use `## ⚙️ Configuration` header (with emoji)
2. **Columns format**: `**Columns**: Name (id) | Name (id) | Name (id)`
3. **Column sections**: Tasks must be under column headers like `## 📝 To Do`
4. **Task headers**: Use `### TASK-XXX` (h3 level), NOT `## TASK-XXX` (h2 level)
5. **Separator**: Use `---` after the configuration section

### Column ID Mapping

The `(id)` in the Columns definition maps to the `**Status**:` field:

| Column Definition | Status Value |
|-------------------|--------------|
| `To Do (todo)` | `**Status**: todo` |
| `In Progress (in-progress)` | `**Status**: in-progress` |
| `Done (done)` | `**Status**: done` |

### ❌ Invalid Format (Won't Parse)

```markdown
## TASK-001 | Task Title       ← WRONG: h2 level, not under column
**Status**: done

## TASK-002 | Another Task     ← WRONG: standalone sections
**Status**: todo
```

### ✅ Valid Format (Will Parse)

```markdown
## 📝 To Do

### TASK-002 | Another Task    ← CORRECT: h3 level, under column
**Status**: todo

## ✅ Done

### TASK-001 | Task Title      ← CORRECT: h3 level, under column
**Status**: done
```

---

## Monorepo Support

task-memory supports three flexible patterns for monorepos. Choose the pattern that fits your project structure.

### Option A: Per-Package Planning (Auto-Detected)

Each package/workspace gets its own planning folder. Hooks automatically find the nearest `planning/tasks.md` walking up from the current directory.

```
monorepo/
├── packages/
│   ├── api/
│   │   └── planning/
│   │       ├── tasks.md
│   │       └── notes/
│   ├── admin/
│   │   └── planning/
│   │       ├── tasks.md
│   │       └── notes/
│   └── web/
│       └── planning/
│           ├── tasks.md
│           └── notes/
└── planning/              ← Root fallback
    └── tasks.md
```

**How it works:** When working in `packages/api/src/`, hooks detect `packages/api/planning/tasks.md`.

### Option B: Centralized with Domain Subdirs

Single `planning/` folder with domain-based subdirectories. Requires skill/CLAUDE.md guidance for file selection.

```
monorepo/
└── planning/
    ├── api/
    │   └── tasks.md
    ├── admin/
    │   └── tasks.md
    ├── web/
    │   └── tasks.md
    └── notes/             ← Shared notes
```

**Add to CLAUDE.md:**
```markdown
### Task Management

**Domain-based planning files:**
| Work Type | Planning File |
|-----------|---------------|
| API/Backend | `planning/api/tasks.md` |
| Admin Portal | `planning/admin/tasks.md` |
| Public Web | `planning/web/tasks.md` |

Cross-domain work: Create tasks in ALL relevant files.
```

### Option C: Configuration-Based

Explicit mapping in `.task-memory.json` for complete control.

```json
{
  "planning_dir": "docs/todo",
  "planning_dirs": {
    "api": "packages/api/planning",
    "admin": "packages/admin/planning",
    "default": "planning"
  }
}
```

**Single directory override:**
```json
{
  "planning_dir": "docs/planning"
}
```

### CLAUDE.md Fallback

When hooks can't auto-detect the correct planning file (Option B or complex setups), add explicit guidance to your project's `CLAUDE.md`:

```markdown
## Task Management (task-memory)

**Planning file:** `planning/tasks.md`

Before ANY work:
1. Create task in planning/tasks.md
2. Set Status: in-progress
3. Do the work
4. Set Status: done
5. Commit with (TASK-XXX) reference
```

This ensures Claude knows where to find/create tasks even without hooks.

---

## Common Mistakes

### ❌ Moving task blocks
```
*Cuts TASK-001 from "To Do"*
*Pastes into "In Progress"*  ← WRONG
```
**Fix:** Only change `Status: todo` → `Status: in-progress`

### ❌ Working without task
```
User: "Fix the bug"
Assistant: *immediately writes code*  ← WRONG
```
**Fix:** Create TASK-XXX first, then code

### ❌ Skipping research preservation
```
View screenshot → Read PDF → Code → [context reset] → Lost insights  ← WRONG
```
**Fix:** Create notes file after 2 visual operations

### ❌ Vague notes
```markdown
- Looked at screenshot, has panels  ← WRONG
```
**Fix:**
```markdown
- 3-panel layout: 250px left, fluid center, 300px right  ← CORRECT
```

### ❌ Repeating failed actions
```
npm install fails → npm install again → npm install again  ← WRONG
```
**Fix:** Log error, try alternative (yarn, pnpm, check network)

---

## Verification Checklist

Before ANY work:
```
☐ Created TASK-XXX in tasks.md
☐ Used proper format (Status field, subtasks, Errors Log)
☐ Incremented Last Task ID in config
☐ Changed Status: todo → in-progress (NOT moved block)
☐ Added Started: date
```

During work:
```
☐ Updating subtasks as completed [x]
☐ Documenting in Notes section
☐ Logging errors to Errors Log
☐ Creating notes file after 2 visual ops
☐ Following 3-Strike Protocol on failures
```

After work:
```
☐ Changed Status: in-progress → done (NOT moved block)
☐ Added Finished: date
☐ All subtasks checked [x]
☐ Committed with (TASK-XXX) reference
```

---

## Git Integration

Every commit references task:

```bash
git commit -m "type: description (TASK-XXX)"

# Examples
git commit -m "feat: add login form (TASK-042)"
git commit -m "fix: null check in parser (TASK-043)"
git commit -m "docs: API reference (TASK-044)"
```

---

**Version:** 2.4.0
**License:** MIT
