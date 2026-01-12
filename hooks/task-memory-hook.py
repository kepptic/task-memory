#!/usr/bin/env python3
"""
task-memory-hook.py - Unified hook for task-memory plugin

Handles all hook events:
- SessionStart: Display current task context
- PreToolUse: Refresh context (Write/Edit/Bash) or log research (WebFetch/WebSearch)
- PostToolUse: Remind subtasks (Write/Edit) or log errors (Bash)
- Stop: Verify task completion

https://github.com/kepptic/task-memory | MIT License
"""

import json
import sys
import os
import re
from pathlib import Path
from datetime import datetime

# =============================================================================
# Configuration
# =============================================================================

PROJECT_DIR = Path(os.getenv("CLAUDE_PROJECT_DIR", os.getcwd()))
DEFAULT_TASKS_DIR = "tasks"
RESEARCH_COUNTER_FILE = "/tmp/task-memory-research-count.txt"
PROGRESS_COUNTER_FILE = "/tmp/task-memory-progress-count.txt"


def get_config():
    """Load configuration from .task-memory.json if it exists"""
    config_file = PROJECT_DIR / ".task-memory.json"
    config = {"tasks_dir": DEFAULT_TASKS_DIR}

    if config_file.exists():
        try:
            with open(config_file, 'r') as f:
                config.update(json.load(f))
        except Exception:
            pass

    return config


def get_tasks_dir():
    return PROJECT_DIR / get_config()["tasks_dir"]


def get_kanban_path():
    return get_tasks_dir() / "kanban.md"


def get_findings_dir():
    return get_tasks_dir() / "findings"


# =============================================================================
# Shared Utilities
# =============================================================================

def get_current_task():
    """Get current in-progress task details"""
    kanban_file = get_kanban_path()

    if not kanban_file.exists():
        return None

    with open(kanban_file, 'r') as f:
        content = f.read()

    if "**Status**: in-progress" not in content:
        return None

    lines = content.split('\n')

    for i, line in enumerate(lines):
        if "**Status**: in-progress" in line:
            # Find task header
            task_start = None
            for j in range(i - 1, -1, -1):
                if lines[j].startswith('### TASK-'):
                    task_start = j
                    break

            if task_start is None:
                continue

            # Extract header info
            header = lines[task_start]
            task_id = header.split('|')[0].strip().replace('### ', '')
            task_title = header.split('|')[1].strip() if '|' in header else ""

            # Find task end
            task_end = len(lines)
            for j in range(task_start + 1, len(lines)):
                if lines[j].strip() == '---' or lines[j].startswith('## '):
                    task_end = j
                    break

            task_block = '\n'.join(lines[task_start:task_end])

            # Extract description
            description = ""
            for line in lines[task_start+1:task_end]:
                stripped = line.strip()
                if stripped.startswith('**') and ':' in stripped:
                    continue
                if stripped and not stripped.startswith('-') and not stripped.startswith('#'):
                    description = stripped
                    break

            # Extract subtasks
            subtasks = []
            for match in re.finditer(r'- \[([ x])\] (.+)', task_block):
                subtasks.append({
                    'done': match.group(1) == 'x',
                    'text': match.group(2)
                })

            # Extract recent Visual Operations Log
            recent_ops = []
            if '**Visual Operations Log**:' in task_block:
                log_start = task_block.find('**Visual Operations Log**:')
                for match in re.finditer(r'- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+)', task_block[log_start:]):
                    recent_ops.append({'timestamp': match.group(1), 'action': match.group(2)})

            return {
                'task_id': task_id,
                'title': task_title,
                'description': description,
                'subtasks': subtasks,
                'total': len(subtasks),
                'completed': sum(1 for s in subtasks if s['done']),
                'incomplete': [s for s in subtasks if not s['done']],
                'recent_ops': recent_ops[-3:],
                'kanban_file': kanban_file,
                'task_block': task_block
            }

    return None


