# Reference

Complete technical reference for task-memory: the skills, the `tasks.md`
file format, the status model, every hook event, configuration options,
environment variables, and on-disk state. This is the factual layer — for a
guided walkthrough see [Getting Started](GETTING_STARTED.md), for task-oriented
recipes see [How-To Guides](HOW-TO.md), and for design rationale see
[Architecture](ARCHITECTURE.md).

Everything here is derived from the plugin source (`hooks/task-memory-hook.py`,
`skills/`, `.claude-plugin/`) as of v3.7.0.

---

## Skills

task-memory ships four skills, auto-discovered from `skills/`. They auto-invoke
when the conversation matches their purpose, or can be invoked explicitly with
their plugin-namespaced form (`/task-memory:<name>`). They work identically in
Claude Code and Cowork. (Prior to v3.7, these were also registered as separate
bare slash commands under `commands/` — that duplicated each entry and wasted
tokens, so the thin command wrappers were removed; the skills are the only
registration now.)

| Skill | Purpose | Skill source |
|-------|---------|--------------|
| `/task-memory:tm-init` | Initialize task-memory in the current project — create `planning/`, scaffold `tasks.md`, optionally write `.task-memory.json`, update `CLAUDE.md`. Renamed from `/task-memory-init` in v2.0 to avoid colliding with Claude Code's built-in `/init`. | `skills/tm-init/SKILL.md` |
| `/task-memory:task-memory` | Full task-planning workflow — create a task, set workflow type and complexity, drive it through the status lifecycle, preserve research. | `skills/task-memory/SKILL.md` |
| `/task-memory:task-status` | Quick context check — the 5-Question Reboot Test. Read-only; reports current task progress and what to resume. | `skills/task-status/SKILL.md` |
| `/task-memory:tm-focus` | Pin which in-progress task this session is driving, when automatic selection picks the wrong one. Added in v3.7.0. | `skills/tm-focus/SKILL.md` |

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
- **Task headers are `### TASK-XXX | Title` (h3)** or `### TASK-<PREFIX>-N | Title` (h3), nested under a column section.
- **`<!-- Config: Last Task ID: N -->`** tracks the highest task number (legacy format). For team mode with per-dev files, use `<!-- Config: Task Prefix: GR | Last Task ID: 677 -->` (prefix is 2–4 UPPERCASE letters; IDs are not zero-padded, e.g., `TASK-GR-678`).
- **No `---` separators between tasks.** A `---` is only allowed after the config section.
- The **`**Status**:` field is authoritative**, not the section a block sits in. The HTML UI auto-reorganizes mismatches on load; when editing by hand, move the block to the matching column for readability.

### Team mode: Per-dev task files

When multiple developers work on separate branches, use per-dev task files (`tasks-gr.md`, `tasks-dg.md`, etc.) with `.task-memory.json` configured with `task_files_glob`:

```json
{
  "task_files_glob": "planning/tasks-*.md"
}
```

Each file gets its own config header with a 2–4 letter prefix (developer initials):

```markdown
<!-- Config: Task Prefix: GR | Last Task ID: 677 -->
```

This mints namespaced IDs (`TASK-GR-678`, `TASK-GR-679`, …) scoped to that developer, preventing collisions. Legacy unprefixed format (`TASK-043`) remains fully supported and can coexist with namespaced IDs.

#### Owner resolution (v3.7.0)

Per-dev files alone are not enough: until v3.7.0 the hook aggregated every
matched file and treated "the first in-progress task in the first file" as
current — which in a `tasks-dg.md` / `tasks-gr.md` pair is always the *other*
developer's card, on every machine but one.

The hook now resolves an **owner** — a 2–4 uppercase-letter code — and scopes
current-task selection, the banners, the Stop gate, staleness warnings and the
TodoWrite mirror to the files that belong to them. Resolution order, first
valid answer wins:

