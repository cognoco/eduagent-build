---
title: AGENTS.md Condensation - Task Tracking
purpose: Comprehensive to-do list for AGENTS.md condensation project
status: In Progress
created: 2025-10-27
last-updated: 2025-10-27
Created: 2025-10-27T14:46
Modified: 2025-10-28T13:21
---

# AGENTS.md Condensation - Task Tracking

## Project Goal

Condense `.ruler/AGENTS.md` by ~30% while maintaining 100% quality and preventing agent errors. Move reference documentation to memory system with strong MANDATORY READ triggers.

## Key Principles (User Feedback)

- **Quality over size reduction** - 30% would be great, not aiming for 50%
- **These sections exist due to painful agent failures** - don't remove guardrails
- **Jest/testing is "very problematic area"** - requires strong guardrails
- **File tree is architectural blueprint** - not just documentation
- **Agents need pinned versions** - or they "go off the rails"
- **Ensure agents actually read memory files** - use MANDATORY READ triggers

## Task Categories

### Phase 0: Pre-Flight Cleanup
Clean up leftover references from previous architecture.

### Phase 1: Verification & Analysis
Tasks that verify current state and gather information needed for condensation.

### Phase 2: New Documentation Creation
Create new memory system files to receive content from AGENTS.md.

### Phase 3: Memory System Updates
Update existing memory system to reference new files.

### Phase 4: AGENTS.md Condensation
Execute the actual condensation with quality-first approach.

### Phase 5: Validation
Verify results and ensure nothing was lost.

---

## Phase 0: Pre-Flight Cleanup

### Task 0.1: Clean Up oRPC → REST+OpenAPI References
**Status**: ✅ Complete (2025-10-27)
**Priority**: High
**Dependencies**: None

**Checklist**:
- [x] Search `.ruler/AGENTS.md` for "oRPC" references
- [x] Search `README.md` for "oRPC" references (already clean)
- [x] Search `docs/` directory for "oRPC" references
- [x] Replace all "oRPC" mentions with "REST+OpenAPI"
- [x] Update API architecture descriptions to reflect REST+OpenAPI

**Files Updated**:
- `.ruler/AGENTS.md` (4 references → REST+OpenAPI)
- `AGENTS.md` (synced from .ruler/)
- `CLAUDE.md` (auto-generated via Ruler)
- `docs/poc-plan.md` (2 references)
- `docs/memories/README.md` (1 reference)
- `docs/memories/tech-findings-log.md` (1 reference)

**Files Kept As-Is** (legitimate references):
- `docs/orpc-audit-comprehensive.md` (audit document)
- `docs/architecture-decisions.md` (decision comparison)
- `docs/package-versions-baseline.md` (historical baseline)
- `docs/P1-plan.md` (historical task descriptions - user reverted changes)
- [ ] Verify shared package descriptions are accurate (api-client package)
- [ ] Update dependency flow diagrams if needed

**Files to Check**:
- `.ruler/AGENTS.md` (Technology Stack, Monorepo Structure, comments)
- `README.md` (if exists)
- `docs/tech-stack.md` (when created)
- Any other documentation files

**Notes**:
- Project has migrated from oRPC to REST+OpenAPI
- This is cleanup of leftover documentation references
- Must be completed before creating new documentation to avoid propagating old references

---

## Phase 1: Verification & Analysis

### Task 1.1: Verify README.md Commands
**Status**: ✅ Complete (2025-10-27)
**Priority**: High
**Dependencies**: None

**Checklist**:
- [x] Read `README.md` "Common Commands" section
- [x] Read `.ruler/AGENTS.md` command examples
- [x] Read `package.json` scripts section
- [x] Read `nx.json` configuration
- [x] Compare all sources for consistency
- [x] Document any discrepancies found
- [x] Create fix list if inconsistencies exist

**Completion Notes**:
- Used sub-agent for comprehensive analysis across 4 sources
- Identified 10 discrepancies (4 medium, 6 low priority)
- Fixed CI validation command in README.md (added pnpm exec and typecheck)
- Added note in README.md explaining short-form vs long-form commands for agents
- All fixes approved and implemented

---

### Task 1.2: Version Pinning Analysis
**Status**: ✅ Complete (2025-10-27)
**Priority**: High
**Dependencies**: None

