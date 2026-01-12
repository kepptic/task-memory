#!/usr/bin/env python3
"""
task-memory.py - Log research operations to your current task

Logs WebFetch/WebSearch to the in-progress task's Notes in kanban.md.
Reminds you to save findings every 2 operations (Manus 2-Action Rule).

https://github.com/kepptic/task-memory | MIT License
"""

import json
import sys
import os
import re
from pathlib import Path
from datetime import datetime

# Configuration
PROJECT_DIR = Path(os.getenv("CLAUDE_PROJECT_DIR", os.getcwd()))
COUNTER_FILE = "/tmp/claude-visual-ops-session.txt"

# Default task directory - can be overridden via .task-memory.json
DEFAULT_TASKS_DIR = "tasks"

def get_config():
    """Load configuration from .task-memory.json if it exists"""
    config_file = PROJECT_DIR / ".task-memory.json"

    default_config = {
        "tasks_dir": DEFAULT_TASKS_DIR,  # Where kanban.md, archive.md, and findings/ live
    }

    if config_file.exists():
        try:
            with open(config_file, 'r') as f:
                user_config = json.load(f)
                default_config.update(user_config)
        except Exception as e:
            print(f"Warning: Could not read .task-memory.json: {e}", file=sys.stderr)

    return default_config

def get_tasks_dir():
    """Get the tasks directory path"""
    config = get_config()
    return PROJECT_DIR / config["tasks_dir"]

def get_kanban_path():
    """Get path to kanban.md"""
    return get_tasks_dir() / "kanban.md"

def get_findings_dir():
    """Get path to findings directory"""
    return get_tasks_dir() / "findings"

def ensure_tasks_structure():
    """Create tasks directory structure if it doesn't exist"""
    tasks_dir = get_tasks_dir()
    findings_dir = get_findings_dir()
    kanban_path = get_kanban_path()
    archive_path = tasks_dir / "archive.md"

    # Create directories
    tasks_dir.mkdir(parents=True, exist_ok=True)
    findings_dir.mkdir(parents=True, exist_ok=True)

    # Create kanban.md if it doesn't exist
    if not kanban_path.exists():
        today = datetime.now().strftime("%Y-%m-%d")
        kanban_template = f"""# Kanban Board

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
"""
        with open(kanban_path, 'w') as f:
            f.write(kanban_template)
        print(f"✅ Created {kanban_path}", file=sys.stderr)

    # Create archive.md if it doesn't exist
    if not archive_path.exists():
        archive_template = """# Task Archive

> Completed and archived tasks with preserved context.

---
"""
        with open(archive_path, 'w') as f:
            f.write(archive_template)
        print(f"✅ Created {archive_path}", file=sys.stderr)

def get_visual_ops_count():
    """Get current visual operations count"""
    if os.path.exists(COUNTER_FILE):
        with open(COUNTER_FILE, 'r') as f:
            return int(f.read().strip() or "0")
    return 0

def increment_visual_ops():
    """Increment visual operations counter"""
    count = get_visual_ops_count() + 1
    with open(COUNTER_FILE, 'w') as f:
        f.write(str(count))
    return count

def reset_visual_ops():
    """Reset visual operations counter (called after findings file creation)"""
    if os.path.exists(COUNTER_FILE):
        os.remove(COUNTER_FILE)

def get_current_task():
    """Extract current TASK-XXX from in-progress tasks"""
    kanban_file = get_kanban_path()

    if not kanban_file.exists():
        return None, None

    with open(kanban_file, 'r') as f:
        content = f.read()

        # Look for in-progress tasks (task-memory format)
        if "**Status**: in-progress" in content:
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if "**Status**: in-progress" in line:
                    # Look backwards for TASK-XXX header
                    for j in range(i - 1, -1, -1):
                        if lines[j].startswith('### TASK-'):
                            task_id = lines[j].split('|')[0].strip().replace('### ', '')
                            return task_id, kanban_file

    return None, None

