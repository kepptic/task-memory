#!/usr/bin/env bash
# Build a Cowork-installable .plugin archive.
#
# Usage: scripts/build-cowork-plugin.sh
#
# Produces: dist/task-memory-<version>.plugin (zip archive)
#
# The same artifact is valid as a Claude Code plugin — the two formats share
# .claude-plugin/plugin.json, skills/, commands/, and hooks/hooks.json. The
# only reason Claude Code users don't need this file is that they install via
# the kepptic marketplace (`/plugin install task-memory@kepptic`), which
# publishes the git repo directly. Cowork users sideload the .plugin file.

set -euo pipefail

# Resolve repo root (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Read version from plugin.json without jq dependency
VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' .claude-plugin/plugin.json \
  | head -1 \
  | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')

if [[ -z "${VERSION}" ]]; then
  echo "ERROR: could not read version from .claude-plugin/plugin.json" >&2
  exit 1
fi

PLUGIN_NAME="task-memory"
# Cowork expects the archive to be named after the plugin (e.g. `task-memory.plugin`),
# not the versioned form — validator otherwise rejects with "File is not a valid
# plugin archive. Rename or re-compress and try again."
ARTIFACT="${PLUGIN_NAME}.plugin"
VERSIONED_ARTIFACT="${PLUGIN_NAME}-${VERSION}.plugin"
OUT_DIR="dist"

# Stage outside of the repo tree — virtiofs/network mounts can choke on
# zip's atomic rename step. A scratch dir under mktemp is always local.
#
# Layout note: Cowork expects plugin contents at the ROOT of the zip
# (`.claude-plugin/plugin.json` at top level, NOT `task-memory/.claude-plugin/...`).
# We stage into a plain 'stage/' subdir and `zip ... .` from inside it, so the
# archive's top-level entries are the plugin contents, not a named parent.
# Claude Code accepts either layout; Cowork requires this one.
# See skills/create-cowork-plugin/SKILL.md in the cowork-plugin-management plugin.
SCRATCH="$(mktemp -d -t tm-plugin-build-XXXXXX)"
STAGE_DIR="${SCRATCH}/stage"
trap 'rm -rf "${SCRATCH}"' EXIT

echo "==> Building ${ARTIFACT}"
echo "    staging in ${SCRATCH}"

# Clean previous build
mkdir -p "${OUT_DIR}"
rm -f "${OUT_DIR}/${ARTIFACT}"
rm -f "${OUT_DIR}/${VERSIONED_ARTIFACT}"
rm -f "${OUT_DIR}/${PLUGIN_NAME}-${VERSION}.tar.gz"
mkdir -p "${STAGE_DIR}"

# What goes INTO the plugin archive. These are the runtime-relevant files
# that both Claude Code and Cowork consume at install time.
INCLUDE=(
  ".claude-plugin"
  "skills"
  "commands"
  "hooks"
  "README.md"
  "LICENSE"
)

# What gets stripped out of the staged copy (dev artifacts, caches, user data)
EXCLUDE_PATTERNS=(
  "__pycache__"
  "*.pyc"
  ".DS_Store"
  "*.swp"
  "*.bak"
  "node_modules"
)

# Copy each path into staging
for path in "${INCLUDE[@]}"; do
  if [[ ! -e "${path}" ]]; then
    echo "WARN: missing expected path '${path}', skipping" >&2
    continue
  fi
  cp -R "${path}" "${STAGE_DIR}/"
done

# Prune excluded patterns from the staged copy
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
  find "${STAGE_DIR}" -name "${pattern}" -exec rm -rf {} + 2>/dev/null || true
done

# marketplace.json is Claude Code's marketplace metadata — not part of the
# Cowork plugin contract. Strip it so the Cowork validator doesn't see
# unexpected fields.
rm -f "${STAGE_DIR}/.claude-plugin/marketplace.json"

# Make hook scripts executable in the staged copy
find "${STAGE_DIR}/hooks" -type f \( -name "*.py" -o -name "*.sh" \) \
  -exec chmod +x {} \; 2>/dev/null || true

# Sanity: confirm required files exist in the staging dir
REQUIRED=(
  ".claude-plugin/plugin.json"
  "hooks/hooks.json"
  "hooks/task-memory-hook.py"
  "skills/task-memory/SKILL.md"
  "skills/task-status/SKILL.md"
  "skills/tm-init/SKILL.md"
  "commands/tm-init.md"
  "commands/task-memory.md"
  "commands/task-status.md"
)
for req in "${REQUIRED[@]}"; do
  if [[ ! -e "${STAGE_DIR}/${req}" ]]; then
    echo "ERROR: required file missing from stage: ${req}" >&2
    exit 1
  fi
done

# Create the .plugin archive (zip format) inside SCRATCH, then copy the
# finished artifact into dist/. This avoids rename issues on network/fuse
# mounts (virtiofs, NFS, etc.) where zip's atomic write-and-rename can fail.
#
# We `cd "${STAGE_DIR}"` and zip `.` so the archive's top-level entries are
# `.claude-plugin/`, `skills/`, `hooks/`, etc. — NOT `task-memory/...`. Cowork
# rejects the wrapped layout with "File is not a valid plugin archive."
(
  cd "${STAGE_DIR}"
  zip -qr "${SCRATCH}/${ARTIFACT}" . -x "*.DS_Store"
  tar -czf "${SCRATCH}/${PLUGIN_NAME}-${VERSION}.tar.gz" .
)

# Copy finished artifacts back into the repo's dist/. We publish BOTH names:
#   - task-memory.plugin           (canonical — what Cowork validates)
#   - task-memory-<version>.plugin (versioned copy for GitHub Releases assets)
cp "${SCRATCH}/${ARTIFACT}" "${OUT_DIR}/${ARTIFACT}"
cp "${SCRATCH}/${ARTIFACT}" "${OUT_DIR}/${VERSIONED_ARTIFACT}"
cp "${SCRATCH}/${PLUGIN_NAME}-${VERSION}.tar.gz" "${OUT_DIR}/${PLUGIN_NAME}-${VERSION}.tar.gz"

echo "    ✓ ${OUT_DIR}/${ARTIFACT}           (for sideload)"
echo "    ✓ ${OUT_DIR}/${VERSIONED_ARTIFACT} (for release archive)"
echo "    ✓ ${OUT_DIR}/${PLUGIN_NAME}-${VERSION}.tar.gz"
echo ""
echo "Install in Cowork:"
echo "  1. Open Cowork"
echo "  2. Drag ${OUT_DIR}/${ARTIFACT} into the chat, OR"
echo "  3. Use the 'Install plugin' menu → select the .plugin file"
echo ""
echo "Note: Cowork validates by filename — use '${ARTIFACT}', not the versioned form."
echo ""
echo "Install in Claude Code:"
echo "  /plugin install task-memory@kepptic"
