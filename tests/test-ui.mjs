// test-ui.mjs — plain node:test/assert suite for the JS UI's task-id grammar
// and markdown round-trips (TASK-017). No framework; run with:
//   node tests/test-ui.mjs
// Wired into ./tests/test-hooks.sh behind a `command -v node` guard, and as
// `npm run test:ui`.
//
// Cases are added phase-by-phase (see PLAN-final §7):
//   P1 -> section 1-2 (taskId.js is pure, no other module changes needed)
//   P3 -> section 3   (markdown.js round-trips)
//   P4 -> section 4-6 (mint, sibling independence, fileSystem discovery)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TASK_ID_CORE,
  TASK_ID_RE,
  CONFIG_HEADER_RE,
  prefixFromFileName,
  resolvePrefix,
  parseTaskId,
  formatTaskId,
  maxNumInScope,
  serializeConfigHeader,
  mintNextId,
  ADO_ID_CORE,
  ADO_ID_RE,
  ANY_ID_CORE,
  parseAdoId,
  parseAnyId,
  formatAdoId,
} from '../src/utils/taskId.js';

import { markdownParser } from '../src/utils/markdown.js';
import { TASK_FILE_RE } from '../src/utils/fileSystem.js';

// =============================================================================
// 1. taskId.js units
// =============================================================================

test('parseTaskId: legacy id', () => {
  assert.deepEqual(parseTaskId('TASK-676'), { prefix: '', num: 676, raw: 'TASK-676' });
});

test('parseTaskId: prefixed id', () => {
  assert.deepEqual(parseTaskId('TASK-GR-678'), { prefix: 'GR', num: 678, raw: 'TASK-GR-678' });
});

test('parseTaskId: lowercase prefix does not parse', () => {
  assert.equal(parseTaskId('TASK-gr-1'), null);
});

test('parseTaskId: trailing alnum breaks tail boundary', () => {
  assert.equal(parseTaskId('TASK-GR-12X'), null);
});

test('parseTaskId: non-string input returns null', () => {
  assert.equal(parseTaskId(undefined), null);
  assert.equal(parseTaskId(null), null);
});

test('formatTaskId: legacy pads to 3 digits', () => {
  assert.equal(formatTaskId('', 43), 'TASK-043');
});

test('formatTaskId: prefixed id is never padded', () => {
  assert.equal(formatTaskId('DG', 1), 'TASK-DG-1');
});

test('maxNumInScope: scoped max ignores other prefixes and legacy ids', () => {
  const ids = ['TASK-900', 'TASK-GR-677', 'TASK-GR-678', 'TASK-DG-1', 'not-a-task'];
  assert.equal(maxNumInScope(ids, 'GR'), 678);
  assert.equal(maxNumInScope(ids, 'DG'), 1);
  assert.equal(maxNumInScope(ids, ''), 900);
  assert.equal(maxNumInScope(ids, 'ZZ'), 0);
});

test('TASK_ID_CORE: embeds cleanly and respects tail boundary', () => {
  const re = new RegExp('^' + TASK_ID_CORE + '$');
  assert.ok(re.test('TASK-676'));
  assert.ok(re.test('TASK-GR-678'));
  assert.ok(!re.test('TASK-GR-12X'));
  assert.ok(!re.test('TASK-gr-1'));
});

test('CONFIG_HEADER_RE: legacy header', () => {
  const m = CONFIG_HEADER_RE.exec('<!-- Config: Last Task ID: 42 -->');
  assert.ok(m);
  assert.equal(m[1], undefined);
  assert.equal(m[2], '42');
});

test('CONFIG_HEADER_RE: team header', () => {
  const m = CONFIG_HEADER_RE.exec('<!-- Config: Task Prefix: GR | Last Task ID: 677 -->');
  assert.ok(m);
  assert.equal(m[1], 'GR');
  assert.equal(m[2], '677');
});

test('TASK_ID_RE: sanity (group numbering)', () => {
  const m = TASK_ID_RE.exec('TASK-GR-678');
  assert.equal(m[1], 'GR');
  assert.equal(m[2], '678');
});

// =============================================================================
// 2. resolvePrefix matrix (Q2)
// =============================================================================

test('resolvePrefix: field absent + tasks-gr.md filename -> GR (fallback)', () => {
  const { prefix, warning } = resolvePrefix(undefined, 'tasks-gr.md');
  assert.equal(prefix, 'GR');
  assert.equal(warning, null);
});

