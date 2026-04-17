# Task Archive

> Completed and archived tasks with preserved context. Move tasks here from `tasks.md → ✅ Done`
> when the board gets too busy. Keeps the board focused; keeps the context searchable.

---

## January 2026

### TASK-012 | Implement dark mode toggle

**Priority**: Medium | **Category**: Frontend | **Status**: done
**Workflow**: Feature | **Complexity**: Standard
**Assigned**: @alice
**Created**: 2025-12-28 | **Started**: 2025-12-30 | **Finished**: 2026-01-03
**Tags**: #frontend #feature #ui

Add dark mode support with system preference detection and manual toggle.

**Subtasks**:
- [x] Research CSS custom properties approach
- [x] Create color palette for dark theme
- [x] Implement theme toggle component
- [x] Add localStorage persistence
- [x] Test accessibility contrast ratios

**Notes**:
Uses CSS custom properties with `prefers-color-scheme` media query for initial state.
Toggle persists to localStorage. All color combinations meet WCAG AA contrast.
Full analysis in notes/TASK-012.md.

**Visual Operations Log**:
- 2025-12-30 09:15:22 - WebSearch: "CSS dark mode best practices 2025"
- 2025-12-30 09:18:45 - WebFetch: https://web.dev/prefers-color-scheme/
- 2025-12-30 09:25:10 - WebFetch: https://tailwindcss.com/docs/dark-mode

---

### TASK-010 | Migrate database to PostgreSQL

**Priority**: Critical | **Category**: Backend | **Status**: done
**Workflow**: Migration | **Complexity**: Complex
**Assigned**: @bob
**Created**: 2025-12-15 | **Started**: 2025-12-18 | **Finished**: 2025-12-27
**Tags**: #backend #database #migration

Migrate from SQLite to PostgreSQL for production scalability.

**Subtasks**:
- [x] Set up PostgreSQL on staging
- [x] Write migration scripts
- [x] Test data integrity
- [x] Perform production migration
- [x] Verify all queries work correctly
- [x] Update connection pooling

**Notes**:
Completed during maintenance window. 15,000 records migrated, zero data loss,
query performance improved 40%, connection pool capped at 20.
Runbook in notes/TASK-010.md.

**Visual Operations Log**:
- 2025-12-18 14:30:00 - WebSearch: "PostgreSQL migration from SQLite best practices"
- 2025-12-18 14:45:22 - WebFetch: https://www.postgresql.org/docs/current/migration.html
- 2025-12-20 10:15:30 - WebFetch: https://node-postgres.com/features/pooling

---

### TASK-008 | Set up CI/CD pipeline

**Priority**: High | **Category**: DevOps | **Status**: done
**Workflow**: Feature | **Complexity**: Standard
**Assigned**: @alice, @bob
**Created**: 2025-12-10 | **Started**: 2025-12-12 | **Finished**: 2025-12-15
**Tags**: #devops #ci #automation

Configure GitHub Actions for automated testing and deployment.

**Subtasks**:
- [x] Create test workflow
- [x] Add build workflow
- [x] Configure deployment to staging
- [x] Add production deployment with approval
- [x] Set up Slack notifications

**Notes**:
Pipeline stages: lint/typecheck → unit tests → build → staging (auto) → prod (manual).
Average pipeline time: 4 min. Notes in notes/TASK-008.md.

---

## December 2025

### TASK-005 | Initial project setup

**Priority**: Critical | **Category**: DevOps | **Status**: done
**Workflow**: Simple | **Complexity**: Simple
**Assigned**: @alice
**Created**: 2025-12-01 | **Started**: 2025-12-01 | **Finished**: 2025-12-05
**Tags**: #setup #infrastructure

Initialize project repository with tooling and dependencies.

**Subtasks**:
- [x] Create repository
- [x] Configure TypeScript
- [x] Set up ESLint and Prettier
- [x] Add testing framework
- [x] Write initial documentation

**Notes**:
Bootstrapped with Vite + React 18 + TypeScript, Vitest, ESLint + Prettier, Husky pre-commit hooks.

---
