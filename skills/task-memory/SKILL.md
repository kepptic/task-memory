---
name: task-memory
version: "3.0.0"
description: Provides task planning and context preservation for development workflows. Creates structured tasks in planning/tasks.md with subtasks, dependencies, and progress tracking. Use when implementing features, fixing bugs, refactoring code, or any work requiring task tracking. Supports workflow classification (Feature, Refactor, Investigation, Migration, Simple) and complexity assessment. Inspired by Auto-Claude patterns.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - WebFetch
  - WebSearch
---

# /task-memory - Task Planning & Context Preservation

Persistent task tracking with documentation. Work survives context resets.

---

## Context Preservation Protocol

Context loss is the #1 failure mode. The protocol below makes preservation structural, not advisory. When you follow it, research survives session end, compaction, and reboots.

### What the hook does automatically

You do NOT need to do these things — the hook handles them:

| Event | What's auto-logged | Where |
|-------|--------------------|-------|
| Every WebFetch | Timestamp, URL, response snippet (≤120 chars) | `**Visual Operations Log**:` in tasks.md |
| Every WebSearch | Timestamp, query, result snippet | `**Visual Operations Log**:` in tasks.md |
| Every 2 research ops | Creates `planning/notes/TASK-XXX.md` skeleton if missing | notes/ |
| Bash command with error | Error line appended to Errors Log | `**Errors Log**:` in tasks.md |
| PreCompact event | Snapshot saved to `notes/TASK-XXX-precompact-TIMESTAMP.md` + ops log appended to main notes file | notes/ |
| Session start | Displays current task + loaded notes summary OR warns about missing notes | stderr |
| Attempted Stop with empty notes + research ops | BLOCKS with "fill notes before stopping" | — |

### What YOU must still do

The hook captures **actions** and **response snippets**. You must capture **synthesis**:

| Hook captures (automatic) | You must write (manual) |
|--------------------------|-------------------------|
| "WebFetch: docs.example.com => Configuration guide for pagination" | **Pattern**: API uses cursor-based pagination with `X-Next-Token` header |
| "WebSearch: 'react context memo' => results mention useMemo..." | **Gotcha**: `React.memo` doesn't help if props are objects — must memoize the object too |
| File paths of Edit operations | **Decision**: Chose Zustand over Redux — smaller bundle, simpler for this scope |

The operations log is the raw material. The notes file is the distilled learning. Session-start reloads the distilled version, not the raw log.

### The 2-Action Rule (updated)

After every 2 research operations, the hook auto-creates `planning/notes/TASK-XXX.md` with skeleton sections. **Your job:** fill in Patterns, Gotchas, and Decisions before session end — not just append raw findings.

**Skeleton sections you must populate:**

- **Patterns Discovered** — reusable techniques ("do this")
- **Gotchas** — pitfalls with failure modes ("don't do this, because X")
- **Decisions** — choices + rationale (`Decision — reason`)
- **Resources** — files/URLs examined with takeaway
- **Open Questions** — things to verify next session

**If you skip this:** the Stop hook will block you when you try to end the session.

---

## Critical Rules

### Rule 1: NO WORK WITHOUT TASK

Before writing code, editing files, or implementing anything:

**STOP. Create task in tasks.md FIRST.**

### Rule 2: STATUS FIELD IS AUTHORITATIVE

The `**Status**:` field determines task state. The UI reads this field and auto-reorganizes mismatches.

**To change status:**

- ✅ Change `**Status**: todo` → `**Status**: in-progress` → `**Status**: done`
- ✅ Add `**Started**: YYYY-MM-DD` when starting
- ✅ Add `**Finished**: YYYY-MM-DD` when completing
- ✅ Optionally move task block to matching section for file readability

**Auto-Reorganization:** If Status doesn't match section, the UI auto-fixes on load. For file clarity when editing directly, move blocks to their matching sections.

### Rule 3: PRESERVE RESEARCH — STRUCTURAL, NOT ADVISORY

The hook creates the notes skeleton on SessionStart for every in-progress task (v3.3+). You fill it in with synthesized insights, not raw quotes.

**Synthesis checklist (applied after every research batch):**

