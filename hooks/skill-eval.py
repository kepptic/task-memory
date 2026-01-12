#!/usr/bin/env python3
"""
skill-eval.py - Skill evaluation engine for task-memory

Analyzes user prompts to detect if they're tasks (activate task-memory)
or questions (pass through). Outputs context to stdout for Claude to see.

Based on claude-code-showcase pattern by ChrisWiles.

https://github.com/kepptic/task-memory | MIT License
"""

import json
import sys
import re
import os
from pathlib import Path
from fnmatch import fnmatch

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR = Path(__file__).parent
RULES_FILE = SCRIPT_DIR / "skill-rules.json"
PROJECT_DIR = Path(os.getenv("CLAUDE_PROJECT_DIR", os.getcwd()))


def load_rules():
    """Load skill rules from JSON file"""
    if not RULES_FILE.exists():
        return None

    try:
        with open(RULES_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return None


# =============================================================================
# Pattern Matching
# =============================================================================

def matches_pattern(text, pattern):
    """Test if text matches a regex pattern"""
    try:
        return bool(re.search(pattern, text))
    except re.error:
        return False


def extract_file_paths(prompt):
    """Extract file paths mentioned in the prompt"""
    patterns = [
        r'[\w./\\-]+\.(?:ts|tsx|js|jsx|py|md|json|yaml|yml|css|scss|html)',
        r'(?:src|lib|components|features|tasks|hooks)/[\w./\\-]+',
        r'\.?/[\w./\\-]+\.\w+',
    ]

    paths = []
    for pattern in patterns:
        matches = re.findall(pattern, prompt)
        paths.extend(matches)

    return list(set(paths))


def matches_glob(file_path, glob_pattern):
    """Check if file path matches a glob pattern"""
    # Simple glob matching
    if '**' in glob_pattern:
        # Convert ** to regex
        regex = glob_pattern.replace('**/', '(?:.*/)?').replace('**', '.*')
        regex = regex.replace('*', '[^/]*').replace('?', '.')
        return bool(re.match(regex, file_path))
    else:
        return fnmatch(file_path, glob_pattern)


def match_directory_mapping(file_path, mappings):
    """Check if file path matches any directory mapping"""
    for directory, enabled in mappings.items():
        if enabled and file_path.startswith(directory):
            return True
    return False


# =============================================================================
# Skill Evaluation
# =============================================================================

def evaluate_skill(prompt, skill_config, weights, file_paths):
    """
    Evaluate a single skill against the prompt.
    Returns (score, reasons) tuple.
    """
    score = 0
    reasons = []
    prompt_lower = prompt.lower()

    # 1. Check exclusion patterns first (questions, etc.)
    for pattern in skill_config.get('excludePatterns', []):
        if matches_pattern(prompt, pattern):
            score += weights.get('exclusion', -5)
            reasons.append(f"excluded: matches '{pattern[:30]}...'")

    # 2. Keywords
    for keyword in skill_config.get('keywords', []):
        if keyword.lower() in prompt_lower:
            score += weights.get('keyword', 3)
            reasons.append(f"keyword: '{keyword}'")
            break  # Only count once per category

    # 3. Keyword patterns
    for pattern in skill_config.get('keywordPatterns', []):
        if matches_pattern(prompt, pattern):
            score += weights.get('keywordPattern', 3)
            reasons.append(f"pattern match")
            break

    # 4. Intent patterns
    for pattern in skill_config.get('intentPatterns', []):
        if matches_pattern(prompt, pattern):
            score += weights.get('intent', 4)
            reasons.append(f"intent: '{pattern[:25]}...'")
            break

    # 5. Path patterns
    for file_path in file_paths:
        for path_pattern in skill_config.get('pathPatterns', []):
            if matches_glob(file_path, path_pattern):
                score += weights.get('pathPattern', 4)
                reasons.append(f"path: '{file_path}'")
                break

    # 6. Directory mappings
    mappings = skill_config.get('directoryMappings', {})
    for file_path in file_paths:
        if match_directory_mapping(file_path, mappings):
            score += weights.get('directoryMapping', 5)
            reasons.append(f"directory: '{file_path.split('/')[0]}/'")
            break

    # 7. Context patterns
    for pattern in skill_config.get('contextPatterns', []):
        if matches_pattern(prompt, pattern):
            score += weights.get('context', 2)
            reasons.append(f"context match")
            break

    return score, reasons


def evaluate_all_skills(prompt, rules):
    """Evaluate all skills and return sorted matches"""
    weights = rules.get('triggerWeights', {})
    config = rules.get('config', {})
    skills = rules.get('skills', {})

    min_confidence = config.get('minConfidence', 3)
    file_paths = extract_file_paths(prompt)

    results = []

    for skill_name, skill_config in skills.items():
        score, reasons = evaluate_skill(prompt, skill_config, weights, file_paths)
        priority = skill_config.get('priority', 5)

        if score >= min_confidence:
            results.append({
                'name': skill_name,
                'description': skill_config.get('description', ''),
                'score': score,
                'priority': priority,
                'reasons': reasons,
                'confidence': get_confidence_level(score, min_confidence)
            })

    # Sort by score (desc), then priority (desc)
    results.sort(key=lambda x: (x['score'], x['priority']), reverse=True)

    max_skills = config.get('maxSkillsToShow', 3)
    return results[:max_skills]


def get_confidence_level(score, min_confidence):
    """Convert score to confidence level"""
    if score >= min_confidence + 6:
        return "HIGH"
    elif score >= min_confidence + 3:
        return "MEDIUM"
    else:
        return "LOW"


# =============================================================================
# Context Injection
# =============================================================================

def get_current_task():
    """Get current in-progress task from kanban.md"""
    kanban_path = PROJECT_DIR / "tasks" / "kanban.md"

    if not kanban_path.exists():
        return None

    try:
        with open(kanban_path, 'r') as f:
            content = f.read()

        if "**Status**: in-progress" not in content:
            return None

        lines = content.split('\n')
        for i, line in enumerate(lines):
            if "**Status**: in-progress" in line:
                for j in range(i - 1, -1, -1):
                    if lines[j].startswith('### TASK-'):
                        header = lines[j]
                        task_id = header.split('|')[0].strip().replace('### ', '')
                        task_title = header.split('|')[1].strip() if '|' in header else ""
                        return {'task_id': task_id, 'title': task_title}

        return None
    except Exception:
        return None


def format_output(matches, prompt_type):
    """Format output for Claude to see (stdout)"""
    lines = []

    if prompt_type == "TASK" and matches:
        # Get current task context
        current_task = get_current_task()

        lines.append("=" * 60)
        lines.append("📋 TASK DETECTED - task-memory activated")
        lines.append("=" * 60)

        if current_task:
            lines.append(f"\n🎯 Current task: {current_task['task_id']} | {current_task['title']}")
            lines.append("\n📝 Instructions:")
            lines.append("   - Track progress via subtasks in kanban.md")
            lines.append("   - Log research to Visual Operations Log (auto)")
            lines.append("   - Create findings file after 2 research operations")
            lines.append("   - Mark subtasks [x] when complete")
        else:
            lines.append("\n⚠️  No in-progress task found")
            lines.append("\n💡 Consider creating a task in tasks/kanban.md:")
            lines.append("   ### TASK-XXX | Your task title")
            lines.append("   **Status**: in-progress")

        # Show matched skills
        lines.append(f"\n📚 Matched skills:")
        for match in matches:
            reasons_str = ', '.join(match['reasons'][:3])
            lines.append(f"   • {match['name']} ({match['confidence']}) - {reasons_str}")

        lines.append("=" * 60)

    elif prompt_type == "QUESTION":
        # Questions pass through silently - no output
        pass

    return '\n'.join(lines)


# =============================================================================
# Main
# =============================================================================

def classify_prompt(prompt, matches):
    """Classify prompt as TASK or QUESTION"""
    # If we have high-confidence task matches, it's a task
    for match in matches:
        if match['name'] == 'task-memory' and match['confidence'] in ['HIGH', 'MEDIUM']:
            # But check for negative scores (exclusions hit)
            if match['score'] > 0:
                return "TASK"

    # Check for question indicators
    question_patterns = [
        r'(?i)^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does)\b',
        r'\?$',
        r'(?i)^(explain|describe|tell me|show me|help me understand)',
    ]

    for pattern in question_patterns:
        if re.search(pattern, prompt.strip()):
            return "QUESTION"

    # Default to task if we have any matches
    if matches:
        return "TASK"

    return "UNKNOWN"


def main():
    try:
        # Read input from stdin
        input_data = json.load(sys.stdin)
        hook_event = input_data.get("hook_event_name", "")
        prompt = input_data.get("prompt", "")

        # Only process UserPromptSubmit
        if hook_event != "UserPromptSubmit":
            sys.exit(0)

        # Skip empty prompts
        if not prompt or not prompt.strip():
            sys.exit(0)

        # Skip slash commands
        if prompt.strip().startswith('/'):
            sys.exit(0)

        # Load rules
        rules = load_rules()
        if not rules:
            sys.exit(0)

        # Evaluate skills
        matches = evaluate_all_skills(prompt, rules)

        # Classify prompt
        prompt_type = classify_prompt(prompt, matches)

        # Format and output (stdout goes to Claude's context)
        output = format_output(matches, prompt_type)
        if output:
            print(output)

        # Always exit 0 to allow prompt through
        sys.exit(0)

    except json.JSONDecodeError:
        sys.exit(0)
    except Exception as e:
        # Log errors to stderr (user sees in verbose mode)
        print(f"Skill eval error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
