#!/usr/bin/env python3
"""
task-memory-hook.py - Unified hook for task-memory plugin.

Handles all Claude Code hook events:
- SessionStart / PostCompact: Display current task context
- PreToolUse: Refresh context (Write/Edit/Task)
- PostToolUse: Research logging (WebFetch/WebSearch), TodoWrite mirror, error logging
- PreCompact: Dump task + TodoWrite state to a notes snapshot before compaction
- Stop / SubagentStop: Verify task completion (may block)
- SessionEnd: Flush state, never block

https://github.com/kepptic/task-memory | MIT License

Dependencies: Python 3.11+ stdlib only.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


# =============================================================================
# Configuration
# =============================================================================

PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
STATE_DIR = PROJECT_DIR / ".claude" / "state" / "task-memory"
RESEARCH_COUNTER = STATE_DIR / "research-count"
PROGRESS_COUNTER = STATE_DIR / "progress-count"


def state_path(name: str) -> Path:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / name


def _load_config() -> dict:
    """Read .task-memory.json from project root (empty dict on any error)."""
    config_file = PROJECT_DIR / ".task-memory.json"
    if config_file.is_file():
        try:
            cfg = json.loads(config_file.read_text())
            if isinstance(cfg, dict):
                return cfg
        except (json.JSONDecodeError, OSError):
            pass
    return {}


CONFIG = _load_config()


def find_planning_dir() -> Path:
    """Locate planning dir: config -> nearest ancestor -> project root."""
    planning = CONFIG.get("planning_dir")
    if planning:
        p = Path(planning)
        return p if p.is_absolute() else (PROJECT_DIR / p)

    cwd = Path(os.environ.get("PWD", str(PROJECT_DIR)))
    try:
        cwd = cwd.resolve()
        root = PROJECT_DIR.resolve()
    except OSError:
        root = PROJECT_DIR

    cur = cwd
    while cur != cur.parent and str(cur).startswith(str(root)):
        candidate = cur / "planning"
        if candidate.is_dir() and (candidate / "tasks.md").is_file():
            return candidate
        cur = cur.parent

    return PROJECT_DIR / "planning"


PLANNING_DIR = find_planning_dir()
TASKS_FILE = PLANNING_DIR / "tasks.md"
NOTES_DIR = PLANNING_DIR / "notes"

# Multi-file mode: if task_files_glob is set, discover all matching tasks files
# relative to PROJECT_DIR. Single-file mode keeps existing behavior.
TASK_FILES_GLOB: str = (CONFIG.get("task_files_glob") or "").strip()


def task_files() -> list[Path]:
    """Return the list of task files to operate on.

    Multi-file mode (config has `task_files_glob`): glob the pattern against
    PROJECT_DIR and return existing, non-empty files sorted deterministically.

    Single-file mode (default): return [TASKS_FILE] if it exists, else [].
    """
    if TASK_FILES_GLOB:
        try:
            files = sorted(PROJECT_DIR.glob(TASK_FILES_GLOB))
        except (OSError, ValueError):
            return []
        return [f for f in files if f.is_file()]
    return [TASKS_FILE] if TASKS_FILE.is_file() else []


def primary_task_file() -> Path:
    """The write target for TodoWrite mirror and other single-file operations.

    Config can override with `todowrite_mirror_file` (relative to PROJECT_DIR).
    Otherwise: first task file in multi-file mode, or TASKS_FILE default.
    """
    override = (CONFIG.get("todowrite_mirror_file") or "").strip()
    if override:
        p = Path(override)
        return p if p.is_absolute() else (PROJECT_DIR / p)
    files = task_files()
    if files:
        return files[0]
    return TASKS_FILE


def _label_for(path: Path) -> str:
    """Human-readable label for a task file (parent dir name in multi-file mode)."""
    if TASK_FILES_GLOB:
        return path.parent.name
    return ""


# =============================================================================
# Session tracking
# =============================================================================

def session_task_file(session_id: str) -> Path:
    return state_path(f"session-{session_id}.txt")


def record_session_task(session_id: str, task_id: str) -> None:
    if not (session_id and task_id):
        return
    f = session_task_file(session_id)
    existing = f.read_text().splitlines() if f.exists() else []
    if task_id not in existing:
        with f.open("a") as fh:
            fh.write(task_id + "\n")


def was_task_worked_on(session_id: str, task_id: str) -> bool:
    if not (session_id and task_id):
        return False
    f = session_task_file(session_id)
    if not f.exists():
        return False
    return task_id in f.read_text().splitlines()


# -----------------------------------------------------------------------------
# Relevance gating (v3.3.0): only stamp the session as "worked on" the task
# when tool use actually touches task-adjacent files or mentions the task id.
# Prior behavior stamped on any Bash/Edit/Write/Task call, which contaminated
# unrelated sessions (e.g. asking a question while a task was in-progress).
# -----------------------------------------------------------------------------

# Off-topic escape: if this file exists, skip all stamping / Stop blocking for
# the session. The assistant can touch it when it recognizes the current work
# is unrelated to the active task. Cleared by SessionEnd.
def off_topic_flag_path(session_id: str) -> Path:
    return state_path(f"off-topic-{session_id}.flag")


def is_off_topic(session_id: str) -> bool:
    if not session_id:
        return False
    return off_topic_flag_path(session_id).exists()


# Force-stamp override for parity with pre-3.3 behavior. Rarely needed — the
# default relevance gate is conservative; set TASK_MEMORY_FORCE_STAMP=1 if a
# custom workflow needs the old blanket semantics.
def _force_stamp() -> bool:
    return os.environ.get("TASK_MEMORY_FORCE_STAMP", "").strip() in ("1", "true", "yes")


def _paths_mentioned_in_block(block: str) -> set[str]:
    """Extract bare file paths mentioned in a task block's body.

    Matches bullets like `- foo/bar.py`, inline `path/to/file.ts`, and code-
    span `` `src/foo.js` ``. Directory-only mentions (ending in `/`) are
    dropped — too coarse to be useful for relevance gating.
    """
    paths: set[str] = set()
    # Inline code spans: `...`
    for m in re.finditer(r"`([^`\n]+\.[A-Za-z0-9_]{1,10})`", block):
        paths.add(m.group(1).strip())
    # Bare paths: contains a slash and a dot-extension, non-whitespace run
    for m in re.finditer(r"(?:(?<=\s)|^)([A-Za-z0-9_./\\-]+\.[A-Za-z0-9_]{1,10})\b", block):
        candidate = m.group(1).strip()
        # Filter out obvious non-paths: pure numbers (3.14), email-like (a@b.c)
        if any(c in candidate for c in ("@",)):
            continue
        if "/" in candidate or "\\" in candidate:
            paths.add(candidate)
    return paths


def _resolve_path_str(p: str) -> Path | None:
    try:
        candidate = Path(p)
        if not candidate.is_absolute():
            candidate = PROJECT_DIR / candidate
        return candidate.resolve()
    except (OSError, ValueError):
        return None


def tool_use_touches_task(tool_name: str, tool_input: dict, task: dict) -> bool:
    """Return True iff this tool use is plausibly related to the given task.

    Heuristics (any match is enough):
      1. Tool input references the tasks.md or notes/TASK-XXX.md file directly.
      2. Tool input file_path resolves to a path mentioned in the task block.
      3. Bash command or Task agent prompt mentions the task id string.
      4. Write/Edit new_string or old_string mentions the task id.

    Read/Grep/Glob/LS never count — those are exploration, not work-on-task.
    """
    if not task:
        return False
    task_id = task.get("task_id", "")
    block = task.get("block", "") or ""

    # Scope by tool type: only "work" tools can stamp.
    if tool_name not in ("Write", "Edit", "Bash", "Task"):
        return False

    file_path = (tool_input.get("file_path") or tool_input.get("path") or "").strip()
    edited = _resolve_path_str(file_path) if file_path else None

    # (1) tasks.md itself
    if edited:
        for tf in task_files():
            try:
                if tf.resolve() == edited:
                    return True
            except OSError:
                continue
        # (1b) notes file for this task
        try:
            if edited == (NOTES_DIR / f"{task_id}.md").resolve():
                return True
        except OSError:
            pass

    # (2) path mentioned in task block body
    if edited:
        for raw in _paths_mentioned_in_block(block):
            resolved = _resolve_path_str(raw)
            if resolved and resolved == edited:
                return True

    # (3) task id in Bash command or Task prompt
    if task_id:
        if tool_name == "Bash":
            if task_id in (tool_input.get("command") or ""):
                return True
        elif tool_name == "Task":
            if task_id in (tool_input.get("prompt") or ""):
                return True
            if task_id in (tool_input.get("description") or ""):
                return True

    # (4) task id in Edit/Write content
    if task_id and tool_name in ("Write", "Edit"):
        for key in ("new_string", "old_string", "content"):
            if task_id in (tool_input.get(key) or ""):
                return True

    return False


# -----------------------------------------------------------------------------
# Engagement tracking (v3.3.0): count relevant tool uses per session+task so
# the Stop hook can distinguish "answered a question while task was open" from
# "actually worked on the task." Short engagements get a stderr warning; only
# sustained engagement can block Stop.
# -----------------------------------------------------------------------------

MIN_ENGAGEMENTS_TO_BLOCK = int(CONFIG.get("min_engagements_to_block") or 3)


def engagement_counter_path(session_id: str, task_id: str) -> Path:
    return state_path(f"engagement-{session_id}-{task_id}.txt")


def bump_engagement(session_id: str, task_id: str) -> int:
    if not (session_id and task_id):
        return 0
    f = engagement_counter_path(session_id, task_id)
    n = 0
    if f.exists():
        try:
            n = int(f.read_text().strip() or "0")
        except (ValueError, OSError):
            n = 0
    try:
        f.write_text(str(n + 1))
    except OSError:
        pass
    return n + 1


def get_engagement(session_id: str, task_id: str) -> int:
    if not (session_id and task_id):
        return 0
    f = engagement_counter_path(session_id, task_id)
    if not f.exists():
        return 0
    try:
        return int(f.read_text().strip() or "0")
    except (ValueError, OSError):
        return 0


# -----------------------------------------------------------------------------
# Sticky release (v3.3.0): after MAX_STOP_BLOCKS consecutive Stop blocks, write
# a release flag so the hook does not re-nag for the same session+task combo.
# Flag is cleared by SessionEnd or any subtask/status change.
# -----------------------------------------------------------------------------

def released_flag_path(session_id: str, task_id: str) -> Path:
    return state_path(f"released-{session_id}-{task_id}.flag")


def is_released(session_id: str, task_id: str) -> bool:
    if not (session_id and task_id):
        return False
    return released_flag_path(session_id, task_id).exists()


def mark_released(session_id: str, task_id: str) -> None:
    if not (session_id and task_id):
        return
    try:
        released_flag_path(session_id, task_id).write_text(
            datetime.now(timezone.utc).isoformat()
        )
    except OSError:
        pass


# -----------------------------------------------------------------------------
# GC of stale session state. SessionEnd does not always fire (crashes, forced
# exits), so session-*.txt and friends accumulate. Runs on SessionStart.
# -----------------------------------------------------------------------------

SESSION_STATE_MAX_AGE_HOURS = int(CONFIG.get("session_state_max_age_hours") or 24)


def gc_stale_session_state() -> None:
    cutoff = time.time() - (SESSION_STATE_MAX_AGE_HOURS * 3600)
    if not STATE_DIR.exists():
        return
    prefixes = ("session-", "stop-blocks-", "released-", "engagement-", "off-topic-")
    for p in STATE_DIR.iterdir():
        if not any(p.name.startswith(prefix) for prefix in prefixes):
            continue
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except OSError:
            pass


# =============================================================================
# Counters
# =============================================================================

def get_counter(f: Path) -> int:
    try:
        return int(f.read_text().strip() or "0")
    except (OSError, ValueError):
        return 0


def increment_counter(f: Path) -> int:
    f.parent.mkdir(parents=True, exist_ok=True)
    n = get_counter(f) + 1
    f.write_text(str(n))
    return n


# =============================================================================
# Tasks file parsing
# =============================================================================

# TASK-017: widened to accept optional 2-4 uppercase-letter dev/team-initials
# namespace prefixes (`TASK-GR-678`) alongside legacy unprefixed ids
# (`TASK-676`, valid forever). Inner prefix group is non-capturing and the
# tail is boundary-locked so `TASK-GR-12X` is correctly NOT a task id. Must
# stay in lockstep with the JS grammar in src/utils/taskId.js (TASK_ID_CORE) —
# the hook never mints ids or reads the per-file prefix header, it only
# parses this shape everywhere a task id can appear.
TASK_ID_CORE = r"TASK-(?:[A-Z]{2,4}-)?[0-9]+(?![0-9A-Za-z])"

# TASK-019: Azure DevOps work-item ids (`ADO-12345`). Minted only by ADO,
# never by this codebase — this hook only ever recognizes the shape. Leading
# zeros are rejected ([1-9][0-9]*) so `ADO-012` is plain text, same treatment
# as a malformed `TASK-GR-12X` id. Mirrors src/utils/taskId.js ADO_ID_CORE.
ADO_ID_CORE = r"ADO-[1-9][0-9]*(?![0-9A-Za-z])"

# Union of both id kinds. Mirrors src/utils/taskId.js ANY_ID_CORE — every
# heading/section-boundary regex in this file keys off this union so `###
# ADO-<n>` blocks get identical treatment to `### TASK-*` blocks (note
# routing, precompact snapshots, Stop-gate, stamping, reorganize-by-Status,
# TodoWrite mirror all fall out of this one change; see PLAN-ado.md §3.1).
ANY_ID_CORE = r"(?:" + TASK_ID_CORE + r"|" + ADO_ID_CORE + r")"

TASK_HEADING_RE = re.compile(r"^### (" + ANY_ID_CORE + r")(.*)$", re.MULTILINE)


def read_tasks(path: Path | None = None) -> str:
    """Read a task file. Defaults to the primary/single TASKS_FILE.

    In multi-file mode, callers should pass an explicit path.
    """
    target = path if path is not None else TASKS_FILE
    if not target.is_file():
        return ""
    try:
        return target.read_text()
    except OSError:
        return ""


NEXT_SECTION_RE = re.compile(r"^(?:### " + ANY_ID_CORE + r"|## )", re.MULTILINE)


def _iter_task_blocks(content: str):
    """Yield (task_id, heading_line, block_text) for each ### TASK-* block.

    Block ends at the next ### TASK-* heading OR the next ## heading, whichever
    comes first — so top-level sections like `## From TodoWrite` don't get
    absorbed into the trailing task's block.
    """
    matches = list(TASK_HEADING_RE.finditer(content))
    for i, m in enumerate(matches):
        start = m.start()
        # Find nearest section boundary after the heading line.
        search_from = m.end()
        nxt = NEXT_SECTION_RE.search(content, search_from)
        end = nxt.start() if nxt else len(content)
        block = content[start:end]
        heading = m.group(0)
        yield m.group(1), heading, block


SECTION_HEADING_RE = re.compile(r"^##[ \t]+(.+?)[ \t]*$", re.MULTILINE)

# Emoji + symbol ranges to strip when computing canonical column IDs.
# Mirrors src/utils/markdown.js:214 deriveColumnId(). Keeping the table in sync
# with the HTML app means both reorganizers (hook and browser) agree on which
# section a task belongs to — same column config, same answers.
_EMOJI_RANGES = (
    (0x1F300, 0x1F9FF),
    (0x2600, 0x26FF),
    (0x2700, 0x27BF),
    (0x1F000, 0x1F02F),
    (0x1F0A0, 0x1F0FF),
    (0x2300, 0x23FF),
    (0x2B00, 0x2BFF),
    (0x2300, 0x23FF),
)


def _strip_emoji(s: str) -> str:
    return "".join(ch for ch in s if not any(lo <= ord(ch) <= hi for lo, hi in _EMOJI_RANGES))


def derive_column_id(name: str) -> str:
    """Port of src/utils/markdown.js:214 deriveColumnId().

    "📝 To Do" -> "to-do"
    "To Do"    -> "to-do"
    "🚀 In Progress" -> "in-progress"
    """
    if not name:
        return "column"
    s = _strip_emoji(name)
    # Keep word chars, whitespace, hyphens; drop everything else
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = s.strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"^-+|-+$", "", s)
    s = re.sub(r"-+", "-", s)
    return s or "column"


def normalize_status(value: str | None, valid_ids: set[str] | None = None) -> str:
    """Normalize a Status field value to a canonical column ID.

    Accepts: "todo", "to-do", "To Do", "in_progress", "In-Progress" etc.

    Two-pass match against valid_ids when supplied: exact canonical match
    first, then a hyphen-insensitive fallback so `Status: todo` matches a
    `## To Do` section (id `to-do`). Without valid_ids, returns the canonical
    form unchanged.
    """
    if not value:
        return ""
    v = derive_column_id(value.strip().lower().replace("_", "-"))
    if not valid_ids or v in valid_ids:
        return v
    stripped = v.replace("-", "")
    for cid in valid_ids:
        if cid.replace("-", "") == stripped:
            return cid
    return v


def parse_configured_columns(content: str) -> list[tuple[str, str]]:
    """Read user's column config from `## ⚙️ Configuration` block.

    Supports both formats:
      **Columns**: To Do | In Progress | Done
      **Columns**: 📝 To Do (todo) | 🚀 In Progress (in-progress) | ✅ Done (done)

    Returns list of (canonical_id, display_name). Empty list if not configured.
    """
    m = re.search(r"##[ \t]+\S*[ \t]*Configuration\s+([\s\S]*?)(?:^---|\Z)",
                  content, re.MULTILINE)
    if not m:
        return []
    cm = re.search(r"\*\*Columns\*\*:\s*(.+)", m.group(1))
    if not cm:
        return []
    out = []
    for raw in cm.group(1).split("|"):
        col = raw.strip()
        if not col:
            continue
        # "Name (explicit-id)" form
        idm = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", col)
        if idm:
            out.append((idm.group(2).strip(), idm.group(1).strip()))
        else:
            out.append((derive_column_id(col), col))
    return out


def reorganize_tasks_file(path: Path | None = None) -> bool:
    """Move each TASK block into the section matching its **Status** field.

    Authoritative source: the `**Status**` field. Both the HTML app and this
    hook honor that rule and use the same canonical-id matching, so a column
    headed `## 📝 To Do` collects tasks with `**Status**: todo`, `to-do`, or
    `To Do` indifferently.

    Runs on every PostToolUse:Write/Edit that touched tasks.md. Idempotent.
    """
    target = path if path is not None else TASKS_FILE
    content = read_tasks(target)
    if not content:
        return False

    heading_matches = list(SECTION_HEADING_RE.finditer(content))
    if not heading_matches:
        return False

    preamble = content[: heading_matches[0].start()]

    sections = []
    for i, m in enumerate(heading_matches):
        heading_line = content[m.start():m.end()] + "\n"
        body_start = m.end()
        if body_start < len(content) and content[body_start] == "\n":
            body_start += 1
        body_end = (
            heading_matches[i + 1].start()
            if i + 1 < len(heading_matches)
            else len(content)
        )
        body = content[body_start:body_end]

        task_matches = list(TASK_HEADING_RE.finditer(body))
        tasks = []
        pre = body
        if task_matches:
            pre = body[: task_matches[0].start()]
            for j, tm in enumerate(task_matches):
                tstart = tm.start()
                nxt = task_matches[j + 1].start() if j + 1 < len(task_matches) else len(body)
                tasks.append(body[tstart:nxt])

        heading_text = m.group(1).strip()
        sections.append({
            "id": derive_column_id(heading_text),
            "heading_text": heading_text,
            "heading_line": heading_line,
            "pre": pre,
            "original_tasks": tasks,
        })

    # Build canonical_id -> section index. Skip non-column sections like
    # "From TodoWrite", "Configuration", "Archive" by requiring the id to
    # appear either in the user's column config OR be a known kanban column.
    configured = parse_configured_columns(content)
    if configured:
        valid_ids = {cid for cid, _ in configured}
    else:
        # Defaults match HTML app's generateInitialTaskFile() in fileSystem.js.
        # `awaiting` (added v3.4.0) is for tasks where the active work is done
        # and the next move depends on an external signal (reply, CI run, vendor
        # decision, etc.). Excluded from get_current_task() so the Stop hook
        # doesn't nag on parked-pending-signal work.
        valid_ids = {"todo", "to-do", "in-progress", "in-review", "awaiting", "done"}

    column_sections = [(idx, s) for idx, s in enumerate(sections) if s["id"] in valid_ids]
    if len(column_sections) < 2:
        return False  # nothing to reorganize between

    column_id_set = {s["id"] for _, s in column_sections}

    # Re-assign each task to target section per its Status field.
    assigned: list[list[str]] = [list(s["original_tasks"]) for s in sections]
    moves = 0

    for src_idx, src_section in column_sections:
        # Iterate snapshot — assigned[src_idx] mutates as we move tasks out
        for blk in list(assigned[src_idx]):
            status_m = re.search(r"\*\*Status\*\*:\s*([\w-]+)", blk)
            target_id = normalize_status(
                status_m.group(1) if status_m else None,
                column_id_set,
            )
            if not target_id or target_id not in column_id_set:
                continue  # unknown / non-column status -> leave in place
            if target_id == src_section["id"]:
                continue  # already in the right column
            # Find target section index
            for tidx, tsec in column_sections:
                if tsec["id"] == target_id:
                    assigned[src_idx].remove(blk)
                    assigned[tidx].append(blk)
                    moves += 1
                    break

    if moves == 0:
        return False

    out = [preamble]
    for idx, s in enumerate(sections):
        out.append(s["heading_line"])
        out.append(s["pre"])
        out.extend(assigned[idx])
    new_content = "".join(out)
    if new_content == content:
        return False

    target.write_text(new_content)
    return True


def _extract_silence_deadline(block: str) -> str | None:
    """Pull the silence-deadline date out of an Outcome Branches block.

    Looks for any `If no <…> by <YYYY-MM-DD>` line (case-insensitive). Returns
    the earliest such date as an ISO string, or None if no deadline is set.
    Whatever the natural-language phrasing ("If no reply by 2026-04-29",
    "If no signal by 2026-05-01"), only the YYYY-MM-DD token is parsed.
    """
    dates = re.findall(
        r"-\s*If no [^\n]*?by\s*(\d{4}-\d{2}-\d{2})",
        block,
        re.IGNORECASE,
    )
    if not dates:
        return None
    return min(dates)  # earliest deadline wins if multiple branches list one


def _extract_awaiting_overdue(content: str, source: Path) -> list[dict[str, Any]]:
    """Return awaiting tasks whose silence-deadline (in Outcome Branches) has passed."""
    today = date.today().isoformat()
    out = []
    for task_id, heading, block in _iter_task_blocks(content):
        m = re.search(r"\*\*Status\*\*:\s*([a-z-]+)", block)
        if not m or m.group(1) != "awaiting":
            continue
        deadline = _extract_silence_deadline(block)
        if not deadline or deadline > today:
            continue
        title = heading.split("|", 1)[1].strip() if "|" in heading else ""
        out.append({
            "task_id": task_id,
            "title": title,
            "deadline": deadline,
            "source": source,
            "label": _label_for(source),
        })
    return out


def get_awaiting_overdue() -> list[dict[str, Any]]:
    """Awaiting tasks past their silence-deadline across all task files."""
    out = []
    for f in task_files():
        content = read_tasks(f)
        if content:
            out.extend(_extract_awaiting_overdue(content, f))
    return out


def _extract_in_progress(content: str, source: Path) -> list[dict[str, Any]]:
    """Return all in-progress tasks in a content blob, annotated with source path."""
    out = []
    for task_id, heading, block in _iter_task_blocks(content):
        m = re.search(r"\*\*Status\*\*:\s*([a-z-]+)", block)
        if not m or m.group(1) != "in-progress":
            continue
        title = heading.split("|", 1)[1].strip() if "|" in heading else ""
        completed = len(re.findall(r"- \[x\]", block, re.IGNORECASE))
        total = len(re.findall(r"- \[[x ]\]", block, re.IGNORECASE))
        out.append({
            "task_id": task_id,
            "title": title,
            "completed": completed,
            "total": total,
            "block": block,
            "source": source,
            "label": _label_for(source),
        })
    return out


def get_current_task() -> dict[str, Any] | None:
    """Return the first in-progress task across all task files, or None."""
    for f in task_files():
        content = read_tasks(f)
        if not content:
            continue
        found = _extract_in_progress(content, f)
        if found:
            return found[0]
    return None


def get_all_in_progress_tasks() -> list[dict[str, Any]]:
    """Return every in-progress task across all task files."""
    out = []
    for f in task_files():
        content = read_tasks(f)
        if content:
            out.extend(_extract_in_progress(content, f))
    return out


def get_incomplete_subtasks(block: str, limit: int = 5) -> list[str]:
    out = []
    for line in block.splitlines():
        m = re.match(r"\s*- \[ \]\s*(.+)", line)
        if m:
            out.append(m.group(1))
            if len(out) >= limit:
                break
    return out


def ensure_tasks_structure() -> None:
    # Notes dir is still a single location even in multi-file mode.
    PLANNING_DIR.mkdir(parents=True, exist_ok=True)
    NOTES_DIR.mkdir(parents=True, exist_ok=True)

    # In multi-file mode, never auto-create files — projects using this mode
    # already have their kanban files in place. Auto-creating would scatter
    # empty files into unexpected paths.
    if TASK_FILES_GLOB:
        return

    if not TASKS_FILE.is_file():
        TASKS_FILE.write_text(
            "# Task Board\n\n"
            "<!-- Config: Last Task ID: 000 -->\n\n"
            "## Configuration\n"
            "**Columns**: To Do | In Progress | Awaiting | Done\n"
            "**Categories**: Feature, Bug, Docs, Research\n"
            "**Users**: @user\n"
            "**Tags**: #feature #bug #docs #research\n\n"
            "---\n\n"
            "## To Do\n\n"
            "---\n\n"
            "## In Progress\n\n"
            "---\n\n"
            "## Awaiting\n\n"
            "> Tasks parked pending an external signal (reply, build, vendor "
            "decision). Outcome Branches in each task define what to do when "
            "the signal arrives — or by when to give up.\n\n"
            "---\n\n"
            "## Done\n\n"
            "---\n"
        )
        print(f"Created {TASKS_FILE}", file=sys.stderr)

    archive = PLANNING_DIR / "archive.md"
    if not archive.is_file():
        archive.write_text(
            "# Task Archive\n\n"
            "> Completed and archived tasks with preserved context.\n\n"
            "---\n"
        )
        print(f"Created {archive}", file=sys.stderr)


def append_log_entry(task_id: str, log_line: str, section: str = "Visual Operations Log") -> bool:
    """Append a log line to a named section inside a task block.

    Searches all task files, writes to whichever file owns the task.
    """
    for f in task_files():
        content = read_tasks(f)
        if not content:
            continue

        new_content = None
        for tid, heading, block in _iter_task_blocks(content):
            if tid != task_id:
                continue

            section_marker = f"**{section}**:"
            if section_marker in block:
                new_block = re.sub(
                    rf"(\*\*{re.escape(section)}\*\*:[^\n]*\n)",
                    r"\1" + log_line + "\n",
                    block,
                    count=1,
                )
            elif "**Notes**:" in block:
                trailing = "\n" + section_marker + "\n" + log_line + "\n"
                new_block = block.rstrip() + trailing + "\n"
            else:
                trailing = "\n**Notes**:\n\n" + section_marker + "\n" + log_line + "\n"
                new_block = block.rstrip() + trailing + "\n"

            new_content = content.replace(block, new_block, 1)
            break

        if new_content is None:
            continue
        try:
            f.write_text(new_content)
            return True
        except OSError:
            return False
    return False


# =============================================================================
# Event handlers
# =============================================================================

def _load_notes_summary(task_id: str) -> str | None:
    """Load notes file for a task and return a summary (first 40 lines).

    Returns None if no notes file exists or it's empty/skeleton-only.
    """
    notes_file = NOTES_DIR / f"{task_id}.md"
    if not notes_file.is_file():
        return None
    try:
        content = notes_file.read_text().strip()
    except OSError:
        return None
    if not content:
        return None
    # Check if it's just a skeleton with no real content
    lines = content.splitlines()
    non_empty = [l for l in lines if l.strip() and not l.startswith("#") and not l.startswith("_")]
    if len(non_empty) < 2:
        return None
    # Return first 40 lines as summary
    return "\n".join(lines[:40])


def _count_research_ops(block: str) -> int:
    """Count research operations in a task's Visual Operations Log."""
    return len(re.findall(r"- \d{4}-\d{2}-\d{2}.*(?:WebFetch|WebSearch)", block))