```
☐ What PATTERN can I extract? (reusable technique)
☐ What GOTCHA did I hit or avoid? (failure mode + prevention)
☐ What DECISION did I make? (choice + rationale)
☐ What RESOURCE was most useful? (file/URL + takeaway)
```

**Vague ≠ preserved.** "Looked at screenshot, has panels" teaches nothing. Write: "3-panel layout: 250px left nav, fluid center, 300px right panel. Grid template: `250px 1fr 300px`."

### Rule 4: NEVER REPEAT FAILURES

```
if action_failed:
    next_action != same_action
```

Track what you tried. Mutate the approach. Log errors.

### Rule 5: PRE-IMPLEMENTATION CHECKLIST

Before writing ANY code, complete this checklist:

```
☐ Read relevant files (identify them first)
☐ Search for similar implementations in codebase
☐ Identify existing patterns to follow
☐ Review known gotchas for this area
☐ Document findings in task Notes
```

**Why:** Skipping this causes pattern violations, duplicate code, and preventable bugs.

### Rule 6: SELF-CRITIQUE BEFORE DONE

Before marking a task done, verify:

```
☐ Code quality: No hardcoded values, proper error handling
☐ Pattern compliance: Follows existing codebase conventions
☐ Completeness: All subtasks genuinely finished
☐ No regressions: Existing functionality preserved
☐ Notes file has substantive Patterns/Gotchas/Decisions (not empty skeleton)
```

**If any check fails:** Fix before marking done. Never defer issues to "later."

**The Stop hook enforces the last item.** For Standard or Complex tasks (or any task with ≥2 research ops), you cannot stop until `notes/TASK-XXX.md` has real content.

---

### Rule 7: PLAN THE NEXT MOVE WITH OUTCOME BRANCHES

Most tasks don't end when the action ships — they end when the world responds. An email is sent but needs a reply. A PR is opened but needs CI to pass. A vendor is asked but might say no. A deploy is live but might regress. **If the task's completion depends on a signal that hasn't arrived yet, write down what you'll do for each plausible outcome — including the absence of one.**

The convention is the `**Outcome Branches**` block in the task template. Each branch is one line:

- **If <expected outcome> → <action>** — the success path. Often "close task" or "spawn TASK-YYY for follow-up work."
- **If <alternative outcome> → <action>** — the documented unhappy paths (rejection, partial success, error). One line each, only the ones likely enough to plan for.
- **If no signal by <YYYY-MM-DD> → <action>** — the silence path. Always include this when waiting on a human; pick a concrete date, not "eventually." Common actions: chase, escalate, close as abandoned.

**When to include them:**

- ✅ Anything waiting on an external party (email, ticket, vendor, customer, teammate)
- ✅ Long-running async operations whose result you'll need to act on (deletion, deploy, build, batch job)
- ✅ Decisions that fork the rest of the work (approval/rejection, A/B result, capacity check)

**When to skip them:**

- ❌ Self-contained tasks where the next step is obvious from the current step's result (refactor a function, fix a typo, add a test)
- ❌ Tasks where success closes the loop with no waiting (write doc, push commit)

**How to use them while working:**

- When a signal arrives, mark the matching branch resolved (strike through, or move it into the description as `→ resolved 2026-04-27: <what happened>`) and either close the task or carry out the action it specifies.
- When the silence-deadline hits, the matching branch *is* your action — don't re-decide what to do, just execute. The whole point is to make the decision once, when you have full context, instead of guessing later when the context has decayed.
- If reality produces an outcome you didn't list, that's worth noting in the task's Decisions log — it's a gap in your forecast, not a failure of the convention.

**Why this exists:** Tasks without outcome branches turn into orphans — the action ships, the task technically isn't done, but nobody remembers what "done" looked like. Writing the branches up front captures the intent while you still have it; future-you (or a different session) can act without re-deriving the plan.

**Pair with `awaiting` status.** When you ship the action and there's nothing more for *you* to do until the signal arrives, flip the task `**Status**: in-progress` → `**Status**: awaiting` (see "Status Values" below). Outcome Branches define *what* to do; `awaiting` communicates *I'm not actively driving*. The Stop hook ignores `awaiting`, so the task parks cleanly. SessionStart will surface any `awaiting` task whose silence-deadline has passed, prompting the silence-path action.

---

## Multi-File Projects

