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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { markdownParser } from '../src/utils/markdown.js';
import { applyPromoteWrites, LINK_ID_RE } from '../scripts/ado-sync.mjs';

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

test('findBlocks (Codex review finding #14): a bare "### ADO-12-foo" line (no " | " separator) inside a block body is NOT mistaken for a section boundary', () => {
  // markdown.js's own heading regex requires a " | " separator, so this
  // specific bug can't manifest there — but board.js's NEXT_SECTION_SRC
  // (used to BOUND a block, independent of the primary heading match)
  // deliberately does NOT require the pipe, so it needs its own tail-
  // boundary discipline. Before the fix, ADO_ID_CORE's lookahead excluded
  // only alnum tails, so "ADO-12" (glued to "-foo" with no space/pipe)
  // still matched as a spurious NEXT_SECTION boundary, truncating the real
  // block early and swallowing its own heading + everything after it into
  // "orphaned" text outside any recognized block.
  const board = `## In Progress

### ADO-500 | Real block
**Status**: in-progress

Some notes mention ADO-12-foo inline, and even a stray markdown H3 line:
### ADO-12-foo
which must NOT be read as a new task boundary.

- [ ] subtask still inside this block

## Done
`;
  const blocks = findBlocks(board);
  assert.equal(blocks.length, 1, 'only the one real "### ADO-500 | ..." heading is a block');
  const block = blocks[0];
  assert.ok(block.block.includes('### ADO-12-foo'), 'the bogus line stays INSIDE the real block, not split off');
  assert.ok(block.block.includes('- [ ] subtask still inside this block'));
  assert.ok(!block.block.includes('## Done'), 'still correctly bounded by the real "## Done" section heading');
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

test('readField/setField (finding #9): a prose mention of "**ADO**:"/"**Sprint**:" mid-sentence is NOT mistaken for metadata', () => {
  const block = `### ADO-88 | Some title
**Status**: in-progress

This references **ADO**: 1234 in prose, not as a metadata field. Also
mentions **Sprint**: nonsense inline, which must not be read as the Sprint
field either.
`;
  // readField must not find these prose mentions — the real fields are
  // simply absent.
  assert.equal(readField(block, 'ADO'), null);
  assert.equal(readField(block, 'Sprint'), null);

  // setField must not overwrite the prose line in place; it must append a
  // brand-new metadata line instead (no sibling exists either, since Sprint
  // is also prose-only).
  const updated = setField(block, 'ADO', 'https://dev.azure.com/o/p/_workitems/edit/88');
  assert.equal(readField(updated, 'ADO'), 'https://dev.azure.com/o/p/_workitems/edit/88');
  assert.ok(
    updated.includes('This references **ADO**: 1234 in prose, not as a metadata field.'),
    'prose paragraph must be byte-identical, not clobbered',
  );
});

test('readField/setField (finding #9): a field at true line-start, or right after the canonical " | " separator, IS recognized', () => {
  const block = `### ADO-89 | Title
**Priority**: High | **Status**: todo | **Assigned**: @user
**Sprint**: Sprint 41 | **ADO**: https://dev.azure.com/o/p/_workitems/edit/89
`;
  assert.equal(readField(block, 'Priority'), 'High'); // line-start
  assert.equal(readField(block, 'Assigned'), '@user'); // after " | "
  assert.equal(readField(block, 'Sprint'), 'Sprint 41'); // line-start (own line)
  assert.equal(readField(block, 'ADO'), 'https://dev.azure.com/o/p/_workitems/edit/89'); // after " | "
});

test('setField (finding #9): sibling-line insertion is not fooled by a prose line that merely CONTAINS the sibling name', () => {
  const block = `### ADO-90 | Title
**Status**: todo

Notes mentioning **Sprint**: something, purely descriptive prose.
`;
  // No real Sprint field and no real ADO field exist — setField('ADO', ...)
  // must NOT treat the prose line as a Sprint sibling to append onto; it
  // must fall back to inserting a brand-new line after the heading.
  const updated = setField(block, 'ADO', 'https://dev.azure.com/o/p/_workitems/edit/90');
  assert.equal(readField(updated, 'ADO'), 'https://dev.azure.com/o/p/_workitems/edit/90');
  assert.ok(
    updated.includes('Notes mentioning **Sprint**: something, purely descriptive prose.'),
    'prose line must be byte-identical, not appended onto',
  );
});

test('setField (exact field-line byte round-trip): every other line, including whitespace, is byte-identical', () => {
  const block = `### ADO-91 | Title with   odd   spacing
**Priority**: 2 | **Status**: todo | **Assigned**: @user, @other
**Created**: 2026-07-01 | **Started**: 2026-07-02
**Sprint**: Sprint 41 | **ADO**: https://dev.azure.com/o/p/_workitems/edit/91
**Tags**: #foo #bar

Some description text with **bold** and *italic* markdown, and a line that
ends in trailing spaces.

**Subtasks**:
- [x] one
- [ ] two
`;
  const updated = setField(block, 'Status', 'in-progress');
  const linesBefore = block.split('\n');
  const linesAfter = updated.split('\n');
  assert.equal(linesAfter.length, linesBefore.length);
  for (let i = 0; i < linesBefore.length; i++) {
    if (linesBefore[i].includes('**Status**:')) {
      assert.match(linesAfter[i], /\*\*Status\*\*: in-progress/);
      // rest of that line (Priority/Assigned) is untouched
      assert.ok(linesAfter[i].startsWith('**Priority**: 2 | '));
      assert.ok(linesAfter[i].endsWith('**Assigned**: @user, @other'));
    } else {
      assert.equal(linesAfter[i], linesBefore[i], `line ${i} must be byte-identical`);
    }
  }
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

test('insertBlock (finding #2): explicit/default column id ("todo") differing from the derived header id ("to-do") resolves correctly — no duplicate section', () => {
  // Mirrors the STOCK default board's column config (markdown.js's
  // hardcoded default): the emoji display name "📝 To Do" derives to
  // "to-do" via deriveColumnId, but the configured id is "todo". Before the
  // fix, insertBlock/findBlocks blindly re-derived the section's id from
  // its header text and could never match sectionId "todo" against a
  // "## 📝 To Do" header — creating a duplicate section at EOF every time.
  const columns = [
    { name: '📝 To Do', id: 'todo', originalHeader: '📝 To Do' },
    { name: '🚀 In Progress', id: 'in-progress', originalHeader: '🚀 In Progress' },
    { name: '✅ Done', id: 'done', originalHeader: '✅ Done' },
  ];
  const board = `## 📝 To Do

## 🚀 In Progress

## ✅ Done

`;
  const { boardText, created, warning } = insertBlock(board, 'todo', '### ADO-99 | New item\n**Status**: todo\n', columns);
  assert.equal(created, false, 'must find the existing "## 📝 To Do" section, not create a new one');
  assert.equal(warning, null);
  assert.equal((boardText.match(/^## 📝 To Do$/gm) || []).length, 1, 'no duplicate "## 📝 To Do" section');
  assert.ok(boardText.includes('### ADO-99 | New item'));

  const blocks = findBlocks(boardText, columns);
  assert.equal(blocks.find((b) => b.id === 'ADO-99').sectionId, 'todo');
});

test('insertBlock (finding #2): hand-written explicit column id differing from its own name-derived id ("Waiting" -> "blocked") resolves by canonical name, not id', () => {
  const columns = [{ name: 'Waiting', id: 'blocked', originalHeader: 'Waiting' }];
  const board = `## Waiting

`;
  const { boardText, created } = insertBlock(board, 'blocked', '### ADO-1 | Item\n**Status**: blocked\n', columns);
  assert.equal(created, false);
  assert.equal((boardText.match(/^## Waiting$/gm) || []).length, 1);
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

  // Codex review finding #2: sectionId must be resolved against the
  // CONFIGURED column id ("todo"), not a freshly re-derived one ("to-do") —
  // pass `columns` through so this assertion actually exercises the same
  // resolution insertBlock used while placing the block, instead of masking
  // the bug behind a columns-less findBlocks() call. (`config` here is the
  // ado.* sync config — board column config comes from the BOARD's own
  // markdown parse, not the ADO config block.)
  const boardColumns = markdownParser.parseMarkdown(result.boardText, {}).config.columns;
  const blocks = findBlocks(result.boardText, boardColumns);
  const b101 = blocks.find((b) => b.id === 'ADO-101');
  const b102 = blocks.find((b) => b.id === 'ADO-102');
  assert.ok(b101 && b102, 'both items materialized as blocks');
  assert.equal(b101.sectionId, 'todo'); // New -> todo
  assert.equal(b102.sectionId, 'in-progress'); // Active -> in-progress
  // No duplicate "## To Do" section was created (the bug this guards
  // against: insertBlock re-deriving "to-do" from the header text, failing
  // to match the configured id "todo", and creating a second section at EOF).
  assert.equal((result.boardText.match(/^## To Do$/gm) || []).length, 1);

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

test('pull (finding #11): a conflict does NOT bump syncedAt — it keeps recording the last SUCCESSFUL reconciliation baseline', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-950 | Conflicted item
**Status**: done

`)}`;
  const ORIGINAL_SYNCED_AT = '2026-07-01T00:00:00Z';
  const syncState = setTaskEntry(emptySyncState(), 'ADO-950', {
    rev: 2, adoState: 'New', localStatus: 'todo', syncedAt: ORIGINAL_SYNCED_AT, lastCommentId: 0,
  });
  const config = baseConfig({ scope: { wiql: 'x' } });

  // First conflicted pull.
  const client1 = createMockAdoClient({
    workItems: { 950: { id: 950, rev: 3, title: 'Conflicted item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
    comments: { 950: [] },
  });
  const first = await pull({ boardText, notesFiles: {}, syncState, config, client: client1, today: '2026-07-19' });
  assert.equal(first.report.conflicts.length, 1);
  assert.equal(getTaskEntry(first.syncState, 'ADO-950').syncedAt, ORIGINAL_SYNCED_AT, 'unchanged after the FIRST failed reconciliation attempt');

  // Second conflicted pull, same still-unresolved conflict (re-run the next
  // day, say) — syncedAt must STILL be the original baseline, not the most
  // recent failed attempt, so the report's "since" always reflects when the
  // two sides actually diverged.
  const client2 = createMockAdoClient({
    workItems: { 950: { id: 950, rev: 4, title: 'Conflicted item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } },
    comments: { 950: [] },
  });
  const second = await pull({ boardText: first.boardText, notesFiles: first.notesFiles, syncState: first.syncState, config, client: client2, today: '2026-07-20' });
  assert.equal(second.report.conflicts.length, 1);
  assert.equal(second.report.conflicts[0].since, ORIGINAL_SYNCED_AT);
  assert.equal(getTaskEntry(second.syncState, 'ADO-950').syncedAt, ORIGINAL_SYNCED_AT, 'still unchanged after a SECOND failed reconciliation attempt');
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

test('push (context-only, finding #3/D2): no Status change but notes context changed -> zero STATE calls, one context comment', async () => {
  // Companion to (33) above — that test has an EMPTY notesFiles fixture, so
  // it can't distinguish "noop correctly skips comments too" from "noop
  // never even tries". This test gives ADO-406 real, non-placeholder notes
  // context while Status stays unchanged, so decidePush resolves 'noop' —
  // the fix (finding #3) means the context comment must still post.
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-406 | Item
**Status**: in-progress

`)}`;
  const notes = buildNotesSkeleton('ADO-406', 'Item', '2026-07-01') + '\nContext-only edit: no Status change here.\n';
  const client = createMockAdoClient({ workItems: { 406: { id: 406, rev: 1, title: 'Item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-406', { rev: 1, adoState: 'Active', localStatus: 'in-progress', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await push({ boardText, notesFiles: { 'ADO-406': notes }, syncState, config, client });

  assert.equal(client.calls.filter((c) => c.method === 'updateWorkItemFields').length, 0);
  const commentCalls = client.calls.filter((c) => c.method === 'addComment');
  assert.equal(commentCalls.length, 1);
  assert.match(commentCalls[0].args[1], /Context-only edit: no Status change here\./);
  assert.deepEqual(result.report.skipped, [{ id: 'ADO-406', reason: 'no-local-change' }]); // state is STILL a no-op
  assert.equal(result.report.commentsPushed['ADO-406'], 1);
  assert.equal(result.report.pushed.includes('ADO-406'), false); // 'pushed' means a state push happened; this one didn't
  assert.equal(getTaskEntry(result.syncState, 'ADO-406').pushedContextHash?.length, 64); // sha256 hex recorded
});

test('push (finding #3/D2, dry-run guard): noop with pushable context in --dry-run mode makes ZERO client calls', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-407 | Item
**Status**: in-progress

`)}`;
  const notes = buildNotesSkeleton('ADO-407', 'Item', '2026-07-01') + '\nWould-be-pushed context.\n';
  const client = createMockAdoClient({ workItems: { 407: { id: 407, rev: 1, title: 'Item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-407', { rev: 1, adoState: 'Active', localStatus: 'in-progress', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await push({ boardText, notesFiles: { 'ADO-407': notes }, syncState, config, client, options: { dryRun: true } });

  // ping() + the read-only getWorkItemsBatch() needed to compute the
  // decision — dry-run must never call addComment/updateWorkItemFields.
  assert.deepEqual(client.calls.map((c) => c.method), ['ping', 'getWorkItemsBatch']);
  assert.equal(result.report.commentsPushed['ADO-407'], undefined);
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

test('push (finding #5): done-state failure after a confirmed summary post -> retry does NOT double-post the summary', async () => {
  const boardText = `${BASE_BOARD.replace('## Done\n', `## Done

### ADO-408 | Item
**Status**: done

`)}`;
  const notes = buildNotesSkeleton('ADO-408', 'Item', '2026-07-01').replace(
    '_One-paragraph answer to: what is this task doing and why?_',
    'Summary that must post exactly once even if the done-state push fails.',
  );
  const workItems = { 408: { id: 408, rev: 1, title: 'Item', state: 'Active', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } };
  const config = baseConfig({ scope: { wiql: 'x' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-408', { rev: 1, adoState: 'Active', localStatus: 'in-progress', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  // First run: summary comment lands (stage 3), then the done-state write
  // (stage 4) fails — an ADO-side rejection, not a transport death.
  const failingClient = createMockAdoClient({
    workItems,
    fail: { updateWorkItemFields: { after: 1, error: 'ADO rejected the close transition', unavailable: false } },
  });
  const first = await push({ boardText, notesFiles: { 'ADO-408': notes }, syncState, config, client: failingClient });

  const summaryCallsFirst = failingClient.calls.filter((c) => c.method === 'addComment' && /done summary/.test(c.args[1]));
  assert.equal(summaryCallsFirst.length, 1, 'summary posted exactly once on the first (partially-failed) run');
  assert.equal(first.report.failed.length, 1);
  assert.equal(first.report.failed[0].stage, 'done-state');
  assert.equal(first.report.pushed.includes('ADO-408'), false); // task did not fully land

  const entryAfterFirst = getTaskEntry(first.syncState, 'ADO-408');
  assert.ok(entryAfterFirst.pushedSummaryHash, 'summary hash recorded immediately after the confirmed post');
  assert.equal(entryAfterFirst.adoState, 'Active'); // done-state never landed — still the pre-transition value

  // Second run (retry) against a healthy client: the state must transition,
  // but the summary must NOT be re-posted (hash guard).
  const healthyClient = createMockAdoClient({ workItems });
  const second = await push({
    boardText: first.boardText,
    notesFiles: first.notesFiles,
    syncState: first.syncState,
    config,
    client: healthyClient,
  });

  const summaryCallsSecond = healthyClient.calls.filter((c) => c.method === 'addComment' && /done summary/.test(c.args[1]));
  assert.equal(summaryCallsSecond.length, 0, 'retry must not double-post the summary comment');
  const stateCallsSecond = healthyClient.calls.filter((c) => c.method === 'updateWorkItemFields');
  assert.deepEqual(stateCallsSecond.map((c) => c.args), [[408, { 'System.State': 'Closed' }]]);
  assert.deepEqual(second.report.pushed, ['ADO-408']);
  assert.equal(getTaskEntry(second.syncState, 'ADO-408').adoState, 'Closed');
});

test('push (finding #4): AdoUnavailableError mid-push aborts remaining candidates and is reported distinctly from an ADO-side rejection', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-511 | Task one
**Status**: in-progress

### ADO-512 | Task two
**Status**: in-progress

### ADO-513 | Task three
**Status**: in-progress

`)}`;
  const workItems = {
    511: { id: 511, rev: 1, title: 'Task one', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' },
    512: { id: 512, rev: 1, title: 'Task two', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' },
    513: { id: 513, rev: 1, title: 'Task three', state: 'New', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' },
  };
  // Default (unavailable:true) — a genuine transport/auth death, not a
  // per-item ADO-side rejection.
  const client = createMockAdoClient({
    workItems,
    fail: { updateWorkItemFields: { after: 2, error: 'connection reset' } },
  });
  const config = baseConfig({ scope: { wiql: 'x' } });
  let syncState = emptySyncState();
  for (const id of ['ADO-511', 'ADO-512', 'ADO-513']) {
    syncState = setTaskEntry(syncState, id, { rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });
  }

  const result = await push({ boardText, notesFiles: {}, syncState, config, client });

  assert.deepEqual(result.report.pushed, ['ADO-511']); // landed before the transport died
  assert.equal(result.report.failed.length, 1);
  assert.equal(result.report.failed[0].id, 'ADO-512');
  assert.equal(result.report.failed[0].unavailable, true);
  // Task three was NEVER attempted — the transport is dead, no point
  // hammering it with more calls (unlike the ADO-side-rejection case in
  // test (37), where task three IS still attempted).
  assert.equal(client.calls.some((c) => c.args && c.args[0] === 513), false);
  assert.equal(getTaskEntry(result.syncState, 'ADO-511').adoState, 'Active');
  assert.equal(getTaskEntry(result.syncState, 'ADO-512').adoState, 'New'); // unchanged — failed call never landed
  assert.equal(getTaskEntry(result.syncState, 'ADO-513').adoState, 'New'); // never even attempted
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
  // unavailable:false — an ADO-SIDE rejection of this one call (e.g. a
  // validation error), NOT a transport/auth death. engine.push only aborts
  // remaining candidates for a genuine AdoUnavailableError (finding #4);
  // see the companion "AdoUnavailableError mid-push" test below for that case.
  const client = createMockAdoClient({
    workItems,
    fail: { updateWorkItemFields: { after: 2, error: 'injected ADO failure', unavailable: false } },
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
  assert.equal(result.report.failed[0].unavailable, false); // ADO-side rejection, not a transport death

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

test('conflict (39): both sides changed -> pull leaves Status, push makes zero STATE calls; context comment still flows (D2)', async () => {
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
  // The STATE field is never touched while conflicted — Codex review
  // finding #3/D2: comments are an append-only merge that can never
  // conflict, so the context comment (non-empty: the pulled notes file
  // still carries the skeleton's Patterns/Gotchas/Decisions sections) DOES
  // flow, even though the Status conflict blocks the state write.
  assert.equal(pushClient.calls.filter((c) => c.method === 'updateWorkItemFields').length, 0);
  const commentCalls = pushClient.calls.filter((c) => c.method === 'addComment');
  assert.equal(commentCalls.length, 1);
  assert.match(commentCalls[0].args[1], /^\[task-memory\] context update [0-9a-f]{8}\n\n/);
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

test('conflict (finding #12): --take-ado on an ADO state absent from the reverse state_map is rejected, never fabricates a resolution', async () => {
  const boardText = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-703 | Item
**Status**: done

`)}`;
  // 'Resolved' has no entry in state_map (todo/in-progress/done only) —
  // reverseStateMap['Resolved'] is undefined.
  const client = createMockAdoClient({ workItems: { 703: { id: 703, rev: 3, title: 'Item', state: 'Resolved', type: 'Task', assignee: '', iterationPath: '', priority: null, url: '' } } });
  const config = baseConfig({ scope: { wiql: 'x' }, state_map: { todo: 'New', 'in-progress': 'Active', done: 'Closed' } });
  const syncState = setTaskEntry(emptySyncState(), 'ADO-703', { rev: 2, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 });

  const result = await push({ boardText, notesFiles: {}, syncState, config, client, options: { takeAdo: ['ADO-703'] } });

  // Board Status untouched — no fabricated "in-progress" or unchanged
  // "done" silently reported as resolved.
  const block = findBlocks(result.boardText).find((b) => b.id === 'ADO-703');
  assert.equal(readField(block.block, 'Status'), 'done');
  assert.deepEqual(result.report.skipped, [{ id: 'ADO-703', reason: 'take-ado-unmapped-ado-state' }]);
  assert.equal(result.report.pushed.includes('ADO-703'), false);
  // syncState must NOT be re-baselined — the conflict is still genuinely
  // unresolved and must resurface on the next push/status.
  const entry = getTaskEntry(result.syncState, 'ADO-703');
  assert.equal(entry.adoState, 'New');
  assert.equal(entry.localStatus, 'todo');
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

test('promote (finding #10): localStatus baselines from the parsed Status FIELD, not the (possibly stale) physical section', async () => {
  // The card physically sits under "## To Do" (section id "todo") but its
  // own **Status** field says "in-progress" — a stale-placement scenario
  // the UI's auto-fix reorganization would normally correct on load, but
  // promote() reads the raw board text directly. The Status field is
  // authoritative (project rule: "Status field is authoritative") — the
  // pre-fix code used `taskBlock.sectionId || parsedTask.status`, which
  // always preferred the (stale) section over the field whenever sectionId
  // was truthy, silently baselining the WRONG value and setting up an
  // immediate false conflict on the very next sync.
  const staleBoard = `${BASE_BOARD.replace('## To Do\n', `## To Do

### TASK-043 | Stale section, field says otherwise
**Status**: in-progress

`)}`;
  const client = createMockAdoClient({ nextId: 91000 });
  const config = baseConfig({ scope: { wiql: 'x' } });

  const result = await promote({
    boardText: staleBoard, notesFiles: {}, syncState: emptySyncState(), config, client, taskId: 'TASK-043', today: '2026-07-19',
  });

  const entry = getTaskEntry(result.syncState, 'ADO-91000');
  assert.equal(entry.localStatus, 'in-progress'); // from the **Status** field, not the "todo" section
});

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

// =============================================================================
// CLI e2e — cases 46-48 (spawns scripts/ado-sync.mjs with --from-json —
// full offline end-to-end, zero network, zero MCP)
// =============================================================================

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI_SCRIPT = pathJoin(REPO_ROOT, 'scripts', 'ado-sync.mjs');
const FIXTURES_DIR = pathJoin(REPO_ROOT, 'tests', 'fixtures', 'ado');

function setupTempProject({ tasksMd, adoConfig, syncState, notes = {} }) {
  const dir = mkdtempSync(pathJoin(tmpdir(), 'ado-sync-cli-'));
  mkdirSync(pathJoin(dir, 'planning', 'notes'), { recursive: true });
  writeFileSync(pathJoin(dir, '.task-memory.json'), JSON.stringify({ ado: adoConfig }, null, 2));
  writeFileSync(pathJoin(dir, 'planning', 'tasks.md'), tasksMd);
  if (syncState) {
    writeFileSync(pathJoin(dir, 'planning', '.ado-sync.json'), JSON.stringify(syncState, null, 2));
  }
  for (const [id, text] of Object.entries(notes)) {
    writeFileSync(pathJoin(dir, 'planning', 'notes', `${id}.md`), text);
  }
  return dir;
}

function runCli(dir, args) {
  try {
    const stdout = execFileSync('node', [CLI_SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status, stdout: err.stdout?.toString() || '', stderr: err.stderr?.toString() || '' };
  }
}

test('CLI (46): pull writes 3 files atomically; --dry-run writes none', async () => {
  const dir = setupTempProject({
    tasksMd: BASE_BOARD,
    adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } },
  });
  try {
    const tasksPath = pathJoin(dir, 'planning', 'tasks.md');
    const notesPath = pathJoin(dir, 'planning', 'notes', 'ADO-1001.md');
    const syncStatePath = pathJoin(dir, 'planning', '.ado-sync.json');

    // --dry-run first: nothing should land.
    const dryRun = runCli(dir, ['pull', '--dry-run', '--from-json', pathJoin(FIXTURES_DIR, 'pull-basic.json')]);
    assert.equal(dryRun.code, 0);
    assert.equal(readFileSync(tasksPath, 'utf8'), BASE_BOARD);
    assert.equal(existsSync(notesPath), false);
    assert.equal(existsSync(syncStatePath), false);

    // Real run: all 3 files land.
    const real = runCli(dir, ['pull', '--from-json', pathJoin(FIXTURES_DIR, 'pull-basic.json')]);
    assert.equal(real.code, 0);
    assert.ok(readFileSync(tasksPath, 'utf8').includes('ADO-1001'));
    assert.equal(existsSync(notesPath), true);
    assert.ok(readFileSync(notesPath, 'utf8').includes('ADO-1001 Notes'));
    assert.equal(existsSync(syncStatePath), true);
    const syncState = JSON.parse(readFileSync(syncStatePath, 'utf8'));
    assert.ok(syncState.tasks['ADO-1001']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI (47): exit codes 0 (ok), 2 (ADO unreachable, clean no-op), 3 (conflicts pending)', async () => {
  // 0 — clean pull.
  const okDir = setupTempProject({ tasksMd: BASE_BOARD, adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } } });
  try {
    const result = runCli(okDir, ['pull', '--from-json', pathJoin(FIXTURES_DIR, 'pull-basic.json')]);
    assert.equal(result.code, 0);
  } finally {
    rmSync(okDir, { recursive: true, force: true });
  }

  // 2 — ADO unreachable, zero files touched.
  const unavailableDir = setupTempProject({ tasksMd: BASE_BOARD, adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } } });
  try {
    const tasksPath = pathJoin(unavailableDir, 'planning', 'tasks.md');
    const result = runCli(unavailableDir, ['pull', '--from-json', pathJoin(FIXTURES_DIR, 'unavailable.json')]);
    assert.equal(result.code, 2);
    assert.equal(readFileSync(tasksPath, 'utf8'), BASE_BOARD);
    assert.equal(existsSync(pathJoin(unavailableDir, 'planning', '.ado-sync.json')), false);
  } finally {
    rmSync(unavailableDir, { recursive: true, force: true });
  }

  // 3 — push conflict pending.
  const conflictTasksMd = `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-2001 | Conflicted item
**Status**: done

`)}`;
  const conflictDir = setupTempProject({
    tasksMd: conflictTasksMd,
    adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } },
    syncState: { version: 1, tasks: { 'ADO-2001': { rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 } } },
  });
  try {
    // finding #1: --from-json + push requires --dry-run (push is mutating;
    // --from-json is a read-only escape hatch). decidePush's conflict
    // detection runs identically regardless of dryRun, so exit code 3 is
    // still exercised faithfully here.
    const result = runCli(conflictDir, ['push', '--dry-run', '--from-json', pathJoin(FIXTURES_DIR, 'conflict.json')]);
    assert.equal(result.code, 3);
  } finally {
    rmSync(conflictDir, { recursive: true, force: true });
  }
});

test('CLI (48): status runs fully offline, with no client at all (no --from-json)', async () => {
  const dir = setupTempProject({
    tasksMd: `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-3001 | Untracked item
**Status**: in-progress

`)}`,
    adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } },
  });
  try {
    const result = runCli(dir, ['status', '--json']);
    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].id, 'ADO-3001');
    assert.equal(payload.items[0].status, 'untracked');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI (finding #1): --from-json rejected for a real push (no --dry-run), board untouched', async () => {
  const dir = setupTempProject({
    tasksMd: `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-4001 | Item
**Status**: in-progress

`)}`,
    adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } },
    syncState: { version: 1, tasks: { 'ADO-4001': { rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 } } },
  });
  try {
    const tasksPath = pathJoin(dir, 'planning', 'tasks.md');
    const before = readFileSync(tasksPath, 'utf8');
    const result = runCli(dir, ['push', '--from-json', pathJoin(FIXTURES_DIR, 'pull-basic.json')]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--from-json.*push.*--dry-run/s);
    assert.equal(readFileSync(tasksPath, 'utf8'), before, 'board must be untouched');
    assert.equal(existsSync(pathJoin(dir, 'planning', '.ado-sync.json')) && readFileSync(pathJoin(dir, 'planning', '.ado-sync.json'), 'utf8'), JSON.stringify({ version: 1, tasks: { 'ADO-4001': { rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 } } }, null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI (finding #1): --from-json IS allowed for push when --dry-run is also passed', async () => {
  const dir = setupTempProject({
    tasksMd: `${BASE_BOARD.replace('## In Progress\n', `## In Progress

### ADO-4002 | Item
**Status**: in-progress

`)}`,
    adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } },
    syncState: { version: 1, tasks: { 'ADO-4002': { rev: 1, adoState: 'New', localStatus: 'todo', syncedAt: '2026-07-01T00:00:00Z', lastCommentId: 0 } } },
  });
  try {
    const result = runCli(dir, ['push', '--dry-run', '--from-json', pathJoin(FIXTURES_DIR, 'pull-basic.json')]);
    assert.notEqual(result.code, 1, `expected a non-rejection exit code, got 1: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /--from-json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI (finding #1): --from-json rejected for promote unconditionally (no dry-run form exists)', async () => {
  const dir = setupTempProject({
    tasksMd: PROMOTE_BOARD,
    adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } },
  });
  try {
    const tasksPath = pathJoin(dir, 'planning', 'tasks.md');
    const before = readFileSync(tasksPath, 'utf8');
    const result = runCli(dir, ['promote', 'TASK-042', '--from-json', pathJoin(FIXTURES_DIR, 'pull-basic.json')]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--from-json.*promote/s);
    assert.equal(readFileSync(tasksPath, 'utf8'), before, 'board must be untouched');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI (finding #7): --link argument validation rejects non-positive-integer forms before any client call or board mutation', async () => {
  for (const bad of ['abc', '0', '123junk', '-5', '1.5']) {
    const dir = setupTempProject({ tasksMd: PROMOTE_BOARD, adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } } });
    try {
      const tasksPath = pathJoin(dir, 'planning', 'tasks.md');
      const before = readFileSync(tasksPath, 'utf8');
      const result = runCli(dir, ['promote', 'TASK-042', '--link', bad]);
      assert.equal(result.code, 1, `--link ${bad} should be rejected`);
      assert.match(result.stderr, /--link/);
      assert.equal(readFileSync(tasksPath, 'utf8'), before, `board must be untouched for --link ${bad}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('LINK_ID_RE (finding #7): well-formed positive-integer forms pass; everything else (that the rejection CLI test already proves fails) does not', () => {
  // A direct, offline check of the exported validator itself — the CLI-level
  // rejection cases are covered by the "--link argument validation" test
  // above; a POSITIVE CLI-level case can't be driven further offline since
  // promote() unconditionally rejects --from-json (finding #1) and always
  // needs a real client past this validation step, so this checks the same
  // regex the CLI actually gates on rather than paying for a real (network-
  // dependent, multi-second) MCP client-spawn attempt just to prove a
  // one-line regex accepts "555".
  for (const good of ['1', '9', '555', '90000', '999999999']) {
    assert.ok(LINK_ID_RE.test(good), `expected --link ${good} to pass validation`);
  }
  for (const bad of ['abc', '0', '123junk', '-5', '1.5', '', '01']) {
    assert.ok(!LINK_ID_RE.test(bad), `expected --link ${bad} to be rejected`);
  }
});

test('CLI (finding #13): --json output is pure JSON, no interleaved parseMarkdown/parseTask console noise', async () => {
  const dir = setupTempProject({
    tasksMd: BASE_BOARD, // has an explicit **Columns** config line -> triggers parseMarkdown's column-parsing qlog() calls if not silenced
    adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } },
  });
  try {
    const result = runCli(dir, ['pull', '--json', '--from-json', pathJoin(FIXTURES_DIR, 'pull-basic.json')]);
    assert.equal(result.code, 0);
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(result.stdout);
    }, `stdout was not pure JSON:\n${result.stdout}`);
    assert.ok(parsed.created || parsed.unchanged || parsed.updated, 'parsed a real pull report shape');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('markdown.js (finding #13): setQuietLogging suppresses parseMarkdown/parseTask console output without changing the UI default', () => {
  const originalLog = console.log;
  const logs = [];
  console.log = (...a) => logs.push(a);
  try {
    markdownParser.setQuietLogging(true);
    markdownParser.parseMarkdown(BASE_BOARD, {});
    assert.equal(logs.length, 0, 'quiet mode: zero console.log calls');

    markdownParser.setQuietLogging(false);
    markdownParser.parseMarkdown(BASE_BOARD, {});
    assert.ok(logs.length > 0, 'default (UI) mode: logging behavior unchanged');
  } finally {
    console.log = originalLog;
    markdownParser.setQuietLogging(false); // never leak the toggle into other tests
  }
});

test('CLI (finding #6, crash-safety): pull writes sync-state LAST as the commit marker — a failure at an earlier stage never leaves it falsely claiming success', async () => {
  const dir = setupTempProject({
    tasksMd: BASE_BOARD,
    adoConfig: { org: 'kepptic', project: 'task-memory', scope: { wiql: 'x' } },
  });
  const notesDir = pathJoin(dir, 'planning', 'notes');
  try {
    const tasksPath = pathJoin(dir, 'planning', 'tasks.md');
    const notesPath = pathJoin(notesDir, 'ADO-1001.md');
    const syncStatePath = pathJoin(dir, 'planning', '.ado-sync.json');
    // Obstruct the NOTES write (the stage right before sync-state in
    // cmdPull's sequence: board -> notes -> sync-state) by revoking write
    // permission on the notes directory — it still exists and is readable
    // (so the earlier readNotesFiles() call is untouched), but creating the
    // new ADO-1001.md file in it fails with EACCES. Board (a sibling write,
    // BEFORE notes) should still land; sync-state (AFTER notes) must never
    // be reached at all — that's the "pragmatic" (not fully transactional)
    // crash-safety documented in docs/ADO-SYNC.md: earlier writes are not
    // rolled back, but the commit marker can never be left claiming success
    // when the run didn't actually complete.
    chmodSync(notesDir, 0o555);

    const result = runCli(dir, ['pull', '--from-json', pathJoin(FIXTURES_DIR, 'pull-basic.json')]);
    assert.equal(result.code, 1, 'unexpected fs error, not a clean run');
    assert.ok(readFileSync(tasksPath, 'utf8').includes('ADO-1001'), 'board write landed (happens before notes/sync-state)');
    assert.equal(existsSync(notesPath), false, 'notes write never landed (permission denied)');
    assert.equal(existsSync(syncStatePath), false, 'sync-state (the commit marker) was never reached, let alone written');

    // Retrying after fixing the obstruction recovers cleanly — idempotent,
    // since the board already reflects the pulled ADO-1001 block.
    chmodSync(notesDir, 0o755);
    const retry = runCli(dir, ['pull', '--from-json', pathJoin(FIXTURES_DIR, 'pull-basic.json')]);
    assert.equal(retry.code, 0);
    assert.equal(existsSync(notesPath), true);
    assert.ok(JSON.parse(readFileSync(syncStatePath, 'utf8')).tasks['ADO-1001']);
  } finally {
    chmodSync(notesDir, 0o755); // restore before recursive cleanup, or rmSync itself can fail
    rmSync(dir, { recursive: true, force: true });
  }
});

test('applyPromoteWrites (finding #6, crash-safety): never unlinks the old notes file before sync-state (the commit marker) is durable', async () => {
  // promote() unconditionally rejects --from-json (finding #1), so a
  // CLI-subprocess version of this test would need a real MCP client just
  // to reach the write logic under test — slow and network-dependent,
  // against this whole module's "zero network, zero MCP" test principle.
  // Instead: compute a REAL result via promote() + the offline mock client
  // (exactly like promote() cases 42-45 above), then test applyPromoteWrites
  // — the CLI's pure filesystem write-ordering logic — directly against it.
  const client = createMockAdoClient({ nextId: 92000 });
  const config = baseConfig({ scope: { wiql: 'x' } });
  const oldNotesText = '# TASK-042 Notes — Promote me\n\n## Summary\n\nOriginal notes content that must never be lost.\n';
  const result = await promote({
    boardText: PROMOTE_BOARD,
    notesFiles: { 'TASK-042': oldNotesText },
    syncState: emptySyncState(),
    config,
    client,
    taskId: 'TASK-042',
    today: '2026-07-19',
  });

  const dir = mkdtempSync(pathJoin(tmpdir(), 'ado-sync-promote-writes-'));
  try {
    const notesDir = pathJoin(dir, 'planning', 'notes');
    mkdirSync(notesDir, { recursive: true });
    writeFileSync(pathJoin(notesDir, 'TASK-042.md'), oldNotesText);
    const taskFilePath = pathJoin(dir, 'planning', 'tasks.md');
    writeFileSync(taskFilePath, PROMOTE_BOARD);
    const syncStatePath = pathJoin(dir, 'planning', '.ado-sync.json');
    // Pre-create a DIRECTORY at the sync-state path so the FINAL write (the
    // durable commit marker) fails — simulating a crash/error at the last
    // step, after the board + new notes file have already landed but
    // BEFORE the old notes file would be permanently removed.
    mkdirSync(syncStatePath, { recursive: true });

    assert.throws(() => applyPromoteWrites(notesDir, taskFilePath, syncStatePath, 'TASK-042', result));

    // Board and the NEW notes file did land (writes before sync-state).
    assert.ok(readFileSync(taskFilePath, 'utf8').includes('ADO-92000'));
    assert.equal(existsSync(pathJoin(notesDir, 'ADO-92000.md')), true);
    // The original notes content must still be recoverable somewhere on
    // disk — either the old file itself, or the renamed tmp copy — NEVER
    // silently deleted while the commit marker never landed.
    const dirEntries = readdirSync(notesDir);
    const survivor = dirEntries.find((n) => n === 'TASK-042.md' || n.startsWith('TASK-042.md.tmp-promoted-'));
    assert.ok(survivor, `old notes content must survive somewhere; found: ${dirEntries.join(', ')}`);
    const survivorText = readFileSync(pathJoin(notesDir, survivor), 'utf8');
    assert.match(survivorText, /Original notes content that must never be lost\./);

    // Recovery: fix the obstruction and re-apply — completes cleanly, and
    // the (already-renamed) tmp copy gets cleaned up.
    rmSync(syncStatePath, { recursive: true, force: true });
    applyPromoteWrites(notesDir, taskFilePath, syncStatePath, 'TASK-042', result);
    assert.ok(JSON.parse(readFileSync(syncStatePath, 'utf8')).tasks['ADO-92000']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: ADO sync not configured -> exit 0, clean message', async () => {
  const dir = mkdtempSync(pathJoin(tmpdir(), 'ado-sync-cli-'));
  try {
    mkdirSync(pathJoin(dir, 'planning'), { recursive: true });
    writeFileSync(pathJoin(dir, '.task-memory.json'), JSON.stringify({ planning_dir: 'planning' }, null, 2));
    writeFileSync(pathJoin(dir, 'planning', 'tasks.md'), BASE_BOARD);
    const result = runCli(dir, ['pull']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /not configured/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
