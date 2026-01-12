#!/usr/bin/env python3
"""
version-check.py - Check for task-memory updates from GitHub releases

Compares local version against latest GitHub release.
Shows update notification if newer version available.

https://github.com/kepptic/task-memory | MIT License
"""

import json
import sys
import os
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError
import ssl

# =============================================================================
# Configuration
# =============================================================================

GITHUB_REPO = "kepptic/task-memory"
GITHUB_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
CHECK_INTERVAL_HOURS = 24
LAST_CHECK_FILE = "/tmp/task-memory-version-check"

SCRIPT_DIR = Path(__file__).parent
PLUGIN_ROOT = SCRIPT_DIR.parent
PLUGIN_JSON = PLUGIN_ROOT / ".claude-plugin" / "plugin.json"


def get_local_version():
    """Get version from plugin.json"""
    if not PLUGIN_JSON.exists():
        return None

    try:
        with open(PLUGIN_JSON, 'r') as f:
            data = json.load(f)
            return data.get("version", "0.0.0")
    except Exception:
        return None


def parse_version(version_str):
    """Parse version string to tuple for comparison"""
    if not version_str:
        return (0, 0, 0)

    # Remove 'v' prefix if present
    version_str = version_str.lstrip('v')

    try:
        parts = version_str.split('.')
        return tuple(int(p) for p in parts[:3])
    except (ValueError, AttributeError):
        return (0, 0, 0)


def should_check():
    """Check if enough time has passed since last check"""
    if not os.path.exists(LAST_CHECK_FILE):
        return True

    try:
        last_check = os.path.getmtime(LAST_CHECK_FILE)
        import time
        elapsed_hours = (time.time() - last_check) / 3600
        return elapsed_hours >= CHECK_INTERVAL_HOURS
    except Exception:
        return True


def mark_checked():
    """Update last check timestamp"""
    try:
        Path(LAST_CHECK_FILE).touch()
    except Exception:
        pass


def get_latest_release():
    """Fetch latest release info from GitHub API"""
    try:
        # Create SSL context that works on most systems
        ctx = ssl.create_default_context()

        req = Request(
            GITHUB_API,
            headers={
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'task-memory-updater'
            }
        )

        with urlopen(req, timeout=5, context=ctx) as response:
            data = json.loads(response.read().decode('utf-8'))
            return {
                'version': data.get('tag_name', '').lstrip('v'),
                'name': data.get('name', ''),
                'url': data.get('html_url', ''),
                'published': data.get('published_at', '')[:10]
            }
    except (URLError, json.JSONDecodeError, KeyError, TimeoutError):
        return None
    except Exception:
        return None


def check_for_updates():
    """Main update check logic"""
    # Only check periodically
    if not should_check():
        return None

    mark_checked()

    local_version = get_local_version()
    if not local_version:
        return None

    latest = get_latest_release()
    if not latest or not latest.get('version'):
        return None

    local_tuple = parse_version(local_version)
    latest_tuple = parse_version(latest['version'])

    if latest_tuple > local_tuple:
        return {
            'local': local_version,
            'latest': latest['version'],
            'name': latest.get('name', ''),
            'url': latest.get('url', f'https://github.com/{GITHUB_REPO}/releases'),
            'published': latest.get('published', '')
        }

    return None


def format_update_notice(update_info):
    """Format update notification message"""
    lines = [
        "",
        "=" * 50,
        "📦 task-memory UPDATE AVAILABLE",
        "=" * 50,
        "",
        f"   Current: v{update_info['local']}",
        f"   Latest:  v{update_info['latest']}",
    ]

    if update_info.get('name'):
        lines.append(f"   Release: {update_info['name']}")

    if update_info.get('published'):
        lines.append(f"   Date:    {update_info['published']}")

    lines.extend([
        "",
        "   Update with:",
        "   /plugin update task-memory",
        "",
        f"   {update_info.get('url', '')}",
        "=" * 50,
        ""
    ])

    return '\n'.join(lines)


def main():
    """Check for updates and print notification if available"""
    try:
        update_info = check_for_updates()

        if update_info:
            # Print to stderr so user sees it
            print(format_update_notice(update_info), file=sys.stderr)

        sys.exit(0)

    except Exception:
        # Silently fail - don't disrupt user workflow
        sys.exit(0)


if __name__ == "__main__":
    main()
