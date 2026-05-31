# Reference

Complete technical reference for task-memory: the slash commands, the `tasks.md`
file format, the status model, every hook event, configuration options,
environment variables, and on-disk state. This is the factual layer — for a
guided walkthrough see [Getting Started](GETTING_STARTED.md), for task-oriented
recipes see [How-To Guides](HOW-TO.md), and for design rationale see
[Architecture](ARCHITECTURE.md).

Everything here is derived from the plugin source (`hooks/task-memory-hook.py`,
`skills/`, `.claude-plugin/`) as of v3.4.1.

---

## Slash commands

task-memory installs three user-invocable commands. They work identically in
Claude Code and Cowork.

| Command | Purpose | Skill source |
|---------|---------|--------------|
| `/tm-init` | Initialize task-memory in the current project — create `planning/`, scaffold `tasks.md`, optionally write `.task-memory.json`, update `CLAUDE.md`. Renamed from `/task-memory-init` in v2.0 to avoid colliding with Claude Code's built-in `/init`. | `skills/tm-init/SKILL.md` |
| `/task-memory` | Full task-planning workflow — create a task, set workflow type and complexity, drive it through the status lifecycle, preserve research. | `skills/task-memory/SKILL.md` |
| `/task-status` | Quick context check — the 5-Question Reboot Test. Read-only; reports current task progress and what to resume. | `skills/task-status/SKILL.md` |

The plugin name is `task-memory`; the marketplace is `kepptic`. Claude Code
install ref is therefore `task-memory@kepptic`.

---

## `planning/tasks.md` format

`tasks.md` is a Kanban board stored as markdown. It is both human-editable and
parsed by the hook and the standalone HTML viewer. The exact grammar the UI
parser requires is in [UI_FORMAT.md](../skills/task-memory/UI_FORMAT.md); this is
the working summary.

### Board structure

```markdown
# Kanban Board

<!-- Config: Last Task ID: 7 -->

## To Do

### TASK-008 | Short title
...task block...

## In Progress

### TASK-007 | Another title
...task block...

## Done

### TASK-001 | Completed title
...task block...
```

Rules the parser enforces:

- **Column sections are `##` (h2):** `## To Do`, `## In Progress`, `## Done` (and optional `## Awaiting`). Use the *existing* headers — do not invent new ones.
- **Task headers are `### TASK-XXX | Title` (h3)**, nested under a column section.
- **`<!-- Config: Last Task ID: N -->`** tracks the highest task number. Increment it when you add a task.
- **No `---` separators between tasks.** A `---` is only allowed after the config section.
- The **`**Status**:` field is authoritative**, not the section a block sits in. The HTML UI auto-reorganizes mismatches on load; when editing by hand, move the block to the matching column for readability.

### Task block template

```markdown
### TASK-XXX | [Brief Title]

**Priority**: [🔴 Critical|🟠 High|🟡 Medium|🟢 Low] | **Category**: [Feature|Bug|Docs|Research] | **Status**: todo | **Assigned**: @user
**Workflow**: [Feature|Refactor|Investigation|Migration|Simple] | **Complexity**: [Simple|Standard|Complex]
**Created**: YYYY-MM-DD | **Started**: | **Finished**:
**Tags**: #tag1 #tag2

[Description]

**Subtasks**:
- [ ] Phase 1: First subtask
- [ ] Phase 2: Second subtask (depends: Phase 1)

**Outcome Branches**:
- If <expected outcome> → <action / new task / close>
- If no signal by <YYYY-MM-DD> → <chase / escalate / close>

**Pre-Work Checklist**:
- [ ] Read relevant files
- [ ] Searched for similar implementations

**Notes**:

**Visual Operations Log**:

**Errors Log**:
```

### Field reference

