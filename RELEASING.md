# Releasing task-memory

This document describes how to create a new release of task-memory.

## Version Numbers

We use [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.x.x) - Breaking changes
- **MINOR** (x.1.x) - New features, backward compatible
- **PATCH** (x.x.1) - Bug fixes, backward compatible

## Release Process

### 1. Update Version

Update version in `.claude-plugin/plugin.json`:

```json
{
  "version": "1.1.0"
}
```

Also update `marketplace.json` if present:

```json
{
  "metadata": {
    "version": "1.1.0"
  }
}
```

### 2. Update Changelog

Add changes to `CHANGELOG.md`:

```markdown
## [1.1.0] - 2026-01-15

### Added
- New feature X

### Fixed
- Bug Y

### Changed
- Improved Z
```

Update the links at the bottom:

```markdown
[Unreleased]: https://github.com/kepptic/task-memory/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/kepptic/task-memory/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/kepptic/task-memory/releases/tag/v1.0.0
```

### 3. Commit Changes

```bash
git add .
git commit -m "chore: bump version to 1.1.0"
```

### 4. Create Tag

```bash
git tag -a v1.1.0 -m "Release v1.1.0"
```

### 5. Push Tag

```bash
git push origin master
git push origin v1.1.0
```

### 6. Automated Release

GitHub Actions will automatically:
- Create a GitHub Release
- Extract changelog notes for the version
- Publish the release

## Manual Release (if needed)

If GitHub Actions fails, create release manually:

```bash
gh release create v1.1.0 \
  --title "v1.1.0" \
  --notes-file release_notes.md
```

## User Update Notification

Users are notified of updates via the SessionStart hook:

```
==================================================
📦 task-memory UPDATE AVAILABLE
==================================================

   Current: v1.0.0
   Latest:  v1.1.0
   Release: New features and bug fixes
   Date:    2026-01-15

   Update with:
   /plugin update task-memory

   https://github.com/kepptic/task-memory/releases
==================================================
```

The check runs once every 24 hours to avoid API rate limits.
