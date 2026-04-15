# Contributing to task-memory

Thank you for considering contributing to **task-memory**! This project is built by and for developers, and we're excited to have your help making it better.

## Welcome!

task-memory is a privacy-first Kanban task manager with Manus-style memory. Whether you're fixing bugs, adding features, improving documentation, or suggesting ideas, **your contribution matters**.

This document guides you through the process of contributing in a way that's smooth and enjoyable for everyone.

---

## Contribution Paths

Task Memory has two main areas for contribution:

| Path | Focus | Skills |
|------|-------|--------|
| **React App** | Kanban UI in `task-memory.html` | React, JavaScript, Tailwind |
| **Claude Code Plugin** | Hooks, skills, and rules | Bash, Claude Code |

You can contribute to either or both!

### Repository Structure

```
task-memory/
├── hooks/                    # Plugin source (EDIT HERE)
├── skills/                   # Plugin source (EDIT HERE)
├── rules/                    # Plugin source (EDIT HERE)
│
├── .claude/                  # Local testing (symlinks to above)
│   ├── settings.json         # Project-specific config
│   ├── hooks/  → ../hooks/   # Symlink
│   ├── skills/ → ../skills/  # Symlink
│   └── rules/  → ../rules/   # Symlink
│
├── .claude-plugin/           # Plugin manifest for distribution
├── src/                      # React app source
└── planning/                 # Test data
```

**Key insight:** Edit files in root `hooks/`, `skills/`, `rules/`. The `.claude/` folder contains symlinks, so changes are immediately available for testing.