Some projects split tasks across multiple kanban files — for example, one
per domain (`api`, `admin`, `public`) or per workspace in a monorepo.
The hook supports this via the `task_files_glob` field in
`.task-memory.json` at the project root:

```json
{
  "task_files_glob": "docs/todo/*/tasks.md"
}
```

When set, the hook:

- Discovers every file matching the glob (sorted for deterministic output).
- On `SessionStart`, lists **all** in-progress tasks from every file, each
  annotated with its parent-directory label so you can see at a glance
  which file owns what:
  ```
  📋 In-progress (3):
    • TASK-491 | Our Crew page redesign… [2/5] (admin)
    • TASK-501 | API rate limit… [0/3] (api)
    • TASK-512 | Public marketing hero… [4/4] (public)
  ```
- Routes log appends (`WebFetch`, `WebSearch`, `Bash` errors) to whichever
  file owns the referenced `TASK-XXX`.
- Reorganizes the **specific** file that was edited (no cross-file moves).
- Only nags on Write/Edit when the edited file is the one holding the
  active task — unrelated edits don't re-print the task context.

Existing single-file projects don't need any config — the old behavior
(`planning/tasks.md`) is unchanged when `task_files_glob` is absent.

An optional `todowrite_mirror_file` field pins TodoWrite mirroring to one
file; otherwise the first file in the glob receives the mirror section.

---

## Workflow

### Step 1: Create Task

**Location:** `planning/tasks.md`

**Get next ID:**

```markdown
<!-- Config: Last Task ID: XXX -->
```

or (for team mode with per-dev files):

```markdown
<!-- Config: Task Prefix: GR | Last Task ID: 677 -->
```

Read current ID, increment by 1. If a `Task Prefix:` is present, the next task ID will be `TASK-<PREFIX>-<n>` (e.g., `TASK-GR-678`, not zero-padded). Without a prefix, legacy IDs are used (e.g., `TASK-043`, with 3-digit padding).

**Task Template** (shown here in legacy format; with `Task Prefix: GR` header, use `TASK-GR-XXX`):

```markdown
### TASK-XXX | [Brief Title]

**Priority**: [🔴 Critical|🟠 High|🟡 Medium|🟢 Low] | **Category**: [Feature|Bug|Docs|Research] | **Status**: todo | **Assigned**: @user
**Workflow**: [Feature|Refactor|Investigation|Migration|Simple] | **Complexity**: [Simple|Standard|Complex]
**Created**: YYYY-MM-DD | **Started**: | **Finished**:
**Tags**: #tag1 #tag2

[Description of what needs to be done]

**Subtasks**:

- [ ] Phase 1: First subtask
- [ ] Phase 2: Second subtask (depends: Phase 1)
- [ ] Phase 3: Third subtask (depends: Phase 2)

**Outcome Branches** _(include when the task's next step depends on an external event — a reply, a build result, a vendor decision, a measurement. Omit for self-contained tasks where the next step is obvious.)_:

- If <expected outcome> → <action / new task / close>
- If <alternative outcome> → <action>
- If no signal by <YYYY-MM-DD> → <chase / escalate / close>

**Pre-Work Checklist**:

- [ ] Read relevant files
- [ ] Searched for similar implementations
- [ ] Identified patterns to follow
- [ ] Reviewed known gotchas

**Notes**:

**Visual Operations Log**:

**Errors Log**:
```

**Date Fields:**
| Field | When to Set | Required For |
|-------|-------------|--------------|
| **Created** | When task is created | All tasks |
| **Started** | When Status → in-progress | in-progress, done |
| **Finished** | When Status → done | done |

**Dependencies Syntax:**

- Single: `(depends: Phase 1)`
- Multiple: `(depends: Phase 1, Phase 2)`

**Workflow Types:**

| Type              | When to Use                   | Pipeline Behavior                  |
| ----------------- | ----------------------------- | ---------------------------------- |
| **Feature**       | New functionality, multi-step | Full planning, dependency tracking |
| **Refactor**      | Code restructuring            | Add → Migrate → Remove stages      |
| **Investigation** | Debugging, root cause         | Reproduce → Investigate → Fix      |
| **Migration**     | Data/schema changes           | Backup → Transform → Validate      |
| **Simple**        | Quick fixes, single file      | Minimal overhead                   |

**Complexity Levels:**

