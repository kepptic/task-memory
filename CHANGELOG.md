# Changelog

All notable changes to task-memory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-04-15

### Added
- **Split-kanban monorepos now first-class.** The HTML app discovers every `tasks.md` / `kanban.md` across `docs/todo/*/`, `planning/*/`, `docs/planning/`, and the repo root — not just the alphabetically-first one — and surfaces them in an in-app switcher. Setsail-style layouts (`docs/todo/{api,admin,public}/tasks.md`, three parallel kanbans) work out of the box: pick the repo root once in the project picker, then switch between admin/api/public inside the app without re-opening the directory.
- New `discoverAllTaskFiles(dirHandle)` in `utils/fileSystem.js` returns every match across the standard search paths as `[{ fileName, relativePath, isLegacy }, ...]`, deduped. `discoverTaskFile` is now a thin wrapper that returns the first entry (unchanged external behavior for single-file projects).
- Switcher dropdown gained a `(N kanbans)` label when more than one file is discovered, and each option renders as `<relativePath>/<fileName>` so you can tell them apart at a glance.

### Changed
- **BREAKING** (internal): `availableTaskFiles` state and `detectTaskFile().available` now contain `{ fileName, relativePath, isLegacy }` objects instead of plain filename strings. External consumers reading these fields must update. The search-order contract and the single-file `discoverTaskFile` return shape are unchanged.
- `handleSwitchTaskFile(target)` now accepts a `"<relativePath>:<fileName>"` key (what the switcher emits), a `{ fileName, relativePath }` object, or a bare filename (legacy — switches within the current project's directory). Persists both `taskFileName` and `taskFilePath` to IndexedDB so the right file loads next session.

### Unchanged
- Single-kanban projects behave identically to v2.3.0 — the switcher stays hidden when only one file is found. The Python hook is untouched (multi-file already handled via `task_files_glob` in `.task-memory.json`).

## [2.3.0] - 2026-04-15

### Added
- **Repo-root project picker with auto-discovery** — Pick the repository root (e.g. `loro/`) instead of the folder holding `tasks.md`, and task-memory will walk the tree to find the right file. This means the Recent Projects dropdown now shows the **repo name** (`loro`) instead of whatever the kanban subfolder happened to be called (`planning`, `todo`, `docs`…), so two projects that both keep tasks in `docs/planning/` are no longer indistinguishable.
- New `discoverTaskFile(dirHandle)` in `utils/fileSystem.js`. Search order: `<root>/tasks.md` → `<root>/kanban.md` → `planning/tasks.md` → `planning/kanban.md` → `docs/planning/tasks.md` → `docs/planning/kanban.md` → `docs/todo/<child>/tasks.md` (first child alphabetically) → `docs/todo/<child>/kanban.md`. First match wins; if none match, falls through to fresh-init at root like before.
- New `taskFilePath` field on each project record (empty string = root, else e.g. `"docs/planning"` or `"docs/todo/api"`). Persisted to IndexedDB so subsequent loads skip discovery and go straight to the right file.
- Project selector rows now show the resolved kanban path under the display name, e.g. `loro · docs/planning/tasks.md`, so you can see at a glance which file each project maps to.

### Changed
- `loadTaskFile(dirHandle, preferred)` now accepts either a string (legacy: filename at root) or `{ fileName, relativePath }`. All save paths (`saveKanbanFile`, `saveArchiveFile`) already operate on the resolved file handle, so writes land in the nested directory automatically.
- `saveDirectoryHandle(...)` gained an optional 5th `taskFilePath` argument. Existing callers without it keep working.

### Migration hint
Existing projects keep working as-is (records with no `taskFilePath` default to root lookup). To get the nicer repo-name display, **re-add your project by picking the repo root** — the dropdown will then show `loro` instead of `planning`.

## [2.2.0] - 2026-04-15

### Added
- **Multi-file kanban support** — New `task_files_glob` config field in `.task-memory.json` lets a project spread tasks across multiple kanban files (e.g. `docs/todo/*/tasks.md`). The hook now discovers all matching files, iterates them for in-progress tasks, and labels each one by its parent directory in SessionStart output. Example: Setsail keeps `docs/todo/api/tasks.md`, `docs/todo/admin/tasks.md`, `docs/todo/public/tasks.md`.
- `todowrite_mirror_file` config field (optional) to pin where TodoWrite items land when multi-file mode is active. Defaults to the first globbed file.

### Changed
- `read_tasks()` now takes an explicit `path` argument; all callers pass the specific file they operate on so multi-file writes don't scatter across the wrong kanban.
- `reorganize_tasks_file()` and `append_log_entry()` are now path-aware: reorganize runs only on the file that was just edited, log lines are written to whichever file owns the task ID.
- In multi-file mode, `ensure_tasks_structure()` no longer auto-creates `planning/tasks.md` — projects using the glob already manage their kanban files. Single-file mode unchanged.
- PreToolUse Write/Edit attention nudge now only fires when the edited file is the one owning the active in-progress task.

### Unchanged
- Existing single-file projects: no behavior change. When `task_files_glob` is absent, the hook behaves exactly as 2.1.0.

## [2.1.0] - 2026-04-15

### Added
- **Project groups** — Each recent project can be tagged with a free-text group. The Recent Projects dropdown now renders group section headers (e.g. `kepptic`, `clients`, `personal`) with ungrouped projects collected under an "Ungrouped" header.
- **Open Project dialog** — Opening a new project folder now prompts for a **Display name** and optional **Group** in a styled modal (with `<datalist>` autocomplete from existing groups) instead of silently saving the raw folder name.
- **Folder subtitle in selector** — Every row in the dropdown now shows the underlying folder name in small monospace text under the display name, so two projects named `tasks` or `planning` are no longer indistinguishable.
- **Inline group editing** — A tag-icon action on each row lets you edit a project's group in place; the group chip itself is also clickable to edit.
- **Dropdown filter** — When you have 5+ recent projects, a filter input appears at the top of the dropdown and matches against display name, folder name, and group.

### Changed
- `saveDirectoryHandle(handle, customName, taskFileName)` now also accepts an optional `group` argument. Existing records without a `group` field are treated as ungrouped — no migration required (IndexedDB tolerates extra fields).

## [2.0.0] - 2026-04-15

### Added
- **TodoWrite mirror** — `PostToolUse:TodoWrite` hook mirrors Claude's native todos into `planning/tasks.md` under a `## From TodoWrite` section. Items matching existing `### TASK-*` headings are skipped to avoid double-writing.
- **`PreCompact` handler** — writes a full snapshot of the current in-progress task, recent Visual Operations Log and Errors Log entries, and compaction trigger to `planning/notes/{TASK}-precompact-{timestamp}.md` before Claude Code compacts context.
- **`PostCompact` handler** — restores task context on the other side of compaction (shares the SessionStart handler).
- **`SubagentStop` handler** — same completion checks as `Stop` apply to sub-agents.
- **`Task` tool in PreToolUse matcher** — sub-agent spawns now bind to the current task.
- **`monitors` manifest entry** in `plugin.json` so live task progress shows in `/agents`.

### Changed
- **Rewrote `task-memory-hook.sh` (558 LOC of bash) as `task-memory-hook.py` (~610 LOC, Python 3.11 stdlib)** — eliminates `sed -i.bak` macOS/GNU divergence, drops brittle `grep -oE` JSON parsing, replaces `set -e` + `grep -c` abort-on-zero footguns. `skill-eval.sh` stays as a tiny bash shim (~25 LOC) that delegates to the Python hook.
- **Moved research from PreToolUse to PostToolUse** — `WebFetch` / `WebSearch` logging now captures the response snippet (the *finding*), not just the attempt. URL + first 120 chars of the response land in the Visual Operations Log.
- **State files moved out of `/tmp`** — counters and session files now live under `$CLAUDE_PROJECT_DIR/.claude/state/task-memory/` instead of `/tmp/task-memory-*`. Avoids cross-project leakage and reboot loss. Added to `.gitignore`.
- **`SessionEnd` decoupled from `Stop`** — `SessionEnd` now flushes session state and never emits `{"decision":"block"}`. Only `Stop` / `SubagentStop` gate on task completion.
- **JSON parsing now uses `json` stdlib (Python) or `jq` (bash)** — the old `grep -oE '"tool_input"...{[^}]*}'` pattern broke on nested objects and newlines.
- **Renamed `task-memory-init` skill to `tm-init`** — avoids collision with Claude Code's built-in `/init` command.

### Fixed
- `set -e` combined with `grep -c` (returns 1 on zero matches) would abort the hook mid-run. The Python rewrite removes the whole class.
- `sed -i.bak` fallback files (`tasks.md.bak`) no longer created on every run — Python does atomic rewrites.
- WebFetch/WebSearch logging no longer misses the response (was logged *before* the tool executed).
- Task-block parsing no longer mis-counts subtasks when a task block contains nested `---` horizontal rules (block boundaries now derived from `### TASK-*` headings instead of `---`).

### Migration Notes
- Delete any `/tmp/task-memory-*` files — the plugin won't read them anymore.
- If you had `/task-memory-init` bound somewhere, update to `/tm-init`.
- Plugin consumers should re-install to pick up the new `hooks.json` matcher set.

## [1.1.0] - 2026-01-16

### Added
- Project-level hook configuration in `.claude/settings.json` for automatic loading on git clone
- Comprehensive README with installation options (git clone, copy files, plugin, standalone)
- Troubleshooting guide in README
- MONOREPO.md documentation for multi-package setups
- TROUBLESHOOTING.md for common issues
- UI_FORMAT.md for task markdown format reference

### Changed
- Hooks now use `$CLAUDE_PROJECT_DIR` for project settings (git clone installs)
- Hooks use `${CLAUDE_PLUGIN_ROOT}` for plugin installations
- Reorganized documentation structure
- Synced skills and hooks between root and `.claude/` directories

### Fixed
- Hooks not auto-loading for users who git clone the repository
- Consistent file structure between plugin and project installations

## [1.0.3] - 2026-01-14

### Added
- Auto-reorganization feature - tasks automatically move to correct section when Status field changes
- Workflow type classification (Feature, Refactor, Investigation, Migration, Simple)
- Complexity assessment (Simple, Standard, Complex)
- Pre-work checklist enforcement
- Phase dependencies in subtasks

### Changed
- Status field is now authoritative for task state
- UI reads Status field value, not section placement

## [1.0.1] - 2026-01-12

### Added
- Initial release of task-memory plugin
- Kanban board with task tracking (`planning/tasks.md`)
- Visual Operations Log for research preservation
- Errors Log for learning from failures
- Task archive for completed tasks (`planning/archive.md`)
- Notes files for detailed research (`planning/notes/`)
- Intelligent skill evaluation (task vs question detection)
- Session hooks for context management:
  - `SessionStart` - Display current task progress
  - `PreToolUse` - Refresh context, log research operations
  - `PostToolUse` - Subtask reminders, error logging
  - `Stop` - Verify task completion
- 2-Action Rule reminder for research preservation
- Web-based kanban viewer (`task-memory.html`)

### Based On
- [Manus Context Engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) principles
- [MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager) by @ioniks

[Unreleased]: https://github.com/kepptic/task-memory/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/kepptic/task-memory/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/kepptic/task-memory/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/kepptic/task-memory/compare/v1.0.1...v1.0.3
[1.0.1]: https://github.com/kepptic/task-memory/releases/tag/v1.0.1
