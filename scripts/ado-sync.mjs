#!/usr/bin/env node
// scripts/ado-sync.mjs — TASK-019 (Azure DevOps bridge)
//
// The CLI wrapper around src/sync/engine.js. This is the ONLY thing that
// touches the filesystem for the ADO bridge: reads .task-memory.json,
// planning/tasks.md (or the configured task_file), planning/notes/ADO-*.md,
// and planning/.ado-sync.json; writes each atomically (write-temp-then-
// rename in the SAME directory) only after every ADO read has already
// succeeded — so a dead MCP server mid-pull can never leave a partial write
// (PLAN-ado.md §5.3 step 6).
//
// Usage:
//   ado-sync pull   [--dry-run] [--json] [--from-json <fixture.json>]
//   ado-sync push   [--dry-run] [--take-local <id>]... [--take-ado <id>]...
//                   [--only <id>]... [--json] [--from-json <fixture.json>]
//   ado-sync promote <TASK-id> [--link <n>] [--from-json <fixture.json>]
//   ado-sync status [--json]
//
// Exit codes: 0 ok · 1 unexpected error · 2 ADO unreachable (clean no-op) ·
// 3 conflicts pending · 4 partial remote failure (push landed some writes,
// then failed on others — see report.failed; re-run to retry only what's
// outstanding, since both the state compare and the comment-hash guards
// short-circuit already-landed work).
//
// --from-json is the documented manual-fallback escape hatch (D4): feed a
// createMockAdoClient()-shaped fixture (see src/sync/adoClient.js and
// tests/fixtures/ado/*.json) into the exact same engine, so if the real MCP
// SDK wiring misbehaves live, results gathered by hand still drive the same
// deterministic decision logic. Codex review finding #1: it is READ-ONLY —
// `pull`/`status` (and any command run with `--dry-run`) never touch real
// ADO state anyway, so feeding them fixture data is harmless. `push`/
// `promote` WITHOUT `--dry-run` are mutating: `--from-json` would make the
// engine believe fields/comments/work-items were written when nothing real
// happened, so it's rejected outright for those two (see
// validateFromJsonUsage below).

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { loadAdoConfig } from '../src/sync/config.js';
import { pull, push, promote } from '../src/sync/engine.js';
import { findBlocks, readField } from '../src/sync/board.js';
import { parseSyncState, serializeSyncState } from '../src/sync/syncState.js';
import { createMockAdoClient, AdoUnavailableError } from '../src/sync/adoClient.js';
import { setQuietLogging } from '../src/utils/markdown.js';
import { parseAnyId } from '../src/utils/taskId.js';

const CWD = process.cwd();
const CONFIG_PATH = join(CWD, '.task-memory.json');
const SYNC_STATE_PATH = join(CWD, 'planning', '.ado-sync.json');

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function loadRawConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`failed to parse .task-memory.json: ${err.message}`);
  }
}

function notesDirFor(rawConfig) {
  const planningDir = rawConfig.planning_dir || 'planning';
  return join(CWD, planningDir, 'notes');
}

// BUG A (found via live ADO test, TASK-019): this used to be a hand-rolled
// `/^(ADO-[1-9][0-9]*)\.md$/` that ONLY matched `ADO-<n>.md` — so
// `readNotesFiles` never loaded `TASK-*.md` notes files. `promote`'s
// `notesFiles[taskId]` (src/sync/engine.js) came back undefined for every
// single promotion, so `ensureNotesSkeleton` built a FRESH skeleton and the
// source task's real notes/context were silently dropped on the floor —
// verified live: a TASK-901.md with real content promoted to ADO-31.md and
// came out as a bare skeleton. Widened to accept BOTH `ADO-<n>.md` and any
// `TASK-<...>.md` (legacy `TASK-<n>` and namespaced `TASK-<PREFIX>-<n>`),
// reusing the id grammar from src/utils/taskId.js (parseAnyId) instead of a
// second hand-rolled regex, so this predicate can't drift out of sync with
// the rest of the codebase's id parsing. Exported so tests can exercise the
// predicate directly (no filesystem needed).
export function notesFileId(name) {
  if (!name.endsWith('.md')) return null;
  const parsed = parseAnyId(name.slice(0, -3));
  return parsed ? parsed.raw : null;
}

