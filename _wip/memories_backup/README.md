---
title: Memory System Documentation
purpose: Comprehensive guide to the monorepo's institutional knowledge system
audience: AI agents, developers, architects
created: 2025-10-21
last-updated: 2025-10-27
Created: 2025-10-21T14:41
Modified: 2025-10-28T20:29
---

# Memory System Documentation

## Overview

This directory contains the monorepo's **institutional knowledge** - the patterns, decisions, and discoveries that define how this codebase works. It serves as long-term memory for AI agents and documentation for developers.

**Purpose**: Prevent pattern drift, avoid rework, and ensure consistency as the monorepo evolves.

---

## The Problem We're Solving

### Scenario: Pattern Drift

**Month 1**: Generate `apps/web` with Nx → adopt co-located tests in `src/`
**Month 6**: Generate `apps/mobile` with Nx → framework defaults to `__tests__/` directory
**Result**: Two different test patterns in the same monorepo ❌

### Scenario: Forgotten Constraints

**Month 1**: Discover Prisma packages need `--bundler=none`, document in tech log
**Month 6**: New developer generates database package with `--bundler=tsc`
**Result**: Hours wasted debugging broken imports ❌

### Scenario: Architectural Regression

**Month 1**: Decide on `moduleResolution: bundler` for base config, `nodenext` for test configs
**Month 6**: Agent sees generated `node10`, thinks "this is the new standard"
**Result**: Workspace configuration breaks, tests fail ❌

### The Solution: Memory System

This directory captures **transferable knowledge** that applies across multiple components, ensuring consistency and preventing rework.

---

## Memory Files

### `adopted-patterns.md`

**Purpose**: "This is how WE do it in THIS monorepo" - overrides framework defaults

**Content**:
- Test file locations (co-located in `src/`)
- TypeScript configuration standards (`moduleResolution: bundler` for base, `nodenext` for tests)
- Jest configuration patterns (workspace preset inheritance)
- Code organization conventions
- Dependency version standards

**When to read**:
- Before generating new apps or packages
- Before changing build/test/TypeScript configurations
- Before making architectural suggestions
- When onboarding new team members

**When to update**:
- When establishing a new convention that applies across components
- When framework defaults conflict with our monorepo standards
- When solving a problem that will recur in similar components

**Example entry**:
```markdown
## Pattern: Test File Location

**Our Standard**: Co-located tests in `src/` directory

**When adding new apps**:
- ⚠️ Generators may create `__tests__/` directory
- ✅ Required action: Move tests to `src/` to match our standard
```

---

### `post-generation-checklist.md`

**Purpose**: Mandatory steps after running Nx generators

**Content**:
- After `nx g @nx/jest:configuration`: Update TypeScript module resolution
- After `nx g @nx/js:lib`: Verify test location matches adopted pattern
- After `nx g @nx/node:app`: Check TypeScript version consistency
- After generating Prisma packages: Install dependencies, create directory structure

**When to read**:
- Immediately before running any `nx g` command (to prepare)
- Immediately after running any `nx g` command (to execute fixes)

**When to update**:
- When discovering a generator creates code that needs fixing
- When the fix is required for consistency with adopted patterns
- When the fix will apply to future uses of the same generator

**Example entry**:
```markdown
## After: `nx g @nx/jest:configuration`

### Required Actions

1. Update `tsconfig.spec.json`:
   - Change `"moduleResolution": "node10"` → `"nodenext"`

2. Validation:
   - Run `pnpm exec nx run <project>:test`
```

---

### `tech-findings-log.md`

**Purpose**: Technical decisions, empirical findings, known constraints

**Content**:
- Why Prisma packages use `--bundler=none` (architectural constraint)
- Why we use `import type` for server router types (technical pattern)
- Jest hanging on Windows (empirical troubleshooting)
- Nx cache corruption patterns (operational findings)

**When to read**:
- Before suggesting architecture changes
- When troubleshooting build/test/runtime errors
- When making technology stack decisions
- When evaluating alternatives to current approaches

**When to update**:
- When making a technical decision with non-obvious rationale
- When discovering empirical findings from troubleshooting
- When identifying constraints or limitations of tools/frameworks
- When investigating alternatives and rejecting them for specific reasons

**Difference from adopted-patterns.md**:
- Tech findings = **why** (rationale, constraints)
- Adopted patterns = **what** (standards, conventions)

