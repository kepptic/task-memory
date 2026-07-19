# TASK-017 Notes — Team-safe, collision-resistant initials-namespaced task IDs

_Created 2026-07-17. Captures context that would otherwise be lost at session end or compaction._

## Summary

Add `TASK-<PREFIX>-<n>` IDs (2–4 uppercase-letter dev-initials prefix + per-file monotonic int) so multiple devs on separate branches never collide on IDs, the single counter line, or note filenames. Legacy unprefixed `TASK-<n>` must stay valid forever. Per-file header carries prefix + counter: `<!-- Config: Task Prefix: GR | Last Task ID: 677 -->`. Orchestrated: Fable plans → Codex revises/debates → Sonnet (+Haiku for safe bits) implements → Fable/Codex review → commit.

## Patterns Discovered

- Two code surfaces implement the same task model and BOTH must change: the Python hook (`hooks/task-memory-hook.py`, ships in plugin) and the JS UI (`src/`). Keep one canonical grammar mirrored in each language.
- Canonical grammar: search-form `TASK-(?:[A-Z]{2,4}-)?\d+` (non-capturing inner group → hook capture indices stay stable); anchored parse `^TASK-(?:([A-Z]{2,4})-)?(\d+)$` (g1=prefix|None, g2=num).
- Config-header regex captures prefix as lazy `([^|]*?)` then validates separately — so a malformed prefix never kills the whole match and never resets the counter.

## Gotchas

- **markdown.js counter group shift**: `configMatch[1]`→`configMatch[2]` once the prefix becomes group 1. Miss it → every board's `Last Task ID` zeroes on save.
- **NEXT_SECTION_RE must widen too** or a legacy block absorbs a following `### TASK-GR-678` block (wrong subtask counts, misrouted logs).
- **padStart(3) corruption**: never zero-pad a prefixed id (`TASK-DG-1`, not `TASK-DG-001`). Prefixed ids reconstructed verbatim; legacy keeps cosmetic padStart(3).
- **`task_prefix` JSON key** (examples/.task-memory.json = "TASK") is a DIFFERENT concept from the per-file `Task Prefix:` header — do not overload.
- **Build artifacts** `dist/`, `dist/stage/`, `release/` are generated — never hand-edit; they regenerate via `scripts/build-cowork-plugin.sh`.

## Decisions

- Hook does NOT mint IDs (verified) — minting is JS UI + documented protocol. Hook only parses. — keeps change surface small.
- New/auto-created boards stay legacy (no prefix); prefix adoption is an explicit user act (header edit or `tasks-<initials>.md` filename). — zero-migration.
- Shared helper module `src/utils/taskId.js` (new) as single JS source of truth; ~40-line Python helper block mirrors it. — eliminates regex drift.
- UI counter becomes monotonic `Math.max(header, scopedMax)` — fixes id-reuse-on-delete bug; disclose in CHANGELOG.
- Division of labor (user-updated): Sonnet writes all code, Haiku for safe mechanical (docs/fixtures), Opus tracks + mediates debate, Fable/Codex review code. Token-conscious: fold non-controversial Codex fixes directly rather than full agent round-trips.

## Resources

- `PLAN-fable-v1.md` (scratchpad) — Fable's 251-line line-anchored plan; primary implementation spec.
- `BRIEF.md` (scratchpad) — requirements + recon shared with all agents.
- `hooks/task-memory-hook.py` L400 `TASK_HEADING_RE`, L417 `NEXT_SECTION_RE`, L764 template, note routing L253/847/949.
- `src/utils/markdown.js` L18 config parse, L268 split, L284/506 reconstruct, L524 serialize.
- `src/App.jsx` L897/L1019 regex, L1025 mint.

## Debate Outcome (Phase 2 — converged)

Codex found 6 BLOCKs, ALL verified real against source:
1. Config regex must be line-anchored (`[ \t]` not `\s`, `[0-9]` + Python `re.ASCII`) — avoid cross-line match + `\d` dialect drift.
2. ID-tail boundary — `TASK-GR-12X` must not parse as `TASK-GR-12`.
3. markdown.js: anchored full-heading iteration, not `split(/###\s+TASK-/)`; preserve id verbatim.
4. React mint race — use `useRef` reservation, not just hoist out of updater.
5. **Multi-file NOT actually wired**: hook reorg gate L1211 `endswith("tasks.md","kanban.md")` rejects `tasks-gr.md`; UI discovery `fileSystem.js` only knows 2 names; watcher doesn't rebind; `init-helper.sh:70` too.
6. Fable's Python helpers are dead code (hook never mints) — cut them; add real JS tests.

Fable's rulings (PLAN-final.md supersedes v1):
- **Q1 = `TASK-043`** (keep legacy padStart(3); consistent w/ existing boards; both forms parse to 43). Fable disagreed w/ Codex here, sound rationale.
- **Q2 = Codex adopted fully** — present-but-invalid prefix disables namespacing (no filename fallthrough); no auto-uppercase of header prefix; counter always survives.
- **Q3 = option B** — fix hook path (reorg gate → `.endswith(".md")` + task_files() membership) + cheap UI discovery widen now; watcher-rebind → separate follow-up task.
- Python = regex widening ONLY; all minting policy in `src/utils/taskId.js`.

## Implementation Outcome (Phase 3 — Sonnet)

Branch `feat/task-017-namespaced-ids`, 5 code commits + 1 docs commit (Haiku). JS tests 32/32; hook suite 54 pass/10 fail (the 10 diff-identical to clean master → pre-existing, unrelated). New module `src/utils/taskId.js` is the single JS source of truth; Python = regex widening only (dead helpers cut). Sonnet deviations (all sound, Fable-verified): dropped unused `boardMeta` useState (kept `boardMetaRef`); `TASK_FILE_RE` uses `[-_.]` separator (accepts `tasks_dg.md`); added `.js` extension for Node ESM; fixed a real pre-existing test-isolation bug (teardown cleared wrong counter path).

## Review Outcome (Phase 4 — Fable, APPROVE WITH NITS)

All acceptance criteria met with traced code paths; live byte-identical round-trip of master's own board (master parser vs branch parser). Nits being cleared: (1) CLAUDE.md grep example used unsupported BRE `(?:`/`\d` → matches nothing → fix to `grep -E "^### TASK-([A-Z]{2,4}-)?[0-9]+"`; (2) tm-init "Team mode?" question missing; (3) REFERENCE.md stray `**`; (4) README/HOW-TO overstate `task_prefix` JSON key; (5) mint tested via mirror copy → extract `mintNextId` into taskId.js for direct test; (6) fileSystem.js catch swallows permission errors → narrow it. Nits 1-4 → Haiku; 5-6 → Sonnet. Extracting mintNextId (nit 5) gives a direct unit test, closing the gap P8 browser smoke covered → browser smoke skipped.

## Open Questions

- Merge/PR/push of the branch awaits user decision (not on master; not pushed).