def handle_session_start() -> None:
    # v3.3.0: sweep orphaned session state from crashed/forced-exit sessions
    # before rendering the banner. SessionEnd doesn't always fire.
    try:
        gc_stale_session_state()
    except Exception as e:
        print(f"[task-memory] GC warning: {e}", file=sys.stderr)

    print("", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print("TASK-MEMORY SESSION START", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    files = task_files()
    if not files:
        if TASK_FILES_GLOB:
            print(f"\nNo task files matched: {TASK_FILES_GLOB}", file=sys.stderr)
        else:
            print("\nNo tasks.md found", file=sys.stderr)
            print("Will be created when you start working.", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        return

    all_tasks = get_all_in_progress_tasks()
    overdue = get_awaiting_overdue()
    if overdue:
        print(
            f"\n🔔 AWAITING — {len(overdue)} task(s) past their silence-deadline:",
            file=sys.stderr,
        )
        for t in overdue:
            suffix = f" ({t['label']})" if t.get("label") else ""
            print(
                f"  • {t['task_id']} | {t['title'][:60]}  "
                f"deadline {t['deadline']}{suffix}",
                file=sys.stderr,
            )
        print(
            "  → Outcome Branches define the silence-path action; execute or "
            "extend the deadline.",
            file=sys.stderr,
        )

    # v3.3.0: proactively create notes skeletons for every in-progress task.
    # Prior behavior only warned when research ops >= 2 and the file was
    # missing — but by then the insights were often already lost. Creating
    # the skeleton up front means the file is always there, waiting to be
    # filled in, and the PreCompact snapshot has a target to append to.
    for t in all_tasks:
        try:
            _create_notes_skeleton(t["task_id"], t["title"])
        except Exception as e:
            print(f"[task-memory] skeleton warning ({t['task_id']}): {e}", file=sys.stderr)

    # Multi-file mode: list all in-progress tasks with their source labels.
    if TASK_FILES_GLOB:
        print(f"\nTask files ({len(files)}):", file=sys.stderr)
        for f in files:
            print(f"  - {f.relative_to(PROJECT_DIR) if str(f).startswith(str(PROJECT_DIR)) else f}", file=sys.stderr)

        if not all_tasks:
            print("\nNo in-progress tasks", file=sys.stderr)
            print("=" * 60 + "\n", file=sys.stderr)
            return

        print(f"\n📋 In-progress ({len(all_tasks)}):", file=sys.stderr)
        for t in all_tasks:
            title = t["title"][:60]
            suffix = f" ({t['label']})" if t["label"] else ""
            progress = ""
            if t["total"] > 0:
                progress = f" [{t['completed']}/{t['total']}]"
            print(f"  • {t['task_id']} | {title}…{progress}{suffix}", file=sys.stderr)

        # Show notes status for each task
        for t in all_tasks:
            notes_summary = _load_notes_summary(t["task_id"])
            research_ops = _count_research_ops(t["block"])
            if notes_summary:
                print(f"\n  📝 {t['task_id']} notes loaded ({NOTES_DIR / (t['task_id'] + '.md')})", file=sys.stderr)
            elif research_ops >= 2:
                print(f"\n  ⚠️  {t['task_id']}: {research_ops} research ops logged but NO notes file!", file=sys.stderr)
                print(f"     Create: {NOTES_DIR / (t['task_id'] + '.md')}", file=sys.stderr)

        print("\n" + "=" * 60 + "\n", file=sys.stderr)
        return

    # Single-file mode.
    if not all_tasks:
        print(f"\nPlanning: {TASKS_FILE}", file=sys.stderr)
        print("\nNo in-progress tasks", file=sys.stderr)
        print("Create a task with **Status**: in-progress to start", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        return

    task = all_tasks[0]
    print(f"\nCURRENT: {task['task_id']} | {task['title']}", file=sys.stderr)

    if task["total"] > 0:
        pct = task["completed"] * 100 // task["total"]
        filled = pct // 5
        bar = "#" * filled + "-" * (20 - filled)
        print(f"\nProgress: [{bar}] {task['completed']}/{task['total']}", file=sys.stderr)
        print("\nNext:", file=sys.stderr)
        for s in get_incomplete_subtasks(task["block"]):
            print(f"   - [ ] {s}", file=sys.stderr)

    # Context reload: show notes summary or warn about missing notes
    notes_summary = _load_notes_summary(task["task_id"])
    research_ops = _count_research_ops(task["block"])

    if notes_summary:
        print(f"\n📝 PRESERVED CONTEXT ({NOTES_DIR / (task['task_id'] + '.md')}):", file=sys.stderr)
        print("-" * 40, file=sys.stderr)
        print(notes_summary, file=sys.stderr)
        print("-" * 40, file=sys.stderr)
        print("Run /task-status for full context check.", file=sys.stderr)
    elif research_ops >= 2:
        print(f"\n⚠️  CONTEXT GAP DETECTED", file=sys.stderr)
        print(f"   {research_ops} research operations logged but NO notes file.", file=sys.stderr)
        print(f"   Previous session insights may be LOST.", file=sys.stderr)
        print(f"   Review Visual Operations Log and recreate findings in:", file=sys.stderr)
        print(f"   {NOTES_DIR / (task['task_id'] + '.md')}", file=sys.stderr)
    else:
        print(f"\nRun /task-status for full context check.", file=sys.stderr)

    print("\n" + "=" * 60 + "\n", file=sys.stderr)


def _is_tasks_file(path_str: str) -> bool:
    """True iff the path refers to one of our managed task files."""
    if not path_str:
        return False
    try:
        edited = Path(path_str).resolve()
    except (OSError, ValueError):
        return False
    for tf in task_files():
        try:
            if tf.resolve() == edited:
                return True
        except OSError:
            continue
    return False


def handle_pre_tool_use(tool_name: str, tool_input: dict, session_id: str) -> int | None:
    # Guard: block `Write` on an existing tasks.md that already has task content.
    # Write replaces the whole file — every prior session that did this on
    # loro's tasks.md clobbered the canonical structure. Force Edit instead.
    if tool_name == "Write":
        file_path = tool_input.get("file_path") or tool_input.get("path") or ""
        if _is_tasks_file(file_path):
            try:
                existing = Path(file_path).read_text() if Path(file_path).is_file() else ""
            except OSError:
                existing = ""
            if TASK_HEADING_RE.search(existing):
                reason = (
                    f"BLOCKED: refusing to overwrite tasks.md ({file_path}) with Write — "
                    f"that destroys existing task blocks. Use Edit with a targeted "
                    f"old_string/new_string (e.g., flip `**Status**: in-progress` → `done`). "
                    f"The hook auto-reorganizes sections for you."
                )
                print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                    "permissionDecision": "deny", "permissionDecisionReason": reason}}))
                print(reason, file=sys.stderr)
                return 2

    if tool_name in ("Write", "Edit", "Bash", "Task"):
        task = get_current_task()
        if not task:
            return None

        # v3.3.0: only stamp the session when the tool use actually touches
        # the task. Ambient reads/greps no longer contaminate unrelated work.
        # TASK_MEMORY_FORCE_STAMP=1 restores pre-3.3 blanket behavior.
        if is_off_topic(session_id):
            return None
        if _force_stamp() or tool_use_touches_task(tool_name, tool_input, task):
            record_session_task(session_id, task["task_id"])
            bump_engagement(session_id, task["task_id"])
        else:
            return None

        # Multi-file mode: only show the attention nudge on Write/Edit when
        # the file being edited is the same file that owns the in-progress
        # task. Otherwise we'd nag on every edit across an unrelated area.
        if TASK_FILES_GLOB and tool_name in ("Write", "Edit"):
            file_path = (tool_input.get("file_path") or tool_input.get("path") or "")
            try:
                edited = Path(file_path).resolve() if file_path else None
                owner = task["source"].resolve()
            except (OSError, ValueError):
                edited, owner = None, None
            if edited != owner:
                return

        print("", file=sys.stderr)
        print("-" * 60, file=sys.stderr)
        print(f"TASK: {task['task_id']} | {task['title']}", file=sys.stderr)
        print("-" * 60, file=sys.stderr)
        if task["total"] > 0:
            remaining = task["total"] - task["completed"]
            print(f"\nProgress: {task['completed']}/{task['total']} | Remaining {remaining}:", file=sys.stderr)
            for s in get_incomplete_subtasks(task["block"]):
                print(f"   - [ ] {s}", file=sys.stderr)
        print("-" * 60 + "\n", file=sys.stderr)


