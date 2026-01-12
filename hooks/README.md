# task-memory Hooks

Single unified hook for context management, research logging, error tracking, and intelligent skill activation.

## Files

```
hooks/
├── hooks.json              # Hook configuration
├── run-hook.sh             # Wrapper script (checks python3)
├── task-memory-hook.py     # Unified hook handler
├── skill-eval.py           # Skill evaluation engine
├── skill-rules.json        # Task detection rules
├── skill-rules.schema.json # JSON schema for validation
└── README.md               # This file
```

## Requirements

- **Python 3.6+** (standard library only, no pip install needed)
- Python 3 is pre-installed on macOS and most Linux distributions

The `run-hook.sh` wrapper automatically checks for python3 and shows a friendly warning if missing:

```
⚠️  task-memory: python3 not found
   Install Python 3 to enable task tracking features
   macOS: brew install python3
   Ubuntu: sudo apt install python3
```

Hooks exit gracefully (exit 0) if python3 is unavailable, so Claude continues working.

## Hook Events

| Event | Trigger | Tools | Action |
|-------|---------|-------|--------|
| **UserPromptSubmit** | User sends prompt | - | Detect TASK vs QUESTION, inject context |
| **SessionStart** | Session begins | - | Display current task + progress |
| **PreToolUse** | Before tool | Write, Edit, Bash | Refresh task context |
| **PreToolUse** | Before tool | WebFetch, WebSearch | Log to Visual Operations Log |
| **PostToolUse** | After tool | Write, Edit | Remind to update subtasks |
| **PostToolUse** | After tool | Bash | Log errors to Errors Log |
| **Stop** | Session end | - | Verify subtasks complete |

## What Each Event Does

### UserPromptSubmit (Skill Evaluation)

Analyzes every user prompt to detect if it's a **TASK** or **QUESTION**:

- **TASKS** trigger task-memory context injection
- **QUESTIONS** pass through silently (no output)

Detection uses weighted scoring:

| Signal | Weight | Example |
|--------|--------|---------|
| Keywords | +3 | "implement", "fix", "build", "create" |
| Intent patterns | +4 | "add.*feature", "fix.*bug" |
| File paths | +4 | "src/components/Header.tsx" |
| Directory mappings | +5 | "tasks/", "src/", "lib/" |
| Exclusions | -5 | Questions: "what", "how", "?" |

Example task detection output (injected into Claude's context):

```
============================================================
📋 TASK DETECTED - task-memory activated
============================================================

🎯 Current task: TASK-004 | Test hook functionality

📝 Instructions:
   - Track progress via subtasks in kanban.md
   - Log research to Visual Operations Log (auto)
   - Create findings file after 2 research operations
   - Mark subtasks [x] when complete

📚 Matched skills:
   • task-memory (HIGH) - keyword: 'implement', intent: 'add.*feature'
============================================================
```

Configuration in `skill-rules.json`:

```json
{
  "config": { "minConfidence": 3, "maxSkillsToShow": 3 },
  "triggerWeights": { "keyword": 3, "intent": 4, "exclusion": -5 },
  "skills": {
    "task-memory": {
      "keywords": ["implement", "build", "fix"],
      "intentPatterns": ["(?i)add.*feature"],
      "excludePatterns": ["(?i)^(what|how|why)\\b"]
    }
  }
}
```

### SessionStart

Displays current in-progress task when a Claude Code session begins:

```
============================================================
📋 TASK-MEMORY SESSION START
============================================================

🎯 CURRENT: TASK-004 | Test hook functionality

📝 Goal: Testing the PreToolUse hook...

📊 Progress: [████░░░░░░░░░░░░░░░░] 2/10

🎯 Next:
   - [ ] Run a WebSearch
   - [ ] Verify log appears in Notes

============================================================
```

### PreToolUse (Write/Edit/Bash)

Refreshes task context before implementation to keep Claude focused:

```
────────────────────────────────────────────────────────────
📋 TASK: TASK-004 | Test hook functionality
────────────────────────────────────────────────────────────

📝 Goal: Testing the PreToolUse hook...

✅ Progress: 0/2 | Remaining:
   - [ ] Run a WebSearch
   - [ ] Verify log appears in Notes
────────────────────────────────────────────────────────────
```

### PreToolUse (WebFetch/WebSearch)

Logs research operations and triggers 2-Action Rule reminder:

```
✅ Logged to TASK-004: - 2026-01-12 10:30:45 - WebSearch: "query"

======================================================================
🔔 2-ACTION RULE: TIME TO PRESERVE RESEARCH
======================================================================

📊 Operations count: 2
📋 Task: TASK-004

✅ Create/update: tasks/findings/TASK-004.md

💡 Preserve: observations, decisions, issues, resources
======================================================================
```

### PostToolUse (Write/Edit)

Reminds to mark subtasks complete (every 3rd operation):

```
──────────────────────────────────────────────────
✅ UPDATE SUBTASKS? (TASK-004)
──────────────────────────────────────────────────

Mark completed items [x]:
   - [ ] Run a WebSearch
   - [ ] Verify log appears in Notes

📝 Edit: tasks/kanban.md
──────────────────────────────────────────────────
```

### PostToolUse (Bash)

Logs errors to preserve context for learning:

```
⚠️  Error logged to TASK-004
   npm ERR! missing script: build
```

Creates an **Errors Log** section in the task:

```markdown
**Errors Log**:
- 2026-01-12 10:30:45 - `npm run build` → missing script: build
```

### Stop

Verifies task completion before ending session:

```
============================================================
🔍 TASK COMPLETION CHECK
============================================================

⚠️  INCOMPLETE: TASK-004 | Test hook functionality

📊 Progress: 0/2

🎯 Remaining:
   - [ ] Run a WebSearch
   - [ ] Verify log appears in Notes

❌ Complete subtasks before stopping

💡 Or move task to 'To Do' if pausing
============================================================
```

Exits with code 1 to block stopping if subtasks incomplete.

## Configuration

The hook reads configuration from `.task-memory.json` in the project root:

```json
{
  "tasks_dir": "tasks"
}
```

Default: `tasks/` directory containing `kanban.md`, `archive.md`, and `findings/`.

## Design Principles

Based on [Manus Context Engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus):

1. **File System as Context** - kanban.md and findings/ externalize memory
2. **Recitation Pattern** - PreToolUse refreshes goals before implementation
3. **Keep Errors In** - Errors Log preserves failures for learning
4. **2-Action Rule** - Reminds to save research every 2 visual operations

## Counter Files

Temporary counters stored in `/tmp/`:

- `/tmp/task-memory-research-count.txt` - Research operations (2-Action Rule)
- `/tmp/task-memory-progress-count.txt` - Write/Edit operations (subtask reminder)

Reset counters:

```bash
rm /tmp/task-memory-*.txt
```

## License

MIT - https://github.com/kepptic/task-memory
