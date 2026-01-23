---
name: task-memory
version: "2.7.0"
description: Provides task planning and context preservation for development workflows. Creates structured tasks in planning/tasks.md with subtasks, dependencies, and progress tracking. Use when implementing features, fixing bugs, refactoring code, or any work requiring task tracking. Supports workflow classification (Feature, Refactor, Investigation, Migration, Simple) and complexity assessment. Inspired by Auto-Claude patterns.
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

### Rule 2: STATUS FIELD IS AUTHORITATIVE

The `**Status**:` field determines task state. The UI reads this field and auto-reorganizes mismatches.

**To change status:**

- ✅ Change `**Status**: todo` → `**Status**: in-progress` → `**Status**: done`
- ✅ Add `**Started**: YYYY-MM-DD` when starting
- ✅ Add `**Finished**: YYYY-MM-DD` when completing
- ✅ Optionally move task block to matching section for file readability

**Auto-Reorganization:** If Status doesn't match section, the UI auto-fixes on load. For file clarity when editing directly, move blocks to their matching sections.

### Rule 3: PRESERVE RESEARCH (2-Action Rule)

After every 2 visual operations (screenshots, PDFs, web searches):

**STOP. Create/update notes file NOW.**

### Rule 4: NEVER REPEAT FAILURES

```
if action_failed:
    next_action != same_action
```

Track what you tried. Mutate the approach. Log errors.

### Rule 5: PRE-IMPLEMENTATION CHECKLIST

Before writing ANY code, complete this checklist:

```
☐ Read relevant files (identify them first)
☐ Search for similar implementations in codebase
☐ Identify existing patterns to follow
☐ Review known gotchas for this area
☐ Document findings in task Notes
```

**Why:** Skipping this causes pattern violations, duplicate code, and preventable bugs.

### Rule 6: SELF-CRITIQUE BEFORE DONE

Before marking a task done, verify:

```
☐ Code quality: No hardcoded values, proper error handling
☐ Pattern compliance: Follows existing codebase conventions
☐ Completeness: All subtasks genuinely finished
☐ No regressions: Existing functionality preserved
```

**If any check fails:** Fix before marking done. Never defer issues to "later."

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

**Priority**: [🔴 Critical|🟠 High|🟡 Medium|🟢 Low] | **Category**: [Feature|Bug|Docs|Research] | **Status**: todo | **Assigned**: @user
**Workflow**: [Feature|Refactor|Investigation|Migration|Simple] | **Complexity**: [Simple|Standard|Complex]
**Created**: YYYY-MM-DD | **Started**: | **Finished**:
**Tags**: #tag1 #tag2

[Description of what needs to be done]

**Subtasks**:

- [ ] Phase 1: First subtask
- [ ] Phase 2: Second subtask (depends: Phase 1)
- [ ] Phase 3: Third subtask (depends: Phase 2)

**Pre-Work Checklist**:

- [ ] Read relevant files
- [ ] Searched for similar implementations
- [ ] Identified patterns to follow
- [ ] Reviewed known gotchas

**Notes**:

**Visual Operations Log**:

**Errors Log**:
```

**Date Fields:**
| Field | When to Set | Required For |
|-------|-------------|--------------|
| **Created** | When task is created | All tasks |
| **Started** | When Status → in-progress | in-progress, done |
| **Finished** | When Status → done | done |

**Dependencies Syntax:**

- Single: `(depends: Phase 1)`
- Multiple: `(depends: Phase 1, Phase 2)`

**Workflow Types:**

| Type              | When to Use                   | Pipeline Behavior                  |
| ----------------- | ----------------------------- | ---------------------------------- |
| **Feature**       | New functionality, multi-step | Full planning, dependency tracking |
| **Refactor**      | Code restructuring            | Add → Migrate → Remove stages      |
| **Investigation** | Debugging, root cause         | Reproduce → Investigate → Fix      |
| **Migration**     | Data/schema changes           | Backup → Transform → Validate      |
| **Simple**        | Quick fixes, single file      | Minimal overhead                   |

**Complexity Levels:**

| Level        | Scope                        | Planning Required              |
| ------------ | ---------------------------- | ------------------------------ |
| **Simple**   | 1-2 files, single concern    | Minimal subtasks               |
| **Standard** | 3-10 files, 1-2 services     | Detailed subtasks with phases  |
| **Complex**  | 10+ files, multiple services | Notes file, extensive planning |

**Update config after creating:**

```markdown
<!-- Config: Last Task ID: XXX -->  ← Increment this
```

### Step 2: Start Work (Change Status)

**Before starting**, complete the Pre-Work Checklist in the task, then:

1. **Update the Status field**: `todo` → `in-progress`
2. **Add Started date**
3. **(Optional)** Move task block to "In Progress" section for file clarity

```markdown
# Update Status field and add Started date:

**Priority**: High | **Category**: Feature | **Status**: in-progress
**Created**: 2026-01-13 | **Started**: 2026-01-13

**Pre-Work Checklist**:

- [x] Read relevant files
- [x] Searched for similar implementations
- [x] Identified patterns to follow
- [x] Reviewed known gotchas
```

**Status field is authoritative.** The UI auto-reorganizes mismatches on load. Moving blocks is optional but recommended when editing files directly.

**DO NOT skip the pre-work checklist.** This prevents pattern violations and duplicate code.

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

### Step 4: Self-Critique & Complete Task

**Before marking done**, run this self-critique:

```
☐ Code quality: No hardcoded values, proper error handling?
☐ Pattern compliance: Follows existing codebase conventions?
☐ Completeness: All subtasks genuinely finished?
☐ No regressions: Existing functionality preserved?
☐ Insights documented: Patterns/gotchas recorded in Notes?
```

**If any check fails:** Fix before marking done. Never defer issues.

**When ALL checks pass:**

1. **Update the Status field**: `in-progress` → `done`
2. **Add Finished date**
3. **(Optional)** Move task block to "Done" section for file clarity

```markdown
# Update Status field and add Finished date:

