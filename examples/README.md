# Examples

This folder contains example files demonstrating the task-memory planning format.

## Files

| File | Description |
|------|-------------|
| [tasks.md](tasks.md) | Active task board with tasks in various states |
| [archive.md](archive.md) | Archived completed tasks with preserved context |
| [notes/](notes/) | Task documentation (research, audits, reviews, etc.) |

---

## Quick Start

Copy the planning folder to your project and start adding tasks:

```bash
mkdir -p planning/notes
cp examples/tasks.md ./planning/
cp examples/archive.md ./planning/
```

---

## Task Format

### Basic Task Structure

```markdown
### TASK-001 | Short descriptive title

**Priority**: High | **Category**: Backend | **Status**: todo
**Assigned**: @username
**Created**: 2026-01-12
**Tags**: #feature #api

Description of what needs to be done.

**Subtasks**:
- [ ] First step
- [ ] Second step

---
```

### Required Fields

| Field | Description |
|-------|-------------|
| `TASK-XXX` | Unique task ID (increment from config) |
| `Priority` | Critical, High, Medium, or Low |
| `Category` | Project category (defined in config) |
| `Status` | todo, in-progress, or done |
| `Created` | Date in YYYY-MM-DD format |

### Optional Fields

| Field | Description |
|-------|-------------|
| `Assigned` | User(s) assigned: `@alice, @bob` |
| `Started` | Date work began |
| `Finished` | Date work completed |
| `Tags` | Hashtags: `#feature #urgent` |
| `Subtasks` | Checkbox list of steps |
| `Notes` | Additional context |

---

## Visual Operations Log

When using WebFetch or WebSearch, operations are logged to the task's Notes section:

```markdown
**Notes**:
Research complete. Using React Query for data fetching.

**Visual Operations Log**:
- 2026-01-12 10:30:45 - WebFetch: https://tanstack.com/query
- 2026-01-12 10:32:18 - WebSearch: "React data fetching patterns"
```

This creates an audit trail of research that survives context resets.

---

## Notes (Task Documentation)

After 2+ visual operations, create a notes file to preserve insights:

```markdown
**Notes**:
Documentation in notes/TASK-001.md
```

Store task-related documentation in `notes/TASK-XXX.md`:
- Research findings and analysis
- Audit results (security, performance, accessibility)
- Code review notes and feedback
- Meeting notes and decisions
- Architecture decision records

---

## Configuration Section

The top of `tasks.md` contains configuration:

```markdown
# Task Board

<!-- Config: Last Task ID: 005 -->

## Configuration
**Columns**: To Do | In Progress | Done
**Categories**: Feature, Bug, Docs
**Users**: @alice, @bob
**Tags**: #feature #bug #urgent
```

- **Last Task ID**: Auto-incremented when creating new tasks
- **Columns**: Board columns (customize as needed)
- **Categories**: Valid task categories
- **Users**: Team members for assignment
- **Tags**: Common tags for filtering

---

## Status Workflow

```
todo → in-progress → done → (archive)
```

1. Create task with `**Status**: todo`
2. Start work: change to `**Status**: in-progress`, add `**Started**: YYYY-MM-DD`
3. Complete: change to `**Status**: done`, add `**Finished**: YYYY-MM-DD`
4. Archive: move to `archive.md` when no longer needed on board

---

## Tips

- **Always update the Last Task ID** when creating new tasks
- **Check off subtasks** as you complete them
- **Add notes** to document decisions and results
- **Reference notes files** for documentation
- **Archive regularly** to keep the board focused

---

**Version:** 1.0.0
