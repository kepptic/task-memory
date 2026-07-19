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
- `--json` — print the raw report object instead of the default rendering.
- `--take-local <id>` / `--take-ado <id>` (push only) — force a conflicted
  card to resolve toward the local or ADO side and re-baseline
  `planning/.ado-sync.json`.
- `--only <id>` (push only) — scope the run to specific ids.
- `--from-json <fixture.json>` — manual fallback (see below); feeds a
  `createMockAdoClient`-shaped fixture into the engine instead of the real
  MCP client.

**Exit codes:** `0` ok · `1` unexpected error (bad config, missing task id,
etc.) · `2` ADO unreachable — clean no-op, **zero files touched** · `3`
conflicts pending (see below).

---

## The two-way rule (D2)

| Field group | Owner | Direction |
|---|---|---|
| Title, Assignee, Priority, Sprint (iteration path) | **ADO** | Pull only — always overwritten from ADO. Never pushed. A locally-edited title is reported as `local-title-drift` and silently overwritten by the next pull. |
| **Status** | **Both** (the one genuinely conflictable field) | Pull applies ADO's state when only ADO changed since the last sync; push applies local state when only local changed. Both changed since the last sync → **conflict**, neither side is written. |
| Notes / description / subtasks | **Local** | Never touched by pull. Your notes file's context (minus the `## ADO Comments` and `## Summary` sections) pushes as a hashed comment — idempotent, re-running posts nothing new unless the content actually changed. |
| ADO comments ↔ notes | **Append-only, both ways** | Pull appends new ADO comments into `## ADO Comments` (skipping anything starting with the `[task-memory]` marker — never re-imports its own pushes). Push posts the notes context + (on a `done` transition) the distilled `## Summary`. This can never conflict — it's additive on both sides. |

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
(the state compare and the context-comment hash both short-circuit
already-completed work).

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
      "pushedCommentIds": [988],
      "promotedFrom": "TASK-GR-12"
    }
  }
}
```

`rev` is an informational fast-path hint only — conflict detection compares
`adoState`/`localStatus` **values**, never timestamps or `rev` alone (a
comment bumps `rev` too, so `rev` alone would false-positive).

---

## Manual fallback: `--from-json`

If the live MCP wiring misbehaves, the same deterministic engine can be fed
hand-gathered ADO data instead of a live connection. The fixture shape is
exactly `createMockAdoClient`'s input (`src/sync/adoClient.js`):

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
   (expect exit code `3`), resolve with `--take-ado`.
9. Failure drills: `az logout` then `pull` → exit `2`, clean no-op (verify
   nothing under `planning/` changed). Kill the MCP process mid-pull → no
   partial writes (the atomic write-temp-then-rename means either the old
   file is intact or the new one is — never a half-written file).
10. Scale sanity: a sprint of 50+ items pulls in one batch call
    (`getWorkItemsBatch` chunks at 200); comment-listing latency stays
    acceptable.

---

## See also

- [`ado-sync` skill](../skills/ado-sync/SKILL.md) — the Claude-facing workflow (when to run each command, how to distill a done-summary, how to handle exit codes 2/3).
- [`src/sync/adoClient.js`](../src/sync/adoClient.js) — the interface contract + mock (read this to understand exactly what data shape everything downstream of the client sees).
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the rest of the plugin (hook, UI, id grammar) works.