**Priority**: High | **Category**: Feature | **Status**: done
**Created**: 2026-01-13 | **Started**: 2026-01-13 | **Finished**: 2026-01-13
```

**Status field is authoritative.** The UI auto-reorganizes mismatches on load.

### Step 5: Commit with Task Reference

```bash
git commit -m "feat: description (TASK-XXX)"
```

---

## The 3-Strike Error Protocol

| Attempt | Action                                                                                 |
| ------- | -------------------------------------------------------------------------------------- |
| 1       | Diagnose & fix - identify root cause, apply targeted fix, log to Errors Log            |
| 2       | Alternative approach - different method/tool/library, NEVER repeat same failing action |
| 3       | Broader rethink - question assumptions, search for solutions, update plan              |
| After 3 | Escalate to user - explain what you tried, share specific error, ask for guidance      |

**Key principle:** Error recovery is a signal of true agentic behavior.

---

## Read vs Write Decision Matrix

| Situation             | Action                 | Reason                        |
| --------------------- | ---------------------- | ----------------------------- |
| Just wrote a file     | DON'T read             | Content still in context      |
| Viewed image/PDF      | Write notes NOW        | Multimodal → text before lost |
| Browser returned data | Write to notes         | Screenshots don't persist     |
| Starting new phase    | Read plan/notes        | Re-orient if context stale    |
| Error occurred        | Read relevant file     | Need current state to fix     |
| Resuming after gap    | Read tasks.md + notes/ | Recover full state            |

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

Key sections: Summary, Analysis, Patterns Discovered, Gotchas, Decisions, Resources, Action Items

- **Patterns** = "Do this" - reusable solutions
- **Gotchas** = "Don't do this" - mistakes to avoid

Link notes to task: `**Notes**: Documentation in notes/TASK-XXX.md`

---

## Status Values

| Status        | Description | Required Fields            |
| ------------- | ----------- | -------------------------- |
| `todo`        | Not started | Created                    |
| `in-progress` | Active work | Created, Started           |
| `done`        | Completed   | Created, Started, Finished |

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

The task-memory UI requires a specific markdown format. **See [UI_FORMAT.md](UI_FORMAT.md) for complete documentation.**

**Quick Reference:**

- Configuration section: `## ⚙️ Configuration` with Columns definition
- Column sections: `## To Do`, `## In Progress`, `## Done` (h2 level)
- Task headers: `### TASK-XXX | Title` (h3 level, under column sections)
- Status field must match column: `**Status**: todo|in-progress|done`
- No `---` separators between tasks (only after config section)

---

## Monorepo Support

task-memory supports flexible patterns for monorepos. **See [MONOREPO.md](MONOREPO.md) for complete documentation.**

**Quick Reference:**

- **Option A (Auto-Detected):** Per-package `planning/` folders - hooks find nearest tasks.md
- **Option B (Centralized):** Single `planning/` with domain subdirectories - add guidance to CLAUDE.md
- **Option C (Config-Based):** Explicit `.task-memory.json` mapping

---

## Common Mistakes

**See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for complete troubleshooting guide.**

**Quick Fixes:**
| Mistake | Prevention |
|---------|------------|
| Creating duplicate sections | Use EXISTING section headers |
| Adding `---` between tasks | Only use after config section |
| Working without task | Create TASK-XXX first |
| Skipping research preservation | Create notes after 2 visual ops |
| Repeating failed actions | Log error, try different approach |

---

## Verification Checklist

Before ANY work:

```
☐ Created TASK-XXX in tasks.md
☐ Set Workflow type and Complexity level
☐ Used proper format (Status field, subtasks, Errors Log)
☐ Incremented Last Task ID in config
☐ Completed Pre-Work Checklist (read files, search similar, identify patterns)
☐ Changed Status: todo → in-progress
☐ Added Started: date
```

During work:

```
☐ Updating subtasks as completed [x]
☐ Respecting phase dependencies
☐ Documenting in Notes section
☐ Logging errors to Errors Log
☐ Creating notes file after 2 visual ops
☐ Following 3-Strike Protocol on failures
```

After work:

```
☐ Ran Self-Critique checklist (quality, patterns, completeness)
☐ Documented patterns and gotchas discovered
☐ Changed Status: in-progress → done
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

## Phase Dependencies

For complex tasks, subtasks can declare dependencies:

```markdown
**Subtasks**:

- [x] Phase 1: Setup database schema
- [x] Phase 2: Create API endpoints (depends: Phase 1)
- [ ] Phase 3: Build frontend forms (depends: Phase 2)
- [ ] Phase 4: Integration tests (depends: Phase 2, Phase 3)
```

**Rules:**

- Never start a phase until its dependencies are complete
- Phases without dependencies can run in parallel
- Use `(depends: Phase X)` or `(depends: Phase X, Phase Y)` syntax

**Parallelism Analysis:**

When planning, identify which phases can run concurrently:

- Same dependencies = potentially parallel
- No overlapping files = safe to parallelize
- Different services/concerns = good candidates

---

**Version:** 2.7.0
**License:** MIT
