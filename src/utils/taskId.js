// Task ID grammar — single source of truth (TASK-017).
//
// Legacy ids (`TASK-676`) must stay valid forever. Prefixed ids
// (`TASK-GR-678`) namespace per-dev/per-file counters so two branches never
// mint the same id. This module owns ALL minting policy, header parsing, and
// serialization for the JS UI. The Python hook only widens its regexes to
// the same grammar (TASK_ID_CORE) — it never mints and never reads the
// per-file `Task Prefix:` header; keep the two in sync by hand if this file
// changes.
//
// TASK-019 added a second id kind, `ADO-<n>` (Azure DevOps work items —
// minted only by ADO, never by this codebase; see ADO_ID_CORE below). The
// Python hook mirrors the union of both kinds as `ANY_ID_CORE` wherever a
// heading/section boundary is recognized; keep that mirror in sync too.

// Embedded/core form: no capturing prefix/number groups (prefix group is
// non-capturing), tail-bounded so `TASK-GR-12X` can never parse as
// `TASK-GR-12`. Safe to splice into a larger regex.
export const TASK_ID_CORE = 'TASK-(?:[A-Z]{2,4}-)?[0-9]+(?![0-9A-Za-z])';

// Anchored parse form: g1 = prefix (undefined if none), g2 = numeric tail.
export const TASK_ID_RE = /^TASK-(?:([A-Z]{2,4})-)?([0-9]+)$/;

// Per-file config header. MULTILINE, line-anchored, horizontal whitespace
// only (`[ \t]`) so it can never cross lines. g1 = raw prefix text
// (undefined = field absent entirely; may be '' or garbage — validate AFTER
// matching, see resolvePrefix/Q2). g2 = counter (always present/valid).
export const CONFIG_HEADER_RE =
  /^[ \t]*<!--[ \t]*Config:[ \t]*(?:Task Prefix:[ \t]*([^|\r\n]*?)[ \t]*\|[ \t]*)?Last Task ID:[ \t]*([0-9]+)[ \t]*-->[ \t]*$/m;

/**
 * Derive a namespace prefix from a per-dev filename like `tasks-gr.md`.
 * Uppercasing here is derivation from a case-insensitive filesystem name
 * (mandated by the BRIEF's `tasks-gr.md` -> `GR` example), NOT normalization
 * of user-typed text — that distinction matters for Q2.
 * Returns '' if the filename doesn't match the pattern.
 */
export function prefixFromFileName(fileName) {
  if (!fileName) return '';
  const m = /^tasks[-_.]([A-Za-z]{2,4})\.md$/i.exec(fileName);
  return m ? m[1].toUpperCase() : '';
}

/**
 * Resolve the effective per-file prefix.
 *
 * Q2 semantics (present-but-invalid prefix is authoritative; no silent
 * uppercasing, no filename fallthrough):
 *  - rawField === undefined   -> field ABSENT -> derive from filename (or '').
 *  - rawField trims to a valid 2-4 uppercase-letter token -> use it verbatim.
 *  - anything else (empty, lowercase, wrong length, garbage) -> namespacing
 *    OFF ('' prefix), with a warning. Filename is NOT consulted in this case.
 *
 * @param {string|undefined} rawField - raw text captured by CONFIG_HEADER_RE g1.
 * @param {string|undefined} fileName - the file being parsed (fallback source).
 * @returns {{ prefix: string, warning: string|null }}
 */
export function resolvePrefix(rawField, fileName) {
  if (rawField === undefined) {
    return { prefix: prefixFromFileName(fileName), warning: null };
  }
  const trimmed = (rawField || '').trim();
  if (/^[A-Z]{2,4}$/.test(trimmed)) {
    return { prefix: trimmed, warning: null };
  }
  return {
    prefix: '',
    warning:
      `[task-memory] Invalid "Task Prefix" header value "${rawField}" — ` +
      'namespacing disabled for this file (legacy ids will be minted). ' +
      'Fix the header to 2-4 uppercase letters, e.g. ' +
      '"<!-- Config: Task Prefix: GR | Last Task ID: 0 -->".',
  };
}

/**
 * Parse a full task id string. Verbatim — never pads, never mutates.
 * @returns {{ prefix: string, num: number, raw: string } | null}
 */
export function parseTaskId(raw) {
  if (typeof raw !== 'string') return null;
  const m = TASK_ID_RE.exec(raw);
  if (!m) return null;
  return { prefix: m[1] || '', num: parseInt(m[2], 10), raw };
}

/**
 * Format a task id. Prefixed ids are NEVER zero-padded (`TASK-GR-1`, not
 * `TASK-GR-001`). Legacy (no-prefix) ids stay 3-digit padded for cosmetic
 * continuity with existing boards (`TASK-043`).
 */
