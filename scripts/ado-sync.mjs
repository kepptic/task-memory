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
// 3 conflicts pending.
//
// --from-json is the documented manual-fallback escape hatch (D4): feed a
// createMockAdoClient()-shaped fixture (see src/sync/adoClient.js and
// tests/fixtures/ado/*.json) into the exact same engine, so if the real MCP
// SDK wiring misbehaves live, results gathered by hand still drive the same
// deterministic decision logic.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { loadAdoConfig } from '../src/sync/config.js';
import { pull, push, promote } from '../src/sync/engine.js';
import { findBlocks, readField } from '../src/sync/board.js';
import { parseSyncState, serializeSyncState } from '../src/sync/syncState.js';
import { createMockAdoClient, AdoUnavailableError } from '../src/sync/adoClient.js';

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

const ADO_NOTES_FILE_RE = /^(ADO-[1-9][0-9]*)\.md$/;

function readNotesFiles(dir) {
  const files = {};
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const m = ADO_NOTES_FILE_RE.exec(name);
    if (m) files[m[1]] = readFileSync(join(dir, name), 'utf8');
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

    return result.report.conflicts.length > 0 ? 3 : 0;
  } finally {
    await safeClose(client);
  }
}

async function cmdPromote(args, config, taskFilePath, dir) {
  const taskId = args._[0];
  if (!taskId) {
    console.error('[ado-sync] usage: ado-sync promote <TASK-id> [--link <n>]');
    return 1;
  }

  const client = await buildClient(args, config);
  try {
    const boardText = existsSync(taskFilePath) ? readFileSync(taskFilePath, 'utf8') : '';
    const notesFiles = readNotesFiles(dir);
    const syncStateBefore = parseSyncState(existsSync(SYNC_STATE_PATH) ? readFileSync(SYNC_STATE_PATH, 'utf8') : '');

    const link = args.link ? parseInt(args.link, 10) : undefined;
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

    writeAtomic(taskFilePath, result.boardText);
    for (const [id, text] of Object.entries(result.notesFiles)) {
      writeAtomic(join(dir, `${id}.md`), text);
    }
    const oldNotesPath = join(dir, `${taskId}.md`);
    if (existsSync(oldNotesPath)) unlinkSync(oldNotesPath);
    writeAtomic(SYNC_STATE_PATH, serializeSyncState(result.syncState));

    return 0;
  } finally {
    await safeClose(client);
  }
}

// Offline — no client at all. Compares the board's current Status field
// against what was recorded at the last successful pull/push, per task id.
function cmdStatus(args, config, taskFilePath) {
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

Exit codes: 0 ok, 1 unexpected error, 2 ADO unreachable (clean no-op), 3 conflicts pending.`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printUsage();
    return 0;
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
        return cmdStatus(args, config, taskFilePath);
      default:
        console.error(`[ado-sync] unknown command "${cmd}"`);
        printUsage();
        return 1;
    }
  } catch (err) {
    if (err instanceof AdoUnavailableError) {
      console.error(
        '[ado-sync] Azure DevOps unreachable (is the MCP server installed and are you `az login`\'ed?) — no changes made.',
      );
      console.error(`  ${err.message}`);
      return 2;
    }
    console.error(`[ado-sync] error: ${err.message}`);
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`[ado-sync] fatal: ${err.stack || err.message}`);
    process.exit(1);
  });