def _create_notes_skeleton(task_id: str, task_title: str) -> bool:
    """Create a skeleton notes file with required sections.

    Returns True if created, False if it already exists or couldn't be written.
    Structural enforcement: by pre-creating sections, Claude only has to fill
    them in rather than remember to build the structure from scratch.
    """
    notes_path = NOTES_DIR / f"{task_id}.md"
    if notes_path.is_file():
        return False
    try:
        NOTES_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        return False

    ts = datetime.now().strftime("%Y-%m-%d")
    skeleton = f"""# {task_id} Notes — {task_title}

_Created {ts}. Captures context that would otherwise be lost at session end or compaction._

## Summary

_One-paragraph answer to: what is this task doing and why?_

## Patterns Discovered

_Reusable techniques, "do this". Each bullet should be specific enough to apply without re-reading source material._

-

## Gotchas

_Pitfalls, "don't do this". Include the failure mode so the next session doesn't repeat it._

-

## Decisions

_Choices made and rationale. Format: `Decision — reason`._

-

## Resources

_Files, URLs, docs examined. One line each with a takeaway._

-

## Open Questions

_Things to verify, confirm, or ask about before finalizing._

-
"""
    try:
        notes_path.write_text(skeleton)
        return True
    except OSError:
        return False


def handle_post_tool_use(tool_name: str, tool_input: dict, tool_response: Any, session_id: str) -> None:
    # WebFetch / WebSearch => Visual Operations Log (captures the FINDING, post-execution)
    if tool_name in ("WebFetch", "WebSearch"):
        ensure_tasks_structure()
        count = increment_counter(RESEARCH_COUNTER)
        task = get_current_task()
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        snippet = ""
        if isinstance(tool_response, str):
            snippet = tool_response.strip().replace("\n", " ")[:120]
        elif isinstance(tool_response, dict):
            for key in ("result", "content", "output", "text"):
                v = tool_response.get(key)
                if isinstance(v, str):
                    snippet = v.strip().replace("\n", " ")[:120]
                    break

        if tool_name == "WebFetch":
            url = tool_input.get("url", "")
            log_line = f"- {ts} - WebFetch: {url}"
        else:
            query = tool_input.get("query", "")
            log_line = f'- {ts} - WebSearch: "{query}"'
        if snippet:
            log_line += f" => {snippet}"

        if task and append_log_entry(task["task_id"], log_line):
            print(f"Logged to {task['task_id']}: {log_line}", file=sys.stderr)

        if count % 2 == 0:
            print("\n" + "=" * 60, file=sys.stderr)
            print("2-ACTION RULE: TIME TO PRESERVE RESEARCH", file=sys.stderr)
            print("=" * 60, file=sys.stderr)
            print(f"Operations count: {count}", file=sys.stderr)
            if task:
                print(f"Task: {task['task_id']}", file=sys.stderr)
                notes_path = NOTES_DIR / f"{task['task_id']}.md"
                # Auto-create skeleton if notes file doesn't exist yet
                if not notes_path.is_file():
                    created = _create_notes_skeleton(task["task_id"], task["title"])
                    if created:
                        print(f"CREATED skeleton: {notes_path}", file=sys.stderr)
                        print(f"⚠️  EDIT IT NOW with insights from your research.", file=sys.stderr)
                        print(f"    Empty sections = lost context on session end.", file=sys.stderr)
                    else:
                        print(f"Create/update: {notes_path}", file=sys.stderr)
                else:
                    print(f"Update existing: {notes_path}", file=sys.stderr)
                    print(f"⚠️  Add new findings from your last 2 operations.", file=sys.stderr)
            else:
                print(f"Create/update: {NOTES_DIR}/TASK-XXX.md", file=sys.stderr)
            print("Preserve: observations, decisions, patterns, gotchas", file=sys.stderr)
            print("=" * 60 + "\n", file=sys.stderr)
        return

    # TodoWrite => mirror into tasks.md under "## From TodoWrite"
    if tool_name == "TodoWrite":
        todos = tool_input.get("todos") or []
        if isinstance(todos, list):
            mirror_todowrite(todos)
        return

    # Write/Edit => auto-reorganize tasks.md if the write touched it, then
    # subtask nudge every 3rd op.
    if tool_name in ("Write", "Edit"):
        # If Claude just edited tasks.md, move any blocks whose Status no longer
        # matches their section. Saves tokens — Claude flips Status, hook moves
        # the block. No need for a second Edit call.
        file_path = (tool_input.get("file_path") or tool_input.get("path") or "")
        # TASK-017: widened from a fixed ("tasks.md", "kanban.md") suffix check
        # to any ".md" so per-dev files (tasks-gr.md) reachable via
        # task_files_glob also auto-reorganize. Safe because the membership
        # check below (`known = task_files()`) already restricts this to
        # configured task files — an arbitrary "notes.md" still won't match.
        if file_path and file_path.endswith(".md"):
            # Reorganize only the file that was actually edited.
            try:
                edited = Path(file_path).resolve()
            except (OSError, ValueError):
                edited = None
            # Scope the reorganize to a known task file (avoid touching
            # arbitrary tasks.md files outside our config).
            known = {p.resolve(): p for p in task_files()}
            target = known.get(edited) if edited else None
            if target is None and not TASK_FILES_GLOB and edited == TASKS_FILE.resolve():
                target = TASKS_FILE
            if target is not None:
                try:
                    if reorganize_tasks_file(target):
                        # Tell Claude the file changed out from under it — the
                        # next Edit on this path needs a fresh Read or old_string
                        # won't match. additionalContext is surfaced to the
                        # model in its next turn; stderr shows up in transcript.
                        msg = (
                            f"[task-memory] reorganized {target.name} — the file "
                            f"on disk no longer matches your last Read of "
                            f"{target}. Re-read this file before your next Edit "
                            f"to it, or old_string will miss."
                        )
                        print(msg, file=sys.stderr)
                        try:
                            print(json.dumps({"hookSpecificOutput": {
                                "hookEventName": "PostToolUse",
                                "additionalContext": msg,
                            }}))
                        except Exception:
                            pass
                except Exception as e:
                    print(f"[task-memory] reorganize failed: {e}", file=sys.stderr)

        task = get_current_task()
        if not task or task["total"] == 0 or task["completed"] == task["total"]:
            return
        count = increment_counter(PROGRESS_COUNTER)
        if count % 3 != 0:
            return
        print("\n" + "-" * 50, file=sys.stderr)
        print(f"UPDATE SUBTASKS? ({task['task_id']})", file=sys.stderr)
        print("-" * 50, file=sys.stderr)
        print("Mark completed items [x]:", file=sys.stderr)
        for s in get_incomplete_subtasks(task["block"]):
            print(f"   - [ ] {s}", file=sys.stderr)
        edit_target = task.get("source") or TASKS_FILE
        print(f"Edit: {edit_target}", file=sys.stderr)
        print("-" * 50 + "\n", file=sys.stderr)
        return

    # Bash => log errors
    if tool_name == "Bash":
        text = ""
        if isinstance(tool_response, str):
            text = tool_response
        elif isinstance(tool_response, dict):
            for key in ("stderr", "stdout", "output", "error"):
                v = tool_response.get(key)
                if isinstance(v, str):
                    text += v + "\n"
        if not re.search(r"error|failed|not found|denied|exception", text, re.IGNORECASE):
            return
        task = get_current_task()
        if not task:
            return
        m = re.search(r"^.*(?:error|failed|not found|denied|exception).*$", text, re.IGNORECASE | re.MULTILINE)
        err = (m.group(0) if m else "").strip()[:80]
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if append_log_entry(task["task_id"], f"- {ts} - Error: {err}", "Errors Log"):
            print(f"\nError logged to {task['task_id']}\n   {err}", file=sys.stderr)


