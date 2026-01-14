# Kanban Board

<!-- Config: Last Task ID: 005 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

**Categories**: Feature, Bug, Docs, Research

**Users**: @alice, @bob

**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

**Tags**: #api #frontend #backend #research #urgent

---

## 📝 To Do

### TASK-005 | Add user authentication

**Priority**: High | **Category**: Backend | **Status**: todo
**Assigned**: @bob
**Created**: 2026-01-10
**Tags**: #backend #api

Implement JWT-based user authentication for the API.

**Subtasks**:
- [ ] Research authentication libraries
- [ ] Implement login endpoint
- [ ] Implement logout endpoint
- [ ] Add middleware for protected routes
- [ ] Write tests

---

## 🚧 In Progress

### TASK-003 | Implement dashboard UI

**Priority**: High | **Category**: Feature | **Status**: in-progress
**Assigned**: @alice
**Created**: 2026-01-08 | **Started**: 2026-01-11
**Tags**: #frontend #research

Build the main dashboard interface based on design specs.

**Subtasks**:
- [x] Review design mockups
- [x] Research component libraries
- [ ] Build header component
- [ ] Build sidebar navigation
- [ ] Implement data grid

**Notes**:
Reviewed design specs and researched React component options.
Decision: Using shadcn/ui for consistency with existing codebase.

**Visual Operations Log**:
- 2026-01-11 10:30:45 - WebFetch: https://ui.shadcn.com/docs
- 2026-01-11 10:32:18 - WebSearch: "React dashboard component patterns 2026"
- 2026-01-11 10:45:22 - WebFetch: https://tailwindcss.com/docs/grid-template-columns

Documentation in notes/TASK-003.md

---

### TASK-004 | Fix pagination bug

**Priority**: Critical | **Category**: Bug | **Status**: in-progress
**Assigned**: @bob
**Created**: 2026-01-09 | **Started**: 2026-01-12
**Tags**: #backend #urgent

Users report that pagination returns duplicate items on page 2.

**Subtasks**:
- [x] Reproduce the bug locally
- [ ] Identify root cause
- [ ] Implement fix
- [ ] Add regression tests

**Notes**:
Reproduced: When sorting by date DESC, offset calculation is wrong.

**Errors Log**:
| Error | Attempt | Resolution |
|-------|---------|------------|
| Test timeout | 1 | Increased jest timeout to 10s |
| DB connection refused | 2 | Started postgres container |

---

## ✅ Done

### TASK-001 | Project setup and configuration

**Priority**: Critical | **Category**: Feature | **Status**: done
**Assigned**: @alice, @bob
**Created**: 2026-01-05 | **Started**: 2026-01-05 | **Finished**: 2026-01-07
**Tags**: #backend #frontend

Initialize the project with build tooling, linting, and CI/CD.

**Subtasks**:
- [x] Initialize npm project
- [x] Configure TypeScript
- [x] Setup ESLint and Prettier
- [x] Configure GitHub Actions
- [x] Setup development environment

**Notes**:
Project initialized with Vite + React + TypeScript.
CI/CD pipeline runs tests on every PR.

---

### TASK-002 | Research API design patterns

**Priority**: Medium | **Category**: Research | **Status**: done
**Assigned**: @alice
**Created**: 2026-01-06 | **Started**: 2026-01-07 | **Finished**: 2026-01-08
**Tags**: #research #api

Research REST API best practices and document recommendations.

**Subtasks**:
- [x] Review existing API designs
- [x] Research pagination strategies
- [x] Document error handling patterns
- [x] Create API style guide

**Notes**:
Completed API research. Recommendations:
- Use cursor-based pagination for large datasets
- Standardize error response format
- Version API with /v1/ prefix

**Visual Operations Log**:
- 2026-01-07 14:20:30 - WebSearch: "REST API pagination best practices"
- 2026-01-07 14:25:45 - WebFetch: https://jsonapi.org/format/
- 2026-01-07 14:40:12 - WebFetch: https://developer.github.com/v3/

Full research documented in notes/TASK-002.md

---
