# AI AGENT RULES

This file provides guidance to all AI agents when working with code in this repository.

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
created: 2025-10-21
last-updated: 2025-10-21  # ✅ Update this when making semantic changes
Modified: 2025-10-21T14:39  # ❌ NEVER touch this - auto-managed
---
```

---

## Project Overview

This is a **gold standard Nx monorepo template** designed as a production-ready foundation for multi-platform applications. The project uses a "walking skeleton" approach to validate infrastructure and tooling before feature development.

**Current State**: Phase 1 Stage 2 complete - Full infrastructure validated:
- ✅ Next.js web application with Playwright E2E tests
- ✅ Express server application with oRPC
- ✅ Four shared packages: database (Prisma), schemas (Zod), api-client (oRPC), supabase-client
- ✅ Complete QA infrastructure: Jest, ESLint, Prettier, CI/CD
- ⏳ In progress: QA infrastructure (Husky, lint-staged), Supabase configuration

**Architecture Goal**: Production-ready monorepo template demonstrating best practices for:
- Cross-platform type safety (web, server, future mobile)
- Shared business logic via buildable libraries
- End-to-end type safety with oRPC
- Database-first development with Prisma + Supabase
- Comprehensive testing strategy (unit, integration, E2E)

**Reference Document**: Always check `docs/P1-plan.md` for the current implementation plan, stage progress, and success criteria.

## Technology Stack

- **Web**: Next.js 15.2, React 19, Tailwind CSS
- **Server**: Express with oRPC
- **Mobile** (deferred to Phase 2): Expo React Native
- **Database**: Prisma + Supabase (PostgreSQL)
- **API**: oRPC (type-safe RPC framework)
- **Validation**: Zod schemas
- **Testing**: Jest (unit), Playwright (E2E)
- **Tooling**: Nx 21.6, TypeScript 5.9, ESLint 9, Prettier

## Common Commands

### Workspace Scripts (Recommended for Daily Development)

These convenience scripts are defined in the root `package.json` and run tasks across all projects:

```bash
# Start web dev server
pnpm run dev

# Build all projects
pnpm run build

# Run all tests
pnpm run test

# Lint all projects
pnpm run lint

# Run E2E tests
pnpm run e2e
```

### Development (Direct Nx Commands)

Use these for project-specific or advanced tasks:

```bash
# Start web dev server
pnpm exec nx run web:dev
# or: pnpm exec nx dev web

# Start server
pnpm exec nx run server:serve

# Start mobile (when implemented)
pnpm exec nx run mobile:start

# Run multiple apps concurrently
pnpm exec nx run-many -t serve --projects=web,server
```

### Building

```bash
# Build single project
pnpm exec nx run web:build

# Build all apps
pnpm exec nx run-many -t build --projects=tag:type:app

# Build all libraries
pnpm exec nx run-many -t build --projects=tag:type:lib

# Build everything (or use: pnpm run build)
pnpm exec nx run-many -t build

# Build only affected projects (after changes)
pnpm exec nx affected -t build
```

### Testing & Quality

```bash
# Run all unit tests (or use: pnpm run test)
pnpm exec nx run-many -t test

# Run specific project tests
pnpm exec nx run web:test

# Run tests with coverage
pnpm exec nx run web:test --coverage

# Run E2E tests (or use: pnpm run e2e)
pnpm exec nx run web-e2e:e2e

# Lint all projects (or use: pnpm run lint)
pnpm exec nx run-many -t lint

# Lint specific project
pnpm exec nx run web:lint

# Type checking (when typecheck target is configured)
pnpm exec nx run-many -t typecheck

# Run full CI validation locally
pnpm exec nx run-many -t lint test build typecheck e2e
```

### Nx Workspace

```bash
# View dependency graph
pnpm exec nx graph

# Show project details
pnpm exec nx show project web

# List all available plugins
pnpm exec nx list

# View affected projects
pnpm exec nx affected:graph

# Clear Nx cache
pnpm exec nx reset
```

### Database (when implemented)

```bash
# Generate Prisma client
pnpm --filter @nx-monorepo/database prisma generate