# =============================================================================
# TodoWrite mirroring (finding #1)
# =============================================================================

TODOWRITE_SECTION = "## From TodoWrite"


def mirror_todowrite(todos: list[dict]) -> None:
    """Mirror TodoWrite items into tasks.md under ## From TodoWrite.

    Each todo becomes a line: `- [status] content (activeForm)`.
    Skips items whose content already appears in a manually-created
    ### TASK heading (case-insensitive) to avoid double-writing.
    """
    ensure_tasks_structure()
    target = primary_task_file()
    # In multi-file mode the primary might not exist if user hasn't created it;
    # create an empty mirror file so we don't silently lose TodoWrite data.
    if not target.is_file():
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("# Task Board\n\n")
        except OSError:
            return
    content = read_tasks(target)

    # Check against existing titles across ALL task files so we don't
    # double-mirror items the user has already promoted into a TASK block.
    existing_titles = set()
    for f in task_files():
        for _, heading, _ in _iter_task_blocks(read_tasks(f)):
            if "|" in heading:
                existing_titles.add(heading.split("|", 1)[1].strip().lower())

    lines = []
    status_marker = {"completed": "x", "in_progress": "-", "pending": " "}
    for t in todos:
        if not isinstance(t, dict):
            continue
        text = (t.get("content") or "").strip()
        if not text or text.lower() in existing_titles:
            continue
        status = t.get("status", "pending")
        mark = status_marker.get(status, " ")
        active = (t.get("activeForm") or "").strip()
        line = f"- [{mark}] {text}" + (f" _(active: {active})_" if active else "")
        lines.append(line)

    if not lines:
        return

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_section = (
        f"\n{TODOWRITE_SECTION}\n\n"
        f"_Mirrored from native TodoWrite @ {ts}_\n\n"
        + "\n".join(lines)
        + "\n\n---\n"
    )

    if TODOWRITE_SECTION in content:
        new_content = re.sub(
            rf"{re.escape(TODOWRITE_SECTION)}.*?(?=\n## |\Z)",
            new_section.lstrip("\n"),
            content,
            count=1,
            flags=re.DOTALL,
        )
    else:
        new_content = content.rstrip() + "\n" + new_section

    try:
        target.write_text(new_content)
    except OSError:
        pass


