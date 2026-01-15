# Notes: TASK-009 | Auto-Claude Audit & Task-Memory Improvement Analysis

## Summary

Full audit of the Auto-Claude repository (https://github.com/AndyMik90/Auto-Claude) to extract patterns, methodologies, and features that can improve our task-memory and task-status skills.

---

## Auto-Claude Architecture Overview

### What is Auto-Claude?
An autonomous multi-agent coding framework that leverages Claude AI to plan, develop, and validate software projects. Key features:
- **Parallel Development**: Up to 12 concurrent agent terminals
- **Isolated Environments**: Git worktrees for branch protection
- **Self-Validating QA**: Built-in testing loops
- **Smart Merging**: AI-assisted conflict resolution

### Repository Structure
```
Auto-Claude/
├── apps/
│   ├── backend/      # Python agents, specifications, QA pipeline
│   │   └── prompts/  # Agent prompts (KEY AREA)
│   └── frontend/     # Electron desktop application
├── guides/           # Documentation
├── tests/            # Test suite
└── shared_docs/      # Shared documentation
```

---

## Agent Prompt Analysis

### 1. Planner Agent (planner.md)

**Core Principle:** "Subtasks, not tests. Implementation order matters."

**Phase System:**
| Phase | Purpose |
|-------|---------|
| Phase 0 | Mandatory codebase investigation (read 3+ pattern files) |
| Phase 1 | Create/read context files (spec.md, project_index.json, context.json) |
| Phase 2 | Workflow classification (FEATURE/REFACTOR/INVESTIGATION/MIGRATION/SIMPLE) |
| Phase 3 | Generate implementation_plan.json |
| Phase 3.5 | Verification strategy (risk-based testing) |
| Phase 4 | Parallelism analysis |
| Phase 5-7 | Supporting files (init.sh, build-progress.txt) |

**Key Insight for Task-Memory:**
- Mandatory codebase exploration BEFORE planning
- Workflow type classification determines the pipeline
- Explicit dependency management between phases

### 2. Coder Agent (coder.md)

**Session Architecture:** Fresh context windows with NO memory. All knowledge from `.auto-claude/specs/`.

**Critical Patterns:**
- Path verification before git ops (avoid "path doubling")
- One subtask per session
- Mandatory self-critique before completion
- Session memory documentation

**Workflow Stages:**
1. Bearings - Read specs, plan, session memory
2. Context - Study files, patterns, external docs
3. Pre-Implementation Checklist - Predictive bug prevention
4. Implementation - Execute subtask
5. Self-Critique - Code quality review
6. Verification - Run tests
7. Commit - Stage and commit
8. Session Memory - Document discoveries

**Key Insight for Task-Memory:**
- Session memory persists learnings across context resets
- Self-critique phase catches issues before marking done
- Pre-implementation checklists prevent known bugs

### 3. Insight Extractor (insight_extractor.md)

**Purpose:** Extract actionable knowledge from completed sessions.

**Output Structure:**
```json
{
  "file_insights": [...],      // What changed in each file
  "patterns_discovered": [...], // Reusable techniques
  "gotchas_discovered": [...],  // Specific pitfalls
  "approach_outcome": {...},    // Success/failure learnings
  "recommendations": [...]      // Implementable advice
}
```

**Quality Standard:** Avoid vague observations. Be specific:
- BAD: "A store file"
- GOOD: "Terminal header onClick steals focus from child interactive elements—call e.stopPropagation() in child handlers."

**Key Insight for Task-Memory:**
- Structured learning extraction after each task
- Gotchas prevent repeating mistakes
- Patterns enable knowledge transfer

### 4. QA Reviewer (qa_reviewer.md)

**Ten-Phase Validation Framework:**

| Phase | Purpose |
|-------|---------|
| 0 | Load context, extract acceptance criteria |
| 1 | Verify all subtasks complete |
| 2 | Start development environment |
| 3 | Run automated tests |
| 4 | Browser verification (frontend) |
| 5 | Database verification |
| 6 | Code review (API validation, security, patterns) |
| 7 | Regression check |
| 8 | Generate QA report |
| 9 | Update implementation plan |
| 10 | Signal completion |

**Issue Severity:**
- **Critical**: Block sign-off (security, regressions)
- **Major**: Should fix (spec deviations)
- **Minor**: Nice-to-fix (style issues)

**Key Insight for Task-Memory:**
- Multi-phase validation catches more issues
- Third-party API validation via Context7
- QA-Fix loop with 5 iteration maximum

### 5. Complexity Assessor (complexity_assessor.md)

**Three Complexity Tiers:**

| Tier | Files | Services | Characteristics |
|------|-------|----------|-----------------|
| Simple | 1-2 | 1 | No integrations, no infrastructure |
| Standard | 3-10 | 1-2 | Minimal infra, some research |
| Complex | 10+ | 2+ | Multiple integrations, new patterns |

**Assessment Dimensions:**
- Scope (file/service count)
- Integrations (external services)
- Infrastructure (Docker, DB changes)
- Knowledge (unfamiliar tech)
- Risk (security, breaking changes)

**Principle:** When uncertain, assign higher complexity.

**Key Insight for Task-Memory:**
- Task classification determines workflow intensity
- Risk-based validation recommendations
- Conservative estimation prevents under-planning

### 6. Spec Writer (spec_writer.md)

**Input Files:**
- project_index.json (structure)
- requirements.json (user needs)
- context.json (relevant files)

**Output:** Comprehensive spec.md with:
- Overview and workflow type
- Task scope with services
- Files to modify with changes
- Reference files for patterns
- Requirements and edge cases
- Implementation guidance
- Success criteria
- Testing specifications

**Key Insight for Task-Memory:**
- Synthesize multiple inputs into actionable spec
- Include "don'ts" not just "do's"
- Sufficient detail for QA validation

### 7. Spec Researcher (spec_researcher.md)

**Three-Step Research Approach:**
1. Context7 MCP for official docs
2. Web search for verification
3. Key questions to answer

**Key Questions:**
- Correct package names?
- Actual API patterns?
- Configuration requirements?
- Known gotchas?

**Output:** research.json with verified findings.

**Key Insight for Task-Memory:**
- Always verify assumptions about external dependencies
- Flag unverified claims
- Document information sources

### 8. Follow-up Planner (followup_planner.md)

**Core Rule:** "NEVER delete existing phases—Only append."

**Sequential Planning:**
- Continue phase numbers from where plan left off
- Dependencies link to prerequisite phases
- Preserve all completed work

**Key Insight for Task-Memory:**
- Append-only planning preserves history
- Explicit dependency chains
- Traceability for iterative development

### 9. Spec Gatherer (spec_gatherer.md)

**Collection Phases:**
1. Read project structure
2. Confirm task understanding
3. Classify work type
4. Identify services
5. Gather detailed requirements
6. Create requirements.json

**Principle:** "Ask smart questions, produce valid JSON. Nothing else."

**Key Insight for Task-Memory:**
- Structured requirements gathering before planning
- Work type classification upfront
- Confirmation loops prevent misunderstanding

---

## Comparison: Auto-Claude vs Task-Memory

| Feature | Auto-Claude | Task-Memory | Gap |
|---------|-------------|-------------|-----|
| Task Classification | 5 workflow types | Category field only | Missing workflow types |
| Session Memory | insight_extractor.md | Notes in tasks.md | No structured learnings |
| Pre-Implementation | Mandatory checklist | None | Missing bug prevention |
| Self-Critique | Required phase | None | Missing quality gate |
| Complexity Assessment | 3-tier system | Priority only | No complexity analysis |
| QA Validation | 10-phase framework | Manual checks | No automated validation |
| Pattern Discovery | Explicit phase | Ad-hoc | No pattern extraction |
| Gotcha Tracking | Structured format | Errors Log | Less structured |
| Dependency Management | depends_on field | None | Missing phase dependencies |
| Parallel Analysis | Built-in | None | No parallelism awareness |
| Research Phase | spec_researcher | None | No research methodology |
| Requirements Gathering | spec_gatherer | User-provided | Less structured intake |

---

## Improvement Opportunities for Task-Memory

### Priority 1: Workflow Type Classification

**Current:** Only Category field (Feature, Bug, Docs, Research)

**Proposed Addition:**
```markdown
**Workflow**: FEATURE | REFACTOR | INVESTIGATION | MIGRATION | SIMPLE
```

Each workflow type has different requirements:
- FEATURE: Multi-step, dependency-aware
- REFACTOR: Add → Migrate → Remove stages
- INVESTIGATION: Reproduce → Investigate → Fix
- MIGRATION: Data pipeline operations
- SIMPLE: Single-service quick tasks

### Priority 2: Session Memory / Insight Extraction

**Current:** Notes section is free-form

**Proposed Addition:** Structured insights after task completion:
```markdown
**Insights**:
| Type | Discovery |
|------|-----------|
| Pattern | [reusable technique] |
| Gotcha | [pitfall and prevention] |
| File | [what changed and why] |
```

### Priority 3: Pre-Implementation Checklist

**Current:** Jump straight to work

**Proposed Addition:**
```markdown
**Pre-Work Checklist**:
- [ ] Read relevant files (list them)
- [ ] Identify existing patterns
- [ ] Check for similar implementations
- [ ] Review known gotchas for this area
```

### Priority 4: Self-Critique Phase

**Current:** None

**Proposed Addition to workflow:**
```
Before marking done:
- [ ] Code quality verified
- [ ] Pattern compliance checked
- [ ] Error handling complete
- [ ] No hardcoded values
```

### Priority 5: Complexity Assessment

**Current:** Priority (Critical/High/Medium/Low)

**Proposed Addition:**
```markdown
**Complexity**: Simple (1-2 files) | Standard (3-10 files) | Complex (10+ files)
```

With automatic workflow recommendations based on complexity.

### Priority 6: Phase Dependencies

**Current:** Subtasks are independent

**Proposed Addition:**
```markdown
**Subtasks**:
- [ ] Phase 1: Initial setup
- [ ] Phase 2: Core implementation (depends: Phase 1)
- [ ] Phase 3: Testing (depends: Phase 2)
```

### Priority 7: Research Integration

**Current:** 2-Action Rule for web research

**Proposed Addition:** More structured research tracking:
```markdown
**Research Sources**:
| Source | Key Finding | Verified |
|--------|-------------|----------|
| URL | Finding | Yes/No |
```

---

## Implementation Recommendations

### Quick Wins (Low Effort, High Value)

1. **Add Workflow field to task template**
   - Location: SKILL.md task template
   - Effort: Template update only
   - Value: Better task classification

2. **Add Complexity field**
   - Location: SKILL.md task template
   - Effort: Template update only
   - Value: Appropriate planning intensity

3. **Structure the Insights section**
   - Location: Notes template
   - Effort: Template update
   - Value: Preserved learnings

### Medium Effort

4. **Pre-Implementation Checklist**
   - Location: SKILL.md workflow
   - Effort: New workflow step
   - Value: Bug prevention

5. **Self-Critique Requirement**
   - Location: SKILL.md Step 4
   - Effort: Additional checklist
   - Value: Quality gate

### Larger Changes

6. **Phase Dependencies**
   - Location: SKILL.md subtask format
   - Effort: Parser changes if UI needs to support
   - Value: Explicit sequencing

7. **Research Phase Template**
   - Location: New notes template
   - Effort: New documentation type
   - Value: Verified dependencies

---

## Resources

- Auto-Claude Repository: https://github.com/AndyMik90/Auto-Claude
- Planner Prompt: /apps/backend/prompts/planner.md
- Coder Prompt: /apps/backend/prompts/coder.md
- Insight Extractor: /apps/backend/prompts/insight_extractor.md
- QA Reviewer: /apps/backend/prompts/qa_reviewer.md
- Complexity Assessor: /apps/backend/prompts/complexity_assessor.md
- Spec Writer: /apps/backend/prompts/spec_writer.md
- Spec Researcher: /apps/backend/prompts/spec_researcher.md
- Follow-up Planner: /apps/backend/prompts/followup_planner.md
- Spec Gatherer: /apps/backend/prompts/spec_gatherer.md

---

## Action Items

- [ ] Review recommendations with stakeholder
- [ ] Prioritize improvements for v2.5.0
- [ ] Update SKILL.md with selected improvements
- [ ] Test updated workflow with real tasks
- [ ] Consider task-status skill updates for quick context checks
