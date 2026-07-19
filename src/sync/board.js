// src/sync/board.js — TASK-019 (Azure DevOps bridge)
//
// Surgical, anchored text operations on the tasks.md board text — the same
// philosophy as the Python hook's reorganize_tasks_file (see PLAN-ado.md
// D5): NEVER parseMarkdown -> generateMarkdown the whole file. Every
// function here takes/returns plain strings so the sync engine can operate
// on board text without ever touching the full parse/regenerate pipeline,
// which would reformat the entire file and risk dropping content the UI
// doesn't know about.
//
// Reuses ANY_ID_CORE (taskId.js) and deriveColumnId (markdown.js) so section
// attribution and heading recognition stay in lockstep with the UI/hook.

import { ANY_ID_CORE } from '../utils/taskId.js';
import { deriveColumnId } from '../utils/markdown.js';

const HEADING_RE = new RegExp('^###[ \\t]+(' + ANY_ID_CORE + ')[ \\t]*\\|[ \\t]*(.+)$', 'gm');
const NEXT_SECTION_SRC = '^(?:###[ \\t]+' + ANY_ID_CORE + '|##[ \\t])';
const SECTION_HEADING_RE = /^##[ \t]+(.+?)[ \t]*$/gm;

/**
 * Resolve a `## <header text>` section heading to its canonical column id,
 * preferring the CONFIGURED column's explicit id over a freshly-derived one
 * (Codex review finding #2). markdown.js's default/explicit column config
 * can give a column an id that does NOT equal `deriveColumnId(name)` — e.g.
 * the stock default column is `{ name: "📝 To Do", id: "todo" }`, but
 * `deriveColumnId("📝 To Do")` is `"to-do"`. Blindly re-deriving the id from
 * the header text (as this file used to) silently disagrees with the
 * configured id, so `insertBlock(boardText, 'todo', ...)` could never find
 * the existing "## To Do" section and would create a duplicate one at EOF.
 *
 * Matching is done by comparing CANONICAL NAMES (deriveColumnId of both the
 * header text and each configured column's name/originalHeader) — never by
 * comparing ids directly — because a hand-written explicit id
 * (`**Columns**: Waiting (blocked)`) is deliberately allowed to differ from
 * the derived form. Falls back to the raw derived id when no configured
 * column matches (ad-hoc/orphaned sections keep working exactly as before).
 *
 * @param {string} headerText - the `## ` heading's text (already trimmed)
 * @param {{id: string, name?: string, originalHeader?: string}[]} columns
 * @returns {string}
 */
export function resolveSectionId(headerText, columns = []) {
  const canonical = deriveColumnId(headerText);
  for (const col of columns || []) {
    const colCanonical = deriveColumnId(col.originalHeader || col.name || '');
    if (colCanonical === canonical) return col.id;
  }
  return canonical;
}

/**
 * @typedef {Object} Block
 * @property {string} id
 * @property {'ado'|'task'} kind
 * @property {string} title
 * @property {number} start   - index into boardText where the heading line begins
 * @property {number} end     - index into boardText where the block ends (exclusive)
 * @property {string} block   - boardText.slice(start, end) — heading line + body
 * @property {string|null} sectionId - canonical id of the nearest preceding '## ' heading
 */

/**
 * Find every `### <id> | <title>` block in the board text, bounded exactly
 * like the Python hook's NEXT_SECTION_RE: the next `### <any-id>` heading OR
 * the next `## ` section heading, whichever comes first.
 * @param {string} boardText
 * @param {{id: string, name?: string, originalHeader?: string}[]} [columns] -
 *   parsed column config (markdownParser.parseMarkdown(...).config.columns).
 *   Optional for backward compatibility, but callers that care about
 *   accurate `sectionId` attribution against a board with default/explicit
 *   column ids should always pass it (see resolveSectionId, finding #2).
 * @returns {Block[]}
 */
export function findBlocks(boardText, columns = []) {
  const headingMatches = [...boardText.matchAll(HEADING_RE)];
  const sectionHeadings = [...boardText.matchAll(SECTION_HEADING_RE)].map((m) => ({
    index: m.index,
    id: resolveSectionId(m[1].trim(), columns),
  }));

  const nextSectionRe = new RegExp(NEXT_SECTION_SRC, 'gm');

  return headingMatches.map((m) => {
    const start = m.index;
    const searchFrom = m.index + m[0].length;
    nextSectionRe.lastIndex = searchFrom;
    const nextMatch = nextSectionRe.exec(boardText);
    const end = nextMatch ? nextMatch.index : boardText.length;

    let sectionId = null;
    for (const s of sectionHeadings) {
      if (s.index > start) break;
      sectionId = s.id;
    }

    return {
      id: m[1],
      kind: m[1].startsWith('ADO-') ? 'ado' : 'task',
      title: m[2].trim(),
      start,
      end,
      block: boardText.slice(start, end),
      sectionId,
    };
  });
}

