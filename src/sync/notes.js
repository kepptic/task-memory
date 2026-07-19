// src/sync/notes.js — TASK-019 (Azure DevOps bridge)
//
// Pure string operations on a task's notes file body (planning/notes/*.md).
// Fs-free — the CLI reads/writes the file; this module only knows how to
// build the skeleton, find/replace top-level `## Heading` sections, append
// comments, and extract the two pieces engine.push needs: the local
// "context" (everything except ADO Comments + Summary) and the distilled
// `## Summary` section for the done-comment (D7).
//
// The skeleton mirrors hooks/task-memory-hook.py's _create_notes_skeleton()
// byte-for-byte (same section set) so a notes file created by ado-sync pull
// looks identical to one the hook would create for a plain TASK-* card.

export const ADO_COMMENTS_HEADING = 'ADO Comments';
export const SUMMARY_HEADING = 'Summary';
export const COMMENT_MARKER_PREFIX = '[task-memory]';

/**
 * Build the standard notes skeleton for a newly-tracked task id.
 * @param {string} id
 * @param {string} title
 * @param {string} today - YYYY-MM-DD
 */
export function buildNotesSkeleton(id, title, today) {
  return `# ${id} Notes — ${title}

_Created ${today}. Captures context that would otherwise be lost at session end or compaction._

## Summary

_One-paragraph answer to: what is this task doing and why?_

## Patterns Discovered

_Reusable techniques, "do this". Each bullet should be specific enough to apply without re-reading source material._

-

## Gotchas

_Pitfalls, "don't do this". Include the failure mode so the next session doesn't repeat it._

-

## Decisions

_Choices made and rationale. Format: \`Decision — reason\`._

-

## Resources

_Files, URLs, docs examined. One line each with a takeaway._

-

## Open Questions

_Things to verify, confirm, or ask about before finalizing._

-
`;
}

/**
 * Ensure a notes file has content — create the skeleton if `existingText` is
 * empty/missing, otherwise return it unchanged.
 * @returns {{ text: string, created: boolean }}
 */
export function ensureNotesSkeleton(existingText, id, title, today) {
  if (existingText && existingText.trim()) {
    return { text: existingText, created: false };
  }
  return { text: buildNotesSkeleton(id, title, today), created: true };
}

// Split into top-level ('## Heading') sections, in order. `preamble` is
// everything before the first '## ' heading (title line, timestamp blurb).
function splitTopSections(notesText) {
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  const matches = [...notesText.matchAll(re)];
  if (matches.length === 0) {
    return { preamble: notesText, sections: [] };
  }
  const preamble = notesText.slice(0, matches[0].index);
  const sections = matches.map((m, i) => {
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : notesText.length;
    return { heading: m[1].trim(), full: notesText.slice(start, end) };
  });
  return { preamble, sections };
}

function joinSections(preamble, sections) {
  return preamble + sections.map((s) => s.full).join('');
}

/**
 * Return the trimmed body of a top-level `## Heading` section (everything
 * after the heading line, up to the next top-level heading or EOF), or null
 * if the heading doesn't exist.
 */
export function getSection(notesText, headingText) {
  const { sections } = splitTopSections(notesText);
  const found = sections.find((s) => s.heading === headingText);
  if (!found) return null;
  const nl = found.full.indexOf('\n');
  return nl === -1 ? '' : found.full.slice(nl + 1).trim();
}

/**
 * Remove a top-level section entirely (heading + body). No-op if absent.
 */
export function removeSection(notesText, headingText) {
  const { preamble, sections } = splitTopSections(notesText);
  const kept = sections.filter((s) => s.heading !== headingText);
  return joinSections(preamble, kept);
}

/**
 * Append `addition` to the end of a top-level section's body, creating the
 * section at end-of-file if it doesn't exist yet. Surgical — every other
 * section's text is untouched.
 */
export function appendToSection(notesText, headingText, addition) {
  const { preamble, sections } = splitTopSections(notesText);
  const idx = sections.findIndex((s) => s.heading === headingText);

  if (idx === -1) {
    const trailer = notesText.endsWith('\n') ? '' : '\n';
    return notesText + trailer + `\n## ${headingText}\n\n${addition}\n`;
  }

  const section = sections[idx];
  const trimmedFull = section.full.replace(/\s*$/, '\n');
  const needsBlankLine = trimmedFull.endsWith('\n\n') ? '' : '\n';
  const newFull = `${trimmedFull}${needsBlankLine}${addition}\n\n`;
  const newSections = sections.slice();
  newSections[idx] = { ...section, full: newFull };
  return joinSections(preamble, newSections);
}