---

### Reference Documentation

Comprehensive lookup material for specific technical domains. Consult these when you need detailed specifications, configuration patterns, or troubleshooting solutions.

#### `testing-reference.md`

**Purpose**: Comprehensive Jest and testing configuration reference for the nx-monorepo

**Content**:
- Test file location standards (co-located in `src/`)
- Unit tests (Jest), integration tests, E2E tests (Playwright)
- Jest configuration patterns (workspace preset, project-level, TypeScript config)
- Coverage testing (scripts, thresholds, reports, directory structure)
- Adding Jest to new projects
- Testing enhancements and best practices

**When to read**:
- Before configuring Jest for new projects
- When troubleshooting test failures or configuration issues
- When setting up coverage thresholds and reporting
- When Jest or testing tools are updated
- When onboarding developers to testing standards

**When to update**:
- When discovering new testing patterns or configurations
- When Jest version changes require configuration updates
- When adding new testing tools or frameworks
- When establishing new testing conventions

**Difference from troubleshooting.md**:
- Testing reference = comprehensive Jest/testing configuration guide
- Troubleshooting = quick solutions for common errors (all domains)

---

### Spec‑Kit Research Artifacts

Purpose: Clarify the two Phase 0 research artifacts for agents.

- `research.md` (canonical narrative)
  - Contains decisions, rationales, alternatives, and resolved clarifications.
  - Always produced/updated during Phase 0; consumed by downstream Spec‑Kit steps.

- `research-validation.md` (external validation evidence)
  - Produced when Phase 0 identifies material changes (new libs, cross‑project changes, API/data model, security/infra, DB/ORM).
  - Consolidates MCP server findings (Context7, Exa, web) to validate chosen patterns.

Guidance for agents:
- Always update `research.md` in Phase 0.
- Produce `research-validation.md` only when material changes exist.
- CI validates presence of `research-validation.md` when material changes are detected and accepts `research.md` alone otherwise.

---

#### `troubleshooting.md`

**Purpose**: Common troubleshooting solutions for nx-monorepo development issues

**Content**:
- Nx cache issues and resolution
- TypeScript path resolution problems
- Build failures and dependency ordering
- Test failures (general, non-Windows)
- Prisma client and migration issues
- Links to related documentation

**When to read**:
- When encountering build, test, or runtime errors
- Before suggesting fixes to recurring issues
- When new developers face common setup problems
- When troubleshooting Nx, TypeScript, or Prisma issues

**When to update**:
- When discovering new workarounds for common issues
- When resolving recurring problems that affect multiple developers
- When tooling updates change troubleshooting approaches
- When identifying new error patterns

**Important note**:
- Jest hanging on Windows (most frequent test issue) remains in `.ruler/AGENTS.md` for immediate visibility
- General test failures are documented here; Windows-specific Jest hanging is in AGENTS.md

---

### `known-issues.md` *(Future - Phase 2)*

**Purpose**: Active bugs, workarounds, temporary solutions

**Content**:
- Jest hanging on Windows (workaround: `NX_DAEMON=false`)
- Nx cache corruption (fix: `nx reset`)
- Temporary patches waiting for upstream fixes

**When to read**:
- When encountering errors that match symptom patterns
- Before suggesting "fixes" that might conflict with known workarounds

**When to update**:
- When discovering a temporary fix for a recurring issue
- When finding a workaround that helps troubleshooting

**When to remove**:
- When issues are permanently resolved upstream
- When workarounds are no longer needed

**Difference from tech-findings-log.md**:
- Known issues = temporary problems with workarounds
- Tech findings = permanent architectural decisions

---

### `integration-recipes.md` *(Future - Phase 2)*

**Purpose**: How to connect component A to component B

**Content**:
- How web app calls REST API server (client initialization, error handling)
- How server connects to Prisma database (singleton pattern, pooling)
- How to use Supabase auth in Next.js (server vs client components)
- How to use Supabase auth in Expo (session persistence)
- How to share Zod schemas between server and client

**When to read**:
- When implementing features that cross architectural boundaries
- When adding new apps that need to integrate with existing services
- When refactoring integration code

**When to update**:
- When figuring out how to connect two layers for the first time
- When discovering better integration approaches
- When solving integration problems that will apply to other components

