# Examples

This folder contains example files demonstrating the task-memory kanban format.

## Files

| File | Description |
|------|-------------|
| [kanban.md](kanban.md) | Active kanban board with tasks in various states |
| [archive.md](archive.md) | Archived completed tasks with preserved context |
| [findings/](findings/) | Research findings linked from tasks |

---

## Quick Start

Copy `kanban.md` to your project root and start adding tasks:

```bash
cp examples/kanban.md ./kanban.md
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

## Findings Files

After 2+ visual operations, create a findings file to preserve insights:

```markdown
**Notes**:
Research findings documented in findings/TASK-001.md
```

Store detailed research in `findings/TASK-XXX.md` and reference it from the task.

---

## Configuration Section

The top of `kanban.md` contains configuration:

```markdown
# Kanban Board

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
- **Reference findings files** for research tasks
- **Archive regularly** to keep the board focused

---

**Version:** 1.0.0