# =============================================================================
# PreCompact (finding #2)
# =============================================================================

def handle_pre_compact(payload: dict) -> None:
    """Dump current in-progress task + research + todos to a snapshot file."""
    ensure_tasks_structure()
    task = get_current_task()
    task_id = task["task_id"] if task else "UNKNOWN"
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    snapshot = NOTES_DIR / f"{task_id}-precompact-{ts}.md"

    parts = [
        f"# Pre-Compact Snapshot — {task_id}",
        "",
        f"_Generated: {datetime.now().isoformat()}_",
        "",
    ]

    if task:
        parts += [
            "## Current Task",
            "",
            f"**{task['task_id']}**: {task['title']}",
            f"Progress: {task['completed']}/{task['total']}",
            "",
            "### Task Block",
            "",
            "```markdown",
            task["block"].rstrip(),
            "```",
            "",
        ]
    else:
        parts += ["## Current Task", "", "_No in-progress task._", ""]

    # Recent research log (last 20 entries) — pull from the file that owns
    # the active task, falling back to the primary file.
    source = (task.get("source") if task else None) or primary_task_file()
    content = read_tasks(source)
    for section in ("Visual Operations Log", "Errors Log"):
        m = re.search(rf"\*\*{re.escape(section)}\*\*:\s*\n((?:- .+\n)+)", content)
        if m:
            entries = m.group(1).strip().splitlines()[-20:]
            parts += [f"## Recent {section} (last 20)", "", *entries, ""]

    # Claude Code passes `trigger` ("manual"|"auto") and optional `custom_instructions`
    trigger = payload.get("trigger") or payload.get("reason") or "unknown"
    parts += [f"## Compaction Trigger\n\n`{trigger}`\n"]
    if payload.get("custom_instructions"):
        parts += ["## Custom Instructions\n", str(payload["custom_instructions"]), ""]

    try:
        snapshot.write_text("\n".join(parts))
        print(f"\n[task-memory] Pre-compact snapshot: {snapshot}\n", file=sys.stderr)
    except OSError as e:
        print(f"[task-memory] Failed to write snapshot: {e}", file=sys.stderr)

    # Also append the operations log into the main notes file so insights
    # survive compaction in a discoverable place (not just a timestamped
    # snapshot). The snapshot is a safety net; the notes file is canonical.
    if task and task_id != "UNKNOWN":
        notes_path = NOTES_DIR / f"{task_id}.md"
        if not notes_path.is_file():
            _create_notes_skeleton(task_id, task.get("title", ""))

        if notes_path.is_file():
            try:
                existing_notes = notes_path.read_text()
            except OSError:
                existing_notes = ""

            ops_heading = f"## Pre-Compact Ops Log ({datetime.now().strftime('%Y-%m-%d %H:%M')})"
            appendix_parts = ["", ops_heading, ""]
            for section in ("Visual Operations Log", "Errors Log"):
                m = re.search(rf"\*\*{re.escape(section)}\*\*:\s*\n((?:- .+\n)+)", content)
                if m:
                    entries = m.group(1).strip().splitlines()[-20:]
                    appendix_parts += [f"### {section}", "", *entries, ""]

            if len(appendix_parts) > 3:  # more than just the heading
                appendix_parts += [
                    "_Synthesize these into Patterns/Gotchas/Decisions above before they age out._",
                    "",
                ]
                try:
                    notes_path.write_text(existing_notes.rstrip() + "\n" + "\n".join(appendix_parts))
                    print(f"[task-memory] Appended ops log to {notes_path}", file=sys.stderr)
                except OSError as e:
                    print(f"[task-memory] Failed to append to notes: {e}", file=sys.stderr)


