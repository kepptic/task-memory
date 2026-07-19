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

import { createHash } from 'node:crypto';
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
import { ensureNotesSkeleton, appendComments, extractContext, extractSummary } from './notes.js';
import { getTaskEntry, setTaskEntry } from './syncState.js';

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

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

function newPushReport() {
  return {
    pushed: [],
    failed: [],
    skipped: [],
    conflicts: [],
    needsSummary: [],
    commentsPushed: {},
    warnings: [],
  };
}

function recordCommentPushed(report, id) {
  report.commentsPushed[id] = (report.commentsPushed[id] || 0) + 1;
}

/**
 * engine.push — push local Status changes + notes context + a distilled
 * done-summary to ADO. See PLAN-ado.md §6.2/§6.3.
 *
 * Per-task stage order (a failed stage stops only that task; whatever
 * landed before the failure stays recorded in syncState — re-running is
 * safe because both the state compare and the context-comment hash
 * short-circuit already-landed work):
 *   1. STATE   — push the mapped ADO state now, UNLESS this is a
 *                done-transition (deferred to stage 4 so the summary
 *                comment posts before ADO potentially locks a closed item).
 *   2. CONTEXT — post a hashed context comment iff the notes context
 *                changed since the last successful push (idempotent).
 *   3. SUMMARY — done-transitions only: post the distilled `## Summary` as
 *                a comment; if the section is empty/placeholder-only, skip
 *                the comment and report `needsSummary` (state still pushes).
 *   4. DONE-STATE — done-transitions only: push the mapped done state.
 *
 * @param {object} opts
 * @param {string} opts.boardText
 * @param {Object<string,string>} opts.notesFiles
 * @param {object} opts.syncState
 * @param {object} opts.config
 * @param {object} opts.client
 * @param {{dryRun?: boolean, takeLocal?: string[], takeAdo?: string[], onlyIds?: string[]}} [opts.options]
 * @param {string} [opts.now] - ISO timestamp override (tests)
 */
