---
description: 5-question reboot test + Context Health Score — verify context before resuming work
---

# /task-status

Quickly verify your context is solid before resuming work.

## Instructions

Invoke the **task-status** skill at `${CLAUDE_PLUGIN_ROOT}/skills/task-status/SKILL.md` for the full procedure. Read it in full — the Context Health Score rubric is defined there.

The skill:

1. Reads `planning/tasks.md`, finds the task with `**Status**: in-progress`
2. Extracts the 5 answers: where am I, where am I going, what's the goal, what have I learned, what have I done
3. Classifies the notes file as **Missing** / **Skeleton** / **Substantive**
4. Detects research gaps (ops ≥ 2 but notes = Missing or Skeleton)
5. Computes the Context Health Score (5 factors, each 1 point):
   - Task has Status: in-progress
   - Task has subtasks defined
   - Pre-Work Checklist completed
   - Notes file exists AND has substantive content
   - No research gap
6. Displays the status block with recovery instructions when health < 5/5

## When to run it

- Starting a new session (the SessionStart hook also shows a notes summary automatically)
- Resuming after a break
- Context feels uncertain
- Before making major decisions
- After the hook shows `⚠️ CONTEXT GAP DETECTED`

## Health score interpretation

- **5/5** ✅ Context verified, ready to continue
- **3-4/5** ⚠️ Usable but degraded — address the missing factor before shipping
- **0-2/5** 🚨 Context is broken — reload or rebuild before proceeding

If the score is below 5, the skill prints explicit recovery steps (which skeleton to fill, which ops log entries to synthesize) before work resumes.
