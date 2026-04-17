---
name: task-status
version: "2.0.0"
description: Provides quick context verification using the 5-Question Reboot Test plus Context Health Score. Validates that notes files exist and have substantive content, flags research gaps (ops logged without notes), shows workflow type, complexity, phase dependencies, and remaining subtasks. Use when starting new sessions, resuming after breaks, when context feels uncertain, or before making major implementation decisions.
user-invocable: true
allowed-tools:
  - Read
  - Glob
---

# /task-status - 5-Question Reboot Test + Context Health Check

Quickly verify your context is solid. The old test asked 5 questions. The new test also computes a **Context Health Score** so you know when preservation has leaked.

## Quick Start

When invoked, perform these steps:

### Step 1: Read Tasks

```
Read planning/tasks.md
```

Find the task with `**Status**: in-progress`

### Step 2: Extract the 5 Answers

| Question | Source | Extract |
|----------|--------|---------|
| Where am I? | First unchecked subtask | Current phase |
| Where am I going? | Remaining subtasks with dependencies | What's left |
| What's the goal? | Task description | Why we're doing this |
| What have I learned? | notes/TASK-XXX.md (Patterns, Gotchas, Decisions) | Synthesized insights |
| What have I done? | Visual Operations Log (with response snippets) | Recent actions + results |

Also extract:
- **Workflow type** (Feature/Refactor/Investigation/Migration/Simple)
- **Complexity** (Simple/Standard/Complex)
- **Pre-Work Checklist** status
- **Phase dependencies** for remaining subtasks

### Step 3: Check Notes File — Quality Validation

Read `planning/notes/TASK-XXX.md` and classify it:

| State | Criteria | Score |
|-------|----------|-------|
| **Missing** | File does not exist | 0/3 |
| **Skeleton** | File exists but all sections are placeholder italics or empty bullets | 1/3 |
| **Substantive** | Each required section (Patterns, Gotchas, Decisions) has at least one real bullet | 3/3 |

Count Visual Operations Log entries. If ops ≥ 2 but notes = Missing or Skeleton, this is a **research gap** — insights from earlier operations were never synthesized.

### Step 4: Compute Context Health Score

A simple 5-factor score out of 5. Each factor worth 1 point:

```
☐ Task has Status: in-progress                        (1 pt)
☐ Task has subtasks defined                           (1 pt)
☐ Pre-Work Checklist completed                        (1 pt)
☐ Notes file exists AND has substantive content       (1 pt)
☐ No research gap (ops/notes ratio healthy)           (1 pt)
```

- **5/5** ✅ Context verified, ready to continue
- **3-4/5** ⚠️  Usable but degraded — note the missing factor
- **0-2/5** 🚨 Context is broken — reload or rebuild before proceeding

### Step 5: Display Status

```
═══════════════════════════════════════════════════════════════
📋 TASK STATUS: TASK-XXX | [Title]
═══════════════════════════════════════════════════════════════
Workflow: [Type] | Complexity: [Level] | Pre-Work: [✓/✗]
Context Health: [N/5] [✅|⚠️|🚨]
═══════════════════════════════════════════════════════════════

1️⃣  WHERE AM I?
    Current phase: [First unchecked subtask]
    Progress: [X/Y] subtasks complete
    Dependencies: [Any blockers for current phase]

2️⃣  WHERE AM I GOING?
    Remaining:
    - [ ] [Subtask 1]
    - [ ] [Subtask 2] (depends: Subtask 1)
    - [ ] [Subtask 3] (depends: Subtask 2)

3️⃣  WHAT'S THE GOAL?
    [Task description from tasks.md]

4️⃣  WHAT HAVE I LEARNED?
    Notes state: [Substantive | Skeleton | Missing]
    Patterns: [From notes file]
    Gotchas: [From notes file]
    Decisions: [From notes file]

5️⃣  WHAT HAVE I DONE?
    Recent operations (with response previews):
    - [Last 3-5 Visual Operations Log entries including => snippets]

───────────────────────────────────────────────────────────────
Context Gaps (if any):
- [List any missing/skeleton notes, ops without synthesis, etc.]

═══════════════════════════════════════════════════════════════
✅ Context verified | Ready to continue
═══════════════════════════════════════════════════════════════
```

