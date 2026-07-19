// test-watcher.mjs — node:test regression suite for the file-watcher rebind
// bug (TASK-018): switching task files in the UI never rebound the polling
// interval to the new file, so external edits to the newly-selected file
// went undetected while edits to the OLD file could still fire callbacks
// against the switched-to board.
//
// Run with: node tests/test-watcher.mjs
//
// This exercises src/utils/fileWatcher.js directly (no browser needed) by
// stubbing the global setInterval/clearInterval so ticks can be driven
// manually and the set of currently-active intervals can be inspected,
// without changing any runtime behavior of fileWatcher.js itself.

import test from 'node:test';
import assert from 'node:assert/strict';

import { fileWatcher } from '../src/utils/fileWatcher.js';

// -----------------------------------------------------------------------
// Fake timer harness: intercepts setInterval/clearInterval so we can (a)
// count how many intervals are currently "active" (proving no leaks) and
// (b) fire a tick synchronously on demand instead of waiting 2 real
// seconds. fileWatcher.js itself is untouched — it just calls the global
// functions, which we swap out for the duration of the test.
// -----------------------------------------------------------------------
function installFakeIntervalTimers() {
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;

  let nextId = 1;
  const active = new Map(); // id -> callback

  globalThis.setInterval = (fn) => {
    const id = nextId++;
    active.set(id, fn);
    return id;
  };
  globalThis.clearInterval = (id) => {
    active.delete(id);
  };

  return {
    active,
    // Runs every currently-registered interval callback once, awaiting it
    // (checkForExternalChanges is async).
    tick: async () => {
      for (const fn of [...active.values()]) {
        await fn();
      }
    },
    restore: () => {
      globalThis.setInterval = realSetInterval;
      globalThis.clearInterval = realClearInterval;
    },
  };
}

// A minimal fake File System Access API handle: getFile() resolves to an
// object exposing lastModified + text(), matching what checkForExternalChanges
// reads. mtime/content are read via getters so a test can mutate the
// "file on disk" out from under an already-bound watcher.
function makeFakeHandle(name, getMtime, getContent) {
  let callCount = 0;
  return {
    name,
    get callCount() {
      return callCount;
    },
    async getFile() {
      callCount++;
      const mtime = getMtime();
      const content = getContent();
      return {
        lastModified: mtime,
        async text() {
          return content;
        },
      };
    },
  };
}

// node:test runs top-level test() calls concurrently by default. fileWatcher
// is a module-level singleton (shared interval/content/hash state), so the
// two tests below MUST run sequentially or one's startFileWatcher/
// stopFileWatcher calls will race the other's. Awaiting each test() call in
// turn enforces that ordering.

await test('startFileWatcher rebinds to a new handle: no leaked interval, old handle stops being polled, new handle\'s changes are detected', async (t) => {
  const timers = installFakeIntervalTimers();
  t.after(() => timers.restore());

  fileWatcher.resetState();

  let mtimeA = 1000;
  let contentA = 'file-A-v1';
  const handleA = makeFakeHandle('A', () => mtimeA, () => contentA);

  let mtimeB = 2000;
  let contentB = 'file-B-v1';
  const handleB = makeFakeHandle('B', () => mtimeB, () => contentB);

  const eventsA = [];
  const eventsB = [];

  // --- Bind to file A -----------------------------------------------
  await fileWatcher.setCurrentContent(contentA);
  fileWatcher.startFileWatcher(handleA, {
    onExternalChange: (content) => eventsA.push(content),
  });

  assert.equal(timers.active.size, 1, 'exactly one interval after first start');

  // First tick just establishes the polling baseline for A (no callback).
  await timers.tick();
  assert.equal(handleA.callCount, 1, 'handle A was polled');
  assert.equal(handleB.callCount, 0, 'handle B not touched yet');
  assert.equal(eventsA.length, 0, 'baseline tick does not fire a change event');

  // --- Switch to file B (this is what handleSwitchTaskFile now does) -
  await fileWatcher.setCurrentContent(contentB);
  fileWatcher.startFileWatcher(handleB, {
    onExternalChange: (content) => eventsB.push(content),
  });

  assert.equal(
    timers.active.size,
    1,
    'rebind must leave exactly ONE active interval (no leak from the old A-bound interval)'
  );

  // Mutate the OLD file (A) after the rebind — a real external edit to the
  // file the UI is no longer looking at. Before the TASK-018 fix, the
  // original interval (still bound to A via startFileWatcher's silent
  // no-op) would have kept polling A and could have fired A's callback
  // onto the now-switched-to board.
  mtimeA = 5000;
  contentA = 'file-A-v2-EDITED-AFTER-SWITCH';

  await timers.tick();
  assert.equal(handleA.callCount, 1, 'handle A must NOT be polled again after rebind');
  assert.equal(handleB.callCount, 1, 'handle B must be polled after rebind');
  assert.equal(eventsA.length, 0, 'A\'s callback must never fire after rebind');
  // This tick on B is B's own baseline-establishing poll (lastCheckedModified
  // was reset by startFileWatcher's rebind), so no change event yet either.
  assert.equal(eventsB.length, 0);

  // --- A real external edit to the NEW file (B) must now be detected -
  mtimeB = 9999;
  contentB = 'file-B-v2-external-edit';

  await timers.tick();
  assert.equal(handleB.callCount, 2);
  assert.equal(eventsB.length, 1, 'external change to the newly-bound file is detected');
  assert.equal(eventsB[0], 'file-B-v2-external-edit');
  assert.equal(eventsA.length, 0, 'old file callback still never fires');

  // --- stopFileWatcher clears the interval ---------------------------
  fileWatcher.stopFileWatcher();
  assert.equal(timers.active.size, 0, 'stopFileWatcher leaves no active interval');

  // --- Starting again after a stop works ------------------------------
  await fileWatcher.setCurrentContent(contentB);
  fileWatcher.startFileWatcher(handleB, {
    onExternalChange: (content) => eventsB.push(content),
  });
  assert.equal(timers.active.size, 1, 'restart after stop creates exactly one interval');

  fileWatcher.stopFileWatcher();
  assert.equal(timers.active.size, 0);

  fileWatcher.resetState();
});

await test('startFileWatcher called twice in a row without an intervening stop still yields exactly one interval', async (t) => {
  const timers = installFakeIntervalTimers();
  t.after(() => timers.restore());

  fileWatcher.resetState();

  const handle1 = makeFakeHandle('1', () => 1, () => 'x');
  const handle2 = makeFakeHandle('2', () => 2, () => 'y');
  const handle3 = makeFakeHandle('3', () => 3, () => 'z');

  fileWatcher.startFileWatcher(handle1, {});
  fileWatcher.startFileWatcher(handle2, {});
  fileWatcher.startFileWatcher(handle3, {});

  assert.equal(
    timers.active.size,
    1,
    'three rapid rebinds (e.g. fast repeated switching) must never leak intervals'
  );

  fileWatcher.stopFileWatcher();
  assert.equal(timers.active.size, 0);
  fileWatcher.resetState();
});
