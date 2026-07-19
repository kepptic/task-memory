# ADO Sync — Azure DevOps Bridge (TASK-019)

Full two-way bridge between task-memory's board (`planning/tasks.md`) and
Azure DevOps work items. ADO owns identity, state, assignee, priority, and
sprint for synced cards (`### ADO-<n>`); task-memory is the AI-context layer
— notes, subtasks, and a distilled done-summary flow back to ADO as
comments. `TASK-<PREFIX>-<n>` ids (see [REFERENCE.md](REFERENCE.md)) stay the
local/offline/pre-sprint path; both id kinds coexist on one board.

This feature is entirely **opt-in**: if `.task-memory.json` has no `ado`
block, nothing changes — the hook, the UI, and every existing test behave
exactly as before. See [ARCHITECTURE.md](ARCHITECTURE.md) for how the rest
of the plugin works; this doc covers only the ADO bridge.

---

## Setup

1. **`az login`** — the ADO MCP server authenticates via the Azure CLI
   session (or its own browser-OAuth fallback). No PAT, no custom REST
   client, no stored secret.
2. **Confirm the MCP server can start**: `npx -y @azure-devops/mcp <org>`
   should launch without error (Node/npx must be on PATH; first run
   downloads the package).
3. **Add the `ado` block** to `.task-memory.json` (schema below).
4. **Try it**: `npm run sync:ado -- status` (fully offline — proves the
   config parses) then `npm run sync:ado -- pull --dry-run` (first live
   MCP call — proves auth + connectivity).

## Config schema

```json
{
  "ado": {
    "org": "https://dev.azure.com/<org>",
    "project": "<project>",
    "team": "<team>",
    "area_path": "Optional\\Area\\Filter",
    "scope": "current-sprint",
    "work_item_type": "Task",
    "task_file": "planning/tasks.md",
    "repo_url": "https://github.com/<owner>/<repo>",
    "state_map": {
      "todo": "New",
      "in-progress": "Active",
      "awaiting": "Resolved",
      "done": "Closed"
    }
  }
}
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `org` | yes | — | URL or bare org name; `https://dev.azure.com/` is stripped automatically. |
| `project` | yes | — | |
| `team` | no | `''` | Used by `current-sprint` scope. |
| `area_path` | no | `''` | Applied to work items created by `promote`. |
| `scope` | no | `"current-sprint"` | `"current-sprint"` \| `"my-work"` \| `{"wiql": "..."}`. |
| `work_item_type` | no | `"Task"` | Type created by `promote` (default create, no `--link`). |
| `task_file` | no | `<planning_dir>/tasks.md` | Which board file this bridge syncs. Multi-file boards (`task_files_glob`) sync only this one file. |
| `repo_url` | no | `''` | Appended to the done-summary comment. |
| `state_map` | no | `{todo:New, in-progress:Active, awaiting:Resolved, done:Closed}` | Local column id → raw ADO state string (verbatim, case-sensitive — match your process template). |

**`state_map` semantics:**
- The reverse map (ADO state → local status, used on pull) is derived by
  inversion. If two local keys map to the same ADO state, the **first key in
  object order wins** on pull.
- **Unmapped local status on push** → that task's state push is skipped,
  reported (`reason: "unmapped-status"`). Notes/comments still flow.
- **Unknown ADO state on pull** → an existing card **keeps its current
  Status** (+ a warning report); a brand-new card lands in `todo` (+ a
  warning report).

Missing the whole `ado` block → every `ado-sync` command prints "ADO sync
not configured" and exits 0. This is the rollback story: delete the block to
turn the feature off.

---

## Command reference

```
npm run sync:ado -- pull    [--dry-run] [--json] [--from-json <fixture.json>]
npm run sync:ado -- push    [--dry-run] [--take-local <id>]... [--take-ado <id>]...
                             [--only <id>]... [--json] [--from-json <fixture.json>]
npm run sync:ado -- promote <TASK-id> [--link <n>] [--from-json <fixture.json>]
npm run sync:ado -- status  [--json]
```

(Equivalently: `node scripts/ado-sync.mjs <command> ...`.)

