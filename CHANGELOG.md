# Changelog

All notable changes to task-memory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kepptic/task-memory/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/kepptic/task-memory/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/kepptic/task-memory/compare/v1.0.1...v1.0.3
[1.0.1]: https://github.com/kepptic/task-memory/releases/tag/v1.0.1