test('resolvePrefix: field absent + tasks.md filename -> "" (no fallback match)', () => {
  const { prefix, warning } = resolvePrefix(undefined, 'tasks.md');
  assert.equal(prefix, '');
  assert.equal(warning, null);
});

test('resolvePrefix: valid field "GR" -> GR', () => {
  const { prefix, warning } = resolvePrefix('GR', 'tasks.md');
  assert.equal(prefix, 'GR');
  assert.equal(warning, null);
});

test('resolvePrefix: field present but empty -> "" + warning, NO filename fallthrough', () => {
  const { prefix, warning } = resolvePrefix('', 'tasks-gr.md');
  assert.equal(prefix, '');
  assert.ok(warning);
});

test('resolvePrefix: lowercase "gr" is malformed -> "" + warning (no auto-uppercase)', () => {
  const { prefix, warning } = resolvePrefix('gr', 'tasks-gr.md');
  assert.equal(prefix, '');
  assert.ok(warning);
});

test('resolvePrefix: "GR2" is malformed (digit) -> "" + warning', () => {
  const { prefix, warning } = resolvePrefix('GR2', 'tasks.md');
  assert.equal(prefix, '');
  assert.ok(warning);
});

test('resolvePrefix: "TOOLONG" (5 letters) is malformed -> "" + warning', () => {
  const { prefix, warning } = resolvePrefix('TOOLONG', 'tasks.md');
  assert.equal(prefix, '');
  assert.ok(warning);
});

test('resolvePrefix: counter survives malformed prefix (CONFIG_HEADER_RE g2)', () => {
  const header = '<!-- Config: Task Prefix: GR2 | Last Task ID: 677 -->';
  const m = CONFIG_HEADER_RE.exec(header);
  assert.ok(m);
  assert.equal(m[2], '677');
  const { prefix, warning } = resolvePrefix(m[1], 'tasks.md');
  assert.equal(prefix, '');
  assert.ok(warning);
});

test('prefixFromFileName: matches tasks-gr.md, tasks_dg.md; rejects tasks.md / tasks-archive.md', () => {
  assert.equal(prefixFromFileName('tasks-gr.md'), 'GR');
  assert.equal(prefixFromFileName('tasks_dg.md'), 'DG');
  assert.equal(prefixFromFileName('tasks.md'), '');
  assert.equal(prefixFromFileName('tasks-archive.md'), '');
});

test('serializeConfigHeader: legacy vs team form', () => {
  assert.equal(serializeConfigHeader('', 42), '<!-- Config: Last Task ID: 42 -->');
  assert.equal(
    serializeConfigHeader('GR', 677),
    '<!-- Config: Task Prefix: GR | Last Task ID: 677 -->',
  );
});

// =============================================================================
// 3. markdown.js round-trips
// =============================================================================

test('markdown: legacy fixture parse -> generate header byte-stable', () => {
  const content = `# Kanban Board

<!-- Config: Last Task ID: 42 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | Done (done)

---

## To Do

### TASK-001 | Legacy task
**Priority**: High | **Category**: Feature | **Status**: todo

A legacy task.

---

## Done

---
`;
  const parsed = markdownParser.parseMarkdown(content, { fileName: 'tasks.md' });
  assert.equal(parsed.config.taskPrefix, '');
  assert.equal(parsed.config.lastTaskId, 42);
  const regenerated = markdownParser.generateMarkdown(
    parsed.tasks.map((t) => ({ ...t, status: t.status })),
    parsed.config,
  );
  assert.match(regenerated, /<!-- Config: Last Task ID: 42 -->/);
});

test('markdown: TASK-5 / TASK-005 / TASK-GR-001 headings round-trip VERBATIM', () => {
  const content = `# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 1 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | Done (done)

---

## To Do

### TASK-5 | Unpadded legacy
**Status**: todo

### TASK-005 | Padded legacy
**Status**: todo

### TASK-GR-001 | Prefixed, zero-padded on disk
**Status**: todo

---

## Done

---
`;
  const parsed = markdownParser.parseMarkdown(content, { fileName: 'tasks-gr.md' });
  const ids = parsed.tasks.map((t) => t.id);
  assert.ok(ids.includes('TASK-5'), `expected TASK-5 verbatim, got ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('TASK-005'), `expected TASK-005 verbatim, got ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('TASK-GR-001'), `expected TASK-GR-001 verbatim, got ${JSON.stringify(ids)}`);
});

