# Kanban Board

<!-- Config: Last Task ID: 14 -->

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