def append_log_entry(task_id, log_line, section_name="Visual Operations Log"):
    """Append a log entry to task's specified log section"""
    kanban_file = get_kanban_path()

    try:
        with open(kanban_file, 'r') as f:
            content = f.read()

        # Find task block
        task_pattern = rf'(### {re.escape(task_id)} \|[^\n]*\n.*?)(\n---|\n## |\Z)'
        match = re.search(task_pattern, content, re.DOTALL)

        if not match:
            return False

        task_block = match.group(1)
        section_header = f"**{section_name}**:"

        if section_header in task_block:
            # Append to existing section
            pattern = rf'(\*\*{re.escape(section_name)}\*\*:\n)((?:- [^\n]*\n)*)'
            log_match = re.search(pattern, task_block)

            if log_match:
                old_section = f"{log_match.group(1)}{log_match.group(2)}"
                new_section = f"{log_match.group(1)}{log_match.group(2)}{log_line}\n"
                new_task_block = task_block.replace(old_section, new_section)
            else:
                new_task_block = task_block.replace(section_header, f"{section_header}\n{log_line}")
        elif '**Notes**:' in task_block:
            # Add new section after Notes
            notes_idx = task_block.find('**Notes**:')
            after_notes = task_block[notes_idx + len('**Notes**:'):]
            next_section = re.search(r'\n\*\*[A-Za-z]', after_notes)

            if next_section:
                insert_point = notes_idx + len('**Notes**:') + next_section.start()
                new_task_block = (
                    task_block[:insert_point] +
                    f"\n\n{section_header}\n{log_line}" +
                    task_block[insert_point:]
                )
            else:
                new_task_block = task_block.rstrip() + f"\n\n{section_header}\n{log_line}\n"
        else:
            new_task_block = task_block.rstrip() + f"\n\n**Notes**:\n\n{section_header}\n{log_line}\n"

        new_content = content.replace(task_block, new_task_block)

        with open(kanban_file, 'w') as f:
            f.write(new_content)

        return True

    except Exception as e:
        print(f"Error appending log: {e}", file=sys.stderr)
        return False


def get_counter(counter_file):
    """Get counter value from file"""
    if os.path.exists(counter_file):
        try:
            return int(Path(counter_file).read_text().strip() or "0")
        except:
            return 0
    return 0


def increment_counter(counter_file):
    """Increment and return counter"""
    count = get_counter(counter_file) + 1
    Path(counter_file).write_text(str(count))
    return count


def ensure_tasks_structure():
    """Create tasks directory structure if needed"""
    tasks_dir = get_tasks_dir()
    findings_dir = get_findings_dir()
    kanban_path = get_kanban_path()
    archive_path = tasks_dir / "archive.md"

    tasks_dir.mkdir(parents=True, exist_ok=True)
    findings_dir.mkdir(parents=True, exist_ok=True)

    if not kanban_path.exists():
        kanban_path.write_text("""# Kanban Board

<!-- Config: Last Task ID: 000 -->

## Configuration
**Columns**: To Do | In Progress | Done
**Categories**: Feature, Bug, Docs, Research
**Users**: @user
**Tags**: #feature #bug #docs #research

---

## To Do

---

## In Progress

---

## Done

---
""")
        print(f"✅ Created {kanban_path}", file=sys.stderr)

    if not archive_path.exists():
        archive_path.write_text("""# Task Archive

> Completed and archived tasks with preserved context.

---
""")
        print(f"✅ Created {archive_path}", file=sys.stderr)


# =============================================================================
# Event Handlers
# =============================================================================

def check_for_updates():
    """Check for plugin updates from GitHub releases"""
    try:
        # Import version checker
        import importlib.util
        version_check_path = Path(__file__).parent / "version-check.py"

        if not version_check_path.exists():
            return

        spec = importlib.util.spec_from_file_location("version_check", version_check_path)
        version_check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(version_check)

        update_info = version_check.check_for_updates()
        if update_info:
            print(version_check.format_update_notice(update_info), file=sys.stderr)

    except Exception:
        # Silently fail - don't disrupt workflow
        pass