function readNotesFiles(dir) {
  const files = {};
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const id = notesFileId(name);
    if (id) files[id] = readFileSync(join(dir, name), 'utf8');
  }
  return files;
}

// Write-temp-then-rename in the SAME directory as the target — rename is
// atomic on the same filesystem, so a crash mid-write never leaves a
// half-written target file.
function writeAtomic(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmpPath, content, 'utf8');
  renameSync(tmpPath, filePath);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--json') args.json = true;
    else if (a === '--take-local') (args.takeLocal ??= []).push(argv[++i]);
    else if (a === '--take-ado') (args.takeAdo ??= []).push(argv[++i]);
    else if (a === '--only') (args.only ??= []).push(argv[++i]);
    else if (a === '--link') args.link = argv[++i];
    else if (a === '--from-json') args.fromJson = argv[++i];
    else if (a === '--file') args.file = argv[++i];
    else args._.push(a);
  }
  return args;
}

async function buildClient(args, config) {
  if (args.fromJson) {
    const fixturePath = resolve(CWD, args.fromJson);
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    return createMockAdoClient(fixture);
  }
  // Dynamic import: adoClientMcp.js (and @modelcontextprotocol/sdk) is only
  // ever loaded when actually needed — every --from-json path (all offline
  // tests) never touches it.
  const { createAdoClient } = await import('../src/sync/adoClientMcp.js');
  return createAdoClient(config);
}

// Never let a close()-time failure mask whatever error (or success) actually
// happened in the try block — e.g. an already-unreachable mock/MCP client
// throwing again on close() must not overwrite the original AdoUnavailableError.
async function safeClose(client) {
  try {
    await client.close?.();
  } catch {
    // ignore — closing a dead connection failing is expected and harmless
  }
}

function renderReport(label, report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`[ado-sync] ${label} report:`);
  console.log(JSON.stringify(report, null, 2));
}

async function cmdPull(args, config, taskFilePath, dir) {
  const client = await buildClient(args, config);
  try {
    const boardText = existsSync(taskFilePath) ? readFileSync(taskFilePath, 'utf8') : '';
    const notesFilesBefore = readNotesFiles(dir);
    const syncStateBefore = parseSyncState(existsSync(SYNC_STATE_PATH) ? readFileSync(SYNC_STATE_PATH, 'utf8') : '');

    const result = await pull({
      boardText,
      notesFiles: notesFilesBefore,
      syncState: syncStateBefore,
      config,
      client,
      today: todayStamp(),
    });

    renderReport('pull', result.report, args.json);

    if (args.dryRun) {
      console.log('[ado-sync] --dry-run: no files written.');
    } else {
      writeAtomic(taskFilePath, result.boardText);
      for (const [id, text] of Object.entries(result.notesFiles)) {
        if (notesFilesBefore[id] !== text) {
          writeAtomic(join(dir, `${id}.md`), text);
        }
      }
      writeAtomic(SYNC_STATE_PATH, serializeSyncState(result.syncState));
    }

    return result.report.conflicts.length > 0 ? 3 : 0;
  } finally {
    await safeClose(client);
  }
}

async function cmdPush(args, config, taskFilePath, dir) {
  const client = await buildClient(args, config);
  try {
    const boardText = existsSync(taskFilePath) ? readFileSync(taskFilePath, 'utf8') : '';
    const notesFiles = readNotesFiles(dir);
    const syncStateBefore = parseSyncState(existsSync(SYNC_STATE_PATH) ? readFileSync(SYNC_STATE_PATH, 'utf8') : '');

    const options = {
      dryRun: !!args.dryRun,
      takeLocal: args.takeLocal || [],
      takeAdo: args.takeAdo || [],
      onlyIds: args.only || [],
    };
    const result = await push({ boardText, notesFiles, syncState: syncStateBefore, config, client, options });

    renderReport('push', result.report, args.json);

    if (args.dryRun) {
      console.log('[ado-sync] --dry-run: no files written.');
    } else {
      if (result.changed) writeAtomic(taskFilePath, result.boardText);
      writeAtomic(SYNC_STATE_PATH, serializeSyncState(result.syncState));
    }

    return pushExitCode(result.report);
  } finally {
    await safeClose(client);
  }
}

