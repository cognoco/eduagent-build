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
| NativeWind | **4.2.1** | v5 is preview. Pin with Tailwind CSS 3.4.19. |
| Hono | 4.11.x | Cloudflare Workers runtime |
| Drizzle ORM | Current stable | Type-safe SQL. NOT Prisma. |
| Neon | Managed | PostgreSQL + pgvector. `@neondatabase/serverless` driver. |
| Clerk | Current | `@clerk/clerk-expo` on mobile, JWKS on API |
| Inngest | v3 | `inngest/hono` serve adapter (Hono on Cloudflare Workers) |
| Zod | **4.x** | `^4.1.12` in schemas. Breaking changes from Zod 3 — see [Zod 4 migration](https://zod.dev/v4/changelog). |
| Nx | 22.2.0 | pnpm workspace, `@naxodev/nx-cloudflare` 5.0.x for Workers |
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

Read `docs/project_context.md` for the full rules. The critical ones:

### Code Patterns

- **Strict TypeScript.** Never loosen. Explicit return types on exports.
- **Named exports only.** No default exports except Expo Router pages.
- **`async`/`await` always.** Never `.then()` chains.
- **UUID v7** for entity PKs. ISO 8601 UTC strings in JSON.
- **Co-located tests.** `foo.ts` → `foo.test.ts` in same directory.

### API (Hono)

- Handlers inline for RPC type inference. Business logic in `services/`.
- **Route files must never import ORM primitives** (`eq`, `and`, table refs). Even one DB query belongs in a service.
- Services never import from `hono` — testable without mocking context.
- All routes prefixed `/v1/`. Zod validation on every input.
- Error responses use `ApiErrorSchema` from `@eduagent/schemas`.

### Mobile (Expo)

- Shared components are **persona-unaware**. Theming via CSS variables at root layout. Page-level route files (`_layout.tsx`) may read persona for routing guards and CSS variable injection.
- Route groups: `(auth)/`, `(learner)/`, `(parent)/` — persona is a first-class routing concern.
- Auth screens redirect to `/(learner)/home`; each group's layout guards persona and cross-redirects.
- TanStack Query for server state. React Context for auth/profile only.
- No Zustand at MVP. Expo Image (built into SDK 54) for all images.

### Database (Drizzle + Neon)

- `createScopedRepository(profileId)` for reads. For writes: updates/deletes add `profileId` filter with `and()`; inserts include `profileId` in `.values()`. For tables without direct `profileId` (e.g., `curriculumTopics`), verify ownership via parent chain before writing.
- One schema file per domain, not one giant file.
- Import from `@eduagent/database` barrel only, never internal paths.
- `drizzle-kit push` for dev. `drizzle-kit generate` + committed SQL for prod.

### LLM / AI

- Every LLM call through `services/llm/router.ts` → `routeAndCall()`. Never direct API calls. Import via barrel: `import { routeAndCall } from './llm'`.
- Model routing by escalation rung, not initial classification.
- Soft ceiling €0.05/session is monitoring, not a cutoff. Never interrupt learning.

### Background Jobs (Inngest)

- Use for any async work surviving request lifecycle. Never fire-and-forget.
- Event naming: `app/{domain}.{action}` (e.g., `app/session.completed`).
- Event handlers call services. Inngest functions orchestrate steps.
- Never put secrets/connection strings in event payloads. Use `getStepDatabase()` for DB access in steps.

## Dependency Direction (strictly enforced)

```
apps/mobile  →  @eduagent/schemas, @eduagent/retention
apps/api     →  @eduagent/schemas, @eduagent/database, @eduagent/retention
@eduagent/database  →  @eduagent/schemas
@eduagent/retention →  (no workspace deps)
@eduagent/schemas   →  (no workspace deps — leaf package)
```

This applies to imports, `tsconfig.json` references, AND `package.json` deps. Packages never import from apps. Circular dependencies are build-breaking errors.

**Exception — type-only API import:** `apps/mobile` has `@eduagent/api` as a **devDependency** for Hono RPC type inference (`import type { AppType } from '@eduagent/api'`). This is erased at compile time — zero API code enters the mobile bundle. The `hono` runtime (`hc` client) is a regular dependency. See `apps/mobile/src/lib/api-client.ts`.

## Anti-Patterns

| Do NOT | Instead |
|--------|---------|
| Write raw `WHERE profile_id = $1` (reads) | `createScopedRepository(profileId)` |
| Write without `profileId` scoping | Updates/deletes: `and(eq(table.id, id), eq(table.profileId, profileId))`. Inserts: include `profileId` in `.values()`. No direct FK: verify parent chain first. |
| Import `eq`/tables in route files | Move DB query to a service function |
| Put secrets in Inngest event payloads | `getStepDatabase()` helper reading runtime env |
| Call LLM providers directly | `routeAndCall()` from `services/llm/` (import via barrel: `from './llm'`) |
| Define client-facing types locally | Import from `@eduagent/schemas`. Client-facing = returned by exported service, in route response, or used by >1 file. |
| Use default exports | Named exports (except Expo Router pages) |
| Read `process.env` directly (API) | Typed config from `apps/api/src/config.ts`. Exception: Expo mobile uses `process.env.EXPO_PUBLIC_*` per Expo convention. |
| Import internal package paths | Import from barrel (`@eduagent/schemas`) |
| Create `__tests__/` directories | Co-locate tests next to source |
| Add Zustand/global state | TanStack Query or React Context |
| Render per-persona in components | CSS variables — components persona-unaware |
| Hardcode hex colors in components | NativeWind semantic classes (`bg-surface`, `text-primary`) |
| Check `persona` inside components | Only root `_layout.tsx` reads persona |

## Current Status

**Complete:**
- Epics 0-5 API layer (868 unit tests + 7 integration tests, all passing)
- All API route stubs wired to real services with DB persistence (interview, curriculum, assessment, consent)
- Signal extraction from interviews + curriculum generation pipeline
- Mobile screens: auth (Clerk), onboarding (subject creation → interview → curriculum), learner home, parent dashboard
- Mobile-API integration: Clerk auth wired, TanStack Query hooks for all major flows
- SSE streaming: mobile SSE client + `useStreamMessage` hook for learning/homework sessions
**Remaining stub routes (mock data):** progress, retention, streaks, settings, dashboard (real data), parking-lot, homework, billing, stripe-webhook.

**Not yet integrated:** Stripe payments, email provider (Resend/SendGrid), Expo Push notifications, real embedding vectors (pgvector), OCR provider.

## Required Reading (before any implementation work)

**You MUST read these before writing code:**

1. `docs/architecture.md` — Full architecture decisions and technical design
2. `docs/epics.md` — Epic breakdown with stories (understand what's built vs planned)
3. `docs/project_context.md` — Detailed AI agent implementation rules (47 rules)
4. `docs/ux-design-specification.md` — UX patterns, theming, component specs, accessibility

**Read as needed:**

- `docs/prd.md` — Product requirements (117 FRs)

## Git Rules

- **Never commit unless explicitly asked.**
- **Never force push, reset --hard, or destructive git operations.**
- Use commitlint conventional commits format.
- Pre-commit hook runs lint-staged + affected tests.
