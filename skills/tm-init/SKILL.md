---
name: tm-init
description: Initialize task-memory in a project. Detects monorepos, asks configuration questions, sets up planning directory, and updates CLAUDE.md. Use when setting up task-memory for the first time in a project. (Renamed from task-memory-init in 2.0 to avoid colliding with Claude Code's built-in /init command.)
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
---

# Task Memory Init

Initialize task-memory in the current project with interactive configuration.

## When to Use

- First time setting up task-memory in a project
- User runs `/task-memory-init` or `/init`
- After copying task-memory files to a new project

## Workflow

### Phase 1: Project Analysis

1. **Detect project type:**
   ```bash
   # Check for monorepo indicators
   ls package.json lerna.json pnpm-workspace.yaml turbo.json rush.json 2>/dev/null
   ls -d packages/ apps/ modules/ services/ 2>/dev/null
   ```

2. **Find existing planning directories:**
   ```bash
   find . -name "tasks.md" -o -name "planning" -type d 2>/dev/null | head -10
   ```

3. **Check for existing CLAUDE.md:**
   ```bash
   cat CLAUDE.md 2>/dev/null | head -20
   ```

### Phase 2: User Configuration

Ask the user these questions using AskUserQuestion:

**Question 1: Planning Location**
- Header: "Location"
- Question: "Where should task-memory store your tasks?"
- Options:
  - `planning/` (Recommended) - Standard location at project root
  - `docs/planning/` - Inside docs folder
  - `.planning/` - Hidden directory
  - Custom - Let me specify a path

**Question 2: Monorepo Mode** (only if monorepo detected)
- Header: "Monorepo"
- Question: "How should tasks be organized in this monorepo?"
- Options:
  - `Shared` (Recommended) - Single planning/ at root for all packages
  - `Per-package` - Each package gets its own planning/
  - `Hybrid` - Root for cross-cutting, per-package for specific

**Question 3: Task ID Prefix** (optional)
- Header: "Prefix"
- Question: "What prefix should task IDs use?"
- Options:
  - `TASK` (Recommended) - Standard prefix (TASK-001)
  - Project name - Use project name (e.g., MYAPP-001)
  - Custom - Let me specify

### Phase 3: Setup

1. **Create planning directory:**
   ```bash
   mkdir -p {planning_dir}
   mkdir -p {planning_dir}/notes
   ```

2. **If `{planning_dir}/tasks.md` already exists, DO NOT overwrite it.** Use AskUserQuestion to confirm before replacing. Prior Claude sessions commonly Write-over an existing tasks.md and destroy all task content. The plugin now blocks this at the hook level, but tm-init should also respect existing state: if tasks.md exists and has content, skip this step and tell the user the file is already initialized.

3. **Create tasks.md with the canonical template** (must match
   `src/utils/fileSystem.js:163` `generateInitialTaskFile()` exactly so the
   HTML kanban app and the hook agree on column structure):

   ```markdown
   # Task Board

   <!-- Config: Last Task ID: 0 -->

   ## ⚙️ Configuration

   **Columns**: 📝 To Do (todo) | 🚀 In Progress (in-progress) | 👀 In Review (in-review) | ✅ Done (done)

   **Categories**: Frontend, Backend, Design, DevOps, Tests, Documentation

   **Users**: @user (User)

   **Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

   **Tags**: #bug #feature #ui #backend #urgent #refactor #docs #test

   ---

   ## 📝 To Do

   ## 🚀 In Progress

   ## 👀 In Review

   ## ✅ Done
   ```

   **Do NOT improvise the format.** The Configuration block, emoji column
   names, and column IDs are how the parsers find tasks. Missing them
   means tasks render in wrong columns or not at all.

3. **Create archive.md:**
   ```markdown
   # Archived Tasks

   Tasks that have been completed and archived.

   ---
   ```

4. **Create or update CLAUDE.md:**

   If CLAUDE.md exists, append task-memory section:
   ```markdown

   ## Task Memory Integration

   This project uses task-memory for context-preserving task management.

   **Planning Location:** {planning_dir}/tasks.md

   **Skills:** `/task-memory` (full workflow) | `/task-status` (context check)

   **Rules:**
   - Create task before implementing
   - Update Status field to track progress
   - Reference task ID in commits: `feat: description (TASK-XXX)`
   ```

   If CLAUDE.md doesn't exist, create minimal version:
   ```markdown
   # {project_name}

   ## Task Memory Integration

   This project uses task-memory for context-preserving task management.

   **Planning Location:** {planning_dir}/tasks.md

   **On every prompt:** Determine if it's a TASK or QUESTION.
   - **TASK** (implement, fix, build): Create task in {planning_dir}/tasks.md first
   - **QUESTION** (what, how, why): Answer directly

   **Skills:** `/task-memory` (full workflow) | `/task-status` (context check)
   ```

5. **Create .task-memory.json if non-default location:**
   ```json
   {
     "planning_dir": "{planning_dir}",
     "task_prefix": "{prefix}"
   }
   ```

### Phase 4: Verification

1. **Verify setup:**
   ```bash
   ls -la {planning_dir}/
   cat {planning_dir}/tasks.md | head -10
   ```

2. **Show summary:**
   ```
   ✓ Task Memory initialized successfully!

   Planning directory: {planning_dir}/
   Tasks file: {planning_dir}/tasks.md
   Archive file: {planning_dir}/archive.md
   Notes folder: {planning_dir}/notes/

   Next steps:
   1. Run /task-memory to create your first task
   2. Run /task-status to check context at any time
   ```

## Monorepo Detection

**Indicators of monorepo:**
- `pnpm-workspace.yaml` exists
- `lerna.json` exists
- `turbo.json` exists
- `rush.json` exists
- `packages/` or `apps/` directories exist
- Multiple `package.json` files in subdirectories

**Per-package planning structure:**
```
monorepo/
├── packages/
│   ├── api/
│   │   └── planning/tasks.md
│   └── web/
│       └── planning/tasks.md
└── planning/tasks.md  # Cross-cutting tasks
```

## Examples

### Simple Project Init

```
User: /task-memory-init

Claude: I'll analyze your project and set up task-memory.

Detected: Single project (React app)
Existing CLAUDE.md: No

[Asks questions via AskUserQuestion]

Setting up with:
- Planning location: planning/
- Task prefix: TASK

✓ Created planning/tasks.md
✓ Created planning/archive.md
✓ Created planning/notes/
✓ Created CLAUDE.md with task-memory integration

Task Memory is ready! Run /task-memory to create your first task.
```

### Monorepo Init

```
User: /task-memory-init

Claude: I'll analyze your project and set up task-memory.

Detected: Monorepo (pnpm workspace with 3 packages)
- packages/api
- packages/web
- packages/shared

Existing CLAUDE.md: Yes (will append)

[Asks questions via AskUserQuestion]

Setting up with:
- Mode: Hybrid (root + per-package)
- Root planning: planning/
- Package planning: {package}/planning/

✓ Created planning/tasks.md (cross-cutting tasks)
✓ Created packages/api/planning/tasks.md
✓ Created packages/web/planning/tasks.md
✓ Updated CLAUDE.md with task-memory integration

Task Memory is ready! The nearest planning/tasks.md will be used automatically.
```

## Error Handling

- If planning directory already exists with tasks, ask before overwriting
- If CLAUDE.md has task-memory section, ask before updating
- If in a subdirectory of a monorepo, suggest running from root

---

**Version:** 1.0.0 | **License:** MIT
