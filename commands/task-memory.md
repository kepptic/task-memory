---
description: Full task-memory workflow — create, update, or complete a task with structural context preservation
argument-hint: "[optional: task action or TASK-XXX reference]"
---

# /task-memory

Create or work on a task in `planning/tasks.md` with automatic research preservation.

## Instructions

Invoke the **task-memory** skill at `${CLAUDE_PLUGIN_ROOT}/skills/task-memory/SKILL.md` for the full workflow. Read it in full before proceeding — the format rules and the Context Preservation Protocol are not optional.

The skill enforces:

1. **Task vs Question triage** — create a task for implement/fix/build/refactor/migrate; answer directly for what/how/why/explain; ask a clarifying question for ambiguous requests
2. **Task creation rules** — actionable (What/Where/Why/Done-when), classified by workflow type (Feature/Refactor/Investigation/Migration/Simple) and complexity (Simple/Standard/Complex)
3. **Phase dependencies** for complex work: `(depends: Phase X)` syntax
4. **Pre-Work Checklist** before coding: read relevant files, searched similar implementations, identified patterns, reviewed gotchas
5. **Self-critique checklist** before marking `Status: done`

## Context Preservation — what the hook automates

You do **not** need to remember these; the hook handles them:

- Every WebFetch / WebSearch → logged to `**Visual Operations Log**` with URL/query + ≤120-char response snippet
- Every 2 research ops → `planning/notes/TASK-XXX.md` skeleton auto-created
- PreCompact → snapshot saved to `notes/TASK-XXX-precompact-TIMESTAMP.md`; recent ops appended to main notes
- SessionStart → displays current task + notes summary OR warns `⚠️ CONTEXT GAP DETECTED`
- Stop with research ops → **BLOCKS** if notes file is empty/skeleton

## What you must still do

Synthesis. Fill in **Patterns**, **Gotchas**, **Decisions** in the notes file. The log captures *what* you did; the notes capture *so what*. Be specific — "3-panel layout: 250px left nav, fluid center, 300px right panel" not "looked at layout."

## Status field is authoritative

Change `**Status**: todo` → `**Status**: in-progress` → `**Status**: done`. The UI auto-reorganizes mismatches, but keeping sections in sync improves file readability. Reference the task ID in every commit: `feat: description (TASK-XXX)`.

## See also

- `/task-status` — Context Health Score (0-5) and 5-question reboot test
- `/tm-init` — initial setup for a new project
