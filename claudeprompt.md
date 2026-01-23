# Task Memory Integration

Copy this section into your project's CLAUDE.md file.

---

## Task Memory

**Quick Start:** `/plugin install task-memory@kepptic`

### TASK vs QUESTION

On every prompt, determine:

- **TASK** (implement, fix, build, create): Create task in `planning/tasks.md` first
- **QUESTION** (what, how, why, explain): Answer directly

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/task-memory` | Full task planning workflow |
| `/task-status` | Quick context check (5-Question Reboot Test) |

### Workflow

1. Create task with `**Status**: in-progress`
2. Complete subtasks, log research to Notes section
3. Self-critique before marking `**Status**: done`
4. Commit with task reference: `feat: description (TASK-XXX)`

### Key Rules

- **Status Field is Authoritative** - UI reads `**Status**:` value
- **Pre-Work Checklist** - Read files, search patterns before coding
- **2-Action Rule** - After 2 research ops, save to `planning/notes/TASK-XXX.md`
- **Session Tracking** - Stop hook only blocks tasks worked on THIS session

### Task Template

```markdown
### TASK-XXX | Title

**Priority**: High | **Category**: Feature | **Status**: todo
**Workflow**: Feature | **Complexity**: Standard
**Created**: YYYY-MM-DD

Description...

**Subtasks**:
- [ ] First step
- [ ] Second step (depends: First step)

**Notes**:
```

### File Structure

```
planning/
├── tasks.md      # Active tasks
├── archive.md    # Completed tasks
└── notes/        # Research documentation
```

> A well-specified task prevents 80% of implementation failures.
