# Gold Standard Nx Monorepo Template Constitution

<!--
Sync Impact Report
Version: 1.0.0 (refined before production use)

Modified principles:
- I. Test-First Development → I. Test-Driven Development - AI-Adapted
  (Clarified TDD discipline adapted for AI coding workflows with scope-appropriate cycles)
- IV. Documentation and Memory System Alignment → IV. Memory System and Continuous Knowledge Capture
  (Merged continuous knowledge capture into memory system principle to eliminate duplication)
- VIII. Version Pinning and Dependency Discipline
  (Removed specific version numbers; now references docs/tech-stack.md as single source of truth)

Added principles:
- IX. Business-Accessible Code Communication (ensures stakeholder-readable code with business + technical context)

Removed principles:
- IX. Continuous Knowledge Capture (merged into Principle IV to eliminate redundancy)

Structural changes:
- Removed file enumerations from Principle IV (references docs/memories/README.md instead)
- Removed Development Workflow subsections: Git Commit Policy, Sub-Agent Usage Policy, Agent Rules
  (These duplicate AGENTS.md; added brief Operational Context reference instead)
- Updated Authority and Cross-References to use generic directory references (no hard-coded file lists)

Rationale for changes:
- Eliminate duplication between constitution and AGENTS.md (agents always read both)
- Single source of truth for operational details (file lists, version numbers)
- Focus constitution on principles and quality gates, not operational procedures
- Reduce maintenance burden (file additions don't require constitution updates)

Templates requiring updates:
- ✅ .specify/templates/plan-template.md (verified - uses generic constitution references)
- ✅ .specify/templates/spec-template.md (verified - no conflicts)
- ✅ .specify/templates/tasks-template.md (verified - no conflicts)

Related updates:
- ✅ .ruler/AGENTS.md updated with elevated MCP server guidance (Sequential Thinking, Vibe-Check prominence)
-->

## Core Principles

### I. Test-Driven Development - AI-Adapted (NON-NEGOTIABLE)

*Traditional TDD adapted for AI coding workflows while maintaining core testing discipline.*

**Core Requirements:**
- Write ALL tests for a feature BEFORE writing implementation code
- Run tests to verify they fail (Red phase - proves tests are valid)
- Implement feature to make tests pass (Green phase)
- Refactor during code review cycle
- No code ships without corresponding tests

**AI-Adapted Practices:**
- **Batch test writing**: Write complete test suite for feature at once (not one test at a time)
- **Complete implementations**: Implement full feature after tests exist (not minimal code increments)
- **Scope-appropriate cycles**: Determine TDD cycle boundary based on task scope and natural code boundaries. Small tasks (button component, utility function) may use single cycle. Large tasks (authentication system, multi-endpoint feature) should break into multiple cycles.
- **Explicit cycle declaration**: State your chosen scope before starting ("I'll implement this as a single TDD cycle covering X, Y, Z" or "I'll break this into 3 TDD cycles: authentication, authorization, session management")
- When task scope is ambiguous, prefer smaller cycles (component/feature level) over larger ones (epic level)

**Mandatory Testing Stack:**
- Jest + jest-dom + user-event + MSW for UI packages (web, mobile)
- Co-located tests in `src/` directory next to source code (Pattern 1)
- Coverage thresholds: 10% during Phase 1 (infrastructure), 80% in Phase 2+ (features)

**Implementation:**
- Pre-commit hooks (`NX_DAEMON=false pnpm exec nx affected -t test`) enforce test execution before commit
- Testing patterns documented in `docs/memories/testing-reference.md`
- TDD cycle boundaries must be declared explicitly before implementation

**Rationale:** Maintains TDD's core value (tests prove intent before implementation) while adapting mechanics to AI agent's batch-oriented, complete-implementation workflow. Enables AI agents to work naturally while enforcing testing discipline.

### II. Quality Gates (NON-NEGOTIABLE)

- Run the full quality-gates suite before any commit or pull request and attach command outputs to delivery notes.
- The suite must at minimum cover lint, formatting verification, type checking, unit coverage, integration flows, and E2E smoke tests using project thresholds.
- Bypassing, deferring, or silently retrying failed gates is prohibited; surface blockers immediately for remediation.

**Implementation:**
- Pre-commit: `lint-staged` + `pnpm exec nx affected -t test --base=HEAD~1` (only changed projects)
- CI: `pnpm exec nx run-many -t lint test build typecheck e2e` (full validation)
- Coverage thresholds enforced via Jest configuration in each project
- Husky hooks block commits with failures (cannot bypass without explicit override)

**Rationale:** Quality enforced by tooling infrastructure, not developer discipline. Automated gates scale consistently as monorepo grows.

### III. Verification Before Completion (NON-NEGOTIABLE)

- Produce verification notes that document executed commands, success and failure scenarios, and the resulting outputs.
- Use factual language only, highlight residual risks when full verification is impossible, and escalate unresolved gates immediately.
- Attempt at least four remediation cycles (identify blocker → attempt fix → rerun gates → re-verify) before declaring failure, then report outstanding blockers.
- ADMIT FAILURE RATHER THAN PREMATURELY CLAIMING SUCCESS; never claim 100% certainty without comprehensive verification.

**Implementation:**
- Validation commands documented in `docs/memories/post-generation-checklist.md`
- Each pattern in `adopted-patterns.md` includes verification steps
- CI outputs serve as evidence for merge decisions

**Rationale:** Evidence-based completion prevents false confidence and "looks good" approvals. Explicit verification builds trust in deliverables.

### IV. Memory System and Continuous Knowledge Capture (NON-NEGOTIABLE)

- ALWAYS read `docs/memories/adopted-patterns.md` before running `nx g` commands to understand monorepo standards
- Execute ALL steps in `docs/memories/post-generation-checklist.md` after code generation (mandatory, not optional)
- Document technical decisions, constraints, and discoveries immediately in appropriate memory files (don't rely on human memory)
- Link patterns to architectural decisions for traceability
- Update memory files when patterns evolve or new constraints are discovered
- NEVER edit `CLAUDE.md` directly; only update `.ruler/AGENTS.md` (source file for Ruler generation)
- Each new or updated memory MUST cite the governing `docs/` artefact (document + section) and explain how the content aligns with that canonical guidance before it is proposed or merged

**Implementation:**
- Memory system - ZDX Cogno - located in `docs/memories/` directory (complete structure documented in `docs/memories/README.md`)
- Use `docs/index.md` to locate the governing artefact(s) in `docs/` before drafting or updating memories.
- Each file has specific purpose: patterns, checklists, technical findings, testing reference, troubleshooting
- Agent instructions: `.ruler/AGENTS.md` (source, editable) → `CLAUDE.md` (generated, read-only)
- Document WHY (rationale, constraints) not just WHAT (patterns, checklists)
- When proposing memory updates, include the canonical reference (document + section) and alignment rationale in delivery notes or review comments
- Operational procedures for memory system usage in AGENTS.md

**Rationale:** Memory system prevents pattern drift across monorepo components as project evolves. Continuous knowledge capture ensures institutional knowledge survives team changes and context loss. Makes AI agents more effective by providing persistent, searchable context that eliminates repeated discovery of same constraints.

## Monorepo Architecture Standards

### V. Type Safety End-to-End

- Define API contracts as Zod schemas in `@nx-monorepo/schemas` package (single source of truth).
- Generate OpenAPI specification from Zod schemas using `@asteasolutions/zod-to-openapi` (Pattern 6).
- Generate TypeScript types from OpenAPI spec using `openapi-typescript` (Pattern 7).
- Use Prisma for database layer with PostgreSQL-specific types (`@db.Uuid`, `@db.Timestamptz`) and snake_case table naming (Pattern 8).

**Implementation:**
- Server: Zod schemas → OpenAPI spec (runtime generation) → Spectral validation
- Client: OpenAPI spec → TypeScript types → `openapi-fetch` client
- Database: Prisma schema → `@prisma/client` (runtime generation)
- All projects use TypeScript strict mode (`strict: true`)

**Rationale:** Compile-time type safety prevents runtime errors. Generated types eliminate drift between documentation and implementation.

### VI. Monorepo Standards Over Framework Defaults

- Framework generators (Nx, Next.js, Prisma) create working code but violate monorepo-wide standards.
- Post-generation checklist execution is mandatory, not optional (documented in `post-generation-checklist.md`).
- Test location must be `src/**/*.spec.ts` (co-located), not `__tests__/` or `specs/` directories.
- TypeScript module resolution must be `nodenext` for tests, `bundler` for production (Pattern 2).
- Pattern drift between components is an architectural failure requiring immediate remediation.

**Implementation:**
- After ANY `nx g` command, execute relevant checklist section
- Validation: Run `pnpm exec nx run <project>:test`, `pnpm exec nx run <project>:build`, `pnpm exec nx run <project>:lint`
- Memory system tracks adopted patterns (what), post-gen checklist enforces them (how)

**Rationale:** Consistency across 10+ monorepo projects is more valuable than individual framework convenience. Standards prevent cognitive overhead and enable AI-driven development.

### VII. Configuration-Driven Consistency

- TypeScript uses dual module resolution strategy: `bundler` for production (base config), `nodenext` for tests (Pattern 2).
- Jest uses workspace preset inheritance (`jest.preset.js`) with per-project customization (Pattern 3).
- Prisma uses PostgreSQL-specific types and explicit table mapping with `@@map()` (Pattern 8).
- Configuration files use explicit values over defaults (`.gitattributes` for line endings, `.prettierignore` with comments).

**Implementation:**
- Base configurations: `tsconfig.base.json`, `jest.preset.js`, `.gitattributes`
- Project configurations inherit and extend base (never duplicate)
- Module resolution: `moduleResolution: "bundler"` in base, `"nodenext"` in test configs
- Explicit configuration documented in `adopted-patterns.md`

**Rationale:** Configuration is architecture. Implicit defaults cause silent failures and platform-specific bugs (Windows vs. Linux).

### VIII. Version Pinning and Dependency Discipline

- Use exact pins for testing/tooling to prevent CI drift (Jest, Nx, Playwright, ESLint)
- Use tilde pins for frameworks to allow patch fixes only (TypeScript, Next.js)
- Use caret pins for stable utilities to allow minor updates (Express, Prisma)
- Maintain version synchronization for package ecosystems (all `@nx/*` packages match core, all `jest-*` packages match core)

**Implementation:**
- Complete version inventory and pinning rationale documented in `docs/tech-stack.md`
- Agents must consult `tech-stack.md` before suggesting version changes
- Pinning strategy enforced via package.json
- Dependabot monitors security patches

**Rationale:** Prevent version drift across monorepo. Pinning strategy balances stability (exact pins for tooling) with flexibility (tilde/caret for libraries). Single source of truth for versions eliminates "works on my machine" issues.

## Coding Standards & Maintainability

### IX. Business-Accessible Code Communication

- Write code that product managers and non-technical stakeholders can read and understand
- Use business-domain language in variable names, function names, and comments
- Explain business purpose AND technical implementation in comments (educate less technical users)
- Document trade-offs that affect business decisions

**Implementation:**
```typescript
// ❌ Technical-only comment (excludes stakeholders)
// Validates JWT token signature using HMAC-SHA256

// ✅ Business + Technical comment (educates everyone)
// Ensures only logged-in users can access this endpoint
// (Validates JWT authentication token signature using HMAC-SHA256)

// ❌ Technical variable names
const authZ = checkPerms(usr, rsrc);

// ✅ Business-domain names
const userCanAccessResource = validateUserPermissions(user, resource);
```

**Rationale:** Code is documentation. Business stakeholders should be able to read implementation and understand logic without reverse-engineering. Technical explanations educate less technical users while maintaining precision. Reduces communication overhead between engineering and product teams.

### X. External Validation is Mandatory (NON-NEGOTIABLE)

- All material planning and architecture decisions MUST be validated against external best practices using MCP servers (Context7, Exa, web search)
- Material changes include: new external libraries/frameworks, cross-project architecture/build/test/config changes, public API contracts or data models, security/infrastructure decisions, database schema or ORM configuration
- Plans without `research-validation.md` covering material changes are INCOMPLETE and must not proceed to implementation
- If MCP servers or web search are unavailable: immediately inform user, ask for guidance, do NOT proceed without external validation or explicit user approval

**Implementation:**
- MCP research gate in `/speckit.plan` command (Phase 0 mandatory blocker)
- Research Validation section required in `plan.md` for material changes
- Standard artifact: `specs/[feature-name]/research-validation.md` created by research agents
- CI validation enforces research-validation.md existence when spec documents modified

**Rationale:** Examining existing code alone misses critical issues. The walking skeleton retrospective proved 3 production bugs were prevented only through MCP research (REST error format anti-pattern, Prisma + Supabase configuration, error handling patterns). MCP servers provide: (1) Context7 - current official documentation, (2) Exa - real production code examples, (3) Web search - industry standards and consensus.

### XI. Governance Alignment is Mandatory (NON-NEGOTIABLE)

- All plans MUST verify alignment with existing internal governance before proposing solutions:
  - `docs/architecture-decisions.md` (strategic architectural choices)
  - `docs/memories/adopted-patterns.md` (monorepo standards and patterns)
  - `docs/tech-stack.md` (version pinning and compatibility)
  - `docs/P1-plan.md` (current phase/stage requirements)
- Plans that contradict established governance require an explicit justification that cites a governing principle and MUST include owner approval.
- Exceptions MUST be documented in a per-feature exceptions docket and are scoped, time-bound, and reviewable.

**Implementation:**
- Spec‑Kit planning workflow runs an Internal Governance Alignment gate (Phase -1) prior to external research.
- Gate outputs are recorded in the plan as a "Governance Alignment" section with statuses and any conflict resolutions.
- CI and pre‑commit hooks execute policy‑as‑code checks to prevent drift and enforce alignment.

**Rationale:** Prevents planning drift by requiring verification against institutional knowledge before design begins. Reduces rework and ensures that external research validates only new or intentionally changing areas, not already-settled decisions.

## Development Workflow

### Scope of Application

- **Current Scope**: Web (Next.js) + Server (Express) applications and shared packages (database, schemas, api-client, supabase-client)
- **Future Scope**: Mobile app principles will be incorporated in Phase 2 as part of Stage 8 implementation
- **Code changes** trigger TDD, quality gates, and evidence protocols
- **Non-code changes** (documentation, ADRs, Spec Kit artifacts) require content verification only

### Operational Context

This constitution governs code quality, design decisions, and architectural standards during feature development via Spec-Kit workflow (`/specify`, `/plan`, `/tasks`, `/implement`).

Agent operational procedures (MCP server usage, git policies, sub-agent delegation strategies, workspace commands) documented in `.ruler/AGENTS.md`.

## Governance

### Constitution Change Control

- Update `.specify/memory/constitution.md` and validate templates and prompts whenever amendments are made.
- Run a representative `/specify → /plan → /tasks` cycle after amendments to confirm new rules propagate without contradiction.
- Track version, ratification, and amendment dates, and reflect changes across dependent templates.

### Version Semantics

- **MAJOR**: Backward incompatible governance/principle removals or redefinitions
- **MINOR**: New principle/section added or materially expanded guidance
- **PATCH**: Clarifications, wording, typo fixes, non-semantic refinements

### Adoption & Compliance Oversight

- Reviewers enforce this constitution during code review, verifying TDD evidence, quality gate outputs, and documentation outlines.
- Violations escalate through corrective tasks and training updates.
- Capture friction or recurring issues in retrospectives and agent guidance files to inform future amendments and ADRs.

### Authority and Cross-References

- **Memory System**: `docs/memories/` directory (complete file structure in `docs/memories/README.md`)
- **Agent Instructions**: `.ruler/AGENTS.md` (source, editable) → `CLAUDE.md` (generated, read-only)
- **Technical Decisions**: `docs/architecture-decisions.md`
- **Version Inventory**: `docs/tech-stack.md`
- **Implementation Plan**: `docs/P1-plan.md`

**Version**: 1.0.0 | **Ratified**: 2025-10-28 | **Last Amended**: 2025-10-28