test('markdown: prefixed task is not dropped by parseTasksFromSection (v1 data-loss bug)', () => {
  const content = `# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 678 -->

## ⚙️ Configuration

**Columns**: In Progress (in-progress) | Done (done)

---

## In Progress

### TASK-GR-678 | Prefixed in-progress task
**Status**: in-progress

**Subtasks**:
- [x] one
- [ ] two

---

## Done

---
`;
  const parsed = markdownParser.parseMarkdown(content, { fileName: 'tasks-gr.md' });
  const task = parsed.tasks.find((t) => t.id === 'TASK-GR-678');
  assert.ok(task, 'TASK-GR-678 should be parsed, not dropped');
  assert.equal(task.subtasks.length, 2);
});

test('markdown: config counter g1->g2 regression (lastTaskId is 677, not NaN/0)', () => {
  const content = `# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 677 -->

## ⚙️ Configuration

**Columns**: To Do (todo)

---

## To Do

---
`;
  const parsed = markdownParser.parseMarkdown(content, { fileName: 'tasks-gr.md' });
  assert.equal(parsed.config.lastTaskId, 677);
  assert.equal(parsed.config.taskPrefix, 'GR');
});

test('markdown: malformed heading (TASK-GR-12X) is not treated as a task', () => {
  const content = `# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 12 -->

## ⚙️ Configuration

**Columns**: To Do (todo)

---

## To Do

### TASK-GR-12X | Not a real task id
**Status**: todo

---
`;
  const parsed = markdownParser.parseMarkdown(content, { fileName: 'tasks-gr.md' });
  assert.equal(parsed.tasks.length, 0);
});

// =============================================================================
// 4. Mint — exercises the REAL src/utils/taskId.js#mintNextId, the exact
//    function App.jsx's handleSaveTask calls (no mirrored copy — see
//    src/App.jsx handleSaveTask for the ref-mutation call site). mintNextId
//    itself is pure; these tests replicate the caller's synchronous
//    ref-mutation contract (meta.lastTaskId = nextNum, BEFORE the next call)
//    to prove rapid double-mint safety.
// =============================================================================

test('mint: header(GR,677) -> TASK-GR-678 + counter 678', () => {
  const meta = { taskPrefix: 'GR', lastTaskId: 677 };
  const { id, nextNum } = mintNextId(meta, []);
  meta.lastTaskId = nextNum;
  assert.equal(id, 'TASK-GR-678');
  assert.equal(meta.lastTaskId, 678);
});

test('mint: legacy(42) -> TASK-043', () => {
  const meta = { taskPrefix: '', lastTaskId: 42 };
  const { id, nextNum } = mintNextId(meta, []);
  meta.lastTaskId = nextNum;
  assert.equal(id, 'TASK-043');
  assert.equal(meta.lastTaskId, 43);
});

test('mint: rapid double-mint against one meta yields distinct ids', () => {
  const meta = { taskPrefix: 'GR', lastTaskId: 677 };
  const first = mintNextId(meta, []);
  meta.lastTaskId = first.nextNum;
  const second = mintNextId(meta, []);
  meta.lastTaskId = second.nextNum;
  assert.equal(first.id, 'TASK-GR-678');
  assert.equal(second.id, 'TASK-GR-679');
});

// =============================================================================
// 5. Sibling independence (acceptance criterion 1, proven against production
//    markdown.js + taskId.js)
// =============================================================================

test('sibling files: independent prefix + counter scopes', () => {
  const grContent = `# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 677 -->

## ⚙️ Configuration

**Columns**: To Do (todo)

---

## To Do

---
`;
  const dgContent = `# Kanban Board

<!-- Config: Task Prefix: DG | Last Task ID: 0 -->

## ⚙️ Configuration

**Columns**: To Do (todo)

---

## To Do

---
`;
  const grParsed = markdownParser.parseMarkdown(grContent, { fileName: 'tasks-gr.md' });
  const dgParsed = markdownParser.parseMarkdown(dgContent, { fileName: 'tasks-dg.md' });

  const grMeta = { taskPrefix: grParsed.config.taskPrefix, lastTaskId: grParsed.config.lastTaskId };
  const dgMeta = { taskPrefix: dgParsed.config.taskPrefix, lastTaskId: dgParsed.config.lastTaskId };

  const grMint = mintNextId(grMeta, []);
  grMeta.lastTaskId = grMint.nextNum;
  const dgMint = mintNextId(dgMeta, []);
  dgMeta.lastTaskId = dgMint.nextNum;

  assert.equal(grMint.id, 'TASK-GR-678');
  assert.equal(dgMint.id, 'TASK-DG-1');

  const grMd = markdownParser.generateMarkdown([], { ...grParsed.config, lastTaskId: grMeta.lastTaskId });
  const dgMd = markdownParser.generateMarkdown([], { ...dgParsed.config, lastTaskId: dgMeta.lastTaskId });

  assert.match(grMd, /Task Prefix: GR \| Last Task ID: 678/);
  assert.doesNotMatch(grMd, /Task Prefix: DG/);
  assert.match(dgMd, /Task Prefix: DG \| Last Task ID: 1/);
  assert.doesNotMatch(dgMd, /Task Prefix: GR/);
});

