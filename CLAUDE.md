# EduAgent — AI Agent Instructions

AI-powered tutoring platform. Mobile-first, Socratic dialogue, spaced repetition, adaptive learning.

## Project Structure

```
apps/
  api/           Hono API (Cloudflare Workers)      @eduagent/api
  mobile/        Expo React Native (NativeWind)     @eduagent/mobile

packages/
  schemas/       Zod schemas, shared types           @eduagent/schemas
  database/      Drizzle ORM + Neon PostgreSQL       @eduagent/database
  retention/     SM-2 spaced repetition              @eduagent/retention
  factory/       Test data builders                  @eduagent/factory
  test-utils/    Shared mocks (Clerk, Neon, Inngest) @eduagent/test-utils
```

## Stack (pinned versions — do not upgrade without approval)

| Technology | Version | Notes |
|-----------|---------|-------|
| Expo SDK | 54 | SDK 55 is beta — do not use |
| NativeWind | **4.2.1** | v5 is preview. Pin with Tailwind CSS 3.4.17. |
| Hono | 4.11.x | Cloudflare Workers runtime |
| Drizzle ORM | Current stable | Type-safe SQL. NOT Prisma. |
| Neon | Managed | PostgreSQL + pgvector. `@neondatabase/serverless` driver. |
| Clerk | Current | `@clerk/clerk-expo` on mobile, JWKS on API |
| Inngest | v3 | `inngest/cloudflare` for Workers |
| Nx | 22 | pnpm workspace, `@naxodev/nx-cloudflare` for Workers |
| TypeScript | 5.9 | Strict mode everywhere |
| Jest | 30 | Co-located tests (no `__tests__/` dirs) |

## Essential Commands

**Always use `pnpm exec nx` — never npm, never yarn.**

```bash
pnpm exec nx run <project>:<target>      # Single project
pnpm exec nx run-many -t <target>        # All projects
pnpm exec nx affected -t <target>        # Changed projects only
pnpm exec nx dev api                     # API dev server
pnpm exec nx start mobile               # Metro bundler
pnpm run db:push:dev                     # Push schema to dev DB
pnpm run db:generate                     # Generate migration
```

## Key Architecture Rules

Read `docs/project_context.md` for the full 47 rules. The critical ones:

### Code Patterns

- **Strict TypeScript.** Never loosen. Explicit return types on exports.
- **Named exports only.** No default exports except Expo Router pages.
- **`async`/`await` always.** Never `.then()` chains.
- **UUID v7** for entity PKs. ISO 8601 UTC strings in JSON.
- **Co-located tests.** `foo.ts` → `foo.test.ts` in same directory.

### API (Hono)

- Handlers inline for RPC type inference. Business logic in `services/`.
- Services never import from `hono` — testable without mocking context.
- All routes prefixed `/v1/`. Zod validation on every input.
- Error responses use `ApiErrorSchema` from `@eduagent/schemas`.

### Mobile (Expo)

- Components are **persona-unaware**. Theming via CSS variables at root layout.
- TanStack Query for server state. React Context for auth/profile only.
- No Zustand at MVP. Expo Image (built into SDK 54) for all images.

### Database (Drizzle + Neon)

- Always use `createScopedRepository(profileId)` — never raw `WHERE profile_id =`.
- One schema file per domain, not one giant file.
- Import from `@eduagent/database` barrel only, never internal paths.
- `drizzle-kit push` for dev. `drizzle-kit generate` + committed SQL for prod.

### LLM / AI

- Every LLM call through `llm/orchestrator.ts` → `routeAndCall()`. Never direct API calls.
- Model routing by escalation rung, not initial classification.
- Soft ceiling €0.05/session is monitoring, not a cutoff. Never interrupt learning.

### Background Jobs (Inngest)

- Use for any async work surviving request lifecycle. Never fire-and-forget.
- Event naming: `app/{domain}.{action}` (e.g., `app/session.completed`).
- Event handlers call services. Inngest functions orchestrate steps.

## Dependency Direction (strictly enforced)

```
apps/mobile  →  @eduagent/schemas, @eduagent/retention
apps/api     →  @eduagent/schemas, @eduagent/database, @eduagent/retention
@eduagent/database  →  @eduagent/schemas
@eduagent/retention →  (no workspace deps)
@eduagent/schemas   →  (no workspace deps — leaf package)
```

Packages never import from apps. Circular dependencies are build-breaking errors.

## Anti-Patterns

| Do NOT | Instead |
|--------|---------|
| Write raw `WHERE profile_id = $1` | `createScopedRepository(profileId)` |
| Call LLM providers directly | `routeAndCall()` from `llm/orchestrator.ts` |
| Define types locally in routes | Import from `@eduagent/schemas` |
| Use default exports | Named exports (except Expo Router pages) |
| Read `process.env` directly | Typed config from `apps/api/src/config.ts` |
| Import internal package paths | Import from barrel (`@eduagent/schemas`) |
| Create `__tests__/` directories | Co-locate tests next to source |
| Add Zustand/global state | TanStack Query or React Context |
| Render per-persona in components | CSS variables — components persona-unaware |

## Current Status

**Complete:** Epics 0-5 (API layer, 521 tests), Phase 1 mobile screens (NativeWind + Expo Router + three-persona theming).

**Not yet implemented:** Clerk auth, real API wiring (mobile uses mock data), SSE streaming, Neon database connection, E2E tests.

## Documentation

- `docs/architecture.md` — Full architecture decisions
- `docs/prd.md` — Product requirements (117 FRs)
- `docs/epics.md` — Epic breakdown with stories
- `docs/ux-design-specification.md` — UX patterns and component specs
- `docs/project_context.md` — Detailed AI agent implementation rules (47 rules)

## Git Rules

- **Never commit unless explicitly asked.**
- **Never force push, reset --hard, or destructive git operations.**
- Use commitlint conventional commits format.
- Pre-commit hook runs lint-staged + affected tests.