/**
 * Ensure the `## ADO Comments` section exists (created empty at EOF if
 * missing). Idempotent.
 */
export function ensureAdoCommentsSection(notesText) {
  if (getSection(notesText, ADO_COMMENTS_HEADING) !== null) return notesText;
  const trailer = notesText.endsWith('\n') ? '' : '\n';
  return notesText + trailer + `\n## ${ADO_COMMENTS_HEADING}\n\n`;
}

/**
 * Format one ADO comment as a blockquote:
 *   > **<author>** — <createdDate> (comment <id>)
 *   > <text line 1>
 *   > <text line 2...>
 */
export function formatComment(comment) {
  const body = (comment.text || '').split('\n').map((l) => `> ${l}`).join('\n');
  return `> **${comment.author}** — ${comment.createdDate} (comment ${comment.id})\n${body}`;
}

/**
 * Append comments (ascending order expected) to the `## ADO Comments`
 * section, skipping any comment whose text starts with the
 * `[task-memory]` marker (our own pushed comments — never re-imported).
 * Returns the updated notes text and the highest comment id actually
 * appended (for advancing lastCommentId), or null if nothing was appended.
 */
export function appendComments(notesText, comments) {
  const toAppend = (comments || []).filter(
    (c) => !(c.text || '').trimStart().startsWith(COMMENT_MARKER_PREFIX),
  );
  if (toAppend.length === 0) {
    return { text: notesText, appendedMaxId: null };
  }
  const addition = toAppend.map(formatComment).join('\n\n');
  const withSection = ensureAdoCommentsSection(notesText);
  const text = appendToSection(withSection, ADO_COMMENTS_HEADING, addition);
  const appendedMaxId = Math.max(...toAppend.map((c) => c.id));
  return { text, appendedMaxId };
}

// A line counts as skeleton boilerplate — and is ignored when deciding
// whether a notes file has any real content to push — if it's blank, a
// heading (`#`/`##`), an untouched instructional placeholder (the italic
// `_Reusable techniques…_` / `_Pitfalls…_` / etc. lines buildNotesSkeleton
// writes under every section), or an empty bullet stub (`-` with nothing
// after it). Matched by shape, not by exact string/length, so this stays
// robust to wording tweaks in buildNotesSkeleton and to legacy skeletons
// written by hooks/task-memory-hook.py's _create_notes_skeleton().
function isSkeletonBoilerplateLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith('#')) return true;
  if (/^_.*_$/.test(t)) return true;
  if (t === '-') return true;
  return false;
}

/**
 * Local "context" for push (D7 / §6.2 step 4): the notes file minus the
 * ADO Comments section minus the Summary section, trimmed.
 *
 * Rejects an untouched skeleton the same way extractSummary rejects a
 * placeholder-only Summary (Fable review B2): `pull` creates a full
 * Patterns/Gotchas/Decisions/Resources/Open Questions skeleton for every
 * newly-tracked item, and without this guard that boilerplate reads as
 * "real local context" — engine.push then posts it as a
 * `[task-memory] context update <hash>` comment on EVERY item on first
 * push (a 50-item sprint -> 50 junk comments in the shared ADO project).
 * Returns '' (falsy, same as "nothing to push") when every remaining line
 * is boilerplate; returns the full trimmed text (including headings)
 * as soon as ANY line has real content.
 */
export function extractContext(notesText) {
  let text = removeSection(notesText, ADO_COMMENTS_HEADING);
  text = removeSection(text, SUMMARY_HEADING);
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const hasRealContent = trimmed.split('\n').some((line) => !isSkeletonBoilerplateLine(line));
  return hasRealContent ? trimmed : '';
}

/**
 * The distilled `## Summary` section body, or null if absent/placeholder-only.
 * Rejects the untouched skeleton placeholder so an unfilled-in Summary
 * correctly reads as "missing" (push step 5's needs-summary report).
 */
export function extractSummary(notesText) {
  const body = getSection(notesText, SUMMARY_HEADING);
  if (!body) return null;
  const meaningful = body
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('_'))
    .join('\n')
    .trim();
  return meaningful ? meaningful : null;
}