**Checklist**:
- [x] Analyze `package.json` for version pinning depth
- [x] Document current pinning strategy (exact vs caret vs tilde)
- [x] Identify critical packages requiring exact pins
- [x] Document where versions are controlled (package.json vs documentation)
- [x] Clarify version pinning philosophy for agents
- [x] Create guidelines for when agents can suggest version changes

**Completion Notes**:
- Used sub-agent for comprehensive analysis of 58 packages
- Identified 3 high-priority drifts: Playwright, ESLint, @nx/react
- Created `docs/tech-stack.md` with complete version pinning policy
- Updated package.json to fix all identified drifts
- Policy: Exact pins for testing/linting/tooling, flexibility for utilities

---

### Task 1.3: File Tree Structure Analysis
**Status**: ✅ Complete (2025-10-27)
**Priority**: Medium
**Dependencies**: None

**Checklist**:
- [x] Review current file tree in AGENTS.md (Monorepo Structure section)
- [x] Identify what "one level deeper" means for each directory
- [x] Draft enhanced file tree with deeper structure
- [x] Ensure emphasis on constraint/blueprint nature (not just documentation)

**Completion Notes**:
- Presented 3 options to user: Minimal, Balanced (recommended), Comprehensive
- User selected Option B (Balanced View)
- Implemented enhanced file tree showing one level deeper with key files
- Added strong emphasis on architectural blueprint nature (not documentation)
- Enhanced constraint messaging in section header

**Notes**:
- User feedback: "File tree IS the blueprint, not just a reminder"
- User feedback: "Go one level deeper in the structure"
- Keep in AGENTS.md as architectural constraint

---

## Phase 2: New Documentation Creation

### Task 2.1: Create docs/memories/testing-reference.md
**Status**: ✅ Complete (2025-10-27)
**Priority**: Critical
**Dependencies**: None

**Checklist**:
- [x] Create file with frontmatter metadata
- [x] Extract "Jest Configuration Patterns" section from AGENTS.md
- [x] Extract "Coverage Testing" section from AGENTS.md
- [x] Add TypeScript test configuration details
- [x] Document version compatibility matrix (Jest 30, ts-jest, swc-jest)
- [x] Add common pitfalls and solutions
- [x] Include Context7 MCP and web search guidance
- [x] Add examples and validation commands

**Completion Notes**:
- Created with reorganized structure and table of contents
- Extracted content strictly from AGENTS.md (no additions)
- Added tags for searchability (jest, testing, configuration, coverage, typescript, playwright)
- Implemented bidirectional MANDATORY READ triggers to AGENTS.md and other memory files
- Organized into clear sections with examples and rationale

**Content to Include**:
- Workspace preset pattern (`jest.preset.js`)
- Project-level configuration (`jest.config.ts`)
- TypeScript type isolation (`tsconfig.spec.json`)
- Coverage thresholds and reports
- Adding Jest to new projects
- Version compatibility constraints
- Troubleshooting common Jest issues

**Notes**:
- User feedback: "Jest/testing is very problematic area"
- User feedback: "Tell agent to use Context7 MCP and web search when in testing domain"
- Requires STRONG mandatory read triggers in AGENTS.md

---

### Task 2.2: Create docs/memories/troubleshooting.md
**Status**: ✅ Complete (2025-10-27)
**Priority**: High
**Dependencies**: None

**Checklist**:
- [x] Create file with frontmatter metadata
- [x] Extract non-critical troubleshooting from AGENTS.md
- [x] Add "Nx Cache Issues" section
- [x] Add "TypeScript Path Resolution" section
- [x] Add "Build Failures" section
- [x] Add "Test Failures" section (excluding Jest hanging - keep in AGENTS.md)
- [x] Add "Prisma Issues" section
- [x] Include diagnostic commands for each issue
- [x] Add resolution steps and validation

**Completion Notes**:
- Created with reorganized structure and table of contents
- Extracted content strictly from AGENTS.md (no additions)
- Added tags for searchability (troubleshooting, nx, typescript, build, prisma, cache)
- Implemented bidirectional references - points to AGENTS.md for Jest hanging issue
- Jest hanging (Windows) remains in AGENTS.md as specified (most frequent issue)

**Content to Include**:
- Nx cache reset procedures
- TypeScript path resolution debugging
- Build failure diagnosis (dependency order, affected projects)
- Test failure debugging (single file, watch mode, cache clearing)
- Prisma regeneration and migration issues

**Notes**:
- User feedback: "Keep Jest hanging (Windows) in AGENTS.md as most frequent issue"
- Non-critical issues move here, critical issues stay in AGENTS.md

---

