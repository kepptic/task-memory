---
name: tm-focus
version: "3.7.0"
description: Pin which task this session is working on, so every task-memory hook agrees. Use when the board has several in-progress tasks and the banner picked the wrong one, when resuming a specific card, or when the user says "work on TASK-XXX", "focus on", "switch to task", or "that's not the task I'm on".
user-invocable: true
allowed-tools:
  - Bash
  - Read
---

# /tm-focus — pin the session's current task

task-memory derives "the current task" automatically: an existing focus pin,
then the session stamp, then a task id in the branch name, then the most
recently `**Started**` task, then document order. When that guess is wrong,
pin it explicitly. Everything downstream — the per-prompt banner, research-log
routing, the pre-compact snapshot, the Stop gate — follows the pin.

## Usage

`/tm-focus TASK-GR-895` — pin that task.
`/tm-focus` — report the current pin and the in-progress tasks to choose from.
`/tm-focus clear` — remove the pin and go back to automatic selection.

## Steps

### 1. Validate the id exists and is in-progress

Locate the task files. With `task_files_glob` in `.task-memory.json`, glob it;
otherwise use `planning/tasks.md`.

```bash
grep -n "^### TASK-GR-895 " <task files>
```

The id must exist, and its block's `**Status**:` must mean in-progress
(`in-progress`, `In Progress`, `🚀 In Progress`, `doing`, `wip` all count). A
pin naming a task that is not in-progress is ignored by the hook — so if the
card is still `todo`, flip its Status first, which pins it automatically and
makes this skill unnecessary.

If the id does not exist, list the in-progress tasks and ask which one was
meant. Never invent an id.

### 2. Write the pin

```bash
mkdir -p .claude/state/task-memory
echo "TASK-GR-895" > .claude/state/task-memory/focus.txt
```

`focus.txt` is the session-independent pin. It is **shared by every concurrent
Claude session on this checkout** — pinning here changes the focus for all of
them. That is usually what you want on a single-developer machine, and is the
only pin a skill can write, because a skill cannot see its own session id.

The hook itself writes the per-session form, `focus-<session_id>.txt`, and
checks it first. It does that automatically whenever a card in your own board
is flipped to in-progress, which is the normal way a pin appears.

### 3. Confirm

Report the pinned id and title back. The next prompt's banner will read
`TASK-MEMORY | owner GR | focus TASK-GR-895 (pinned)`.

## Clearing

```bash
rm -f .claude/state/task-memory/focus.txt
```

Per-session pins expire with the session's state (GC'd after
`session_state_max_age_hours`, default 24). Both are scratch state — safe to
delete at any time, and `.claude/state/task-memory/` belongs in `.gitignore`.

## Notes

- A pin only ever selects among **your own** task files. If owner resolution
  narrowed the board to `tasks-gr.md`, pinning a `TASK-DG-*` id has no effect.
- Pinning does not change the task's `**Status**`. It changes which in-progress
  task the hooks treat as current.