---

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read and follow our [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

**TL;DR**: Be respectful, inclusive, and constructive. Report concerns to the maintainers.

---

## How to Contribute

### 1. Report a Bug

Found an issue? Help us fix it!

**Before reporting:**
- Check the [existing issues](https://github.com/kepptic/task-memory/issues) to avoid duplicates
- Test with the latest version (`task-memory.html`)
- Gather browser console output (F12 → Console tab)

**When reporting:**
- Use the [Bug Report template](https://github.com/kepptic/task-memory/issues/new?template=bug_report.md)
- **What happened**: Describe the unexpected behavior
- **Expected behavior**: What should happen instead
- **Steps to reproduce**: Clear, numbered steps
- **Browser & OS**: Chrome/Edge/Opera, macOS/Windows/Linux
- **Attachments**: Screenshot, console error, or problematic markdown file
- **Version**: Which `task-memory.html` version

**Example:**
```
Title: Tasks not updating when markdown file changes

Steps to reproduce:
1. Open task-memory.html
2. Select a tasks.md file from disk
3. Edit tasks.md in another editor (add a new task)
4. Return to the browser without refreshing

Expected: New task appears in the board
Actual: New task doesn't appear until F5 refresh

Environment: Chrome 131 on macOS 15.2
```

### 2. Suggest a Feature

Have an idea to make Task Memory better?

**Before suggesting:**
- Check [existing discussions](https://github.com/kepptic/task-memory/discussions)
- Consider the project's scope (file-based, offline-first, single-HTML)

**When suggesting:**
- Use the [Feature Request template](https://github.com/kepptic/task-memory/issues/new?template=feature_request.md)
- **Problem**: What's the use case? Who benefits?
- **Solution**: How would you like it to work?
- **Alternatives**: Have you considered other approaches?
- **Impact**: Does it fit the project's philosophy?

**Example:**
```
Title: Add support for custom tag colors

Problem: All tags use the same color, making visual categorization hard

Solution: Let users customize tag colors via a settings panel

Use case: Developers with 10+ different tag types want visual distinction
```

### 3. Submit a Pull Request

Ready to code? Great!

**Process:**
1. **Fork** the repository
2. **Create a feature branch** (`git checkout -b feature/your-feature-name`)
3. **Make changes** following the code style guide (below)
4. **Test thoroughly** in Chrome, Edge, and Opera
5. **Commit** with clear, atomic commits (see Git Workflow)
6. **Push** to your fork
7. **Open a PR** with a clear description

**PR Guidelines:**
- Reference related issues: `Fixes #123` or `Related to #456`
- Explain **why** the change is needed, not just **what** changed
- Include before/after screenshots for UI changes
- Mention testing steps
- Be ready for constructive feedback

**Example PR description:**
```markdown
## Summary
Adds task filtering by status without reloading the file

## Problem
Users want to filter tasks by status (todo, in-progress, done)
without repeatedly reloading the entire file.

## Solution
- Add status filter buttons to the toolbar
- Filter state persists during current session
- Reset when loading a new file

## Testing
1. Open task-memory.html with a multi-status tasks.md
2. Click filter buttons (To Do, In Progress, Done)
3. Verify only matching tasks appear
4. Load a different file and verify filters reset

Fixes #89
```

---

## Development Setup

### Prerequisites

- **Node.js** >= 18
- **pnpm** (recommended) or npm
- **Git**
- Modern browser with File System Access API support (Chrome, Edge, Opera 91+)

### Getting Started

```bash
# 1. Fork and clone
git clone https://github.com/YOUR-USERNAME/task-memory.git
cd task-memory

# 2. Install dependencies
pnpm install

# 3. Start development server
pnpm dev

# 4. Open your browser
# Visit http://localhost:5173
```

### Available Commands

```bash
# Development server (with hot reload)
pnpm dev

# Build single HTML file (optimized for production)
pnpm build

# Preview production build locally
pnpm preview

# Lint code for style violations
pnpm lint
```

### Understanding the Build

The project uses **Vite** with a special plugin (`vite-plugin-singlefile`) to bundle everything into a single `task-memory.html` file.

**Why single file?**
- Easy distribution (copy one file)
- No separate assets to manage
- Works offline immediately
- Perfect for CI/CD integration

**Build output:**
```
pnpm build
├── dist/index.html       (intermediate)
└── task-memory.html     (final, copied to root)
```

---

## Plugin Development (Claude Code)

### Development Workflow

This project uses **symlinks** for efficient plugin development:

```
hooks/                 ← EDIT HERE (source of truth)
skills/                ← EDIT HERE
rules/                 ← EDIT HERE

.claude/
├── settings.json      ← Project config (uses $CLAUDE_PROJECT_DIR)
├── hooks/ → ../hooks/ ← Symlink (auto-updates)
├── skills/ → ../skills/
└── rules/ → ../rules/
```

**Workflow:**
1. Edit files in root `hooks/`, `skills/`, or `rules/`
2. Changes are immediately available via symlinks
3. Test by running Claude Code in this project
4. No sync step needed

### Two Configuration Files

| File | Purpose | Path Variable |
|------|---------|---------------|
| `.claude/settings.json` | Local testing (this project) | `$CLAUDE_PROJECT_DIR` |
| `hooks/hooks.json` | Plugin distribution (when installed) | `${CLAUDE_PLUGIN_ROOT}` |

When users install the plugin, `hooks/hooks.json` is used. When developing locally, `.claude/settings.json` is used.

### Hook Scripts

Hook scripts are located in `hooks/` and executed by Claude Code at various lifecycle events.

**Key files:**
- `task-memory-hook.py` - Main hook handler (SessionStart, PreToolUse, PostToolUse, Stop)
- `skill-eval.sh` - User prompt classifier (TASK vs QUESTION detection)

**Testing hooks directly:**

```bash
# Test SessionStart
echo '{"hook_event_name":"SessionStart","session_id":"test-123"}' | ./hooks/task-memory-hook.py

# Test PreToolUse with WebFetch
echo '{"hook_event_name":"PreToolUse","tool_name":"WebFetch","tool_input":{"url":"https://example.com"}}' | ./hooks/task-memory-hook.py

# Test Stop hook
echo '{"hook_event_name":"Stop","session_id":"test-123"}' | ./hooks/task-memory-hook.py
```

**Hook development guidelines:**

1. **Read JSON from stdin** - All hooks receive JSON input
2. **Output to stdout** - Messages appear in Claude's context
3. **Exit codes** - 0 = success, non-zero = error
4. **Blocking (Stop hook)** - Return `{"decision": "block", "reason": "..."}` to prevent session end

### Skills

Skills are located in `skills/` and provide slash command documentation.

**Structure:**
```
skills/
├── task-memory/
│   ├── SKILL.md           # Main skill documentation
│   ├── MONOREPO.md        # Monorepo patterns
│   ├── TROUBLESHOOTING.md # Common issues
│   └── UI_FORMAT.md       # Task format reference
└── task-status/
    └── SKILL.md           # Quick context check
```

**Writing a skill:**

```markdown
---
name: my-skill
description: Brief description (max 1024 chars)
user-invocable: true
allowed-tools:
  - Read
  - Write
---

# Skill Name

## When to Use

- Use case 1
- Use case 2

## Workflow

Step-by-step instructions for Claude to follow.
```

### Rules

Rules are located in `rules/` and enforce workflow patterns.

**Current rules:**
- `task-memory.md` - Task creation and completion rules
- `ui-design-system.md` - Design guidelines for the Kanban UI

### Testing Plugin Changes

**Method 1: Test in this project (recommended)**

Since `.claude/` symlinks to root folders, just run Claude Code:

```bash
cd /path/to/task-memory
claude
```

**Method 2: Test in a fresh project**

```bash
# Create test project
mkdir /tmp/test-project
cp -r hooks/ skills/ rules/ planning/ /tmp/test-project/

# Create settings.json for standalone use
cat > /tmp/test-project/.claude/settings.json << 'EOF'
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "$CLAUDE_PROJECT_DIR/hooks/task-memory-hook.py"}]}]
  }
}
EOF

cd /tmp/test-project
claude
```

**Method 3: Test individual hooks**

```bash
# Check session tracking files
ls /tmp/task-memory-session-*.txt

# Test specific hook events
echo '{"hook_event_name":"SessionStart"}' | ./hooks/task-memory-hook.py
```

---

## Code Style

### React & TypeScript Patterns

**Use functional components** with hooks:

```jsx
// Good
function TaskCard({ task, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="task-card">
      {task.title}
    </div>
  );
}

// Avoid
class TaskCard extends React.Component {
  // Legacy class syntax
}
```

**Component structure:**

```jsx
// components/TaskCard.jsx
import { useState } from 'react';
import { updateTask } from '../utils/api';
import Button from './Button';

export default function TaskCard({ task, onUpdate }) {
  // 1. Hooks
  const [isLoading, setIsLoading] = useState(false);

  // 2. Event handlers
  const handleUpdate = async (changes) => {
    setIsLoading(true);
    try {
      await updateTask(task.id, changes);
      onUpdate();
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Render
  return (
    <div className="task-card">
      <h3>{task.title}</h3>
      <Button onClick={handleUpdate}>Update</Button>
    </div>
  );
}
```

### Naming Conventions

```javascript
// Files: PascalCase for components, camelCase for utilities
src/components/TaskCard.jsx
src/utils/markdownParser.js
src/stores/taskStore.js

// Functions/variables: camelCase
function parseMarkdown() { }
const taskList = [];

// Constants: UPPER_SNAKE_CASE
const MAX_TASK_TITLE_LENGTH = 255;
const DEFAULT_PRIORITY = 'medium';

// CSS classes: kebab-case
<div className="task-card__header">
  <span className="task-card__title--active">
```

### Tailwind CSS Classes

The project uses **Tailwind CSS** for styling:

```jsx
// Good: Use Tailwind utilities
<div className="flex items-center justify-between gap-4 p-4 bg-gray-100 rounded">

// Avoid: Inline styles
<div style={{ display: 'flex', gap: '16px' }}>

// Avoid: Custom CSS unless necessary
<div className="my-custom-style"> {/* Use Tailwind instead */}
```

### Formatting

**Prettier** handles automatic formatting. No manual formatting needed!

```bash
# Format all files (run before committing)
npx prettier --write src/

# Or let your editor do it automatically (recommended)
# VS Code: Install "Prettier - Code formatter" extension
# Enable "Format on Save" in settings
```

### Linting

**ESLint** checks code quality:

```bash
# Check for style issues
pnpm lint

# The build will fail if there are lint errors
```

**Common issues:**
```javascript
// Avoid: Unused variables
const unused = getValue(); // ❌ ESLint error

// Avoid: Missing dependencies in hooks
useEffect(() => {
  console.log(userId); // ESLint warns if userId not in dependency array
}, []);

// Correct: Include all dependencies
useEffect(() => {
  console.log(userId);
}, [userId]);
```

---

## Git Workflow

### Branch Naming

Use descriptive branch names that start with a category:

```bash
# Features
git checkout -b feature/add-task-filtering

# Bug fixes
git checkout -b fix/tasks-disappear-on-refresh

# Documentation
git checkout -b docs/improve-setup-guide

# Chores (refactoring, dependencies)
git checkout -b chore/upgrade-react-19
```

### Commit Messages

Follow **Conventional Commits** format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Scope:** Component or module affected (optional but helpful)

**Subject:**
- Imperative mood ("add" not "added")
- Lowercase first letter
- No period at end
- Under 50 characters

**Example:**
```bash
git commit -m "feat(taskCard): add right-click context menu

Add context menu with edit/delete/duplicate options.
Closes #42"

git commit -m "fix(parser): handle nested markdown lists correctly"

git commit -m "docs: update setup instructions for Windows"

git commit -m "refactor: extract TaskFilter to separate component"
```

### Keep Commits Atomic

One logical change per commit:

```bash
# Good: Separate concerns
git commit -m "feat(filter): add status filter buttons"
git commit -m "feat(filter): add keyboard shortcuts"

# Avoid: Multiple unrelated changes
git commit -m "feat: add filter, fix styling, update docs"
```

### Rebase Before Submitting

Keep your branch up to date:

```bash
# Fetch latest changes
git fetch origin

# Rebase your changes on top
git rebase origin/main

# If there are conflicts, resolve them and continue
git rebase --continue

# Force push (safe since it's your branch)
git push origin your-branch -f
```

---

## Pull Request Checklist

Before submitting a PR, verify:

- [ ] **Code Quality**
  - [ ] Runs `pnpm lint` with no errors
  - [ ] Code follows style guide (PascalCase components, camelCase functions)
  - [ ] No console errors or warnings (F12 → Console)
  - [ ] Meaningful variable/function names

- [ ] **Testing**
  - [ ] Tested in Chrome (primary)
  - [ ] Tested in Edge (secondary)
  - [ ] Tested in Opera (secondary)
  - [ ] Loaded a real markdown file and verified behavior
  - [ ] Tested edge cases (empty tasks, special characters, etc.)

- [ ] **Functionality**
  - [ ] Feature works as described
  - [ ] Doesn't break existing features
  - [ ] No memory leaks or performance issues
  - [ ] File operations save correctly

- [ ] **Documentation**
  - [ ] Updated README.md if adding user-facing features
  - [ ] Added comments for complex logic
  - [ ] Updated CHANGELOG.md with your changes

- [ ] **Git**
  - [ ] Commits follow conventional commits format
  - [ ] Commits are atomic and logical
  - [ ] Branch is rebased on main
  - [ ] PR title is clear and descriptive

---

## Testing

### Manual Testing (Required)

Since this is a single-file HTML app, manual testing is essential:

1. **Load the app:**
   ```bash
   # Development
   pnpm dev
   # Then open http://localhost:5173

   # Or test the built file
   open task-memory.html
   ```

2. **Test with sample markdown:**
   - Use `examples/` folder or create a test tasks.md
   - Test with real project kanbans from `/docs/todo/`

3. **Browser developer tools (F12):**
   - **Console tab**: Check for errors/warnings
   - **Network tab**: Verify file operations complete
   - **Application tab**: Check localStorage if applicable

4. **Test checklist:**
   ```
   - [ ] Load markdown file
   - [ ] Display tasks correctly
   - [ ] Edit a task
   - [ ] Move task between sections
   - [ ] Save changes to file
   - [ ] Load different file
   - [ ] Handle special characters
   - [ ] Test on mobile (responsive design)
   ```

### Browser Compatibility

Test in all supported browsers:

| Browser | Version | Required |
|---------|---------|----------|
| Chrome | 91+ | Yes |
| Edge | 91+ | Yes |
| Opera | 77+ | Yes |
| Safari | Not supported | — |
| Firefox | Not supported | — |

**Why?** These are the only browsers that support File System Access API (required for local file editing).

---

## Questions & Help

### Getting Help

- **Questions about the code**: Open a [Discussion](https://github.com/kepptic/task-memory/discussions)
- **Bug reports**: Open an [Issue](https://github.com/kepptic/task-memory/issues)
- **Feature ideas**: Start a [Discussion](https://github.com/kepptic/task-memory/discussions) first
- **Need PR feedback**: Comment on your PR, and maintainers will help

### Community

- Check [existing discussions](https://github.com/kepptic/task-memory/discussions) for similar questions
- Read the [README.md](./README.md) for feature documentation
- Review [CHANGELOG.md](./CHANGELOG.md) for recent changes
- Look at [examples/](./examples/) for sample markdown files

### For Maintainers Responding to Issues

- Respond within 48 hours if possible
- Provide clear next steps
- Link to relevant documentation
- Thank contributors for their effort

---

## Project Structure

```
task-memory/
├── hooks/                   # Plugin source files (EDIT HERE)
│   ├── hooks.json           # Plugin hook config (uses ${CLAUDE_PLUGIN_ROOT})
│   ├── task-memory-hook.py  # Main lifecycle hook
│   ├── skill-eval.sh        # Prompt classifier
│   └── README.md            # Hook documentation
│
├── skills/                  # Plugin skills (EDIT HERE)
│   ├── task-memory/         # /task-memory skill
│   │   ├── SKILL.md
│   │   ├── MONOREPO.md
│   │   ├── TROUBLESHOOTING.md
│   │   └── UI_FORMAT.md
│   └── task-status/         # /task-status skill
│       └── SKILL.md
│
├── rules/                   # Plugin rules (EDIT HERE)
│   ├── task-memory.md       # Task workflow rules
│   └── ui-design-system.md  # UI design guidelines
│
├── .claude/                 # Local testing (symlinks to above)
│   ├── settings.json        # Project hook config (uses $CLAUDE_PROJECT_DIR)
│   ├── hooks/ → ../hooks/   # Symlink
│   ├── skills/ → ../skills/ # Symlink
│   └── rules/ → ../rules/   # Symlink
│
├── .claude-plugin/          # Plugin distribution metadata
│   ├── plugin.json          # Plugin manifest
│   └── marketplace.json     # Marketplace listing
│
├── src/                     # React Kanban UI
│   ├── components/          # React UI components
│   ├── utils/               # Markdown parser, file system
│   ├── App.jsx              # Root component
│   └── main.jsx             # Entry point
│
├── planning/                # Test data / example
│   ├── tasks.md             # Active tasks
│   ├── archive.md           # Completed tasks
│   └── notes/               # Task documentation
│
├── examples/                # Sample markdown files
├── docs/                    # Documentation
├── tests/                   # Test files
│
├── task-memory.html         # Built single-file app (GENERATED)
├── CLAUDE.md                # Project instructions
├── README.md                # User documentation
├── CONTRIBUTING.md          # This file
└── LICENSE                  # MIT License
```

---

## Key Files for Contributors

### React App

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main application component |
| `src/utils/markdown.js` | Markdown parser/serializer |
| `src/utils/fileSystem.js` | File System Access API wrapper |
| `vite.config.js` | Build configuration |
| `package.json` | Dependencies and scripts |

### Claude Code Plugin (Edit in root folders)

| File | Purpose |
|------|---------|
| `hooks/hooks.json` | Plugin hook config (for distribution) |
| `hooks/task-memory-hook.py` | Main lifecycle hook |
| `hooks/skill-eval.sh` | TASK vs QUESTION classifier |
| `skills/task-memory/SKILL.md` | Full workflow documentation |
| `skills/task-status/SKILL.md` | Quick context check |
| `rules/task-memory.md` | Task workflow rules |

### Local Testing Config

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Project hook config (for local testing) |
| `.claude/hooks/` | Symlink to `../hooks/` |
| `.claude/skills/` | Symlink to `../skills/` |
| `.claude/rules/` | Symlink to `../rules/` |

---

## Common Development Tasks

### Adding a New Feature

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Create/modify components:**
   ```bash
   src/components/YourComponent.jsx
   ```

3. **Test in development:**
   ```bash
   pnpm dev
   # Test at http://localhost:5173
   ```

4. **Commit changes:**
   ```bash
   git add src/
   git commit -m "feat(yourFeature): add description"
   ```

5. **Submit PR** with clear description

### Fixing a Bug

1. **Create a feature branch:**
   ```bash
   git checkout -b fix/bug-description
   ```

2. **Find and understand the bug** (check console, file operations, etc.)

3. **Write a minimal test case** demonstrating the bug

4. **Fix the issue**

5. **Verify the fix:**
   ```bash
   pnpm dev
   # Test the fix works
   # Verify no new issues appear
   ```

6. **Commit and submit PR:**
   ```bash
   git commit -m "fix(component): brief description of fix"
   ```

### Updating Dependencies

```bash
# Update to latest versions
pnpm update

# Rebuild and test
pnpm build
pnpm dev

# Commit changes
git commit -m "chore: update dependencies"
```

---

## Performance & Optimization

When contributing, consider:

- **Bundle size**: Single file should stay under 500KB
- **Load time**: App should load instantly (no API calls)
- **File parsing**: Markdown parsing should handle 1000+ tasks
- **Memory**: No memory leaks when switching between files

Tips:
- Use React.memo for components that render frequently
- Lazy load heavy components if needed
- Profile with DevTools Performance tab (F12)

---

## Documentation

Update documentation when:

- **Adding features** → Update README.md with examples
- **Changing workflows** → Update relevant docs in /docs/
- **Breaking changes** → Update CHANGELOG.md under new version
- **Adding complex logic** → Add code comments

---

## Recognition

Contributors are recognized in:
- [GitHub Contributors](https://github.com/kepptic/task-memory/graphs/contributors)
- Release notes for significant contributions

Thank you for contributing to Task Memory!

---

## Final Checklist

Before every PR submission:

1. ✅ Code follows style guide
2. ✅ Linting passes (`pnpm lint`)
3. ✅ No console errors (F12 → Console)
4. ✅ Tested in Chrome, Edge, Opera
5. ✅ Commits follow conventional format
6. ✅ Branch rebased on main
7. ✅ PR description is clear
8. ✅ Related issues are referenced
9. ✅ Documentation updated if needed
10. ✅ No breaking changes without discussion

**Ready? Open that PR!** 🚀

---

**Questions?** Start a [Discussion](https://github.com/kepptic/task-memory/discussions)

**Found a bug?** Open an [Issue](https://github.com/kepptic/task-memory/issues)

**Love the project?** Give us a ⭐ on GitHub!
