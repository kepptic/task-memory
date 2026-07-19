// src/sync/engine.js — TASK-019 (Azure DevOps bridge)
//
// Pull/push/promote orchestration. The client is injected (createMockAdoClient
// in tests, the real MCP client in scripts/ado-sync.mjs) and this module does
// NO filesystem access — every function takes/returns plain strings/objects.
// The CLI is the only thing that reads/writes planning/tasks.md,
// planning/notes/*.md, and planning/.ado-sync.json; that keeps the "write
// nothing until every ADO read has succeeded" offline-first guarantee (see
// PLAN-ado.md §5.3 step 6) trivially true — if pull() throws before
// returning, the CLI never opens a file for write.
//
// Board mutation is surgical (D5): every task's fields are edited in place
// via board.js's setField/setBlockHeading/replaceBlockAt, never a full
// parseMarkdown -> generateMarkdown regeneration.

import { markdownParser } from '../utils/markdown.js';
import {
  findBlocks,
  readField,
  setField,
  setBlockHeading,
  replaceBlockAt,
  insertBlock,
  newAdoBlockText,
} from './board.js';
import { ensureNotesSkeleton, appendComments } from './notes.js';
import { getTaskEntry, setTaskEntry } from './syncState.js';

function adoIdFor(numericId) {
  return `ADO-${numericId}`;
}

function adoNumFromBlockId(id) {
  const m = /^ADO-([1-9][0-9]*)$/.exec(id);
  return m ? parseInt(m[1], 10) : null;
}

function newReport() {
  return {
    created: [],
    updated: [],
    unchanged: [],
    conflicts: [],
    unknown: [],
    warnings: [],
    notesCreated: [],
    commentsAppended: {},
  };
}

/**
 * Resolve the set of ADO work-item ids to pull, per config.scope.
 * `current-sprint` with no current iteration configured/found resolves to
 * an empty scope-set (union with board ids still applies upstream).
 */
async function resolveScopeIds(config, client) {
  const scope = config.scope;
  if (scope === 'current-sprint') {
    const iterationId = await client.currentIterationId();
    if (!iterationId) return [];
    return client.listIterationWorkItemIds(iterationId);
  }
  if (scope === 'my-work') {
    return client.myWorkItemIds();
  }
  if (scope && typeof scope === 'object' && typeof scope.wiql === 'string') {
    return client.queryByWiql(scope.wiql);
  }
  return [];
}

/**
 * Shared conflict rule (PLAN-ado.md §6.3), pull direction.
 *   entry absent          -> 'apply-ado' (first sync — nothing to conflict with)
 *   adoChanged && !local   -> 'apply-ado'
 *   !adoChanged            -> 'noop' (local edit, if any, is push's job)
 *   adoChanged && local    -> 'conflict'
 */
export function decidePull(entry, adoState, currentLocalStatus) {
  if (!entry) return { action: 'apply-ado' };
  const adoChanged = adoState !== entry.adoState;
  const localChanged = currentLocalStatus !== entry.localStatus;
  if (adoChanged && !localChanged) return { action: 'apply-ado' };
  if (!adoChanged) return { action: 'noop' };
  return { action: 'conflict' };
}

/**
 * Shared conflict rule (PLAN-ado.md §6.3), push direction.
 *   entry absent           -> 'untracked' (push requires a prior pull baseline)
 *   localChanged && !ado    -> 'push'
 *   !localChanged           -> 'noop'
 *   localChanged && ado     -> 'conflict'
 */
export function decidePush(entry, adoState, currentLocalStatus) {
  if (!entry) return { action: 'untracked' };
  const adoChanged = adoState !== entry.adoState;
  const localChanged = currentLocalStatus !== entry.localStatus;
  if (localChanged && !adoChanged) return { action: 'push' };
  if (!localChanged) return { action: 'noop' };
  return { action: 'conflict' };
}

