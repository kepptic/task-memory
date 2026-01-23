# Task Memory

> Context-preserving task management for Claude Code. Your research survives context resets.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Compatible-orange.svg)](https://claude.ai/code)

**Task Memory** gives AI coding assistants persistent memory through markdown files. It automatically logs research operations, preserves context across sessions, and enforces task completion before stopping.

```
"What was I working on? What did I learn? What's next?"
```

## Features

- **Automatic Research Logging** - WebFetch/WebSearch operations logged to your current task
- **Context Preservation** - Tasks, notes, and errors persist across sessions
- **2-Action Rule** - Reminds you to save findings after every 2 research operations
- **Session Tracking** - Stop hook only blocks for tasks worked on in the current session
- **Kanban Board** - Visual task management in a single HTML file (works offline)
- **Monorepo Support** - Auto-detects nearest `planning/tasks.md`

## Quick Start

### Option 1: Git Clone (Recommended)

```bash
git clone https://github.com/kepptic/task-memory.git
cd task-memory
claude  # Hooks load automatically
```

### Option 2: Add to Existing Project

```bash
# Copy plugin files to your project
cp -r hooks/ skills/ rules/ /path/to/your-project/
mkdir -p /path/to/your-project/.claude
cp .claude/settings.json /path/to/your-project/.claude/
chmod +x /path/to/your-project/hooks/*.sh

# Run interactive setup
cd /path/to/your-project
claude
# Then run: /task-memory-init
```

### Option 3: Plugin Install

```bash
/plugin marketplace add kepptic/task-memory
/plugin install task-memory@kepptic
```

### Option 4: Standalone HTML App

Download [`task-memory.html`](task-memory.html) and open in Chrome/Edge/Opera. Works offline, no installation required.

## How It Works

### 1. Create a Task

Add to `planning/tasks.md`:

```markdown
### TASK-001 | Research API patterns

**Priority**: High | **Category**: Feature | **Status**: in-progress
**Created**: 2026-01-17

Researching best practices for API design.

**Subtasks**:
- [ ] Review existing patterns
- [ ] Document findings
- [ ] Implement solution

**Notes**:

**Visual Operations Log**:
```

### 2. Work Normally

Claude Code automatically:
- Shows task context on session start
- Logs WebFetch/WebSearch to the current task
- Reminds you to save research after 2 operations
- Blocks session end if subtasks are incomplete (for tasks worked on this session)

### 3. Review Your Work

Your research is preserved:

```markdown
**Visual Operations Log**:
- 2026-01-17 10:30:45 - WebFetch: https://docs.example.com/api
- 2026-01-17 10:31:22 - WebSearch: "REST API best practices"

**Errors Log**:
- 2026-01-17 10:35:00 - Error: npm ERR! missing script: build
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/GETTING_STARTED.md) | Step-by-step setup guide |
| [Architecture](docs/ARCHITECTURE.md) | System design and data flow |
| [Skill Guide](skills/task-memory/SKILL.md) | Full workflow documentation |
| [Troubleshooting](skills/task-memory/TROUBLESHOOTING.md) | Common issues and solutions |
| [Monorepo Setup](skills/task-memory/MONOREPO.md) | Multi-package configuration |

## Skills

| Command | Purpose |
|---------|---------|
| `/task-memory-init` | Initialize task-memory in a new project |
| `/task-memory` | Full task planning workflow |
| `/task-status` | Quick context check (5-Question Reboot Test) |

## File Structure

```
your-project/
├── hooks/                 # Hook scripts
│   ├── hooks.json         # Plugin config (uses ${CLAUDE_PLUGIN_ROOT})
│   ├── task-memory-hook.sh
│   └── skill-eval.sh
├── skills/                # Skill definitions
│   ├── task-memory/
│   └── task-status/
├── rules/                 # Workflow rules
├── .claude/
│   ├── settings.json      # Project config (uses $CLAUDE_PROJECT_DIR)
│   ├── hooks/ → ../hooks/ # Symlinks for local testing
│   ├── skills/ → ../skills/
│   └── rules/ → ../rules/
├── planning/
│   ├── tasks.md           # Active tasks
│   ├── archive.md         # Completed tasks
│   └── notes/             # Research documentation
└── .task-memory.json      # Optional: custom config
```

## Hook Events

| Event | Action |
|-------|--------|
| **SessionStart** | Display current task and progress |
| **UserPromptSubmit** | Show task context |
| **PreToolUse** (Write/Edit/Bash) | Refresh task context |
| **PreToolUse** (WebFetch/WebSearch) | Log to Visual Operations Log |
| **PostToolUse** (Bash errors) | Log to Errors Log |
| **Stop** | Block if session tasks have incomplete subtasks |

## Configuration

### Custom Planning Location

Create `.task-memory.json` in your project root:

```json
{
  "planning_dir": "docs/planning"
}
```

### Monorepo Support

Hooks auto-detect the nearest `planning/tasks.md`:

```
monorepo/
├── packages/
│   ├── api/planning/tasks.md    # Used when in api/
│   └── web/planning/tasks.md    # Used when in web/
└── planning/tasks.md            # Root fallback
```

## Requirements

**For Claude Code integration:**
- Claude Code CLI or VS Code extension
- Bash (macOS, Linux, WSL)

**For standalone app:**
- Chrome 91+, Edge 91+, or Opera 77+
- (Safari/Firefox not supported - no File System Access API)

## Philosophy

Based on [Manus Context Engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus):

1. **File System as Memory** - Tasks and notes persist in markdown
2. **Recitation Pattern** - Context refreshed before implementation
3. **Keep Errors In** - Failures logged for learning
4. **2-Action Rule** - Research saved before context is lost
5. **Never Repeat Failures** - 3-Strike Protocol for error recovery

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

This project has two contribution paths:
- **Plugin/Hooks** - Shell scripts and Claude Code integration
- **React App** - Kanban UI built with Vite

## Attribution

Builds on [MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager) by [@ioniks](https://github.com/ioniks) (MPL-2.0).

Inspired by [Backlog.md](https://github.com/MrLesk/Backlog.md) by [@MrLesk](https://github.com/MrLesk).

See [ATTRIBUTION.md](ATTRIBUTION.md) for full credits.

## License

MIT - see [LICENSE](LICENSE)

---

**Quick Install:** `git clone https://github.com/kepptic/task-memory.git && cd task-memory && claude`