// Codex review finding #4: a mid-push transport failure (or any other stage
// failure) after >=1 remote write may already have landed is neither "0 ok"
// nor "2 ADO unreachable, clean no-op" — it's a genuine partial success that
// needs a retry. Only report clean success (0) when nothing failed;
// conflicts (3) take priority over plain failures (4) since they need an
// explicit --take-local/--take-ado decision rather than a blind re-run.
//
// Pulled out as its own named, exported function (Fable review follow-up)
// so this mapping is directly unit-testable: engine.push's mid-push abort
// behavior itself is already covered by tests/test-sync.mjs's "push
// (finding #4)" case, but nothing exercised the 3-line decision cmdPush
// makes from that report. cmdPush can't easily be driven end-to-end here —
// a real (non-dry-run) `push` rejects `--from-json` (see
// validateFromJsonUsage) since it's a mutating command, and SYNC_STATE_PATH
// above is bound to `process.cwd()` at module-import time, so calling
// cmdPush directly from the test process would target THIS repo's real
// planning/.ado-sync.json — not a throwaway temp dir. Testing the pure
// mapping function directly gets the coverage without either hazard.
export function pushExitCode(report) {
  if (report.conflicts.length > 0) return 3;
  if (report.failed.length > 0) return 4;
  return 0;
}

// Coordinator follow-up (TASK-021 live check): every AdoUnavailableError
// used to print the same generic "...az login'ed?" wrapper, so a
// launcher-not-found failure (adoClientMcp.js's ENOENT/auto-detect-exhausted
// errors, tagged `.launcherNotFound = true`) still showed misleading auth
// text ABOVE its own correct message — a pnpm-only user with no npx saw "is
// the MCP server installed / az login'ed?" even though the process never
// started. Select the exit-2 stderr line here so it's independently
// unit-testable without spawning the CLI (which needs a real/mock ADO
// client wired all the way through main()).
export function adoUnavailableMessage(err) {
  if (err && err.launcherNotFound) {
    return `[ado-sync] ${err.message} — no changes made.`;
  }
  return (
    '[ado-sync] Azure DevOps unreachable (is the MCP server installed and are you `az login`\'ed?) — no changes made.' +
    `\n  ${err.message}`
  );
}

// Codex review finding #7: `--link` used a bare `parseInt`, which silently
// accepts garbage (`parseInt('abc') === NaN` but engine.js only checks
// `options.link` truthiness — NaN IS truthy — so a typo would fall through
// to `client.getWorkItem(NaN)`; `parseInt('0')` is falsy so `--link 0`
// silently fell through to CREATE instead of erroring; `parseInt('123junk')`
// silently links 123). Require the WHOLE argument to match a positive
// integer before any remote op or board mutation happens.
export const LINK_ID_RE = /^[1-9][0-9]*$/;

// Codex review finding #6 (cross-file crash-safety): sync-state is the
// durable commit marker and must be written LAST — and nothing that still
// holds the only copy of real data may be DELETED before that marker lands.
// The old notes file (`TASK-x.md`) is the one thing here that's actually
// being removed, so instead of unlinking it outright we rename it to a
// recoverable tmp path first (content preserved on disk either way), write
// sync-state, and only THEN best-effort-delete the tmp copy. A crash between
// the rename and the final cleanup unlink leaves a harmless orphaned
// `*.tmp-promoted-*` file — never data loss.
// (Residual limitation: a crash between the board write below and the notes
// rename can leave the board showing the new `ADO-<n>` heading with notes
// still under the old `TASK-x.md` name and no syncState entry yet —
// recoverable by hand [rename the notes file, re-run `status`] but not
// automatic; see docs/ADO-SYNC.md.)
//
// Deliberately pure filesystem logic with NO ADO client involved — kept
// separate from cmdPromote so this write-ordering/crash-safety behavior can
// be unit-tested directly (a hand-built or mock-client-derived `result`
// object plus fs-failure injection) without ever needing a real or even
// mock ADO client. promote()'s own DECISION logic (what goes into `result`)
// is covered separately in tests/test-sync.mjs via the mock client.
export function applyPromoteWrites(notesDir, taskFilePath, syncStatePath, oldTaskId, result) {
  writeAtomic(taskFilePath, result.boardText);
  for (const [id, text] of Object.entries(result.notesFiles)) {
    writeAtomic(join(notesDir, `${id}.md`), text);
  }
  const oldNotesPath = join(notesDir, `${oldTaskId}.md`);
  let tmpOldNotesPath = null;
  if (existsSync(oldNotesPath)) {
    tmpOldNotesPath = `${oldNotesPath}.tmp-promoted-${process.pid}-${Math.random().toString(36).slice(2)}`;
    renameSync(oldNotesPath, tmpOldNotesPath);
  }
  writeAtomic(syncStatePath, serializeSyncState(result.syncState));
  if (tmpOldNotesPath) {
    try {
      unlinkSync(tmpOldNotesPath);
    } catch {
      // Best-effort — an orphaned tmp file is harmless clutter, never data
      // loss; leave it for the user/next cleanup rather than fail the
      // (already-committed) promotion over it.
    }
  }
}

