# task-memory Hooks

Single unified hook for context management, research logging, error tracking, and intelligent skill activation.

## Files

```
.claude/
├── settings.json           # Project hooks configuration (auto-loaded)
└── hooks/
    ├── hooks.json          # Plugin format (for plugin installations)
    ├── task-memory-hook.sh # Unified hook handler
    ├── skill-eval.sh       # Skill evaluation engine
    └── README.md           # This file
```

## Installation

### For Users Who Clone This Repo (Automatic)

Hooks are configured in `.claude/settings.json` and load automatically when you open the project in Claude Code. No manual setup required.

### For Plugin Installation

If installing as a Claude Code plugin, the `hooks.json` file uses `${CLAUDE_PLUGIN_ROOT}` paths.

## Requirements

- **Bash** (standard on macOS and Linux)
- No additional dependencies required

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
| Directory mappings | +5 | "planning/", "src/", "lib/" |
| Exclusions | -5 | Questions: "what", "how", "?" |

Example task detection output (injected into Claude's context):

```
============================================================
📋 TASK DETECTED - task-memory activated
============================================================

🎯 Current task: TASK-004 | Test hook functionality

📝 Instructions:
   - Track progress via subtasks in tasks.md
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

✅ Create/update: planning/notes/TASK-004.md

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

📝 Edit: planning/tasks.md
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

### Stop (Blocking)

**Forces Claude to continue working** if subtasks are incomplete:

```json
{
  "decision": "block",
  "reason": "TASK-004 has 2 incomplete subtasks: - Run a WebSearch - Verify log appears in Notes. Complete these subtasks before stopping, or change Status to 'todo' if pausing work."
}
```

**How it works:**
- Returns JSON with `"decision": "block"` and exit code 0
- Claude receives the `reason` and continues working instead of stopping
- This creates an autonomous loop until work is complete

**To allow stopping:**
- Complete all subtasks `[x]`
- Or change task `**Status**: todo` to pause work

## Configuration

Hooks auto-detect the planning directory using this priority:

### 1. Explicit Config (`.task-memory.json`)

```json
{
  "planning_dir": "docs/planning"
}
```

### 2. Nearest Planning Directory (Monorepo)

Hooks walk up from current working directory to find the nearest `planning/tasks.md`. This enables per-package planning in monorepos:

```
monorepo/
├── packages/
│   ├── api/
│   │   └── planning/tasks.md    ← Found when working in api/
│   └── web/
│       └── planning/tasks.md    ← Found when working in web/
└── planning/tasks.md            ← Fallback
```

### 3. Project Root Default

If no config or nearest planning found, uses `$CLAUDE_PROJECT_DIR/planning/`.

### Monorepo Patterns

See `skills/task-memory/SKILL.md` for detailed monorepo patterns:
- **Option A**: Per-package planning (auto-detected)
- **Option B**: Centralized domains (CLAUDE.md guidance)
- **Option C**: Config mapping (`.task-memory.json`)

## Design Principles

Based on [Manus Context Engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus):

1. **File System as Context** - tasks.md and notes/ externalize memory
2. **Recitation Pattern** - PreToolUse refreshes goals before implementation
3. **Keep Errors In** - Errors Log preserves failures for learning
4. **2-Action Rule** - Reminds to save research every 2 visual operations
5. **Never Repeat Failures** - 3-Strike Protocol: diagnose → alternative → rethink → escalate

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
