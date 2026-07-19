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