export function formatTaskId(prefix, num) {
  if (prefix) return `TASK-${prefix}-${num}`;
  return `TASK-${String(num).padStart(3, '0')}`;
}

/**
 * Highest numeric tail among `ids` whose parsed prefix matches `prefix`
 * ('' for legacy scope). Ids with a different prefix, or that don't parse,
 * are ignored — this is a per-scope safety floor, not a global max.
 */
export function maxNumInScope(ids, prefix) {
  const scopePrefix = prefix || '';
  let max = 0;
  for (const id of ids || []) {
    const parsed = parseTaskId(id);
    if (!parsed || parsed.prefix !== scopePrefix) continue;
    if (parsed.num > max) max = parsed.num;
  }
  return max;
}

/**
 * Serialize the config header comment. Team form iff prefix is truthy,
 * otherwise the legacy form (byte-identical to today's output).
 */
export function serializeConfigHeader(prefix, lastId) {
  const id = lastId || 0;
  if (prefix) {
    return `<!-- Config: Task Prefix: ${prefix} | Last Task ID: ${id} -->`;
  }
  return `<!-- Config: Last Task ID: ${id} -->`;
}

/**
 * Mint the next task id for a scope. Pure — does NOT mutate `meta`; the
 * caller (App.jsx's handleSaveTask) is responsible for writing `nextNum`
 * back into its ref SYNCHRONOUSLY (before any state updater runs) so that
 * two rapid mints against the same ref reserve distinct numbers. Keeping
 * this function pure is what makes it independently testable — see
 * tests/test-ui.mjs section 4.
 *
 * @param {{ taskPrefix: string, lastTaskId: number }} meta - current
 *   per-file counter state (e.g. boardMetaRef.current).
 * @param {string[]} ids - existing task ids in scope (e.g. tasks.map(t => t.id)).
 * @returns {{ id: string, nextNum: number }}
 */
export function mintNextId(meta, ids) {
  const taskPrefix = meta.taskPrefix || '';
  const scopedMax = maxNumInScope(ids, taskPrefix);
  const nextNum = Math.max(meta.lastTaskId, scopedMax) + 1;
  const id = formatTaskId(taskPrefix, nextNum);
  return { id, nextNum };
}

// =============================================================================
// TASK-019: Azure DevOps id grammar (additions only — see module header).
//
// ADO ids are minted exclusively by Azure DevOps, never by this codebase.
// `mintNextId`/`maxNumInScope` stay TASK-only for free: `parseTaskId('ADO-12')`
// is `null` (unchanged code), so ADO ids are inherently invisible to minting.
// =============================================================================

// Embedded/core form, same shape discipline as TASK_ID_CORE: no capturing
// groups, tail-bounded so `ADO-12X` never parses as `ADO-12`. Leading zeros
// are rejected at the grammar level ([1-9][0-9]*) so one work item has
// exactly one valid spelling — `ADO-012` is plain text, not a task heading.
export const ADO_ID_CORE = 'ADO-[1-9][0-9]*(?![0-9A-Za-z])';

// Anchored parse form: g1 = numeric tail (no leading zeros).
export const ADO_ID_RE = /^ADO-([1-9][0-9]*)$/;

// Union used by heading/section regexes (markdown.js, and mirrored in the
// Python hook as ANY_ID_CORE). Each alternative carries its own tail
// lookahead, so the union is safe to splice exactly like TASK_ID_CORE.
export const ANY_ID_CORE = '(?:' + TASK_ID_CORE + '|' + ADO_ID_CORE + ')';

/**
 * Parse an ADO work-item id string. Verbatim — never pads, never mutates.
 * @returns {{ kind: 'ado', num: number, raw: string } | null}
 */
export function parseAdoId(raw) {
  if (typeof raw !== 'string') return null;
  const m = ADO_ID_RE.exec(raw);
  return m ? { kind: 'ado', num: parseInt(m[1], 10), raw } : null;
}

/**
 * Parse either id kind. Tries TASK first (existing behavior untouched), then
 * ADO. Returns null if neither matches.
 * @returns {{ kind: 'task', prefix: string, num: number, raw: string }
 *         | { kind: 'ado', num: number, raw: string } | null}
 */
export function parseAnyId(raw) {
  const t = parseTaskId(raw);
  if (t) return { kind: 'task', ...t };
  return parseAdoId(raw);
}

/**
 * Format an ADO work-item id. NEVER zero-padded — `ADO-12345`, not
 * `ADO-012345`.
 */
export function formatAdoId(num) {
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`invalid ADO id: ${num}`);
  }
  return `ADO-${num}`;
}
