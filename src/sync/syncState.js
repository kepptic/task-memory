// src/sync/syncState.js — TASK-019 (Azure DevOps bridge)
//
// Pure load/save/migrate for planning/.ado-sync.json (D9: committed to git,
// NOT fields in tasks.md, NOT .claude/state). Fs-free like config.js — the
// CLI reads/writes the file; this module only knows the shape and how to
// parse/serialize/migrate it.
//
// Shape (version 1), per task id:
//   { rev, adoState, localStatus, syncedAt, lastCommentId,
//     pushedContextHash, pushedCommentIds, promotedFrom }
// See PLAN-ado.md §6.1. Value-based conflict detection (D10) compares
// adoState/localStatus against the board's current state — rev is only ever
// used as a fast-path hint, never as the source of truth.

export const SYNC_STATE_VERSION = 1;

export function emptySyncState() {
  return { version: SYNC_STATE_VERSION, tasks: {} };
}

/**
 * Parse `planning/.ado-sync.json` text into a sync state object. Missing,
 * empty, unparsable, or unversioned input all safely fall back to an empty
 * v1 state (there's nothing to migrate FROM yet — v1 is the first shape).
 */
export function parseSyncState(jsonText) {
  if (!jsonText || !jsonText.trim()) return emptySyncState();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return emptySyncState();
  }
  return migrateSyncState(parsed);
}

/**
 * Normalize an already-parsed object into the current version's shape.
 */
export function migrateSyncState(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptySyncState();
  }
  if (parsed.version === SYNC_STATE_VERSION && parsed.tasks && typeof parsed.tasks === 'object') {
    return { version: SYNC_STATE_VERSION, tasks: { ...parsed.tasks } };
  }
  return emptySyncState();
}

/**
 * Serialize a sync state object back to committed JSON text (stable 2-space
 * indent, trailing newline).
 */
export function serializeSyncState(state) {
  return JSON.stringify(state, null, 2) + '\n';
}

export function getTaskEntry(state, id) {
  return (state.tasks && state.tasks[id]) || null;
}

/** Pure — returns a NEW state object with the entry set/replaced. */
export function setTaskEntry(state, id, entry) {
  return { ...state, tasks: { ...state.tasks, [id]: entry } };
}

/** Pure — returns a NEW state object with the entry removed (no-op if absent). */
export function removeTaskEntry(state, id) {
  if (!state.tasks || !(id in state.tasks)) return state;
  const tasks = { ...state.tasks };
  delete tasks[id];
  return { ...state, tasks };
}