### Task 2.3: Create docs/tech-stack.md
**Status**: ✅ Complete (2025-10-27)
**Priority**: High
**Dependencies**: Task 1.2 (Version Pinning Analysis)

**Checklist**:
- [x] Create file in `docs/` (not in memories/)
- [x] Document full technology stack with exact pinned versions
- [x] Include version pinning strategy and depth
- [x] Create compatibility matrix (cross-package dependencies)
- [x] Add upgrade guidelines and decision process
- [x] Document platform-specific constraints (Windows ARM64, etc.)
- [x] Include rationale for major version choices

**Completion Notes**:
- Created comprehensive `docs/tech-stack.md` with full package inventory
- Documented version pinning philosophy: exact/tilde/caret strategy
- Included agent permission model for version changes
- Added compatibility matrix for critical dependencies
- Documented upgrade approval cycle
- Included platform-specific constraints (Windows ARM64)
- Added reference links to official documentation

**Content Included**:
- Web stack: Next.js 15.2, React 19, Tailwind CSS (versions)
- Server stack: Express with REST+OpenAPI (versions)
- Database stack: Prisma 6.17.1/6.18.0, Supabase PostgreSQL (versions)
- Testing stack: Jest 30, Playwright (versions)
- Tooling: Nx 21.6, TypeScript 5.9, ESLint 9, Prettier (versions)
- Version pinning philosophy
- When agents can suggest version changes
- Upgrade approval process

**Notes**:
- User feedback: "Create separate detailed tech stack document (not in README.md)"
- README.md should have high-level overview only
- This is reference data, not in memory system

---

## Phase 3: Memory System Updates

### Task 3.1: Update docs/memories/README.md
**Status**: ⏳ Pending
**Priority**: High
**Dependencies**: Task 2.1, Task 2.2

**Checklist**:
- [ ] Read current `docs/memories/README.md`
- [ ] Add reference to `testing-reference.md`
- [ ] Add reference to `troubleshooting.md`
- [ ] Update "Memory Files Quick Reference" section if needed
- [ ] Update "When to Consult Memory Files" section if needed
- [ ] Ensure cross-references are bidirectional
- [ ] Update `last-updated` frontmatter field

**Notes**:
- User feedback: "Make necessary changes to the memory system"
- Ensure agents know these files exist and when to read them

---

### Task 3.2: Update README.md (Root)
**Status**: ⏳ Pending
**Priority**: High
**Dependencies**: Task 1.1 (Verify Commands), Task 2.3 (Tech Stack Doc)

**Checklist**:
- [ ] Update "Common Commands" section if discrepancies found
- [ ] Update "Technology Stack" to high-level overview only
- [ ] Add reference link to `docs/tech-stack.md` for detailed versions
- [ ] Ensure commands match package.json scripts
- [ ] Ensure consistency with AGENTS.md command examples
- [ ] Do NOT edit timestamp fields (Modified:)

**Notes**:
- README.md should have high-level tech stack overview
- Detailed versions go in docs/tech-stack.md
- Commands must match actual config files

---

## Phase 4: AGENTS.md Condensation

### Task 4.1: Create Condensed Common Commands Section
**Status**: ⏳ Pending
**Priority**: Medium
**Dependencies**: Task 1.1 (Verify Commands)

**Checklist**:
- [ ] Draft condensed version emphasizing Nx/pnpm rule
- [ ] Add pointer to README.md "Common Commands" for full reference
- [ ] Keep critical command patterns (nx run, nx run-many, nx affected)
- [ ] Remove redundant examples
- [ ] Validate rule clarity

**Target Content**:
```markdown
## Essential Commands

**CRITICAL: This is an Nx monorepo using pnpm**
- Always use `pnpm exec nx` commands (never npm, never yarn)
- Workspace scripts: See root `package.json` for `pnpm run` shortcuts
- Full command reference: See `README.md` section "Common Commands"

**Key patterns**:
- Single project: `pnpm exec nx run <project>:<target>`
- Multiple projects: `pnpm exec nx run-many -t <target>`
- Affected only: `pnpm exec nx affected -t <target>`
```

**Notes**:
- User feedback: "Keep rule about Nx/pnpm, condense with pointer"
- ~70% reduction while keeping critical rule

---

### Task 4.2: Create MANDATORY READ Trigger for Testing
**Status**: ⏳ Pending
**Priority**: Critical
**Dependencies**: Task 2.1 (Testing Reference Created)

