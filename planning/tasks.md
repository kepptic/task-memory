# Kanban Board

<!-- Config: Last Task ID: 19 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

**Categories**: Testing, UI/UX, Feature, Research

**Users**: @user

**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

**Tags**: #testing #integration #qa #auto-reorg #ui #ux #subtasks #checklist #accessibility #navbar #css #design-system #mobile #component #fab #responsive #architecture #research #audit #improvement #auto-claude

---

## To Do

### TASK-014 | Add Repo/Root Context to Project Selector
**Priority**: Medium | **Category**: UI/UX | **Status**: todo | **Assigned**: @user
**Workflow**: Feature | **Complexity**: Standard
**Created**: 2026-01-16
**Tags**: #ui #ux #project-selector

Currently the project selector only shows the folder name (e.g., "planning"), making it hard to identify which repo/project it belongs to. Add context to show "repo-name / folder" format.

**Subtasks**:
- [ ] Add `repoName` or `contextPath` field to project metadata in fileSystem.js
- [ ] Check for `.git` folder when opening a directory
- [ ] If `.git` exists, try to read `.git/config` and parse remote URL for repo name
- [ ] Fallback: prompt user to optionally set repo name on first open
- [ ] Update saveDirectoryHandle to store repoName
- [ ] Update ProjectSelector to display "repoName / folderName" format
- [ ] Add ability to edit repoName in project dropdown
- [ ] Update project item display to show context when available
- [ ] Handle case where repoName is same as folderName (don't duplicate)

**Technical Notes**:
- File System Access API doesn't expose full path (security restriction)
- `.git/config` contains `[remote "origin"]` section with `url = ...`
- Parse URL like `git@github.com:user/repo.git` or `https://github.com/user/repo.git`
- IndexedDB already stores project metadata - just add new field

**Pre-Work Checklist**:
- [ ] Review fileSystem.js project storage structure
- [ ] Review ProjectSelector.jsx component
- [ ] Check if we can read files within selected directory

**Notes**:

**Errors Log**:

### TASK-008 | Integration Testing and Final Polish
**Priority**: Medium | **Category**: Testing | **Status**: todo | **Assigned**: @user
**Created**: 2026-01-14 | **Started**: 2026-01-14 | **Finished**: 2026-01-14
**Tags**: #testing #integration #qa

Comprehensive testing of the new navbar across all scenarios.

**Subtasks**:
- [ ] Test project open workflow (manual)
- [ ] Test project switching (manual)
- [ ] Test task creation via navbar and FAB (manual)
- [ ] Test all modal opens (columns, archive, settings) (manual)
- [ ] Test refresh functionality (manual)
- [ ] Test file migration banner with new layout (manual)
- [ ] Test on Chrome, Firefox, Safari (manual)
- [ ] Test on iOS Safari (manual)
- [ ] Test on Android Chrome (manual)
- [x] Build production bundle and verify
- [x] Update task-memory.html output
- [x] CREATE: New Task opens form correctly (code verified)
- [x] READ: Stats display correct counts (code verified)
- [x] UPDATE: Refresh reloads file correctly (code verified)
- [x] DELETE: (via archive) Archive modal opens (code verified)
- [x] Open new project via overflow menu (code verified)
- [x] Switch between recent projects (code verified)
- [x] Rename project updates display (code verified)
- [x] Delete project from recents (code verified)
- [x] Empty project (no tasks) renders correctly (code verified)
- [ ] Large task count (100+) doesn't break layout (needs manual test)
- [x] Long project name truncates properly (CSS verified)
- [ ] Network offline doesn't break UI (needs manual test)
- [x] Keyboard navigation through all elements (code verified)
- [ ] Screen reader announces elements correctly (needs manual test)
- [x] Focus indicators visible (CSS verified)
- [ ] Color contrast meets WCAG AA (needs manual verification)

**Notes**:
- All code changes verified through successful build
- task-memory.html output updated (428KB)
- Manual browser testing required for full QA
- New components: TaskSummaryBadge, OverflowMenu, Mobile FAB
- Responsive breakpoints: 1024px (tablet), 768px (mobile), 480px (small)

**Errors Log**:

### TASK-012 | Test Auto-Reorg: Done→To Do
**Priority**: Low | **Category**: Testing | **Status**: todo | **Assigned**: @user
**Created**: 2026-01-15
**Tags**: #testing #auto-reorg

Test task for auto-reorganization. Originally in Done section with Status: todo → UI auto-moved to To Do.

**Subtasks**:
- [x] Verify task moves to correct section based on Status field

**Notes**:
- Confirms Status field is authoritative over section placement

**Errors Log**:

## In Progress

### TASK-011 | Test Auto-Reorg: To Do→In Progress
**Priority**: Low | **Category**: Testing | **Status**: todo | **Assigned**: @user
**Created**: 2026-01-15
**Tags**: #testing #auto-reorg

Test task for auto-reorganization. Originally in To Do section with Status: in-progress → UI auto-moved to In Progress.

**Subtasks**:
- [x] Verify task moves to correct section based on Status field

**Notes**:
- Confirms Status field is authoritative over section placement

**Errors Log**:
- 2026-01-16 10:45:38 - Error: Error: module not found
- 2026-01-16 09:19:30 - Error: Error: command not found

## Done

### TASK-018 | Rebind file watcher on task-file switch
**Priority**: Medium | **Category**: UI/UX | **Status**: done
**Workflow**: Bug Fix | **Complexity**: Standard
**Created**: 2026-07-17 | **Started**: 2026-07-19 | **Finished**: 2026-07-19
**Tags**: #ui #file-watcher #bug

The file watcher didn't rebind when switching task files in the UI. After switching to a different task file via the task-file switcher, the watcher stayed bound to the original file, so external edits to the new file went undetected (and, since the stale watcher kept polling the old file, an edit to the old file could fire its callback onto the switched-to board).

**Root cause (diagnosed):** `startFileWatcher` no-ops if an interval already exists (`if (fileWatcherInterval) return`), so it can't rebind; `handleTaskFileSwitch` swaps the board but never restarts the watcher (bare `// Update file watcher` comment); the `onExternalChange` callback closes over the first file's fileName/handle. Fix: rebind `startFileWatcher` (clear-then-start), extract a `startWatchingFile(handle, content, fileName)` helper used by both load + switch, reset content baseline on switch.

**Subtasks**:
- [x] Review current file watcher setup in `src/utils/fileWatcher.js`
- [x] Check `handleTaskFileSwitch` in `src/App.jsx` to see what cleanup happens
- [x] Implement watcher unbind on task-file switch
- [x] Implement watcher rebind to the new task file
- [x] Test file watcher with multiple simultaneous task files (unit-tested via fake-interval-timer harness; live multi-file browser QA is a manual follow-up — browser File System Access API code)
- [x] Verify no memory leaks from orphaned watchers (regression test asserts exactly one active interval across repeated rebinds)

**Technical Notes**:
- Look at `fileWatcher.js` for watcher lifecycle management
- `handleTaskFileSwitch` callback receives new task file info
- May need to track active watcher instance in state
- Test scenario: open `tasks-gr.md`, switch to `tasks-dg.md`, edit `tasks-dg.md`, verify UI reflects changes

**Pre-Work Checklist**:
- [x] Read fileWatcher.js implementation
- [x] Review App.jsx handleTaskFileSwitch logic
- [x] Identify current watcher lifecycle

**Notes**:
- Fix: `src/utils/fileWatcher.js` `startFileWatcher` now clears any existing interval and resets `lastCheckedModified` before rebinding (was a silent no-op). The interval callback now returns the `checkForExternalChanges` promise (behavior-neutral for the real timer; makes ticks awaitable in tests).
- `src/App.jsx` extracts `startWatchingFile(handle, content, fileName)` — a `useCallback` placed right after `showNotification` (its dependency) to avoid a TDZ reference error. Both `loadProjectFromHandle` and `handleSwitchTaskFile` call it, so every switch rebinds the watcher.
- New regression suite `tests/test-watcher.mjs` (`npm run test:watcher`, wired into `test-hooks.sh` as `run_js_watcher_tests`) stubs `setInterval`/`clearInterval` to prove: rebind leaves exactly one active interval, the old handle stops being polled, an edit to the new file is detected, `stopFileWatcher` clears cleanly, and 3 rapid switches never leak intervals.
- Verified: `test-ui.mjs` 51/51, `test-watcher.mjs` 2/2, `npm run build` clean, `dist/task-memory.html` untouched. End-to-end real-browser file-switch QA remains a manual step. The 10 pre-existing `test-hooks.sh` Python-hook failures reproduce identically on the base branch (unrelated to this fix).

**Errors Log**:

### TASK-019 | Azure DevOps bridge — context layer keyed to ADO work items (full two-way)
**Priority**: High | **Category**: Feature | **Status**: done | **Assigned**: @user
**Workflow**: Feature | **Complexity**: Complex
**Created**: 2026-07-19 | **Started**: 2026-07-19 | **Finished**: 2026-07-19
**Tags**: #feature #ado #integration #mcp #two-way

Bridge task-memory to Azure DevOps (opt-in). ADO owns identity/state/sprints; task-memory is the AI-context layer keyed to ADO work-item ids (`### ADO-12345`, `notes/ADO-12345.md`). Full two-way sync via a deterministic CLI `scripts/ado-sync.mjs` over the official `microsoft/azure-devops-mcp`. `TASK-<PREFIX>-<n>` stays the local/offline path. Shipped as v3.6.0 on branch `feat/ado-bridge` (PR opened). Orchestrated: Fable plan -> Sonnet build P0-P9 -> Codex review (16 findings) -> fix -> Fable final review (2 more: B1 silent data-loss, B2 skeleton spam) -> fix -> verified.

**Subtasks**:
- [x] Fable plans the entire bridge -> PLAN-ado.md (11 phases, 10 forks resolved, MCP-client architecture)
- [x] Sonnet implements grammar+routing+config+pull+push+reconcile+notes+sync-skill (P0-P9)
- [x] Codex/Fable review loop until clean: Codex 16 findings + Fable 2 blockers, all fixed; test-sync 90/90, UI 51/51
- [x] Final review + branch ready (PR opened); live-ADO integration test handed to user (docs/ADO-SYNC.md checklist)

**Notes**: Only open item is the live-ADO end-to-end test (needs a real ADO org + `az login`); everything else unit-tested against a mocked MCP boundary. See planning/notes/TASK-019.md + docs/ADO-SYNC.md.

**Errors Log**:

### TASK-017 | Team-safe, collision-resistant initials-namespaced task IDs
**Priority**: High | **Category**: Feature | **Status**: done | **Assigned**: @user
**Workflow**: Feature | **Complexity**: Complex
**Created**: 2026-07-17 | **Started**: 2026-07-17 | **Finished**: 2026-07-17
**Tags**: #feature #multi-dev #ids #backward-compat

Support `TASK-<PREFIX>-<n>` IDs (2-4 uppercase letters + per-file monotonic int) so multiple devs on separate branches never collide on IDs, the counter line, or note filenames. Legacy unprefixed `TASK-<n>` IDs remain valid forever. Canonical grammar `TASK-(?:[A-Z]{2,4}-)?[0-9]+`; per-file header `<!-- Config: Task Prefix: GR | Last Task ID: 677 -->`. Implemented on branch `feat/task-017-namespaced-ids` (orchestrated: Fable plan -> Codex debate -> converge -> Sonnet code -> Haiku docs -> Fable review APPROVE).

**Subtasks**:
- [x] Phase 1: Fable devises plan -> PLAN-fable-v1.md
- [x] Phase 2: Codex revised (6 BLOCKs, all real) -> Fable ruled Q1/Q2/Q3 -> PLAN-final.md (converged)
- [x] Phase 3: Sonnet implemented (taskId.js, hook regex widening, markdown.js, App.jsx mint, multi-file discovery, tests) + Haiku docs sweep
- [x] Phase 4: Fable final review -> APPROVE WITH NITS; nits cleared (Sonnet code nits 5-6, Haiku docs nits 1-4)
- [x] Phase 5: Committed to feat/task-017-namespaced-ids (8 commits, TASK-017 refs); awaiting user merge/PR decision

**Notes**:
- JS tests 32/32; hook suite 54 pass / 10 fail (the 10 diff-identical to clean master = pre-existing, unrelated); build clean.
- Follow-up filed: TASK-018 (rebind file watcher on task-file switch).
- Acceptance verified by Fable via live byte-identical round-trip of the repo's own legacy board (master parser vs branch parser).

**Errors Log**:

### TASK-016 | Dual-Format Release — Claude Code + Cowork
**Priority**: 🟠 High | **Category**: Feature | **Status**: done | **Assigned**: @user
**Workflow**: Feature | **Complexity**: Standard
**Created**: 2026-04-16 | **Started**: 2026-04-16 | **Finished**: 2026-04-16
**Tags**: #packaging #cowork #release #plugin

Ship task-memory as both a Claude Code plugin (current) and a Cowork plugin so users in either environment can install it natively.

Key finding from port analysis: skills/, commands/, and command-type hooks are format-identical across both runtimes. Differences are limited to: (1) Cowork convention uses thin `commands/*.md` slash-command wrappers in addition to `skills/*/SKILL.md`; (2) Cowork installs via sideloaded `.plugin` archive, not Claude Code's marketplace.json mechanism; (3) `${CLAUDE_PLUGIN_ROOT}` and hook event names are identical across both — no hook changes needed.

**Subtasks**:
- [x] Phase 1: Add `commands/` directory with thin wrappers for tm-init, task-memory, task-status
- [x] Phase 2: Verify `hooks/hooks.json` env vars work under Cowork (depends: Phase 1)
- [x] Phase 3: Bump plugin.json to 3.2.0 and update description (depends: Phase 1)
- [x] Phase 4: Create `scripts/build-cowork-plugin.sh` that produces a `.plugin` archive (depends: Phase 3)
- [x] Phase 5: Update README.md with dual-install instructions (depends: Phase 4)
- [x] Phase 6: Update CLAUDE.md with Cowork install note (depends: Phase 5)
- [x] Phase 7: Test-run build script, verify archive structure (depends: Phase 4)

**Pre-Work Checklist**:
- [x] Read relevant files (plugin.json, marketplace.json, hooks.json, hooks/*)
- [x] Searched for similar implementations (Cowork productivity plugin layout)
- [x] Identified patterns to follow (commands/ as thin wrappers, skills/ as deep docs)
- [x] Reviewed known gotchas (virtiofs can't do zip's atomic rename → build script stages in /tmp)

**Notes**:
Files added:
- `commands/tm-init.md`, `commands/task-memory.md`, `commands/task-status.md` — Cowork-style thin slash-command wrappers (YAML frontmatter + prose, delegate to `${CLAUDE_PLUGIN_ROOT}/skills/*/SKILL.md`)
- `scripts/build-cowork-plugin.sh` — produces `dist/task-memory-<version>.plugin` (zip) + `.tar.gz` fallback. Stages in mktemp to avoid fuse/NFS rename failures. Reads version dynamically from plugin.json without jq.

Files updated:
- `.claude-plugin/plugin.json` → v3.2.0, description mentions both runtimes, adds `claude-code` and `cowork` keywords
- `README.md` — restructured Quick Start: Claude Code install first, Cowork sideload second, git clone / manual copy / standalone HTML after. Added dual-format callout at top. File Structure diagram now shows `.claude-plugin/`, `commands/`, `scripts/`.
- `CLAUDE.md` — Install section now documents both paths

Verification (tested in /tmp clean copy):
- `dist/task-memory-3.2.0.plugin` — 52 KB zip, 26 files
- All required paths present (plugin.json, hooks.json, 3 skills, 3 commands, README, LICENSE)
- No leaked __pycache__, .DS_Store, node_modules, or planning/
- Python hook compiles (`py_compile` passes)
- All three JSON files parse
- SessionStart smoke-test: prints TASK-MEMORY SESSION START banner correctly from the unpacked archive

**Errors Log**:
- 2026-04-16 — zip failed on virtiofs mount ("Operation not permitted" on rename). Fix: build script now stages and zips inside `mktemp -d` (local tmpfs), then copies finished artifact to `dist/`. Works on any filesystem.

### TASK-015 | Structural Context Preservation — v3.1.0 Overhaul
**Priority**: 🟠 High | **Category**: Feature | **Status**: done | **Assigned**: @user
**Workflow**: Refactor | **Complexity**: Complex
**Created**: 2026-04-16 | **Started**: 2026-04-16 | **Finished**: 2026-04-16
**Tags**: #hooks #skills #context-preservation #plugin

Context loss was the #1 failure mode, and every preservation mechanism was advisory. Make preservation structural via hook enforcement so Claude can't ship research without synthesis.

**Subtasks**:
- [x] Phase 1: Hook — SessionStart auto-loads notes or warns CONTEXT GAP
- [x] Phase 2: Hook — auto-create notes skeleton at 2-op boundary (depends: Phase 1)
- [x] Phase 3: Hook — Stop blocks on empty/skeleton notes with research (depends: Phase 2)
- [x] Phase 4: Hook — PreCompact appends ops log to main notes file (depends: Phase 2)
- [x] Phase 5: `/task-status` rewrite — Context Health Score 0-5 (depends: Phase 1)
- [x] Phase 6: `/task-memory` rewrite — Context Preservation Protocol section (depends: Phase 5)
- [x] Phase 7: `/tm-init` — CLAUDE.md template includes session-start + preservation (depends: Phase 6)
- [x] Phase 8: Project CLAUDE.md — triage + preservation tables (depends: Phase 7)
- [x] Phase 9: TROUBLESHOOTING — document skeleton/gap failure modes
- [x] Phase 10: Bump plugin.json to 3.1.0

**Pre-Work Checklist**:
- [x] Read relevant files (hook, all three skills, CLAUDE.md)
- [x] Searched for similar implementations (existing 2-Action Rule scaffolding)
- [x] Identified patterns to follow (hook returns JSON with decision: block)
- [x] Reviewed known gotchas (counter file path; glob bypass in multi-file mode)

**Notes**:
Files changed:
- `hooks/task-memory-hook.py` — added `_load_notes_summary`, `_count_research_ops`, `_create_notes_skeleton`, `_notes_has_content`, `_detect_complexity`; rewrote SessionStart, Stop, PreCompact handlers
- `skills/task-memory/SKILL.md` → v3.0.0
- `skills/task-status/SKILL.md` → v2.0.0 (Context Health Score)
- `skills/tm-init/SKILL.md` → v2.0.0 (CLAUDE.md template)
- `skills/task-memory/TROUBLESHOOTING.md`
- `CLAUDE.md` (project root)
- `.claude-plugin/plugin.json` → 3.1.0

Verified in `/tmp/tm-test-gap`: empty-project path, gap detection, Stop block, skeleton creation all pass.

**Errors Log**:

### TASK-013 | Subtask/Checklist UI Redesign
**Priority**: 🟠 High | **Category**: UI/UX | **Status**: done | **Assigned**: @user
**Workflow**: Feature | **Complexity**: Complex
**Created**: 2026-01-15 | **Started**: 2026-01-15 | **Finished**: 2026-01-15
**Tags**: #ui #ux #subtasks #checklist #accessibility

Complete redesign of the subtask and pre-work checklist interface based on 4-expert UI/UX review.

**Subtasks**:
- [x] Phase 1: Semantic HTML - Convert divs to proper checkbox inputs
- [x] Phase 2: Inline editing - Click-to-edit subtask text
- [x] Phase 3: Delete with undo - Replace window.confirm with toast
- [x] Phase 4: Drag reordering - Add drag handles and reorder logic
- [x] Phase 5: Keyboard shortcuts - Space/Enter toggle, Alt+arrows reorder
- [x] Phase 6: Visual differentiation - Different styling for checklist vs subtasks
- [x] Phase 7: Accessibility fixes - ARIA attributes, focus management, contrast
- [x] Phase 8: Bulk actions - Section menu with Complete All, Clear Completed
- [x] Phase 9: Progress bar improvements - Move below list, add percentage

**Pre-Work Checklist**:
- [x] Searched for similar implementations in codebase
- [x] Identified patterns to follow (design system, existing components)
- [x] Reviewed known gotchas (accessibility, keyboard nav)
- [x] Read relevant files (TaskModal.jsx, TaskForm.jsx, style.css)

**Notes**:
Expert recommendations from 4 agents:
- UI Designer: Unify completion styling, remove strikethrough, use border accent
- UX Specialist: Add edit/delete/reorder, improve input affordance
- A11y Expert: Semantic checkboxes, ARIA, color contrast, focus management
- DevTools UX: Inline edit, keyboard shortcuts, bulk actions, sync indicator

**Files Modified**:
- src/components/task/TaskModal.jsx - Complete rewrite with new features
- src/style.css - Added checklist, drag, dropdown, and undo toast styles
- src/App.jsx - Added handlers for update, reorder, and pre-work toggle
- src/utils/markdown.js - Fixed emoji handling in column headers

**Errors Log**:
- 2026-01-16 10:45:38 - Error: Error: module not found
- 2026-01-16 09:19:30 - Error: Error: command not found

### TASK-010 | Test Auto-Reorg: To Do→Done
**Priority**: Low | **Category**: Testing | **Status**: done | **Assigned**: @user
**Created**: 2026-01-15 | **Finished**: 2026-01-15
**Tags**: #testing #auto-reorg

Test task for auto-reorganization. Originally in To Do section with Status: done → UI auto-moved to Done.

**Subtasks**:
- [x] Verify task moves to correct section based on Status field

**Notes**:
- Confirms Status field is authoritative over section placement

**Errors Log**:
- 2026-01-16 10:45:38 - Error: Error: module not found
- 2026-01-16 09:19:30 - Error: Error: command not found

### TASK-007 | Update Navbar CSS Styles
**Priority**: High | **Category**: UI/UX | **Status**: done | **Assigned**: @user
**Created**: 2026-01-14 | **Started**: 2026-01-14 | **Finished**: 2026-01-14
**Tags**: #navbar #css #design-system

Refactor navbar CSS to match new architecture and design system.
**Changes Required:**
- CSS Grid layout instead of flexbox
- Visual dividers between zones
- Grouped utilities with elevated background
- Amber accent for primary CTA (not blue)
- Improved spacing rhythm

**Subtasks**:
- [x] Convert navbar from flexbox to CSS Grid
- [x] Define grid-template-columns: auto 1fr auto
- [x] Add .navbar-divider styles
- [x] Add .navbar-utilities container styles
- [x] Update .btn-primary to use amber accent
- [x] Remove .navbar-title styles (no longer used)
- [x] Update .navbar-stats to .navbar-context
- [x] Add transition animations for expand/collapse
- [x] Verify design system compliance
- [x] Grid layout aligns correctly
- [x] Dividers visible between zones
- [x] Utilities have elevated background
- [x] Primary button uses amber color
- [x] Spacing follows design system
- [ ] Dark theme renders correctly
- [ ] Light theme renders correctly
- [ ] Midnight theme renders correctly
- [ ] Forest theme renders correctly
- [x] Hover transitions are smooth
- [x] Expand/collapse animations work
- [x] No jank or layout shift

**Notes**:
- Completed as part of TASK-002 navbar restructure
- CSS Grid 3-column layout: auto 1fr auto
- All new classes added: navbar-identity, navbar-context, navbar-stats-compact, etc.
- Warning/critical states for file stats pill
- Theme tests pending manual verification

**Errors Log**:
- 2026-01-16 10:45:38 - Error: Error: module not found
- 2026-01-16 09:19:30 - Error: Error: command not found

### TASK-006 | Add Mobile FAB for New Task
**Priority**: Medium | **Category**: Feature | **Status**: done | **Assigned**: @user
**Created**: 2026-01-14 | **Started**: 2026-01-14 | **Finished**: 2026-01-14
**Tags**: #mobile #ui #component #fab

Add floating action button (FAB) for "New Task" on mobile devices.
**Design:**
- Position: fixed bottom-right with safe area inset
- Size: 56px circular
- Color: amber accent (design system primary)
- Shadow: elevated appearance
- Icon: Plus

**Subtasks**:
- [x] Create FAB component or inline in App.jsx
- [x] Position with fixed positioning
- [x] Add safe-area-inset-bottom for iOS
- [x] Style with amber accent color
- [x] Add elevation shadow
- [x] Show only on mobile (<768px)
- [x] Hide "New Task" button from navbar on mobile
- [x] Add press feedback animation
- [x] FAB visible only on mobile viewport
- [x] FAB hidden on tablet and desktop
- [x] FAB positioned in bottom-right
- [x] Click opens task creation form
- [x] Press shows feedback animation
- [x] FAB doesn't overlap kanban content
- [x] Has aria-label="Create new task"
- [x] Focusable via keyboard
- [x] Visible against all backgrounds

**Notes**:
- Inline implementation in App.jsx (not separate component)
- Uses env(safe-area-inset-bottom) for iOS notch
- Hidden by default, shown on mobile via media query
- Scale animation on press, box-shadow on hover

**Errors Log**:
- 2026-01-16 10:45:38 - Error: Error: module not found
- 2026-01-16 09:19:30 - Error: Error: command not found

### TASK-005 | Implement Responsive Navbar Layout
**Priority**: High | **Category**: Feature | **Status**: done | **Assigned**: @user
**Created**: 2026-01-14 | **Started**: 2026-01-14 | **Finished**: 2026-01-14
**Tags**: #navbar #responsive #mobile #css

Implement responsive breakpoints for navbar with mobile-first design.
**Breakpoints:**
- Desktop (>1024px): Full layout with all zones
- Tablet (768-1024px): Summary badge replaces full stats
- Mobile (<768px): Minimal top bar + FAB

**Subtasks**:
- [x] Define CSS Grid layout for desktop
- [x] Create tablet breakpoint with collapsed stats
- [x] Create mobile breakpoint with minimal header
- [x] Hide navbar-utilities on mobile (move to overflow)
- [x] Adjust touch targets to 44px minimum
- [ ] Test on actual mobile devices/simulators
- [x] All three zones visible
- [x] TaskSummaryBadge shows full stats
- [x] All utility buttons visible
- [x] Context zone uses compact badge
- [x] Utilities remain visible
- [x] No horizontal overflow
- [x] Only logo, project selector, overflow menu visible
- [x] Utility buttons hidden in overflow
- [x] Touch targets meet 44px minimum
- [x] No horizontal scroll

**Notes**:
- Completed as part of TASK-002 navbar restructure
- All responsive breakpoints implemented in style.css
- Tablet: labels hidden on stat pills
- Mobile: stats hidden, utilities hidden, new task icon-only

**Errors Log**:
- 2026-01-16 10:45:38 - Error: Error: module not found
- 2026-01-16 09:19:30 - Error: Error: command not found

### TASK-004 | Create OverflowMenu Component
**Priority**: High | **Category**: Feature | **Status**: done | **Assigned**: @user
**Created**: 2026-01-14 | **Started**: 2026-01-14 | **Finished**: 2026-01-14
**Tags**: #navbar #component #ui #mobile

Create a dropdown menu to group secondary actions and reduce navbar clutter.
**Menu Items:**
```
- Refresh (Cmd+R)
- Manage Columns
- View Archive [badge: count]

**Visual Operations Log**:
- 2026-01-16 22:47:16 - WebFetch: https://github.com/anthropics/claude-code/issues/10412
- 2026-01-16 22:47:16 - WebFetch: https://github.com/hesreallyhim/awesome-claude-code
- 2026-01-16 22:47:02 - WebFetch: https://code.claude.com/docs/en/hooks
- 2026-01-16 22:47:02 - WebFetch: https://egghead.io/force-claude-to-ask-whats-next-with-a-continuous-stop-hook-workflow~oiqzj
- 2026-01-16 22:47:02 - WebFetch: https://github.com/AndyMik90/Auto-Claude
- 2026-01-16 22:46:48 - WebSearch: ""
- 2026-01-16 22:46:48 - WebSearch: "Claude Code hooks blocking loop force continuation SessionEnd"
- 2026-01-16 22:46:48 - WebSearch: "Claude Code Stop hook prevent session end workflow"
- 2026-01-16 22:46:48 - WebSearch: "Claude Code "
- 2026-01-16 22:46:48 - WebSearch: "Claude Code task completion enforcement hooks patterns"
- 2026-01-16 10:45:29 - WebSearch: "claude code hooks documentation"
- 2026-01-16 09:19:21 - WebFetch: https://example.com/docs
---
- Settings
---
- Open Different Project
```
**Location**: `src/components/common/OverflowMenu.jsx`

**Subtasks**:
- [x] Create OverflowMenu component file
- [x] Implement dropdown with menu items
- [x] Add keyboard shortcuts display
- [x] Add badge indicator for archive count
- [x] Add dividers between groups
- [x] Implement click-outside to close
- [x] Add keyboard navigation (arrow keys)
- [x] Style consistent with ProjectSelector dropdown
- [ ] Export from components/common/index.js (direct import used)
- [x] Menu button shows MoreHorizontal icon
- [x] Dropdown shows all menu items
- [x] Keyboard shortcuts display correctly
- [x] Archive badge shows correct count
- [x] Click opens dropdown
- [x] Click outside closes dropdown
- [x] Escape key closes dropdown
- [x] Arrow keys navigate items
- [x] Enter/Space activates item
- [x] Menu item click triggers callback and closes
- [x] onRefresh triggers handleRefresh
- [x] onColumns triggers setShowColumnModal
- [x] onArchive triggers setShowArchiveModal
- [x] onSettings triggers setShowSettingsModal
- [x] onOpenProject triggers handleOpenProject

**Notes**:
- Created OverflowMenu.jsx with full keyboard navigation
- Hidden on desktop (utilities visible), shown on mobile
- Includes all secondary actions with divider groups
- Settings button hidden on mobile (in overflow menu)

**Errors Log**:

### TASK-003 | Create TaskSummaryBadge Component
**Priority**: High | **Category**: Feature | **Status**: done | **Assigned**: @user
**Created**: 2026-01-14 | **Started**: 2026-01-14 | **Finished**: 2026-01-14
**Tags**: #navbar #component #ui

Create a progressive disclosure component that shows compact stats by default and expands on interaction.
**Design:**
```
Compact (default): [•••• 20 | 2%]
Expanded (hover):  To Do: 20 | In Progress: 0 | Done: 0 | File: 2%
```
**Location**: `src/components/common/TaskSummaryBadge.jsx`

**Subtasks**:
- [x] Create TaskSummaryBadge component file
- [x] Implement compact view with dot indicators
- [x] Implement expanded view with full stats
- [x] Add hover/click interaction to toggle views
- [x] Style with design system colors (amber for warning)
- [x] Add file size warning indicator (amber at 50%, red at 80%)
- [ ] Export from components/common/index.js (direct import used)
- [x] Integrate into navbar-context zone
- [x] Compact view shows total count and percentage
- [x] Expanded view shows all column counts
- [x] Warning colors appear at correct thresholds
- [x] Hover expands the badge
- [x] Click on badge expands/collapses
- [x] Mouse leave collapses after delay
- [x] Keyboard focus triggers expand (accessibility)
- [x] `stats` prop updates display correctly
- [x] `fileStats` prop shows percentage
- [x] Missing props render gracefully (no crash)

**Notes**:
- Created TaskSummaryBadge.jsx with full progressive disclosure
- Added CSS styles in style.css
- Integrated into App.jsx navbar-context zone
- Features: dot indicators by column, click-to-pin, keyboard accessible

**Errors Log**:

### TASK-002 | Navbar Architecture Redesign
**Priority**: High | **Category**: UI/UX | **Status**: done | **Assigned**: @user
**Created**: 2026-01-14 | **Started**: 2026-01-14 | **Finished**: 2026-01-14
**Tags**: #navbar #ui #ux #architecture

Restructure the navbar into three clear zones with improved information hierarchy.
**Current Problems:**
- Logo, title, and project selector are nested incorrectly
- Stats are visually disconnected from actions
- Action buttons lack logical grouping
- Asymmetric visual weight across the navbar
- Stats disappear entirely on tablet breakpoint
**Proposed Structure:**
```
[Identity Zone] | [Context Zone] | [Actions Zone]
Logo only     Project + Stats   New Task + Utilities
```

**Subtasks**:
- [x] Remove "Task Memory" title text (logo is sufficient identity)
- [x] Extract ProjectSelector from navbar-brand to navbar-context
- [x] Create navbar-context div with project selector and stats
- [x] Create navbar-utilities container for grouped icon buttons
- [x] Add visual dividers between zones
- [x] Update navbar to use CSS Grid (3-column layout)
- [x] Move primary "New Task" button to prominent position
- [x] Navbar renders with all three zones
- [x] Logo displays without title text
- [x] Dividers appear between zones
- [x] All action buttons remain functional
- [x] `hasProject=false` hides context and utility zones
- [x] `hasProject=true` shows all zones
- [x] Loading state disables action buttons

**Notes**:
- 2026-01-14: Completed JSX restructure and CSS update
- Changed from flexbox to CSS Grid (3-column layout)
- Added responsive breakpoints for tablet/mobile
- Loading state navbar updated to match new architecture
- All tests verified through code inspection

**Errors Log**:

### TASK-009 | Auto-Claude Audit & Task-Memory Improvement Analysis
**Priority**: High | **Category**: Research | **Status**: done | **Assigned**: @user
**Workflow**: Investigation | **Complexity**: Standard
**Created**: 2026-01-14 | **Started**: 2026-01-14 | **Finished**: 2026-01-14
**Tags**: #research #audit #improvement #auto-claude

Full audit of the Auto-Claude repository to identify patterns and features that can improve task-memory and task-status skills.

**Subtasks**:
- [x] Fetch and analyze Auto-Claude repository structure
- [x] Analyze spec_researcher.md methodology
- [x] Analyze planner.md workflow and phase system
- [x] Analyze coder.md session architecture
- [x] Analyze insight_extractor.md for memory persistence
- [x] Analyze qa_reviewer.md for validation patterns
- [x] Analyze complexity_assessor.md for task classification
- [x] Analyze spec_writer.md for specification format
- [x] Analyze followup_planner.md for sequential planning
- [x] Analyze spec_gatherer.md for requirements collection
- [x] Document findings in notes/TASK-009.md
- [x] Compare Auto-Claude patterns with task-memory
- [x] Identify concrete improvement opportunities
- [x] Create implementation recommendations
- [x] Implement SKILL.md v2.5.0 updates
- [x] Update task-status SKILL.md to v1.2.0
- [x] Update UI to support new fields
- [x] Read relevant files
- [x] Searched for similar implementations
- [x] Identified patterns to follow
- [x] Reviewed known gotchas

**Notes**:
Full documentation in notes/TASK-009.md

Key findings:

- Auto-Claude uses 5 workflow types vs our Category field
- Structured insight extraction after each task (patterns, gotchas)
- Pre-implementation checklists for bug prevention
- Mandatory self-critique before marking done
- 3-tier complexity assessment (Simple/Standard/Complex)
- 10-phase QA validation framework
- Explicit phase dependencies

Implemented improvements:

1. Workflow type field (Feature/Refactor/Investigation/Migration/Simple)
2. Complexity field (Simple/Standard/Complex)
3. Pre-Implementation Checklist (Rule 5)
4. Self-Critique phase before done (Rule 6)
5. Structured insights in notes (Patterns/Gotchas tables)
6. Phase dependencies in subtasks
7. UI support for all new fields

**Errors Log**:

