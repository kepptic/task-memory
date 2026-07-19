// test-sync.mjs — plain node:test/assert suite for the ADO sync engine
// (TASK-019). 100% offline and deterministic: every test exercises real
// production code (src/sync/**) against createMockAdoClient fixtures or pure
// string fixtures — zero network, zero MCP. Run with:
//   node tests/test-sync.mjs
// or `npm run test:sync`.
//
// Case numbers below reference PLAN-ado.md §9.2. Sections are added
// phase-by-phase:
//   P3 -> config (15-19), htmlToText (49)
//   P4 -> board.js (20-23)
//   P5 -> engine.pull (24-31)
//   P6 -> engine.push + conflict (32-41)
//   P7 -> engine.promote (42-45)
//   P8 -> CLI e2e (46-48)

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadAdoConfig, invertStateMap, normalizeOrgName, DEFAULT_STATE_MAP } from '../src/sync/config.js';
import { createMockAdoClient, AdoUnavailableError } from '../src/sync/adoClient.js';
import { htmlToText } from '../src/sync/htmlToText.js';
import { findBlocks, readField, setField, setHeading, insertBlock, newAdoBlockText } from '../src/sync/board.js';
import {
  buildNotesSkeleton,
  ensureNotesSkeleton,
  getSection,
  appendComments,
  extractContext,
  extractSummary,
} from '../src/sync/notes.js';
import {
  emptySyncState,
  parseSyncState,
  serializeSyncState,
  getTaskEntry,
  setTaskEntry,
  removeTaskEntry,
} from '../src/sync/syncState.js';
import { pull, push, promote, decidePull, decidePush } from '../src/sync/engine.js';

// =============================================================================
// config.js — cases 15-19
// =============================================================================

test('loadAdoConfig: valid block ok', () => {
  const raw = {
    ado: {
      org: 'https://dev.azure.com/kepptic',
      project: 'task-memory',
      team: 'core',
      area_path: 'task-memory\\Sync',
      scope: 'current-sprint',
      work_item_type: 'Task',
      task_file: 'planning/tasks.md',
      repo_url: 'https://github.com/kepptic/task-memory',
      state_map: { todo: 'New', 'in-progress': 'Active', done: 'Closed' },
    },
  };
  const { ok, notConfigured, config, errors } = loadAdoConfig(raw);
  assert.equal(ok, true);
  assert.equal(notConfigured, false);
  assert.deepEqual(errors, []);
  assert.equal(config.org, 'kepptic');
  assert.equal(config.project, 'task-memory');
  assert.equal(config.team, 'core');
  assert.equal(config.scope, 'current-sprint');
  assert.equal(config.workItemType, 'Task');
  assert.equal(config.taskFile, 'planning/tasks.md');
  assert.deepEqual(config.stateMap, { todo: 'New', 'in-progress': 'Active', done: 'Closed' });
});

test('loadAdoConfig: missing org/project -> errors', () => {
  const { ok, notConfigured, config, errors } = loadAdoConfig({ ado: {} });
  assert.equal(ok, false);
  assert.equal(notConfigured, false);
  assert.equal(config, null);
  assert.ok(errors.some((e) => /org/.test(e)));
  assert.ok(errors.some((e) => /project/.test(e)));
});

test('loadAdoConfig: absent ado block -> notConfigured', () => {
  const result = loadAdoConfig({ planning_dir: 'planning' });
  assert.deepEqual(result, { ok: false, notConfigured: true, config: null, errors: [] });
});

test('loadAdoConfig: absent config object entirely -> notConfigured', () => {
  const result = loadAdoConfig({});
  assert.equal(result.ok, false);
  assert.equal(result.notConfigured, true);
});

test('state_map inversion: duplicate-target first-wins', () => {
  const reverse = invertStateMap({ todo: 'New', backlog: 'New', 'in-progress': 'Active' });
  assert.equal(reverse.New, 'todo'); // 'todo' declared before 'backlog' -> first wins
  assert.equal(reverse.Active, 'in-progress');
});

test('loadAdoConfig: default state_map applied when omitted', () => {
  const { config } = loadAdoConfig({ ado: { org: 'kepptic', project: 'task-memory' } });
  assert.deepEqual(config.stateMap, DEFAULT_STATE_MAP);
  assert.deepEqual(config.reverseStateMap, invertStateMap(DEFAULT_STATE_MAP));
});

test('normalizeOrgName: strips dev.azure.com prefix and trailing slash; bare name passes through', () => {
  assert.equal(normalizeOrgName('https://dev.azure.com/kepptic'), 'kepptic');
  assert.equal(normalizeOrgName('https://dev.azure.com/kepptic/'), 'kepptic');
  assert.equal(normalizeOrgName('HTTPS://DEV.AZURE.COM/kepptic'), 'kepptic');
  assert.equal(normalizeOrgName('kepptic'), 'kepptic');
});

test('loadAdoConfig: org url normalization is applied end-to-end', () => {
  const { config } = loadAdoConfig({ ado: { org: 'https://dev.azure.com/kepptic/', project: 'p' } });
  assert.equal(config.org, 'kepptic');
});

test('loadAdoConfig: invalid scope shape -> error', () => {
  const { ok, errors } = loadAdoConfig({ ado: { org: 'o', project: 'p', scope: 'not-a-real-scope' } });
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /scope/.test(e)));
});

test('loadAdoConfig: wiql scope object accepted', () => {
  const { ok, config } = loadAdoConfig({
    ado: { org: 'o', project: 'p', scope: { wiql: 'SELECT [System.Id] FROM WorkItems' } },
  });
  assert.equal(ok, true);
  assert.deepEqual(config.scope, { wiql: 'SELECT [System.Id] FROM WorkItems' });
});

// =============================================================================
// htmlToText.js — case 49
// =============================================================================

test('htmlToText: strips tags', () => {
  assert.equal(htmlToText('<b>bold</b> and <i>italic</i>'), 'bold and italic');
});

test('htmlToText: br and closing p/div become newlines', () => {
  assert.equal(htmlToText('line one<br>line two'), 'line one\nline two');
  assert.equal(htmlToText('<p>first</p><p>second</p>'), 'first\nsecond');
  assert.equal(htmlToText('<div>a</div><div>b</div>'), 'a\nb');
});