async function cmdPromote(args, config, taskFilePath, dir) {
  const taskId = args._[0];
  if (!taskId) {
    console.error('[ado-sync] usage: ado-sync promote <TASK-id> [--link <n>]');
    return 1;
  }
  if (args.link !== undefined && !LINK_ID_RE.test(args.link)) {
    console.error(`[ado-sync] --link must be a positive integer Azure DevOps work-item id, got "${args.link}"`);
    return 1;
  }

  const client = await buildClient(args, config);
  try {
    const boardText = existsSync(taskFilePath) ? readFileSync(taskFilePath, 'utf8') : '';
    const notesFiles = readNotesFiles(dir);
    const syncStateBefore = parseSyncState(existsSync(SYNC_STATE_PATH) ? readFileSync(SYNC_STATE_PATH, 'utf8') : '');

    const link = args.link !== undefined ? parseInt(args.link, 10) : undefined;
    const result = await promote({
      boardText,
      notesFiles,
      syncState: syncStateBefore,
      config,
      client,
      taskId,
      options: { link },
      today: todayStamp(),
    });

    renderReport('promote', result.report, args.json);
    applyPromoteWrites(dir, taskFilePath, SYNC_STATE_PATH, taskId, result);

    return 0;
  } finally {
    await safeClose(client);
  }
}

// Offline — no client at all. Compares the board's current Status field
// against what was recorded at the last successful pull/push, per task id.
// (Lint: `config` was an unused param — this command never needs the ado.*
// config, only the board text and sync-state file.)
function cmdStatus(args, taskFilePath) {
  const boardText = existsSync(taskFilePath) ? readFileSync(taskFilePath, 'utf8') : '';
  const syncState = parseSyncState(existsSync(SYNC_STATE_PATH) ? readFileSync(SYNC_STATE_PATH, 'utf8') : '');
  const blocks = findBlocks(boardText).filter((b) => b.kind === 'ado');

  const items = [];
  for (const b of blocks) {
    const entry = syncState.tasks?.[b.id];
    const localStatus = (readField(b.block, 'Status') || '').toLowerCase().trim();
    if (!entry) {
      items.push({ id: b.id, status: 'untracked', detail: 'no prior sync recorded' });
    } else if (entry.localStatus !== localStatus) {
      items.push({ id: b.id, status: 'local-drift', detail: `${entry.localStatus} -> ${localStatus} since last sync` });
    } else {
      items.push({ id: b.id, status: 'in-sync', detail: `as of ${entry.syncedAt}` });
    }
  }
  const boardIds = new Set(blocks.map((b) => b.id));
  for (const id of Object.keys(syncState.tasks || {})) {
    if (!boardIds.has(id)) {
      items.push({ id, status: 'orphaned-sync-state', detail: 'tracked in .ado-sync.json but not found on the board' });
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ items }, null, 2));
  } else {
    console.log('[ado-sync] status (offline — board vs last-known sync state):');
    if (items.length === 0) {
      console.log('  (no ADO-tracked cards)');
    } else {
      for (const it of items) console.log(`  ${it.id}: ${it.status} (${it.detail})`);
    }
  }
  return 0;
}