# Push schema to database
pnpm --filter @nx-monorepo/database prisma db push

# Run migrations
pnpm --filter @nx-monorepo/database prisma migrate dev

# Open Prisma Studio
pnpm --filter @nx-monorepo/database prisma studio
```

## Architecture Guidelines

### Monorepo Structure

```
apps/
  web/           # Next.js web application
  web-e2e/       # Playwright E2E tests for web
  server/        # Express API server
  mobile/        # (deferred to Phase 2) Expo React Native app

packages/        # (planned) Shared libraries
  database/      # Prisma client + database utilities
  schemas/       # Zod schemas + TypeScript types
  api-client/    # oRPC client factory
  supabase-client/ # Supabase client configuration
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
- **End-to-end types**: oRPC provides type inference from server to client
- **No type assertions**: Prefer proper typing and validation over `as` casting
- **Shared types**: Never duplicate type definitions - centralize in `schemas` package

## Development Workflow

### Adding a New Feature

1. **Define schemas first**: Add Zod schemas to `@nx-monorepo/schemas`
2. **Implement database layer**: Add Prisma models and queries to `@nx-monorepo/database`
3. **Create server endpoints**: Add oRPC routes in `apps/server`
4. **Update API client**: Ensure client types auto-update via oRPC
5. **Implement UI**: Build features in `apps/web` and/or `apps/mobile`
6. **Write tests**: Add unit tests (packages), integration tests (server), E2E tests (apps)

### Before Committing

The project uses Husky pre-commit hooks to maintain code quality:

**What runs automatically:**
- **lint-staged**: Runs ESLint and Prettier on staged files only
- **Affected tests**: Runs tests only for projects affected by your changes (via `nx affected -t test --base=HEAD~1`)
- Commits are blocked if any checks fail

**Pre-commit hook optimization:**
```bash
# .husky/pre-commit
pnpm exec lint-staged
pnpm exec nx affected -t test --base=HEAD~1
```

**Why `nx affected` instead of all tests:**
- ✅ Faster commits: Only runs tests for changed code
- ✅ Scales with monorepo growth: Performance stays consistent as projects are added
- ✅ Immediate feedback: Catches regressions before commit
- ✅ CI safety net: Full test suite still runs in GitHub Actions

**Manual quality checks (if hooks disabled):**
```bash
pnpm exec nx affected -t lint test
```

### Creating Shared Code

When you need to share code between projects:

1. **Determine package location**: Does it belong in an existing package or need a new one?
2. **Generate library if needed**:
   ```bash
   pnpm exec nx g @nx/js:library my-new-lib --directory=packages/my-new-lib --buildable
   ```
3. **Implement and export**: Add code and export via `index.ts`
4. **Update dependents**: Import from `@nx-monorepo/my-new-lib`
5. **Verify build**: Run `pnpm exec nx run my-new-lib:build` to ensure it compiles
6. **Check graph**: Run `pnpm exec nx graph` to verify dependency structure

## Testing Strategy

### Test File Location

Tests are co-located with their source files in the `src/` directory, following Next.js 15 best practices:

**Pattern**: Place test files next to the code they test
- `src/app/page.tsx` → `src/app/page.spec.tsx`
- `src/components/Button.tsx` → `src/components/Button.spec.tsx`

**Naming**: Use `.spec.tsx` or `.test.tsx` suffix

**Jest Configuration** (`apps/web/jest.config.ts`):
```typescript
testMatch: [
  '<rootDir>/src/**/*.(spec|test).[jt]s?(x)',
],
collectCoverageFrom: [
  'src/**/*.{ts,tsx,js,jsx}',
  '!src/**/*.spec.{ts,tsx,js,jsx}',
  '!src/**/*.test.{ts,tsx,js,jsx}',
],
```

**Rationale**:
- Aligns with Next.js 15 App Router conventions
- Improves developer experience (tests near code)
- Simplifies imports (relative paths shorter)
- Industry standard for component-based architectures (2025)

### Unit Tests (Jest)

- Located in `*.spec.ts` files alongside source code
- Test individual functions, classes, and components in isolation
- Target: >= 80% code coverage
- Run fast (< 5 seconds per test suite)