**Checklist**:
- [ ] Draft strong trigger language for testing domain
- [ ] Replace Jest Configuration Patterns section
- [ ] Replace Coverage Testing section
- [ ] Add Context7 MCP and web search requirement
- [ ] Emphasize "MANDATORY" and consequences of skipping

**Target Content**:
```markdown
## Jest & Testing Configuration

**⚠️ MANDATORY READ BEFORE ANY TESTING WORK ⚠️**

Testing (especially Jest) is a **very problematic area** with version compatibility issues and complex configuration interactions.

**BEFORE you:**
- Add Jest to a new project
- Modify any `jest.config.ts`
- Modify any `tsconfig.spec.json`
- Troubleshoot test failures
- Change test tooling versions

**YOU MUST:**
1. **READ**: `docs/memories/testing-reference.md` - comprehensive Jest reference
2. **VERIFY**: Use Context7 MCP to fetch latest official docs
3. **CROSS-CHECK**: Use web search to verify version compatibility
4. **FOLLOW**: All patterns in `adopted-patterns.md` and `post-generation-checklist.md`

**Consequences of skipping**: Test failures, version conflicts, broken CI, pattern drift across projects.

**Quick Reference**: See `docs/memories/testing-reference.md`
```

**Notes**:
- User feedback: "Jest/testing is very problematic area requiring STRONG guardrails"
- User feedback: "Tell agent to use Context7 MCP and web search"
- This is the most critical trigger - must be unmissable

---

### Task 4.3: Create Troubleshooting Section with Trigger
**Status**: ⏳ Pending
**Priority**: Medium
**Dependencies**: Task 2.2 (Troubleshooting Doc Created)

**Checklist**:
- [ ] Keep Jest hanging (Windows) in AGENTS.md (most frequent)
- [ ] Create trigger for other troubleshooting issues
- [ ] Draft condensed troubleshooting section
- [ ] Add mandatory read trigger for comprehensive guide

**Target Content**:
```markdown
## Troubleshooting

### Jest Exits Slowly or Hangs (Windows)

**Symptom**: Jest prints "did not exit one second after the test run" or shows "Terminate batch job (Y/N)?".

**Try solutions in order:**
1. Disable Nx daemon: `NX_DAEMON=false pnpm exec nx run-many -t test`
2. Disable Nx Cloud: `pnpm exec nx run-many -t test --no-cloud`
3. Combine both if needed

[... keep full Windows Jest hanging section from current AGENTS.md ...]

---

### Other Issues

For comprehensive troubleshooting of:
- Nx cache issues
- TypeScript path resolution
- Build failures
- Test failures (non-Jest-specific)
- Prisma issues

**READ**: `docs/memories/troubleshooting.md`
```

**Notes**:
- Keep Windows Jest hanging (most frequent issue)
- Move other troubleshooting to memory file
- User feedback: "Keep Jest hanging in AGENTS.md"

---

### Task 4.4: Enhance File Tree Structure
**Status**: ⏳ Pending
**Priority**: Medium
**Dependencies**: Task 1.3 (File Tree Analysis)

**Checklist**:
- [ ] Update "Monorepo Structure" section in AGENTS.md
- [ ] Add one level deeper to directory structure
- [ ] Add emphasis on constraint/blueprint nature
- [ ] Include key files in each directory (not just directories)

**Target Enhancement**:
```markdown
### Monorepo Structure (ARCHITECTURAL BLUEPRINT)

**IMPORTANT**: This structure is a constraint/blueprint, not documentation. Generated projects MUST follow this architecture.

```
apps/
  web/                    # Next.js web application
    src/
      app/                # Next.js App Router pages
      components/         # React components (co-located tests)
    project.json          # Nx project configuration
    jest.config.ts        # Jest configuration
    tsconfig.json         # TypeScript config (production)
  web-e2e/                # Playwright E2E tests
    src/
      *.spec.ts           # E2E test specs
  server/                 # Express API server
    src/
      main.ts             # Server entry point
      routes/             # REST+OpenAPI route definitions
    project.json
    jest.config.ts

packages/                 # Shared libraries (buildable)
  database/               # Prisma client + utilities
    src/
      index.ts            # Public API
      client.ts           # Prisma client instance
    prisma/
      schema.prisma       # Database schema
      migrations/         # Migration history
    project.json
  schemas/                # Zod schemas + TypeScript types
    src/
      index.ts            # Barrel exports
      *.schema.ts         # Individual schemas
  api-client/             # REST API client
  supabase-client/        # Supabase configuration
