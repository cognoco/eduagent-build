# Gold Standard Nx Monorepo Template

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

A production-ready Nx monorepo template demonstrating best practices for building type-safe, full-stack applications with shared business logic across web, server, and mobile platforms.

## What is this?

This is a **walking skeleton** implementation - a minimal, fully-integrated system that exercises all major architectural layers and infrastructure. It validates that:

- Multiple applications can share code through buildable libraries
- Type safety flows end-to-end from database to UI
- Testing strategy covers all levels (unit, integration, E2E)
- CI/CD pipeline ensures quality gates
- Development workflow is smooth and productive

**Current Status**: Phase 1 Stage 2 Complete
- ✅ Next.js 15 web application with Playwright E2E tests
- ✅ Express server with REST+OpenAPI for type-safe APIs
- ✅ Four shared packages: database (Prisma), schemas (Zod), api-client (REST+OpenAPI), supabase-client
- ✅ Complete QA infrastructure: Jest, ESLint, Prettier, CI/CD
- ⏳ In progress: QA hooks (Husky, lint-staged), Supabase configuration

## Technology Stack

### Applications
- **Web**: Next.js 15.2, React 19, Tailwind CSS
- **Server**: Express with REST+OpenAPI for type-safe APIs
- **Mobile** (deferred to Phase 2): Expo React Native

### Shared Libraries
- **Database**: Prisma + Supabase (PostgreSQL)
- **Schemas**: Zod validation schemas with TypeScript type inference
- **API Client**: REST+OpenAPI client for type-safe API calls
- **Supabase Client**: Browser and server Supabase client factories

### Infrastructure
- **Monorepo**: Nx 21.6 with remote caching and distributed task execution
- **Language**: TypeScript 5.9 (strict mode)
- **Testing**: Jest (unit), Playwright (E2E)
- **Linting**: ESLint 9 with flat config
- **Formatting**: Prettier
- **CI/CD**: GitHub Actions with Nx Cloud integration
- **Code Review**: CodeRabbit automated PR reviews
- **Dependencies**: Dependabot for automated updates

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm 8+
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd nx-monorepo

# Install dependencies
pnpm install

# Start development server
pnpm run dev
```

### Verify Setup

```bash
# Run all tests
pnpm run test

# Run linting
pnpm run lint

# Build all projects
pnpm run build

# Run E2E tests
pnpm run e2e
```

## Project Structure

```
nx-monorepo/
├── apps/
│   ├── web/              # Next.js web application
│   ├── web-e2e/          # Playwright E2E tests
│   └── server/           # Express API server
├── packages/             # Shared libraries
│   ├── database/         # Prisma client + utilities
│   ├── schemas/          # Zod schemas + TypeScript types
│   ├── api-client/       # REST+OpenAPI client
│   └── supabase-client/  # Supabase client configuration
├── docs/                 # Project documentation
│   ├── roadmap.md       # Implementation roadmap (MVP, Task App PoC, Extensions)
│   └── tech-findings-log.md  # Technical decisions log
└── .ruler/              # AI agent instructions
```

## Architecture

### Dependency Flow

The architecture follows strict unidirectional dependencies:

```
apps (web, mobile) → api-client → schemas
                      ↓
apps (server) → database → schemas
                ↓
            supabase-client
```

**Key Principles**:
- Applications depend on packages, never the reverse
- Packages can depend on other packages, but no circular dependencies
- All packages are buildable libraries with proper TypeScript compilation
- Use `pnpm exec nx graph` to visualize dependencies

### Type Safety

- **Database → TypeScript**: Prisma generates types from schema
- **Validation → Types**: Zod schemas with `z.infer<typeof schema>`
- **Server → Client**: REST+OpenAPI provides end-to-end type safety via generated types
- **Shared Types**: All types centralized in `@nx-monorepo/schemas`

### Package Naming

All packages use the scoped naming pattern: `@nx-monorepo/<package-name>`

```typescript
// Import from shared packages
import { createApiClient } from '@nx-monorepo/api-client';
import { exampleSchema } from '@nx-monorepo/schemas';
import { prisma } from '@nx-monorepo/database';
import { createSupabaseBrowserClient } from '@nx-monorepo/supabase-client';
```

## Common Commands

> **Note**: This documentation uses short-form Nx commands (`nx dev web`) for readability. AI agents and automated tools use the equivalent long-form syntax (`nx run web:dev`) for clarity and explicitness. Both forms are functionally identical.

### Workspace Scripts (Recommended)

These convenience scripts run tasks across all projects:

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

# Check code formatting
pnpm run format:check

# Format all code files
pnpm run format:write
```