**Example**:
```typescript
// packages/schemas/src/user.schema.spec.ts
import { userSchema } from './user.schema';

describe('userSchema', () => {
  it('should validate correct user data', () => {
    expect(() => userSchema.parse({ id: '123', name: 'Alice' })).not.toThrow();
  });
});
```

### Integration Tests (Jest)

- Test interactions between layers (e.g., server endpoint → database)
- Located in `apps/server/src/**/*.spec.ts`
- May use test database or mocks
- Slower than unit tests but faster than E2E

### E2E Tests (Playwright)

- Full browser-based user journey tests
- Located in `apps/web-e2e/src/`
- Test complete flows: page load → interaction → data persistence
- Run in CI with headless browsers

**Example**:
```typescript
// apps/web-e2e/src/health-check.spec.ts
test('health check flow', async ({ page }) => {
  await page.goto('/health');
  await expect(page.getByText('Health Status')).toBeVisible();
  await page.click('button:has-text("Ping")');
  await expect(page.getByText('Pong')).toBeVisible();
});
```

### Jest Configuration Patterns

This project follows Nx best practices for Jest configuration with a workspace-level preset pattern.

#### Workspace Preset

All projects extend a shared `jest.preset.js` at the workspace root:

```javascript
// jest.preset.js
const nxPreset = require('@nx/jest/preset').default;
module.exports = { ...nxPreset };
```

This ensures consistent Jest behavior across all projects while allowing per-project customization.

#### Project-Level Configuration

Each project has its own `jest.config.ts` that extends the workspace preset:

```typescript
// apps/web/jest.config.ts
export default {
  displayName: '@nx-monorepo/web',
  preset: '../../jest.preset.js',  // Extend workspace preset
  testEnvironment: 'jsdom',         // or 'node' for Node.js projects
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  coverageDirectory: '../../coverage/apps/web',
  // ... project-specific settings
};
```

**Note**: Next.js projects (like `apps/web`) use the `next/jest` wrapper with `testEnvironment: 'jsdom'` for browser-like testing. The Next.js Jest configuration also includes the `@nx/react/plugins/jest` transform for handling static assets and other Next.js-specific features.

#### TypeScript Test Configuration

**Type Isolation Pattern**: Test types are separated from production types using `tsconfig.spec.json`:

```json
// apps/web/tsconfig.spec.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/jest",
    "types": ["jest", "node"]  // Test-specific types
  },
  "include": [
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx"
  ],
  "references": [
    { "path": "./tsconfig.json" }  // Reference to production config
  ]
}
```

**Important**: Production `tsconfig.json` should NOT include test types. Keep test types isolated to `tsconfig.spec.json`.

#### Adding Jest to New Projects

To add Jest testing to a new project:

```bash
# Generate Jest configuration for a project
pnpm exec nx g @nx/jest:configuration <project-name>
```

Nx automatically:
- Creates `jest.config.ts` extending the workspace preset
- Creates `tsconfig.spec.json` with proper type isolation
- Adds test target to `project.json`
- Configures coverage directory

**No manual setup required** - Nx handles all configuration automatically.

#### Optional Testing Enhancements

For advanced testing patterns (jest-dom, user-event, MSW, custom render), see [`docs/testing-enhancements.md`](../docs/testing-enhancements.md).

These enhancements are optional - start simple and add complexity only when needed.

### Coverage Testing

#### Coverage Scripts

The workspace provides convenient scripts for running tests with coverage reporting:

```bash
# Run coverage for all projects
pnpm run test:coverage

# Run coverage for specific projects
pnpm run test:coverage:web
pnpm run test:coverage:server
```

#### Coverage Thresholds

All projects use standardized coverage thresholds to ensure code quality:

```typescript
// apps/web/jest.config.ts
coverageThreshold: {
  global: {
    branches: 10,    // Target: 80% (Phase 2+)
    functions: 10,   // Target: 80% (Phase 2+)
    lines: 10,       // Target: 80% (Phase 2+)
    statements: 10   // Target: 80% (Phase 2+)
  }
}
```