| Level        | Scope                        | Planning Required              |
| ------------ | ---------------------------- | ------------------------------ |
| **Simple**   | 1-2 files, single concern    | Minimal subtasks               |
| **Standard** | 3-10 files, 1-2 services     | Detailed subtasks with phases  |
| **Complex**  | 10+ files, multiple services | Notes file, extensive planning |

**Update config after creating:**

```markdown
<!-- Config: Last Task ID: XXX -->  ← Increment this
```

### Step 2: Start Work (Change Status)

**Before starting**, complete the Pre-Work Checklist in the task, then:

1. **Update the Status field**: `todo` → `in-progress`
2. **Add Started date**
3. **(Optional)** Move task block to "In Progress" section for file clarity

```markdown
# Update Status field and add Started date:

**Priority**: High | **Category**: Feature | **Status**: in-progress
**Created**: 2026-01-13 | **Started**: 2026-01-13

**Pre-Work Checklist**:

- [x] Read relevant files
- [x] Searched for similar implementations
- [x] Identified patterns to follow
- [x] Reviewed known gotchas
```

**Status field is authoritative.** The UI auto-reorganizes mismatches on load. Moving blocks is optional but recommended when editing files directly.

**DO NOT skip the pre-work checklist.** This prevents pattern violations and duplicate code.

### Step 3: Work and Update

Mark subtasks as completed:

```markdown
**Subtasks**:

- [x] Completed subtask
- [x] Another completed
- [ ] Still pending
```

Add progress to Notes:

```markdown
**Notes**:

- Investigated issue
- Found root cause in file.ts:42
- Implemented fix
```

Log errors as they occur:

```markdown
**Errors Log**:
| Error | Attempt | Resolution |
|-------|---------|------------|
| Module not found | 1 | Installed missing dep |
| Type mismatch | 2 | Fixed interface |
```

### Step 4: Self-Critique & Complete Task

**Before marking done**, run this self-critique:

```
☐ Code quality: No hardcoded values, proper error handling?
☐ Pattern compliance: Follows existing codebase conventions?
☐ Completeness: All subtasks genuinely finished?
☐ No regressions: Existing functionality preserved?
☐ Insights documented: Patterns/gotchas recorded in Notes?
```

**If any check fails:** Fix before marking done. Never defer issues.

**When ALL checks pass:**

1. **Update the Status field**: `in-progress` → `done`
2. **Add Finished date**
3. **(Optional)** Move task block to "Done" section for file clarity

```markdown
# Update Status field and add Finished date:

**Priority**: High | **Category**: Feature | **Status**: done
**Created**: 2026-01-13 | **Started**: 2026-01-13 | **Finished**: 2026-01-13
```

**Status field is authoritative.** The UI auto-reorganizes mismatches on load.

### Step 5: Commit with Task Reference

```bash
git commit -m "feat: description (TASK-XXX)"
```

---

## The 3-Strike Error Protocol

| Attempt | Action                                                                                 |
| ------- | -------------------------------------------------------------------------------------- |
| 1       | Diagnose & fix - identify root cause, apply targeted fix, log to Errors Log            |
| 2       | Alternative approach - different method/tool/library, NEVER repeat same failing action |
| 3       | Broader rethink - question assumptions, search for solutions, update plan              |
| After 3 | Escalate to user - explain what you tried, share specific error, ask for guidance      |

**Key principle:** Error recovery is a signal of true agentic behavior.

---

## Read vs Write Decision Matrix

| Situation             | Action                 | Reason                        |
| --------------------- | ---------------------- | ----------------------------- |
| Just wrote a file     | DON'T read             | Content still in context      |
| Viewed image/PDF      | Write notes NOW        | Multimodal → text before lost |
| Browser returned data | Write to notes         | Screenshots don't persist     |
| Starting new phase    | Read plan/notes        | Re-orient if context stale    |
| Error occurred        | Read relevant file     | Need current state to fix     |
| Resuming after gap    | Read tasks.md + notes/ | Recover full state            |

---

## Task Documentation (notes/)

The `planning/notes/` folder stores task-related documentation that persists across sessions:

