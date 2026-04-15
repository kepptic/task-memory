#!/usr/bin/env bash
# skill-eval.sh - Provide task context on every user prompt.
# https://github.com/kepptic/task-memory | MIT License

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
input="$(cat)"

# Use jq if available, fall back to python for robust JSON parsing.
parse() {
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$input" | jq -r ".${key} // empty" 2>/dev/null
  else
    printf '%s' "$input" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('${key}','') or '')" 2>/dev/null
  fi
}

hook_event="$(parse hook_event_name)"
prompt="$(parse prompt)"
[ "$hook_event" = "UserPromptSubmit" ] || exit 0
[[ "$prompt" == /* ]] && exit 0

# Delegate task context rendering to the main Python hook via a synthesized event.
HOOK="$(dirname "$0")/task-memory-hook.py"
[ -x "$HOOK" ] || chmod +x "$HOOK" 2>/dev/null
printf '{"hook_event_name":"SessionStart","session_id":""}' | "$HOOK" 2>&1
exit 0
