# task-memory

## Mission

**Task Memory** is a context-preserving task system for Claude Code. It answers:
> "What was I working on? What did I learn? What's next?"

This is an **open source** project. Quality matters. Every task must be verifiable, every workflow must be reproducible.

---

## Quick Start

This project uses the **task-memory** plugin for task tracking.

**On every prompt:** Determine if it's a TASK or QUESTION.
- **TASK** (implement, fix, build, create): Create task in `planning/tasks.md` first
- **QUESTION** (what, how, why, explain): Answer directly

**Skills:** `/task-memory` (full workflow) | `/task-status` (context check)

**Install:** `/plugin install task-memory@kepptic`

---

## Task Placement: Auto-Fix Enabled

The UI now **automatically fixes** tasks that are in the wrong section:

1. **Status field is authoritative** - The UI reads the `**Status**:` field value
2. **Auto-reorganization** - On load, if a task's Status doesn't match its section, it's automatically moved
3. **Notification** - You'll see "X tasks auto-moved to correct section"

### How It Works

```
Status: done → Task displays in Done column, regardless of markdown section
            → File is automatically rewritten with task in correct section
```

### Best Practice (Still Recommended)

When creating tasks, place them under the matching section to avoid churn:

```
Status: todo        → Place under ## 📝 To Do (or ## To Do)
Status: in-progress → Place under ## 🚧 In Progress (or ## In Progress)
Status: done        → Place under ## ✅ Done (or ## Done)
```

**Verification (optional):**
```bash
grep -B 3 "^### TASK-XXX" planning/tasks.md | head -4
```

---

## Task Creation Rules

### Rule 1: Verify the Task is Actionable

Before creating a task, verify it answers ALL of these:
- **What** exactly needs to be done? (not vague)
- **Where** in the codebase? (specific files or areas)
- **Why** does this matter? (context)
- **Done when** what is true? (acceptance criteria)

If you can't answer one, do lightweight research first.

### Rule 2: Classify Workflow Type

| Type | Characteristics | When to Use |
|------|-----------------|-------------|
| **Simple** | 1-2 files, single concern | Quick fixes, typos, small changes |
| **Feature** | 3-10 files, new functionality | New components, integrations |
| **Refactor** | Affects existing patterns | Add → Migrate → Remove stages |
| **Investigation** | Unknown solution | Debugging, research, root cause |
| **Migration** | Data/infrastructure change | Schema changes, upgrades |

Add to task: `**Workflow**: Feature`

### Rule 3: Assess Complexity

| Level | Scope | Planning Required |
|-------|-------|-------------------|
| **Simple** | 1-2 files | Minimal subtasks |
| **Standard** | 3-10 files | Detailed subtasks with phases |
| **Complex** | 10+ files | Notes file, extensive planning |

Add to task: `**Complexity**: Standard`

**Rule:** When uncertain, pick higher. Under-planning causes failures.

### Rule 4: Use Phase Dependencies for Complex Work

```markdown
**Subtasks**:
- [ ] Phase 1: Setup foundation
- [ ] Phase 2: Core implementation (depends: Phase 1)
- [ ] Phase 3: Testing (depends: Phase 2)
```

### Rule 5: Complete Pre-Work Checklist

Before coding:
- [ ] Read relevant files
- [ ] Searched for similar implementations
- [ ] Identified patterns to follow
- [ ] Reviewed known gotchas for this area

### Rule 6: Self-Critique Before Done

Before marking `Status: done`:
- [ ] All subtasks completed (not skipped)
- [ ] Code quality: no hardcoded values, proper error handling
- [ ] Pattern compliance: follows existing conventions
- [ ] Build succeeds without errors
- [ ] Task is under correct section header (## Done)

---

## Common Failure Patterns

| Failure | Cause | Prevention |
|---------|-------|------------|
| Task in wrong section | Status field doesn't match section | **Verify section placement** after writing |
| Task too vague | No acceptance criteria | Define "done when" criteria |
| Work unfinished | Complexity underestimated | Assess complexity conservatively |
| Wrong pattern used | Didn't check existing code | Pre-work: search for similar implementations |
| Bug introduced | Skipped self-critique | Complete Rule 6 before marking done |
| Context lost | No notes captured | Document insights in Notes section |

---

## Session Memory (Preserve Learning)

After completing complex tasks, add to **Notes**:

```markdown
**Insights**:
| Type | Discovery |
|------|-----------|
| Pattern | [reusable technique] |
| Gotcha | [pitfall and prevention] |
```

This prevents repeating mistakes across sessions.

---

## File Structure Requirement

The UI parses tasks by their **position under section headers**, not by field values:

```markdown
## 📝 To Do           ← Section header (h2)

### TASK-001 | Title  ← Task header (h3) - MUST be under matching section
**Status**: todo      ← Status MUST match section

## 🚧 In Progress

### TASK-002 | Title
**Status**: in-progress

## ✅ Done

### TASK-003 | Title
**Status**: done      ← This task is "done" because it's under ## Done
```

**Invalid:**
```markdown
## 🚧 In Progress

### TASK-003 | Title
**Status**: done      ← WRONG: Status says "done" but task is under "In Progress"
```

---

## When NOT to Create a Task

Ask for clarification if:
- The requirement is vague (e.g., "improve navbar")
- You don't know where to start
- You're unsure about the right approach
- The scope might be larger than expected

**Better to ask than create a bad task.**

---

> A well-specified task prevents 80% of implementation failures.
> Spend 10 minutes planning to save 1 hour of debugging.