| Command | What it does | Touches the network? |
|---|---|---|
| `status` | Diffs the board's current `**Status**` fields against `planning/.ado-sync.json` (last-known sync state). Purely informational. | No — fully offline. |
| `pull` | Fetches the configured scope (+ every `ADO-<n>` already on the board) from ADO, materializes new cards, refreshes ADO-owned fields on existing ones, syncs comments into notes. | Yes. |
| `push` | Pushes local Status changes (mapped via `state_map`), your notes context, and a distilled done-summary. | Yes. |
| `promote <TASK-id>` | Converts a local `TASK-*` card into an ADO-backed `ADO-<n>` card — creates a new work item by default, or attaches an existing one with `--link <n>`. | Yes. |

**Flags:**
- `--dry-run` — compute and print the report; write nothing.
- `--json` — print the raw report object instead of the default rendering
  (pure JSON — `parseMarkdown`/`parseTask`'s normal dev-console logging is
  silenced for the duration of the process).
- `--take-local <id>` / `--take-ado <id>` (push only) — force a conflicted
  card to resolve toward the local or ADO side and re-baseline
  `planning/.ado-sync.json`.
- `--only <id>` (push only) — scope the run to specific ids.
- `--from-json <fixture.json>` — manual fallback (see below); feeds a
  `createMockAdoClient`-shaped fixture into the engine instead of the real
  MCP client. **Read-only escape hatch, restricted to non-mutating runs**:
  allowed unconditionally for `pull`/`status`, allowed for `push` only when
  `--dry-run` is also passed, and **rejected outright for `promote`** (it
  has no dry-run form — every call creates or links a real work item). Using
  it with a real `push`/`promote` would make the engine believe a write
  landed in Azure DevOps when nothing did.

**Exit codes:** `0` ok · `1` unexpected error (bad config, missing task id,
invalid `--link`, `--from-json` used with a mutating command, etc.) · `2`
ADO unreachable — clean no-op, **zero files touched** (the ping() gate
failed before any local write, and before any remote write) · `3` conflicts
pending (see below) · `4` partial remote failure — `push` landed some writes
then failed on others (e.g. the MCP connection died mid-run); check
`report.failed`, then just re-run — the state compare and both comment-hash
guards make re-running safe, only what didn't land gets retried.

---

## The two-way rule (D2)

| Field group | Owner | Direction |
|---|---|---|
| Title, Assignee, Priority, Sprint (iteration path) | **ADO** | Pull only — always overwritten from ADO. Never pushed. A locally-edited title is reported as `local-title-drift` and silently overwritten by the next pull. |
| **Status** | **Both** (the one genuinely conflictable field) | Pull applies ADO's state when only ADO changed since the last sync; push applies local state when only local changed. Both changed since the last sync → **conflict**, neither side is written. |
| Notes / description / subtasks | **Local** | Never touched by pull. Your notes file's context (minus the `## ADO Comments` and `## Summary` sections) pushes as a hashed comment — idempotent, re-running posts nothing new unless the content actually changed. |
| ADO comments ↔ notes | **Append-only, both ways** | Pull appends new ADO comments into `## ADO Comments` (skipping anything starting with the `[task-memory]` marker — never re-imports its own pushes). Push posts the notes context + (on a `done` transition) the distilled `## Summary`. This can never conflict — it's additive on both sides. |

Because comments/context are append-only and can never conflict, `push`
posts the context comment **regardless of what the Status decision does** —
a context-only local edit (notes changed, Status didn't: `push`'s internal
`noop` decision) still posts; a Status conflict still posts (only the
Status *write* is withheld). The only decision that withholds comments too
is `untracked` (no prior `pull` baseline for that card yet — there's nothing
to compare against).

### Conflict rule, precisely

```
adoChanged   = current ADO state   != last-known ADO state
localChanged = current local Status != last-known local Status

pull:  adoChanged && !localChanged  -> apply ADO's state locally
       !adoChanged                  -> leave the board as-is (that's push's job)
       adoChanged && localChanged   -> CONFLICT — leave Status alone, report it

push:  localChanged && !adoChanged  -> push local state to ADO
       !localChanged                -> nothing to push
       localChanged && adoChanged   -> CONFLICT — make zero ADO calls, report it
```

A brand-new card (no `planning/.ado-sync.json` entry yet) can never conflict
on pull — there's no baseline to compare against, so ADO's state just
applies. On push, a card with no entry is `untracked` (push requires a prior
pull to have established a baseline).

### Resolving a conflict

```bash
npm run sync:ado -- push --json          # see {id, localStatus, adoState, since} per conflict
npm run sync:ado -- push --take-local ADO-12345   # force-push local Status to ADO
npm run sync:ado -- push --take-ado ADO-12345      # force-apply ADO's state locally
```

