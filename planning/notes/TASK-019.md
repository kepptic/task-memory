# TASK-019 Notes — Azure DevOps bridge (full two-way)

_Created 2026-07-19. Context that survives session reset/compaction._

## Summary

Bridge task-memory ↔ Azure DevOps. ADO owns identity/state/sprints; task-memory becomes the AI-context layer keyed to ADO work-item ids (`### ADO-12345`, `notes/ADO-12345.md`). Sync on-demand via the official `microsoft/azure-devops-mcp` behind a deterministic CLI. Full two-way per user directive (overrides Fable's earlier one-way descope). `TASK-<PREFIX>-<n>` stays the local/offline path. Orchestration: Fable plans → Opus orchestrates → Sonnet codes → Codex reviews (Fable fallback) → loop until complete. Plan: `scratchpad/PLAN-ado.md`.

## Key Architecture Decisions (Fable, §0)

- **D4 (upgrade):** real `adoClient` = programmatic MCP client (`@modelcontextprotocol/sdk` stdio) spawning `npx -y @azure-devops/mcp <org>`; sync is one deterministic CLI `scripts/ado-sync.mjs pull|push|promote|status`. Claude "drives the MCP" by running that command via a skill — testable/idempotent, not hand-called tool calls. Escape hatch: `--from-json <file>` feeds fixture-shaped ADO data into the same engine.
- **D1** create-on-promote default (`--link <adoId>` to link existing). **D3** both id kinds live; board never mints `ADO-*` (ADO does); `mintNextId` stays TASK-only. **D5** surgical anchored splicing, never regenerate the board. **D6** `**Sprint**:`/`**ADO**:` become first-class markdown.js fields. **D7** Claude distills `## Summary` into notes; CLI posts it verbatim (CLI never calls an LLM). **D8** `ADO-[1-9][0-9]*` (no leading zeros). **D9** bookkeeping in `planning/.ado-sync.json` (committed). **D10** value-based conflict detection (compare state strings; `System.Rev` only a fast-path hint — comments bump rev so rev alone false-positives).
- **Conflict rule (D2):** ADO owns state/title/assignee/sprint/priority; local owns notes/subtasks/description. Notes↔comments are append-only merges with provenance markers (cannot conflict). Only true conflict: Status vs System.State both changed since last sync → surface diff, skip that task's state sync.

## Gotchas

- **markdown.js `parseTask` swallows unknown `**Field**:` lines into `description`** → the UI garbles them on save. That's why `**Sprint**`/`**ADO**` must be first-class parsed+emitted fields (D6).
- **MCP tool names** (from azure-devops-mcp `docs/TOOLSET.md`): `work_list_team_iterations`, `wit_get_work_items_for_iteration`, `wit_my_work_items`, `wit_query_by_wiql`, `wit_get_work_item`, `wit_get_work_items_batch_by_ids`, `wit_update_work_item`, `wit_create_work_item`, `wit_list_work_item_comments`, `wit_add_work_item_comment`. Resolve by **suffix** at runtime (client-host prefixes drift). `wit_update_work_item` payload shape (`op/path/value` vs flat) is UNVERIFIED — live-checklist item; isolated in one wrapper fn.
- MCP results arrive as `content:[{type:'text', text:'<json>'}]` — parse defensively. Strip HTML from comment text (`htmlToText.js`).
- **No live ADO** during build → mock boundary is sacred; everything unit-tested against `createMockAdoClient`. Only the live wire calls are unverified (documented integration checklist §10).

## Decisions (this session)

- Build P0-P9 in one autonomous Sonnet run (per-phase commits), then Codex review → fix loop → Haiku P10 docs → Fable final → ship. — user: "do not stop and loop until complete."
- taskId.js additions only; TASK-017 behavior bit-identical. — avoid regressing the shipped v3.5.0 grammar.

## Resources

- `scratchpad/PLAN-ado.md` (361 lines) — the executable spec. `scratchpad/ADO-BRIEF.md` — the brief.
- Foundation: `src/utils/taskId.js` (grammar single-source), hook heading/section regexes, markdown.js parse/generate.
- New: `src/sync/{adoClient,adoClientMcp,config,board,notes,syncState,engine,htmlToText}.js`, `scripts/ado-sync.mjs`, `tests/test-sync.mjs`, `tests/fixtures/ado/`.

## Review Round 1 (Codex — CHANGES REQUIRED, 16 findings)

Codex found real data-integrity bugs (full detail: `scratchpad/CODEX-ado-review.md`). Highlights being fixed by Sonnet:
- **Critical:** `--from-json` on push/promote recorded nonexistent remote writes → make it read-only (pull/status/dry-run only).
- **High:** board section-match ignored configured column ids → duplicate `## To Do` at EOF (hit the stock board); context-only edits + conflict-time comments never pushed (violated D2 — separate state-recon from comment-processing); mid-push transport failure returned exit 0 (not clean no-op); done-summary not recorded → double-post on retry; cross-file writes not crash-safe (promote unlinked notes before commit) → sync-state written LAST as commit marker + recoverable rename; `--link` permissive parseInt; adoClientMcp getWorkItem masked transport/auth failures as null.
- **Medium:** prose `**ADO**:` mistaken for metadata; promote baselined localStatus from derived section id not parsed Status; syncedAt advanced on unresolved conflict; `--take-ado` unmapped-state fallback; `--json` not JSON-pure (parser logs) → quiet-logger; hook grammar `### ADO-12-foo` mis-parsed → tail boundary; several tests MASKED the bugs (asserted the buggy behavior) → corrected + coverage added.
- Lint: `ado-sync.mjs:241` unused `config` param confirmed → removed; markdown.js "unused var" REFUTED by Codex (pre-existing/false) → left alone.

Codex ran 59/63 sync tests in its sandbox (4 CLI blocked by EPERM), UI 50/50; honest review, even refuted one of its own lint flags. Sonnet fixed all 16 (test-sync 63→86, UI 51/51, hook 78/88 baseline). Verified quiet-logger (#13) is real, not dead code.

## Review Round 2 (Fable final — DO NOT SHIP, 2 catches Codex missed, then SHIP-ready)

Fable confirmed all 16 Codex fixes genuinely resolved + everything else ship-quality, but caught two:
- **B1 (blocker, silent data-loss):** pull's noop branch re-baselines a pending local status change as "already synced" (engine.js ~311-319, localStatus=current board status). The documented pull→push flow then silently never pushes status to ADO; `status` says in-sync forever. Reproduced empirically. Pre-existing from P5; Codex #11 grazed it. Fix: preserve `entry.localStatus` on noop; add pull→push-with-local-only-change regression test.
- **B2 (must-fix, spam):** `extractContext` (notes.js ~189-193) has no skeleton rejection → first push posts the ~40-line notes skeleton as a comment on EVERY item (50-item sprint = 50 junk comments). Conflict test baked it in. Fix: reject skeleton in extractContext + fixture fix + zero-comment regression test.
- Non-blocking follow-ups (also doing): CLI exit-4 test; document addComment lost-response at-least-once (double-post) in ADO-SYNC.md.
Residual promote crash-window judged narrower than docs claim — no data loss possible, acceptable v1.

## Open Questions

- `wit_update_work_item` exact payload shape — resolve at live integration.
- Live-ADO end-to-end sync — the one thing not verifiable offline; handed to user with a checklist (PLAN §10).