/**
 * Apply ADO-owned fields to an existing block's text (title/assignee/
 * priority/sprint/url are ADO-exclusive per D2 — always overwritten;
 * Status only when `applyStatus` is a non-null local status id).
 */
// Set an ADO-owned field only when there's something to say: a truthy new
// value always wins (materializes if absent, overwrites if present); an
// empty new value only clears a field that already exists — it never
// force-inserts a brand-new empty field. Without this guard, unconditionally
// calling setField on every pull would insert e.g. an empty **Assigned**
// field onto a block that legitimately never had one (item.assignee === ''
// both times), producing a spurious diff — and a false `changed: true` —
// on every single re-pull even when nothing on the ADO side moved.
function setOptionalField(blockText, name, value) {
  const hasField = readField(blockText, name) !== null;
  if (!value && !hasField) return blockText;
  return setField(blockText, name, value || '');
}

function applyAdoFieldsToBlock(blockText, id, item, applyStatus) {
  let text = setBlockHeading(blockText, id, item.title);
  if (applyStatus) {
    text = setField(text, 'Status', applyStatus);
  }
  text = setOptionalField(text, 'Assigned', item.assignee);
  text = setOptionalField(
    text,
    'Priority',
    item.priority !== null && item.priority !== undefined ? String(item.priority) : '',
  );
  text = setOptionalField(text, 'Sprint', item.iterationPath);
  text = setOptionalField(text, 'ADO', item.url);
  return text;
}

/**
 * engine.pull — materialize/refresh ADO-scoped work items onto the board
 * and sync comments into their notes files. See PLAN-ado.md §5.3.
 *
 * @param {object} opts
 * @param {string} opts.boardText
 * @param {Object<string,string>} opts.notesFiles - notes file path/id -> text (keyed by bare id, e.g. "ADO-12345")
 * @param {object} opts.syncState - parsed planning/.ado-sync.json (syncState.js shape)
 * @param {object} opts.config - loadAdoConfig()'s `.config`
 * @param {object} opts.client - adoClient (mock or real)
 * @param {string} opts.today - YYYY-MM-DD, for **Created** stamps on new blocks
 * @returns {Promise<{boardText: string, notesFiles: object, syncState: object, changed: boolean, report: object}>}
 */