1. `TASK_MEMORY_OWNER` environment variable
2. `owner` in `.task-memory.local.json` (machine-local, gitignored)
3. `owner` in `.task-memory.json`
4. `owner_branch_pattern` — a regex with **one capture group**, matched
   against `git branch --show-current`; group 1 is upper-cased
5. `owner_git_users` — a map from git `user.name` **or** `user.email` (exact,
   case-insensitive) to an owner code
6. nothing resolves → legacy behavior, unchanged: all files, document order

A file's own owner comes from its `Task Prefix:` config header, falling back to
its `tasks-<xx>.md` filename. If the owner resolves but owns none of the
discovered files, the hook falls back to all of them and says so in the banner
rather than going silently blind.

`.task-memory.local.json` is a shallow overlay on `.task-memory.json` — same
schema, its keys win. It exists because the same checkout is a different
developer on a different machine, and that fact does not belong in version
control. Add it to `.gitignore`.

Git is invoked with a 2-second timeout; any failure simply skips that
resolution step.

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
| `Epic` | a task id | Names this card's parent epic. Accepts `TASK-DG-772`, `DG-772`, or a bare `772` (resolved with this card's own prefix). See [Epics](#epics). |
| `Subtasks` | `- [ ]` / `- [x]` checkboxes | `(depends: Phase X[, Phase Y])` declares ordering. Incomplete boxes drive the Stop-hook block. **Only boxes under this header count** (v3.7.0) — a Pre-Work Checklist no longer inflates progress. |
| `Outcome Branches` | `If <outcome> → <action>` lines | Required for `awaiting` tasks; see [Outcome Branches](#outcome-branches). |
| `Notes` | free-form | Distilled synthesis (deep detail lives in `notes/TASK-XXX.md`). |
| `Visual Operations Log` | auto-appended | WebFetch/WebSearch entries the hook writes. |
| `Errors Log` | manual (table or lines) | **Not auto-populated as of v3.4.1** — see [Hook events](#hook-events). |

---

## Status model

Five recognized statuses. The `**Status**:` field is the single source of truth.

### Status vocabulary (v3.7.0)

Boards are written by humans, so the hook accepts how humans write them. Every
status comparison runs through one normalizer that strips emoji, punctuation
and casing, then matches the leading token(s) — trailing prose is ignored, so
`**Status**: done — evidence in notes/TASK-GR-880.md` reads as `done`.

| Written as | Reads as |
|------------|----------|
| `to do`, `todo`, `To Do`, `📝 To Do`, `Not Started`, `backlog` | `todo` |
| `in progress`, `in_progress`, `🚀 In Progress`, `doing`, `wip` | `in-progress` |
| `in review`, `review`, `👀 In Review` | `in-review` |
| `awaiting`, `parked`, `waiting` | `awaiting` |
| `done`, `complete`, `completed`, `closed`, `✅ Done` | `done` |
| `blocked` | `blocked` |
| anything else | cleaned and hyphenated, unchanged in meaning |

Before v3.7.0 the scanners matched `([a-z-]+)` and compared with `==`, so a
board using the emoji forms had **no** in-progress tasks as far as the hook was
concerned. The reorganizer still prefers a literal column id first, so a board
with its own `## Backlog` column keeps its Backlog tasks there.

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

## Epics

A card is an **epic** when its title starts with `EPIC` (`### TASK-DG-772 | EPIC:
Ship Builder audit`) or when some other card names it:

```markdown
### TASK-DG-775 | Fix the tenant save no-op
**Status**: in-progress | **Epic**: DG-772
```

Epics are containers, not work items. The hook treats them accordingly:

- **Current-task selection** skips them whenever a real work item is available.
- **The Stop gate** skips them, unless the epic is the only in-progress task.
- **The SessionStart banner** nests children under their parent (`  ↳ …`).

---

## Focus pins

Which task is "current" is resolved per session, in this order, always within
the owner's own task files:

1. **Focus pin** — `.claude/state/task-memory/focus-<session_id>.txt`, then the
   session-independent `focus.txt`. Honored only while that task is still
   in-progress.
2. **Session stamp** — a task this session has already been recorded working on.
3. **Branch** — an in-progress task whose id appears in the current branch name.
4. **Most recently `**Started**`** — ties broken by document order; tasks with
   no Started date sort last.
5. **First in-progress in document order** — the pre-3.7.0 behavior.

The per-session pin is written **automatically** when a `Write`/`Edit` flips a
card in the owner's own board to in-progress — the one moment intent is
unambiguous. `/task-memory:tm-focus` writes the session-independent `focus.txt`
by hand; note that file is shared by every concurrent session on the checkout.

Both files are scratch state under `.claude/state/task-memory/`, which belongs
in `.gitignore`.

---

## Hook events

Configured in `hooks/hooks.json`; all events run `hooks/task-memory-hook.py`
except `UserPromptSubmit`, which runs `hooks/skill-eval.sh`. Matchers below are
exact as of **v3.4.1**.

| Event | Matcher | What it does |
|-------|---------|--------------|
| `SessionStart` / `PostCompact` | — | Print the full banner: owner, in-progress tasks grouped by owner and epic, notes summary, stale and overdue warnings. GC stale session state. Creates notes skeletons only under `notes_skeleton: "session-start"`. |
| `UserPromptSubmit` | — | `skill-eval.sh` → `handle_prompt_context()`. Read-only: owner, focus + why, progress, up to 5 open subtasks, other in-progress counts, warnings. Capped at ~40 lines. Creates and deletes nothing. |
| `PreToolUse` | `Write\|Edit\|Task` | Refresh task context; bind the work to the current task for engagement tracking. |
| `PostToolUse` | `Write\|Edit\|WebFetch\|WebSearch\|TodoWrite` | `WebFetch`/`WebSearch` → append to **Visual Operations Log**, deduped (+ create `notes/TASK-XXX.md` skeleton every 2 ops); `TodoWrite` → mirror into `## From TodoWrite`; `Write`/`Edit` → relevance/engagement tracking, reorganize the edited file, and set the focus pin when a card was flipped to in-progress. |
| `PreCompact` | — | Dump current task + recent ops log to `<precompact_dir>/TASK-XXX-precompact-<ts>.md` and append the ops log into the main notes file. Both deduped by content hash. **No current task → nothing is written.** |
| `Stop` / `SubagentStop` | — | Block if an `in-progress` task worked on this session has incomplete subtasks or an empty notes file (see [Stop-hook gate](#stop-hook-gate)). |
| `SessionEnd` | — | Flush session state. Never blocks. |

> **Changed in v3.7.0:** `UserPromptSubmit` no longer synthesizes a
> `SessionStart`. It used to, with an empty `session_id` — which meant a full
> GC pass and a notes skeleton per in-progress task on *every prompt* (one real
> repo accumulated 170 skeleton-only notes files out of 283), and left the hook
> unable to tell which task the session was on. If you have a project pinned to
> an older version, that is the behavior you are seeing.

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
| Created | When a card is flipped to in-progress, after **2** research ops, or when PreCompact needs a target. Governed by `notes_skeleton`. | Skeleton with sections: Summary, Patterns Discovered, Gotchas, Decisions, Resources, Open Questions. |
| Filled | You | Write *synthesis* (patterns, gotchas, decisions), not raw quotes. |
| Appended | `PreCompact` | Recent ops-log entries merged in as a timestamped appendix. |
| Validated | `Stop` | Blocks if (research ops ≥ 2 OR an **explicitly declared** Complexity ∈ {Standard, Complex}) and the file is empty/skeleton-only. An absent `**Complexity**` field no longer implies Standard (v3.7.0). |
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
  "task_files_glob": "planning/tasks-*.md",
  "owner_git_users": { "your-git-username": "GR", "Teammate Name": "DG" },
  "notes_skeleton": "on-start",
  "precompact_dir": "notes/archive",
  "stale_in_progress_days": 21,
  "min_engagements_to_block": 3,
  "session_state_max_age_hours": 24
}
```

`.task-memory.local.json`, if present, is shallow-merged **over** this file:
same schema, its keys win, and it should be gitignored. Its reason to exist is
`owner`.

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `planning_dir` | string | `"planning"` | Directory holding `tasks.md`, `archive.md`, `notes/`. |
| `task_prefix` | string | `"TASK"` | Reserved. **Read by nothing** — ID prefixes come from each file's `Task Prefix:` header. |
| `owner` | string | unset | This checkout's owner code, 2–4 uppercase letters. Usually belongs in `.task-memory.local.json`, not here. |
| `owner_branch_pattern` | string (regex) | unset | Regex with one capture group, matched against the current git branch; group 1 upper-cased is the owner. JSON-escape your backslashes: `"^v5\\.([a-z]{2})\\d*-dev$"`. |
| `owner_git_users` | object | unset | Maps git `user.name` or `user.email` (exact, case-insensitive) to an owner code. |
| `notes_skeleton` | string | `"on-start"` | `"on-start"` creates a skeleton when a card is flipped to in-progress (and when PreCompact or the 2-op research rule needs one); `"session-start"` restores the pre-3.7 one-per-in-progress-task-per-SessionStart behavior; `"never"` disables auto-creation. |
| `precompact_dir` | string | `"notes/archive"` | Where pre-compact snapshots are written, relative to `planning_dir`. |
| `stale_in_progress_days` | int | `21` | An in-progress task whose `**Started**` date is older than this gets a one-line staleness warning in both banners. |
| `task_files_glob` | string | unset | Multi-file kanban — glob of `tasks.md` files (e.g. `docs/todo/*/tasks.md`). Hook aggregates in-progress tasks across all matches and routes log appends to the owning file. See [MONOREPO.md](../skills/task-memory/MONOREPO.md). |
| `todowrite_mirror_file` | string **or** object | owner's first task file | Pins the `## From TodoWrite` mirror. String form applies to everyone; object form is keyed by owner code: `{"GR": "planning/tasks-gr.md", "DG": "planning/tasks-dg.md"}`. |
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
| `TASK_MEMORY_OWNER` | hook | Highest-priority owner code (2–4 uppercase letters). Overrides every config source. Useful in CI, or to drive another developer's board for one command. |
| `TASK_MEMORY_FORCE_STAMP` | hook | `1`/`true`/`yes` restores pre-v3.3 blanket stamping (every Write/Edit/Task call marks the session task-relevant). Default off — only genuinely task-touching tool uses stamp. |

---

## On-disk state — `.claude/state/task-memory/`

Per-session, per-task scratch files (safe to delete; regenerated as needed).

| File | Purpose |
|------|---------|
| `focus-<session>.txt` | Per-session focus pin. Written automatically when a card is flipped to in-progress; honored only while that task is still in-progress. |
| `focus.txt` | Session-independent focus pin, written by `/task-memory:tm-focus`. **Shared by every concurrent session on this checkout.** Checked after the per-session pin. |
| `session-<session>.txt` | Task ids this session has been recorded working on (the session stamp). |
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
| `STALE_IN_PROGRESS_DAYS` | `21` | Default (overridable via config). |
| Prompt-banner line cap | `40` | Hard ceiling on the per-prompt banner. |
| Git subprocess timeout | `2 s` | Owner/branch lookups; any failure skips that step. |

---

## Project layout (a project that *uses* task-memory)

```
your-project/
├── planning/
│   ├── tasks.md            # Active Kanban board
│   ├── archive.md          # Completed tasks (preserved)
│   └── notes/              # Per-task synthesized research
│       ├── TASK-XXX.md
│       └── archive/        # Pre-compact snapshots (precompact_dir)
├── .task-memory.json       # Optional config
├── .task-memory.local.json # Optional machine-local overlay (gitignore this)
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