**Current thresholds (10%)**: Permissive during Phase 1 walking skeleton - establishes infrastructure without blocking development.

**Target thresholds (80%)**: Will be enforced starting in Phase 2 when feature development begins.

**Coverage metrics explained**:
- **Statements**: Individual lines of code executed
- **Lines**: Physical lines in the file that were executed
- **Functions**: Whether each function was called
- **Branches**: Decision points tested (if/else, switch, ternaries, &&, ||)

#### Coverage Reports

After running coverage, HTML reports are generated in `coverage/<project>/index.html`:

```bash
# Run coverage for web app
pnpm run test:coverage:web

# Open the HTML report (manual)
# Windows: start coverage/apps/web/index.html
# Mac: open coverage/apps/web/index.html
# Linux: xdg-open coverage/apps/web/index.html
```

Reports show:
- Per-file coverage percentages
- Highlighted uncovered lines
- Branch coverage visualization
- Drilldown from project → file → line level

#### Coverage Directory Structure

Coverage reports follow a consistent pattern across all projects:

```
coverage/
  apps/
    web/
      index.html          # HTML report entry point
      app/                # Per-directory coverage
      page.tsx.html       # Per-file coverage details
      lcov.info           # LCOV format for CI/tooling
      coverage-final.json # Raw coverage data
    server/
      index.html
      lcov.info
      coverage-final.json
  packages/
    database/
      index.html
      lcov.info
      coverage-final.json
```

**Pattern**: `coverageDirectory: '../../coverage/<type>/<name>'` in each project's `jest.config.ts`

The `/coverage` directory is gitignored - reports are generated locally and in CI but not committed.

#### Adding Coverage to New Projects

When generating a new project with Jest:

```bash
pnpm exec nx g @nx/jest:configuration <project-name>
```

Then manually add coverage threshold to the generated `jest.config.ts`:

```typescript
coverageThreshold: {
  global: {
    branches: 10,    // Target: 80% (Phase 2+)
    functions: 10,   // Target: 80% (Phase 2+)
    lines: 10,       // Target: 80% (Phase 2+)
    statements: 10   // Target: 80% (Phase 2+)
  }
}
```

And ensure `coverageDirectory` follows the pattern: `'../../coverage/<apps|packages>/<project-name>'`

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on all PRs and main branch commits:

1. Install dependencies with `npm ci --legacy-peer-deps`
2. Install Playwright browsers
3. Run: `nx run-many -t lint test build typecheck e2e`
4. Execute `nx fix-ci` if failures occur (self-healing CI)

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

### Nx Cache Issues
```bash
# Clear cache and reinstall
pnpm exec nx reset
rm -rf node_modules
pnpm install
```

### TypeScript Path Resolution
- Ensure `tsconfig.base.json` includes paths for all packages
- Nx manages these automatically via generators
- If paths are missing, run `pnpm exec nx g @nx/js:library <name>` to regenerate

### Build Failures
```bash
# Build in dependency order (Nx handles this automatically)
pnpm exec nx run-many -t build

# Build only affected projects
pnpm exec nx affected -t build

# Show affected dependency graph
pnpm exec nx affected:graph
```

### Test Failures
```bash
# Run single test file
pnpm exec nx run web:test --testFile=path/to/spec.ts

# Run tests in watch mode
pnpm exec nx run web:test --watch

# Clear Jest cache
pnpm exec nx run web:test --clearCache
```

### Jest exits slowly or appears to hang (Windows)

**Symptom**: Jest prints "did not exit one second after the test run" or the console shows "Terminate batch job (Y/N)?". Tests complete successfully but the process doesn't exit cleanly.

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

### Prisma Issues
```bash
# Regenerate Prisma client after schema changes
pnpm --filter @nx-monorepo/database prisma generate

# Reset database (WARNING: deletes all data)
pnpm --filter @nx-monorepo/database prisma migrate reset

# View database schema
pnpm --filter @nx-monorepo/database prisma studio
```

## Important Notes

- **Check technical findings first**: Before suggesting architecture, tooling, or configuration changes, review `docs/memories/tech-findings-log.md` for documented decisions, known issues, and empirical findings that may prevent rework
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
