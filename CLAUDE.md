

<!-- Source: .ruler/AGENTS.md -->

# AI AGENT RULES

This file provides guidance to all AI agents when working with code in this repository.

## Project Overview

This is an Nx monorepo implementing a multi-platform PoC using a "walking skeleton" approach. The project is currently in **Phase 1** - validating infrastructure and tooling compatibility before feature development.

**Current State**: Basic Next.js web app with Playwright E2E tests. Server, mobile, and shared packages are planned but not yet implemented.

**Architecture Goal**: Three applications (web, server, mobile) sharing four common packages (database, schemas, api-client, supabase-client) with full type safety across the stack.

**Reference Document**: Always check `docs/P1-plan.md` for the current implementation plan, stage progress, and success criteria.

## Technology Stack

- **Web**: Next.js 15.2, React 19, Tailwind CSS
- **Server** (planned): Express with oRPC
- **Mobile** (planned): Expo React Native
- **Database**: Prisma + Supabase (PostgreSQL)
- **API**: oRPC (type-safe RPC framework)
- **Validation**: Zod schemas
- **Testing**: Jest (unit), Playwright (E2E)
- **Tooling**: Nx 21.6, TypeScript 5.9, ESLint 9, Prettier

## Common Commands

### Development

```bash
# Start web dev server
nx run web:dev
# or: nx dev web

# Start server (when implemented)
nx run server:serve

# Start mobile (when implemented)
nx run mobile:start

# Run multiple apps concurrently
nx run-many -t serve --projects=web,server
```

### Building

```bash
# Build single project
nx run web:build

# Build all apps
nx run-many -t build --projects=tag:type:app

# Build all libraries
nx run-many -t build --projects=tag:type:lib

# Build everything
nx run-many -t build

# Build only affected projects (after changes)
nx affected -t build
```

### Testing & Quality

```bash
# Run all unit tests
nx run-many -t test

# Run specific project tests
nx run web:test

# Run tests with coverage
nx run web:test --coverage

# Run E2E tests
nx run web-e2e:e2e

# Lint all projects
nx run-many -t lint

# Lint specific project
nx run web:lint

# Type checking (when typecheck target is configured)
nx run-many -t typecheck

# Run full CI validation locally
nx run-many -t lint test build typecheck e2e
```

### Nx Workspace

```bash
# View dependency graph
nx graph

# Show project details
nx show project web

# List all available plugins
nx list

# View affected projects
nx affected:graph

# Clear Nx cache
nx reset
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
  server/        # (planned) Express API server
  mobile/        # (planned) Expo React Native app

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
- Use `nx g @nx/js:library` for TypeScript-only packages
- Use `nx g @nx/node:library` for Node.js-specific packages
- Always make libraries **buildable** (`--buildable` flag) to enable proper caching
- Export a clean public API via `index.ts` barrel files
- Never export implementation details, only public interfaces

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

The project uses Husky pre-commit hooks (when configured):
- Linting and formatting run automatically on staged files
- TypeScript compilation is validated
- Tests run for affected projects
- Commits are blocked if quality checks fail

If hooks aren't yet configured, manually run:
```bash
nx affected -t lint test
```

### Creating Shared Code

When you need to share code between projects:

1. **Determine package location**: Does it belong in an existing package or need a new one?
2. **Generate library if needed**:
   ```bash
   nx g @nx/js:library my-new-lib --directory=packages/my-new-lib --buildable
   ```
3. **Implement and export**: Add code and export via `index.ts`
4. **Update dependents**: Import from `@nx-monorepo/my-new-lib`
5. **Verify build**: Run `nx run my-new-lib:build` to ensure it compiles
6. **Check graph**: Run `nx graph` to verify dependency structure

## Testing Strategy

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
1. ⏳ Generate Applications - Add server and mobile apps
2. ⏳ Generate Shared Packages - Create database, schemas, api-client, supabase-client
3. ⏳ QA Infrastructure - Set up Husky, lint-staged, pre-commit hooks
4. ⏳ Configure Infrastructure - Set up Supabase + Prisma
5. ⏳ Implement Walking Skeleton - Minimal health check feature end-to-end
6. ⏳ Complete Testing & External Services - E2E tests, Sentry, final validation

**Success Criteria**: A new developer can clone, install, build, and run the full stack with a working health check feature flowing through all layers.

**See `docs/P1-plan.md` for detailed stage breakdowns and checklists.**

## Troubleshooting

### Nx Cache Issues
```bash
# Clear cache and reinstall
nx reset
rm -rf node_modules
pnpm install
```

### TypeScript Path Resolution
- Ensure `tsconfig.base.json` includes paths for all packages
- Nx manages these automatically via generators
- If paths are missing, run `nx g @nx/js:library <name>` to regenerate

### Build Failures
```bash
# Build in dependency order (Nx handles this automatically)
nx run-many -t build

# Build only affected projects
nx affected -t build

# Show affected dependency graph
nx affected:graph
```

### Test Failures
```bash
# Run single test file
nx run web:test --testFile=path/to/spec.ts

# Run tests in watch mode
nx run web:test --watch

# Clear Jest cache
nx run web:test --clearCache
```

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

- **Always use Nx commands** (`nx run`, `nx run-many`, `nx affected`) instead of direct tool invocation (e.g., use `nx run web:build` not `cd apps/web && next build`)
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