function printUsage() {
  console.log(`Usage: ado-sync <pull|push|promote|status> [options]

  pull    [--dry-run] [--json] [--from-json <fixture.json>]
  push    [--dry-run] [--take-local <id>]... [--take-ado <id>]... [--only <id>]... [--json] [--from-json <fixture.json>]
  promote <TASK-id> [--link <n>] [--from-json <fixture.json>]
  status  [--json]

--from-json is a READ-ONLY manual fallback (see the block comment at the top
of this file) — allowed for pull/status always, and for push only when
--dry-run is also passed. Rejected outright for a real (non-dry-run) push
and for promote (which has no dry-run form and always creates/links a real
work item).

Exit codes: 0 ok, 1 unexpected error, 2 ADO unreachable (clean no-op),
3 conflicts pending, 4 partial remote failure (some pushes landed, some
failed — re-run to retry only what's outstanding).`);
}

// Codex review finding #1: --from-json is a read-only escape hatch (D4) —
// it feeds fixture data into the SAME engine as a real MCP connection, so
// for a mutating command it would make push/promote believe real ADO writes
// happened when nothing did. Allowed for pull/status unconditionally (they
// only ever write LOCAL files, never ADO), and for push only in --dry-run
// mode (which by construction touches nothing real either). Rejected for
// promote entirely — it has no dry-run form; every promote call creates or
// links a genuine work item.
function validateFromJsonUsage(cmd, args) {
  if (!args.fromJson) return null;
  if (cmd === 'promote') {
    return (
      '--from-json cannot be used with `promote` — promote always creates or links a REAL Azure DevOps ' +
      'work item; there is no dry-run/simulated form. Gather MCP results by hand only for pull/status ' +
      '(see docs/ADO-SYNC.md "Manual fallback").'
    );
  }
  if (cmd === 'push' && !args.dryRun) {
    return (
      '--from-json cannot be used with `push` unless --dry-run is also passed — push is a mutating ' +
      'command and --from-json never touches real Azure DevOps, so a real push against fixture data ' +
      'would falsely report success. Use `push --dry-run --from-json <file>` to preview, or drop ' +
      '--from-json to push for real.'
    );
  }
  return null;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printUsage();
    return 0;
  }

  // Codex review finding #13: --json output must be JSON-only. markdown.js's
  // parseMarkdown/parseTask normally log human-readable progress for the
  // UI's dev console — silence them for the duration of this process when
  // --json was requested (UI behavior is untouched; this is a CLI-only,
  // process-lifetime toggle).
  if (args.json) setQuietLogging(true);

  const fromJsonError = validateFromJsonUsage(cmd, args);
  if (fromJsonError) {
    console.error(`[ado-sync] ${fromJsonError}`);
    return 1;
  }

  let rawConfig;
  try {
    rawConfig = loadRawConfig();
  } catch (err) {
    console.error(`[ado-sync] ${err.message}`);
    return 1;
  }

  const { notConfigured, ok, config, errors } = loadAdoConfig(rawConfig);
  if (notConfigured) {
    console.log('[ado-sync] ADO sync not configured (no "ado" block in .task-memory.json) — nothing to do.');
    return 0;
  }
  if (!ok) {
    console.error('[ado-sync] invalid "ado" config block:');
    for (const e of errors) console.error(`  - ${e}`);
    return 1;
  }

  const taskFilePath = join(CWD, config.taskFile);
  const dir = notesDirFor(rawConfig);

  try {
    switch (cmd) {
      case 'pull':
        return await cmdPull(args, config, taskFilePath, dir);
      case 'push':
        return await cmdPush(args, config, taskFilePath, dir);
      case 'promote':
        return await cmdPromote(args, config, taskFilePath, dir);
      case 'status':
        return cmdStatus(args, taskFilePath);
      default:
        console.error(`[ado-sync] unknown command "${cmd}"`);
        printUsage();
        return 1;
    }
  } catch (err) {
    if (err instanceof AdoUnavailableError) {
      console.error(adoUnavailableMessage(err));
      return 2;
    }
    console.error(`[ado-sync] error: ${err.message}`);
    return 1;
  }
}

// Only run main() when this file is executed directly (`node ado-sync.mjs
// ...` / the CLI entry point) — NOT when it's imported as a module (e.g.
// tests/test-sync.mjs importing applyPromoteWrites/LINK_ID_RE directly for
// offline, client-free unit tests). Without this guard, `import`-ing this
// file for its exports would itself invoke main() (and process.exit()),
// killing whatever imported it.
const isMainModule = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (isMainModule) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`[ado-sync] fatal: ${err.stack || err.message}`);
      process.exit(1);
    });
}
