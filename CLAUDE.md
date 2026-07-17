# task-memory

## Rule Hierarchy

When instructions conflict, follow this priority order:
1. **CLAUDE.md** (project-specific overrides) - highest priority
2. **.claude/rules/** (enforcement rules) - workflow constraints
3. **.claude/skills/** (detailed guidance) - how-to documentation
4. **hooks/** (implementation) - automated enforcement

---

## Mission

**Task Memory** is a context-preserving task system for Claude Code. It answers:
> "What was I working on? What did I learn? What's next?"

This is an **open source** project. Quality matters. Every task must be verifiable, every workflow must be reproducible.

---

## Quick Start

This project uses the **task-memory** plugin for task tracking.

### Session Start Protocol

At the start of EVERY session:
1. The SessionStart hook auto-displays the current task + notes summary.
2. If you see "⚠️ CONTEXT GAP DETECTED", recreate findings from the operations log BEFORE coding.
3. For full verification, run `/task-status` — it computes a Context Health Score (0-5).

### Task vs. Question Triage

**On every prompt:** Determine the type.
- **TASK** (implement, fix, build, refactor, migrate): Create task in `planning/tasks.md` first
- **QUESTION** (what, how, why, explain): Answer directly
- **AMBIGUOUS** ("help me with X", "I'm stuck"): Ask one clarifying question first

**Skills:** `/tm-init` (setup) | `/task-memory` (full workflow) | `/task-status` (health score)

**Install:**

- **Claude Code:** `/plugin install task-memory@kepptic`
- **Cowork:** build the archive with `scripts/build-cowork-plugin.sh`, then sideload the resulting `dist/task-memory-<version>.plugin` file (drag into the chat or use the Install plugin menu)

Same skills, commands, and Python hook in both runtimes — `.plugin` archive contents are format-identical.

---

## Task Placement: Auto-Fix Enabled

The UI now **automatically fixes** tasks that are in the wrong section:

1. **Status field is authoritative** - The UI reads the `**Status**:` field value
2. **Auto-reorganization** - On load, if a task's Status doesn't match its section, it's automatically moved
3. **Notification** - You'll see "X tasks auto-moved to correct section"

### How It Works

```
Status: done → Task displays in Done column, regardless of markdown section
            → File is automatically rewritten with task in correct section
```

### Best Practice (Still Recommended)

When creating tasks, place them under the matching section to avoid churn:

```
Status: todo        → Place under ## 📝 To Do (or ## To Do)
Status: in-progress → Place under ## 🚧 In Progress (or ## In Progress)
Status: done        → Place under ## ✅ Done (or ## Done)
```

**Verification (optional):**
```bash
# Legacy or namespaced IDs (TASK-042 or TASK-GR-678)
grep -B 3 "^### TASK-" planning/tasks.md | head -4

# Or more strictly with regex:
grep -B 3 "^### TASK-(?:[A-Z]{2,4}-)?\d+\b" planning/tasks.md | head -4
```

---

## Task Creation Rules

### Rule 1: Verify the Task is Actionable

Before creating a task, verify it answers ALL of these:
- **What** exactly needs to be done? (not vague)
- **Where** in the codebase? (specific files or areas)
- **Why** does this matter? (context)
- **Done when** what is true? (acceptance criteria)

If you can't answer one, do lightweight research first.

### Rule 2: Classify Workflow Type

| Type | Characteristics | When to Use |
|------|-----------------|-------------|
| **Simple** | 1-2 files, single concern | Quick fixes, typos, small changes |
| **Feature** | 3-10 files, new functionality | New components, integrations |
| **Refactor** | Affects existing patterns | Add → Migrate → Remove stages |
| **Investigation** | Unknown solution | Debugging, research, root cause |
| **Migration** | Data/infrastructure change | Schema changes, upgrades |

Add to task: `**Workflow**: Feature`

### Rule 3: Assess Complexity

| Level | Scope | Planning Required |
|-------|-------|-------------------|
| **Simple** | 1-2 files | Minimal subtasks |
| **Standard** | 3-10 files | Detailed subtasks with phases |
| **Complex** | 10+ files | Notes file, extensive planning |

Add to task: `**Complexity**: Standard`

**Rule:** When uncertain, pick higher. Under-planning causes failures.

### Rule 4: Use Phase Dependencies for Complex Work

```markdown
**Subtasks**:
- [ ] Phase 1: Setup foundation
- [ ] Phase 2: Core implementation (depends: Phase 1)
- [ ] Phase 3: Testing (depends: Phase 2)
```

### Rule 5: Complete Pre-Work Checklist

Before coding:
- [ ] Read relevant files
- [ ] Searched for similar implementations
- [ ] Identified patterns to follow
- [ ] Reviewed known gotchas for this area

### Rule 6: Self-Critique Before Done

Before marking `Status: done`:
- [ ] All subtasks completed (not skipped)
- [ ] Code quality: no hardcoded values, proper error handling
- [ ] Pattern compliance: follows existing conventions
- [ ] Build succeeds without errors
- [ ] Task is under correct section header (## Done)

---

## Common Failure Patterns

| Failure | Cause | Prevention |
|---------|-------|------------|
| Task in wrong section | Status field doesn't match section | **Verify section placement** after writing |
| Task too vague | No acceptance criteria | Define "done when" criteria |
| Work unfinished | Complexity underestimated | Assess complexity conservatively |
| Wrong pattern used | Didn't check existing code | Pre-work: search for similar implementations |
| Bug introduced | Skipped self-critique | Complete Rule 6 before marking done |
| Context lost | Notes file empty despite research | Hook blocks Stop — fill Patterns/Gotchas/Decisions |
| Research gap | Ops logged but no synthesis | SessionStart warns; /task-status shows Health Score |

---

## Context Preservation Protocol

Context loss is the #1 failure mode. In 3.0.0, preservation became structural, not advisory.

### Hook Handles Automatically (you don't need to remember)

| Event | What happens |
|-------|--------------|
| Every WebFetch / WebSearch | Logged to `**Visual Operations Log**` with URL/query + response snippet (≤120 chars) |
| SessionStart | GC stale session state (>24h); create `planning/notes/TASK-XXX.md` skeleton for every in-progress task; display task + notes summary OR warn about context gap |
| Every 2 research ops | Notes skeleton re-checked (no-op if already created on SessionStart) |
| PreCompact | Snapshot saved to `notes/TASK-XXX-precompact-TIMESTAMP.md`; recent ops log appended to main notes file |
| PreToolUse (Write/Edit/Bash/Task) | Stamp session as worked-on **only if** tool use actually touches task (tasks.md, notes file, paths in block, task ID in content); bump engagement counter |
| Stop | BLOCKS only if (a) engagement ≥ 3 tool-relevant uses, (b) task has incomplete subtasks or no notes, (c) not already released, (d) not off-topic flagged. After 2 blocks, sticky release — no re-nagging for same session+task |
| SessionEnd | Flush all session state (session file, stop-blocks, released flags, engagement counters, off-topic flag) |

### Escape Hatches

- `TASK_MEMORY_FORCE_STAMP=1` — restore pre-3.3 blanket stamping (any tool use marks task as worked-on)
- `touch .claude/state/task-memory/off-topic-<session>.flag` — disable blocking for current session
- `.task-memory.json` tunables: `min_engagements_to_block` (default 3), `session_state_max_age_hours` (default 24)

### You Must Still (synthesis, not actions)

The log captures **what** you did. Notes capture **so what**.

After every research batch, fill in the notes file with:

- **Patterns** — reusable techniques ("do this"). Be specific.
- **Gotchas** — pitfalls with failure modes ("don't do this, because Y")
- **Decisions** — choices + rationale (`Decision — reason`)

"Looked at screenshot, has panels" ≠ preservation. Write: "3-panel layout: 250px left nav, fluid center, 300px right panel."

---

## File Structure Requirement

The UI parses tasks by their **position under section headers**, not by field values:

```markdown
## 📝 To Do           ← Section header (h2)

### TASK-001 | Title  ← Task header (h3) - MUST be under matching section
**Status**: todo      ← Status MUST match section

## 🚧 In Progress

### TASK-002 | Title
**Status**: in-progress

## ✅ Done

### TASK-003 | Title
**Status**: done      ← This task is "done" because it's under ## Done
```

**Invalid:**
```markdown
## 🚧 In Progress

### TASK-003 | Title
**Status**: done      ← WRONG: Status says "done" but task is under "In Progress"
```

---

## When NOT to Create a Task

Ask for clarification if:
- The requirement is vague (e.g., "improve navbar")
- You don't know where to start
- You're unsure about the right approach
- The scope might be larger than expected

**Better to ask than create a bad task.**

---

> A well-specified task prevents 80% of implementation failures.
> Spend 10 minutes planning to save 1 hour of debugging.
