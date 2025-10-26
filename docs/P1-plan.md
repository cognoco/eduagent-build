---
Created: 2025-10-17
Modified: 2025-10-25T21:03
Version: 1
---
# Phase 1: Walking Skeleton

## Introduction

### Purpose

This phase addresses a critical challenge in monorepo development: **how do you validate that all your infrastructure, tooling, and package versions are compatible before investing time in feature development?**

The answer is a **walking skeleton** - a minimal, end-to-end implementation that exercises the entire technical stack without implementing real features. Think of it as the monorepo equivalent of a "Hello World" that touches every layer of your architecture.

### The Problem We're Solving

It's easy to:
- ✅ Set up a Next.js app that works in isolation
- ✅ Configure Supabase and Prisma independently
- ✅ Create a Node.js server with perfect linting

But when you connect them together during actual feature development, you discover:
- ❌ Package version conflicts between web and server
- ❌ Prisma and Supabase have incompatible configurations
- ❌ Shared packages don't transpile correctly for different targets
- ❌ Build pipeline breaks when dependencies span multiple apps
- ❌ TypeScript paths don't resolve across workspace boundaries

**This phase front-loads those discoveries** so we fix infrastructure issues once, not repeatedly during POC development.

### The Walking Skeleton Approach

By the end of Phase 1, we will have:

1. **Two applications generated and validated**: Server (Express), Web (Next.js)
2. **All shared packages created**: database, schemas, api-client, supabase-client
3. **Minimal integration implemented**: One trivial feature (health check) that flows through every layer:
   - Web app → API client → Server → Database (via Prisma) → Supabase
4. **Complete QA infrastructure**: Husky, pre-commit hooks, comprehensive testing
5. **External services configured**: Sentry, NX Cloud, CodeRabbit, TestSprite (optional)

The "health check" feature is throwaway code - its only purpose is to prove the plumbing works. Once validated, we can confidently build the POC knowing the foundation is solid.

**Mobile app is deferred to Phase 2** - we validate web + server + database first, then add mobile complexity.

### Estimated Timeline

**Total: 7-11 hours** (1-1.5 days)

---

## Architecture Decisions

Before starting implementation, we need to understand the architectural relationships and make key technology choices.

### Prisma + Supabase Relationship

**Why both Prisma AND Supabase client?**

- **Prisma**: Server-side ORM for type-safe database access from Express API
  - Used exclusively in `apps/server` and `packages/database`
  - Provides schema management, migrations, and query builder
  - Connects to Supabase PostgreSQL database via connection string

- **Supabase Client**: Client-side SDK for authentication and realtime features
  - Used in `apps/web` and eventually `apps/mobile`
  - Provides authentication (login, signup, session management)
  - Provides realtime subscriptions (optional for POC)
  - **Does NOT handle CRUD operations** - those go through our API server

**Package responsibilities:**
- `packages/database`: Exports Prisma client singleton for server use
- `packages/supabase-client`: Exports auth client factory for web/mobile

### REST+OpenAPI Type Flow

**How types flow from server to client:**

1. Server defines REST endpoints with Zod validation schemas in `apps/server/src/routes/`
2. Server generates OpenAPI specification from route definitions
3. OpenAPI spec is consumed by code generation tool (`openapi-typescript`)
4. Generated TypeScript types are placed in `packages/api-client/src/generated/`
5. API client factory uses generated types to provide autocomplete for endpoints
6. Web/mobile apps get full TypeScript autocomplete for all API calls

**Type Generation Pipeline:**
```
Server Routes (Zod schemas) → OpenAPI Spec → openapi-typescript → Generated Types → API Client Factory
```

**Dependency flow:**
```
apps/web → packages/api-client → (generated types from OpenAPI spec)
apps/server → packages/database → packages/schemas
packages/api-client → packages/schemas (shared validation)
```

**Note:** API client depends on OpenAPI spec (artifact), not server code. No circular runtime dependencies.

### Architecture Decisions to Make

During Stage 4, we will explicitly decide:

- ☐ **API Architecture**: REST+OpenAPI implementation details (decided - see docs/architecture-decisions.md)
- ☐ **Supabase Strategy**: Local CLI vs cloud project
- ☐ **Migration Strategy**: Prisma Migrate vs db push
- ☐ **Connection Strategy**: Service role vs anon key for Prisma
- ☐ **RLS Policy Approach**: How to handle Row Level Security

These decisions will be documented before proceeding with implementation.

---

## Stage 0: Current State Audit

### Goal

Verify that the out-of-the-box Nx setup works correctly and meets all prerequisites before making any changes.

### Sub-stages

- [x] **0.1: Verify prerequisites** ✅
  - [x] 0.1.1: Check Node.js version (recommended: v20.x or later) - v22.20.0 ✅
  - [x] 0.1.2: Check pnpm version (should be v8.x or later) - v10.13.1, upgraded to v10.18.3 ✅
    - [x] 0.1.2.1: Run `pnpm setup` to configure global bin directory
    - [x] 0.1.2.2: Restart terminal to apply PATH changes
    - [x] 0.1.2.3: Run `pnpm self-update` to upgrade to latest version
    - [x] 0.1.2.4: Update packageManager in package.json to pnpm@10.18.3
  - [x] 0.1.3: Verify pnpm is set as package manager (not npm) - Added to package.json ✅
  - [x] 0.1.4: Clean up any npm artifacts (package-lock.json) if present - Deleted ✅
  - [x] 0.1.5: Verify Playwright browsers installed - v1.56.0 ✅
  - [x] 0.1.6: Document prerequisite versions in `docs/prerequisites.md` ✅
  - [x] 0.1.7: Create pnpm-workspace.yaml to replace package.json workspaces field ✅
  - [x] 0.1.8: Remove "workspaces" field from package.json (pnpm-specific config) ✅
  - [x] 0.1.9: Clean node_modules and reinstall with pnpm to remove npm residue ✅

- [x] **0.2: Verify existing web app builds and runs** ✅
  - [x] 0.2.1: Run `pnpm install` and verify no errors - Created pnpm-workspace.yaml, cleaned node_modules ✅
    - [x] Fixed @swc/core peer dependency (updated from ~1.5.29 to ^1.13.5)
    - [x] Approved build scripts for nx and @swc/core via pnpm approve-builds
    - [x] Added common npm scripts to package.json (dev, build, test, lint, e2e)
  - [x] 0.2.2: Run `pnpm exec nx run web:build` and verify success - Build completed in 18s ✅
  - [x] 0.2.3: Run `pnpm exec nx run web:dev` and verify dev server starts ✅
  - [x] 0.2.4: Access http://localhost:3000 and verify app loads ✅

- [x] **0.3: Test existing QA tooling** ✅
  - [x] 0.3.1: Run `pnpm exec nx run web:lint` and verify passes ✅
  - [x] 0.3.2: Run `pnpm exec nx run web:test` and verify all tests pass - Fixed Jest config ✅
    - [x] Installed @nx/react to fix missing transform plugin
    - [x] Added testMatch pattern to find tests in specs/ folder
    - [x] Added forceExit to prevent Jest hanging after tests complete
  - [x] 0.3.3: Run `pnpm exec nx run web-e2e:e2e` and verify Playwright E2E tests pass (smoke tests) - 3/3 tests passed ✅
    - [x] Added test timeouts to playwright.config.ts (30s test, 5s assertions)
  - [x] 0.3.4: Verify Prettier formatting works ✅
    - [x] Updated .prettierignore to exclude build artifacts (.next, test-output, etc)

