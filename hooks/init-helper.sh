#!/bin/bash
# Task Memory Init Helper
# Analyzes project structure and outputs JSON with detected configuration

set -e

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

# Initialize result
result='{}'

# Detect project name
if [ -f "package.json" ]; then
    project_name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' package.json 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || echo "")
fi
if [ -z "$project_name" ]; then
    project_name=$(basename "$PROJECT_DIR")
fi

# Detect monorepo indicators
is_monorepo="false"
monorepo_type=""
packages=()

if [ -f "pnpm-workspace.yaml" ]; then
    is_monorepo="true"
    monorepo_type="pnpm"
elif [ -f "lerna.json" ]; then
    is_monorepo="true"
    monorepo_type="lerna"
elif [ -f "turbo.json" ]; then
    is_monorepo="true"
    monorepo_type="turbo"
elif [ -f "rush.json" ]; then
    is_monorepo="true"
    monorepo_type="rush"
elif [ -d "packages" ] || [ -d "apps" ]; then
    # Check for multiple package.json files
    pkg_count=$(find . -maxdepth 3 -name "package.json" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$pkg_count" -gt 2 ]; then
        is_monorepo="true"
        monorepo_type="workspace"
    fi
fi

# Find package directories
if [ "$is_monorepo" = "true" ]; then
    for dir in packages apps modules services; do
        if [ -d "$dir" ]; then
            for pkg in "$dir"/*/; do
                if [ -d "$pkg" ]; then
                    packages+=("${pkg%/}")
                fi
            done
        fi
    done
fi

# Find existing planning directories
existing_planning=()
while IFS= read -r line; do
    [ -n "$line" ] && existing_planning+=("$line")
done < <(find . -maxdepth 4 -type d -name "planning" 2>/dev/null | grep -v node_modules | grep -v '.git' | head -10)

# Find existing tasks.md files
existing_tasks=()
while IFS= read -r line; do
    [ -n "$line" ] && existing_tasks+=("$line")
done < <(find . -maxdepth 5 -name "tasks.md" 2>/dev/null | grep -v node_modules | grep -v '.git' | head -10)

# Check for existing CLAUDE.md
has_claude_md="false"
claude_md_has_task_memory="false"
if [ -f "CLAUDE.md" ]; then
    has_claude_md="true"
    if grep -qi "task.memory\|task-memory\|planning/tasks" CLAUDE.md 2>/dev/null; then
        claude_md_has_task_memory="true"
    fi
fi

# Check for existing .task-memory.json
has_config="false"
if [ -f ".task-memory.json" ]; then
    has_config="true"
fi

# Detect project type
project_type="unknown"
if [ -f "package.json" ]; then
    if grep -q '"react"' package.json 2>/dev/null; then
        project_type="react"
    elif grep -q '"vue"' package.json 2>/dev/null; then
        project_type="vue"
    elif grep -q '"next"' package.json 2>/dev/null; then
        project_type="nextjs"
    elif grep -q '"express"' package.json 2>/dev/null; then
        project_type="node-express"
    else
        project_type="node"
    fi
elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
    project_type="python"
elif [ -f "Cargo.toml" ]; then
    project_type="rust"
elif [ -f "go.mod" ]; then
    project_type="go"
fi

# Build JSON output
packages_json="[]"
if [ ${#packages[@]} -gt 0 ]; then
    packages_json=$(printf '%s\n' "${packages[@]}" | jq -R . | jq -s .)
fi

existing_planning_json="[]"
if [ ${#existing_planning[@]} -gt 0 ]; then
    existing_planning_json=$(printf '%s\n' "${existing_planning[@]}" | jq -R . | jq -s .)
fi

existing_tasks_json="[]"
if [ ${#existing_tasks[@]} -gt 0 ]; then
    existing_tasks_json=$(printf '%s\n' "${existing_tasks[@]}" | jq -R . | jq -s .)
fi

cat << EOF
{
  "project_name": "$project_name",
  "project_type": "$project_type",
  "is_monorepo": $is_monorepo,
  "monorepo_type": "$monorepo_type",
  "packages": $packages_json,
  "existing_planning": $existing_planning_json,
  "existing_tasks": $existing_tasks_json,
  "has_claude_md": $has_claude_md,
  "claude_md_has_task_memory": $claude_md_has_task_memory,
  "has_config": $has_config
}
EOF