Both flags re-baseline that task's `planning/.ado-sync.json` entry so the
conflict won't resurface. Comments still flow in both directions during a
conflict — only the Status field is held back.

`--take-ado` requires the ADO state to have a REVERSE mapping back to a
local status (i.e. it appears as a value somewhere in `state_map`) — an ADO
state your `state_map` doesn't know about is reported as
`take-ado-unmapped-ado-state` and the conflict is left exactly as it was
(never silently re-baselined without actually applying anything). Fix
`state_map`, or use `--take-local` instead.

---

## Done flow

When a card's `**Status**` becomes `done` (and ADO wasn't already in the
`state_map.done` state), `push` runs an ordered pipeline **before** the
state transition lands, so ADO can't lock a closed item out from under a
pending comment:

1. **Context comment** (if the notes context changed since the last push — hashed, idempotent).
2. **Summary comment** — the notes file's `## Summary` section, verbatim, plus the repo URL + notes path. A placeholder-only Summary (never filled in) is treated as **missing**: the state still transitions, but the summary comment is skipped and the id is reported under `needsSummary`.
3. **State transition** to `state_map.done`.

A failed stage stops only that task — whatever landed earlier stays recorded
in `planning/.ado-sync.json`, so re-running only retries what didn't land
(the state compare, the context-comment hash, AND the summary-comment hash
all short-circuit already-completed work — so if the summary comment landed
but the state transition then failed, the retry moves straight to the state
transition instead of posting the summary a second time).

---

## `planning/.ado-sync.json`

Committed to git (survives clones/machines with the board it describes),
never hand-edited:

```json
{
  "version": 1,
  "tasks": {
    "ADO-12345": {
      "rev": 7,
      "adoState": "Active",
      "localStatus": "in-progress",
      "syncedAt": "2026-07-19T10:00:00Z",
      "lastCommentId": 987,
      "pushedContextHash": "sha256:...",
      "pushedSummaryHash": "sha256:...",
      "pushedCommentIds": [988],
      "promotedFrom": "TASK-GR-12"
    }
  }
}
```

`rev` is an informational fast-path hint only — conflict detection compares
`adoState`/`localStatus` **values**, never timestamps or `rev` alone (a
comment bumps `rev` too, so `rev` alone would false-positive).

`syncedAt` records the last time `adoState`/`localStatus` were
**successfully reconciled** — a pull/push run that ends in a conflict never
bumps it (even though comments may still have flowed and `lastCommentId`
advanced), so a conflict report's "since" always reflects when the two
sides actually diverged, not the timestamp of the most recent failed
reconciliation attempt.

---

## Manual fallback: `--from-json`

If the live MCP wiring misbehaves, the same deterministic engine can be fed
hand-gathered ADO data instead of a live connection. The fixture shape is
exactly `createMockAdoClient`'s input (`src/sync/adoClient.js`).

**Restricted to non-mutating runs.** `--from-json` never talks to real Azure
DevOps — for `pull`/`status` that's fine (they only ever write LOCAL files),
but a REAL `push`/`promote` mutates ADO itself, so feeding it fixture data
would make the engine record fields/comments/work-items as pushed when
nothing actually landed. The CLI therefore:
- allows `--from-json` unconditionally for `pull` and `status`,
- allows it for `push` **only** when `--dry-run` is also passed (compute and
  print the report against fixture data; write nothing, push nothing),
- **rejects it outright for `promote`** — promote has no dry-run form; every
  call creates or links a real work item, so there is no safe non-mutating
  way to run it against fixture data.

A rejected combination exits `1` with a message naming the offending flag —
this is a fast, local, offline check (no client is ever built).

```json
{
  "iterations": [{ "id": "iter1", "name": "Sprint 1", "path": "proj\\Sprint 1", "timeFrame": "current" }],
  "iterationItems": { "iter1": [12345, 12346] },
  "myItems": [12345],
  "workItems": {
    "12345": {
      "id": 12345, "rev": 3, "title": "Example item", "state": "Active",
      "type": "Task", "assignee": "Alice", "iterationPath": "proj\\Sprint 1",
      "priority": 2, "url": "https://dev.azure.com/org/proj/_workitems/edit/12345"
    }
  },
  "comments": {
    "12345": [{ "id": 1, "author": "Alice", "createdDate": "2026-07-19T00:00:00Z", "text": "A comment" }]
  },
  "nextId": 90000,
  "nextCommentId": 500
}
```

```bash
npm run sync:ado -- pull --from-json /path/to/fixture.json
```

