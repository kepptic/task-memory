# task-memory

Privacy-first Kanban task manager with Manus-style memory. Tasks remember your research across sessions.

## Install

### From GitHub (Marketplace)

```bash
# Add the marketplace
/plugin marketplace add kepptic/task-memory

# Install the plugin
/plugin install task-memory@kepptic
```

### Local Development

```bash
# From inside the plugin directory
/plugin install ./
```

### Standalone App (No Claude Code)

Download `task-manager.html` and open in Chrome/Edge/Opera.

## What It Does

**Task Manager:**
- Drag-and-drop Kanban board in a single HTML file
- Uses local markdown files in `tasks/` folder
- No cloud, no tracking, no accounts
- Git-native workflow

**Memory (Manus 2-Action Rule):**
- Auto-logs WebFetch/WebSearch operations to your current task
- Reminds you to preserve research after every 2 operations
- Research survives context resets

## Quick Start

1. Install the plugin
2. Create a task in `tasks/kanban.md` with `**Status**: in-progress`
3. Use Claude Code - your research gets logged automatically

### Example Task with Memory

```markdown
### TASK-001 | Research API patterns
**Priority**: High | **Category**: Feature | **Status**: in-progress
**Created**: 2026-01-11

Researching best practices for API design.

**Notes**:
Initial research notes.

**Visual Operations Log**:
- 2026-01-11 10:30:45 - WebFetch: https://docs.example.com/api
- 2026-01-11 10:31:22 - WebSearch: "REST API best practices"
```

## File Structure

The plugin creates a `tasks/` folder in your project:

```
your-project/
├── tasks/
│   ├── kanban.md       # Active tasks
│   ├── archive.md      # Completed tasks
│   └── findings/       # Research files
└── .task-memory.json   # Optional: custom config
```

### Custom Location

To change where tasks are stored, create `.task-memory.json` in your project root:

```json
{
  "tasks_dir": "docs/tasks"
}
```

This moves the kanban files to `docs/tasks/kanban.md`, etc.

## Features

- **Auto-creates structure** - `tasks/` folder created on first use
- **Markdown-native** - Plain text files, git-friendly
- **Auto-logging** - Research operations logged to current task
- **2-Action Rule** - Reminded to preserve findings every 2 operations
- **Configurable** - Move tasks anywhere via `.task-memory.json`
- **Archive system** - Completed tasks preserved with full history

## Requirements

**Plugin:**
- Claude Code CLI or VS Code extension
- Python 3.6+

**Standalone App:**
- Chrome 86+, Edge 86+, Opera 72+

## Plugin Structure

```
task-memory/
├── .claude-plugin/
│   ├── plugin.json        # Plugin metadata
│   └── marketplace.json   # Marketplace registry
├── hooks/
│   ├── hooks.json         # Hook configuration
│   └── task-memory.py     # PreToolUse hook
├── skills/
│   └── task-memory/
│       └── SKILL.md       # Skill definition
├── tasks/                  # Your kanban (created on use)
│   ├── kanban.md
│   ├── archive.md
│   └── findings/
├── templates/              # Kanban templates
├── examples/               # Example files
└── rules/                  # Workflow rules
```

## Attribution

This project builds on [MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager) by [@ioniks](https://github.com/ioniks) (MPL-2.0). The Manus philosophy is inspired by Meta AI research.

## License

MIT

---

**Install:** `/plugin marketplace add kepptic/task-memory`