---

### `architecture-decisions.md`

**Purpose**: High-level strategic choices with rationale

**Content**:
- Why REST+OpenAPI instead of oRPC, tRPC or gRPC
- Why Supabase + Prisma instead of alternatives
- Why monorepo instead of polyrepo
- Why pnpm instead of npm/yarn
- Why Nx instead of Turborepo

**Note**: Created in Phase 1 Stage 4.1 to document API architecture decision

**When to read**:
- Before suggesting alternative architectures
- When explaining project decisions to stakeholders
- When evaluating technology migrations

**When to update**:
- When making major architectural decisions
- When choosing between competing technologies
- When rejecting alternatives for documented reasons

**Difference from tech-findings-log.md**:
- Architecture decisions = strategic "what" and "why" (business/tech trade-offs)
- Tech findings = tactical "how" (implementation details)

---

### `current-task.md` *(Future - as needed)*

**Purpose**: Active work state for cross-session continuity

**Content**:
- What stage/substage is in progress
- What was just completed
- What's next
- Blockers or open questions
- Context for next agent session

**When to read**:
- At the start of every AI agent session
- When resuming work after interruption

**When to update**:
- Frequently during long tasks (every 30-60 minutes)
- Before reaching context limits
- When completing substages
- When encountering blockers

**When to clear**:
- When phase/stage is complete
- When starting entirely new work

---

## Agent Workflow Integration

### Session Start
```
1. Read current-task.md (if exists) - where did we leave off?
2. Read relevant sections of adopted-patterns.md - what are our standards?
```

### Before Generating Components
```
1. Read adopted-patterns.md - what patterns must I follow?
2. Read post-generation-checklist.md - what will I need to fix?
3. Run: pnpm exec nx g <command>
```

### After Generating Components
```
1. Execute post-generation-checklist.md - apply mandatory fixes
2. Validate against adopted-patterns.md - does it match our standards?
3. Test: build, lint, test targets work correctly
```

### When Implementing Features
```
1. Read integration-recipes.md - how do components connect?
2. Read tech-findings-log.md - any constraints I should know about?
3. Implement following established patterns
```

### When Troubleshooting
```
1. Read troubleshooting.md - common solutions for development issues
2. Read testing-reference.md - if issue is test-related (configuration, coverage, Jest setup)
3. Read known-issues.md - is this a known problem with a workaround?
4. Read tech-findings-log.md - any empirical findings related to this?
5. Search for similar symptoms
```

### Before Suggesting Changes
```
1. Read architecture-decisions.md - why did we choose our current approach?
2. Read adopted-patterns.md - does this conflict with established patterns?
3. Read tech-findings-log.md - were alternatives already rejected?
```

### During Long Tasks
```
1. Update current-task.md - checkpoint progress every 30-60 minutes
2. Update adopted-patterns.md - if discovering new cross-component patterns
3. Update tech-findings-log.md - if discovering new constraints
```

---

## Memory System Principles

### 1. Cross-Component Knowledge

Memory captures **transferable patterns** that apply to **multiple similar contexts**.

✅ **DO capture**:
- "When you generate ANY package with Jest, update moduleResolution to nodenext"
- "How to integrate REST API client in React-based apps (web, mobile)"
- "TypeScript configuration standards for ALL projects"

❌ **DON'T capture**:
- Single-use fixes ("Fixed bug in web/page.tsx line 42")
- Component-specific details ("Web app uses port 3000")
- Already well-documented patterns (standard Next.js routing)

### 2. Non-Obvious Knowledge

Memory captures what ISN'T obvious from official documentation.

✅ **DO capture**:
- Integration patterns combining multiple technologies
- Empirical findings from troubleshooting
- Monorepo-specific configuration requirements

❌ **DON'T capture**:
- Standard framework documentation (link to official docs instead)
- Self-explanatory code patterns
- Generic programming concepts

### 3. Recurring Patterns

Memory captures knowledge you'll need **again when adding similar components**.

✅ **DO capture**:
- Post-generation fixes that apply to every similar generator
- Integration patterns used by multiple apps
- Configuration patterns repeated across packages

❌ **DON'T capture**:
- One-time migrations or refactorings
- Historical context that won't affect future work
- Deprecated patterns no longer in use

### 4. Preventive Knowledge