// Fields that conventionally cohabit one line, per generateMarkdown's
// template (src/utils/markdown.js). setField appends a missing field onto a
// sibling's line when one exists, rather than always creating a new line.
const FIELD_GROUPS = {
  Priority: ['Priority', 'Category', 'Status', 'Assigned'],
  Category: ['Priority', 'Category', 'Status', 'Assigned'],
  Status: ['Priority', 'Category', 'Status', 'Assigned'],
  Assigned: ['Priority', 'Category', 'Status', 'Assigned'],
  Sprint: ['Sprint', 'ADO'],
  ADO: ['Sprint', 'ADO'],
};

function fieldRegex(name) {
  // Value runs until the next ' | ' field separator, end of line, or EOF —
  // mirrors the read conventions already used across markdown.js. Group 2
  // is non-greedy with a lookahead (rather than consuming) any trailing
  // whitespace before the boundary, so setField's replacement span never
  // eats the space that separates the value from a following " | " — a
  // real bug in an earlier version of this function that silently
  // corrupted formatting (`2 | **Status**` -> `2| **Status**`) on every edit.
  //
  // Codex review (finding #9): the leading `(?:^|(?<=\| ))` anchor requires
  // the field marker to sit at the START of a metadata line or immediately
  // after the canonical ` | ` cohabitation separator — never mid-sentence.
  // Without it, a description/body paragraph that happens to mention e.g.
  // "**ADO**: see the ticket" in prose would be misread as the ADO metadata
  // field (and overwritten by setField, or used as an insertion anchor by
  // the sibling logic below). It's a zero-width lookbehind, so group
  // numbering for readField/setField (group 1 = "**Name**: ", group 2 =
  // value) is unchanged.
  return new RegExp('(?:^|(?<=\\| ))(\\*\\*' + name + '\\*\\*:[ \\t]*)([^|\\r\\n]*?)(?=[ \\t]*(?:\\||$))', 'm');
}

/**
 * Read a `**Name**: value` field from a block (or any text). Value is
 * trimmed; returns null if the field is absent.
 */
export function readField(block, name) {
  const m = block.match(fieldRegex(name));
  return m ? m[2].trim() : null;
}

/**
 * Set a `**Name**: value` field in a block, editing only that field's value
 * span if it already exists (rest of the line/block — including whatever
 * whitespace/separators surround the value — is byte-identical). If
 * absent, appends onto a sibling field's line (same FIELD_GROUPS
 * cohabitation as generateMarkdown), or — if no sibling exists either —
 * inserts a brand-new line immediately after the heading line.
 */
export function setField(block, name, value) {
  const existing = fieldRegex(name);
  const m = existing.exec(block);
  if (m) {
    // m[0] ends exactly at the end of the value (group 2) — the lookahead
    // is zero-width, so any trailing whitespace before '|'/EOL is left
    // untouched in `after`.
    const before = block.slice(0, m.index);
    const after = block.slice(m.index + m[0].length);
    return before + m[1] + value + after;
  }

  const group = FIELD_GROUPS[name] || [name];
  for (const sibling of group) {
    if (sibling === name) continue;
    // Same line-start/canonical-separator anchor as fieldRegex (finding
    // #9) — `(?:^|\| )` must immediately precede the sibling's marker, so a
    // prose line that happens to contain "**Sprint**:" mid-sentence is
    // never mistaken for the real metadata line and corrupted by an
    // appended " | **Name**: value".
    const sibRe = new RegExp('^([^\\r\\n]*?(?:^|\\| )\\*\\*' + sibling + '\\*\\*:[^\\r\\n]*)$', 'm');
    const sibMatch = sibRe.exec(block);
    if (sibMatch) {
      const lineStart = sibMatch.index;
      const lineEnd = lineStart + sibMatch[1].length;
      const newLine = `${sibMatch[1]} | **${name}**: ${value}`;
      return block.slice(0, lineStart) + newLine + block.slice(lineEnd);
    }
  }

  // No sibling present -> insert a new line right after the heading line.
  const headingLineEnd = block.indexOf('\n');
  const newLine = `**${name}**: ${value}\n`;
  if (headingLineEnd === -1) {
    return block + '\n' + newLine;
  }
  return block.slice(0, headingLineEnd + 1) + newLine + block.slice(headingLineEnd + 1);
}

/**
 * Rewrite a block's heading line (`### <id> | <title>`) in place within the
 * full board text. `blockRef` is one of findBlocks()'s returned objects.
 */
