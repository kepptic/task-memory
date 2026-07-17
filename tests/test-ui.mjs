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
} from '../src/utils/taskId.js';

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