- [x] **0.4: Validate CI pipeline** ✅
  - [x] 0.4.1: Confirm GitHub Actions workflow passes on latest commit - CI passes on PR #4 ✅
  - [x] 0.4.2: Verify Nx Cloud integration shows task results - Nx Cloud showing results ✅
  - [x] 0.4.3: Verify Claude Code Review workflow triggers and completes successfully ✅
  - [x] 0.4.4: Verify CodeRabbit picks up .coderabbit.yaml config and executes review - Verified on PR #4 ✅
  - [x] 0.4.5: Test cache hits by running build twice: `pnpm exec nx run web:build` (second run should be cached)

- [ ] **0.4b: Code Review Fixes** (Quality improvements from PR #4 code reviews)
  - [x] 0.4b.1: Fix Playwright webServer to use pnpm instead of npx ✅
    - Issue: `apps/web-e2e/playwright.config.ts` uses `npx nx` instead of `pnpm exec nx`
    - Impact: Inconsistent with pnpm migration, breaks package manager consistency
    - Fix: Change webServer command to `pnpm exec nx run @nx-monorepo/web:start`
    - Validation: E2E tests passed (3/3) with new command
    - Additional finding: 44 total npx references found across codebase (39 need updating)

  - [x] 0.4b.2: Verify TypeScript typecheck passes
    - Issue: CI runs `typecheck` target but hasn't been verified locally
    - Fix: Run `pnpm exec nx run-many -t typecheck` and confirm it passes

  - [x] 0.4b.3: Fix Jest forceExit root cause (NOT DEFERRED) ✅

    - Issue: `forceExit: true` in `apps/web/jest.config.ts` can mask real issues and isn’t template-ideal.
    - Summary (final): We reverted `forceExit` to `false`. Intermittent hangs observed over several days were most likely environmental (background runner/socket state) rather than a code leak. After environment resets (new shell, daemon/cloud toggles) tests exited cleanly without `forceExit`.
    - Guidance:
      - Keep `forceExit: false` by default in the template.
      - For local diagnosis only, run with `--detectOpenHandles`, or temporarily add `--forceExit` to the command (do not commit).
      - If a hang reappears, first try disabling helpers for the run: `NX_DAEMON=false nx run web:test --no-cloud`, or bypass Nx by running Jest directly.

  - [x] 0.4b.4: Investigate tsconfig.json changes ✅
    - Issue: `apps/web/tsconfig.json` has unexplained changes (likely Next.js auto-updates)
    - Finding: Next.js 15.2 automatic TypeScript configuration (expected BAU behavior)
    - Changes: Added `.next/types/**/*.ts` and reordered include array for optimization
    - Root cause: Next.js dev server auto-configures tsconfig.json during `next dev` startup
    - Action: Accepted as BAU - changes improve type safety and should remain committed
    - Impact: Enables route type safety, env var IntelliSense, and Next.js API type inference

  - [x] 0.4b.5: Document .prettierignore markdown/docs exclusions ✅
    - Issue: Excluding all markdown and docs directories raises reviewer questions
    - Decision: Keep exclusions (allows manual formatting control for documentation)
    - Fix: Add comments to `.prettierignore` explaining rationale for excluding docs and markdown
    - Completed: Added comprehensive comments explaining rationale for exclusions

	  - [x] 0.4b.6: Resolve Jest test location strategy ✅
    - Issue: testMatch included both `specs/` and `src/` directories - inconsistent convention
    - Solution: Adopted Next.js 15 default - co-located tests in `src/` directory
    - Actions taken:
      - Migrated `specs/index.spec.tsx` → `src/app/page.spec.tsx`
      - Updated jest.config.ts testMatch to single pattern: `<rootDir>/src/**/*.(spec|test).[jt]s?(x)`
      - Added collectCoverageFrom configuration excluding test files
      - Validated with full CI simulation (tests, build, cache clear)
    - Result: Single, consistent test location pattern following Next.js 15 best practices
    - Note: Testing infrastructure enhancements (jest-dom, type isolation) deferred to Stage 3 (see 3.3) for workspace-level, reusable implementation

- [x] **0.5: Validate workspace scripts**
  - [x] 0.5.1: Verify package.json scripts are set up correctly ✅
    - Confirmed package.json has scripts: dev, build, test, lint, e2e
    - All scripts use proper pnpm/nx commands
  - [x] 0.5.2: Test workspace-level commands work ✅
    - `pnpm run build` - Successfully builds all projects
    - `pnpm run lint` - Passes (fixed eslint.config.mjs to ignore build artifacts: **/dist, **/out-tsc, **/.next)
    - `pnpm run test` - Tests pass (exhibits known Windows hanging behavior from 0.4b.3)
    - `pnpm run e2e` - All 3 E2E tests pass (chromium, firefox, webkit)
    - `pnpm run dev` - Dev server starts successfully on http://localhost:3000
  - [x] 0.5.3: Document available commands ✅
    - Updated README.md with workspace scripts and pnpm exec nx commands
    - Updated CLAUDE.md with workspace scripts section and pnpm exec nx commands throughout
    - All command documentation now uses pnpm (not npx) for consistency
    - Documentation aligns with verified workspace scripts from task 0.5.2

- [x] **0.6: Document current package versions** ✅
  - [x] 0.6.1: Run `pnpm list --depth=1 > docs/package-versions-baseline.txt` ✅
    - Generated complete dependency tree at depth=1
    - File: `docs/package-versions-baseline.txt` (513 lines)
  - [x] 0.6.2: Create `docs/package-versions-baseline.md` with key versions ✅
    - Created comprehensive markdown documentation
    - Organized by categories: Environment, Core Frameworks, Build Tools, Nx Plugins, Testing, Code Quality, Dev Tools
    - File: `docs/package-versions-baseline.md`
  - [x] 0.6.3: Capture Next.js, React, TypeScript, Nx versions ✅
    - Next.js: 15.2.5
    - React: 19.0.0
    - TypeScript: 5.9.3
    - Nx: 21.6.5
    - Node.js: v22.20.0
    - pnpm: 10.18.3
    - Additional key versions: Jest 30.2.0, Playwright 1.56.1, ESLint 9.37.0, Prettier 2.8.8

### Success Criteria

- [x] Prerequisites documented and verified ✅
- [x] pnpm is confirmed as package manager (no package-lock.json) ✅
- [x] `pnpm install` completes without errors or warnings ✅
- [x] `pnpm exec nx run web:build` succeeds ✅
- [x] `pnpm exec nx run web:dev` starts development server successfully ✅
- [x] `pnpm exec nx run web:lint` passes with no errors ✅
- [x] `pnpm exec nx run web:test` passes all tests ✅
- [x] `pnpm exec nx run web-e2e:e2e` passes all Playwright tests ✅
- [x] GitHub Actions CI workflow passes on latest commit ✅
- [x] Nx Cloud shows successful task caching (cache hit on second build) ✅
- [x] Package version baseline documented in `docs/package-versions-baseline.md` ✅
- [x] Prerequisites documented in `docs/prerequisites.md` ✅

**Stage 0 Estimated Time:** 45 minutes - 1 hour

---

## Stage 1: Generate Server Application

### Goal

Create the server application using Nx generators, ensuring it builds and runs independently with proper QA tooling before proceeding.

### Sub-stages

- [x] **1.1: Generate server application**
  - [x] 1.1.1a: Install @nx/node plugin: `pnpm exec nx add @nx/node`
  - [x] 1.1.1b: Run: `pnpm exec nx g @nx/node:app server --directory=apps/server --framework=express`
  - [x] 1.1.2: Review generated files and structure
  - [x] 1.1.3: Verify TypeScript project reference added to root tsconfig.json
    - Note: Apps use TypeScript Project References, not path aliases (libraries use path aliases)

- [x] **1.2: Immediate validation**
  - [x] 1.2.1: Run `pnpm exec nx run server:build` and verify success
  - [x] 1.2.2: Run `pnpm exec nx run server:serve` and verify server starts on expected port
  - [x] 1.2.3: Verify server responds to default route (curl or browser)
  - [x] 1.2.4: Run `pnpm exec nx run server:lint` and verify passes
  - [x] 1.2.5: Configure and run server tests
    - [x] 1.2.5a: Generate Jest config: `pnpm exec nx g @nx/jest:configuration --project=server`
    - [x] 1.2.5b: Run `pnpm exec nx run server:test` and verify default tests pass
    - Note: @nx/node:app with Express doesn't create Jest config by default

- [x] **1.3: Update workspace scripts**
  - [x] 1.3.1: Do NOT add server-specific scripts to root package.json
    - Rationale: Keep workspace scripts focused on workspace-wide operations
    - Developers will use `pnpm exec nx run server:serve` directly for server-specific work
  - [x] 1.3.2: Document how to run server in development
    - Add to .ruler/AGENTS.md: "Start server: `pnpm exec nx run server:serve`"

- [x] **1.4: Verify workspace health**
  - [x] 1.4.1: Run `pnpm exec nx graph` and verify clean dependency structure
  - [x] 1.4.2: Run `pnpm exec nx run-many -t build` and verify both web and server build
  - [x] 1.4.3: Verify Nx cache works for server tasks
    - [x] Run `pnpm exec nx reset` to clear cache
    - [x] Run `pnpm exec nx run server:build` (first build, should execute)
    - [x] Run `pnpm exec nx run server:build` again (should use cache)
    - [x] Verify second run shows "[local cache]" or similar cache hit message

### Success Criteria

- [ ] Server application generated in `apps/server/`
- [ ] `pnpm exec nx run server:build` succeeds
- [ ] `pnpm exec nx run server:serve` starts server on expected port
- [ ] Server responds to health check endpoint (default Express route)
- [ ] `pnpm exec nx run server:lint` passes
- [ ] `pnpm exec nx run server:test` passes (with default tests)
- [ ] `pnpm exec nx graph` shows both web and server apps with no circular dependencies
- [ ] `pnpm exec nx run-many -t build` builds both apps successfully
- [ ] Nx cache hits work for server tasks (run build twice)

**Stage 1 Estimated Time:** 30-45 minutes

---

## Stage 2: Generate Shared Packages

### Goal

Create all shared libraries following Nx conventions, ensuring each package builds and tests correctly immediately after generation.

### Sub-stages

- [x] **2.1: Generate database package**
  - [x] 2.1.1: Run: `pnpm exec nx g @nx/js:lib database --directory=packages/database --bundler=none`
    - **Note**: Uses `--bundler=none` because Prisma generates code at runtime (see `docs/memories/tech-findings-log.md`)
  - [x] 2.1.2: Install Prisma dependencies: `pnpm add -D prisma --filter @nx-monorepo/database`
  - [x] 2.1.3: Install Prisma client: `pnpm add @prisma/client --filter @nx-monorepo/database`
  - [x] 2.1.4: Set up basic Prisma configuration structure
  - [x] 2.1.5: **Immediate test**: Verify NO build target exists (expected with `--bundler=none`)
    - Run `pnpm exec nx show project database` and confirm build target is absent
    - This is correct behavior - database package has no pre-build step
  - [x] 2.1.6: **Immediate test**: Run `pnpm exec nx run database:lint` and verify passes
  - [x] 2.1.7: **Immediate test**: Run `pnpm exec nx run database:test` and verify passes

- [x] **2.2: Generate schemas package**
  - [x] 2.2.1: Run: `pnpm exec nx g @nx/js:lib schemas --directory=packages/schemas --bundler=tsc`
  - [x] 2.2.2: Install Zod: `pnpm add zod --filter @nx-monorepo/schemas`
  - [x] 2.2.3: Create placeholder schema exports
  - [x] 2.2.4: **Immediate test**: Run `pnpm exec nx run schemas:build` and verify success
  - [x] 2.2.5: **Immediate test**: Run `pnpm exec nx run schemas:lint` and verify passes
  - [x] 2.2.6: **Immediate test**: Run `pnpm exec nx run schemas:test` and verify passes

- [x] **2.3: Generate api-client package**
  - [x] 2.3.1: Run: `pnpm exec nx g @nx/js:lib api-client --directory=packages/api-client --bundler=tsc`
  - [x] 2.3.2: Set up API client structure (oRPC initially installed, will be replaced after Stage 4.1)
    - Note: Placeholder implementation until REST+OpenAPI tooling is configured in Stage 4
  - [x] 2.3.3: Set up basic client factory structure
  - [x] 2.3.4: **Immediate test**: Run `pnpm exec nx run api-client:build` and verify success
  - [x] 2.3.5: **Immediate test**: Run `pnpm exec nx run api-client:lint` and verify passes
  - [x] 2.3.6: **Immediate test**: Run `pnpm exec nx run api-client:test` and verify passes

- [x] **2.4: Generate supabase-client package**
  - [x] 2.4.1: Run: `pnpm exec nx g @nx/js:lib supabase-client --directory=packages/supabase-client --bundler=tsc`
  - [x] 2.4.2: Install Supabase client: `pnpm add @supabase/supabase-js --filter @nx-monorepo/supabase-client`
  - [x] 2.4.3: Install Supabase SSR: `pnpm add @supabase/ssr --filter @nx-monorepo/supabase-client`
  - [x] 2.4.4: Set up client factory structure
  - [x] 2.4.5: **Immediate test**: Run `pnpm exec nx run supabase-client:build` and verify success
  - [x] 2.4.6: **Immediate test**: Run `pnpm exec nx run supabase-client:lint` and verify passes
  - [x] 2.4.7: **Immediate test**: Run `pnpm exec nx run supabase-client:test` and verify passes

- [x] **2.5: Verify package dependency graph and cross-package integration**
  - [x] 2.5.1: Run `pnpm exec nx graph` and verify clean dependency structure
  - [x] 2.5.2: Ensure proper library boundaries (no circular dependencies)
  - [x] 2.5.3: Verify build order is correct
  - [x] 2.5.4: Test that apps can import from packages (TypeScript paths resolve)
  - [x] 2.5.5: Run `pnpm exec nx run-many -t build` and verify all packages build
  - [x] 2.5.6: Test incremental builds: change one package, verify only dependents rebuild


### Success Criteria

- [ ] All four packages generated and build successfully
- [ ] Each package passed lint immediately after generation
- [ ] Each package passed tests immediately after generation
- [ ] `pnpm exec nx run-many -t build --projects=tag:type:lib` succeeds
- [ ] All packages build: database, schemas, api-client, supabase-client
- [ ] All packages pass lint: `pnpm exec nx run-many -t lint --projects=tag:type:lib`
- [ ] All packages pass tests: `pnpm exec nx run-many -t test --projects=tag:type:lib`
- [ ] `pnpm exec nx graph` shows clean dependency structure (no circular dependencies)
- [ ] Apps can import from packages (TypeScript paths resolve correctly)
- [ ] Incremental builds work (changing one package only rebuilds dependents)
- [ ] All necessary dependencies installed and documented

**Stage 2 Estimated Time:** 1-1.5 hours

---

## Stage 3: QA Infrastructure Setup

### Goal

Establish quality assurance tooling and testing scaffolding early to create a safety net before building the walking skeleton. This ensures all subsequent development happens with quality gates active.

### Sub-stages

- [x] **3.1: Install and configure Husky**
  - [x] 3.1.1: Install Husky: `pnpm add -D husky -w`
  - [x] 3.1.2: Initialize Husky: `pnpm exec husky init`
  - [x] 3.1.3: Set up Git hooks infrastructure
  - [x] 3.1.4: Configure pre-commit hook for linting and formatting
  - [x] 3.1.5: Install commitlint: `pnpm add -D -w @commitlint/cli @commitlint/config-conventional`
  - [x] 3.1.6: Create `commitlint.config.js` with custom type prefixes (feat, fix, docs, chore, cfg, plan, zdx)
  - [x] 3.1.7: Configure commit-msg hook for conventional commits
  - [x] 3.1.8: Test hook triggers on commit attempt

- [x] **3.2: Add pre-commit validation with lint-staged**
  - [x] 3.2.1: Install lint-staged: `pnpm add -D lint-staged -w`
  - [x] 3.2.2: Create `.lintstagedrc.json` configuration
  - [x] 3.2.3: Configure to run ESLint and Prettier on staged files only (default config)
  - [x] 3.2.4: Ensure it respects Nx project boundaries
  - [x] 3.2.5: Test by staging files and committing

- [x] **3.3: Verify and document existing testing infrastructure** ✅

  **Rationale**: Nx auto-generates proper Jest configurations for each project with workspace-level preset management. Rather than creating custom infrastructure, verify the standard Nx patterns work correctly and document them for future reference.

  **Current Reality**:
  - ✅ Workspace preset exists: `jest.preset.js` (from `@nx/jest/preset`)
  - ✅ Web app extends workspace preset: `apps/web/jest.config.ts`
  - ✅ TypeScript test config works: `apps/web/tsconfig.spec.json` extends `tsconfig.base.json`
  - ✅ Tests pass with standard configuration (no custom setup needed yet)

  **Approach**: Validate existing patterns, document for consistency, add optional enhancements only when actually needed.

  - [x] 3.3.1: Verify web app Jest configuration follows Nx standards ✅
    - [x] Confirm `apps/web/jest.config.ts` extends `../../jest.preset.js` ✅
    - [x] Confirm tests run successfully with current setup ✅
    - [x] Review test configuration for any necessary adjustments ✅
      - Fixed type isolation issue: Removed jest types from production `tsconfig.json`
      - Validated tests still pass after configuration adjustment
    - [x] Document current pattern for future projects ✅
      - Added "Jest Configuration Patterns" section to `.ruler/AGENTS.md`

  - [x] 3.3.2: Verify TypeScript test configuration follows Nx standards ✅
    - [x] Confirm `apps/web/tsconfig.spec.json` extends `../../tsconfig.base.json` ✅
    - [x] Confirm Jest types are included: `"types": ["jest", "node"]` ✅
    - [x] Verify production `tsconfig.json` doesn't include test types ✅
      - Fixed: Removed test types from production config for proper type isolation
    - [x] Document pattern for future projects ✅
      - Documented TypeScript test configuration pattern in `.ruler/AGENTS.md`

  - [x] 3.3.3: Document how to add Jest to new projects ✅
    - [x] Add to .ruler/AGENTS.md: "To add Jest to a project: `pnpm exec nx g @nx/jest:configuration <project>`" ✅
    - [x] Document that Nx auto-generates proper configs extending workspace preset ✅
    - [x] Note: No manual setup required - Nx handles it automatically ✅

  - [x] 3.3.4: Document optional testing library enhancements (for future use) ✅
    - [x] Create `docs/testing-enhancements.md` with optional patterns: ✅
      - @testing-library/jest-dom setup and usage
      - setupFilesAfterEnv configuration pattern
      - @testing-library/user-event for realistic user interactions
      - Test ID best practices with namespaced conventions
      - MSW (Mock Service Worker) for API mocking
      - Custom render function with providers
    - [x] Note: These are optional - add only when specific projects need them ✅
    - [x] Emphasize: Start simple, add complexity only when justified ✅

- [x] **3.4: Configure test coverage reporting** ✅

  **Approach**: Establish coverage infrastructure with permissive thresholds (10%) during Phase 1 walking skeleton. This validates the infrastructure without blocking development - thresholds will be raised to 80% in Phase 2.

  **Implemented**:
  - ✅ Coverage scripts added to root `package.json`:
    - `test:coverage` - Run coverage for all projects
    - `test:coverage:web` - Run coverage for web app
    - `test:coverage:server` - Run coverage for server
  - ✅ Coverage thresholds added to `apps/web/jest.config.ts`:
    - All metrics set to 10% (branches, functions, lines, statements)
    - Aspirational comments documenting 80% target for Phase 2+
  - ✅ Coverage directory pattern verified: `coverageDirectory: '../../coverage/apps/web'`
  - ✅ Coverage workflow tested and validated:
    - HTML reports generate correctly at `coverage/apps/web/lcov-report/index.html`
    - Threshold enforcement verified (intentionally failed with 99% threshold, then restored to 10%)
    - Tests pass with 10% thresholds
  - ✅ Comprehensive coverage documentation added to `.ruler/AGENTS.md`:
    - Coverage scripts usage
    - Coverage thresholds explanation with rationale
    - Coverage metrics definitions (branches, functions, lines, statements)
    - Coverage reports location and contents
    - Coverage directory structure pattern
    - Adding coverage to new projects

  - [x] 3.4.1: Add coverage scripts to root package.json ✅
    - Added `test:coverage`, `test:coverage:web`, `test:coverage:server`
    - Follows existing script pattern (workspace-wide + per-project)

  - [x] 3.4.2: Standardize coverage thresholds across projects ✅
    - Added 10% thresholds to `apps/web/jest.config.ts`
    - Documented with aspirational 80% target comments
    - Pattern ready to apply to future projects

  - [x] 3.4.3: Configure coverage directory structure ✅
    - Verified existing pattern: `../../coverage/apps/web`
    - Documented pattern for future projects
    - Confirmed `/coverage` is gitignored

  - [x] 3.4.4: Document coverage commands and viewing reports ✅
    - Added comprehensive "Coverage Testing" section to `.ruler/AGENTS.md`
    - Documented scripts, thresholds, reports, directory structure
    - Included platform-specific report opening commands

  - [x] 3.4.5: Test coverage workflow and update checklist ✅
    - Verified `pnpm run test:coverage:web` generates HTML reports
    - Verified threshold enforcement by testing failure case (99% threshold)
    - Confirmed tests pass with correct 10% thresholds
    - Updated this checklist with detailed completion notes

- [x] **3.5: Add type checking to CI**
  - [x] 3.5.1: Ensure TypeScript compilation is part of CI pipeline
  - [x] 3.5.2: Configure typecheck target for projects (if not auto-configured)
  - [x] 3.5.3: Test: `pnpm exec nx run-many -t typecheck`
  - [x] 3.5.4: Update `.github/workflows/ci.yml` to include typecheck step

### Success Criteria

- [ ] Husky installed and Git hooks directory created (`.husky/`)
- [ ] Pre-commit hook runs automatically on `git commit`
- [ ] Pre-commit hook blocks commits with lint/format errors
- [ ] Pre-commit hook only checks staged files (fast execution < 10s)
- [ ] Commit message validation enforces conventional commits format (if configured)
- [ ] lint-staged configuration exists and respects Nx workspace structure
- [ ] Web app Jest configuration verified to extend workspace preset
- [ ] Web app TypeScript test config verified to follow Nx standards
- [ ] Documentation added to CLAUDE.md for adding Jest to new projects
- [ ] Optional testing enhancements documented in `docs/testing-enhancements.md`
- [ ] Coverage reporting configured (0% threshold, just report)
- [ ] Coverage reports are generated in `coverage/` directory
- [ ] CI workflow includes typecheck step
- [ ] Attempting to commit code with lint errors is blocked locally
- [ ] Standard Nx testing patterns are documented for future reference

**Stage 3 Estimated Time:** 45-60 minutes (simplified - validates existing Nx patterns)

---

## Stage 4: Architecture Decisions & Infrastructure

### Goal

Make explicit architecture decisions about API framework and database strategy, then configure infrastructure based on those decisions.

### Sub-stages

- [ ] **4.1: API Architecture Decision & REST+OpenAPI Implementation**
  - [x] 4.1.1: Review API framework options (oRPC, tRPC, REST+OpenAPI, gRPC) ✅ COMPLETED 2025-10-23
    - Decision: Switch from oRPC to REST+OpenAPI
    - Rationale: Maximum flexibility, zero vendor lock-in, industry standard patterns
    - Documented in `docs/architecture-decisions.md` with comparison matrix and detailed analysis

  - [x] 4.1.2: Remove oRPC from codebase ✅ COMPLETED 2025-10-23
    - Updated 7 documentation files (architecture-decisions.md, README.md, P1-plan.md, poc-plan.md, tech-findings-log.md, and others)
    - Removed @orpc/client dependency from packages/api-client/package.json
    - Removed oRPC imports from api-client source code
    - Deleted build artifacts and ran pnpm install (removed 8 packages)
    - Validation: All tests pass, all builds pass, all linting passes, all typechecks pass, E2E tests pass

  - [x] 4.1.3: Review REST+OpenAPI tooling options ✅ COMPLETED 2025-10-23
    - Research: @asteasolutions/zod-to-openapi for OpenAPI spec generation from Zod schemas
    - Research: openapi-typescript for TypeScript type generation from OpenAPI specs
    - Research: openapi-fetch vs axios vs native fetch for HTTP client library
    - Evaluated options and documented comprehensive findings in `docs/architecture-decisions.md` → "Task 4.1.3: REST+OpenAPI Tooling Selection"

  - [x] 4.1.4: Select code generation strategy and HTTP client library ✅ COMPLETED 2025-10-24
    - Decision: OpenAPI spec generation using @asteasolutions/zod-to-openapi (code-first, Zod schemas as source of truth)
    - Decision: TypeScript type generation using openapi-typescript (type-only, zero runtime overhead)
    - Decision: HTTP client using openapi-fetch (5-6KB bundle, compile-time type safety, cross-platform)
    - Decision: Commit generated files to git (faster CI, better diffs, offline support)
    - Decision: Nx dependency graph for build orchestration (automatic ordering, caching)
    - Documented formal decisions in `docs/architecture-decisions.md` → "Task 4.1.4: Formal Tooling Decisions"

  - [x] 4.1.5: Install REST+OpenAPI dependencies
    - Install server dependencies: `pnpm add @asteasolutions/zod-to-openapi swagger-ui-express --filter @nx-monorepo/server` and `pnpm add -D @types/swagger-ui-express --filter @nx-monorepo/server`
    - Install client dependencies: `pnpm add -D openapi-typescript --filter @nx-monorepo/api-client` and `pnpm add openapi-fetch --filter @nx-monorepo/api-client`
    - Verify installations: ` grep -E "(openapi|swagger)"pnpm list |`

  - [x] 4.1.6: Configure Express routes structure
    - Create directory: `apps/server/src/routes/`
    - Set up route organization pattern (by feature/domain)
    - Create example route file with dummy endpoint for testing infrastructure
    - Mount routes in `apps/server/src/main.ts`

  - [x] 4.1.7: Set up OpenAPI spec generation
    - Implement OpenAPI spec generation mechanism (based on 4.1.4 decision)
    - Configure OpenAPI metadata (API title, version, servers, base path)
    - Create endpoint to serve OpenAPI spec: `GET /api/docs/openapi.json`
    - Verify spec validates as OpenAPI 3.x using online validator

  - [x] 4.1.8: Generate TypeScript types from OpenAPI spec
    - Refactor server:spec-write to use TypeScript script (apps/server/scripts/write-openapi.ts)
    - Configure openapi-typescript in packages/api-client
    - Add Nx target: api-client:generate-types with proper dependencies (server:spec-write)
    - Generate types to src/gen/openapi.d.ts with --export-type flag
    - Add src/gen/ to .gitignore (build artifact strategy)
    - Verify type generation, Nx caching, and build dependency chain
    - Document as Pattern 7 in docs/memories/adopted-patterns.md

  - [x] 4.1.9: Configure API client factory with generated types ✅ COMPLETED 2025-10-24
    - Implemented createApiClient() factory using openapi-fetch
    - Integrated with generated OpenAPI types for full type safety
    - Configured: baseUrl (defaults to '/api'), headers via middleware, custom fetch
    - Exported typed client with full endpoint autocomplete
    - Wrote 3 minimal unit tests for Phase 1 (runtime tests deferred to 4.1.10)
    - Validation: All tests pass, build succeeds, lint clean, typecheck passes

  - [x] **Infrastructure Migration**: Server build output standardization ✅ COMPLETED 2025-10-25
    - Migrated from project-level `apps/server/dist` to workspace-level `dist/apps/server`
    - Updated 7 files: package.json (3 changes), write-openapi.ts, launch.json, 2 doc files
    - Corrected for nested path structure: esbuild with bundle:false preserves source paths
    - Updated Nx target outputs (prune-lockfile, copy-workspace-modules) for correct caching
    - Updated VS Code debugger configuration for proper breakpoint support
    - Updated documentation to reflect workspace-level build patterns
    - Full validation: Build chain passes (build → spec-write → generate-types → api-client:build)
    - Quality gates: 14/14 tests pass, lint clean, typecheck passes
    - Note: Output structure is `dist/apps/server/apps/server/src/...` (nested) - this is correct behavior with esbuild bundle:false

  - [x] 4.1.10: Verify type-safe client functionality ✅ COMPLETED 2025-10-25
    - Created test endpoint: `GET /api/hello` → `{ message: string, timestamp: number }`
    - Implemented complete feature-based architecture (controller, router, OpenAPI registration)
    - Regenerated OpenAPI spec and TypeScript types with --skip-nx-cache to force fresh build
    - Created compile-time type safety tests in `packages/api-client/src/lib/api-client-types.spec.ts`
    - Verified TypeScript autocomplete shows available endpoints (path '/hello' fully typed)
    - Verified request/response types enforced at compile time (commented examples show compile errors)
    - Tests validate type extraction from paths and components without making HTTP calls
    - Validation: All quality gates pass (lint, test, build, typecheck)

  - [x] 4.1.11: Test REST+OpenAPI infrastructure end-to-end ✅ COMPLETED 2025-10-25
    - Implemented supertest-based integration tests (no port binding needed)
    - Exported createApp() factory from `apps/server/src/app.ts` for port-free testing
    - Created integration tests in `apps/server/src/routes/hello.spec.ts`:
      - ✅ GET /api/hello returns correct structure with message and timestamp
      - ✅ Timestamp validation (within 5 seconds, reasonable bounds)
      - ✅ 404 handling for invalid endpoints
    - Resolved Jest ESM/CommonJS module issue with workspace packages:
      - Added testEnvironmentOptions.customExportConditions: ['@nx-monorepo/source']
      - Switched from ts-jest to @swc/jest for uniform TypeScript transformation
      - Converted jest.config to .cjs to avoid ESM __dirname issues
      - Created .spec.swcrc configuration
    - Fixed TypeScript portable type issue: Added explicit Express return type to createApp()
    - Validation: All server tests pass, type safety verified, build succeeds
    - Note: Deferred error handling tests (500, timeouts) to Phase 2 - walking skeleton validated

- [ ] **4.2: Supabase Architecture Decision**
  - [ ] 4.2.1: Decide: Local Supabase CLI vs cloud project
  - [ ] 4.2.2: Decide: Prisma Migrate (SQL migrations) vs db push (schema sync)
  - [ ] 4.2.3: Decide: Database connection for Prisma (DATABASE_URL) vs Supabase JS keys (anon/service) — clarify usage boundaries.
  - [ ] 4.2.4: Decide: RLS policy approach for this phase
  - [ ] 4.2.5: Document decisions in `docs/architecture-decisions.md`

- [ ] **4.3: Set up Supabase project (based on 4.2 decision)**
  - [ ] 4.3.1: Create Supabase project (cloud or initialize local)
  - [ ] 4.3.2: Configure environment variables (`.env.local`, `.env`)
  - [ ] 4.3.3: Document environment variable setup in `docs/environment-setup.md`
  - [ ] 4.3.4: Test connectivity from local machine

- [ ] **4.4: Configure Prisma in database package**
  - [ ] 4.4.1: Set up `packages/database/prisma/schema.prisma`
  - [ ] 4.4.2: Configure Supabase PostgreSQL connection string
  - [ ] 4.4.3: Create minimal test model: HealthCheck table
    - id: uuid (primary key)
    - timestamp: DateTime
    - message: String
  - [ ] 4.4.4: Run: `pnpm --filter @nx-monorepo/database prisma generate`
  - [ ] 4.4.5: Run: `pnpm --filter @nx-monorepo/database prisma db push` (or migrate)
  - [ ] 4.4.6: Verify table appears in Supabase dashboard

- [ ] **4.5: Configure Supabase client factory**
  - [ ] 4.5.1: Implement client factory in `packages/supabase-client/src/index.ts`
  - [ ] 4.5.2: Support Next.js configurations using `@supabase/ssr`
    - Implement `createServerClient()` for Server Components and Route Handlers
    - Implement `createBrowserClient()` for Client Components
    - Note: Expo/React Native support deferred to Stage 8 (Phase 2)
  - [ ] 4.5.3: Export createSupabaseClient factory functions
  - [ ] 4.5.4: Test client initialization with dummy code

### Success Criteria

**4.1: API Architecture & REST+OpenAPI Implementation**
- [x] Architecture decisions documented in `docs/architecture-decisions.md` ✅
- [x] API framework choice (REST+OpenAPI) documented with detailed rationale ✅
- [x] oRPC completely removed from codebase (dependencies, imports, documentation) ✅
- [ ] REST+OpenAPI tooling stack selected and documented
- [ ] REST+OpenAPI dependencies installed (server and client)
- [ ] Express routes structure configured in `apps/server/src/routes/`
- [ ] OpenAPI spec generation configured and working
- [ ] OpenAPI spec endpoint accessible: `GET /api/docs/openapi.json`
- [ ] TypeScript type generation from OpenAPI spec working
- [ ] API client factory configured with generated types
- [ ] Type-safe client demonstrates autocomplete for endpoints
- [ ] TypeScript enforces request/response types at compile time
- [ ] End-to-end infrastructure test passes (dummy endpoint via type-safe client)

**4.2-4.5: Supabase & Database Configuration**
- [ ] Supabase strategy documented with rationale
- [ ] Supabase project created and accessible via dashboard
- [ ] Environment variables configured and documented in `docs/environment-setup.md`
- [ ] `packages/database/prisma/schema.prisma` contains valid schema
- [ ] HealthCheck model defined with correct fields
- [ ] `pnpm --filter @nx-monorepo/database prisma generate` succeeds
- [ ] `pnpm --filter @nx-monorepo/database prisma db push` succeeds
- [ ] Supabase dashboard shows HealthCheck table with correct schema
- [ ] Can manually insert/query data via Prisma Studio or Supabase dashboard
- [ ] Supabase client factory exports working initialization function

**Stage 4 Estimated Time:** 2-3 hours

---

## Stage 5: Implement Walking Skeleton (Web Only)

### Goal

Create a minimal vertical slice that exercises the entire stack: web → API client → server → database → Supabase. This is the critical validation step that proves all components work together. **With QA infrastructure active, tests will be written alongside each layer of implementation.**

### Sub-stages

- [ ] **5.1: Implement database layer + tests**
  - [ ] 5.1.1: Export Prisma client singleton from `packages/database/src/index.ts`
  - [ ] 5.1.2: Create query functions: `getHealthChecks()`, `createHealthCheck(message)`
  - [ ] 5.1.3: Write unit tests for query functions
  - [ ] 5.1.4: Run tests and verify they pass

- [ ] **5.2: Implement schemas layer + tests**
  - [ ] 5.2.1: Create Zod schema for health check operations in `packages/schemas/src/health.ts`
  - [ ] 5.2.2: Define: `healthPingSchema` (input validation)
  - [ ] 5.2.3: Export types derived from schemas
  - [ ] 5.2.4: Write unit tests for schema validation
  - [ ] 5.2.5: Run tests and verify they pass

- [ ] **5.3: Implement server endpoints + tests**
  - [ ] 5.3.1: Create health check REST endpoints in `apps/server/src/routes/health.ts`
    - `GET /api/health` - Fetch all health checks from DB
    - `POST /api/health/ping` - Create new health check with message
  - [ ] 5.3.2: Add Zod schema validation middleware for request bodies
  - [ ] 5.3.3: Update OpenAPI spec with new endpoints
  - [ ] 5.3.4: Regenerate TypeScript client types from OpenAPI spec
  - [ ] 5.3.5: Write integration tests for both endpoints
  - [ ] 5.3.6: Run tests and verify they pass

- [ ] **5.4: Implement API client + tests**
  - [ ] 5.4.1: Generate TypeScript types from OpenAPI spec
    - Run code generation: `openapi-typescript openapi.yaml -o packages/api-client/src/generated/api.types.ts`
    - Verify generated types match server endpoints
  - [ ] 5.4.2: Create type-safe HTTP client factory in `packages/api-client/src/index.ts`
    - Wrap fetch/axios with generated types
    - Export `createApiClient(config)` factory function
    - Include error handling and response validation
  - [ ] 5.4.3: Test type safety in client code
    - Verify autocomplete works for endpoint paths
    - Verify request/response types are enforced
    - Test invalid requests caught at compile time
  - [ ] 5.4.4: Write unit tests for client factory
    - Test client initialization with various configs
    - Mock fetch to test request formation
  - [ ] 5.4.5: Run tests and verify they pass

- [ ] **5.5: Implement web UI**
  - [ ] 5.5.1: Create `/health` page in `apps/web/src/app/health/page.tsx`
  - [ ] 5.5.2: Initialize API client
  - [ ] 5.5.3: Fetch and display health check data from server
  - [ ] 5.5.4: Add button to ping server (write to DB)
  - [ ] 5.5.5: Show real-time data updates after ping
  - [ ] 5.5.6: Add basic styling with Tailwind
  - [ ] 5.5.7: Test manually in browser

- [ ] **5.6: Manual validation**
  - [ ] 5.6.1: Start server: `pnpm exec nx run server:serve`
  - [ ] 5.6.2: Start web: `pnpm exec nx run web:dev`
  - [ ] 5.6.3: Navigate to http://localhost:3000/health
  - [ ] 5.6.4: Verify health checks display
  - [ ] 5.6.5: Click ping button and verify new entry appears
  - [ ] 5.6.6: Check Supabase dashboard to confirm data persistence
  - [ ] 5.6.7: Test error scenarios (server down, invalid input)

- [ ] **5.7: Update coverage thresholds**
  - [ ] 5.7.1: Update Jest configuration to set 60% coverage threshold
  - [ ] 5.7.2: Run: `pnpm exec nx run-many -t test --coverage`
  - [ ] 5.7.3: Verify >= 60% coverage achieved
  - [ ] 5.7.4: Document any intentional coverage gaps

### Success Criteria

- [ ] Server endpoint `getHealth()` returns data from Supabase
- [ ] Server endpoint `pingHealth(message)` writes to Supabase
- [ ] TypeScript autocomplete works in client for server endpoints (if applicable)
- [ ] Web app loads `/health` page successfully
- [ ] Web app displays data fetched from server/database
- [ ] Web app can trigger write operation (ping button)
- [ ] Changes appear immediately in web UI after ping
- [ ] Data persists in Supabase database
- [ ] All apps build successfully: `pnpm exec nx run-many -t build`
- [ ] No TypeScript errors in any project
- [ ] Nx cache works for all build tasks
- [ ] Unit tests pass for database package
- [ ] Unit tests pass for schemas package
- [ ] Integration tests pass for server endpoints
- [ ] Unit tests pass for api-client package
- [ ] All tests pass: `pnpm exec nx run-many -t test`
- [ ] Test coverage is >= 60% across shared packages
- [ ] Pre-commit hooks allow commits (code quality is good)

**Stage 5 Estimated Time:** 3-4 hours

---

## Stage 6: E2E Testing

### Goal

Complete end-to-end testing for the walking skeleton, validating the complete user journey. Evaluate E2E testing tools and write comprehensive tests.

### Sub-stages

- [ ] **6.1: Evaluate E2E Testing Tools (Exploratory)**
  - [ ] 6.1.1: Research Chrome DevTools MCP for E2E testing
  - [ ] 6.1.2: Trial Chrome DevTools approach with health check flow
  - [ ] 6.1.3: Research TestSprite MCP for E2E testing
  - [ ] 6.1.4: Trial TestSprite with health check flow
  - [ ] 6.1.5: Compare experience with existing Playwright setup
  - [ ] 6.1.6: Document findings and tool recommendations
  - [ ] 6.1.7: Decide: Use Playwright, switch tools, or use multiple tools
  - [ ] 6.1.8: **Note**: This is exploratory - success = tried the tools and formed an opinion

- [ ] **6.2: Write comprehensive E2E tests (using chosen tool)**
  - [ ] 6.2.1: Create E2E test for complete health check flow
  - [ ] 6.2.2: Test: Load /health page → see existing data
  - [ ] 6.2.3: Test: Click ping button → see new data appear
  - [ ] 6.2.4: Test: Verify data persists across page refresh
  - [ ] 6.2.5: Test: Error handling when server is down
  - [ ] 6.2.6: Run E2E tests and verify they pass

- [ ] **6.3: Verify test coverage**
  - [ ] 6.3.1: Run coverage report: `pnpm exec nx run-many -t test --coverage`
  - [ ] 6.3.2: Update coverage threshold to 80%
  - [ ] 6.3.3: Ensure >= 80% coverage threshold is met
  - [ ] 6.3.4: Document any intentional coverage gaps
  - [ ] 6.3.5: Generate coverage report for documentation

- [ ] **6.4: Complete documentation**
  - [ ] 6.4.1: Document walking skeleton architecture (diagram or markdown)
  - [ ] 6.4.2: Create `docs/walking-skeleton.md` explaining the flow
  - [ ] 6.4.3: Document how to run the walking skeleton
  - [ ] 6.4.4: Document how to run all tests
  - [ ] 6.4.5: Add troubleshooting guide for common issues

### Success Criteria

**Testing:**
- [ ] E2E testing tool evaluation completed and documented
- [ ] Decision made about E2E testing approach
- [ ] E2E tests exist for web health check flow
- [ ] E2E test: Load /health page → see data from database
- [ ] E2E test: Click ping button → see new data appear
- [ ] E2E test: Data persists across page refresh
- [ ] E2E test: Error handling works when server is down
- [ ] All E2E tests pass
- [ ] `pnpm exec nx run-many -t test --coverage` shows >= 80% coverage
- [ ] Coverage report generated and documented

**Documentation:**
- [ ] Walking skeleton architecture documented in `docs/walking-skeleton.md`
- [ ] E2E testing approach documented
- [ ] How to run guide exists
- [ ] Troubleshooting guide exists for common issues

**Stage 6 Estimated Time:** 2-3 hours

---

## Stage 7: External Services (Optional)

### Goal

Integrate external services that improve code quality, monitoring, and developer experience. This stage is non-blocking - Phase 1 can be considered complete without it.

### Sub-stages

- [ ] **7.1: Optimize Nx Cloud configuration**
  - [ ] 7.1.1: Review current caching strategy
  - [ ] 7.1.2: Configure distributed task execution (if needed)
  - [ ] 7.1.3: Set up remote caching for team
  - [ ] 7.1.4: Verify cache hit rates (target: > 50% after second run)
  - [ ] 7.1.5: Document Nx Cloud setup

- [ ] **7.2: Set up Sentry**
  - [ ] 7.2.1: Create Sentry project
  - [ ] 7.2.2: Install Sentry SDK in server: `pnpm add @sentry/node --filter @nx-monorepo/server`
  - [ ] 7.2.3: Install Sentry SDK in web: `pnpm add @sentry/nextjs --filter @nx-monorepo/web`
  - [ ] 7.2.4: Configure error tracking and performance monitoring
  - [ ] 7.2.5: Test error reporting with intentional error
  - [ ] 7.2.6: Verify error appears in Sentry dashboard

- [ ] **7.3: Configure TestSprite (optional)**
  - [ ] 7.3.1: Research TestSprite integration requirements
  - [ ] 7.3.2: Set up TestSprite account/project
  - [ ] 7.3.3: Configure TestSprite for the project
  - [ ] 7.3.4: Test basic TestSprite functionality
  - [ ] 7.3.5: Document TestSprite setup

- [ ] **7.4: Configure CodeRabbit**
  - [ ] 7.4.1: Review `.coderabbit.yaml` configuration
  - [ ] 7.4.2: Adjust settings to minimize noise during POC development
  - [ ] 7.4.3: Set up appropriate review triggers
  - [ ] 7.4.4: Configure to respect Nx structure
  - [ ] 7.4.5: Test by creating a PR

- [ ] **7.5: Verify Dependabot configuration**
  - [ ] 7.5.1: Review Dependabot configuration
  - [ ] 7.5.2: Ensure Dependabot is monitoring all manifests
  - [ ] 7.5.3: Configure appropriate update schedule
  - [ ] 7.5.4: Test that PR creation works (if updates available)

- [ ] **7.6: Complete external services documentation**
  - [ ] 7.6.1: Create `docs/external-services.md` with all service configurations
  - [ ] 7.6.2: Document API keys and access (in secure location)
  - [ ] 7.6.3: Document how to access each service
  - [ ] 7.6.4: Add setup instructions for new team members

### Success Criteria

**Nx Cloud:**
- [ ] Nx Cloud shows optimized cache hit rates (> 50% after second run)
- [ ] Remote caching works for team members
- [ ] Nx Cloud configuration documented

**Sentry:**
- [ ] Sentry project created and accessible
- [ ] Sentry SDK installed in `apps/server` and `apps/web`
- [ ] Test error appears in Sentry dashboard when triggered
- [ ] Sentry performance monitoring captures transactions
- [ ] Sentry setup documented

**TestSprite (optional):**
- [ ] TestSprite integration explored and documented
- [ ] Decision made about TestSprite usage

**CodeRabbit:**
- [ ] CodeRabbit reviews PRs appropriately
- [ ] CodeRabbit settings documented in `.coderabbit.yaml`
- [ ] CodeRabbit setup documented

**Dependabot:**
- [ ] Dependabot configuration verified
- [ ] Dependabot creates test PR for known outdated dependency
- [ ] Dependabot setup documented

**Documentation:**
- [ ] All service configurations documented in `docs/external-services.md`
- [ ] Team can access and use all services
- [ ] Setup instructions exist for new team members

**Stage 7 Estimated Time:** 2-3 hours (optional)

---

## DECISION POINT: Mobile App Timing

At this point, the web walking skeleton is complete and validated. We have proven:
- ✅ Web app connects to server
- ✅ Server connects to database
- ✅ Type safety works across the stack
- ✅ All QA infrastructure works
- ✅ Package versions are compatible
- ✅ CI/CD pipeline passes

**Decision to make:** When do we add the mobile app?

### Option A: Add Mobile Now (Stage 8)
**Pros:**
- Complete full-stack validation before POC
- Mobile-specific issues discovered early
- Template is truly complete

**Cons:**
- Delays POC implementation
- Mobile adds significant complexity
- POC might not need mobile immediately

### Option B: Defer Mobile to Phase 2
**Pros:**
- Move faster to POC features
- Validate POC idea on web first
- Add mobile once POC is proven valuable

**Cons:**
- Mobile integration issues surface later
- Might need to refactor POC for mobile

**Recommendation:** Discuss this decision point before proceeding.

---

## Stage 8: Mobile App (Conditional - Likely Phase 2)

### Goal

Add mobile application to complete the full cross-platform walking skeleton. This stage is conditional based on the decision point above.

**Note:** This stage may become Phase 2 instead of Phase 1.

### Sub-stages

- [ ] **8.1: Generate mobile application**
  - [ ] 8.1.1: Run: `pnpm exec nx g @nx/expo:app mobile --directory=apps/mobile`
  - [ ] 8.1.2: Review generated files and structure
  - [ ] 8.1.3: **Immediate test**: Run `pnpm exec nx run mobile:build` and verify success
  - [ ] 8.1.4: **Immediate test**: Run `pnpm exec nx run mobile:start` and verify Expo dev server starts
  - [ ] 8.1.5: **Immediate test**: Run `pnpm exec nx run mobile:lint` and verify passes
  - [ ] 8.1.6: **Immediate test**: Run `pnpm exec nx run mobile:test` and verify passes

- [ ] **8.2: Configure mobile-to-server connectivity**
  - [ ] 8.2.1: Decide: Expo tunnel vs ngrok vs local network IP
  - [ ] 8.2.2: Configure API base URL for mobile environment
  - [ ] 8.2.3: Document mobile networking setup
  - [ ] 8.2.4: Test connectivity from mobile device/simulator to server

- [ ] **8.3: Implement mobile UI**
  - [ ] 8.3.1: Set up Supabase client for React Native
  - [ ] 8.3.2: Create health check screen
  - [ ] 8.3.3: Initialize API client
  - [ ] 8.3.4: Display health check data from server
  - [ ] 8.3.5: Add button to ping server
  - [ ] 8.3.6: Test on Expo Go or development build

- [ ] **8.4: Cross-platform integration testing**
  - [ ] 8.4.1: Test that mobile and web can both read same data
  - [ ] 8.4.2: Test that data created on web appears on mobile (after refresh)
  - [ ] 8.4.3: Test that data created on mobile appears on web (after refresh)
  - [ ] 8.4.4: Verify data synchronization

- [ ] **8.5: Mobile-specific considerations**
  - [ ] 8.5.1: Decide: Expo Go sufficient or need development build?
  - [ ] 8.5.2: Document mobile E2E testing approach (or defer to Phase 3)
  - [ ] 8.5.3: Document offline scenarios handling (or defer to Phase 3)

### Success Criteria

- [ ] Mobile application generated in `apps/mobile/`
- [ ] Mobile app builds successfully
- [ ] Mobile app starts in Expo dev server
- [ ] Mobile app loads on device/simulator
- [ ] Mobile-to-server connectivity working (networking configured)
- [ ] Mobile app displays data from server/database
- [ ] Mobile app can write data to server/database
- [ ] Data syncs between web and mobile
- [ ] Changes made on web appear on mobile (after refresh)
- [ ] Changes made on mobile appear on web (after refresh)
- [ ] All tests pass including mobile tests
- [ ] Mobile setup documented

**Stage 8 Estimated Time:** 3-4 hours (if executed)

---

## Overall Success Criteria

Phase 1 is complete when ALL of the following are true:

### Functional Requirements
- [ ] Two applications exist and run: server, web
- [ ] Four shared packages exist and build: database, schemas, api-client, supabase-client
- [ ] Walking skeleton feature works end-to-end:
  - [ ] Web app displays data from Supabase via server
  - [ ] Web app can write data to Supabase via server
  - [ ] Data persists correctly in database

### Technical Requirements
- [ ] All package versions are documented and verified compatible
- [ ] All projects build successfully: `pnpm exec nx run-many -t build`
- [ ] All linting passes: `pnpm exec nx run-many -t lint`
- [ ] All tests pass: `pnpm exec nx run-many -t test`
- [ ] Test coverage is >= 80% across shared packages
- [ ] Type checking passes: `pnpm exec nx run-many -t typecheck`
- [ ] Nx dependency graph is clean (no circular dependencies)
- [ ] Nx caching works correctly (demonstrated by cache hits)

### QA Infrastructure Requirements
- [ ] Husky Git hooks are active and working
- [ ] Pre-commit hooks block bad commits
- [ ] CI pipeline passes on main branch
- [ ] E2E tests exist and pass for critical flows

### External Services Requirements (Optional)
- [ ] Sentry error tracking configured (optional)
- [ ] Nx Cloud is optimized and remote caching works
- [ ] CodeRabbit is configured appropriately
- [ ] Dependabot is actively monitoring dependencies
- [ ] TestSprite evaluated and configured if chosen (optional)

### Documentation Requirements
- [ ] Package version baseline exists in `docs/package-versions-baseline.md`
- [ ] Prerequisites documented in `docs/prerequisites.md`
- [ ] Environment setup documented in `docs/environment-setup.md`
- [ ] Architecture decisions documented in `docs/architecture-decisions.md`
- [ ] Walking skeleton architecture documented in `docs/walking-skeleton.md`
- [ ] External services documented in `docs/external-services.md`
- [ ] Troubleshooting guide exists
- [ ] Any deviations from plan are documented with rationale

### Validation Test (The Final Proof)
The ultimate test that Phase 1 is complete:

**A new developer should be able to:**
1. Clone the repository
2. Review prerequisites and install required tools
3. Run `pnpm install`
4. Set up environment variables (following documented steps)
5. Run `pnpm exec nx run-many -t build`
6. Run `pnpm exec nx run web:dev` and `pnpm exec nx run server:serve` concurrently
7. Access the web app and see the walking skeleton working
8. Make a change to a shared package
9. See only affected apps rebuild
10. Commit their change and see Git hooks enforce quality
11. Push and see CI pass

**If all 11 steps work flawlessly, Phase 1 is complete.**

---

## Next Steps After Phase 1

Once Phase 1 is complete, we will:

1. **Decide on mobile timing** - Add mobile now (Stage 8) or defer to later?
2. **Create Phase 2: POC PRD** - Define the exact functionality of the task management POC
3. **Create Phase 3: POC Implementation Plan** - Plan how to build the POC on top of our validated foundation
4. **Execute POC Implementation** - Build the POC with confidence that infrastructure works

The walking skeleton code (health check) can remain in the codebase as a reference implementation or be removed once the POC is complete.
