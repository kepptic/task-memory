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
session_id="$(parse session_id)"
[ "$hook_event" = "UserPromptSubmit" ] || exit 0
[[ "$prompt" == /* ]] && exit 0

# Delegate task context rendering to the main Python hook.
#
# Until v3.7.0 this synthesized a SessionStart with an empty session_id, so
# every single user prompt ran a full session-start pass: stale-state GC plus
# a notes skeleton for every in-progress task, and with no session id the hook
# could never tell which task this session was actually on. UserPromptSubmit
# now maps to its own read-only handler, and the real session id goes with it
# so the focus pin and session stamp resolve.
HOOK="$(dirname "$0")/task-memory-hook.py"
[ -x "$HOOK" ] || chmod +x "$HOOK" 2>/dev/null
printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s"}' "$session_id" | "$HOOK" 2>&1
exit 0