def handle_session_start(data):
    """Display current task at session start"""
    # Check for updates first
    check_for_updates()

    task = get_current_task()
    kanban_path = get_kanban_path()

    print("\n" + "=" * 60, file=sys.stderr)
    print("📋 TASK-MEMORY SESSION START", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    if not kanban_path.exists():
        print(f"\n⚠️  No kanban.md found", file=sys.stderr)
        print(f"   Will be created when you start working.", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        return

    if not task:
        print(f"\n📂 Kanban: {kanban_path}", file=sys.stderr)
        print(f"\n💤 No in-progress tasks", file=sys.stderr)
        print(f"\n💡 Create a task with **Status**: in-progress to start", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        return

    # Display task info
    print(f"\n🎯 CURRENT: {task['task_id']} | {task['title']}", file=sys.stderr)

    if task['description']:
        print(f"\n📝 Goal: {task['description']}", file=sys.stderr)

    if task['subtasks']:
        bar_filled = int((task['completed'] / task['total']) * 20) if task['total'] > 0 else 0
        bar = '█' * bar_filled + '░' * (20 - bar_filled)
        print(f"\n📊 Progress: [{bar}] {task['completed']}/{task['total']}", file=sys.stderr)

        if task['incomplete']:
            print(f"\n🎯 Next:", file=sys.stderr)
            for s in task['incomplete'][:3]:
                print(f"   - [ ] {s['text']}", file=sys.stderr)
            if len(task['incomplete']) > 3:
                print(f"   ... +{len(task['incomplete']) - 3} more", file=sys.stderr)

    if task['recent_ops']:
        print(f"\n🔍 Recent:", file=sys.stderr)
        for op in task['recent_ops']:
            print(f"   • {op['action']}", file=sys.stderr)

    print("\n" + "=" * 60 + "\n", file=sys.stderr)


def handle_pre_tool_use(data):
    """Handle PreToolUse - context refresh or research logging"""
    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})

    if tool_name in ["Write", "Edit", "Bash"]:
        # Context refresh before implementation
        task = get_current_task()
        if not task:
            return

        print(f"\n{'─'*60}", file=sys.stderr)
        print(f"📋 TASK: {task['task_id']} | {task['title']}", file=sys.stderr)
        print(f"{'─'*60}", file=sys.stderr)

        if task['description']:
            print(f"\n📝 Goal: {task['description']}", file=sys.stderr)

        if task['incomplete']:
            print(f"\n✅ Progress: {task['completed']}/{task['total']} | Remaining:", file=sys.stderr)
            for s in task['incomplete'][:5]:
                print(f"   - [ ] {s['text']}", file=sys.stderr)
            if len(task['incomplete']) > 5:
                print(f"   ... +{len(task['incomplete']) - 5} more", file=sys.stderr)

        print(f"{'─'*60}\n", file=sys.stderr)

    elif tool_name in ["WebFetch", "WebSearch"]:
        # Research logging + 2-Action Rule
        ensure_tasks_structure()

        count = increment_counter(RESEARCH_COUNTER_FILE)
        task = get_current_task()

        # Format log entry
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if tool_name == "WebFetch":
            url = tool_input.get("url", "unknown")
            log_line = f"- {timestamp} - WebFetch: {url}"
        else:
            query = tool_input.get("query", "unknown")
            log_line = f'- {timestamp} - WebSearch: "{query}"'

        # Append to task
        if task:
            if append_log_entry(task['task_id'], log_line, "Visual Operations Log"):
                print(f"✅ Logged to {task['task_id']}: {log_line}", file=sys.stderr)

        # 2-Action Rule reminder
        if count % 2 == 0:
            findings_dir = get_findings_dir()

            print("\n" + "=" * 60, file=sys.stderr)
            print("🔔 2-ACTION RULE: TIME TO PRESERVE RESEARCH", file=sys.stderr)
            print("=" * 60, file=sys.stderr)
            print(f"\n📊 Operations count: {count}", file=sys.stderr)

            if task:
                print(f"📋 Task: {task['task_id']}", file=sys.stderr)
                findings_path = findings_dir / f"{task['task_id']}.md"
            else:
                print("⚠️  No in-progress task", file=sys.stderr)
                findings_path = findings_dir / "TASK-XXX.md"

            print(f"\n✅ Create/update: {findings_path}", file=sys.stderr)
            print("\n💡 Preserve: observations, decisions, issues, resources", file=sys.stderr)
            print("=" * 60 + "\n", file=sys.stderr)


def handle_post_tool_use(data):
    """Handle PostToolUse - subtask reminders or error logging"""
    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})
    tool_result = data.get("tool_result", "")

    if tool_name in ["Write", "Edit"]:
        # Subtask reminder (every 3rd operation)
        task = get_current_task()
        if not task or not task['incomplete']:
            return

        count = increment_counter(PROGRESS_COUNTER_FILE)
        if count % 3 != 0:
            return

        print(f"\n{'─'*50}", file=sys.stderr)
        print(f"✅ UPDATE SUBTASKS? ({task['task_id']})", file=sys.stderr)
        print(f"{'─'*50}", file=sys.stderr)
        print(f"\nMark completed items [x]:", file=sys.stderr)
        for s in task['incomplete'][:4]:
            print(f"   - [ ] {s['text']}", file=sys.stderr)
        if len(task['incomplete']) > 4:
            print(f"   ... +{len(task['incomplete']) - 4} more", file=sys.stderr)
        print(f"\n📝 Edit: {task['kanban_file']}", file=sys.stderr)
        print(f"{'─'*50}\n", file=sys.stderr)

    elif tool_name == "Bash":
        # Error logging
        result_str = str(tool_result)

        # Check for error indicators
        if not any(kw in result_str.lower() for kw in ['error', 'exit code', 'failed', 'exception', 'not found', 'denied']):
            return

        task = get_current_task()
        if not task:
            return

        # Extract error summary
        command = tool_input.get("command", "unknown")[:60]
        if len(tool_input.get("command", "")) > 60:
            command += "..."

        error_msg = "see output"
        for line in result_str.split('\n'):
            line_lower = line.lower()
            if any(kw in line_lower for kw in ['error', 'failed', 'not found', 'denied', 'exception']):
                error_msg = line.strip()[:80]
                break

        # Format and append
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_line = f"- {timestamp} - `{command}` → {error_msg}"

        if append_log_entry(task['task_id'], log_line, "Errors Log"):
            print(f"\n⚠️  Error logged to {task['task_id']}", file=sys.stderr)
            print(f"   {error_msg}", file=sys.stderr)