test('htmlToText: decodes entities', () => {
  assert.equal(
    htmlToText('Fish &amp; Chips &lt;tag&gt; &quot;quoted&quot; it&#39;s&nbsp;here'),
    'Fish & Chips <tag> "quoted" it\'s here',
  );
});

test('htmlToText: plain text passes through unchanged (aside from trim)', () => {
  assert.equal(htmlToText('  just plain text  '), 'just plain text');
});

test('htmlToText: empty/null/undefined -> empty string', () => {
  assert.equal(htmlToText(''), '');
  assert.equal(htmlToText(null), '');
  assert.equal(htmlToText(undefined), '');
});

// =============================================================================
// adoClient.js mock sanity (not separately numbered — exercised thoroughly
// in P4-P8 sections; a couple of smoke tests here since P3 introduces it).
// =============================================================================

test('createMockAdoClient: unavailable fixture throws AdoUnavailableError on ping, records the call', async () => {
  const client = createMockAdoClient({ unavailable: true });
  await assert.rejects(() => client.ping(), AdoUnavailableError);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].method, 'ping');
});

test('createMockAdoClient: createWorkItem mints sequential ids from fixture.nextId', async () => {
  const client = createMockAdoClient({ nextId: 90000 });
  const a = await client.createWorkItem('Task', { 'System.Title': 'A' });
  const b = await client.createWorkItem('Task', { 'System.Title': 'B' });
  assert.equal(a.id, 90000);
  assert.equal(b.id, 90001);
});