Working examples: `tests/fixtures/ado/*.json`. This is a last resort, used
only when explicitly asked for (see the `ado-sync` skill's "What NOT to do"
section) — the normal path dynamically imports the real MCP client
(`src/sync/adoClientMcp.js`) and never touches this fixture format.

---

## Live-ADO integration checklist

The only thing that can't be verified offline (no live ADO project is
available during development — every other behavior is unit-tested against
`createMockAdoClient`). Run through this once against a real org/project
before trusting the bridge in production.

**Prereqs:** `az login` done; an org/project with a few throwaway work
items; the `ado` config block filled in.

1. `npx -y @azure-devops/mcp <org>` starts. `npm run sync:ado -- status` then
   `pull --dry-run` connects (browser/azcli auth completes) and resolves
   every tool suffix listed in `src/sync/adoClientMcp.js`'s `TOOL_SUFFIXES`
   — if one is missing, the error names the missing suffix; fix that one
   constant.
2. Verify normalized `WorkItem` fields against a real item — `AssignedTo`
   shape, `Priority` presence, `IterationPath` format (the MCP server's JSON
   may differ subtly from what's assumed in `adoClientMcp.js`'s
   `normalizeWorkItem`).
3. `pull` materializes a sprint. Verify sections, Sprint/ADO fields,
   comments landed in notes. Re-pull → zero diff (`changed: false`).
4. **`updateWorkItemFields` payload shape** — flip a state; if the server
   wants a different `updates` encoding than `{op:'replace', path:'/fields/<ref>', value}`,
   fix only `adoClientMcp.js`'s `updateWorkItemFields`.
5. Comment push: the `[task-memory]` marker comment appears in ADO;
   re-pushing posts no duplicate; pulling afterward does not re-import the
   bot's own comment.
6. Done flow on a scratch item: summary comment lands, then the state
   transitions to closed — confirm that ordering in the ADO activity log.
7. Promote a scratch local task (default create) and a second one with
   `--link` to an existing item; confirm both the ADO item's content and
   the local board rewrite.
8. Conflict drill: change state in the ADO web UI AND locally, run `push`
   (expect exit code `3`), resolve with `--take-ado`. Also drill
   `--take-ado` against an ADO state your `state_map` doesn't cover —
   expect it rejected (`take-ado-unmapped-ado-state`), not silently no-op'd.
9. Failure drills:
   - `az logout` then `pull` → exit `2`, clean no-op (verify nothing under
     `planning/` changed — the `ping()` gate fails before any local write).
   - Kill the MCP process mid-**pull**, after it's connected → no partial
     writes for a single run (write-temp-then-rename per file, sync-state
     written last as the commit marker); re-running is safe.
   - Kill the MCP process mid-**push**, after ≥1 work item has already been
     updated → expect exit code `4` (partial remote failure), not `0` or
     `2` — `report.failed` names which task(s) didn't land; re-run to retry
     only those (the state/context/summary hash guards make it safe).
   - Kill the process (or otherwise interrupt) mid-**promote**, right after
     the local board/notes rewrite but before `planning/.ado-sync.json` is
     written → the OLD notes file must NOT be gone; it's either still at
     `notes/TASK-x.md` or renamed to a recoverable
     `notes/TASK-x.md.tmp-promoted-*` (cleaned up automatically on a
     successful re-run of the write step, harmless if it lingers).
     **Known residual limitation** (documented, not automatically
     recoverable): a crash strictly between the board rewrite (heading now
     `ADO-<n>`) and the notes-file rename can leave the board showing the
     new id while its notes are still under the old `TASK-x.md` name with
     no `.ado-sync.json` entry yet — recover by hand (rename the notes file
     to `ADO-<n>.md`, re-run `status`) if it's ever observed; a full
     cross-file journal was judged unnecessary for v1 given how narrow this
     window is (three synchronous, fast local file operations).
10. Scale sanity: a sprint of 50+ items pulls in one batch call
    (`getWorkItemsBatch` chunks at 200); comment-listing latency stays
    acceptable.

---

## See also

- [`ado-sync` skill](../skills/ado-sync/SKILL.md) — the Claude-facing workflow (when to run each command, how to distill a done-summary, how to handle exit codes 2/3/4).
- [`src/sync/adoClient.js`](../src/sync/adoClient.js) — the interface contract + mock (read this to understand exactly what data shape everything downstream of the client sees).
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the rest of the plugin (hook, UI, id grammar) works.
