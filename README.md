# EduAgent

AI-powered tutoring platform that teaches through Socratic dialogue, spaced repetition, and adaptive learning paths. Mobile-first, built for learners aged 11+.

## Architecture

Nx monorepo with two apps and five shared packages:

```
apps/
  api/           Hono API on Cloudflare Workers
  mobile/        Expo (React Native) with NativeWind

packages/
  schemas/       Zod schemas — single source of shared types
  database/      Drizzle ORM + Neon PostgreSQL
  retention/     SM-2 spaced repetition algorithm
  factory/       Test data builders
  test-utils/    Shared test utilities and mocks
```

### Dependency Flow

```
apps/mobile  →  @eduagent/schemas, @eduagent/retention
apps/api     →  @eduagent/schemas, @eduagent/database, @eduagent/retention
@eduagent/database  →  @eduagent/schemas
@eduagent/retention →  (no workspace deps)
@eduagent/schemas   →  (no workspace deps — leaf package)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Expo SDK 54, React Native, NativeWind v4, Expo Router |
| API | Hono 4.11 on Cloudflare Workers |
| Database | Neon (PostgreSQL) + pgvector, Drizzle ORM |
| Auth | Clerk |
| Payments | Stripe |
| AI/LLM | Multi-provider (Claude, GPT-4, Gemini Flash) via AI SDK |
| Background Jobs | Inngest |
| Real-time | SSE streaming |
| Monorepo | Nx 22, pnpm, TypeScript 5.9 (strict) |
| Testing | Jest 30, co-located tests |
| CI/CD | GitHub Actions, Nx Cloud, EAS Build |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the API (Cloudflare Workers dev server)
pnpm exec nx dev api

# Start the mobile app (Metro bundler)
pnpm exec nx start mobile

# Run all tests
pnpm exec nx run-many -t test

# Lint all projects
pnpm exec nx run-many -t lint

# Type check
pnpm exec nx run-many -t typecheck
```

### Database

```bash
# Push schema to dev database
pnpm run db:push:dev

# Generate migration
pnpm run db:generate

# Apply migration
pnpm run db:migrate:dev

# Open Drizzle Studio
pnpm run db:studio:dev
```

### Environment Setup

Copy `.env.example` and fill in credentials:

```bash
cp .env.example .env.development.local
```

Required: `DATABASE_URL` (Neon connection string). See `.env.example` for all variables.

## Project Status

**Epics 0-5 complete** (API layer with 521 unit tests):
- Epic 0: User management, profiles, consent (Clerk + GDPR)
- Epic 1: Onboarding, curriculum generation
- Epic 2: Learning experience, homework help, session infrastructure
- Epic 3: Assessment, retention, adaptive teaching (SM-2)
- Epic 4: Progress tracking, motivation, dashboard
- Epic 5: Subscription, billing (Stripe)

**Phase 1 mobile screens** (NativeWind + Expo Router):
- Three-persona theming (teen dark / learner calm / parent light)
- Tab navigation (Home, Learning Book, More)
- Coaching card, chat, parent dashboard screens
- Currently using mock data — not yet wired to API

**Not yet implemented:** Auth (Clerk), real API integration, SSE streaming, database connection, E2E tests.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — Full architecture decisions and technical design
- [`docs/prd.md`](docs/prd.md) — Product requirements (117 FRs across 7 epics)
- [`docs/epics.md`](docs/epics.md) — Epic breakdown with stories
- [`docs/ux-design-specification.md`](docs/ux-design-specification.md) — UX patterns, theming, component specs
- [`docs/project_context.md`](docs/project_context.md) — AI agent rules and implementation patterns

## Common Commands

```bash
# Run specific project
pnpm exec nx run <project>:<target>

# Run across all projects
pnpm exec nx run-many -t <target>

# Only affected projects
pnpm exec nx affected -t <target>

# View dependency graph
pnpm exec nx graph
```

## License

Private