test('createMockAdoClient: fixture.fail injects a failure on the Nth call only', async () => {
  const client = createMockAdoClient({
    workItems: { 1: { id: 1, rev: 1, title: 'x', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
    fail: { getWorkItem: { after: 2, error: 'boom' } },
  });
  await client.getWorkItem(1); // 1st call: ok
  await assert.rejects(() => client.getWorkItem(1), /boom/); // 2nd call: fails
  const third = await client.getWorkItem(1); // 3rd call: ok again
  assert.equal(third.id, 1);
});

// =============================================================================
// board.js — cases 20-23
// =============================================================================

test('findBlocks: attributes sections, bounds mixed TASK/ADO adjacency (NEXT_SECTION tripwire mirror)', () => {
  const board = `# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 9 -->

## In Progress

### TASK-676 | Legacy block immediately followed by an ADO block
**Status**: in-progress

**Subtasks**:
- [ ] pending only
### ADO-12345 | ADO block sandwiched between two TASK blocks
**Status**: in-progress

**Subtasks**:
- [x] done one
- [ ] pending one
### TASK-GR-9 | Prefixed block immediately following an ADO block
**Status**: in-progress

**Subtasks**:
- [x] a

---

## Done

`;
  const blocks = findBlocks(board);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map((b) => b.id), ['TASK-676', 'ADO-12345', 'TASK-GR-9']);
  assert.deepEqual(blocks.map((b) => b.kind), ['task', 'ado', 'task']);
  assert.ok(blocks.every((b) => b.sectionId === 'in-progress'));

  // Boundary check: TASK-676's block must NOT swallow ADO-12345's heading.
  assert.ok(!blocks[0].block.includes('ADO-12345'));
  assert.ok(blocks[0].block.includes('pending only'));
  // ADO-12345's block must not swallow TASK-GR-9's heading, and must not be
  // swallowed by TASK-676's.
  assert.ok(!blocks[1].block.includes('TASK-GR-9'));
  assert.ok(blocks[1].block.includes('done one'));
  // TASK-GR-9's block runs to the next '## ' boundary.
  assert.ok(blocks[2].block.includes('- [x] a'));
  assert.ok(!blocks[2].block.includes('## Done'));
});

test('findBlocks: sectionId attribution across multiple sections', () => {
  const board = `## To Do

### ADO-1 | In todo
**Status**: todo

## Done

### ADO-2 | In done
**Status**: done
`;
  const blocks = findBlocks(board);
  assert.equal(blocks.find((b) => b.id === 'ADO-1').sectionId, 'to-do');
  assert.equal(blocks.find((b) => b.id === 'ADO-2').sectionId, 'done');
});

test('setField: edits only the target field value, rest of block byte-identical', () => {
  const block = `### ADO-12345 | Some title
**Priority**: High | **Status**: todo | **Assigned**: @user
**Created**: 2026-01-16

Description text unaffected.
`;
  const updated = setField(block, 'Status', 'in-progress');
  assert.match(updated, /\*\*Status\*\*: in-progress/);
  // Byte-diff the rest: strip just the Status value from both and compare.
  const stripStatus = (s) => s.replace(/\*\*Status\*\*:[ \t]*[^|\r\n]*/, '**Status**:');
  assert.equal(stripStatus(updated), stripStatus(block));
  assert.equal(readField(updated, 'Status'), 'in-progress');
  assert.equal(readField(updated, 'Priority'), 'High');
  assert.equal(readField(updated, 'Assigned'), '@user');
});

test('setField: appends onto a sibling line when the field is absent (Sprint/ADO cohabitation)', () => {
  const block = `### ADO-12345 | Some title
**Status**: in-progress
**Sprint**: Sprint 41
`;
  const updated = setField(block, 'ADO', 'https://dev.azure.com/o/p/_workitems/edit/12345');
  assert.match(updated, /\*\*Sprint\*\*: Sprint 41 \| \*\*ADO\*\*: https:\/\/dev\.azure\.com\/o\/p\/_workitems\/edit\/12345/);
  assert.equal(readField(updated, 'Sprint'), 'Sprint 41');
});

test('setField: inserts a brand-new line when neither the field nor a sibling exists', () => {
  const block = `### ADO-777 | Hand-written, ADO-side fields absent
**Status**: todo
`;
  const updated = setField(block, 'Sprint', 'Sprint 50');
  assert.equal(readField(updated, 'Sprint'), 'Sprint 50');
  assert.equal(readField(updated, 'Status'), 'todo');
});

test('setHeading: rewrites only the heading line, body byte-identical', () => {
  const board = `## In Progress

### ADO-1 | Old title
**Status**: in-progress

Body text.

## Done
`;
  const blocks = findBlocks(board);
  const updated = setHeading(board, blocks[0], 'ADO-1', 'New title');
  assert.match(updated, /^### ADO-1 \| New title$/m);
  assert.ok(updated.includes('Body text.'));
  assert.ok(updated.includes('## Done'));
  // Everything after the heading line is untouched.
  const bodyBefore = board.slice(board.indexOf('\n', blocks[0].start));
  const bodyAfter = updated.slice(updated.indexOf('\n', blocks[0].start));
  assert.equal(bodyAfter, bodyBefore);
});

test('insertBlock: appends into an existing section without touching others', () => {
  const board = `## To Do

## In Progress

### TASK-1 | Existing

## Done

`;
  const { boardText, created, warning } = insertBlock(board, 'in-progress', '### ADO-99 | New item\n**Status**: in-progress\n');
  assert.equal(created, false);
  assert.equal(warning, null);
  assert.ok(boardText.includes('### TASK-1 | Existing'));
  assert.ok(boardText.includes('### ADO-99 | New item'));
  // Inserted after the existing task, before '## Done'.
  const inProgressIdx = boardText.indexOf('## In Progress');
  const doneIdx = boardText.indexOf('## Done');
  const newIdx = boardText.indexOf('### ADO-99');
  assert.ok(newIdx > inProgressIdx && newIdx < doneIdx);
  // '## To Do' section untouched.
  assert.match(boardText, /## To Do\n\n## In Progress/);
});

test('insertBlock: creates a missing section at EOF and reports it', () => {
  const board = `## To Do

`;
  const { boardText, created, warning } = insertBlock(board, 'in-progress', '### ADO-99 | New item\n**Status**: in-progress\n', [
    { id: 'in-progress', name: 'In Progress' },
  ]);
  assert.equal(created, true);
  assert.ok(warning && /in-progress/.test(warning));
  assert.match(boardText, /## In Progress/);
  assert.ok(boardText.includes('### ADO-99 | New item'));
});

test('newAdoBlockText: matches the template shape', () => {
  const text = newAdoBlockText({
    id: 'ADO-12345',
    title: 'Synced item',
    status: 'in-progress',
    assignee: '@user',
    priority: 2,
    sprint: 'Sprint 42',
    url: 'https://dev.azure.com/o/p/_workitems/edit/12345',
    today: '2026-07-19',
  });
  assert.equal(
    text,
    `### ADO-12345 | Synced item
**Priority**: 2 | **Status**: in-progress | **Assigned**: @user
**Created**: 2026-07-19
**Sprint**: Sprint 42 | **ADO**: https://dev.azure.com/o/p/_workitems/edit/12345
`,
  );
});

test('newAdoBlockText: minimal (no assignee/priority/sprint/url) still parses via findBlocks', () => {
  const text = newAdoBlockText({ id: 'ADO-1', title: 'Bare', status: 'todo' });
  const board = `## To Do\n\n${text}\n## Done\n`;
  const blocks = findBlocks(board);
  assert.equal(blocks.length, 1);
  assert.equal(readField(blocks[0].block, 'Status'), 'todo');
});

// =============================================================================
// notes.js — smoke coverage (exercised more thoroughly by engine.pull/push
// in P5/P6; not separately numbered in PLAN-ado.md §9.2)
// =============================================================================

test('notes: buildNotesSkeleton/ensureNotesSkeleton round-trip has a Summary section', () => {
  const skeleton = buildNotesSkeleton('ADO-1', 'Some title', '2026-07-19');
  assert.match(skeleton, /^# ADO-1 Notes — Some title$/m);
  assert.equal(getSection(skeleton, 'Summary'), '_One-paragraph answer to: what is this task doing and why?_');

  const { text, created } = ensureNotesSkeleton('', 'ADO-1', 'Some title', '2026-07-19');
  assert.equal(created, true);
  assert.equal(text, skeleton);

  const { text: unchanged, created: notCreated } = ensureNotesSkeleton('# existing\n\ncontent', 'ADO-1', 'x', 'y');
  assert.equal(notCreated, false);
  assert.equal(unchanged, '# existing\n\ncontent');
});

test('notes: appendComments skips [task-memory]-marked comments and advances max id', () => {
  const notes = buildNotesSkeleton('ADO-1', 'Title', '2026-07-19');
  const comments = [
    { id: 1, author: 'Alice', createdDate: '2026-07-18T00:00:00Z', text: 'Looks good' },
    { id: 2, author: 'Bot', createdDate: '2026-07-19T00:00:00Z', text: '[task-memory] context update abcd1234\n\nsome pushed context' },
  ];
  const { text, appendedMaxId } = appendComments(notes, comments);
  assert.ok(text.includes('**Alice** — 2026-07-18T00:00:00Z (comment 1)'));
  assert.ok(!text.includes('[task-memory] context update'));
  assert.equal(appendedMaxId, 1); // only comment 1 counted — comment 2 was our own marker
});

test('notes: extractContext strips ADO Comments and Summary; extractSummary rejects placeholder', () => {
  const notes = buildNotesSkeleton('ADO-1', 'Title', '2026-07-19');
  assert.equal(extractSummary(notes), null); // still placeholder-only

  const withComments = appendComments(notes, [{ id: 1, author: 'A', createdDate: 'd', text: 'hi' }]).text;
  const context = extractContext(withComments);
  assert.ok(!context.includes('ADO Comments'));
  assert.ok(!context.includes('## Summary'));
  assert.ok(context.includes('Patterns Discovered'));

  const filledIn = withComments.replace(
    '_One-paragraph answer to: what is this task doing and why?_',
    'This task wires up the sync engine.',
  );
  assert.equal(extractSummary(filledIn), 'This task wires up the sync engine.');
});

// =============================================================================
// syncState.js — smoke coverage (exercised more thoroughly by engine.* in
// P5/P6; not separately numbered in PLAN-ado.md §9.2)
// =============================================================================

test('syncState: parse/serialize round-trip, migrate on missing/garbage input', () => {
  assert.deepEqual(parseSyncState(''), emptySyncState());
  assert.deepEqual(parseSyncState('not json'), emptySyncState());
  assert.deepEqual(parseSyncState('{"version":2,"tasks":{}}'), emptySyncState());

  const state = setTaskEntry(emptySyncState(), 'ADO-12345', {
    rev: 7,
    adoState: 'Active',
    localStatus: 'in-progress',
    syncedAt: '2026-07-19T10:00:00Z',
    lastCommentId: 987,
  });
  const serialized = serializeSyncState(state);
  const reparsed = parseSyncState(serialized);
  assert.deepEqual(reparsed, state);
  assert.equal(getTaskEntry(reparsed, 'ADO-12345').rev, 7);
  assert.equal(getTaskEntry(reparsed, 'ADO-99999'), null);

  const removed = removeTaskEntry(state, 'ADO-12345');
  assert.equal(getTaskEntry(removed, 'ADO-12345'), null);
});

// =============================================================================
// engine.js — decidePull / decidePush conflict rule (§6.3), direct unit tests
// (not separately numbered in PLAN-ado.md §9.2; full flows covered by
// pull/push/conflict integration cases below)
// =============================================================================

test('decidePull: entry absent -> apply-ado (first sync, nothing to conflict with)', () => {
  assert.deepEqual(decidePull(null, 'Active', 'todo'), { action: 'apply-ado' });
});

test('decidePull: ado changed, local unchanged -> apply-ado; neither changed -> noop; both changed -> conflict', () => {
  const entry = { adoState: 'New', localStatus: 'todo' };
  assert.equal(decidePull(entry, 'Active', 'todo').action, 'apply-ado');
  assert.equal(decidePull(entry, 'New', 'todo').action, 'noop');
  assert.equal(decidePull(entry, 'Active', 'in-progress').action, 'conflict');
});

test('decidePush: entry absent -> untracked; local-only change -> push; ado-only change -> noop; both -> conflict', () => {
  assert.equal(decidePush(null, 'New', 'todo').action, 'untracked');
  const entry = { adoState: 'New', localStatus: 'todo' };
  assert.equal(decidePush(entry, 'New', 'in-progress').action, 'push'); // local changed, ado didn't
  assert.equal(decidePush(entry, 'Active', 'todo').action, 'noop'); // ado changed, local didn't -> nothing to push (that's pull's job)
  assert.equal(decidePush(entry, 'New', 'todo').action, 'noop'); // neither changed
  assert.equal(decidePush(entry, 'Active', 'in-progress').action, 'conflict'); // both changed
});

// =============================================================================
// engine.pull — cases 24-31
// =============================================================================

const BASE_BOARD = `# Kanban Board

<!-- Config: Last Task ID: 0 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

---

## To Do

## In Progress

## Done

`;

function baseConfig(overrides = {}) {
  return loadAdoConfig({ ado: { org: 'kepptic', project: 'task-memory', ...overrides } }).config;
}

test('pull (24): empty board + 2 current-sprint items -> 2 blocks in correct sections, notes skeletons + comments, syncState written', async () => {
  const client = createMockAdoClient({
    iterations: [{ id: 'iter1', name: 'Sprint 1', path: 'proj\\Sprint 1', timeFrame: 'current' }],
    iterationItems: { iter1: [101, 102] },
    workItems: {
      101: { id: 101, rev: 1, title: 'First synced item', state: 'New', type: 'Task', assignee: '', iterationPath: 'proj\\Sprint 1', priority: null, url: 'https://dev.azure.com/o/p/_workitems/edit/101' },
      102: { id: 102, rev: 1, title: 'Second synced item', state: 'Active', type: 'Task', assignee: 'Alice', iterationPath: 'proj\\Sprint 1', priority: 2, url: 'https://dev.azure.com/o/p/_workitems/edit/102' },
    },
    comments: { 101: [{ id: 1, author: 'Alice', createdDate: '2026-07-01T00:00:00Z', text: 'Initial note' }], 102: [] },
  });
  const config = baseConfig({ scope: 'current-sprint' });

  const result = await pull({ boardText: BASE_BOARD, notesFiles: {}, syncState: emptySyncState(), config, client, today: '2026-07-19' });

  const blocks = findBlocks(result.boardText);
  const b101 = blocks.find((b) => b.id === 'ADO-101');
  const b102 = blocks.find((b) => b.id === 'ADO-102');
  assert.ok(b101 && b102, 'both items materialized as blocks');
  assert.equal(b101.sectionId, 'to-do'); // New -> todo
  assert.equal(b102.sectionId, 'in-progress'); // Active -> in-progress

  assert.deepEqual(result.report.created.sort(), ['ADO-101', 'ADO-102']);
  assert.deepEqual(result.report.notesCreated.sort(), ['ADO-101', 'ADO-102']);
  assert.equal(result.report.commentsAppended['ADO-101'], 1);
  assert.ok(result.notesFiles['ADO-101'].includes('Alice'));
  assert.ok(result.notesFiles['ADO-101'].includes('Initial note'));

  const entry101 = getTaskEntry(result.syncState, 'ADO-101');
  assert.equal(entry101.adoState, 'New');
  assert.equal(entry101.localStatus, 'todo');
  assert.equal(entry101.lastCommentId, 1);
  const entry102 = getTaskEntry(result.syncState, 'ADO-102');
  assert.equal(entry102.localStatus, 'in-progress');
});

test('pull (25): re-pull with no ADO changes -> changed:false, board byte-identical', async () => {
  const fixture = {
    iterations: [{ id: 'iter1', name: 'Sprint 1', path: 'p\\S1', timeFrame: 'current' }],
    iterationItems: { iter1: [201] },
    workItems: { 201: { id: 201, rev: 1, title: 'Stable item', state: 'New', type: 'Task', assignee: '', iterationPath: 'p\\S1', priority: null, url: 'https://x/201' } },
    comments: { 201: [] },
  };
  const config = baseConfig({ scope: 'current-sprint' });

  const first = await pull({ boardText: BASE_BOARD, notesFiles: {}, syncState: emptySyncState(), config, client: createMockAdoClient(fixture), today: '2026-07-19' });
  assert.equal(first.changed, true);

  const second = await pull({
    boardText: first.boardText,
    notesFiles: first.notesFiles,
    syncState: first.syncState,
    config,
    client: createMockAdoClient(fixture),
    today: '2026-07-19',
  });

  assert.equal(second.changed, false);
  assert.equal(second.boardText, first.boardText);
  assert.deepEqual(second.report.created, []);
  assert.deepEqual(second.report.unchanged, ['ADO-201']);
});

test('pull (26): ADO state change updates Status in place; block body byte-identical elsewhere', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-102 | Existing synced item
**Priority**: 2 | **Status**: in-progress | **Assigned**: Alice
**Created**: 2026-07-01
**Sprint**: Sprint 1 | **ADO**: https://dev.azure.com/org/proj/_workitems/edit/102

Some description text.

**Subtasks**:
- [x] one
- [ ] two

`)}`;

  const client = createMockAdoClient({
    workItems: {
      102: { id: 102, rev: 5, title: 'Existing synced item', state: 'Closed', type: 'Task', assignee: 'Alice', iterationPath: 'Sprint 1', priority: 2, url: 'https://dev.azure.com/org/proj/_workitems/edit/102' },
    },
    comments: { 102: [] },
  });
  const config = baseConfig({ scope: { wiql: 'irrelevant' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-102', {
    rev: 4, adoState: 'Active', localStatus: 'in-progress', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0,
  });

  const result = await pull({ boardText, notesFiles: {}, syncState, config, client, today: '2026-07-19' });

  const block = findBlocks(result.boardText).find((b) => b.id === 'ADO-102');
  assert.equal(readField(block.block, 'Status'), 'done');
  assert.ok(block.block.includes('Some description text.'));
  assert.ok(block.block.includes('- [x] one'));
  assert.ok(block.block.includes('- [ ] two'));

  const stripStatus = (s) => s.replace(/\*\*Status\*\*:[ \t]*[^|\r\n]*/, '**Status**:');
  const originalBlock = findBlocks(boardText).find((b) => b.id === 'ADO-102').block;
  assert.equal(stripStatus(block.block), stripStatus(originalBlock));
  assert.deepEqual(result.report.updated, ['ADO-102']);
});

test('pull (27): new comment appended once, [task-memory]-marked comment skipped, lastCommentId advances', async () => {
  const client = createMockAdoClient({
    workItems: { 300: { id: 300, rev: 1, title: 'Commented item', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
    comments: {
      300: [
        { id: 1, author: 'Alice', createdDate: '2026-07-01T00:00:00Z', text: 'first (already seen)' },
        { id: 2, author: 'ado-sync-bot', createdDate: '2026-07-19T00:00:00Z', text: '[task-memory] context update abcd1234\n\npushed context' },
        { id: 3, author: 'Alice', createdDate: '2026-07-19T01:00:00Z', text: 'Please review' },
      ],
    },
  });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-300', {
    rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 1,
  });
  const notesFiles = { 'ADO-300': '# ADO-300 Notes — Commented item\n\n## Summary\n\ncontent\n' };

  const result = await pull({ boardText: BASE_BOARD, notesFiles, syncState, config, client, today: '2026-07-19' });

  const notes = result.notesFiles['ADO-300'];
  assert.ok(notes.includes('Please review'));
  assert.ok(!notes.includes('[task-memory] context update'));
  assert.equal(result.report.commentsAppended['ADO-300'], 1);
  assert.equal(getTaskEntry(result.syncState, 'ADO-300').lastCommentId, 3); // advances past the skipped marker comment too
});

test('pull (28): board with legacy TASK + prefixed TASK + ADO card -> only the ADO card is touched', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### TASK-042 | Legacy local task
**Status**: in-progress

**Subtasks**:
- [ ] untouched

### TASK-GR-9 | Prefixed local task
**Status**: in-progress

### ADO-500 | Synced item
**Status**: todo

`)}`;

  const client = createMockAdoClient({
    workItems: { 500: { id: 500, rev: 2, title: 'Synced item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
    comments: { 500: [] },
  });
  const config = baseConfig({ scope: { wiql: 'x' } });

  const result = await pull({ boardText, notesFiles: {}, syncState: emptySyncState(), config, client, today: '2026-07-19' });

  const before = findBlocks(boardText);
  const after = findBlocks(result.boardText);
  assert.equal(after.find((b) => b.id === 'TASK-042').block, before.find((b) => b.id === 'TASK-042').block);
  assert.equal(after.find((b) => b.id === 'TASK-GR-9').block, before.find((b) => b.id === 'TASK-GR-9').block);
  assert.equal(readField(after.find((b) => b.id === 'ADO-500').block, 'Status'), 'in-progress');
  assert.deepEqual(result.report.updated, ['ADO-500']);
});

test('pull (29): hand-written ADO-777 not in ADO -> reported unknown, block untouched', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-777 | Hand-typed, ADO doesn't know about it
**Status**: in-progress

`)}`;
  const client = createMockAdoClient({ workItems: {}, comments: {} });
  const config = baseConfig({ scope: { wiql: 'x' } });

  const result = await pull({ boardText, notesFiles: {}, syncState: emptySyncState(), config, client, today: '2026-07-19' });

  assert.deepEqual(result.report.unknown, ['ADO-777']);
  const before = findBlocks(boardText).find((b) => b.id === 'ADO-777').block;
  const after = findBlocks(result.boardText).find((b) => b.id === 'ADO-777').block;
  assert.equal(after, before);
});

test('pull (30a): unknown ADO state on a NEW item -> lands todo + warning reported', async () => {
  const client = createMockAdoClient({
    workItems: { 900: { id: 900, rev: 1, title: 'Weird state item', state: 'SomeCustomState', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
    comments: { 900: [] },
  });
  const config = baseConfig({ scope: { wiql: 'x' } });

  const result = await pull({ boardText: BASE_BOARD, notesFiles: {}, syncState: emptySyncState(), config, client, today: '2026-07-19' });

  const block = findBlocks(result.boardText).find((b) => b.id === 'ADO-900');
  assert.equal(block.sectionId, 'to-do');
  assert.equal(readField(block.block, 'Status'), 'todo');
  assert.ok(result.report.warnings.some((w) => /unknown ADO state/.test(w) && /ADO-900/.test(w)));
});

test('pull (30b): unknown ADO state on an EXISTING item -> Status left unchanged + warning reported', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-901 | Existing item
**Status**: in-progress

`)}`;
  const client = createMockAdoClient({
    workItems: { 901: { id: 901, rev: 2, title: 'Existing item', state: 'SomeCustomState', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
    comments: { 901: [] },
  });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-901', { rev: 1, adoState: 'Active', localStatus: 'in-progress', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await pull({ boardText, notesFiles: {}, syncState, config, client, today: '2026-07-19' });

  const block = findBlocks(result.boardText).find((b) => b.id === 'ADO-901');
  assert.equal(readField(block.block, 'Status'), 'in-progress');
  assert.ok(result.report.warnings.some((w) => /unknown ADO state/.test(w) && /ADO-901/.test(w)));
});

test('pull (31): unavailable client -> AdoUnavailableError, zero writes, zero calls after ping', async () => {
  const client = createMockAdoClient({ unavailable: true });
  const config = baseConfig({ scope: { wiql: 'x' } });

  await assert.rejects(
    () => pull({ boardText: BASE_BOARD, notesFiles: {}, syncState: emptySyncState(), config, client, today: '2026-07-19' }),
    AdoUnavailableError,
  );
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].method, 'ping');
});

// =============================================================================
// engine.push — cases 32-38
// =============================================================================

test('push (32): local todo->in-progress pushes mapped state, syncState re-baselined', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-400 | Item
**Status**: in-progress

`)}`;
  const client = createMockAdoClient({
    workItems: { 400: { id: 400, rev: 1, title: 'Item', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
  });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-400', { rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await push({ boardText, notesFiles: {}, syncState, config, client, now: '2026-07-19T00:00:00Z' });

  const stateCalls = client.calls.filter((c) => c.method === 'updateWorkItemFields');
  assert.equal(stateCalls.length, 1);
  assert.deepEqual(stateCalls[0].args, [400, { 'System.State': 'Active' }]);
  assert.deepEqual(result.report.pushed, ['ADO-400']);
  const entry = getTaskEntry(result.syncState, 'ADO-400');
  assert.equal(entry.adoState, 'Active');
  assert.equal(entry.localStatus, 'in-progress');
  assert.equal(entry.rev, 2); // mock bumps rev on update
});

test('push (33): no local change -> zero write calls, reported no-local-change', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-401 | Item
**Status**: in-progress

`)}`;
  const client = createMockAdoClient({ workItems: { 401: { id: 401, rev: 1, title: 'Item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-401', { rev: 1, adoState: 'Active', localStatus: 'in-progress', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await push({ boardText, notesFiles: {}, syncState, config, client });

  assert.equal(client.calls.filter((c) => c.method === 'updateWorkItemFields' || c.method === 'addComment').length, 0);
  assert.deepEqual(result.report.skipped, [{ id: 'ADO-401', reason: 'no-local-change' }]);
});

test('push (34): context comment posts once with marker+hash; idempotent when forced again unchanged', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-402 | Item
**Status**: in-progress

`)}`;
  let notes = buildNotesSkeleton('ADO-402', 'Item', '2026-07-01');
  notes = notes.replace(
    '_One-paragraph answer to: what is this task doing and why?_',
    '_One-paragraph answer to: what is this task doing and why?_',
  ) + '\nSome extra local context worth pushing.\n';
  const client = createMockAdoClient({ workItems: { 402: { id: 402, rev: 1, title: 'Item', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-402', { rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const first = await push({ boardText, notesFiles: { 'ADO-402': notes }, syncState, config, client });
  const commentCalls1 = client.calls.filter((c) => c.method === 'addComment');
  assert.equal(commentCalls1.length, 1);
  assert.match(commentCalls1[0].args[1], /^\[task-memory\] context update [0-9a-f]{8}\n\n/);

  // Force a second push pass (bypassing decidePush's noop shortcut) with
  // identical notes content — the context-hash guard must still prevent a
  // second comment.
  const second = await push({
    boardText: first.boardText,
    notesFiles: first.notesFiles,
    syncState: first.syncState,
    config,
    client,
    options: { takeLocal: ['ADO-402'] },
  });
  const commentCalls2 = client.calls.filter((c) => c.method === 'addComment');
  assert.equal(commentCalls2.length, 1); // no NEW comment posted
  assert.equal(second.report.pushed.includes('ADO-402'), true);
});

test('push (35a): done flow posts the verbatim Summary section, then pushes state to done', async () => {
  const boardText = `${BASE_BOARD.replace('## Done\n', `## Done

### ADO-403 | Item
**Status**: done

`)}`;
  const notes = buildNotesSkeleton('ADO-403', 'Item', '2026-07-01').replace(
    '_One-paragraph answer to: what is this task doing and why?_',
    'Wired up the sync engine push path.',
  );
  const client = createMockAdoClient({ workItems: { 403: { id: 403, rev: 1, title: 'Item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' }, repo_url: 'https://github.com/kepptic/task-memory' });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-403', { rev: 1, adoState: 'Active', localStatus: 'in-progress', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await push({ boardText, notesFiles: { 'ADO-403': notes }, syncState, config, client });

  const commentCall = client.calls.find((c) => c.method === 'addComment' && /done summary/.test(c.args[1]));
  const stateCalls = client.calls.filter((c) => c.method === 'updateWorkItemFields');
  assert.ok(commentCall, 'done-summary comment posted');
  assert.match(commentCall.args[1], /Wired up the sync engine push path\./);
  assert.match(commentCall.args[1], /https:\/\/github\.com\/kepptic\/task-memory \(notes\/ADO-403\.md\)/);
  assert.equal(stateCalls.length, 1);
  assert.deepEqual(stateCalls[0].args, [403, { 'System.State': 'Closed' }]);

  const commentIdx = client.calls.indexOf(commentCall);
  const stateIdx = client.calls.indexOf(stateCalls[0]);
  assert.ok(commentIdx < stateIdx, 'summary comment posts BEFORE the closing state transition');

  assert.equal(getTaskEntry(result.syncState, 'ADO-403').adoState, 'Closed');
  assert.deepEqual(result.report.pushed, ['ADO-403']);
});

test('push (35b): missing Summary -> state still pushed, needs-summary reported, no summary comment', async () => {
  const boardText = `${BASE_BOARD.replace('## Done\n', `## Done

### ADO-404 | Item
**Status**: done

`)}`;
  const notes = buildNotesSkeleton('ADO-404', 'Item', '2026-07-01'); // placeholder-only Summary
  const client = createMockAdoClient({ workItems: { 404: { id: 404, rev: 1, title: 'Item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-404', { rev: 1, adoState: 'Active', localStatus: 'in-progress', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await push({ boardText, notesFiles: { 'ADO-404': notes }, syncState, config, client });

  const summaryComment = client.calls.find((c) => c.method === 'addComment' && /done summary/.test(c.args[1]));
  assert.equal(summaryComment, undefined);
  const stateCalls = client.calls.filter((c) => c.method === 'updateWorkItemFields');
  assert.equal(stateCalls.length, 1);
  assert.deepEqual(stateCalls[0].args, [404, { 'System.State': 'Closed' }]);
  assert.deepEqual(result.report.needsSummary, ['ADO-404']);
  assert.deepEqual(result.report.pushed, ['ADO-404']);
});

test('push (36): unmapped local status is skipped + reported, no calls made', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-405 | Item
**Status**: awaiting

`)}`;
  const client = createMockAdoClient({ workItems: { 405: { id: 405, rev: 1, title: 'Item', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' }, state_map: { todo: 'New', 'in-progress': 'Active', done: 'Closed' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-405', { rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await push({ boardText, notesFiles: {}, syncState, config, client });

  assert.equal(client.calls.filter((c) => c.method === 'updateWorkItemFields' || c.method === 'addComment').length, 0);
  assert.deepEqual(result.report.skipped, [{ id: 'ADO-405', reason: 'unmapped-status' }]);
});

test('push (37): partial failure — task1 lands, task2 fails+reports, task3 still attempted; rerun pushes only task2', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-501 | Task one
**Status**: in-progress

### ADO-502 | Task two
**Status**: in-progress

### ADO-503 | Task three
**Status**: in-progress

`)}`;
  const workItems = {
    501: { id: 501, rev: 1, title: 'Task one', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' },
    502: { id: 502, rev: 1, title: 'Task two', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' },
    503: { id: 503, rev: 1, title: 'Task three', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' },
  };
  const client = createMockAdoClient({
    workItems,
    fail: { updateWorkItemFields: { after: 2, error: 'injected ADO failure' } },
  });
  const config = baseConfig({ scope: { wiql: 'x' } });
  let syncState = emptySyncState();
  for (const id of ['ADO-501', 'ADO-502', 'ADO-503']) {
    syncState = setTaskEntry(syncState, id, { rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });
  }

  const result = await push({ boardText, notesFiles: {}, syncState, config, client });

  assert.deepEqual(result.report.pushed.sort(), ['ADO-501', 'ADO-503']);
  assert.equal(result.report.failed.length, 1);
  assert.equal(result.report.failed[0].id, 'ADO-502');
  assert.equal(result.report.failed[0].stage, 'state');

  assert.equal(getTaskEntry(result.syncState, 'ADO-501').adoState, 'Active');
  assert.equal(getTaskEntry(result.syncState, 'ADO-502').adoState, 'New'); // unchanged — failed call never landed
  assert.equal(getTaskEntry(result.syncState, 'ADO-503').adoState, 'Active');

  // Rerun against a healthy client: only task 2 still has a local change to push.
  const rerunClient = createMockAdoClient({ workItems });
  const rerun = await push({ boardText: result.boardText, notesFiles: result.notesFiles, syncState: result.syncState, config, client: rerunClient });
  assert.deepEqual(rerun.report.pushed, ['ADO-502']);
});

test('push (38): untracked ADO card (no prior syncState entry) -> reported untracked, no writes', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-600 | Never synced before
**Status**: in-progress

`)}`;
  const client = createMockAdoClient({ workItems: { 600: { id: 600, rev: 1, title: 'Never synced before', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' } });

  const result = await push({ boardText, notesFiles: {}, syncState: emptySyncState(), config, client });

  assert.equal(client.calls.filter((c) => c.method === 'updateWorkItemFields' || c.method === 'addComment').length, 0);
  assert.deepEqual(result.report.skipped, [{ id: 'ADO-600', reason: 'untracked' }]);
});

// =============================================================================
// conflict — cases 39-41
// =============================================================================

test('conflict (39): both sides changed -> pull leaves Status, push makes zero mutating calls; comments still flow', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-700 | Conflicted item
**Status**: done

`)}`;
  const pullClient = createMockAdoClient({
    workItems: { 700: { id: 700, rev: 3, title: 'Conflicted item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
    comments: { 700: [{ id: 1, author: 'Alice', createdDate: '2026-07-19T00:00:00Z', text: 'ADO-side note' }] },
  });
  const config = baseConfig({ scope: { wiql: 'x' } });
  // Last known baseline: ado 'New', local 'todo'. Since then ADO moved to
  // 'Active' (adoChanged) AND local moved to 'done' (localChanged) -> conflict.
  const syncState = setTaskEntry(emptySyncState(), 'ADO-700', { rev: 2, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const pullResult = await pull({ boardText, notesFiles: {}, syncState, config, client: pullClient, today: '2026-07-19' });
  assert.equal(pullResult.report.conflicts.length, 1);
  assert.equal(pullResult.report.conflicts[0].id, 'ADO-700');
  const blockAfterPull = findBlocks(pullResult.boardText).find((b) => b.id === 'ADO-700');
  assert.equal(readField(blockAfterPull.block, 'Status'), 'done'); // board leaves local Status as-is
  assert.ok(pullResult.notesFiles['ADO-700'].includes('ADO-side note')); // comments still flow in

  const pushClient = createMockAdoClient({
    workItems: { 700: { id: 700, rev: 3, title: 'Conflicted item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
  });
  const pushResult = await push({
    boardText: pullResult.boardText,
    notesFiles: pullResult.notesFiles,
    syncState: pullResult.syncState,
    config,
    client: pushClient,
  });
  assert.equal(pushResult.report.conflicts.length, 1);
  assert.equal(
    pushClient.calls.filter((c) => c.method === 'updateWorkItemFields' || c.method === 'addComment').length,
    0,
  );
});

test('conflict (40): --take-local forces the push through a conflict and re-baselines', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-701 | Item
**Status**: done

`)}`;
  const client = createMockAdoClient({ workItems: { 701: { id: 701, rev: 3, title: 'Item', state: 'Removed', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-701', { rev: 2, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const plain = await push({ boardText, notesFiles: {}, syncState, config, client });
  assert.equal(plain.report.conflicts.length, 1);

  const forced = await push({ boardText, notesFiles: {}, syncState, config, client, options: { takeLocal: ['ADO-701'] } });
  assert.deepEqual(forced.report.pushed, ['ADO-701']);
  assert.equal(forced.report.conflicts.length, 0);
  const entry = getTaskEntry(forced.syncState, 'ADO-701');
  assert.equal(entry.adoState, 'Closed'); // state_map.done
  assert.equal(entry.localStatus, 'done');
});

test('conflict (41): --take-ado force-applies ADO state locally and re-baselines, without writing TO ado', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-702 | Item
**Status**: done

`)}`;
  const client = createMockAdoClient({ workItems: { 702: { id: 702, rev: 3, title: 'Item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-702', { rev: 2, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await push({ boardText, notesFiles: {}, syncState, config, client, options: { takeAdo: ['ADO-702'] } });

  assert.equal(
    client.calls.filter((c) => c.method === 'updateWorkItemFields' || c.method === 'addComment').length,
    0,
  );
  const block = findBlocks(result.boardText).find((b) => b.id === 'ADO-702');
  assert.equal(readField(block.block, 'Status'), 'in-progress'); // Active -> in-progress, mapped locally
  const entry = getTaskEntry(result.syncState, 'ADO-702');
  assert.equal(entry.adoState, 'Active');
  assert.equal(entry.localStatus, 'in-progress');
});

// =============================================================================
// engine.promote — cases 42-45
// =============================================================================

const PROMOTE_BOARD = `${BASE_BOARD.replace('## To Do\n', `## To Do

### TASK-042 | Promote me
**Status**: todo

Some description text.

**Subtasks**:
- [ ] one
- [ ] two

`)}`;

test('promote (42): default create -> createWorkItem args, heading rewritten, notes renamed w/ trace header, syncState promotedFrom', async () => {
  const client = createMockAdoClient({
    nextId: 90000,
    iterations: [{ id: 'iter1', name: 'Sprint 1', path: 'proj\\Sprint 1', timeFrame: 'current' }],
  });
  const config = baseConfig({ scope: 'current-sprint' });

  const result = await promote({
    boardText: PROMOTE_BOARD, notesFiles: {}, syncState: emptySyncState(), config, client, taskId: 'TASK-042', today: '2026-07-19',
  });

  const createCall = client.calls.find((c) => c.method === 'createWorkItem');
  assert.ok(createCall);
  assert.equal(createCall.args[0], 'Task');
  assert.equal(createCall.args[1]['System.Title'], 'Promote me');
  assert.match(createCall.args[1]['System.Description'], /Some description text\./);
  assert.equal(createCall.args[1]['System.State'], 'New'); // todo -> New
  assert.equal(createCall.args[1]['System.IterationPath'], 'proj\\Sprint 1');

  const block = findBlocks(result.boardText).find((b) => b.id === 'ADO-90000');
  assert.ok(block, 'heading rewritten to ADO-90000');
  assert.equal(block.title, 'Promote me');
  assert.ok(block.block.includes('Some description text.'));
  assert.ok(block.block.includes('- [ ] one'));
  assert.equal(findBlocks(result.boardText).find((b) => b.id === 'TASK-042'), undefined);

  const notes = result.notesFiles['ADO-90000'];
  assert.ok(notes);
  assert.match(notes, /^# ADO-90000 Notes/);
  assert.match(notes, /> Promoted from TASK-042 on 2026-07-19/);
  assert.equal(result.notesFiles['TASK-042'], undefined);

  const entry = getTaskEntry(result.syncState, 'ADO-90000');
  assert.equal(entry.promotedFrom, 'TASK-042');
  assert.equal(entry.adoState, 'New');

  assert.equal(result.report.created, true);
  assert.equal(result.report.id, 'ADO-90000');
});

test('promote (43): --link uses an existing work item, no create call', async () => {
  const client = createMockAdoClient({
    workItems: {
      555: { id: 555, rev: 2, title: 'Existing item', state: 'Active', type: 'Task', assignee: '', iterationPath: 'proj\\Sprint 2', priority: null, url: 'https://dev.azure.com/o/p/_workitems/edit/555' },
    },
  });
  const config = baseConfig({ scope: { wiql: 'x' } });

  const result = await promote({
    boardText: PROMOTE_BOARD, notesFiles: {}, syncState: emptySyncState(), config, client, taskId: 'TASK-042', options: { link: 555 }, today: '2026-07-19',
  });

  assert.equal(client.calls.some((c) => c.method === 'createWorkItem'), false);
  assert.ok(client.calls.some((c) => c.method === 'getWorkItem' && c.args[0] === 555));

  const block = findBlocks(result.boardText).find((b) => b.id === 'ADO-555');
  assert.ok(block);
  assert.equal(readField(block.block, 'Sprint'), 'proj\\Sprint 2');
  assert.equal(readField(block.block, 'ADO'), 'https://dev.azure.com/o/p/_workitems/edit/555');
  assert.equal(result.report.linked, true);
  assert.equal(result.report.created, false);
});

test('promote (44): --link to a missing/inaccessible id errors, board untouched', async () => {
  const client = createMockAdoClient({ workItems: {} });
  const config = baseConfig({ scope: { wiql: 'x' } });

  await assert.rejects(
    () => promote({ boardText: PROMOTE_BOARD, notesFiles: {}, syncState: emptySyncState(), config, client, taskId: 'TASK-042', options: { link: 999 } }),
    /999/,
  );
  assert.equal(client.calls.some((c) => c.method === 'createWorkItem'), false);
});

test('promote (45): the config header (task id counter) is byte-identical after promotion', async () => {
  const client = createMockAdoClient({ nextId: 90000 });
  const config = baseConfig({ scope: { wiql: 'x' } });

  const result = await promote({
    boardText: PROMOTE_BOARD, notesFiles: {}, syncState: emptySyncState(), config, client, taskId: 'TASK-042', today: '2026-07-19',
  });

  const headerBefore = PROMOTE_BOARD.match(/<!-- Config:.*-->/)[0];
  const headerAfter = result.boardText.match(/<!-- Config:.*-->/)[0];
  assert.equal(headerAfter, headerBefore);
});
