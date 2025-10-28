

<!-- Source: .ruler/AGENTS.md -->

# AI AGENT RULES

This file provides guidance to all AI agents when working with code in this repository.

## ⚠️ CRITICAL RULES - READ FIRST

**These rules are NON-NEGOTIABLE. Violations cause immediate failures.**

1. **NEVER edit `CLAUDE.md`** - Only edit `.ruler/AGENTS.md` (see: Agent Rules File Management)
2. **NEVER commit unless explicitly requested** - Users control commit timing (see: Git Commit Policy)
3. **ALWAYS use `pnpm exec nx` commands** - Never npm, never yarn (see: Essential Commands)
4. **ALWAYS use sub-agents for research** - Preserves context AND provides diverse perspectives that enrich analysis and improve decisions through orchestrated intra-agent discussion (see: Sub-Agent Usage Policy)
5. **ALWAYS read memory system before `nx g` commands** - Prevent pattern drift (see: Memory System)
6. **MANDATORY READ before testing work** - Jest is very problematic (see: Jest & Testing Configuration)

Violating these rules leads to: broken commits, pattern drift, version conflicts, CI failures, and rework.

---

## CRITICAL: Agent Rules File Management

**🚨 STRICT RULE - DO NOT VIOLATE 🚨**

This project uses [Ruler](https://github.com/intellectronica/ruler) to manage AI agent instructions.

**NEVER edit `CLAUDE.md` directly!**

- **Source of truth**: `.ruler/AGENTS.md` (this file)
- **Generated output**: `CLAUDE.md` (auto-generated from Ruler)
- **Your responsibility**: ALWAYS update `.ruler/AGENTS.md`, never `CLAUDE.md`

**When you need to update agent instructions:**

✅ **DO**: Edit `.ruler/AGENTS.md`
✅ **DO**: Let Ruler propagate changes to `CLAUDE.md` automatically
✅ **DO**: Treat `CLAUDE.md` as read-only documentation

❌ **NEVER**: Edit `CLAUDE.md` directly
❌ **NEVER**: Suggest changes to `CLAUDE.md`
❌ **NEVER**: Assume `CLAUDE.md` is the source file

**Why this matters:**
- Manual edits to `CLAUDE.md` will be overwritten when Ruler regenerates it
- Changes must be made at the source (`.ruler/AGENTS.md`) to persist
- This keeps agent rules maintainable and version-controlled

**If you catch yourself about to edit `CLAUDE.md`**: STOP and edit `.ruler/AGENTS.md` instead.

---

## CRITICAL: Git Commit Policy

**🚨 STRICT RULE - DO NOT VIOLATE 🚨**

**NEVER create git commits unless explicitly instructed by the user.**

**When commits are allowed:**
- ✅ User explicitly requests: "commit these changes", "create a commit", etc.
- ✅ Task description explicitly includes committing as a step
- ✅ Slash command explicitly instructs you to commit
- ✅ Plan/checklist explicitly includes commit step

**When commits are FORBIDDEN:**
- ❌ After completing work (unless commit was requested)
- ❌ "Being helpful" by committing completed work
- ❌ Following git best practices to "commit early and often"
- ❌ Because changes are ready to commit
- ❌ Any situation where commit was not explicitly requested

**Why this matters:**
- User may want to review changes before committing
- User may want to adjust commit message
- User may want to stage changes selectively
- Taking initiative to commit removes user control

**If you catch yourself about to run `git commit`**: STOP and ask the user if they want you to commit.

## Sub-Agent Usage Policy

**Applies ONLY to agents capable of sub-agent use**, eg. **Claude Code**!

**IMPORTANT:** You MUST proactively use sub-agents to preserve context and accelerate execution. Sub-agents are your primary tool for delegatable work.

### Mandatory Sub-Agent Usage

Launch sub-agents for ANY of the following tasks:

#### 1. Codebase Research & Analysis

- Searching for files, functions, classes, or patterns
- Understanding unfamiliar code structure or architecture
- Finding all usages or references to a symbol
- Analyzing dependencies or imports across multiple files
- Reading and summarizing large files (>200 lines)

#### 2. External Research

- Fetching documentation (web searches, Context7, library docs)
- Researching solutions to errors or problems
- Gathering information about tools, frameworks, or best practices
- Comparing multiple approaches or solutions

#### 3. Parallel Task Execution

- Multiple independent investigations
- Testing different hypotheses simultaneously
- Gathering information from multiple sources
  concurrently

#### 4. Deep Troubleshooting

- Root cause analysis requiring multiple investigation paths
- Systematic exploration of 3+ potential causes
- Building comprehensive understanding before taking action

### Implementation Rules

1. **Default to delegation**: When deciding between doing research yourself vs. using a sub-agent, ALWAYS choose the sub-agent
2. **Parallel execution**: Launch multiple sub-agents in a single message whenever tasks are independent
3. **Context preservation**: Reserve your context window for synthesis, decision-making, and implementation
4. **Explicit over implicit**: Even "simple" searches should use sub-agents if they might require iteration

### Examples

✅ **DO**: Launch sub-agent to find all files importing a specific module
✅ **DO**: Use parallel sub-agents to research 4 potential root causes
✅ **DO**: Delegate web documentation fetching while you plan implementation
✅ **DO**: Have sub-agent read and summarize large configuration files

❌ **DON'T**: Manually use Grep/Glob for exploratory searches that might need refinement
❌ **DON'T**: Read multiple files yourself when a sub-agent could analyze them
❌ **DON'T**: Sequentially search for information that could be gathered in parallel
❌ **DON'T**: Consume your context with research when implementation work is pending

### Efficiency Guideline

Before using Grep, Glob, Read, or WebSearch yourself, ask: "Could a sub-agent do this while I focus on higher-level work?" If yes, use a sub-agent.

---

## Memory System (CRITICAL - Prevents Pattern Drift)

**Purpose**: Prevent pattern drift across components and ensure consistency as the monorepo evolves.

**Location**: `docs/memories/` directory

### Mandatory Memory Checks

**1. Before `nx g` (generate) commands:**
- **MUST READ**: `docs/memories/adopted-patterns.md` - monorepo standards that override framework defaults
- **MUST READ**: `docs/memories/post-generation-checklist.md` - mandatory post-generation fixes
- **Why**: Ensure generated code will match our established patterns

**2. After `nx g` commands:**
- **MUST EXECUTE**: ALL steps in `docs/memories/post-generation-checklist.md`
- **MUST VALIDATE**: Output against `docs/memories/adopted-patterns.md`
- **Why**: Auto-generated code often conflicts with our monorepo standards

**3. Before changing build/test/TypeScript configs:**
- **MUST CHECK**: `docs/memories/adopted-patterns.md` - established configuration patterns
- **MUST CHECK**: `docs/memories/tech-findings-log.md` - technical constraints and empirical findings
- **Why**: Avoid reverting intentional architectural decisions

### Memory Files Quick Reference

- **`adopted-patterns.md`**: How WE do it (test location, TypeScript config, Jest patterns)
- **`post-generation-checklist.md`**: Mandatory fixes after Nx generators
- **`tech-findings-log.md`**: Technical decisions, constraints, troubleshooting findings
- **`README.md`**: Comprehensive memory system documentation

### Critical Warning

**⚠️ Failure to follow memory system = Pattern drift across monorepo**

Example consequences:
- Web app uses co-located tests in `src/`, mobile uses `__tests__/` (inconsistency)
- Old components work, new components fail with mysterious errors (config drift)
- Same problem solved differently in different components (wasted time)

**For comprehensive memory system documentation**: Read `docs/memories/README.md`

### Documentation File Editing Rules

**CRITICAL: NEVER modify timestamp fields in `docs/` files**

When editing any file in `docs/` or its subfolders:

❌ **NEVER edit these frontmatter fields:**
- `Modified:` - Automatically managed by Git
- `Created:` - Set once, never changed


**Why this matters:**
- `Modified:` is automatically updated by tooling on every file save
- Manual edits create confusion and will be immediately overwritten
- This applies to ALL files in `docs/` and all subfolders

**Example - What to update:**
```yaml
---
title: Some Document
purpose: Brief description of document purpose
audience: AI agents, developers, architects
created: 2025-10-21
last-updated: 2025-10-21  # ✅ Update this when making semantic changes
Created: 2025-10-21T14:39  # ❌ NEVER touch - auto-managed
Modified: 2025-10-21T14:39  # ❌ NEVER touch - auto-managed
---
```

---

## Project Overview

This is a **gold standard Nx monorepo template** designed as a production-ready foundation for multi-platform applications. The project uses a "walking skeleton" approach to validate infrastructure and tooling before feature development.

**Current State**: Phase 1 Stage 2 complete - Full infrastructure validated:
- ✅ Next.js web application with Playwright E2E tests
- ✅ Express server application with REST+OpenAPI
- ✅ Four shared packages: database (Prisma), schemas (Zod), api-client (REST+OpenAPI), supabase-client
- ✅ Complete QA infrastructure: Jest, ESLint, Prettier, CI/CD
- ⏳ In progress: QA infrastructure (Husky, lint-staged), Supabase configuration

**Architecture Goal**: Production-ready monorepo template demonstrating best practices for:
- Cross-platform type safety (web, server, future mobile)
- Shared business logic via buildable libraries
- End-to-end type safety with REST+OpenAPI
- Database-first development with Prisma + Supabase
- Comprehensive testing strategy (unit, integration, E2E)

**Reference Document**: Always check `docs/P1-plan.md` for the current implementation plan, stage progress, and success criteria.

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

## Essential Commands

**CRITICAL: This is an Nx monorepo using pnpm**
- Always use `pnpm exec nx` commands (never npm, never yarn)
- Workspace scripts: See root `package.json` for `pnpm run` shortcuts
- Full command reference: See `README.md` section "Common Commands"

**Key patterns**:
- Single project: `pnpm exec nx run <project>:<target>`
- Multiple projects: `pnpm exec nx run-many -t <target>`
- Affected only: `pnpm exec nx affected -t <target>`

## Architecture Guidelines

### Monorepo Structure (ARCHITECTURAL BLUEPRINT)

**IMPORTANT**: This structure is a constraint/blueprint, not documentation. Generated projects MUST follow this architecture.

```
apps/
  web/                    # Next.js web application
    src/
      app/                # Next.js App Router pages
        page.tsx          # Home page
        layout.tsx        # Root layout
      components/         # React components (co-located tests)
        *.spec.tsx        # Component tests
    project.json          # Nx project configuration
    jest.config.ts        # Jest configuration
    tsconfig.json         # TypeScript config (production)
    tsconfig.spec.json    # TypeScript config (tests)
    next.config.js        # Next.js configuration
  web-e2e/                # Playwright E2E tests for web
    src/
      *.spec.ts           # E2E test specs
    playwright.config.ts  # Playwright configuration
  server/                 # Express API server
    src/
      main.ts             # Server entry point
      routes/             # REST+OpenAPI endpoints
    project.json
    jest.config.ts
    tsconfig.json

packages/                 # Shared libraries (buildable)
  database/               # Prisma client + database utilities
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
    project.json
  api-client/             # REST API client
    src/index.ts
    project.json
  supabase-client/        # Supabase client configuration
    src/index.ts
    project.json
```

### Dependency Flow

The architecture follows a strict unidirectional dependency flow:

```
apps (web, mobile) → api-client → schemas
                      ↓
apps (server) → database → schemas
                ↓
            supabase-client
```

**Rules**:
- Applications depend on packages, never the reverse
- Packages can depend on other packages, but no circular dependencies
- All packages must be buildable libraries with proper TypeScript compilation
- Use `nx graph` to verify dependency structure remains clean

### Package Naming Convention

All packages use the scoped naming pattern: `@nx-monorepo/<package-name>`

When importing across projects:
```typescript
// Import from another project
import { createApiClient } from '@nx-monorepo/api-client';
import { userSchema } from '@nx-monorepo/schemas';
import { prisma } from '@nx-monorepo/database';
```

TypeScript path aliases are configured in `tsconfig.base.json` and managed automatically by Nx.

### Shared Libraries

When creating shared packages:
- Use `nx g @nx/js:library` for TypeScript-only packages with `--bundler=tsc` for buildable libraries
- Use `nx g @nx/node:library` for Node.js-specific packages with `--bundler=tsc` for buildable libraries
- Always specify a bundler explicitly (`--bundler=tsc`, `--bundler=swc`, `--bundler=none`)
- Export a clean public API via `index.ts` barrel files
- Never export implementation details, only public interfaces
- **Special case - Prisma packages**: Use `@nx/js:lib` with `--bundler=none` for packages containing Prisma (see `docs/memories/tech-findings-log.md` - Database Package Bundler Strategy for rationale)

### Type Safety

- **Strict TypeScript**: All projects use `strict: true`
- **Schema-first**: Define Zod schemas in `@nx-monorepo/schemas`, derive TypeScript types
- **End-to-end types**: REST+OpenAPI provides type safety via generated TypeScript types from OpenAPI spec
- **No type assertions**: Prefer proper typing and validation over `as` casting
- **Shared types**: Never duplicate type definitions - centralize in `schemas` package

## Development Workflow

### Adding a New Feature

1. **Define schemas first**: Add Zod schemas to `@nx-monorepo/schemas`
2. **Implement database layer**: Add Prisma models and queries to `@nx-monorepo/database`
3. **Create server endpoints**: Add REST endpoints with OpenAPI spec in `apps/server`
4. **Update API client**: Regenerate TypeScript types from OpenAPI spec using `openapi-typescript`
5. **Implement UI**: Build features in `apps/web` and/or `apps/mobile`
6. **Write tests**: Add unit tests (packages), integration tests (server), E2E tests (apps)

### Before Committing

The project uses Husky pre-commit hooks to maintain code quality:

**What runs automatically:**
- **lint-staged**: Runs ESLint and Prettier on staged files only
- **Affected tests**: Runs tests only for projects affected by your changes (via `nx affected -t test --base=HEAD~1`)
- **OS-conditional test execution**: Web app tests excluded on Windows due to Jest hanging issue
- Commits are blocked if any checks fail

**Pre-commit hook optimization:**
```bash
# .husky/pre-commit
pnpm exec lint-staged
NX_DAEMON=false pnpm exec nx affected -t test --base=HEAD~1

**Why `nx affected` instead of all tests:**
- ✅ Faster commits: Only runs tests for changed code
- ✅ Scales with monorepo growth: Performance stays consistent as projects are added
- ✅ Immediate feedback: Catches regressions before commit
- ✅ CI safety net: Full test suite still runs in GitHub Actions

**Windows-specific behavior:**
- Web app tests are excluded from pre-commit due to Jest hanging issue (see Troubleshooting section)
- Developers should manually run `pnpm exec nx run web:test` before pushing
- CI runs full test suite (including web) on Linux, providing safety net

**Manual quality checks (if hooks disabled):**
```bash
pnpm exec nx affected -t lint test build
```

### Creating Shared Code

When you need to share code between projects:

1. **Determine package location**: Does it belong in an existing package or need a new one?
2. **Generate library if needed**:
   ```bash
   pnpm exec nx g @nx/js:library my-new-lib --directory=packages/my-new-lib --bundler=tsc
   ```
3. **Implement and export**: Add code and export via `index.ts`
4. **Update dependents**: Import from `@nx-monorepo/my-new-lib`
5. **Verify build**: Run `pnpm exec nx run my-new-lib:build` to ensure it compiles
6. **Check graph**: Run `pnpm exec nx graph` to verify dependency structure

## Testing & Quality

**⚠️ MANDATORY READ BEFORE ANY TESTING WORK ⚠️**

Testing (especially Jest) is a **very problematic area** with version compatibility issues and complex configuration interactions.

**BEFORE you:**
- Add Jest to a new project
- Modify any `jest.config.ts`
- Modify any `tsconfig.spec.json`
- Write any tests (unit, integration, E2E)
- Troubleshoot test failures
- Change test tooling versions

**YOU MUST:**
1. **READ**: `docs/memories/testing-reference.md` - comprehensive Jest reference
2. **READ**: `docs/memories/adopted-patterns.md` - test file location standards
3. **VERIFY**: Use Context7 MCP to fetch latest official docs
4. **CROSS-CHECK**: Use web search to verify version compatibility
5. **FOLLOW**: All patterns in memory files

**Consequences of skipping**: Test failures, version conflicts, broken CI, pattern drift across projects.

---

### Testing Strategy Overview

**CRITICAL CONSTRAINT**: Tests are co-located in `src/` next to source files (`.spec.ts` or `.test.tsx`). This is OUR adopted standard following Next.js 15 conventions, NOT framework default.

**Three-tier approach**:
- **Unit Tests (Jest)**: Isolated component/function testing in `src/` (target: ≥80% coverage)
- **Integration Tests (Jest)**: Cross-layer interactions (e.g., endpoint → database) in `src/`
- **E2E Tests (Playwright)**: Full browser-based user journeys in `apps/web-e2e/src/`

**For complete details**, see `docs/memories/testing-reference.md`:
- Test file location patterns and configuration examples
- Unit/Integration/E2E guidelines with code examples
- Jest configuration patterns (workspace preset, project-level, TypeScript)
- Coverage testing (scripts, thresholds, reports, directory structure)

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on all PRs and main branch commits:

1. Install dependencies with `npm ci --legacy-peer-deps`
2. Install Playwright browsers
3. Run: `pnpm exec nx run-many -t lint test build typecheck e2e`
4. Execute `pnpm exec nx fix-ci` if failures occur (self-healing CI)

**Nx Cloud Integration**: Enabled (`nxCloudId` in `nx.json`) for distributed caching and task distribution.

To enable distributed task execution in CI, uncomment the `nx start-ci-run` line in the workflow.

## External Services

### Nx Cloud (active, not completely configured)
- Remote caching across team and CI
- Distributed task execution
- CI analytics and insights
- Dashboard: https://cloud.nx.app

### Sentry (planned)
- Error tracking and performance monitoring
- Configure in server and web apps
- Test with intentional error triggers

### CodeRabbit (implemented)
- Automated PR reviews
- Configuration: `coderabbit.yaml`
- Respects Nx structure and boundaries

### Dependabot (implemented)
- Automated dependency updates
- Configuration: automatic (Github side)
- Monitors all package manifests

## Phase 1 Implementation

**Current Phase**: Walking Skeleton (validating infrastructure)

**Stages**:
0. ✅ Current State Audit - Verify existing web app works
1. ✅ Generate Server Application
2. ✅ Generate Shared Packages - Create database, schemas, api-client, supabase-client
3. ⏳ [In progress] QA Infrastructure - Set up Husky, lint-staged, pre-commit hooks
4. ⏳ Configure Infrastructure - Set up Supabase + Prisma
5. ⏳ Implement Walking Skeleton - Minimal health check feature end-to-end
6. ⏳ Complete Testing & External Services - E2E tests, Sentry, final validation

**Success Criteria**: A new developer can clone, install, build, and run the full stack with a working health check feature flowing through all layers.

**See `docs/P1-plan.md` for detailed stage breakdowns and checklists.**

## Troubleshooting

### Jest Exits Slowly or Hangs (Windows)

**Symptom**: Jest prints "did not exit one second after the test run" or shows "Terminate batch job (Y/N)?".

**Important**: The root cause is not fully understood. Multiple factors may contribute to this issue, and different combinations of flags may both cause AND resolve the hanging behavior. What works today may not work tomorrow if other factors change.

**Systematic Troubleshooting Approach**:

When tests hang, try solutions in this order:

1. **First, try disabling Nx daemon** (simplest):
   ```bash
   NX_DAEMON=false pnpm exec nx run-many -t test
   ```
   - Empirically tested: ✅ Works (2025-10-20)
   - Retains Nx Cloud remote caching
   - Only affects the specific command execution

2. **If that doesn't work, try disabling Nx Cloud**:
   ```bash
   pnpm exec nx run-many -t test --no-cloud
   ```
   - Empirically tested: ✅ Works (2025-10-20)
   - Keeps daemon running for workspace graph operations
   - Disables remote cache for this run

3. **If both individually fail, combine them**:
   ```bash
   NX_DAEMON=false pnpm exec nx run-many -t test --no-cloud
   ```

4. **For deep diagnosis (not a fix)**:
   ```bash
   pnpm exec nx run web:test -- --runInBand --detectOpenHandles
   ```
   - Does not list handles by itself
   - Use `why-is-node-running` package if you need detailed handle info

5. **Emergency workaround (validation only, never commit)**:
   ```bash
   pnpm exec nx run web:test -- --forceExit
   ```

**Observations**:
- Environment/tooling sockets may linger after test completion (Nx daemon, Nx Cloud connection)
- Not a test code leak - tests pass successfully
- May be triggered by various state/caching conditions
- Both `NX_DAEMON=false` and `--no-cloud` independently resolved hanging in testing (2025-10-20)
- Behavior may vary based on system state, cached artifacts, or Nx version

**For CI/CD**:
- Linux/Mac environments typically don't exhibit this issue
- Use standard commands in CI: `pnpm exec nx run-many -t test`

---

### Other Issues

For comprehensive troubleshooting of:
- Nx cache issues
- TypeScript path resolution
- Build failures
- Test failures (non-Jest-specific)
- Prisma issues

**READ**: `docs/memories/troubleshooting.md`

## Important Notes

- **Check technical findings first**: Before suggesting architecture, tooling, or configuration changes, review `docs/memories/tech-findings-log.md` for documented decisions, known issues, and empirical findings that may prevent rework
- **Check architecture decisions**: Before suggesting framework or technology changes, review `docs/architecture-decisions.md` for strategic choices with rationale (REST+OpenAPI, Supabase+Prisma, monorepo structure, etc.)
- **Always use pnpm and Nx commands** (`pnpm exec nx run`, `pnpm exec nx run-many`, `pnpm exec nx affected`) instead of direct tool invocation (e.g., use `pnpm exec nx run web:build` not `cd apps/web && next build`)
- **Use workspace scripts for common tasks**: Prefer `pnpm run dev`, `pnpm run build`, etc. for daily development
- **Respect project boundaries**: Don't import from `apps/*` into `packages/*`
- **Use Nx MCP tools**: When working with Claude Code, use `nx_workspace`, `nx_project_details`, and `nx_docs` tools for up-to-date information
- **Phase 1 priority**: Validate infrastructure before adding features - don't implement POC features until walking skeleton is complete

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

# CI Error Guidelines

If the user wants help with fixing an error in their CI pipeline, use the following flow:
- Retrieve the list of current CI Pipeline Executions (CIPEs) using the `nx_cloud_cipe_details` tool
- If there are any errors, use the `nx_cloud_fix_cipe_failure` tool to retrieve the logs for a specific task
- Use the task logs to see what's wrong and help the user fix their problem. Use the appropriate tools if necessary
- Make sure that the problem is fixed by running the task that you passed into the `nx_cloud_fix_cipe_failure` tool


<!-- nx configuration end-->