# =============================================================================
# Stop / SubagentStop (may block)
# =============================================================================

MAX_STOP_BLOCKS = 2


def _stop_block_count_path(session_id: str) -> Path:
    return state_path(f"stop-blocks-{session_id}.txt")


def _notes_has_content(task_id: str) -> bool:
    """True if the notes file exists and has substantive content (not just skeleton)."""
    notes_path = NOTES_DIR / f"{task_id}.md"
    if not notes_path.is_file():
        return False
    try:
        content = notes_path.read_text()
    except OSError:
        return False
    # Strip skeleton markers — bullets with just "-" and italicized placeholders
    content_lines = [l for l in content.splitlines() if l.strip()]
    substantive = [
        l for l in content_lines
        if not l.startswith("#")
        and not l.startswith("_")
        and l.strip() not in ("-", "- ", "*", "* ")
    ]
    # At least 3 lines of real content beyond headers and placeholders
    return len(substantive) >= 3


def _detect_complexity(block: str) -> str:
    """Extract Complexity field from a task block. Defaults to 'Standard'."""
    m = re.search(r"\*\*Complexity\*\*:\s*([A-Za-z]+)", block)
    if m:
        return m.group(1).strip()
    return "Standard"


def _actionable_pause_hint(task: dict) -> str:
    """Copy-paste instructions to flip the current task off in-progress."""
    try:
        rel = task["source"].relative_to(PROJECT_DIR)
    except (KeyError, ValueError):
        rel = task.get("source") or TASKS_FILE
    return (
        f"To pause: Edit {rel} under `### {task['task_id']}` — replace "
        f"`**Status**: in-progress` with `**Status**: todo` (work-not-started-again) "
        f"or `**Status**: awaiting` (action shipped, blocked on an external signal "
        f"— add an Outcome Branches block describing what to do when the signal "
        f"arrives or by when to chase). Section auto-reorganizes."
    )