```

**Dependency Flow (Unidirectional)**:
```
apps (web, mobile) → api-client → schemas
apps (server) → database → schemas
                ↓
            supabase-client
```
```

**Notes**:
- User feedback: "Go one level deeper in structure"
- User feedback: "File tree IS the blueprint"
- Show key files, not just directories

---

### Task 4.5: Update Technology Stack Section
**Status**: ⏳ Pending
**Priority**: High
**Dependencies**: Task 2.3 (Tech Stack Doc Created)

**Checklist**:
- [ ] Condense Technology Stack section to high-level overview
- [ ] Include only critical pinned versions
- [ ] Add strong reference to `docs/tech-stack.md`
- [ ] Add rule about version pinning and when agents can suggest changes

**Target Content**:
```markdown
## Technology Stack

**CRITICAL: Agents must use pinned versions or will go off the rails.**

### Core Stack
- **Web**: Next.js 15.2, React 19, Tailwind CSS
- **Server**: Express with REST+OpenAPI
- **Database**: Prisma 6.17.1 (CLI) / 6.18.0 (Client), Supabase PostgreSQL
- **Testing**: Jest 30 (unit), Playwright (E2E)
- **Tooling**: Nx 21.6, TypeScript 5.9, ESLint 9, Prettier

**Detailed Versions & Compatibility**: See `docs/tech-stack.md`

### Version Pinning Policy

**Agents MUST**:
- Use exact versions specified in `package.json`
- Read `docs/tech-stack.md` before suggesting version changes
- Verify version compatibility using Context7 MCP and web search

**Agents MAY**:
- Suggest version updates with rationale
- Flag outdated dependencies
- Propose compatibility improvements

**Approval Cycle**: Version changes require architectural review and explicit user approval.
```

**Notes**:
- User feedback: "Agents need pinned versions or go off the rails"
- User feedback: "Allow agents to suggest version changes with architectural cycle"
- Keep critical versions in AGENTS.md, details in tech-stack.md

---

### Task 4.6: Verify Development Workflow Section
**Status**: ⏳ Pending
**Priority**: Low
**Dependencies**: None

**Checklist**:
- [ ] Review current "Development Workflow" section
- [ ] Verify 6-step workflow is clear and unambiguous
- [ ] Ensure no duplication with other sections
- [ ] Keep as-is if valid (user feedback: "OK")

**Notes**:
- User feedback: "Keep 6-step workflow (architectural constraint)"
- User feedback: Point 7 "OK!"
- No condensation needed unless redundancy found

---

### Task 4.7: Verify Testing Strategy Section
**Status**: ⏳ Pending
**Priority**: Low
**Dependencies**: Task 2.1 (Testing Reference Created)

**Checklist**:
- [ ] Review current "Testing Strategy" section
- [ ] Verify guardrails are present
- [ ] Check for duplication with testing-reference.md
- [ ] Add cross-reference to testing-reference.md if needed
- [ ] Keep as-is if valid (user feedback: "Agree")

**Notes**:
- User feedback: "Guardrails MUST be there regardless of approach"
- User feedback: Point 8 "Agree"
- This is high-level strategy, testing-reference.md is detailed mechanics

---

### Task 4.8: Implement Pattern Validation System
**Status**: ⏳ Pending
**Priority**: High
**Dependencies**: Task 2.3 (Tech Stack Doc Created), All Phase 2 tasks

**Purpose**: Prevent silent pattern drift when package versions are upgraded by implementing version tracking and validation triggers in AGENTS.md and memory system.

**Problem Statement**:
Memory system documents patterns as timeless truths, but they're actually version-dependent assertions. Without version tracking, patterns can become silently outdated after package upgrades, causing agents to follow obsolete patterns with no warning.

**Example Failure Mode**:
1. Document "Use `user-event.click()` like this" (validated against v14.5.0)
2. Package upgraded to v15.0.0 (breaking API change)
3. Agent reads adopted-patterns.md, follows outdated pattern
4. Code fails mysteriously

**Solution**: Three-layer validation system

#### Layer 1: Post-Upgrade Validation Procedure (AGENTS.md)

**Checklist**:
- [ ] Add new section to `.ruler/AGENTS.md` Memory System
- [ ] Document procedure for post-package-upgrade validation
- [ ] Include steps: identify affected patterns, validate with Context7/Exa, update or flag
- [ ] Require creating tech-findings-log.md entry for breaking changes
- [ ] Mandate flagging patterns for human review when outdated

