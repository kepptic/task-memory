#!/usr/bin/env python3
"""
task-memory-hook.py - Unified hook for task-memory plugin.

Handles all Claude Code hook events:
- SessionStart / PostCompact: Display current task context
- PreToolUse: Refresh context (Write/Edit/Bash/Task)
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
from datetime import datetime
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

TASK_HEADING_RE = re.compile(r"^### (TASK-\d+)(.*)$", re.MULTILINE)


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


NEXT_SECTION_RE = re.compile(r"^(?:### TASK-\d+|## )", re.MULTILINE)


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
        # Defaults match HTML app's generateInitialTaskFile() in fileSystem.js
        valid_ids = {"todo", "to-do", "in-progress", "in-review", "done"}

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
            "**Columns**: To Do | In Progress | Done\n"
            "**Categories**: Feature, Bug, Docs, Research\n"
            "**Users**: @user\n"
            "**Tags**: #feature #bug #docs #research\n\n"
            "---\n\n"
            "## To Do\n\n"
            "---\n\n"
            "## In Progress\n\n"
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

def handle_session_start() -> None:
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
        print("\n" + "=" * 60 + "\n", file=sys.stderr)
        return

    # Single-file mode (unchanged behavior).
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
        record_session_task(session_id, task["task_id"])

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
                print(f"Create/update: {NOTES_DIR}/{task['task_id']}.md", file=sys.stderr)
            else:
                print(f"Create/update: {NOTES_DIR}/TASK-XXX.md", file=sys.stderr)
            print("Preserve: observations, decisions, issues, resources", file=sys.stderr)
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
        if file_path and file_path.endswith(("tasks.md", "kanban.md")):
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


# =============================================================================
# Stop / SubagentStop (may block)
# =============================================================================

MAX_STOP_BLOCKS = 2


def _stop_block_count_path(session_id: str) -> Path:
    return state_path(f"stop-blocks-{session_id}.txt")


def handle_stop(session_id: str) -> None:
    task = get_current_task()
    if not task:
        return

    if not was_task_worked_on(session_id, task["task_id"]):
        return

    if task["total"] == 0:
        return

    # Loop prevention: after MAX_STOP_BLOCKS consecutive blocks, allow stop
    # with a warning. Otherwise the agent gets trapped re-attempting forever.
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
            f"but allowing stop after {block_count} blocks. Update the kanban when ready.",
            file=sys.stderr,
        )
        if counter:
            try:
                counter.unlink()
            except OSError:
                pass
        return

    if task["completed"] == task["total"]:
        reason = (
            f"All {task['total']} subtasks complete for {task['task_id']} but task still "
            f"in-progress. Please: 1) Change Status to done, 2) Move task to Done section, "
            f"3) Add Finished date. Then you may stop."
        )
    else:
        remaining = task["total"] - task["completed"]
        subs = " ".join(f"- {s}" for s in get_incomplete_subtasks(task["block"]))
        reason = (
            f"{task['task_id']} has {remaining} incomplete subtasks: {subs}. "
            f"Complete these subtasks before stopping, or change Status to 'todo' if pausing work."
        )

    if counter:
        try:
            counter.write_text(str(block_count + 1))
        except OSError:
            pass
    print(json.dumps({"decision": "block", "reason": reason}))


def handle_session_end(session_id: str) -> None:
    """SessionEnd: flush session task file, never block (finding #5)."""
    if session_id:
        f = session_task_file(session_id)
        if f.exists():
            try:
                f.unlink()
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
