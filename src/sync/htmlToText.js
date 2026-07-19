// src/sync/htmlToText.js — TASK-019 (Azure DevOps bridge)
//
// ADO work-item comments arrive as HTML (System.History / discussion field).
// This is a MINIMAL, dependency-free HTML -> text converter, good enough for
// rendering a comment into a markdown notes file. It is not a general HTML
// sanitizer/renderer — just enough to make ADO comment bodies readable as
// plain text. Used by adoClientMcp.js (to normalize listComments() output)
// and by notes.js (when formatting comments into the notes file).

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

const ENTITY_RE = /&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g;

/**
 * Convert a (possibly HTML) string into plain text:
 *  - `<br>`/`<br/>`, `</p>`, `</div>` become newlines (before tag stripping,
 *    so paragraph/line breaks are preserved).
 *  - All other tags are removed.
 *  - Named entities are decoded: &amp; &lt; &gt; &quot; &#39; &nbsp;
 *  - Runs of 3+ blank lines collapse to a single blank line; result is trimmed.
 * Plain text with no markup passes through unchanged (aside from trimming).
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  if (!html) return '';
  let text = String(html);

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|li)\s*>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(ENTITY_RE, (m) => ENTITIES[m]);
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