**Target Content**:
```markdown
### Pattern Validation After Package Upgrades

**CRITICAL: After upgrading ANY package referenced in memory system:**

1. **Identify affected patterns**: Check if upgraded package is mentioned in:
   - `docs/memories/adopted-patterns.md`
   - `docs/memories/tech-findings-log.md`
   - `docs/memories/testing-reference.md`
   - Any code examples in memory files

2. **Validate patterns still work**:
   - Use Context7 MCP to fetch latest docs for upgraded package
   - Use Exa MCP to search for 2025 best practices
   - Compare documented pattern to current recommendations

3. **Update or flag**:
   - If pattern still valid: Update validation metadata in `tech-stack.md`
   - If pattern outdated: Flag for human review with rationale
   - If breaking change: Create `tech-findings-log.md` entry + flag for human review

**Example**: Upgrading `@testing-library/user-event` from 14.x to 15.x:
- Check `adopted-patterns.md` for user-event patterns
- Research if API changed (Context7: `/testing-library/user-event`)
- Update patterns if needed OR flag for review
- Update validation metadata in `tech-stack.md`
```

#### Layer 2: Validation Tracking Table (tech-stack.md)

**Checklist**:
- [ ] Add "Memory System Pattern Validation" section to `docs/tech-stack.md`
- [ ] Create validation table linking packages to memory file categories
- [ ] Document validation status legend (✅ Valid, ⚠️ Needs Validation, ❌ Outdated)
- [ ] Include current package versions for comparison
- [ ] Document when to mark "Needs Validation" (immediately after upgrades)
- [ ] Make table structure parseable for future automation

**Target Content**:
```markdown
## Memory System Pattern Validation

Tracks when patterns in `docs/memories/` were last validated against current package versions.

### Validation Table

| Memory Category | Memory File | Key Packages | Last Validated | Version at Validation | Current Version | Status |
|----------------|-------------|--------------|----------------|----------------------|----------------|--------|
| Testing Patterns (React) | adopted-patterns.md, testing-reference.md | @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, msw | 2025-10-28 | 15.0.0, 14.5.0, 6.6.3, 2.0.0 | 15.0.0, 14.5.0, 6.6.3, 2.0.0 | ✅ Valid |
| Testing Patterns (Jest) | testing-reference.md | jest, ts-jest, @nx/jest | 2025-10-27 | 30.0.0, 30.0.0, 21.0.0 | 30.0.0, 30.0.0, 21.0.0 | ✅ Valid |
| Supabase Integration | adopted-patterns.md | @supabase/ssr, @supabase/supabase-js | 2025-10-20 | 0.5.2, 2.48.1 | 0.5.2, 2.48.1 | ✅ Valid |
| Database Patterns | tech-findings-log.md, adopted-patterns.md | prisma, @prisma/client | 2025-10-20 | 6.17.1, 6.18.0 | 6.17.1, 6.18.0 | ✅ Valid |
| Nx Configuration | post-generation-checklist.md, adopted-patterns.md | @nx/js, @nx/node, @nx/react | 2025-10-27 | 21.0.0, 21.0.0, 21.0.0 | 21.0.0, 21.0.0, 21.0.0 | ✅ Valid |
```