Memory captures **solutions to prevent future problems**.

✅ **DO capture**:
- "Don't use --bundler=tsc for Prisma packages" (prevents broken imports)
- "Always check test location after generation" (prevents pattern drift)
- "Verify TypeScript version matches workspace" (prevents version conflicts)

❌ **DON'T capture**:
- Problems that only occurred once
- Issues resolved by updating dependencies
- Bugs fixed in code (not configuration/patterns)

---

## How to Maintain the Memory System

### Regular Maintenance

**Monthly review** (recommended):
1. Review `known-issues.md` - remove resolved issues
2. Review `current-task.md` - clear if stale
3. Review `adopted-patterns.md` - update "Last Validated" dates
4. Check for patterns that should be moved between files

**When updating frameworks**:
1. Test post-generation-checklist.md with new generator versions
2. Update "Last Validated" dates in adopted-patterns.md
3. Document any new generator issues discovered

**When adding new apps/packages**:
1. Follow existing patterns from memory files
2. Document any NEW patterns discovered
3. Update checklists if generators behave differently

### Quality Standards

**Good memory entry**:
- Clear, concise, actionable
- Includes rationale (why, not just what)
- Has validation steps
- Links to related docs
- Dated with "Last Validated"
- Complete frontmatter (title, purpose, audience, dates)

**Bad memory entry**:
- Vague or ambiguous
- No explanation of why
- No way to verify if applied correctly
- Orphaned (no context for when to use it)
- Missing or incomplete frontmatter

---

## FAQ

### Why not just use code comments?

Code comments explain **individual files**. Memory files explain **cross-component patterns** and **monorepo-wide decisions**.

### Why not use external documentation tools?

External tools require context switching. Memory files live in the repo, are version-controlled, and are immediately accessible to AI agents.

### How is this different from CLAUDE.md?

- `CLAUDE.md` = general agent behavior and project overview
- `docs/memories/` = specific patterns, decisions, and discoveries

### What if a pattern changes?

Update the relevant memory file, document the change, update "Last Validated" date, and notify the team. Memory evolves with the project.

### How do I know which file to update?

Use the decision tree:
- Monorepo-wide standard → `adopted-patterns.md`
- Post-generator fix → `post-generation-checklist.md`
- Technical constraint → `tech-findings-log.md`
- Temporary workaround → `known-issues.md`
- Integration pattern → `integration-recipes.md`
- Strategic decision → `architecture-decisions.md`

---

## Memory System Status

**Phase 1 (Current)** - Core Foundation:
- ✅ `adopted-patterns.md` - 10 patterns documented
- ✅ `post-generation-checklist.md` - 5 checklists documented
- ✅ `tech-findings-log.md` - Migrated and enhanced
- ✅ `testing-reference.md` - Comprehensive Jest and testing configuration reference
- ✅ `troubleshooting.md` - Common development troubleshooting solutions
- ✅ `README.md` - This file

**Phase 1 Complete (Canonical Docs)**:
- ✅ `docs/architecture-decisions.md` - Stage 4.1 (REST+OpenAPI), Stage 4.2 (Supabase+Prisma+RLS)
- ✅ `docs/tech-stack.md` - Complete version inventory with pinning strategy
- ✅ `docs/P1-plan.md` - Walking skeleton implementation plan

**Phase 2 (Planned)** - Expansion:
- ⏳ `known-issues.md` - Active bugs and workarounds
- ⏳ `integration-recipes.md` - Cross-component integration patterns
- ⏳ `current-task.md` - Active work state

**Phase 3 (Future)** - Advanced:
- Automated validation scripts
- Memory quality metrics
- Memory search/indexing tools
- Integration with CI/CD

---

## Contributing

When you discover new patterns, constraints, or solutions:

1. **Determine which file** the knowledge belongs in
2. **Use the template** provided in that file
3. **Test the pattern** with a fresh generation/implementation
4. **Link related docs** for cross-reference
5. **Update dates** in frontmatter

**Quality checklist**:
- [ ] Clear and actionable
- [ ] Includes rationale (why, not just what)
- [ ] Has validation/verification steps
- [ ] Dated with "Last Validated"
- [ ] Links to related documentation
- [ ] Tested with actual code

---

**Last Updated**: 2025-10-21
**Status**: Phase 1 Complete
**Maintainer**: Development Team