### Project-Specific Commands

```bash
# Run dev server for web app
pnpm exec nx dev web

# Run server
pnpm exec nx serve server

# Build specific project
pnpm exec nx build web

# Test specific project
pnpm exec nx test schemas

# Show project details
pnpm exec nx show project web
```

### Advanced Nx Commands

```bash
# Build all apps
pnpm exec nx run-many -t build --projects=tag:type:app

# Test all libraries
pnpm exec nx run-many -t test --projects=tag:type:lib

# Build only affected projects
pnpm exec nx affected -t build

# View dependency graph
pnpm exec nx graph

# Clear Nx cache
pnpm exec nx reset
```

### Database Commands

The project uses **dotenv-cli** for environment-specific database operations. This ensures Prisma CLI commands use the correct database credentials based on the environment.

**Environment-specific commands:**

```bash
# Development Database
pnpm run db:push:dev          # Push schema changes to development
pnpm run db:migrate:dev       # Create and apply migration in development
pnpm run db:migrate:deploy:dev # Apply pending migrations to development
pnpm run db:studio:dev        # Open Prisma Studio for development database

# Test Database
pnpm run db:push:test         # Push schema changes to test
pnpm run db:migrate:test      # Create and apply migration in test
pnpm run db:migrate:deploy:test # Apply pending migrations to test
pnpm run db:studio:test       # Open Prisma Studio for test database

# Schema Management
pnpm run db:generate          # Generate Prisma Client (after schema changes)
```

**Important Notes:**

- ✅ **Always use npm scripts** - Never run raw Prisma CLI commands (`npx prisma`) directly
- ✅ **Scripts handle environment loading** - dotenv-cli automatically loads the correct `.env.*.local` file
- ❌ **Never commit .env files** - Only `.env.example` should be in git

**Environment files** (gitignored):
- `.env.development.local` - Development database credentials
- `.env.test.local` - Test database credentials
- `.env.example` - Template for setting up new environments

**Required environment variables:**
```env
# Transaction mode pooler for application queries
DATABASE_URL="postgresql://postgres.{project-ref}:{password}@aws-X-{region}.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Session mode pooler for migrations and schema operations
DIRECT_URL="postgresql://postgres.{project-ref}:{password}@aws-X-{region}.pooler.supabase.com:5432/postgres"

# Supabase public credentials (safe for client-side)
NEXT_PUBLIC_SUPABASE_URL="https://{project-ref}.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="{your-anon-key}"
```

**Getting Supabase connection strings:**