| Field | Values / format | Notes |
|-------|-----------------|-------|
| `Priority` | Critical / High / Medium / Low | Free-form; emoji optional. |
| `Category` | Feature / Bug / Docs / Research | Free-form label. |
| `Status` | `todo` `in-progress` `in-review` `awaiting` `done` | Authoritative. See [Status model](#status-model). |
| `Workflow` | Feature / Refactor / Investigation / Migration / Simple | Drives planning depth. |
| `Complexity` | Simple / Standard / Complex | `Standard`/`Complex` make the Stop-hook notes gate stricter. |
| `Created` | `YYYY-MM-DD` | Required for all tasks. |
| `Started` | `YYYY-MM-DD` | Required once `Status` ≥ `in-progress`. |
| `Finished` | `YYYY-MM-DD` | Required for `done`. |
| `Subtasks` | `- [ ]` / `- [x]` checkboxes | `(depends: Phase X[, Phase Y])` declares ordering. Incomplete boxes drive the Stop-hook block. |
| `Outcome Branches` | `If <outcome> → <action>` lines | Required for `awaiting` tasks; see [Outcome Branches](#outcome-branches). |
| `Notes` | free-form | Distilled synthesis (deep detail lives in `notes/TASK-XXX.md`). |
| `Visual Operations Log` | auto-appended | WebFetch/WebSearch entries the hook writes. |
| `Errors Log` | manual (table or lines) | **Not auto-populated as of v3.4.1** — see [Hook events](#hook-events). |

---

## Status model

Five recognized statuses. The `**Status**:` field is the single source of truth.

| Status | Meaning | Required fields | Stop hook |
|--------|---------|-----------------|-----------|
| `todo` | Not started yet. | Created | ignores |
| `in-progress` | You are actively driving the work. | Created, Started | **nags** if subtasks/notes incomplete |
| `in-review` | Work shipped, parked for review/approval. | Created, Started | ignores |
| `awaiting` | Action shipped, parked on an external signal (reply, CI, vendor, async job). | Created, Started | ignores |
| `done` | Completed — signal received / outcome resolved. | Created, Started, Finished | ignores |

Valid transitions:

```
todo → in-progress → done
                  ↘ awaiting → in-progress → done   (signal arrived; act on it)
                             ↘ done                  (silence deadline; close as abandoned)
```

**`in-progress` vs `awaiting`:** if the next thing that has to happen is *you
doing something*, it's `in-progress`. If the next thing is *the world doing
something*, it's `awaiting`. Use `awaiting` (not `todo`) once work has shipped —
`todo` means "not started," never "started and stopped."

The **Stop hook only blocks `in-progress` tasks**. Flipping a task to `awaiting`
or `in-review` parks it without triggering the "incomplete subtasks" block.

---

## Outcome Branches

A task block convention for work whose completion depends on a signal that
hasn't arrived. Each branch is one line under an `**Outcome Branches**:` header:

```markdown
**Outcome Branches**:
- If approved → close TASK-042, spawn TASK-051 for rollout
- If changes requested → address feedback, re-request review
- If no signal by 2026-06-15 → ping the reviewer in #eng
```

- **Success path** — usually "close task" or "spawn follow-up task."
- **Alternative paths** — documented unhappy outcomes (rejection, partial success). One line each, only the likely ones.
- **Silence path** — `If no signal by <YYYY-MM-DD> → <action>`. **Mandatory for `awaiting` tasks.** Use a concrete date, not "eventually."

`SessionStart` surfaces any `awaiting` task whose silence-deadline (`If no … by
YYYY-MM-DD →`) is in the past, so the silence path actually runs instead of the
task drifting forever.

---

## Hook events

Configured in `hooks/hooks.json`; all events run `hooks/task-memory-hook.py`
except `UserPromptSubmit`, which runs `hooks/skill-eval.sh`. Matchers below are
exact as of **v3.4.1**.

| Event | Matcher | What it does |
|-------|---------|--------------|
| `SessionStart` | — | Print current task + notes summary; create notes skeletons for in-progress tasks; GC stale session state; surface overdue `awaiting` tasks. |
| `UserPromptSubmit` | — | `skill-eval.sh` prints current task context on each prompt. |
| `PreToolUse` | `Write\|Edit\|Task` | Refresh task context; bind the work to the current task for engagement tracking. |
| `PostToolUse` | `Write\|Edit\|WebFetch\|WebSearch\|TodoWrite` | `WebFetch`/`WebSearch` → append to **Visual Operations Log** (+ create `notes/TASK-XXX.md` skeleton every 2 ops); `TodoWrite` → mirror into `## From TodoWrite`; `Write`/`Edit` → relevance/engagement tracking + reorganize the edited file. |
| `PreCompact` | — | Dump current task + recent ops log + todos to `planning/notes/TASK-XXX-precompact-<ts>.md` and append the ops log into the main notes file. |
| `Stop` / `SubagentStop` | — | Block if an `in-progress` task worked on this session has incomplete subtasks or an empty notes file (see [Stop-hook gate](#stop-hook-gate)). |
| `SessionEnd` | — | Flush session state. Never blocks. |

> **Changed in v3.4.0:** `Bash` was removed from the `PreToolUse` and
> `PostToolUse` matchers (to save ~150 ms/bash-call). Consequences: the hook no
> longer fires on `Bash`, so **Bash errors are no longer auto-logged** to the
> Errors Log, and a Bash command that names a task ID no longer stamps the
> session as task-relevant. Record errors manually in the `**Errors Log**:`
> section. Older docs that list `PreToolUse (Write/Edit/Bash/Task)` or
> "Bash errors → Errors Log" predate this change.

---

## Notes files (`planning/notes/`)

One markdown file per task captures synthesized research that survives sessions
and compaction.

| Stage | Trigger | Behavior |
|-------|---------|----------|
| Created | After **2** research ops (WebFetch/WebSearch), or at SessionStart for in-progress tasks | Skeleton with sections: Summary, Patterns Discovered, Gotchas, Decisions, Resources, Open Questions. |
| Filled | You | Write *synthesis* (patterns, gotchas, decisions), not raw quotes. |
| Appended | `PreCompact` | Recent ops-log entries merged in as a timestamped appendix. |
| Validated | `Stop` | Blocks if (research ops ≥ 2 OR Complexity ∈ {Standard, Complex}) and the file is empty/skeleton-only. |
| Loaded | `SessionStart` | Summary printed so the next session resumes with context. |

The **Visual Operations Log** (in `tasks.md`) is the raw machine-parseable trail
with a ≤120-char response snippet per entry; the **notes file** is the durable
distilled output.

---

## Configuration — `.task-memory.json`

Optional file at the project root. All fields optional; defaults shown.

```json
{
  "planning_dir": "planning",
  "task_prefix": "TASK",
  "min_engagements_to_block": 3,
  "session_state_max_age_hours": 24
}
```

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `planning_dir` | string | `"planning"` | Directory holding `tasks.md`, `archive.md`, `notes/`. |
| `task_prefix` | string | `"TASK"` | ID prefix (e.g. `MYAPP` → `MYAPP-001`). |
| `task_files_glob` | string | unset | Multi-file kanban — glob of `tasks.md` files (e.g. `docs/todo/*/tasks.md`). Hook aggregates in-progress tasks across all matches and routes log appends to the owning file. See [MONOREPO.md](../skills/task-memory/MONOREPO.md). |
| `todowrite_mirror_file` | string | first glob match | Pins the TodoWrite `## From TodoWrite` mirror to one file (only relevant with `task_files_glob`). |
| `min_engagements_to_block` | int | `3` | Minimum task-relevant tool uses in a session before the Stop hook is allowed to block. Prevents "asked one question, can't stop." |
| `session_state_max_age_hours` | int | `24` | Age after which orphaned session-state files are GC'd at SessionStart. |

When `task_files_glob` is absent, behavior is the single-file default
(`planning/tasks.md`).

---

## Environment variables

| Variable | Read where | Effect |
|----------|-----------|--------|
| `CLAUDE_PROJECT_DIR` | set by Claude Code | Project root; falls back to `cwd`. |
| `PWD` | shell | Used for nearest-`planning/` detection (monorepo). |
| `TASK_MEMORY_FORCE_STAMP` | hook | `1`/`true`/`yes` restores pre-v3.3 blanket stamping (every Write/Edit/Task call marks the session task-relevant). Default off — only genuinely task-touching tool uses stamp. |

---

## On-disk state — `.claude/state/task-memory/`

Per-session, per-task scratch files (safe to delete; regenerated as needed).

| File | Purpose |
|------|---------|
| `off-topic-<session>.flag` | Disables all stamping + Stop blocking for that session. Create with `touch` to escape a block loop. |
| `engagement-<session>-<task>.txt` | Counts task-relevant tool uses (gates `min_engagements_to_block`). |
| `released-<session>-<task>.flag` | Sticky release — after `MAX_STOP_BLOCKS` consecutive blocks, written so the hook stops re-nagging that session+task. |
| `progress-count`, `research-count` | Internal counters. |

### Constants (compiled into the hook)

| Constant | Value | Meaning |
|----------|-------|---------|
| `MAX_STOP_BLOCKS` | `2` | Consecutive Stop blocks before sticky release kicks in. |
| Research-notes threshold | `2` | Research ops before a notes skeleton is auto-created. |
| Response snippet cap | `120` chars | Max length of the logged WebFetch/WebSearch preview. |
| `MIN_ENGAGEMENTS_TO_BLOCK` | `3` | Default (overridable via config). |
| `SESSION_STATE_MAX_AGE_HOURS` | `24` | Default (overridable via config). |

---

## Project layout (a project that *uses* task-memory)

```
your-project/
├── planning/
│   ├── tasks.md            # Active Kanban board
│   ├── archive.md          # Completed tasks (preserved)
│   └── notes/              # Per-task synthesized research
│       └── TASK-XXX.md
├── .task-memory.json       # Optional config
└── .claude/
    └── state/task-memory/  # Per-session scratch (gitignore this)
```

---

## Requirements

- **Claude Code / Cowork integration:** Python 3.11+ (stdlib only — no pip installs), Bash (macOS/Linux/WSL).
- **Standalone HTML viewer:** Chrome 91+, Edge 91+, or Opera 77+ (needs the File System Access API; Safari/Firefox unsupported).

---

## Related

- [Getting Started](GETTING_STARTED.md) — guided first-task walkthrough (tutorial).
- [How-To Guides](HOW-TO.md) — task-oriented recipes (install, awaiting, monorepo, unblocking Stop).
- [Architecture](ARCHITECTURE.md) — design rationale and data flow (explanation).
- [UI_FORMAT.md](../skills/task-memory/UI_FORMAT.md) — exact Kanban parser grammar.
- [MONOREPO.md](../skills/task-memory/MONOREPO.md) — multi-package configuration.
- [TROUBLESHOOTING.md](../skills/task-memory/TROUBLESHOOTING.md) — common issues.
