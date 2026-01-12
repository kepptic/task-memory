# Changelog

All notable changes to task-memory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-01-12

### Added
- Initial release of task-memory plugin
- Kanban board with task tracking (`tasks/kanban.md`)
- Visual Operations Log for research preservation
- Errors Log for learning from failures
- Task archive for completed tasks (`tasks/archive.md`)
- Findings files for detailed research notes (`tasks/findings/`)
- Intelligent skill evaluation (task vs question detection)
- Session hooks for context management:
  - `SessionStart` - Display current task progress
  - `PreToolUse` - Refresh context, log research operations
  - `PostToolUse` - Subtask reminders, error logging
  - `Stop` - Verify task completion
- 2-Action Rule reminder for research preservation
- Python 3 requirement check with graceful fallback
- Web-based kanban viewer (`task-memory.html`)

### Based On
- [Manus Context Engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) principles
- [planning-with-files](https://github.com/kepptic/planning-with-files) workflow

[Unreleased]: https://github.com/kepptic/task-memory/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/kepptic/task-memory/releases/tag/v1.0.0
