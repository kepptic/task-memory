# How-To Guides

Task-oriented recipes. Each assumes task-memory is installed and you know the
basics — if not, start with [Getting Started](GETTING_STARTED.md). For exact
field/option definitions, see the [Reference](REFERENCE.md).

- [Install in Claude Code](#install-in-claude-code)
- [Install in Cowork](#install-in-cowork)
- [Initialize a project](#initialize-a-project)
- [Use a custom planning location](#use-a-custom-planning-location)
- [Set up a monorepo](#set-up-a-monorepo)
- [Park a task on an external signal](#park-a-task-on-an-external-signal)
- [Preserve research across compaction](#preserve-research-across-compaction)
- [Stop when the Stop hook is blocking you](#stop-when-the-stop-hook-is-blocking-you)

---

## Install in Claude Code

Install the plugin from the public marketplace.

```bash
/plugin marketplace add kepptic/task-memory
/plugin install task-memory@kepptic
```

**Verification:** `/plugin list` shows `task-memory@kepptic` as enabled, and a new
session prints a `task-memory` banner at startup.

**Troubleshooting:** if `task-memory@kepptic` reports "marketplace not found,"
re-run the `marketplace add` step — the marketplace is named `kepptic` (not
`task-memory`); installing as `task-memory@task-memory` won't resolve.

---

## Install in Cowork

Cowork sideloads a `.plugin` archive (it validates by the exact filename
`task-memory.plugin`).

1. Download `task-memory.plugin` from the [Releases](https://github.com/kepptic/task-memory/releases) page (attached to each release), **or** build it:

   ```bash
   git clone https://github.com/kepptic/task-memory.git
   cd task-memory
   scripts/build-cowork-plugin.sh   # → dist/task-memory.plugin
   ```

2. In Cowork, drag `task-memory.plugin` into the chat, or use **Install plugin** and point it at the file.

3. Run `/tm-init` to bootstrap a project.

**Verification:** `/tm-init` creates `planning/tasks.md` in the project.

**Troubleshooting:** "File is not a valid plugin archive" → you used the
versioned name (`task-memory-3.4.1.plugin`). Rename it to `task-memory.plugin`;
Cowork validates by filename.

---

## Initialize a project

```bash
cd /path/to/your-project
# in Claude Code / Cowork:
/tm-init
```

`/tm-init` detects monorepos, asks where to store planning, scaffolds
`planning/tasks.md` + `archive.md` + `notes/`, and adds a task-memory section to
`CLAUDE.md`.

**Verification:** `planning/tasks.md` exists with a `<!-- Config: Last Task ID: 0 -->`
line and `## To Do` / `## In Progress` / `## Done` sections.

---

## Use a custom planning location

Put planning somewhere other than `./planning/`.

1. Create `.task-memory.json` at the project root:

   ```json
   { "planning_dir": "docs/planning" }
   ```

2. Run `/tm-init` (or move an existing `planning/` to the new path).

**Verification:** start a new session — the hook reads from `docs/planning/tasks.md`.

See the [config field reference](REFERENCE.md#configuration--task-memoryjson) for
`task_prefix` and the other options.

---

## Set up a monorepo

Two patterns; pick by how you want tasks split.

**Auto-detected (per-package boards)** — no config. Drop a `planning/tasks.md`
in each package; the hook uses the nearest one to your working directory.

```
monorepo/
├── packages/api/planning/tasks.md     # used when cwd is under api/
├── packages/web/planning/tasks.md     # used when cwd is under web/
└── planning/tasks.md                  # root fallback
```

**Explicit glob (aggregated board)** — set `task_files_glob` in
`.task-memory.json`:

```json
{ "task_files_glob": "docs/todo/*/tasks.md" }
```

The hook then lists in-progress tasks from **every** matching file at SessionStart
(each labeled by its parent directory) and routes log appends to the file owning
each `TASK-XXX`.

**Verification:** SessionStart shows tasks from all packages, each tagged with its
directory label.

Full details: [MONOREPO.md](../skills/task-memory/MONOREPO.md).

---

## Set up team mode (per-dev files with collision-resistant IDs)

When multiple developers work on separate branches, use per-dev task files to prevent ID collisions. Each developer gets a file with their initials (`tasks-gr.md`, `tasks-dg.md`, etc.) and a namespaced ID counter.

1. Create `.task-memory.json` at the project root:

   ```json
   { "task_files_glob": "planning/tasks-*.md" }
   ```

2. Create per-dev files with the `Task Prefix:` header:

   ```markdown
   # Kanban Board

   <!-- Config: Task Prefix: GR | Last Task ID: 0 -->

   ## To Do

   ### TASK-GR-1 | My first task
   ...
   ```

3. Each developer now uses their own file with namespaced IDs (`TASK-GR-678`, `TASK-DG-1`, etc.), so branches never collide.

**Verification:** SessionStart shows tasks from all per-dev files, each labeled with its filename.

**Note:** The `.task-memory.json` config key `task_prefix` (value `"TASK"`) is unrelated to the per-file `Task Prefix:` header (dev initials). The config key sets the task ID prefix in the UI; the per-file headers enable team-mode isolation.

Full details: [Reference → Team mode: Per-dev task files](REFERENCE.md#team-mode-per-dev-task-files).

---

## Park a task on an external signal

Use this when the action has shipped but the task can't close until something
*outside your control* responds — a reply, a CI run, a vendor decision, an async
backend job. (Added in v3.4.0.)

1. **Write Outcome Branches** while you still have full context — one line per plausible outcome, plus a mandatory silence deadline:

   ```markdown
   **Outcome Branches**:
   - If approved → merge and close TASK-042
   - If changes requested → address feedback, re-request review
   - If no signal by 2026-06-15 → ping reviewer in #eng, escalate if still silent
   ```

2. **Flip the status** from `in-progress` to `awaiting`:

   ```markdown
   **Status**: awaiting
   ```

3. Move the block under `## Awaiting` for readability (optional — the Status field is authoritative).

**Verification:** the Stop hook no longer nags about this task (it only blocks
`in-progress`), so you can end the session cleanly. When the silence deadline
passes, the next SessionStart prints a `🔔 AWAITING — N task(s) past their
silence-deadline:` line so the silence path actually runs.

**When NOT to use it:** self-contained work where the next step is obvious (a
refactor, a typo fix) — those just go `in-progress` → `done`.

Rationale and the full convention: [Reference → Outcome Branches](REFERENCE.md#outcome-branches)
and Rule 7 in [the skill guide](../skills/task-memory/SKILL.md).

---

## Preserve research across compaction

Research survives compaction automatically if you let the hook do its job and add
the synthesis.

1. **Work normally.** WebFetch/WebSearch are auto-logged to the task's Visual
   Operations Log. After 2 research ops, the hook creates
   `planning/notes/TASK-XXX.md` with a skeleton.

2. **Fill the notes skeleton** with synthesis — Patterns, Gotchas, Decisions —
   not raw quotes. The raw log is the material; the notes file is the durable
   output.

3. On `PreCompact`, the hook snapshots the task + recent ops to
   `notes/TASK-XXX-precompact-<ts>.md` and appends the ops log into the main
   notes file, so nothing is lost.

**Verification:** after a compaction, the next SessionStart prints your notes
summary; `planning/notes/` contains both `TASK-XXX.md` and any
`TASK-XXX-precompact-*.md` snapshots.

**Troubleshooting:** if SessionStart warns "CONTEXT GAP DETECTED" / empty notes,
re-synthesize from the ops log in `tasks.md` before continuing.

---

## Stop when the Stop hook is blocking you

The Stop hook blocks when an `in-progress` task you worked on this session has
incomplete subtasks or an empty notes file. Pick the right fix:

- **The work really is done** → check off the subtasks (`- [x]`) and fill the
  notes file with real Patterns/Gotchas/Decisions, then stop. This is the
  intended path.
- **The work shipped but is waiting on a signal** → flip to `awaiting` (see
  [Park a task on an external signal](#park-a-task-on-an-external-signal)). The
  hook ignores `awaiting`.
- **You paused, not finished** → set `**Status**: todo`. The hook ignores `todo`.
- **You asked an unrelated question** → the hook shouldn't block (it only stamps
  task-relevant tool use, and short sessions under `min_engagements_to_block`
  never block). If it does, escape for the rest of the session:

  ```bash
  touch .claude/state/task-memory/off-topic-<session-id>.flag
  ```

  The block message prints the exact path to copy-paste.

After `MAX_STOP_BLOCKS` (2) consecutive blocks on the same task, the hook gives up
and won't re-nag that session+task (sticky release).

**Verification:** the session ends without re-printing the "incomplete subtasks"
block.

Tuning knobs: [`min_engagements_to_block`](REFERENCE.md#configuration--task-memoryjson),
[`TASK_MEMORY_FORCE_STAMP`](REFERENCE.md#environment-variables), and the
[state flags](REFERENCE.md#on-disk-state--claudestatetask-memory).
