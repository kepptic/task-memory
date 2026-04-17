# Task Memory

> Context-preserving task management for Claude Code **and** Cowork. Your research survives context resets.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Compatible-orange.svg)](https://claude.ai/code)
[![Cowork](https://img.shields.io/badge/Cowork-Sideload-7c6fff.svg)](https://claude.ai/download)

**Task Memory** gives AI assistants persistent memory through markdown files. It automatically logs research operations, preserves context across sessions, and enforces task completion before stopping.

As of v3.2.0 the plugin ships in **dual format** — the same artifact installs into Claude Code (via the kepptic marketplace) and Cowork (via sideloaded `.plugin` archive). Skills, commands, and the Python context-preservation hook are byte-identical across both runtimes.

```
"What was I working on? What did I learn? What's next?"
```

## Features

- **Automatic Research Logging** — WebFetch/WebSearch operations logged to your current task
- **Context Preservation** — Tasks, notes, and errors persist across sessions
- **Proactive Notes Skeletons** — `planning/notes/TASK-XXX.md` auto-created on SessionStart for every in-progress task, with structural sections (Summary, Patterns, Gotchas, Decisions, Resources, Open Questions)
- **Scoped Session Tracking** — Stop hook only blocks when tool use actually touches the task (tasks.md, notes file, paths in block, or task ID in Bash/Task input). Off-topic questions don't trap the model in a block loop
- **Engagement Threshold** — Short sessions (fewer than 3 task-relevant tool uses) never block Stop — prevents "asked one question, can't stop"
- **Off-topic Escape Hatch** — `touch .claude/state/task-memory/off-topic-<session>.flag` to disable blocking for the rest of the session
- **Sticky Loop Release** — After 2 consecutive Stop blocks, the hook gives up and won't re-nag for the same session+task
- **Session-state GC** — Orphaned state files from crashed sessions are swept on SessionStart (configurable via `session_state_max_age_hours`)
- **Kanban Board** — Visual task management in a single HTML file (works offline)
- **Monorepo Support** — Auto-detects nearest `planning/tasks.md`, or use `task_files_glob` for split kanbans

## Quick Start

### Install in Claude Code (Recommended)

```bash
/plugin marketplace add kepptic/task-memory
/plugin install task-memory@kepptic
```

Then `cd` into any project and run `/tm-init`. The hook wires up automatically.

### Install in Cowork

Cowork uses sideloaded plugin archives. Either:

1. **Build the archive yourself:**
   ```bash
   git clone https://github.com/kepptic/task-memory.git
   cd task-memory
   scripts/build-cowork-plugin.sh
   # Produces: dist/task-memory-<version>.plugin
   ```
2. **Or download the prebuilt archive** from the [Releases](https://github.com/kepptic/task-memory/releases) page.

Then in Cowork: drag the `.plugin` file into the chat, or use the **Install plugin** menu and point it at the file. After install, invoke `/tm-init` to bootstrap a project.

### Git Clone (Development)

```bash
git clone https://github.com/kepptic/task-memory.git
cd task-memory
claude  # Hooks load automatically via .claude/settings.json
```

### Add to an Existing Project

```bash
cp -r hooks/ skills/ rules/ /path/to/your-project/
mkdir -p /path/to/your-project/.claude
cp .claude/settings.json /path/to/your-project/.claude/
chmod +x /path/to/your-project/hooks/*.sh

cd /path/to/your-project
claude
# Then run: /tm-init
```

### Standalone HTML App

Download [`task-memory.html`](task-memory.html) and open in Chrome/Edge/Opera. Works offline, no installation required — useful if you just want the Kanban viewer without the automation.

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
| `/tm-init` | Initialize task-memory in a new project (was `/task-memory-init` in v1) |
| `/task-memory` | Full task planning workflow |
| `/task-status` | Quick context check (5-Question Reboot Test) |

## File Structure

```
task-memory/
├── .claude-plugin/
│   ├── plugin.json        # Manifest (same path for Claude Code + Cowork)
│   └── marketplace.json   # Claude Code marketplace metadata
├── hooks/                 # Hook scripts (command-type, portable across both runtimes)
│   ├── hooks.json         # Hook config (uses ${CLAUDE_PLUGIN_ROOT})
│   ├── task-memory-hook.py   # Main hook (Python 3.11+ stdlib only)
│   └── skill-eval.sh         # UserPromptSubmit shim
├── commands/              # Slash command wrappers (Cowork convention, also works in Claude Code)
│   ├── tm-init.md
│   ├── task-memory.md
│   └── task-status.md
├── skills/                # Skill definitions (same format in both runtimes)
│   ├── tm-init/
│   ├── task-memory/
│   └── task-status/
├── scripts/
│   └── build-cowork-plugin.sh   # Produces dist/*.plugin archive for Cowork sideload
├── rules/                 # Workflow rules
└── .claude/
    └── settings.json      # Local dev: hooks point at $CLAUDE_PROJECT_DIR paths
```

Inside a project that *uses* task-memory:

```
your-project/
├── planning/
│   ├── tasks.md           # Active tasks (created by /tm-init)
│   ├── archive.md         # Completed tasks
│   └── notes/             # Per-task research preservation
└── .task-memory.json      # Optional: custom planning_dir or task_prefix
```

## Hook Events

| Event | Action |
|-------|--------|
| **SessionStart** / **PostCompact** | Display current task and progress |
| **UserPromptSubmit** | Show task context |
| **PreToolUse** (Write/Edit/Bash/Task) | Refresh task context, bind work to current task |
| **PostToolUse** (WebFetch/WebSearch) | Log URL + response snippet to Visual Operations Log |
| **PostToolUse** (TodoWrite) | Mirror native todos into `planning/tasks.md` under `## From TodoWrite` |
| **PostToolUse** (Bash errors) | Log to Errors Log |
| **PreCompact** | Dump current task + research log + todos to `planning/notes/{TASK}-precompact-{ts}.md` |
| **Stop** / **SubagentStop** | Block if session tasks have incomplete subtasks |
| **SessionEnd** | Flush session state (never blocks) |

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