---

## When Context Is Degraded

If Context Health < 5/5, display explicit recovery instructions:

```
═══════════════════════════════════════════════════════════════
⚠️  CONTEXT HEALTH: 2/5
═══════════════════════════════════════════════════════════════

Missing factors:
❌ Notes file is empty skeleton (planning/notes/TASK-005.md)
❌ Research gap: 4 ops logged, no synthesis captured
❌ Pre-Work Checklist incomplete

Recommended actions (in order):
1. Open Visual Operations Log in tasks.md — read the captured snippets
2. Synthesize into notes/TASK-005.md:
   - What PATTERN emerges from those 4 ops?
   - What GOTCHA to record?
   - What DECISIONS follow?
3. Complete Pre-Work Checklist before resuming coding
4. Re-run /task-status to re-verify

═══════════════════════════════════════════════════════════════
```

### When Context Is Broken (0-1/5)

```
═══════════════════════════════════════════════════════════════
🚨 CONTEXT CHECK FAILED
═══════════════════════════════════════════════════════════════

Cannot proceed safely. Missing:
- [ ] No in-progress task found
- [ ] Task has no subtasks defined
- [ ] No operations log, no notes

Recommended actions:
1. Review planning/tasks.md for task status
2. If work was in progress, find most recent precompact snapshot:
   ls planning/notes/*-precompact-*.md
3. Add subtasks to break down the work
4. Start from the beginning with /task-memory

═══════════════════════════════════════════════════════════════
```

---

## When to Use

Run `/task-status` when:
- Starting a new session (the SessionStart hook also shows notes summary automatically)
- Resuming after a break
- Context feels uncertain
- Before making major decisions
- After the hook displays a "CONTEXT GAP DETECTED" warning

---

## Example Output — Healthy Context

```
═══════════════════════════════════════════════════════════════
📋 TASK STATUS: TASK-004 | Fix hook functionality
═══════════════════════════════════════════════════════════════
Workflow: Investigation | Complexity: Standard | Pre-Work: ✓
Context Health: 5/5 ✅
═══════════════════════════════════════════════════════════════

1️⃣  WHERE AM I?
    Current phase: Test WebSearch logging
    Progress: 1/3 subtasks complete
    Dependencies: None (ready to proceed)

2️⃣  WHERE AM I GOING?
    Remaining:
    - [ ] Test WebSearch logging
    - [ ] Verify 2-Action Rule reminder (depends: Test WebSearch)

3️⃣  WHAT'S THE GOAL?
    Ensure PostToolUse hook correctly logs research operations
    to the Visual Operations Log in tasks.md.

4️⃣  WHAT HAVE I LEARNED?
    Notes state: Substantive
    Patterns:
      - Hook receives tool_response as dict with 'result'/'content' keys
      - Snippet captured via stripping newlines + truncating to 120 chars
    Gotchas:
      - Must check planning/ directory exists before writing (mkdir -p)
      - `task_files_glob` bypass: don't auto-create in multi-file mode
    Decisions:
      - Chose append-not-replace strategy for log entries

5️⃣  WHAT HAVE I DONE?
    Recent operations:
    - 2026-04-16 10:30:45 - WebFetch: https://docs.example.com
        => Hook reference: PreToolUse receives tool_name, tool_input...
    - 2026-04-16 10:31:22 - WebSearch: "Claude Code hooks JSON output"
        => Results mention `decision: block` for PreToolUse...

═══════════════════════════════════════════════════════════════
✅ Context verified | Ready to continue
═══════════════════════════════════════════════════════════════
```

---

## Example Output — Degraded Context (Research Gap)

