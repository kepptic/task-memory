# Troubleshooting & Common Mistakes

## Common Mistakes

### ❌ Creating duplicate sections
```markdown
## To Do                      ← File already has this
(tasks...)

## 📝 To Do                   ← WRONG: Created duplicate with emoji
### TASK-NEW | ...
```
**Fix:** Find and use the EXISTING section header, don't create new ones

### ❌ Adding separators between tasks
```markdown
### TASK-001 | First Task
...
---                          ← WRONG: separator between tasks
### TASK-002 | Second Task
```
**Fix:** Only use `---` after Configuration section, never between tasks

### ❌ Status/Section mismatch
```markdown
## To Do
### TASK-001 | Task
**Status**: in-progress      ← Status doesn't match section
```
**Note:** The UI auto-reorganizes these mismatches on load, but keeping them in sync improves file readability.

### ❌ Working without task
```
User: "Fix the bug"
Assistant: *immediately writes code*  ← WRONG
```
**Fix:** Create TASK-XXX first, then code

### ❌ Skipping research preservation
```
View screenshot → Read PDF → Code → [context reset] → Lost insights  ← WRONG
```
**Fix:** After 2 research ops, the hook auto-creates `planning/notes/TASK-XXX.md`. You must fill in Patterns / Gotchas / Decisions — the Stop hook will block if the file is empty on tasks with research.

### ❌ Empty skeleton notes
```markdown
## Patterns Discovered
_Reusable techniques, "do this"_

-                                       ← WRONG: placeholder left empty
```
**Fix:** Replace the italic placeholder with actual Patterns. Each bullet should be specific enough to apply without re-reading source material. Stop hook checks for ≥3 non-placeholder lines.

### ❌ Vague notes
```markdown
- Looked at screenshot, has panels  ← WRONG
```
**Fix:**
```markdown
- 3-panel layout: 250px left, fluid center, 300px right  ← CORRECT
```

### ❌ Ignoring "CONTEXT GAP DETECTED" at SessionStart
```
[SessionStart shows:]
⚠️  CONTEXT GAP DETECTED
   6 research operations logged but NO notes file.
   Previous session insights may be LOST.
```
**Fix:** Before coding, read the Visual Operations Log (with its response snippets), synthesize into notes/TASK-XXX.md, then run `/task-memory:task-status` to re-verify Context Health Score.

### ❌ Repeating failed actions
```
npm install fails → npm install again → npm install again  ← WRONG
```
**Fix:** Log error, try alternative (yarn, pnpm, check network)

## Counter File Behavior

The hook uses `.claude/state/task-memory/` for operation counters (project-scoped, persists across reboots):
- `research-count` — WebFetch/WebSearch operations for 2-Action Rule
- `progress-count` — Write/Edit operations for subtask reminders
- `session-<id>.txt` — per-session task tracking (used by Stop hook)
- `stop-blocks-<id>.txt` — Stop-block retry counter (loop prevention)

**To reset counters manually:**
```bash
rm -rf .claude/state/task-memory/
```

## Hook Debugging

If hooks aren't working as expected:

1. **Check hook is loading:**
   ```bash
   cat .claude/hooks/hooks.json
   ```

2. **Test hook manually:**
   ```bash
   echo '{"hook_event_name":"SessionStart"}' | .claude/hooks/task-memory-hook.py
   ```

3. **Check planning directory detection:**
   ```bash
   ls -la planning/tasks.md
   ```

4. **Verify tasks.md format:**
   - Must have `<!-- Config: Last Task ID: XXX -->` comment (or `<!-- Config: Task Prefix: GR | Last Task ID: 677 -->` for team mode)
   - Must have section headers (`## To Do`, `## In Progress`, `## Done`)
   - Tasks must be h3 level (`### TASK-XXX` for legacy, or `### TASK-GR-XXX` for namespaced IDs)

## File Format Validation

Quick checks for valid tasks.md:

```bash
# Check for config comment
grep -c "Last Task ID" planning/tasks.md

# Check for h3 tasks
grep -c "^### TASK-" planning/tasks.md

# Check for h2 sections
grep -c "^## " planning/tasks.md
```

## Error Recovery

### Corrupted tasks.md
If the file won't parse:
1. Check for malformed markdown (unclosed code blocks, missing headers)
2. Validate h2/h3 hierarchy
3. Ensure config section exists

### Duplicate Task IDs
If two tasks have the same ID:
1. Find duplicates: `grep "^### TASK-" planning/tasks.md | sort | uniq -d`
2. Renumber the newer task
3. Update `Last Task ID` in config

### Missing Notes Directory
If notes aren't being created:
```bash
mkdir -p planning/notes
```