**Validation Test** (User's litmus test):
An agent should be able to:
1. Parse "Current Version" column for all packages
2. Parse "Version at Validation" column
3. Identify mismatches (triggers ⚠️ status)
4. Find which memory files are affected ("Memory File" column)
5. Trigger Layer 1 validation procedure

#### Layer 3: Future Automation (Deferred)

**Scope**: Automation tools to detect drift automatically
- Pre-commit hook comparing package.json to validation table
- MCP extension for drift detection
- CI validation commenting on PRs when upgrades detected

**Rationale for deferral**:
- Layer 1 + 2 solve 80% of problem
- Automation useful when pattern count grows in Phase 2+
- Can implement later without restructuring Layer 1/2

**Implementation Order**:
1. Add Layer 1 to `.ruler/AGENTS.md` (Memory System section)
2. Add Layer 2 to `docs/tech-stack.md` (new section at end)
3. Populate validation table with current memory system patterns
4. Cross-reference in memory files
5. Validate agent can parse table and follow procedure

**Success Criteria**:
- ✅ Agent can identify when package upgrade requires pattern validation
- ✅ Agent knows which memory files to check for affected patterns
- ✅ Agent has clear procedure for validation (Context7, Exa, flag for review)
- ✅ Validation table structure supports future automation
- ✅ Human review required for all pattern changes (safety gate)

**Notes**:
- User feedback: "Always flag for human review when patterns outdated or breaking changes"
- User feedback: "Layer 2 must support agents parsing versions and detecting mismatches"
- This is meta-infrastructure for the memory system itself
- Prevents accumulation of outdated institutional knowledge
- **Implementation deferred**: User requested completing all other documentation cleanup tasks first

---

### Task 4.9: Create Critical Rules Quickstart Section
**Status**: ⏳ Pending
**Priority**: High
**Dependencies**: Task 0.1 (oRPC Cleanup)

**Checklist**:
- [ ] Create short "Critical Rules Quickstart" section
- [ ] Place at or near top of AGENTS.md (high visibility)
- [ ] Include non-negotiable rules that agents frequently violate
- [ ] Add links to full sections for each rule
- [ ] Keep extremely concise (max 10 lines)

**Target Content**:
```markdown
## ⚠️ CRITICAL RULES - READ FIRST

**These rules are NON-NEGOTIABLE. Violations cause immediate failures.**

1. **NEVER edit `CLAUDE.md`** - Only edit `.ruler/AGENTS.md` (see: Agent Rules File Management)
2. **NEVER commit unless explicitly requested** - Users control commit timing (see: Git Commit Policy)
3. **ALWAYS use `pnpm exec nx` commands** - Never npm, never yarn (see: Essential Commands)
4. **ALWAYS use sub-agents for research** - Preserve context (see: Sub-Agent Usage Policy)
5. **ALWAYS read memory system before `nx g` commands** - Prevent pattern drift (see: Memory System)
6. **MANDATORY READ before testing work** - Jest is very problematic (see: Jest & Testing Configuration)

Violating these rules leads to: broken commits, pattern drift, version conflicts, CI failures, and rework.
```

**Notes**:
- Reviewer feedback: "Put Non-negotiable Rules Quickstart at top"
- Improves discoverability of critical rules
- Acts as safety net before agents dive into detailed sections
- Must be impossible to miss
---

## Phase 5: Validation

### Task 5.1: Quality Validation
**Status**: ⏳ Pending
**Priority**: Critical
**Dependencies**: Task 4.8 (Changes Applied)

**Checklist**:
- [ ] Read condensed AGENTS.md end-to-end
- [ ] Verify all CRITICAL sections remain intact
- [ ] Verify MANDATORY READ triggers are strong and unmissable
- [ ] Check cross-references work (files exist and are correct)
- [ ] Ensure architectural constraints preserved
- [ ] Confirm behavioral rules unchanged
- [ ] Test ambiguity: Can agent follow instructions without reading removed sections?

**Validation Questions**:
1. Can an agent understand Nx/pnpm rule from condensed commands?
2. Will an agent read testing-reference.md before Jest work (trigger strong enough)?
3. Is file tree emphasis on blueprint/constraint clear?
4. Is version pinning policy unambiguous?
5. Are all memory file references bidirectional and correct?

**Notes**:
- User priority: Quality over size reduction
- If quality compromised, revert and revise

---

### Task 5.2: Reduction Target Validation
**Status**: ⏳ Pending
**Priority**: Medium
**Dependencies**: Task 4.8 (Changes Applied)

**Checklist**:
- [ ] Count original `.ruler/AGENTS.md` lines/characters
- [ ] Count condensed `.ruler/AGENTS.md` lines/characters
- [ ] Calculate reduction percentage
- [ ] Verify ~30% reduction achieved (25-35% acceptable)
- [ ] Document reduction metrics

**Metrics to Track**:
- Original line count: _____
- Condensed line count: _____
- Reduction: _____%
- Original character count: _____
- Condensed character count: _____
- Reduction: _____%

**Notes**:
- Target: ~30% reduction
- Acceptable range: 25-35%
- Quality > hitting exact target

---

### Task 5.3: User Review
**Status**: ⏳ Pending
**Priority**: Critical
**Dependencies**: Task 5.1, Task 5.2

**Checklist**:
- [ ] Present condensed AGENTS.md to user
- [ ] Present reduction metrics
- [ ] Present quality validation results
- [ ] Present list of all new/updated files
- [ ] Request user review and approval
- [ ] Address any user feedback
- [ ] Make revisions if needed
- [ ] Get final approval

**Deliverables for Review**:
1. Updated `.ruler/AGENTS.md` (via Ruler → `CLAUDE.md`)
2. New `docs/memories/testing-reference.md`
3. New `docs/memories/troubleshooting.md`
4. New `docs/tech-stack.md`
5. Updated `docs/memories/README.md`
6. Updated root `README.md`
7. Reduction metrics and quality validation report

**Notes**:
- User has final approval
- Be prepared for revision requests
- Document any additional requirements

---

## Progress Tracking

**Overall Status**: 🟡 In Progress

**Phase Completion**:
- Phase 0 (Pre-Flight Cleanup): 1/1 tasks ✅ **COMPLETE**
- Phase 1 (Verification & Analysis): 3/3 tasks ✅ **COMPLETE**
- Phase 2 (New Documentation): 3/3 tasks ✅ **COMPLETE**
- Phase 3 (Memory System Updates): 0/2 tasks ⏳
- Phase 4 (AGENTS.md Condensation): 0/10 tasks ⏳
- Phase 5 (Validation): 0/3 tasks ⏳

**Total**: 7/22 tasks complete (32%)

---

## Notes & Decisions

### User Feedback Summary (8-Point Analysis)

1. **Common Commands**: Keep Nx/pnpm rule, condense with pointer → Task 4.1
2. **Troubleshooting**: Move to memory file, keep Windows Jest hanging → Task 2.2, Task 4.3
3. **Jest Configuration**: Move to memory file with STRONG triggers → Task 2.1, Task 4.2
4. **Coverage Testing**: Same as #3 → Task 2.1, Task 4.2
5. **Technology Stack**: Create separate detailed doc, keep high-level → Task 2.3, Task 4.5
6. **File Tree**: Keep as blueprint, go one level deeper → Task 4.4
7. **Development Workflow**: Keep as-is (architectural constraint) → Task 4.6
8. **Testing Strategy**: Keep guardrails regardless of approach → Task 4.7

### Key Principles to Remember

- **"Quality over size reduction"** - 30% is fine, not 50%
- **"These sections exist due to painful agent failures"** - don't remove guardrails
- **"Jest/testing is very problematic area"** - requires STRONG triggers
- **"File tree IS the blueprint"** - not just documentation
- **"Agents need pinned versions or go off the rails"**
- **"Ensure agents actually read memory files"** - MANDATORY READ language

### Risk Areas

- **Testing/Jest section condensation** - Most critical, most problematic domain
- **Version pinning clarity** - Agents "go off the rails" without clear versions
- **MANDATORY READ triggers** - If too weak, agents skip and fail
- **File tree blueprint emphasis** - Must be unmistakable as constraint

### Success Criteria

**Primary (Quality-First)**:
✅ All quality validation checks pass
✅ Architectural constraints preserved
✅ Behavioral rules unchanged
✅ No critical information lost
✅ MANDATORY READ triggers are strong and unmissable
✅ Rules adherence improved (Critical Rules Quickstart added)

**Secondary (Documentation)**:
✅ All new memory files created and referenced
✅ All cross-references bidirectional and correct
✅ Command consistency achieved across all docs
✅ oRPC → REST+OpenAPI cleanup complete

**Tertiary (Metrics)**:
✅ ~30% reduction achieved (25-35% acceptable)
✅ User approval obtained

**Ordering Rationale**: Quality and agent output improvements take priority over size reduction targets.

---

### Additional Reviewer Feedback

**Source**: External agent review of initial plan

**Key Additions**:
1. **Non-negotiable Rules Quickstart** - Add high-visibility section at top of AGENTS.md with 6 critical rules
2. **oRPC → REST+OpenAPI consistency** - Clean up leftover references from previous architecture
3. **Quality-first objective framing** - Reorder success criteria to prioritize quality over metrics
4. **Command pattern standardization** - Ensure consistent Nx command patterns across all documentation

**Implementation**:
- Added Phase 0 (Task 0.1) for oRPC cleanup
- Added Task 4.9 for Critical Rules Quickstart
- Reordered success criteria to emphasize quality
- Updated all target content to use REST+OpenAPI terminology

---

## Change Log

- **2025-10-27 (Update 2)**: Added Phase 0 for oRPC cleanup, Task 4.9 for Critical Rules Quickstart, reordered success criteria to prioritize quality
- **2025-10-27 (Update 1)**: Initial working document created with 19 tasks across 5 phases
- **Current**: 21 tasks across 6 phases (0 → 5)
