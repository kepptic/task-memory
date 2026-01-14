# task-memory

Privacy-first task manager with Manus-style memory. Tasks remember your research across sessions.

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

Download `task-memory.html` and open in Chrome/Edge/Opera.

## What It Does

**Task Manager:**
- Drag-and-drop task board in a single HTML file
- Uses local markdown files in `planning/` folder
- No cloud, no tracking, no accounts
- Git-native workflow

**Memory (Manus 2-Action Rule):**
- Auto-logs WebFetch/WebSearch operations to your current task
- Reminds you to preserve research after every 2 operations
- Research survives context resets

## Quick Start

1. Install the plugin
2. Create a task in `planning/tasks.md` with `**Status**: in-progress`
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

The plugin creates a `planning/` folder in your project:

```
your-project/
├── planning/
│   ├── tasks.md        # Active tasks
│   ├── archive.md      # Completed tasks
│   └── notes/          # Task documentation
└── .task-memory.json   # Optional: custom config
```

### Custom Location

To change where tasks are stored, create `.task-memory.json` in your project root:

```json
{
  "planning_dir": "docs/planning"
}
```

This moves the planning files to `docs/planning/tasks.md`, etc.

### Monorepo Support

Hooks auto-detect the nearest `planning/tasks.md` walking up from current directory:

```
monorepo/
├── packages/
│   ├── api/planning/tasks.md      ← Used when in api/
│   └── web/planning/tasks.md      ← Used when in web/
└── planning/tasks.md              ← Root fallback
```

See `skills/task-memory/SKILL.md` for detailed monorepo patterns.

## Features

- **Auto-creates structure** - `planning/` folder created on first use
- **Markdown-native** - Plain text files, git-friendly
- **Auto-logging** - Research operations logged to current task
- **2-Action Rule** - Reminded to preserve notes every 2 operations
- **Monorepo support** - Auto-detects nearest planning/ per package
- **Configurable** - Move planning anywhere via `.task-memory.json`
- **Archive system** - Completed tasks preserved with full history

## Requirements

**Plugin:**
- Claude Code CLI or VS Code extension
- Bash (standard on macOS and Linux)

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
│   ├── task-memory-hook.sh # Main hook handler
│   └── skill-eval.sh      # Context provider
├── skills/
│   ├── task-memory/
│   │   └── SKILL.md       # Task planning skill
│   └── task-status/
│       └── SKILL.md       # Status check skill
├── planning/               # Your tasks (created on use)
│   ├── tasks.md
│   ├── archive.md
│   └── notes/
├── examples/               # Example files
└── rules/                  # Workflow rules
```

## Attribution

This project builds on [MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager) by [@ioniks](https://github.com/ioniks) (MPL-2.0). The Manus philosophy is inspired by Meta AI research.

## License

MIT

---

**Install:** `/plugin marketplace add kepptic/task-memory`