// =============================================================================
// 6. fileSystem discovery regex
// =============================================================================

test('fileSystem TASK_FILE_RE: accepts tasks.md/tasks-gr.md/tasks_dg.md, rejects tasks-archive.md/archive.md', () => {
  assert.ok(TASK_FILE_RE.test('tasks.md'));
  assert.ok(TASK_FILE_RE.test('tasks-gr.md'));
  assert.ok(TASK_FILE_RE.test('tasks_dg.md'));
  assert.ok(!TASK_FILE_RE.test('tasks-archive.md'));
  assert.ok(!TASK_FILE_RE.test('archive.md'));
});

// =============================================================================
// 7. ADO id grammar (TASK-019) — PLAN-ado.md §9.1, cases 1-14.
//    P0 -> cases 1-10 (taskId.js is pure, no other module changes needed)
//    P1 -> cases 11-14 (markdown.js: ANY_ID_CORE headings + Sprint/ADO fields)
// =============================================================================

test('parseAdoId: valid id', () => {
  assert.deepEqual(parseAdoId('ADO-12345'), { kind: 'ado', num: 12345, raw: 'ADO-12345' });
});

test('parseAdoId: leading zero does not parse', () => {
  assert.equal(parseAdoId('ADO-012'), null);
});

test('parseAdoId: zero does not parse', () => {
  assert.equal(parseAdoId('ADO-0'), null);
});

test('parseAdoId: trailing alnum breaks tail boundary', () => {
  assert.equal(parseAdoId('ADO-12X'), null);
});

test('parseAdoId / parseTaskId: kinds do not cross', () => {
  assert.equal(parseTaskId('ADO-12'), null);
  assert.equal(parseAdoId('TASK-12'), null);
});

test('parseAnyId: dispatches both kinds + null passthrough', () => {
  assert.deepEqual(parseAnyId('TASK-GR-678'), { kind: 'task', prefix: 'GR', num: 678, raw: 'TASK-GR-678' });
  assert.deepEqual(parseAnyId('ADO-12345'), { kind: 'ado', num: 12345, raw: 'ADO-12345' });
  assert.equal(parseAnyId('not-an-id'), null);
});

test('formatAdoId: never padded, rejects non-positive-integers', () => {
  assert.equal(formatAdoId(12345), 'ADO-12345');
  assert.throws(() => formatAdoId(0));
  assert.throws(() => formatAdoId(-1));
  assert.throws(() => formatAdoId(1.5));
  assert.throws(() => formatAdoId('12'));
});

test('bit-identical guard: existing TASK id behavior is untouched by the ADO addition', () => {
  assert.deepEqual(parseTaskId('TASK-676'), { prefix: '', num: 676, raw: 'TASK-676' });
  assert.deepEqual(parseTaskId('TASK-GR-678'), { prefix: 'GR', num: 678, raw: 'TASK-GR-678' });
  assert.equal(formatTaskId('', 43), 'TASK-043');
  assert.equal(formatTaskId('DG', 1), 'TASK-DG-1');
});

test('mintNextId: ADO ids in the pool are ignored (prefixed scope)', () => {
  const meta = { taskPrefix: 'GR', lastTaskId: 0 };
  const { id } = mintNextId(meta, ['ADO-99999', 'TASK-GR-2']);
  assert.equal(id, 'TASK-GR-3');
});

test('mintNextId: ADO ids in the pool are ignored (legacy scope)', () => {
  const meta = { taskPrefix: '', lastTaskId: 0 };
  const { id } = mintNextId(meta, ['ADO-99999', 'TASK-2']);
  assert.equal(id, 'TASK-003');
});

test('maxNumInScope: ADO ids never count toward any TASK scope', () => {
  assert.equal(maxNumInScope(['ADO-7'], ''), 0);
});