1. Go to: https://supabase.com/dashboard/project/{PROJECT_ID}/settings/database
2. Scroll to "Connection string" section
3. Select "Session pooler" tab
4. Copy the **exact hostname** from the connection string (don't assume `aws-0`, it may be `aws-1`, `aws-2`, etc.)
5. Update both `.env.development.local` and `.env.test.local`

**Why dotenv-cli?**

Prisma CLI doesn't respect `NODE_ENV` or load environment-specific files automatically. dotenv-cli explicitly specifies which `.env` file to load, ensuring database commands target the correct environment. See `docs/memories/adopted-patterns.md` (Pattern 13) for full rationale.

**Troubleshooting:**

- **"Tenant or user not found"** → Verify pooler hostname matches Supabase dashboard exactly
- **"Can't reach database server"** → Check network connectivity, verify you're using pooler (not direct connection)
- **Missing DATABASE_URL** → Ensure `.env.*.local` file exists and contains all required variables

For detailed troubleshooting, see:
- `docs/memories/adopted-patterns.md` - Pattern 13 (Database Environment Management)
- `docs/memories/tech-findings-log.md` - Supabase pooler hostname and IPv6 findings

## Development Workflow

### Adding a New Feature

1. **Define schemas first**: Add Zod schemas to `@nx-monorepo/schemas`
2. **Implement database layer**: Add Prisma models to `@nx-monorepo/database`
3. **Create server endpoints**: Add REST endpoints in `apps/server`
4. **Update API client**: Client types auto-update via OpenAPI spec generation
5. **Implement UI**: Build features in `apps/web`
6. **Write tests**: Add unit tests (packages), integration tests (server), E2E tests (apps)

### Creating a Shared Library

```bash
# Generate buildable TypeScript library
pnpm exec nx g @nx/js:library my-lib --directory=packages/my-lib --bundler=tsc

# For Prisma packages (special case)
pnpm exec nx g @nx/js:library my-lib --directory=packages/my-lib --bundler=none
```

### Before Committing

The project uses Husky pre-commit hooks (when configured):
- Linting and formatting run automatically
- TypeScript compilation validated
- Tests run for affected projects

Manual validation:
```bash
pnpm exec nx affected -t lint test build
```

## Testing Strategy

### Unit Tests (Jest)

- Co-located with source files: `src/**/*.spec.ts`
- Test individual functions, classes, components
- Fast execution (< 5 seconds per suite)
- Target: >= 80% code coverage

```bash
# Run all unit tests
pnpm exec nx run-many -t test

# Run with coverage
pnpm exec nx run web:test --coverage

# Watch mode
pnpm exec nx run web:test --watch
```

### Integration Tests

- Test interactions between layers (server → database)
- Located in `apps/server/src/**/*.spec.ts`
- May use test database or mocks

### E2E Tests (Playwright)

- Full browser-based user journey tests
- Located in `apps/web-e2e/src/`
- Test complete flows: page load → interaction → data persistence

```bash
# Run E2E tests
pnpm exec nx run web-e2e:e2e

# Run in UI mode
pnpm exec nx run web-e2e:e2e --ui
```

## CI/CD

GitHub Actions workflow runs on all PRs and main branch commits:

1. Install dependencies
2. Install Playwright browsers
3. Run: `pnpm exec nx run-many -t lint test build typecheck e2e`
4. Execute `nx fix-ci` if failures occur (self-healing)

**Nx Cloud Integration**: Enabled for distributed caching and task execution across team and CI.

## Documentation

- **[roadmap.md](docs/roadmap.md)**: Implementation roadmap (MVP, Task App PoC, Extensions)
- **[testing-reference.md](docs/memories/testing-reference.md)**: Comprehensive Jest and testing configuration reference
- **[troubleshooting.md](docs/memories/troubleshooting.md)**: Common development troubleshooting solutions
- **[tech-findings-log.md](docs/memories/tech-findings-log.md)**: Technical decisions and empirical findings
- **[CLAUDE.md](CLAUDE.md)**: AI agent instructions (auto-generated from `.ruler/AGENTS.md`)

## External Services

- **Nx Cloud**: Remote caching, distributed execution, CI analytics
- **CodeRabbit**: Automated PR reviews
- **Dependabot**: Automated dependency updates
- **Sentry**: Error tracking and performance monitoring ([setup guide](docs/guides/observability.md))

## Troubleshooting

### Nx Cache Issues

```bash
pnpm exec nx reset
rm -rf node_modules
pnpm install
```

### Build Failures

```bash
# Build in dependency order
pnpm exec nx run-many -t build

# Build only affected
pnpm exec nx affected -t build
```

### Jest Slow Exit (Windows)

If Jest hangs after tests complete:

```bash
# Disable Nx daemon
NX_DAEMON=false pnpm exec nx run-many -t test

# Or disable Nx Cloud
pnpm exec nx run-many -t test --no-cloud
```

See `docs/memories/tech-findings-log.md` for detailed diagnosis.

## Contributing

This is a template project. To use it:

1. Clone the repository
2. Remove git history: `rm -rf .git && git init`
3. Update package names in `package.json` files
4. Update scoped package names throughout the codebase
5. Configure external services (Nx Cloud, Sentry, etc.)

## Learn More

- [Nx Documentation](https://nx.dev)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [OpenAPI Specification](https://spec.openapis.org/)
- [Playwright Documentation](https://playwright.dev)

## License

MIT

---

Built with [Nx](https://nx.dev) - Smart Monorepos · Fast CI
