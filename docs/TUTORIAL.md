# Tutorial: Track your first task end-to-end

By the end of this tutorial you'll have created a task, watched task-memory log
your research automatically, parked the task on an external signal, and closed
it — seeing every memory feature fire along the way. About 15 minutes.

This is the *learning* path. If you just want the install commands, see
[Getting Started](GETTING_STARTED.md); for the full field/option spec, see the
[Reference](REFERENCE.md).

## What you'll need

- task-memory installed in Claude Code or Cowork ([install guide](HOW-TO.md#install-in-claude-code)).
- A project directory you can experiment in. A throwaway folder is fine.

---

## Step 1: Initialize the board

From your project, in Claude Code or Cowork:

```
/tm-init
```

Accept the defaults. You now have:

```
planning/
├── tasks.md      # your Kanban board
├── archive.md
└── notes/
```

Open `planning/tasks.md` — it has a `<!-- Config: Last Task ID: 0 -->` line and
empty `## To Do` / `## In Progress` / `## Done` sections. That file *is* the
memory. Everything else is automation around it.

## Step 2: Create a task

Add this under `## To Do` and bump the config counter to `1`:

```markdown
### TASK-001 | Add a rate limiter to the API

**Priority**: 🟠 High | **Category**: Feature | **Status**: todo
**Workflow**: Feature | **Complexity**: Standard
**Created**: 2026-05-31 | **Started**: | **Finished**:

Add per-IP rate limiting to the public API.

**Subtasks**:
- [ ] Research rate-limit algorithms
- [ ] Implement middleware
- [ ] Add tests

**Notes**:

**Visual Operations Log**:
```

That's the whole task. No database, no app — just markdown you can read and edit.

## Step 3: Start work, and watch context appear

Flip the status and add a Started date:

```markdown
**Status**: in-progress
**Created**: 2026-05-31 | **Started**: 2026-05-31 |
```

Now end and restart the session (or just submit a new prompt). task-memory's
SessionStart hook prints your current task and progress:

```
📋 In-progress (1):
  • TASK-001 | Add a rate limiter to the API [0/3]
```

**This is the recitation pattern** — the hook re-injects "what you're working
on" so a fresh session (or a compacted one) doesn't start cold. You saw a result
in three steps.

## Step 4: Do research — it logs itself

Ask Claude to research rate-limiting approaches. As it runs `WebSearch` /
`WebFetch`, the hook appends each one to your task automatically:

```markdown
**Visual Operations Log**:
- 2026-05-31 10:30:45 - WebSearch: "token bucket vs sliding window" => token bucket allows bursts, sliding window is smoother...
- 2026-05-31 10:31:22 - WebFetch: https://example.com/rate-limit => Redis INCR with EXPIRE is the common distributed approach...
```

After the **second** research op, the hook creates `planning/notes/TASK-001.md`
with a skeleton (Summary, Patterns, Gotchas, Decisions, Resources, Open
Questions). You didn't ask for it — the **2-Action Rule** fired.

## Step 5: Write the synthesis (this part is yours)

The log captures *what happened*; you capture *what it means*. Open
`planning/notes/TASK-001.md` and fill in real insight, not quotes:

```markdown
## Patterns Discovered
- Token bucket via Redis `INCR` + `EXPIRE` — atomic, survives multiple API nodes.

## Decisions
- Chose token bucket over sliding window — we want to allow short bursts for batch clients.

## Gotchas
- `INCR` without `EXPIRE` leaks keys forever — set the TTL in the same pipeline.
```

This is the durable output. Next session, the hook reloads *this*, not the raw
log. If you skip it, the Stop hook will block you (Step 7 shows why).

## Step 6: Hit a fork — park the task with `awaiting`

Say you implement the middleware, open a PR, and now need review before you can
close the task. The action shipped, but *you* can't finish it — someone else has
to respond. Add Outcome Branches and flip to `awaiting`:

```markdown
**Status**: awaiting

**Outcome Branches**:
- If approved → merge, close TASK-001
- If changes requested → address feedback, re-request review
- If no signal by 2026-06-07 → ping reviewer in #eng
```

Now you can end the session cleanly — the Stop hook ignores `awaiting`. And if
the reviewer goes quiet past June 7, your next SessionStart will surface:

```
🔔 AWAITING — 1 task(s) past their silence-deadline:
  • TASK-001 (deadline 2026-06-07)
```

You decided what to do *once*, with full context. Future-you just executes it.

## Step 7: See the Stop hook work (optional detour)

Want to feel the forcing function? Flip TASK-001 back to `in-progress` with
unchecked subtasks and an empty notes file, then try to end the session. The
Stop hook blocks:

```
⛔ TASK-001 has incomplete subtasks and an empty notes file.
   Fill notes/TASK-001.md or change status before stopping.
```

That's not a bug — it's the point. The hook makes "preserve your work before you
walk away" structural instead of a thing you're supposed to remember. To get
past it honestly: finish the subtasks and notes, or park it (`awaiting` / `todo`).

## Step 8: Close it out

Review arrives, you merge. Check off the subtasks, set the status and Finished
date:

```markdown
**Status**: done
**Created**: 2026-05-31 | **Started**: 2026-05-31 | **Finished**: 2026-05-31

**Subtasks**:
- [x] Research rate-limit algorithms
- [x] Implement middleware
- [x] Add tests
```

Commit referencing the task:

```bash
git commit -m "feat: add per-IP rate limiter (TASK-001)"
```

## What you built

You ran a real task through the whole loop and watched task-memory do its job:

- **SessionStart** re-cited your task so you never started cold.
- **WebFetch/WebSearch** logged themselves; the **2-Action Rule** created your notes file.
- You wrote the synthesis the hook can't — and the **Stop hook** made sure you didn't skip it.
- **`awaiting` + Outcome Branches** parked the task on review and set a silence deadline that resurfaces itself.

The throughline: your research and decisions live in markdown that survives
session end, compaction, and reboots — so "what was I doing? what did I learn?
what's next?" always has an answer.

**Next:**
- [How-To Guides](HOW-TO.md) — monorepos, custom planning paths, unblocking Stop.
- [Reference](REFERENCE.md) — every field, status, hook, and config option.
- [Why it works this way](EXPLANATION.md) — the design rationale behind all of the above.