def handle_stop(data):
    """Verify task completion before stopping"""
    task = get_current_task()

    print("\n" + "=" * 60, file=sys.stderr)
    print("🔍 TASK COMPLETION CHECK", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    if not task:
        print(f"\n✅ No in-progress tasks", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        sys.exit(0)

    if not task['subtasks']:
        print(f"\n✅ {task['task_id']} has no subtasks", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        sys.exit(0)

    if not task['incomplete']:
        print(f"\n✅ {task['task_id']} - all {task['total']} subtasks complete", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        sys.exit(0)

    # Incomplete subtasks - warn and block
    print(f"\n⚠️  INCOMPLETE: {task['task_id']} | {task['title']}", file=sys.stderr)
    print(f"\n📊 Progress: {task['completed']}/{task['total']}", file=sys.stderr)
    print(f"\n🎯 Remaining:", file=sys.stderr)
    for s in task['incomplete'][:5]:
        print(f"   - [ ] {s['text']}", file=sys.stderr)
    if len(task['incomplete']) > 5:
        print(f"   ... +{len(task['incomplete']) - 5} more", file=sys.stderr)

    print(f"\n❌ Complete subtasks before stopping", file=sys.stderr)
    print(f"\n💡 Or move task to 'To Do' if pausing", file=sys.stderr)
    print("=" * 60 + "\n", file=sys.stderr)

    sys.exit(1)  # Block stop


# =============================================================================
# Main Entry Point
# =============================================================================

def main():
    try:
        input_data = json.load(sys.stdin)
        hook_event = input_data.get("hook_event_name", "")

        if hook_event == "SessionStart":
            handle_session_start(input_data)
        elif hook_event == "PreToolUse":
            handle_pre_tool_use(input_data)
        elif hook_event == "PostToolUse":
            handle_post_tool_use(input_data)
        elif hook_event == "Stop":
            handle_stop(input_data)

        sys.exit(0)

    except json.JSONDecodeError:
        # No stdin data (shouldn't happen)
        sys.exit(0)
    except Exception as e:
        print(f"Hook error (non-blocking): {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