def _actionable_off_topic_hint(session_id: str) -> str:
    """Instruct the assistant how to disable blocking for an off-topic session."""
    if not session_id:
        return ""
    flag = off_topic_flag_path(session_id)
    return (
        f"If this work is unrelated to the active task: "
        f"`touch {flag}` and Stop will not block again this session."
    )


def handle_stop(session_id: str) -> None:
    task = get_current_task()
    if not task:
        return

    # Explicit opt-out wins over everything.
    if is_off_topic(session_id):
        return

    if not was_task_worked_on(session_id, task["task_id"]):
        return

    if task["total"] == 0:
        return

    # Sticky release: once we've already given up on this session+task,
    # don't re-nag every time the user prompts. Cleared on SessionEnd or
    # status change.
    if is_released(session_id, task["task_id"]):
        return

    # Engagement threshold: short one-off sessions (answered a question,
    # ran a single command) shouldn't block Stop. Warn to stderr but release.
    engagement = get_engagement(session_id, task["task_id"])
    if engagement < MIN_ENGAGEMENTS_TO_BLOCK:
        print(
            f"⚠️  task-memory: {task['task_id']} touched {engagement}× this session "
            f"(threshold {MIN_ENGAGEMENTS_TO_BLOCK}). Not blocking Stop.",
            file=sys.stderr,
        )
        return

    # Loop prevention: after MAX_STOP_BLOCKS consecutive blocks, allow stop
    # and mark released so we don't re-nag next cycle.
    counter = _stop_block_count_path(session_id) if session_id else None
    block_count = 0
    if counter and counter.exists():
        try:
            block_count = int(counter.read_text().strip() or "0")
        except (ValueError, OSError):
            block_count = 0

    if block_count >= MAX_STOP_BLOCKS:
        print(
            f"⚠️  task-memory: {task['task_id']} still has incomplete subtasks, "
            f"allowing stop after {block_count} blocks. Not nagging again this session. "
            f"Clear: rm {released_flag_path(session_id, task['task_id'])}",
            file=sys.stderr,
        )
        mark_released(session_id, task["task_id"])
        if counter:
            try:
                counter.unlink()
            except OSError:
                pass
        return

    # Context-preservation check: if research was performed but notes are empty,
    # flag it. This is a common leak point — operations log has URLs but the
    # notes file (what actually persists across sessions) is blank.
    research_ops = _count_research_ops(task["block"])
    complexity = _detect_complexity(task["block"])
    needs_notes = research_ops >= 2 or complexity in ("Standard", "Complex")
    notes_missing = not _notes_has_content(task["task_id"])
    pause_hint = _actionable_pause_hint(task)
    off_topic_hint = _actionable_off_topic_hint(session_id)

    if task["completed"] == task["total"]:
        if needs_notes and notes_missing:
            reason = (
                f"All {task['total']} subtasks complete for {task['task_id']}, but "
                f"notes/{task['task_id']}.md is missing or empty. {research_ops} research "
                f"operations were logged — their insights will be LOST on session end. "
                f"Fill in notes/{task['task_id']}.md (Patterns, Gotchas, Decisions) before "
                f"marking done. Then change Status to done and add Finished date. "
                f"{off_topic_hint}"
            )
        else:
            reason = (
                f"All {task['total']} subtasks complete for {task['task_id']} but task still "
                f"in-progress. Please: 1) Change Status to done, 2) Move task to Done section, "
                f"3) Add Finished date. Then you may stop. {off_topic_hint}"
            )
    else:
        remaining = task["total"] - task["completed"]
        subs = " ".join(f"- {s}" for s in get_incomplete_subtasks(task["block"]))
        notes_warning = ""
        if needs_notes and notes_missing:
            notes_warning = (
                f" Also: notes/{task['task_id']}.md is missing — preserve research "
                f"insights there before pausing or session context will be lost."
            )
        reason = (
            f"{task['task_id']} has {remaining} incomplete subtasks: {subs}. "
            f"Complete these subtasks before stopping, or change Status to 'todo' (pause) or 'awaiting' (parked on external signal — add Outcome Branches). "
            f"{pause_hint} {off_topic_hint}"
            f"{notes_warning}"
        )

    if counter:
        try:
            counter.write_text(str(block_count + 1))
        except OSError:
            pass
    print(json.dumps({"decision": "block", "reason": reason}))


