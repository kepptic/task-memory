# Task Board

<!-- Config: Last Task ID: 006 -->

## ⚙️ Configuration

**Columns**: 📝 To Do (todo) | 🚀 In Progress (in-progress) | 👀 In Review (in-review) | ✅ Done (done)

**Categories**: Frontend, Backend, Design, DevOps, Tests, Documentation, Research

**Users**: @alice, @bob

**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

**Tags**: #api #frontend #backend #research #urgent #bug #feature #docs #test

---

## 📝 To Do

### TASK-006 | Add user authentication

**Priority**: High | **Category**: Backend | **Status**: todo
**Workflow**: Feature | **Complexity**: Standard
**Assigned**: @bob
**Created**: 2026-01-14
**Tags**: #backend #api #feature

Implement JWT-based user authentication for the API.

**Subtasks**:
- [ ] Research authentication libraries
- [ ] Implement login endpoint
- [ ] Implement logout endpoint
- [ ] Add middleware for protected routes
- [ ] Write tests

---

### TASK-005 | Document the public API

**Priority**: Medium | **Category**: Documentation | **Status**: todo
**Workflow**: Simple | **Complexity**: Simple
**Assigned**: @alice
**Created**: 2026-01-13
**Tags**: #docs

Write reference docs for every public endpoint. Paused 2026-01-15 pending TASK-006.

**Subtasks**:
- [ ] Draft endpoint index
- [ ] Document request/response shapes
- [ ] Add curl examples

---

## 🚀 In Progress

### TASK-003 | Implement dashboard UI

**Priority**: High | **Category**: Frontend | **Status**: in-progress
**Workflow**: Feature | **Complexity**: Standard
**Assigned**: @alice
**Created**: 2026-01-08 | **Started**: 2026-01-11
**Tags**: #frontend #feature

Build the main dashboard interface based on design specs.

**Subtasks**:
- [x] Review design mockups
- [x] Research component libraries
- [ ] Build header component
- [ ] Build sidebar navigation
- [ ] Implement data grid

**Notes**:
Documentation in notes/TASK-003.md — see Decisions section for the shadcn/ui rationale.

**Visual Operations Log**:
- 2026-01-11 10:30:45 - WebFetch: https://ui.shadcn.com/docs
- 2026-01-11 10:32:18 - WebSearch: "React dashboard component patterns 2026"
- 2026-01-11 10:45:22 - WebFetch: https://tailwindcss.com/docs/grid-template-columns

---

### TASK-004 | Fix pagination duplicate bug

**Priority**: Critical | **Category**: Backend | **Status**: in-progress
**Workflow**: Investigation | **Complexity**: Simple
**Assigned**: @bob
**Created**: 2026-01-09 | **Started**: 2026-01-12
**Tags**: #backend #bug #urgent

Users report that pagination returns duplicate items on page 2 when sorting by date DESC.

**Subtasks**:
- [x] Reproduce the bug locally
- [ ] Identify root cause
- [ ] Implement fix in `src/api/pagination.ts`
- [ ] Add regression tests in `tests/pagination.test.ts`

**Notes**:
Reproduced: offset calculation is wrong when the sort column has ties.

**Errors Log**:
- 2026-01-12 09:15:30 - Error: Test timeout — increased Jest timeout to 10s
- 2026-01-12 09:22:45 - Error: DB connection refused — started postgres container

---

## 👀 In Review

### TASK-002 | Research API design patterns

**Priority**: Medium | **Category**: Research | **Status**: in-review
**Workflow**: Investigation | **Complexity**: Simple
**Assigned**: @alice
**Created**: 2026-01-06 | **Started**: 2026-01-07 | **Finished**: 2026-01-08
**Tags**: #research #api

Research REST API best practices and propose recommendations for our v1 endpoints.

**Subtasks**:
- [x] Review existing API designs
- [x] Research pagination strategies
- [x] Document error handling patterns
- [x] Create API style guide

**Notes**:
Full research documented in notes/TASK-002.md. Recommendations:
- Cursor-based pagination for list endpoints
- JSON:API error format
- `/v1/` URL prefix

**Visual Operations Log**:
- 2026-01-07 14:20:30 - WebSearch: "REST API pagination best practices"
- 2026-01-07 14:25:45 - WebFetch: https://jsonapi.org/format/
- 2026-01-07 14:40:12 - WebFetch: https://developer.github.com/v3/

---

## ✅ Done

### TASK-001 | Project setup and configuration

**Priority**: Critical | **Category**: DevOps | **Status**: done
**Workflow**: Simple | **Complexity**: Simple
**Assigned**: @alice, @bob
**Created**: 2026-01-05 | **Started**: 2026-01-05 | **Finished**: 2026-01-07
**Tags**: #devops #backend #frontend

Initialize the project with build tooling, linting, and CI.

**Subtasks**:
- [x] Initialize npm project
- [x] Configure TypeScript
- [x] Setup ESLint and Prettier
- [x] Configure GitHub Actions
- [x] Setup development environment

**Notes**:
Project initialized with Vite + React + TypeScript. CI/CD runs tests on every PR.

---
