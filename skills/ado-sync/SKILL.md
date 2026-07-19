---
name: ado-sync
description: Bridge task-memory's board to Azure DevOps — pull sprint/assigned work items into planning/tasks.md, distill notes into a done-summary before pushing, resolve conflicts, and promote a local TASK-* into a new or existing ADO work item. Use when the project's .task-memory.json has an "ado" config block and the user asks to sync/pull/push with Azure DevOps, or to promote a task to ADO.
user-invocable: true
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---

# ADO Sync

Bridges task-memory to Azure DevOps (TASK-019). ADO owns identity, state,
assignee, priority, and sprint for synced cards (`### ADO-<n>`); task-memory
is the AI-context layer — notes, subtasks, and a distilled done-summary flow
back to ADO as comments. `TASK-<PREFIX>-<n>` ids stay the local/offline/
pre-sprint path; both id kinds coexist on one board.

**You (Claude) never call the Azure DevOps MCP tools directly and never hand-roll
REST calls.** All sync logic lives in `scripts/ado-sync.mjs`, which is
deterministic, idempotent, and offline-testable — run it via Bash and act on
its report. Full command reference, config schema, and troubleshooting:
`docs/ADO-SYNC.md` — skim that first if anything below is unclear.

## When to Use

- The project's `.task-memory.json` has an `ado` block (check with
  `Read .task-memory.json` before doing anything else — if the block is
  absent, the CLI itself will say "ADO sync not configured" and exit 0;
  don't try to work around that, tell the user the block is missing)
- User asks to "sync with ADO", "pull the sprint", "push my status", "what's
  the ADO status", or "promote this task to ADO / create an ADO work item"

## Workflow

### 1. Check status first, always

```bash
npm run sync:ado -- status --json
```

This is 100% offline (no MCP call) — it diffs the board's current `**Status**`
fields against what was recorded at the last successful pull/push. Read the
output before doing anything else: `untracked` cards were never synced,
`local-drift` cards have moved locally since the last sync (a push
candidate), `orphaned-sync-state` entries are tracked but no longer on the
board (investigate before assuming it's safe to ignore).

### 2. Dry-run the pull, then run it

```bash
npm run sync:ado -- pull --dry-run --json
```

Show the user the report (`created` / `updated` / `unchanged` / `conflicts` /
`unknown` / `warnings`) before writing anything. If it looks right:

```bash
npm run sync:ado -- pull
```

This materializes new/refreshed ADO work items onto the board (in the
section matching their mapped local status) and syncs ADO comments into
`planning/notes/ADO-<n>.md` under a `## ADO Comments` section. It never
touches description, subtasks, your notes, or logs — only ADO-owned fields
(title, Status, Assigned, Priority, Sprint, ADO url).

### 3. Before pushing a task that just went `done`: distill the Summary

The CLI never calls an LLM (D7) — distillation is exactly the part you're
for. Before running `push` on any card whose `**Status**` is now `done`:

1. Read `planning/notes/ADO-<n>.md`.
2. Fill in its `## Summary` section (it starts as a placeholder
   `_One-paragraph answer to..._` — a placeholder-only section reads as
   **missing**, not present) with **≤5 lines, imperative mood**, e.g.:
   > Wired the pull path through board.js's surgical field edits; added the
   > conflict-detection rule shared with push. Verified against the mock
   > client — 14 new offline test cases.
3. Link nothing but the repo — the CLI appends the repo URL + notes path
   itself. Don't paste secrets, don't paste huge diffs, don't link external
   tools.

If you skip this, `push` still pushes the Status transition — it just skips
the summary comment and reports `needsSummary` for that id. Always fill it
in when you can; it's the whole point of the bridge.

### 4. Push

```bash
npm run sync:ado -- push --dry-run --json   # review first
npm run sync:ado -- push
```

Per card: Status pushes to ADO (deferred until *after* the summary comment
for a `done` transition, so ADO can't lock a closed item out from under the
comment), your notes context posts as a hashed `[task-memory]` comment
(idempotent — re-running posts nothing new unless the context actually
changed), and the summary posts before the closing state transition.

### 5. Exit code 3 — conflicts pending

Both sides changed since the last sync (ADO's state moved AND the local
`**Status**` moved). The CLI never overwrites either side automatically.

1. Run `npm run sync:ado -- push --json` (or check the `conflicts` array
   from the last run) — for each conflicted id you'll get
   `{id, localStatus, adoState, since}`.
2. Show the user the diff directly: *"ADO-12345: local moved to `done`, ADO
   moved to `Removed`, since 2026-07-19. Which side should win?"*
3. Ask with `AskUserQuestion` — options are exactly "keep local" or "keep
   ADO" (do not guess).
4. Resolve with the matching flag and re-run:
   ```bash
   npm run sync:ado -- push --take-local ADO-12345   # force push local state
   npm run sync:ado -- push --take-ado ADO-12345      # force-apply ADO's state locally
   ```
   Both re-baseline the sync-state entry so the conflict won't resurface.

Comments still flow both directions during a conflict — only the Status
field is held back.

### 6. Exit code 2 — ADO unreachable

The MCP server didn't start or auth failed. **Stop. Do not improvise REST
calls, do not guess at work item state, do not retry in a loop.** Tell the
user: "Azure DevOps is unreachable — confirm `az login` is current and that
`npx -y @azure-devops/mcp <org>` can start, then re-run." Nothing was
written locally (the CLI gates on `ping()` before touching any file).

### 7. Manual fallback (`--from-json`) — only if the user explicitly asks

If live MCP wiring is misbehaving and the user explicitly wants to proceed
anyway, you may gather the same tool outputs by calling the ADO MCP tools
yourself (via whatever MCP client surface is available to you in that
moment) and hand-assembling them into the `createMockAdoClient` fixture
shape documented in `docs/ADO-SYNC.md` (`--from-json <file>` section) and
`src/sync/adoClient.js`. Then run:

```bash
npm run sync:ado -- pull --from-json /path/to/hand-built-fixture.json
```

This feeds the exact same deterministic engine — nothing about the decision
logic changes, only where the ADO data came from. **Never do this
proactively** — it's a last resort, and the CLI's normal path (dynamic
import of `adoClientMcp.js`) is what runs by default.

### Promoting a local task to ADO

```bash
npm run sync:ado -- promote TASK-GR-12          # creates a new ADO work item (default)
npm run sync:ado -- promote TASK-GR-12 --link 555 # links an existing ADO work item instead
```

Creates (or verifies) the ADO item FIRST, then rewrites the board and renames
the notes file second — if the local rewrite somehow fails, the report still
names the created/linked id so nothing is silently orphaned. The old TASK-*
id's counter is never touched; the trace survives via `promotedFrom` in
`planning/.ado-sync.json` and a `> Promoted from TASK-GR-12 on <date>` header
in the renamed notes file.

## What NOT to do

- Never call ADO MCP tools directly for anything the CLI already does — the
  CLI is the only place decision logic (state mapping, conflict rule,
  idempotent comment hashing) lives. Hand-driving individual tool calls
  bypasses all of that and risks double-posting comments or silently losing
  a conflict.
- Never hand-edit `planning/.ado-sync.json` — it's sync bookkeeping, not a
  user-facing file. If it looks wrong, that's a bug — investigate, don't patch.
- Never retry past exit code 2 in a loop. One clear message to the user, then stop.
- Never post a summary comment with anything longer than ~5 lines or that
  links outside the repo.