def append_log_to_kanban(kanban_file, task_id, log_line):
    """Append log entry to task's Notes section in kanban"""
    try:
        with open(kanban_file, 'r') as f:
            content = f.read()

        # Find task block (from ### TASK-XXX until next --- or ## section)
        task_pattern = rf'(### {re.escape(task_id)} \|[^\n]*\n.*?)(\n---|\n## |\Z)'
        match = re.search(task_pattern, content, re.DOTALL)

        if not match:
            print(f"Warning: Could not find task {task_id} in {kanban_file}", file=sys.stderr)
            return False

        task_block = match.group(1)

        # Check if Visual Operations Log section already exists in task
        if '**Visual Operations Log**:' in task_block:
            # Find the log section and append to it
            log_pattern = r'(\*\*Visual Operations Log\*\*:\n)((?:- [^\n]*\n)*)'
            log_match = re.search(log_pattern, task_block)

            if log_match:
                existing_log_header = log_match.group(1)
                existing_log_entries = log_match.group(2)
                new_log_section = f"{existing_log_header}{existing_log_entries}{log_line}\n"
                new_task_block = task_block.replace(
                    f"{existing_log_header}{existing_log_entries}",
                    new_log_section
                )
            else:
                new_task_block = task_block.replace(
                    "**Visual Operations Log**:",
                    f"**Visual Operations Log**:\n{log_line}"
                )
        elif '**Notes**:' in task_block:
            # Notes exists but no Visual Operations Log - add it after Notes content
            # Find the end of the Notes section (next ** field or end of block)
            notes_idx = task_block.find('**Notes**:')
            after_notes = task_block[notes_idx + len('**Notes**:'):]

            # Find where next section starts (if any)
            next_section = re.search(r'\n\*\*[A-Za-z]', after_notes)
            if next_section:
                insert_point = notes_idx + len('**Notes**:') + next_section.start()
                new_task_block = (
                    task_block[:insert_point] +
                    f"\n\n**Visual Operations Log**:\n{log_line}" +
                    task_block[insert_point:]
                )
            else:
                # No next section, append at end
                new_task_block = task_block.rstrip() + f"\n\n**Visual Operations Log**:\n{log_line}\n"
        else:
            # No Notes section - add Notes with Visual Operations Log at end of task
            new_task_block = task_block.rstrip() + f"\n\n**Notes**:\n\n**Visual Operations Log**:\n{log_line}\n"

        # Replace in full content
        new_content = content.replace(task_block, new_task_block)

        # Write back to file
        with open(kanban_file, 'w') as f:
            f.write(new_content)

        return True

    except Exception as e:
        print(f"Error appending log to kanban: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return False

def main():
    try:
        # Read tool input from stdin
        tool_input = json.loads(sys.stdin.read())
        tool_name = tool_input.get("tool_name", "")
        tool_params = tool_input.get("tool_input", {})

        # Only track WebFetch and WebSearch (visual/browser operations)
        if tool_name not in ["WebFetch", "WebSearch"]:
            sys.exit(0)

        # Ensure tasks directory structure exists
        ensure_tasks_structure()

        # Get current count before incrementing
        count = increment_visual_ops()
        task_id, kanban_file = get_current_task()

        # Format log entry
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if tool_name == "WebFetch":
            url = tool_params.get("url", "unknown")
            log_line = f"- {timestamp} - WebFetch: {url}"
        else:  # WebSearch
            query = tool_params.get("query", "unknown")
            log_line = f'- {timestamp} - WebSearch: "{query}"'

        # Append to kanban Notes section if task found
        if task_id and kanban_file:
            success = append_log_to_kanban(kanban_file, task_id, log_line)
            if success:
                print(f"✅ Logged to {task_id}: {log_line}", file=sys.stderr)

        # Reminder after every 2 operations
        if count % 2 == 0:
            findings_dir = get_findings_dir()

            print("\n" + "="*70, file=sys.stderr)
            print("🔔 MANUS 2-ACTION RULE: TIME TO PRESERVE RESEARCH", file=sys.stderr)
            print("="*70, file=sys.stderr)
            print(f"\n📊 Visual operations count: {count}", file=sys.stderr)

            if task_id:
                print(f"📋 Current task: {task_id}", file=sys.stderr)
                print(f"📝 Logs appended to: {kanban_file.name} → {task_id} Notes", file=sys.stderr)
                findings_path = findings_dir / f"{task_id}.md"
            else:
                print("⚠️  No in-progress task found in kanban", file=sys.stderr)
                findings_path = findings_dir / "TASK-XXX.md"

            print(f"\n✅ NEXT STEP: Create or update findings file", file=sys.stderr)
            print(f"   Location: {findings_path}", file=sys.stderr)
            print("\n📝 Template sections:", file=sys.stderr)
            print("   - Visual Analysis (timestamped observations)", file=sys.stderr)
            print("   - Technical Decisions (with rationale)", file=sys.stderr)
            print("   - Issues Discovered (impact + resolution)", file=sys.stderr)
            print("   - Resources (links to screenshots, docs)", file=sys.stderr)

            print("\n💡 Why this matters:", file=sys.stderr)
            print("   Multimodal content (screenshots, PDFs, browser results)", file=sys.stderr)
            print("   doesn't persist across sessions. Text persists forever.", file=sys.stderr)

            print("\n📖 Reset counter after creating findings:", file=sys.stderr)
            print(f"   rm {COUNTER_FILE}", file=sys.stderr)
            print("="*70 + "\n", file=sys.stderr)

        # Always allow operation (exit 0)
        sys.exit(0)

    except Exception as e:
        # Log error but don't block operation
        print(f"Hook error (non-blocking): {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(0)

if __name__ == "__main__":
    main()
