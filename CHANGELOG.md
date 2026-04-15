# Changelog

All notable changes to task-memory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
