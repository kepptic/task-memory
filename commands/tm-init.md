---
description: Initialize task-memory in the current project — detect monorepo, ask configuration questions, set up planning directory, and update CLAUDE.md
argument-hint: "[optional: planning directory path]"
---

# /tm-init

Bootstrap task-memory in the current project.

## Instructions

Invoke the **tm-init** skill for the full interactive setup. The skill lives at `${CLAUDE_PLUGIN_ROOT}/skills/tm-init/SKILL.md` — read it in full before proceeding; do not improvise the tasks.md template.

The skill will:

1. Detect project type (monorepo vs single, existing planning directories, existing CLAUDE.md)
2. Ask three configuration questions via AskUserQuestion (planning location, monorepo mode, task-ID prefix)
3. Create `planning/tasks.md` using the canonical template — **do not overwrite an existing tasks.md; ask first**
4. Create `planning/archive.md` and `planning/notes/`
5. Append (never overwrite) the task-memory integration section to CLAUDE.md, including Session Start Protocol, Task vs. Question triage, and Context Preservation Protocol
6. Drop a `.task-memory.json` only if the planning location isn't the default

## Notes

- Renamed from `/task-memory-init` in 2.0 to avoid colliding with Claude Code's built-in `/init`
- Respects existing content: if `planning/tasks.md` already has tasks, skip creation and tell the user the project is already initialized
- For monorepos, the Hybrid mode (root + per-package) is recommended when cross-cutting work mixes with package-specific work

After setup, run `/task-memory` to create the first task or `/task-status` to verify context.