def handle_session_end(session_id: str) -> None:
    """SessionEnd: flush all session-scoped state, never block (finding #5)."""
    if not session_id:
        return
    # Session task file + stop-blocks counter + released flags + off-topic flag
    # + engagement counters (multiple task ids possible).
    to_remove = [
        session_task_file(session_id),
        _stop_block_count_path(session_id),
        off_topic_flag_path(session_id),
    ]
    for f in to_remove:
        if f.exists():
            try:
                f.unlink()
            except OSError:
                pass
    # Released flags + engagement counters use session_id as prefix — glob.
    if STATE_DIR.exists():
        for pattern in (f"released-{session_id}-*.flag", f"engagement-{session_id}-*.txt"):
            for p in STATE_DIR.glob(pattern):
                try:
                    p.unlink()
                except OSError:
                    pass


# =============================================================================
# Main
# =============================================================================

def main() -> int:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return 0

    hook_event = payload.get("hook_event_name", "")
    session_id = payload.get("session_id", "")
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input") or {}
    tool_response = payload.get("tool_response", payload.get("tool_result"))

    if not isinstance(tool_input, dict):
        tool_input = {}

    try:
        if hook_event in ("SessionStart", "PostCompact"):
            handle_session_start()
        elif hook_event == "PreCompact":
            handle_pre_compact(payload)
        elif hook_event == "PreToolUse":
            rc = handle_pre_tool_use(tool_name, tool_input, session_id)
            if isinstance(rc, int) and rc != 0:
                return rc
        elif hook_event == "PostToolUse":
            handle_post_tool_use(tool_name, tool_input, tool_response, session_id)
        elif hook_event in ("Stop", "SubagentStop"):
            handle_stop(session_id)
        elif hook_event == "SessionEnd":
            handle_session_end(session_id)
    except Exception as e:  # Never break the tool call
        print(f"[task-memory] hook error: {e}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