export async function pull({ boardText, notesFiles, syncState, config, client, today }) {
  // Gate FIRST, before any local mutation — AdoUnavailableError here means
  // the CLI never opens a file for write (offline-first, PLAN-ado.md §5.3.1).
  await client.ping();

  const scopeIds = await resolveScopeIds(config, client);

  const boardBlocksAtStart = findBlocks(boardText);
  const boardAdoIds = boardBlocksAtStart
    .filter((b) => b.kind === 'ado')
    .map((b) => adoNumFromBlockId(b.id))
    .filter((n) => n !== null);

  const allIds = Array.from(new Set([...scopeIds, ...boardAdoIds]));
  const items = await client.getWorkItemsBatch(allIds);
  const itemsById = new Map(items.map((i) => [i.id, i]));

  const report = newReport();

  for (const num of boardAdoIds) {
    if (!itemsById.has(num)) {
      report.unknown.push(adoIdFor(num));
    }
  }

  const { config: boardConfig } = markdownParser.parseMarkdown(boardText, {});
  const columns = boardConfig.columns;

  let currentBoardText = boardText;
  let currentNotesFiles = { ...notesFiles };
  let currentSyncState = syncState;
  const nowIso = new Date().toISOString();

  for (const item of items) {
    const id = adoIdFor(item.id);
    const comments = await client.listComments(item.id);
    const entry = getTaskEntry(currentSyncState, id);

    // Notes: skeleton + comment append (id-keyed, independent of board state).
    const priorText = currentNotesFiles[id] || '';
    const { text: skeletonText, created: notesCreated } = ensureNotesSkeleton(
      priorText,
      id,
      item.title,
      today,
    );
    if (notesCreated) report.notesCreated.push(id);

    const lastCommentId = (entry && entry.lastCommentId) || 0;
    const newComments = comments.filter((c) => c.id > lastCommentId);
    const { text: notesWithComments, appendedMaxId } = appendComments(skeletonText, newComments);
    if (appendedMaxId !== null) {
      const appendedCount = newComments.filter(
        (c) => !(c.text || '').trimStart().startsWith('[task-memory]'),
      ).length;
      if (appendedCount > 0) report.commentsAppended[id] = appendedCount;
    }
    const newLastCommentId = newComments.length > 0
      ? Math.max(lastCommentId, ...newComments.map((c) => c.id))
      : lastCommentId;
    currentNotesFiles[id] = notesWithComments;

    // Reverse-map ADO state -> local status.
    const mappedStatus = config.reverseStateMap[item.state] || null;
    if (!mappedStatus) {
      report.warnings.push(
        `unknown ADO state "${item.state}" for ${id} — ` +
          (findBlocks(currentBoardText).some((b) => b.id === id)
            ? 'existing card\'s Status left unchanged'
            : 'new card defaulted to todo'),
      );
    }

    const blocks = findBlocks(currentBoardText);
    const existingBlock = blocks.find((b) => b.id === id);

    if (!existingBlock) {
      const targetStatus = mappedStatus || 'todo';
      const blockText = newAdoBlockText({
        id,
        title: item.title,
        status: targetStatus,
        assignee: item.assignee,
        priority: item.priority,
        sprint: item.iterationPath,
        url: item.url,
        today,
      });
      const { boardText: inserted, warning } = insertBlock(currentBoardText, targetStatus, blockText, columns);
      currentBoardText = inserted;
      if (warning) report.warnings.push(warning);
      report.created.push(id);

      currentSyncState = setTaskEntry(currentSyncState, id, {
        rev: item.rev,
        adoState: item.state,
        localStatus: targetStatus,
        syncedAt: nowIso,
        lastCommentId: newLastCommentId,
      });
      continue;
    }

    // Existing card: decide whether Status may be overwritten.
    const currentLocalStatus = (readField(existingBlock.block, 'Status') || '').toLowerCase().trim();
    let decision = { action: 'noop' };
    if (mappedStatus) {
      decision = decidePull(entry, item.state, currentLocalStatus);
    }

    let finalLocalStatus = currentLocalStatus;
    if (decision.action === 'conflict') {
      report.conflicts.push({
        id,
        localStatus: currentLocalStatus,
        adoState: item.state,
        since: entry ? entry.syncedAt : null,
      });
    } else if (decision.action === 'apply-ado') {
      finalLocalStatus = mappedStatus;
    }

    const applyStatus = decision.action === 'apply-ado' ? mappedStatus : null;
    const newBlockText = applyAdoFieldsToBlock(existingBlock.block, id, item, applyStatus);
    const blockChanged = newBlockText !== existingBlock.block;

    if (blockChanged) {
      currentBoardText = replaceBlockAt(currentBoardText, existingBlock, newBlockText);
      report.updated.push(id);
    } else {
      report.unchanged.push(id);
    }

    if (decision.action === 'conflict') {
      // Never re-baseline adoState/localStatus on conflict — comments still
      // flow (already applied above), but state stays exactly as last known
      // so the conflict is reported again next run until explicitly resolved.
      currentSyncState = setTaskEntry(currentSyncState, id, {
        ...entry,
        lastCommentId: newLastCommentId,
        syncedAt: nowIso,
      });
    } else {
      currentSyncState = setTaskEntry(currentSyncState, id, {
        ...(entry || {}),
        rev: item.rev,
        adoState: item.state,
        localStatus: finalLocalStatus,
        syncedAt: nowIso,
        lastCommentId: newLastCommentId,
      });
    }
  }

  return {
    boardText: currentBoardText,
    notesFiles: currentNotesFiles,
    syncState: currentSyncState,
    changed: currentBoardText !== boardText,
    report,
  };
}