- **Research findings** - Visual analysis, web research, documentation review
- **Audit results** - Security audits, performance audits, accessibility checks
- **Code review notes** - Review feedback, suggested changes, approval notes
- **Meeting notes** - Decisions made, action items, stakeholder input
- **Decision logs** - Architecture decisions, trade-off analysis, rationale
- **Test results** - Test analysis, failure investigation, coverage reports

### Notes File Lifecycle

1. **Created automatically** by the hook after 2 research operations (WebFetch/WebSearch). Skeleton has Summary, Patterns Discovered, Gotchas, Decisions, Resources, Open Questions.
2. **Filled in by you** with synthesized insights — not raw quotes. Each section has a placeholder italic describing what goes there.
3. **Appended to by PreCompact** — recent operations log entries are merged into the notes file as a timestamped appendix so nothing is lost during compaction.
4. **Validated at Stop** — if research ops ≥ 2 OR Complexity ∈ {Standard, Complex}, the Stop hook blocks with "fill notes before stopping" when the file is empty or skeleton-only.
5. **Loaded at SessionStart** — the next session's hook displays the notes summary so you can pick up where you left off.

### Insight Synthesis Template

**Location:** `planning/notes/TASK-XXX.md` (auto-created)

| Section | What to write | Example |
|---------|---------------|---------|
| Summary | One paragraph: what and why | "Migrating auth from sessions to JWTs because session-store can't scale past 1 node." |
| Patterns Discovered | Reusable techniques, specific | "Use `jose` library for JWT signing — handles RS256 key rotation via JWKS endpoint." |
| Gotchas | Pitfall + failure mode | "Don't store JWT in localStorage — XSS attacks can exfiltrate. Use httpOnly cookie." |
| Decisions | Choice + rationale | "Chose 15-min access + 7-day refresh — balances UX with revocation window." |
| Resources | File/URL + takeaway | "RFC 7519 §4.1.4: `exp` claim required for access tokens." |
| Open Questions | What to verify next | "Confirm refresh rotation strategy with security review." |

**Link notes to task:** `**Notes**: Documentation in notes/TASK-XXX.md`

---

## Status Values

| Status        | Description                                            | Required Fields            |
| ------------- | ------------------------------------------------------ | -------------------------- |
| `todo`        | Not started                                            | Created                    |
| `in-progress` | Actively driving the work                              | Created, Started           |
| `awaiting`    | Action shipped, parked on an external signal           | Created, Started           |
| `done`        | Completed (signal received / outcome resolved)         | Created, Started, Finished |

**Valid transitions:**

```
todo → in-progress → done
                  ↘ awaiting → in-progress → done   (signal arrived; act on it)
                             ↘ done                  (silence deadline; close as abandoned)
```

**When to use `awaiting` vs `in-progress`:** if the next thing that has to happen is *you doing something*, it's `in-progress`. If the next thing is *the world doing something* — a person replying, a build finishing, a vendor deciding, a backend deletion completing — it's `awaiting`. Awaiting tasks must carry an **Outcome Branches** block describing what to do when the signal arrives, and **must include a silence-deadline branch** (`If no signal by YYYY-MM-DD → …`). Sessions surface awaiting tasks past that deadline at startup so the silence path actually runs instead of the task drifting forever.

The Stop hook only nags on `in-progress` tasks, so `awaiting` cleanly parks work without triggering "incomplete subtasks" blocks. Choose `awaiting` over `todo` whenever the work has shipped — `todo` should mean *I haven't started yet*, not *I started and stopped*.

---

## Visual Operations Log

WebFetch and WebSearch are auto-logged by hooks with a response snippet (up to 120 chars), so the log captures both the action AND a preview of what was returned:

```markdown
**Visual Operations Log**:

- 2026-04-16 10:30:45 - WebFetch: https://docs.example.com => Configuration guide: use env vars via `process.env`, not hardcoded...
- 2026-04-16 10:31:22 - WebSearch: "react memo" => Results show useMemo() for expensive calc, React.memo for components...
```

**Log vs. Notes — two layers:**

- **Log** (in tasks.md): raw trail of operations + response preview. Machine-parseable. Captures **what** and **what came back**.
- **Notes** (in notes/TASK-XXX.md): synthesized Patterns/Gotchas/Decisions. Human-readable. Captures **so what**.

The log is ephemeral reference. The notes file is the durable output. At PreCompact, the hook copies recent log entries into the notes file so you have something to synthesize from.

