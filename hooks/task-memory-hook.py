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


def find_planning_dir() -> Path:
    """Locate planning dir: config -> nearest ancestor -> project root."""
    config_file = PROJECT_DIR / ".task-memory.json"
    if config_file.is_file():
        try:
            cfg = json.loads(config_file.read_text())
            planning = cfg.get("planning_dir")
            if planning:
                p = Path(planning)
                return p if p.is_absolute() else (PROJECT_DIR / p)
        except (json.JSONDecodeError, OSError):
            pass

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


def read_tasks() -> str:
    if not TASKS_FILE.is_file():
        return ""
    try:
        return TASKS_FILE.read_text()
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


STATUS_TO_SECTION = {
    "todo": "to do",
    "in-progress": "in progress",
    "done": "done",
}

SECTION_HEADING_RE = re.compile(r"^##[ \t]+(.+?)[ \t]*$", re.MULTILINE)


def reorganize_tasks_file() -> bool:
    """Move each TASK block into the section matching its **Status** field.

    Claude otherwise has to do this manually (2 edits per status change), which
    costs tokens. This runs on every PostToolUse:Write/Edit that touched
    tasks.md. Idempotent — only rewrites if something actually moved.

    Strategy:
      1. Parse into preamble + [section heading + body] list
      2. For each section, separate non-task prelude/trailing text from task
         blocks so we preserve separators and prose
      3. Map each task's Status -> target section name
      4. Redistribute tasks into their target sections (preserving order
         within a section for tasks that didn't move)
      5. Rewrite only if the ordering changed

    Returns True iff the file was modified.
    """
    content = read_tasks()
    if not content:
        return False

    heading_matches = list(SECTION_HEADING_RE.finditer(content))
    if not heading_matches:
        return False

    preamble = content[: heading_matches[0].start()]

    # Build section records in document order
    sections = []
    for i, m in enumerate(heading_matches):
        heading_line = content[m.start():m.end()] + "\n"
        body_start = m.end()
        # include the newline immediately after heading in the body
        if body_start < len(content) and content[body_start] == "\n":
            body_start += 1
        body_end = (
            heading_matches[i + 1].start()
            if i + 1 < len(heading_matches)
            else len(content)
        )
        body = content[body_start:body_end]

        # Find task blocks within this body. Local iteration mirrors
        # _iter_task_blocks but scoped to the section body only.
        task_matches = list(TASK_HEADING_RE.finditer(body))
        tasks = []
        pre = body
        post = ""
        if task_matches:
            first = task_matches[0]
            pre = body[: first.start()]
            for j, tm in enumerate(task_matches):
                tstart = tm.start()
                nxt = task_matches[j + 1].start() if j + 1 < len(task_matches) else len(body)
                block = body[tstart:nxt]
                tasks.append(block)
            # post is already included in the last block (it extends to body end);
            # if we want any trailing "---" separators to survive a move of the
            # last task away, we'd need to detect them. Leave simple for now.
            post = ""

        sections.append({
            "name": m.group(1).strip().lower(),
            "heading_line": heading_line,
            "pre": pre,
            "post": post,
            "original_tasks": tasks,
        })

    # Only reorganize if the three canonical sections all exist.
    section_names = {s["name"] for s in sections}
    if not {"to do", "in progress", "done"}.issubset(section_names):
        return False

    # Re-assign each task to target section per its Status field.
    assigned: dict[str, list[str]] = {s["name"]: [] for s in sections}

    # Keep a map so if target doesn't exist, task stays in origin.
    origin: dict[int, str] = {}
    all_tasks: list[tuple[str, str]] = []  # (target_name, block)
    for s in sections:
        for blk in s["original_tasks"]:
            status_m = re.search(r"\*\*Status\*\*:\s*([a-z-]+)", blk)
            status = status_m.group(1) if status_m else None
            target = STATUS_TO_SECTION.get(status, "")
            if target not in assigned:
                target = s["name"]  # unknown status -> keep where it was
            origin[id(blk)] = s["name"]
            all_tasks.append((target, blk))

    for target, blk in all_tasks:
        assigned[target].append(blk)

    # Short-circuit if nothing moved.
    changed = False
    for s in sections:
        if s["original_tasks"] != assigned[s["name"]]:
            changed = True
            break
    if not changed:
        return False

    # Rebuild file.
    out = [preamble]
    for s in sections:
        out.append(s["heading_line"])
        out.append(s["pre"])
        out.extend(assigned[s["name"]])
        out.append(s["post"])
    new_content = "".join(out)
    if new_content == content:
        return False

    TASKS_FILE.write_text(new_content)
    return True