export function setHeading(boardText, blockRef, newId, newTitle) {
  return replaceBlockAt(boardText, blockRef, setBlockHeading(blockRef.block, newId, newTitle));
}

/**
 * Rewrite just the heading line of a standalone block string (the string
 * returned as `.block` by findBlocks — heading line + body). Pure,
 * operates without needing the surrounding board text; used by the sync
 * engine to build up a fully-edited block before splicing it back in once
 * via replaceBlockAt.
 */
export function setBlockHeading(blockText, newId, newTitle) {
  const lineEnd = blockText.indexOf('\n');
  const end = lineEnd === -1 ? blockText.length : lineEnd;
  return `### ${newId} | ${newTitle}` + blockText.slice(end);
}

/**
 * Splice a fully-edited block's text back into the board at the position
 * recorded by `blockRef` (from findBlocks). Everything outside
 * [blockRef.start, blockRef.end) is untouched.
 */
export function replaceBlockAt(boardText, blockRef, newBlockText) {
  return boardText.slice(0, blockRef.start) + newBlockText + boardText.slice(blockRef.end);
}

function titleCaseFromId(id) {
  return id
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Append `blockText` at the end of the `## ` section whose canonical id
 * (resolveSectionId — the CONFIGURED column id, not a blindly re-derived
 * one; see finding #2) matches `sectionId`. If no such section exists,
 * creates `## <Title Case>` at end-of-file and reports it (surgical — never
 * touches any other section).
 *
 * @param {string} boardText
 * @param {string} sectionId
 * @param {string} blockText - full block text INCLUDING its `### id | title` heading
 * @param {{id: string, name?: string, originalHeader?: string}[]} [columns] -
 *   parsed column config — used BOTH to match `sectionId` against existing
 *   `## ` headers (resolveSectionId) and for the display name when creating
 *   a missing section.
 * @returns {{ boardText: string, created: boolean, warning: string|null }}
 */
export function insertBlock(boardText, sectionId, blockText, columns = []) {
  const sections = [...boardText.matchAll(SECTION_HEADING_RE)].map((m) => ({
    index: m.index,
    matchEnd: m.index + m[0].length,
    name: m[1].trim(),
    id: resolveSectionId(m[1].trim(), columns),
  }));

  const ensuredBlockText = blockText.endsWith('\n') ? blockText : blockText + '\n';
  const targetPos = sections.findIndex((s) => s.id === sectionId);

  if (targetPos !== -1) {
    const nextSection = sections[targetPos + 1];
    const insertAt = nextSection ? nextSection.index : boardText.length;
    const before = boardText.slice(0, insertAt);
    const after = boardText.slice(insertAt);
    const sep = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    return {
      boardText: before + sep + ensuredBlockText + '\n' + after,
      created: false,
      warning: null,
    };
  }

  const columnEntry = columns.find((c) => c.id === sectionId);
  const title = (columnEntry && (columnEntry.name || columnEntry.originalHeader)) || titleCaseFromId(sectionId);
  const trailer = boardText.endsWith('\n') ? '' : '\n';
  const newSection = `${trailer}\n## ${title}\n\n${ensuredBlockText}\n`;
  return {
    boardText: boardText + newSection,
    created: true,
    warning: `[ado-sync] section "${sectionId}" not found on the board — created "## ${title}" at end of file`,
  };
}

/**
 * Build the standard text for a newly materialized ADO-synced block
 * (used by engine.pull when a work item isn't on the board yet). Template:
 * heading, meta line (Priority folded in | Status | Assigned),
 * Created: today, then a combined Sprint / ADO line. No Errors Log line —
 * the hook tolerates its absence.
 *
 * @param {{id:string, title:string, status:string, assignee?:string,
 *   priority?: string|number|null, sprint?: string, url?: string, today?: string}} opts
 */
export function newAdoBlockText({ id, title, status, assignee = '', priority = null, sprint = '', url = '', today = '' }) {
  const lines = [`### ${id} | ${title}`];

  let meta = '';
  if (priority !== null && priority !== undefined && priority !== '') {
    meta += `**Priority**: ${priority}`;
  }
  meta += (meta ? ' | ' : '') + `**Status**: ${status}`;
  if (assignee) meta += ` | **Assigned**: ${assignee}`;
  lines.push(meta);

  if (today) lines.push(`**Created**: ${today}`);

  let adoLine = '';
  if (sprint) adoLine += `**Sprint**: ${sprint}`;
  if (url) adoLine += (adoLine ? ' | ' : '') + `**ADO**: ${url}`;
  if (adoLine) lines.push(adoLine);

  return lines.join('\n') + '\n';
}
