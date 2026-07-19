# TASK-018 Notes — Rebind file watcher on task-file switch

_Created 2026-07-19. Context that survives session reset/compaction._

## Summary

The UI file watcher (2s poll via File System Access API) does not rebind when the user switches task files. After a switch, external edits to the NEW file go undetected, and a change to the OLD file can be applied under the OLD filename onto the switched board. Fix: make the watcher rebindable and restart it on every file switch. Being implemented by a delegated agent on branch `fix/task-018-watcher-rebind`.

## Root Cause (diagnosed, verified in code)

- `src/utils/fileWatcher.js` `startFileWatcher(fileHandle, callbacks)` (~L278) has `if (fileWatcherInterval) return;` → it SILENTLY no-ops if an interval already exists, so it can never bind to a new handle.
- `src/App.jsx` starts the watcher once in `loadProjectFromHandle` (~L619, guarded by `fileWatcherStartedRef`) with `onExternalChange` closing over the FIRST file's `taskResult.fileName` + `taskResult.fileHandle`.
- `src/App.jsx` `handleTaskFileSwitch` (~L815-865) swaps `setFileHandle`/`installBoard`/`setCurrentTaskFileName` but NEVER rebinds the watcher — it ends at a bare `// Update file watcher` comment.
- Module-level single `fileWatcherInterval` + `checkForExternalChanges(fileHandle, callbacks)` uses hashed baseline via `setCurrentContent`.

## The Fix (design)

1. `fileWatcher.js`: `startFileWatcher` REBINDS — clear any existing interval first, then start bound to the passed handle (replace the `if (fileWatcherInterval) return` no-op).
2. `App.jsx`: extract `startWatchingFile(fileHandle, content, fileName)` (useCallback) doing `setCurrentContent(content)` (reset baseline so first poll after switch doesn't false-fire) + `setNotificationCallbacks` + `startFileWatcher` with the onExternalChange logic parameterized by the passed `fileName`. Call it from BOTH `loadProjectFromHandle` and `handleTaskFileSwitch`.
3. Net: switching N times leaves exactly ONE interval, bound to the current file. No leaked intervals.

## Gotchas

- The interval-lifecycle IS unit-testable without a browser (fake timers + fake fileHandle whose getFile() returns known content → assert rebind polls the new handle, one interval, stop clears it). But the full flow (real file switch + external edit → UI update) is browser-only → MANUAL browser QA.
- useCallback deps: preserve existing `tasks`-as-oldTasksForComparison behavior; don't introduce new staleness.
- Pre-existing unused-import lint in App.jsx (React/FileText/MoreHorizontal/TaskSummaryBadge/OverflowMenu) is NOT from this work (present on master).

## Decisions

- Scaled process DOWN vs TASK-019: focused bug → Opus diagnose → Sonnet implement + unit test → review → ship. No full plan/debate gauntlet. — proportionate to a Standard bug fix.

## Resources

- `src/utils/fileWatcher.js` L278 startFileWatcher, L288 stopFileWatcher, L206 checkForExternalChanges, L296 setCurrentContent.
- `src/App.jsx` L619 watcher-start block, L815-865 handleTaskFileSwitch, L271 fileWatcherStartedRef, L314-316 cleanup.

## Open Questions

- Live browser QA (switch tasks-gr.md → tasks-dg.md, edit externally, confirm UI updates + no double-watcher) — the one manual step; automate the interval-lifecycle only.
- Adjacent (separate branch, after this): packaging bug — remove stale `"skills"` array from `.claude-plugin/marketplace.json` (double-registration) → ship v3.6.3.

## Result (2026-07-19)

Implemented exactly as designed above. `startFileWatcher` now clears+resets instead of no-op'ing; `startWatchingFile(handle, content, fileName)` extracted in `App.jsx` and called from both `loadProjectFromHandle` and `handleSwitchTaskFile`. Added `tests/test-watcher.mjs` (fake `setInterval`/`clearInterval` harness) proving rebind/no-leak/old-handle-stops-polling/new-handle-detected. One implementation wrinkle not anticipated in the design: the raw interval callback discarded `checkForExternalChanges`'s promise, so a naive test await raced the async poll — fixed by returning the promise from the interval callback (behavior-neutral for the real timer). All green: `test-ui.mjs` 51/51, `test-watcher.mjs` 2/2, `npm run build` clean (`task-memory.html` reverted after build, per instructions). Live browser QA still open (manual).
