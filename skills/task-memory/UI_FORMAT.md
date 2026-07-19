# File Format for UI Compatibility

The task-memory UI (`task-memory.html`) requires a specific format. Tasks MUST be nested under column sections.

## Required Structure

```markdown
# Kanban Board

<!-- Config: Last Task ID: XXX -->

# or (for team mode with per-dev files):

<!-- Config: Task Prefix: GR | Last Task ID: 677 -->

## ⚙️ Configuration

**Columns**: To Do (todo) | In Progress (in-progress) | Done (done)

**Categories**: Feature, Bug, Docs, Research, Refactor, Migration

**Users**: @alice, @bob

**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

**Tags**: #tag1 #tag2 #tag3

---

## To Do

### TASK-001 | Task Title
**Priority**: High | **Category**: Feature | **Status**: todo
...

## In Progress

### TASK-002 | Another Task
**Priority**: Medium | **Category**: Bug | **Status**: in-progress
...

## Done

### TASK-003 | Completed Task
**Priority**: Low | **Category**: Docs | **Status**: done
...
```

## Critical Requirements

1. **Configuration section**: Must use `## ⚙️ Configuration` header (with emoji)
2. **Columns format**: `**Columns**: Name (id) | Name (id) | Name (id)`
3. **Column sections**: Tasks go under section headers matching configured columns
4. **Task headers**: Use `### TASK-XXX` (h3 level), NOT `## TASK-XXX` (h2 level)
5. **Separator**: Use `---` ONLY after the configuration section, NOT between tasks
6. **IMPORTANT**: Use EXISTING section headers - do NOT create new ones with different emoji/formatting

## Column ID Mapping

The `(id)` in the Columns definition maps to the `**Status**:` field:

| Column Definition | Status Value |
|-------------------|--------------|
| `To Do (todo)` | `**Status**: todo` |
| `In Progress (in-progress)` | `**Status**: in-progress` |
| `Done (done)` | `**Status**: done` |

## ❌ Invalid Format (Won't Parse)

```markdown
## TASK-001 | Task Title       ← WRONG: h2 level, not under column
**Status**: done

## TASK-002 | Another Task     ← WRONG: standalone sections
**Status**: todo

## 📝 To Do                    ← WRONG: Creating new section when "To Do" exists
### TASK-003 | New Task
---                            ← WRONG: separator between tasks
### TASK-004 | Another Task
```

## ✅ Valid Format (Will Parse)

```markdown
## To Do                       ← CORRECT: Use EXISTING section header from file

### TASK-002 | Another Task    ← CORRECT: h3 level, under column
**Status**: todo

### TASK-003 | New Task        ← CORRECT: No separator between tasks
**Status**: todo

## Done                        ← CORRECT: Use EXISTING section header from file

### TASK-001 | Task Title      ← CORRECT: h3 level, under column
**Status**: done
```

## Adding Tasks to Existing Files

When adding a new task to an existing file:

1. **Find the correct section**: Search for the existing section header (e.g., `## To Do` or `## 📝 To Do`)
2. **Match existing format**: Use the EXACT header format already in the file - don't add emojis if none exist
3. **Append to section**: Add your task at the end of that section, before the next `## ` header
4. **No separators**: Do NOT add `---` between tasks

```markdown
# WRONG - Creating new section instead of using existing:
## To Do
(existing tasks...)

## 📝 To Do              ← Creates duplicate section!
### TASK-NEW | ...

# CORRECT - Append to existing section:
## To Do
(existing tasks...)

### TASK-NEW | ...       ← Appended correctly
```
