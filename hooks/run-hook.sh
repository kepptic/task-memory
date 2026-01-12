#!/bin/bash
# run-hook.sh - Wrapper script for task-memory Python hooks
# Checks for python3 availability and runs the specified hook script
#
# Usage: run-hook.sh <script-name>
# Example: run-hook.sh skill-eval.py

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="${1:-}"

# Check if script name provided
if [ -z "$SCRIPT_NAME" ]; then
    echo "task-memory: No script specified" >&2
    exit 0
fi

SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_NAME"

# Check if script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "task-memory: Script not found: $SCRIPT_NAME" >&2
    exit 0
fi

# Check for python3
if ! command -v python3 &> /dev/null; then
    # Only warn once per session (use temp file as flag)
    WARN_FLAG="/tmp/task-memory-python-warn"
    if [ ! -f "$WARN_FLAG" ]; then
        echo "" >&2
        echo "⚠️  task-memory: python3 not found" >&2
        echo "   Install Python 3 to enable task tracking features" >&2
        echo "   macOS: brew install python3" >&2
        echo "   Ubuntu: sudo apt install python3" >&2
        echo "" >&2
        touch "$WARN_FLAG"
    fi
    # Exit 0 so hook doesn't block Claude
    exit 0
fi

# Check Python version (need 3.6+ for f-strings)
PYTHON_VERSION=$(python3 -c 'import sys; print(sys.version_info.minor)' 2>/dev/null)
if [ -n "$PYTHON_VERSION" ] && [ "$PYTHON_VERSION" -lt 6 ]; then
    echo "task-memory: Python 3.6+ required (found 3.$PYTHON_VERSION)" >&2
    exit 0
fi

# Run the hook script
exec python3 "$SCRIPT_PATH"