def get_current_task() -> dict[str, Any] | None:
    content = read_tasks()
    if not content:
        return None

    for task_id, heading, block in _iter_task_blocks(content):
        # Find the Status line inside this block
        m = re.search(r"\*\*Status\*\*:\s*([a-z-]+)", block)
        if not m or m.group(1) != "in-progress":
            continue
        title = heading.split("|", 1)[1].strip() if "|" in heading else ""
        completed = len(re.findall(r"- \[x\]", block, re.IGNORECASE))
        total = len(re.findall(r"- \[[x ]\]", block, re.IGNORECASE))
        return {
            "task_id": task_id,
            "title": title,
            "completed": completed,
            "total": total,
            "block": block,
        }
    return None


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
    PLANNING_DIR.mkdir(parents=True, exist_ok=True)
    NOTES_DIR.mkdir(parents=True, exist_ok=True)
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
    """Append a log line to a named section inside a task block."""
    content = read_tasks()
    if not content:
        return False

    new_content = None
    for tid, heading, block in _iter_task_blocks(content):
        if tid != task_id:
            continue

        section_marker = f"**{section}**:"
        if section_marker in block:
            # Append line right after the section marker line.
            new_block = re.sub(
                rf"(\*\*{re.escape(section)}\*\*:[^\n]*\n)",
                r"\1" + log_line + "\n",
                block,
                count=1,
            )
        elif "**Notes**:" in block:
            # Insert new section at end of block (before any closing content).
            trailing = "\n" + section_marker + "\n" + log_line + "\n"
            new_block = block.rstrip() + trailing + "\n"
        else:
            trailing = "\n**Notes**:\n\n" + section_marker + "\n" + log_line + "\n"
            new_block = block.rstrip() + trailing + "\n"

        new_content = content.replace(block, new_block, 1)
        break

    if new_content is None:
        return False
    try:
        TASKS_FILE.write_text(new_content)
        return True
    except OSError:
        return False


# =============================================================================
# Event handlers
# =============================================================================

def handle_session_start() -> None:
    task = get_current_task()

    print("", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print("TASK-MEMORY SESSION START", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    if not TASKS_FILE.is_file():
        print("\nNo tasks.md found", file=sys.stderr)
        print("Will be created when you start working.", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        return

    if not task:
        print(f"\nPlanning: {TASKS_FILE}", file=sys.stderr)
        print("\nNo in-progress tasks", file=sys.stderr)
        print("Create a task with **Status**: in-progress to start", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        return

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


def handle_pre_tool_use(tool_name: str, tool_input: dict, session_id: str) -> None:
    if tool_name in ("Write", "Edit", "Bash", "Task"):
        task = get_current_task()
        if not task:
            return
        record_session_task(session_id, task["task_id"])
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
            try:
                if reorganize_tasks_file():
                    print(f"[task-memory] reorganized {TASKS_FILE.name} by Status", file=sys.stderr)
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
        print(f"Edit: {TASKS_FILE}", file=sys.stderr)
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
    content = read_tasks()

    existing_titles = set()
    for _, heading, _ in _iter_task_blocks(content):
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
        TASKS_FILE.write_text(new_content)
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

    # Recent research log (last 20 entries)
    content = read_tasks()
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

def handle_stop(session_id: str) -> None:
    task = get_current_task()
    if not task:
        return

    if not was_task_worked_on(session_id, task["task_id"]):
        return

    if task["total"] == 0:
        return

    if task["completed"] == task["total"]:
        reason = (
            f"All {task['total']} subtasks complete for {task['task_id']} but task still "
            f"in-progress. Please: 1) Change Status to done, 2) Move task to Done section, "
            f"3) Add Finished date. Then you may stop."
        )
        print(json.dumps({"decision": "block", "reason": reason}))
        return

    remaining = task["total"] - task["completed"]
    subs = " ".join(f"- {s}" for s in get_incomplete_subtasks(task["block"]))
    reason = (
        f"{task['task_id']} has {remaining} incomplete subtasks: {subs}. "
        f"Complete these subtasks before stopping, or change Status to 'todo' if pausing work."
    )
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
            handle_pre_tool_use(tool_name, tool_input, session_id)
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