export async function push({ boardText, notesFiles, syncState, config, client, options = {}, now }) {
  const { dryRun = false, takeLocal = [], takeAdo = [], onlyIds = [] } = options;

  // Gate FIRST, before any other client call or local mutation.
  await client.ping();

  const allBlocks = findBlocks(boardText).filter((b) => b.kind === 'ado');
  const candidates = onlyIds.length > 0 ? allBlocks.filter((b) => onlyIds.includes(b.id)) : allBlocks;

  const numericIds = candidates.map((b) => adoNumFromBlockId(b.id)).filter((n) => n !== null);
  const items = numericIds.length > 0 ? await client.getWorkItemsBatch(numericIds) : [];
  const itemsById = new Map(items.map((i) => [i.id, i]));

  const report = newPushReport();
  const doneAdoState = config.stateMap.done;

  let currentBoardText = boardText;
  let currentNotesFiles = { ...notesFiles };
  let currentSyncState = syncState;
  const nowIso = now || new Date().toISOString();

  for (const candidateRef of candidates) {
    const id = candidateRef.id;
    const num = adoNumFromBlockId(id);
    const item = itemsById.get(num);
    if (!item) {
      report.skipped.push({ id, reason: 'unknown-in-ado' });
      continue;
    }

    const entry = getTaskEntry(currentSyncState, id);
    const block = findBlocks(currentBoardText).find((b) => b.id === id);
    const currentLocalStatus = (readField(block.block, 'Status') || '').toLowerCase().trim();

    if (item.title && block.title !== item.title) {
      report.warnings.push(
        `local-title-drift: ${id} board title "${block.title}" differs from ADO title ` +
          `"${item.title}" — will be overwritten on next pull (ADO owns title)`,
      );
    }

    let decision;
    if (takeLocal.includes(id)) {
      decision = { action: 'push' };
    } else if (takeAdo.includes(id)) {
      decision = { action: 'take-ado' };
    } else {
      decision = decidePush(entry, item.state, currentLocalStatus);
    }

    if (decision.action === 'untracked') {
      report.skipped.push({ id, reason: 'untracked' });
      continue;
    }
    if (decision.action === 'noop') {
      report.skipped.push({ id, reason: 'no-local-change' });
      continue;
    }
    if (decision.action === 'conflict') {
      report.conflicts.push({
        id,
        localStatus: currentLocalStatus,
        adoState: item.state,
        since: entry ? entry.syncedAt : null,
      });
      continue;
    }

    if (decision.action === 'take-ado') {
      const mappedStatus = config.reverseStateMap[item.state] || currentLocalStatus;
      if (!dryRun) {
        const newBlockText = setField(block.block, 'Status', mappedStatus);
        currentBoardText = replaceBlockAt(currentBoardText, block, newBlockText);
        currentSyncState = setTaskEntry(currentSyncState, id, {
          ...(entry || {}),
          rev: item.rev,
          adoState: item.state,
          localStatus: mappedStatus,
          syncedAt: nowIso,
        });
      }
      report.pushed.push(id);
      continue;
    }

    // decision.action === 'push'
    const targetAdoState = config.stateMap[currentLocalStatus];
    if (!targetAdoState) {
      report.skipped.push({ id, reason: 'unmapped-status' });
      continue;
    }

    if (dryRun) {
      report.pushed.push(id);
      continue;
    }

    const isDoneTransition = targetAdoState === doneAdoState && (!entry || entry.adoState !== doneAdoState);
    let taskFailed = false;

    // Stage 1: STATE (skipped for done-transitions — deferred to stage 4).
    if (!isDoneTransition) {
      try {
        const updated = await client.updateWorkItemFields(num, { 'System.State': targetAdoState });
        currentSyncState = setTaskEntry(currentSyncState, id, {
          ...(entry || {}),
          rev: updated.rev,
          adoState: updated.state,
          localStatus: currentLocalStatus,
          syncedAt: nowIso,
        });
      } catch (err) {
        report.failed.push({ id, stage: 'state', error: err.message });
        taskFailed = true;
      }
    }

    // Stage 2: CONTEXT comment (idempotent via content hash).
    if (!taskFailed) {
      const notesText = currentNotesFiles[id] || '';
      const context = extractContext(notesText);
      const entryNow = getTaskEntry(currentSyncState, id) || entry || {};
      if (context) {
        const hash = sha256Hex(context);
        if (hash !== (entryNow.pushedContextHash || '')) {
          try {
            const { id: commentId } = await client.addComment(
              num,
              `[task-memory] context update ${hash.slice(0, 8)}\n\n${context}`,
            );
            currentSyncState = setTaskEntry(currentSyncState, id, {
              ...entryNow,
              pushedContextHash: hash,
              pushedCommentIds: [...(entryNow.pushedCommentIds || []), commentId],
            });
            recordCommentPushed(report, id);
          } catch (err) {
            report.failed.push({ id, stage: 'context', error: err.message });
            taskFailed = true;
          }
        }
      }
    }

    // Stage 3: SUMMARY (done-transitions only). Missing/placeholder summary
    // is reported but does NOT fail the task — stage 4 still runs.
    if (!taskFailed && isDoneTransition) {
      const notesText = currentNotesFiles[id] || '';
      const summary = extractSummary(notesText);
      if (!summary) {
        report.needsSummary.push(id);
      } else {
        try {
          const summaryLines = [`[task-memory] done summary`, '', summary];
          if (config.repoUrl) summaryLines.push('', `${config.repoUrl} (notes/${id}.md)`);
          await client.addComment(num, summaryLines.join('\n'));
          recordCommentPushed(report, id);
        } catch (err) {
          report.failed.push({ id, stage: 'summary', error: err.message });
          taskFailed = true;
        }
      }
    }

    // Stage 4: DONE-STATE (deferred state push for done-transitions).
    if (!taskFailed && isDoneTransition) {
      try {
        const updated = await client.updateWorkItemFields(num, { 'System.State': doneAdoState });
        currentSyncState = setTaskEntry(currentSyncState, id, {
          ...(getTaskEntry(currentSyncState, id) || entry || {}),
          rev: updated.rev,
          adoState: updated.state,
          localStatus: currentLocalStatus,
          syncedAt: nowIso,
        });
      } catch (err) {
        report.failed.push({ id, stage: 'done-state', error: err.message });
        taskFailed = true;
      }
    }

    if (!taskFailed) {
      report.pushed.push(id);
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