test('ADO_ID_CORE: embeds cleanly and respects tail boundary', () => {
  const re = new RegExp('^' + ADO_ID_CORE + '$');
  assert.ok(re.test('ADO-12345'));
  assert.ok(!re.test('ADO-012'));
  assert.ok(!re.test('ADO-0'));
  assert.ok(!re.test('ADO-12X'));
});

test('ADO_ID_RE: sanity (group numbering)', () => {
  const m = ADO_ID_RE.exec('ADO-12345');
  assert.equal(m[1], '12345');
  assert.equal(ADO_ID_RE.exec('ADO-012'), null);
});

test('ANY_ID_CORE: matches both kinds, rejects malformed tails', () => {
  const re = new RegExp('^' + ANY_ID_CORE + '$');
  assert.ok(re.test('TASK-676'));
  assert.ok(re.test('TASK-GR-678'));
  assert.ok(re.test('ADO-12345'));
  assert.ok(!re.test('ADO-012'));
  assert.ok(!re.test('TASK-GR-12X'));
  assert.ok(!re.test('ADO-12X'));
});

// -----------------------------------------------------------------------------
// P1 (markdown.js): cases 11-14
// -----------------------------------------------------------------------------

test('markdown: ADO heading and TASK heading coexist in one section, ids verbatim', () => {
  const content = `# Kanban Board

<!-- Config: Task Prefix: GR | Last Task ID: 1 -->

## ⚙️ Configuration

**Columns**: In Progress (in-progress) | Done (done)

---

## In Progress

### ADO-12345 | Synced ADO item
**Status**: in-progress

### TASK-GR-1 | Local-only item
**Status**: in-progress

---

## Done

---
`;
  const parsed = markdownParser.parseMarkdown(content, { fileName: 'tasks-gr.md' });
  const ids = parsed.tasks.map((t) => t.id);
  assert.ok(ids.includes('ADO-12345'), `expected ADO-12345 verbatim, got ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('TASK-GR-1'), `expected TASK-GR-1 verbatim, got ${JSON.stringify(ids)}`);
});

test('markdown: round-trip preserves ADO heading + Sprint/ADO fields (D6), never pads', () => {
  const content = `# Kanban Board

<!-- Config: Last Task ID: 0 -->

## ⚙️ Configuration

**Columns**: In Progress (in-progress) | Done (done)

---

## In Progress

### ADO-12345 | Synced ADO item
**Status**: in-progress
**Sprint**: Sprint 42 | **ADO**: https://dev.azure.com/org/proj/_workitems/edit/12345

Some description text.

---

## Done

---
`;
  const parsed = markdownParser.parseMarkdown(content, { fileName: 'tasks.md' });
  const task = parsed.tasks.find((t) => t.id === 'ADO-12345');
  assert.ok(task, 'ADO-12345 should be parsed');
  assert.equal(task.sprint, 'Sprint 42');
  assert.equal(task.adoUrl, 'https://dev.azure.com/org/proj/_workitems/edit/12345');
  assert.doesNotMatch(task.description, /Sprint 42/);
  assert.doesNotMatch(task.description, /_workitems/);

  const regenerated = markdownParser.generateMarkdown(parsed.tasks, parsed.config);
  assert.match(regenerated, /^### ADO-12345 \| Synced ADO item$/m);
  assert.match(regenerated, /\*\*Sprint\*\*: Sprint 42 \| \*\*ADO\*\*: https:\/\/dev\.azure\.com\/org\/proj\/_workitems\/edit\/12345/);
  assert.doesNotMatch(regenerated, /ADO-012345/);
});

test('markdown: ADO-012 (leading zero) is not treated as a task heading', () => {
  const content = `# Kanban Board

<!-- Config: Last Task ID: 0 -->

## ⚙️ Configuration

**Columns**: In Progress (in-progress)

---

## In Progress

### ADO-012 | Not a real ADO id (leading zero)
**Status**: in-progress

---
`;
  const parsed = markdownParser.parseMarkdown(content, { fileName: 'tasks.md' });
  assert.equal(parsed.tasks.length, 0);
});

test('markdown: parseArchive accepts ADO ids', () => {
  const content = `# Task Archive

> Archived tasks

## ✅ Archives

### ADO-999 | Archived ADO item
**Status**: done

### TASK-042 | Archived legacy item
**Status**: done

`;
  const archived = markdownParser.parseArchive(content);
  const ids = archived.map((t) => t.id);
  assert.ok(ids.includes('ADO-999'), `expected ADO-999 verbatim, got ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('TASK-042'), `expected TASK-042 verbatim, got ${JSON.stringify(ids)}`);
});
