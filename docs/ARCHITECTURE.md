# Architecture

This document describes the system design, data flow, and component interactions in Task Memory.

## Overview

Task Memory consists of three main components:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Task Memory                               │
├─────────────────┬─────────────────────┬─────────────────────────┤
│   React App     │   Claude Code       │   Markdown Files        │
│   (Kanban UI)   │   (Hooks + Skills)  │   (Data Storage)        │
├─────────────────┼─────────────────────┼─────────────────────────┤
│ task-memory.html│ .claude/hooks/      │ planning/tasks.md       │
│ src/            │ .claude/skills/     │ planning/archive.md     │
│                 │ .claude/settings.json│ planning/notes/        │
└─────────────────┴─────────────────────┴─────────────────────────┘
```

## Data Flow

### 1. Task Creation Flow

```
User creates task in tasks.md
         │
         ▼
┌─────────────────────────┐
│ planning/tasks.md       │ ◄─── Source of truth
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ React App parses        │
│ markdown → task objects │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Kanban UI renders       │
│ tasks in columns        │
└─────────────────────────┘
```

### 2. Hook Lifecycle

```
Claude Code Event          Hook Script              Action
─────────────────────────────────────────────────────────────────
SessionStart        →   task-memory-hook.sh   →   Display current task
                                                   Record session task

UserPromptSubmit    →   skill-eval.sh         →   Detect TASK vs QUESTION
                                                   Show task context

PreToolUse          →   task-memory-hook.sh   →   Refresh context (Write/Edit/Bash)
(Write/Edit/Bash)                                  Record session task

PreToolUse          →   task-memory-hook.sh   →   Log to Visual Operations Log
(WebFetch/WebSearch)                               Trigger 2-Action Rule reminder

PostToolUse         →   task-memory-hook.sh   →   Subtask completion reminder
(Write/Edit/Bash)                                  Error logging (Bash failures)

Stop                →   task-memory-hook.sh   →   Check session task completion
                                                   Block if subtasks incomplete
                                                   Return JSON: {"decision": "block"}
```

### 3. Session Tracking

```
Session Start
     │
     ▼
┌──────────────────────────────────┐
│ Create session file:             │
│ /tmp/task-memory-session-{id}.txt│
└──────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────┐
│ Record tasks worked on:          │
│ - On context display             │
│ - On PreToolUse (Write/Edit/Bash)│
└──────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────┐
│ On Stop event:                   │
│ - Check if task in session file  │
│ - Only block for session tasks   │
│ - Allow stop for unrelated tasks │
└──────────────────────────────────┘
```

## Component Details

### React App (task-memory.html)

Built with Vite and bundled into a single HTML file.

**Key Files:**
- `src/App.jsx` - Main application component
- `src/utils/markdown.js` - Markdown parser/serializer
- `src/utils/fileSystem.js` - File System Access API wrapper
- `src/components/kanban/` - Kanban board components
- `src/components/task/` - Task card and form components

**Data Flow:**
```
File System Access API
         │
         ▼
┌─────────────────────────┐
│ fileSystem.js           │ Read/write tasks.md
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ markdown.js             │ Parse markdown → objects
└─────────────────────────┘ Serialize objects → markdown
         │
         ▼
┌─────────────────────────┐
│ App.jsx state           │ Task state management
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ KanbanBoard.jsx         │ Column rendering
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ TaskCard.jsx            │ Individual task display
└─────────────────────────┘
```

### Claude Code Integration

**Hook Scripts:**
- `skill-eval.sh` - Evaluates user prompt, detects TASK vs QUESTION
- `task-memory-hook.sh` - Unified hook handler for all events

**Configuration:**
- `.claude/settings.json` - Hook registration (project settings)
- `.claude/hooks/hooks.json` - Plugin format (for plugin installations)

**Skills:**
- `task-memory/SKILL.md` - Full workflow documentation
- `task-status/SKILL.md` - Quick context check

### Markdown Files (Data Storage)

**Task Board (`planning/tasks.md`):**
```markdown
<!-- Config: Last Task ID: 14 -->

## To Do
### TASK-001 | Title
**Status**: todo
...

## In Progress
### TASK-002 | Title
**Status**: in-progress
...

## Done
### TASK-003 | Title
**Status**: done
...
```

**Status Field Authority:**
- The `**Status**:` field is the source of truth
- UI reads status field, not section placement
- Auto-reorganization fixes mismatches on load

## Installation Paths

### Git Clone (Project Settings)

```
project/.claude/settings.json
         │
         ▼
    Uses $CLAUDE_PROJECT_DIR
         │
         ▼
    Hooks in .claude/hooks/
```

### Plugin Installation

```
~/.claude/plugins/task-memory/
         │
         ▼
    Uses ${CLAUDE_PLUGIN_ROOT}
         │
         ▼
    Hooks in plugin directory
```

## Planning Directory Detection

Hooks find the planning directory using this priority:

1. **Explicit Config** (`.task-memory.json`)
   ```json
   {"planning_dir": "docs/planning"}
   ```

2. **Nearest Planning Directory** (walk up from cwd)
   ```
   /project/packages/api/planning/tasks.md  ← Found here
   /project/planning/tasks.md               ← Fallback
   ```

3. **Project Root Default**
   ```
   $CLAUDE_PROJECT_DIR/planning/
   ```

## Stop Hook Blocking

The Stop hook uses JSON-based blocking:

```json
{
  "decision": "block",
  "reason": "TASK-001 has 3 incomplete subtasks..."
}
```

**Conditions for blocking:**
1. Task was worked on in THIS session (session tracking)
2. Task has incomplete subtasks
3. Task status is still `in-progress`

**To allow stopping:**
- Complete all subtasks `[x]`
- Or change status to `todo` (pausing work)
- Or change status to `done` (completing task)

## Build Process

```
npm run dev          Development server (Vite)
         │
         ▼
npm run build        Production build
         │
         ▼
┌─────────────────────────┐
│ vite-plugin-singlefile  │ Bundle into single HTML
└─────────────────────────┘
         │
         ▼
task-memory.html     Self-contained app (445 KB)
```

## Security Model

- **Local-first**: All data stored on user's machine
- **No cloud**: No external API calls or data transmission
- **File System Access API**: Requires explicit user permission
- **Session isolation**: Each browser session has separate data

## Extension Points

### Custom Hooks

Add to `.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {"type": "command", "command": "your-custom-hook.sh"}
        ]
      }
    ]
  }
}
```

### Custom Planning Location

Create `.task-memory.json`:
```json
{
  "planning_dir": "custom/path/to/planning"
}
```

### Monorepo Configuration

See [MONOREPO.md](../skills/task-memory/MONOREPO.md) for:
- Option A: Per-package planning
- Option B: Centralized domains
- Option C: Explicit mapping
