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
