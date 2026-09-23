# Monorepo Support

task-memory supports three flexible patterns for monorepos. Choose the pattern that fits your project structure.

## Option A: Per-Package Planning (Auto-Detected)

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

## Option B: Centralized with Domain Subdirectories

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

## Option C: Configuration-Based

Explicit configuration in `.task-memory.json`.

**Single directory override:**
```json
{
  "planning_dir": "docs/planning"
}
```

**Several boards at once** — one glob, one aggregated view:
```json
{
  "planning_dir": "docs/todo",
  "task_files_glob": "docs/todo/*/tasks.md"
}
```

The hook reads in-progress tasks from every match, routes log appends to the
file that owns the task, and pins the TodoWrite mirror with
`todowrite_mirror_file`. Set `planning_dir` alongside the glob — without it,
notes default to `<root>/planning/notes/`, which may not be where the task
files live.

**Per-developer boards** (`tasks-gr.md`, `tasks-dg.md`) additionally want an
owner, so each machine's session works on its own board rather than whichever
file sorts first:

```json
{
  "task_files_glob": "docs/planning/*/tasks-*.md",
  "owner_git_users": { "your-git-username": "GR", "Teammate Name": "DG" },
  "todowrite_mirror_file": {
    "GR": "docs/planning/admin/tasks-gr.md",
    "DG": "docs/planning/admin/tasks-dg.md"
  }
}
```

See [REFERENCE.md](../../docs/REFERENCE.md#owner-resolution-v370) for the full
resolution order.

> **Not implemented:** a `planning_dirs` map (per-package planning directories
> selected by name). Older copies of this guide showed one; no version of the
> hook has ever read it. Use `planning_dir` plus `task_files_glob`, or Option A's
> nearest-ancestor auto-detection.

## CLAUDE.md Fallback

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
