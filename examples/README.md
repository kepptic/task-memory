# Examples

Canonical reference layout for a task-memory project. `tm-init` copies from these
files when bootstrapping a new project; agents consuming the plugin should treat
this directory as the source of truth for format, field names, and section order.

## Files

| Path | Purpose |
|------|---------|
| [tasks.md](tasks.md) | Active task board with one task in each of the 4 canonical columns |
| [archive.md](archive.md) | Archived completed tasks with preserved context |
| [notes/](notes/) | Per-task notes skeletons — Patterns, Gotchas, Decisions |
| [.task-memory.json](.task-memory.json) | Optional per-project config (planning_dir, thresholds) |

---

## Bootstrap

For most projects, the tm-init skill auto-invokes on setup (or run it explicitly with `/task-memory:tm-init`) — it reads from this directory, asks a couple of
configuration questions, and creates the right files in the right places. If you
need to do it by hand:

```bash
mkdir -p planning/notes
cp examples/tasks.md planning/tasks.md
cp examples/archive.md planning/archive.md
```

Do **not** copy the example `notes/` files to your project — those are reference
content. The hook will create skeletons for your own tasks on SessionStart.

---

## Task Format

Canonical 4-column board (what `tm-init` generates and the HTML kanban app expects):

```markdown
## ⚙️ Configuration

**Columns**: 📝 To Do (todo) | 🚀 In Progress (in-progress) | 👀 In Review (in-review) | ✅ Done (done)

## 📝 To Do

### TASK-001 | Short descriptive title

**Priority**: High | **Category**: Backend | **Status**: todo
**Workflow**: Feature | **Complexity**: Standard
**Assigned**: @username
**Created**: 2026-01-14
**Tags**: #backend #api

One-line description of the intent. Longer context goes in notes/TASK-001.md.

**Subtasks**:
- [ ] First step
- [ ] Second step

---
```

### Required fields

| Field | Values | Notes |
|-------|--------|-------|
| `TASK-XXX` | Auto-increment from `<!-- Config: Last Task ID -->` | Unique across the board |
| `Priority` | `Critical`, `High`, `Medium`, `Low` | Drives sort order within column |
| `Category` | From `Configuration.Categories` | Used for filtering |
| `Status` | `todo`, `in-progress`, `in-review`, `done` | **Authoritative** — hook reorganizes tasks into the section matching this value |
| `Created` | `YYYY-MM-DD` | Absolute dates only — never "today" or relative values |

### Recommended fields

| Field | Values | Why |
|-------|--------|-----|
| `Workflow` | `Feature`, `Bug`, `Investigation`, `Migration`, `Simple`, `Refactor` | Classifies the work shape |
| `Complexity` | `Simple`, `Standard`, `Complex` | Stop hook gates notes requirement on this — `Standard`/`Complex` demand substantive notes |
| `Assigned` | `@alice`, `@bob` | Who owns it |
| `Tags` | `#feature #urgent` | Free-form filters |

### State transition fields

| Field | When |
|-------|------|
| `Started` | The day work began (flip Status to `in-progress`) |
| `Finished` | The day work ended (flip Status to `done`) |

### Optional body sections

| Section | Populated by |
|---------|-------------|
| `**Subtasks**` | You, as a checkbox list |
| `**Notes**` | You, with a pointer to `notes/TASK-XXX.md` |
| `**Visual Operations Log**` | **Hook, automatically** — every `WebFetch`/`WebSearch` appends a line |
| `**Errors Log**` | **Hook, automatically** — Bash failures captured when relevant |

---

## The notes file — where research survives

The Stop hook will block on an `in-progress` task when:
- Research ops ≥ 2 OR `Complexity` is `Standard`/`Complex`, AND
- `notes/TASK-XXX.md` is missing or empty (only headers + placeholders).

On SessionStart, the hook pre-creates a skeleton at `planning/notes/TASK-XXX.md`
for every in-progress task. The skeleton has 6 sections — your job is to fill
them with non-skeleton content:

```markdown
# TASK-XXX Notes — <title>

## Summary
_One-paragraph answer to: what is this task doing and why?_

## Patterns Discovered
_Reusable techniques. Each bullet applies without re-reading source._

## Gotchas
_Pitfalls + failure modes so the next session doesn't repeat them._

## Decisions
_Choices made and rationale: `Decision — reason`._

## Resources
_Files, URLs, docs with a takeaway per line._

## Open Questions
_Verify before marking done._
```

See [`notes/TASK-002.md`](notes/TASK-002.md) and [`notes/TASK-003.md`](notes/TASK-003.md)
for filled-in examples.

---

## Pausing a task

When you need to stop work on a task without finishing it, flip its Status from
`in-progress` back to `todo`. The hook auto-reorganizes it into the To Do section
on the next Edit. Leave a short note in the body so future-you (or the next
session) knows why.

```markdown
Paused 2026-01-15 — blocked on TASK-006 auth middleware.
```

The Stop hook stops nagging as soon as there's no `in-progress` task.

---

## Off-topic sessions

Some sessions pivot to unrelated questions ("how does this other thing work")
while a task is active. For those, the Stop hook has an escape hatch:

```bash
touch .claude/state/task-memory/off-topic-<session-id>.flag
```

The hook prints this path in its Stop message. Once touched, the hook stops
blocking for the rest of the session. Cleared automatically on SessionEnd.

---

## Configuration (`.task-memory.json`)

All fields optional. Defaults are sensible.

| Field | Default | Purpose |
|-------|---------|---------|
| `planning_dir` | `planning` | Where tasks.md lives, relative to project root |
| `task_files_glob` | _(unset)_ | For monorepos spreading tasks across files (e.g. `docs/todo/*/tasks.md`) |
| `todowrite_mirror_file` | first file | Which file catches `TodoWrite` mirrors in multi-file mode |
| `task_prefix` | `TASK` | Prefix for task IDs — useful for `PROJECT-001` style |
| `min_engagements_to_block` | `3` | How many task-relevant tool uses before Stop can block |
| `session_state_max_age_hours` | `24` | GC threshold for orphaned session state files |

---

## Status workflow

```
todo → in-progress → in-review → done → (archive)
```

1. Create task with `**Status**: todo` under `## 📝 To Do`.
2. Start work: flip to `**Status**: in-progress`, add `**Started**: YYYY-MM-DD`.
3. Ready for review: flip to `**Status**: in-review`.
4. Accepted: flip to `**Status**: done`, add `**Finished**: YYYY-MM-DD`.
5. Archive: move the whole block to `archive.md` when the board is crowded.

The Status field is authoritative. If a task's Status doesn't match the section
it's in, the hook auto-reorganizes on the next Write/Edit.

---

## Environment variables

| Variable | Effect |
|----------|--------|
| `TASK_MEMORY_FORCE_STAMP=1` | Restore pre-3.3 blanket session stamping (any tool use marks task as "worked on"). Rarely needed. |

---

**Version:** 2.0.0 — aligned with task-memory plugin v3.3.