```
═══════════════════════════════════════════════════════════════
📋 TASK STATUS: TASK-007 | Migrate auth to JWT
═══════════════════════════════════════════════════════════════
Workflow: Migration | Complexity: Complex | Pre-Work: ✗
Context Health: 2/5 ⚠️
═══════════════════════════════════════════════════════════════

1️⃣  WHERE AM I?
    Current phase: Choose JWT library
    Progress: 0/5 subtasks complete

2️⃣  WHERE AM I GOING?
    Remaining:
    - [ ] Phase 1: Choose JWT library
    - [ ] Phase 2: Define token schema (depends: Phase 1)
    - [ ] Phase 3: Implement refresh flow (depends: Phase 2)
    ...

3️⃣  WHAT'S THE GOAL?
    Replace session-based auth with JWT to enable multi-node scale.

4️⃣  WHAT HAVE I LEARNED?
    Notes state: Skeleton (file exists but sections are empty placeholders)
    ⚠️  6 research operations were logged but synthesis is empty.
    ⚠️  Session reload cannot recover what you learned.

5️⃣  WHAT HAVE I DONE?
    Recent operations:
    - 2026-04-15 14:20 - WebFetch: jwt.io/introduction
        => JWT consists of Header.Payload.Signature, signed with secret...
    - 2026-04-15 14:25 - WebSearch: "jose vs jsonwebtoken"
        => jose is active, jsonwebtoken legacy but more adopted...
    - 2026-04-15 14:32 - WebFetch: npmjs.com/package/jose
        => Supports RS256, ES256, EdDSA; built on web crypto API...
    (3 more operations)

───────────────────────────────────────────────────────────────
Context Gaps:
❌ Notes skeleton is empty — 6 ops worth of research unsynthesized
❌ Pre-Work Checklist incomplete — go read auth/ folder first

Recommended recovery:
1. Read the response snippets above
2. Fill in notes/TASK-007.md:
   - Pattern: "jose library for RS256/ES256, use web crypto API"
   - Gotcha: "jsonwebtoken is legacy — avoid for new code"
   - Decision: "Choose jose for modern algorithm support"
3. Complete Pre-Work Checklist
4. Re-run /task-status

═══════════════════════════════════════════════════════════════
```

---

## Integration

This skill reads from:
- **planning/tasks.md** — task status, subtasks, operations log (with response snippets)
- **planning/notes/TASK-XXX.md** — task documentation (Patterns, Gotchas, Decisions)
- **planning/notes/TASK-XXX-precompact-*.md** — pre-compaction snapshots (fallback if main notes missing)

Use with `/task-memory` to preserve research before checking status.

---

## Format Reference

For complete format documentation, see `/task-memory` skill.

**Required Task Structure:**
```markdown
### TASK-XXX | Title                                    # Must be h3 (###)
**Priority**: 🟠 High | **Category**: Feature | **Status**: in-progress | **Assigned**: @user
**Workflow**: Feature | **Complexity**: Standard
**Created**: 2026-04-15 | **Started**: 2026-04-15 | **Finished**:
**Tags**: #tag1 #tag2

Description text...

**Subtasks**:
- [x] Phase 1: Completed task
- [ ] Phase 2: Current task (depends: Phase 1)
- [ ] Phase 3: Future task (depends: Phase 2)

**Pre-Work Checklist**:
- [x] Read relevant files
- [x] Searched for similar implementations
- [x] Identified patterns to follow
- [x] Reviewed known gotchas

**Notes**:

**Visual Operations Log**:

**Errors Log**:
```

**Key Format Rules:**
| Rule | Requirement |
|------|-------------|
| Task header | Must be `### TASK-XXX` (h3 level) |
| Column sections | Must be `## Name` (h2 level) |
| Status values | `todo`, `in-progress`, `done` |
| Date format | `YYYY-MM-DD` |
| Dependencies | `(depends: Phase X)` or `(depends: Phase X, Phase Y)` |

**Workflow Types:** Feature, Refactor, Investigation, Migration, Simple

**Complexity Levels:** Simple (1-2 files), Standard (3-10 files), Complex (10+ files)

---

**Version:** 2.0.0
**License:** MIT
**Changelog 2.0.0:** Added Context Health Score, notes quality validation (Missing/Skeleton/Substantive), research gap detection, recovery instructions for degraded context.
