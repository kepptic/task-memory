# Getting Started with Task Memory

This guide walks you through setting up Task Memory and creating your first task.

## Installation Options

### Option 1: Git Clone (Recommended)

The fastest way to get started. Hooks load automatically.

```bash
git clone https://github.com/kepptic/task-memory.git
cd task-memory
claude  # Start Claude Code - hooks are pre-configured
```

### Option 2: Add to Existing Project

Copy the plugin files and run interactive setup:

```bash
# From task-memory repo
cp -r hooks/ skills/ rules/ /path/to/your-project/
mkdir -p /path/to/your-project/.claude
cp .claude/settings.json /path/to/your-project/.claude/

# Make hooks executable
chmod +x /path/to/your-project/hooks/*.sh

# Run interactive setup
cd /path/to/your-project
claude
# The tm-init skill auto-invokes on setup, or run it explicitly: /task-memory:tm-init
```

The init skill will:
- Detect if you're in a monorepo
- Ask where to store tasks
- Create planning directory structure
- Update CLAUDE.md with task-memory integration

### Option 3: Plugin Installation

```bash
# Add the marketplace (one time)
/plugin marketplace add kepptic/task-memory

# Install the plugin
/plugin install task-memory@kepptic
```

Choose your scope:
- **User** (default): Personal use across all projects
- **Project**: Shared with team via git
- **Local**: Personal project-specific overrides

### Option 4: Standalone HTML App

Download `task-memory.html` and open in Chrome/Edge/Opera. Works offline, no installation required.

## Creating Your First Task

### Step 1: Open the Task Board

Edit `planning/tasks.md` or use the Kanban UI (`task-memory.html`).

### Step 2: Add a Task

```markdown
## In Progress

### TASK-001 | Set up development environment

**Priority**: High | **Category**: Setup | **Status**: in-progress
**Workflow**: Simple | **Complexity**: Simple
**Created**: 2026-01-17 | **Started**: 2026-01-17

Configure the local development environment.

**Subtasks**:
- [ ] Install dependencies
- [ ] Configure environment variables
- [ ] Verify build works

**Notes**:

**Visual Operations Log**:
```

### Step 3: Work on Your Task

As you work, Claude Code automatically:
- Shows task context on session start
- Logs WebFetch/WebSearch to "Visual Operations Log"
- Reminds you to save research after 2 operations
- Blocks session end if subtasks are incomplete

### Step 4: Mark Subtasks Complete

```markdown
**Subtasks**:
- [x] Install dependencies
- [x] Configure environment variables
- [x] Verify build works
```

### Step 5: Complete the Task

1. Change `**Status**: in-progress` → `**Status**: done`
2. Add `**Finished**: 2026-01-17`
3. Move task to the `## Done` section
4. Commit: `git commit -m "feat: Set up dev environment (TASK-001)"`

## Using Skills

Skills auto-invoke when the conversation matches their purpose (e.g. asking to implement/fix/build triggers the task-memory skill). You can also invoke any of them explicitly with their plugin-namespaced form.

### /task-memory:tm-init

Interactive project setup. Use when first adding task-memory to a project:

```
/task-memory:tm-init
```

This will:
- Analyze your project structure
- Detect monorepo configuration
- Ask configuration questions
- Create planning directories
- Update CLAUDE.md

### /task-memory:task-memory

Full task planning workflow. Use when starting new work:

```
/task-memory:task-memory
```

This guides you through:
- Classifying workflow type (Feature, Refactor, Investigation, Migration, Simple)
- Assessing complexity
- Creating pre-work checklist
- Defining subtasks with dependencies

### /task-memory:task-status

Quick context check. Use when:
- Starting a new session
- Resuming after a break
- Before making major decisions

```
/task-memory:task-status
```

This answers 5 questions:
1. WHERE AM I? (current phase)
2. WHERE AM I GOING? (remaining subtasks)
3. WHAT'S THE GOAL? (task description)
4. WHAT HAVE I LEARNED? (patterns, gotchas)
5. WHAT HAVE I DONE? (recent operations)

## File Structure

```
your-project/
├── hooks/                 # Hook scripts
│   ├── hooks.json         # Plugin hook config
│   ├── task-memory-hook.py
│   ├── skill-eval.sh
│   └── init-helper.sh     # Init detection script
├── skills/                # Skill definitions
│   ├── task-memory/
│   ├── tm-init/
│   └── task-status/
├── rules/                 # Workflow rules
├── .claude/
│   ├── settings.json      # Project hook config
│   ├── hooks/ → ../hooks/ # Symlink
│   ├── skills/ → ../skills/
│   └── rules/ → ../rules/
├── planning/
│   ├── tasks.md           # Active tasks
│   ├── archive.md         # Completed tasks
│   └── notes/             # Research documentation
└── .task-memory.json      # Optional: custom config
```

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

## Next Steps

- Read [ARCHITECTURE.md](ARCHITECTURE.md) to understand the system design
- Explore [examples/](../examples/) for task format reference
- Review [skills/task-memory/SKILL.md](../skills/task-memory/SKILL.md) for advanced workflows
- Check [TROUBLESHOOTING.md](../skills/task-memory/TROUBLESHOOTING.md) if you hit issues