---

## Directory Structure

```
planning/
├── tasks.md            ← Active tasks
├── archive.md          ← Completed tasks (preserved)
└── notes/              ← Task documentation
    ├── TASK-001.md
    ├── TASK-002.md
    └── ...
```

---

## File Format for UI Compatibility

The task-memory UI requires a specific markdown format. **See [UI_FORMAT.md](UI_FORMAT.md) for complete documentation.**

**Quick Reference:**

- Configuration section: `## ⚙️ Configuration` with Columns definition
- Column sections: `## To Do`, `## In Progress`, `## Done` (h2 level)
- Task headers: `### TASK-XXX | Title` (h3 level, under column sections)
- Status field must match column: `**Status**: todo|in-progress|done`
- No `---` separators between tasks (only after config section)

---

## Monorepo Support

task-memory supports flexible patterns for monorepos. **See [MONOREPO.md](MONOREPO.md) for complete documentation.**

**Quick Reference:**

- **Option A (Auto-Detected):** Per-package `planning/` folders - hooks find nearest tasks.md
- **Option B (Centralized):** Single `planning/` with domain subdirectories - add guidance to CLAUDE.md
- **Option C (Config-Based):** Explicit `.task-memory.json` mapping

---

## Common Mistakes

**See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for complete troubleshooting guide.**

**Quick Fixes:**
| Mistake | Prevention |
|---------|------------|
| Creating duplicate sections | Use EXISTING section headers |
| Adding `---` between tasks | Only use after config section |
| Working without task | Create TASK-XXX first |
| Skipping research preservation | Create notes after 2 visual ops |
| Repeating failed actions | Log error, try different approach |

---

## Verification Checklist

Before ANY work:

```
☐ Created TASK-XXX in tasks.md
☐ Set Workflow type and Complexity level
☐ Used proper format (Status field, subtasks, Errors Log)
☐ Incremented Last Task ID in config
☐ Completed Pre-Work Checklist (read files, search similar, identify patterns)
☐ Changed Status: todo → in-progress
☐ Added Started: date
```

During work:

```
☐ Updating subtasks as completed [x]
☐ Respecting phase dependencies
☐ Documenting in Notes section
☐ Logging errors to Errors Log
☐ Creating notes file after 2 visual ops
☐ Following 3-Strike Protocol on failures
```

After work:

```
☐ Ran Self-Critique checklist (quality, patterns, completeness)
☐ Notes file has substantive Patterns/Gotchas/Decisions (Stop hook enforces)
☐ Changed Status: in-progress → done
☐ Added Finished: date
☐ All subtasks checked [x]
☐ Committed with (TASK-XXX) reference
```

**Session-start protocol:**

```
☐ Hook displays current task + notes summary automatically
☐ If "CONTEXT GAP DETECTED" warning appears, recreate findings from ops log
☐ Run /task-memory:task-status for 5-question verification
☐ Resume from first unchecked subtask
```

---

## Git Integration

Every commit references task:

```bash
git commit -m "type: description (TASK-XXX)"

# Examples
git commit -m "feat: add login form (TASK-042)"
git commit -m "fix: null check in parser (TASK-043)"
git commit -m "docs: API reference (TASK-044)"
```

---

## Phase Dependencies

For complex tasks, subtasks can declare dependencies:

```markdown
**Subtasks**:

- [x] Phase 1: Setup database schema
- [x] Phase 2: Create API endpoints (depends: Phase 1)
- [ ] Phase 3: Build frontend forms (depends: Phase 2)
- [ ] Phase 4: Integration tests (depends: Phase 2, Phase 3)
```

**Rules:**

- Never start a phase until its dependencies are complete
- Phases without dependencies can run in parallel
- Use `(depends: Phase X)` or `(depends: Phase X, Phase Y)` syntax

**Parallelism Analysis:**

When planning, identify which phases can run concurrently:

- Same dependencies = potentially parallel
- No overlapping files = safe to parallelize
- Different services/concerns = good candidates

---

**Version:** 3.0.0
**License:** MIT
**Changelog 3.0.0:** Structural context preservation — hook auto-creates notes skeleton, Stop blocks on empty notes with research, SessionStart auto-loads notes summary, PreCompact appends ops log to notes file.
