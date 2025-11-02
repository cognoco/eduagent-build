---
description: Execute the implementation planning workflow using the plan template to generate design artifacts.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. **Setup**: Run `.specify/scripts/powershell/setup-plan.ps1 -Json` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC and `.specify/memory/constitution.md`. Load IMPL_PLAN template (already copied).

3. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: MCP Research Gate (validate material changes, create research-validation.md)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md
   - Phase 1: Update agent context by running the agent script
   - Re-evaluate Constitution Check post-design

4. **Stop and report**: Command ends after Phase 1 planning. Report branch, IMPL_PLAN path, and generated artifacts.

## Phases

### Phase -1: Internal Governance Alignment (MANDATORY BLOCKER)

Purpose: Verify plan aligns with existing architecture, patterns, and constraints.

Gate Status Required: ✅ before proceeding to Phase 0

Steps:
1. Read governance index: `governance/index.json` (authoritative docs and artifact paths)
2. Run internal alignment gate:
   - Execute: `node tools/gates/run-internal-alignment.mjs`
   - If violations exist and no approved exceptions: ERROR and stop
3. Record in plan.md:
   - Add "Governance Alignment" section with statuses for:
     - docs/architecture-decisions.md
     - docs/memories/adopted-patterns.md
     - docs/tech-stack.md
     - docs/P1-plan.md
   - Document any conflicts and resolutions or approved exceptions
4. Mark gate status as ✅ when complete

### Phase 0: MCP Research Gate (MANDATORY - DO NOT SKIP)

**Purpose**: Resolve unknowns and consolidate decisions (research.md), and validate material changes via MCP servers (research-validation.md).

**Gate Status Required**: ✅ before proceeding to Phase 1

#### Step 1: Identify Research Areas & Clarifications

Analyze the feature spec and Technical Context for BOTH:
1) **NEEDS CLARIFICATION** items (must be resolved and recorded in research.md)
2) **Material changes** (require external validation and research-validation.md)

- [ ] NEEDS CLARIFICATION items in Technical Context (resolve and record in research.md)
- [ ] New external libraries/frameworks (validate in research-validation.md)
- [ ] Cross-project architecture/build/test/config changes (validate in research-validation.md)
- [ ] Public API contracts or data models (validate in research-validation.md)
- [ ] Security or infrastructure decisions (validate in research-validation.md)
- [ ] Database schema or ORM configuration (validate in research-validation.md)

**If NO material changes detected**: Produce/Update research.md only and proceed to Phase 1 (external validation optional).

**If material changes detected**: MUST complete Steps 2-4 before proceeding.

#### Step 2: Resolve Clarifications → research.md

Consolidate decisions and clarifications into `specs/{feature-name}/research.md` using this structure:

```
# Research

## Decisions
- Decision: <what was chosen>
  - Rationale: <why chosen>
  - Alternatives considered: <what else evaluated>

## Clarifications Resolved
- <question> → <answer/assumption>
```

> Update research.md whenever clarifications are resolved or decisions are taken. This document is the canonical Phase 0 narrative consumed by downstream steps.

#### Step 3: Dispatch Parallel Research Agents (External Validation)

For each material change or technology area, dispatch specialized research agents with MCP server access:

**Agent Template**:
```text
Task: "Use MCP servers (Context7, Exa, web search) to validate {technology/pattern} for {feature context}"

Requirements:
- Context7: Fetch official documentation for {library/framework}
- Exa: Search production code examples showing {pattern}
- Web Search: Research industry best practices for {use case}

Report:
- Status: [✅ VALIDATED | ⚠️ CHANGES REQUIRED | ❌ ANTI-PATTERN]
- Findings: [What did you discover?]
- Sources: [Specific docs, examples, articles]
- Recommendation: [Changes needed or confirmation]
```

**Dispatch Strategy**: Launch all research agents in parallel using single message with multiple Task tool calls.

**MCP Server Unavailability Protocol**:
- If Context7/Exa/web search unavailable: Immediately inform user
- DO NOT proceed without external validation
- DO NOT implement fallback mechanisms
- Ask user for guidance before continuing

#### Step 4: Create research-validation.md (when material changes exist)

Consolidate all agent findings into `specs/{feature-name}/research-validation.md` using template from `.specify/templates/research-validation.md`.

**Required Sections**:
- Executive Summary (key findings count)
- Research Methodology (MCP servers used)
- Agent findings for each technology area
- Critical Findings Summary (priority 1/2/3)
- Validated Patterns (no changes needed)
- Action Plan (documentation + implementation changes)
- Lessons Learned (impact of research)

**Output**: `research-validation.md` with complete findings and recommendations

#### Step 5: Gate Check

**BLOCKER - Cannot proceed to Phase 1 without**:
- [ ] research.md updated with decisions and resolved clarifications
- [ ] If material changes exist: research-validation.md exists with corresponding findings
- [ ] Critical findings (Priority 1) addressed in plan
- [ ] Gate status marked as ✅ in plan.md Research Validation section

**Update plan.md**: Fill Research Validation section with:
- Status: ✅ Complete
- MCP servers used: [Context7/Exa/Web]
- Material changes validated: [checked items]
- Research areas: [summary of each agent's status]
- Critical findings: [P1 items]
- Validated patterns: [no-change items]
- Gate status: ✅ External validation complete

**If gate check fails**: ERROR and report blockers to user. Do not proceed to Phase 1.

**Output**: Gate cleared, research.md (decisions/clarifications) created/updated, research-validation.md (if applicable) created, plan.md Research Validation section completed

### Phase 1: Design & Contracts

**Prerequisites:** Phase 0 gate cleared (research-validation.md complete)

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Agent context update**:
   - Run `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude`
   - These scripts detect which AI agent is in use
   - Update the appropriate agent-specific context file
   - Add only new technology from current plan
   - Preserve manual additions between markers

**Output**: data-model.md, /contracts/*, quickstart.md, agent-specific file

## Key rules

- Use absolute paths
- ERROR on gate failures or unresolved clarifications
