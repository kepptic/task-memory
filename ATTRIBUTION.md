# Attribution

Task Memory stands on the shoulders of several excellent projects and ideas.

## Core Architecture

### MarkdownTaskManager

**Author:** [@ioniks](https://github.com/ioniks)
**Repository:** [github.com/ioniks/MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager)
**License:** Mozilla Public License 2.0 (MPL-2.0)

Task Memory's single-file HTML Kanban application is built on MarkdownTaskManager. Key contributions:

- Single-file HTML application architecture
- File System Access API integration for local file editing
- Markdown-native task format with frontmatter-style fields
- Local-first, zero-server design philosophy
- Drag-and-drop Kanban board implementation

### Backlog.md

**Author:** [@MrLesk](https://github.com/MrLesk)
**Repository:** [github.com/MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md)

Inspired patterns for AI assistant integration and markdown-based project management.

## Philosophy & Methodology

### Manus Context Engineering

**Source:** [Manus Blog - Context Engineering for AI Agents](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)

Core concepts adapted for Task Memory:

| Concept | Implementation |
|---------|----------------|
| File System as Memory | Tasks and notes persist in markdown files |
| Recitation Pattern | Context refreshed via hooks before implementation |
| Keep Errors In | Bash failures logged to Errors Log section |
| 2-Action Rule | Research auto-saved after 2 WebFetch/WebSearch operations |
| Never Repeat Failures | 3-Strike Protocol for error recovery |

### Auto-Claude Patterns

**Repository:** [github.com/lxe/auto-claude](https://github.com/lxe/auto-claude)

Influenced session tracking and stop-blocking behavior for task completion enforcement.

## What Task Memory Adds

Beyond the original projects, Task Memory contributes:

- **Claude Code Hooks Integration** - SessionStart, PreToolUse, PostToolUse, Stop events
- **Session Tracking** - Stop hook only blocks tasks worked on in current session
- **Visual Operations Logging** - Automatic research operation tracking
- **Auto-Reorganization** - Tasks move to correct sections when Status changes
- **Skill System** - `/task-memory` and `/task-status` slash commands
- **Monorepo Support** - Auto-detection of nearest planning directory
- **Plugin Distribution** - `/plugin install` compatibility

## License Structure

| Component | License | Author |
|-----------|---------|--------|
| Kanban UI architecture | MPL-2.0 | ioniks |
| Hooks, skills, rules | MIT | kepptic |
| Documentation | MIT | kepptic |

## Links

- **Task Memory:** [github.com/kepptic/task-memory](https://github.com/kepptic/task-memory)
- **MarkdownTaskManager:** [github.com/ioniks/MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager)
- **Backlog.md:** [github.com/MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md)
- **Manus Context Engineering:** [manus.im/blog](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)

---

Thank you to all contributors and the open source community.
