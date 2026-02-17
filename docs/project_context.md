---
project_name: 'eduagent'
user_name: 'Zuzka'
date: '2026-02-15'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 47
optimized_for_llm: true
source: 'docs/architecture.md'
---

# Project Context for AI Agents

_Critical rules and patterns for implementing code in EduAgent. Focus on unobvious details that agents might otherwise miss. Read `docs/architecture.md` for full architectural decisions._

---

## Technology Stack & Versions

**Pin these versions. Do not upgrade without explicit approval.**

| Technology | Version | Critical Notes |
|-----------|---------|---------------|
| Expo SDK | 54 | SDK 55 is beta — do not upgrade |
| NativeWind | **4.2.1** | v5 is preview only. Pin with Tailwind CSS 3.4.17. |
| Hono | 4.11.x | On Cloudflare Workers. Same framework if migrating to Railway. |
| Drizzle ORM | Current stable | Type-safe SQL. Not Prisma. |
| Neon | Managed | PostgreSQL + pgvector. Serverless driver `@neondatabase/serverless`. |
| Clerk | Current | `@clerk/clerk-expo` on mobile. JWKS verification on API. |
| Inngest | v3 | `inngest/cloudflare` for Workers serve target. |
| Nx | 22.5.0 | `@naxodev/nx-cloudflare` 6.0.0 for Workers deployment. |

**Monorepo:** Nx with pnpm. If Expo + pnpm symlink issues arise, add `node-linker=hoisted` to `.npmrc`.

## Critical Implementation Rules

### TypeScript & Language Rules

- **Strict mode everywhere.** `tsconfig.base.json` enforces strict. Never loosen.
- **`async`/`await` always.** Never `.then()` chains. Exception: `Promise.all()` for parallel ops.
- **Explicit return types on exported functions.** Inference OK for private helpers.
- **`.nullable()` for response schemas, `.optional()` for request schemas.** Never `.nullable().optional()` — pick one.
- **UUID v7** for all user-facing entity primary keys. v4 only for security tokens.
- **ISO 8601 strings in JSON** (`"2026-02-15T10:30:00Z"`). Always UTC. Frontend formats for display.

### Import & Export Rules

**Import ordering** (enforced via ESLint `import/order`):
```typescript
// 1. External packages
import { Hono } from 'hono';
import { z } from 'zod';

// 2. @eduagent/* workspace packages
import { sessionEventSchema } from '@eduagent/schemas';
import { createScopedRepository } from '@eduagent/database';

// 3. Relative imports
import { processExchange } from '../services/exchanges';
```

Groups separated by blank lines. **Named exports only.** No default exports except Expo Router page components.

### Hono (API) Rules

- **Handlers inline for Hono RPC type inference.** Business logic extracted to `services/`.
- **Route files must never import ORM primitives** (`eq`, `and`, table references, `createScopedRepository`). If a route needs data, call a service function. One DB query is still "business logic."
- **Services never import from `hono`.** They receive typed args, return typed results. Testable without mocking Hono context.
- **All routes prefixed `/v1/`.** App Store binaries can't be force-updated.
- **Error responses use typed envelope:**
  ```typescript
  { code: "QUOTA_EXCEEDED", message: "Human-readable", details?: unknown }
  ```
  Import `ApiErrorSchema` from `@eduagent/schemas`. Never ad-hoc JSON.
- **`/v1/inngest` uses Inngest signing key, NOT Clerk JWT.** Skip auth middleware for this route.
- **Zod validation on every route handler input.** Never trust client.

### Expo (Mobile) Rules

- **Components are persona-unaware.** No conditional rendering based on persona type. Theming via CSS variables set at root layout.
  - WRONG: `if (persona === 'teen') { color = '#1a1a1a'; }` or `isDark = persona === 'teen'`
  - WRONG: Hardcoded hex colors in component props (`color="#7c3aed"`, `backgroundColor: '#262626'`)
  - RIGHT: Use NativeWind semantic classes (`bg-surface`, `text-primary`, `border-accent`) that resolve via CSS variables. The root `_layout.tsx` sets variables per persona — components never need to know which persona is active.
- **TanStack Query for all server state.** React Context for auth + active profile only. Local state for UI interactions.
- **No Zustand at MVP.** Add only when shared client state crosses navigation boundaries and doesn't come from the server.
- **Expo Router route groups:** `(auth)/`, `(learner)/`, `(parent)/`. Root `_layout.tsx` sets persona CSS variables.
- **Expo Image** (built into SDK 54) for all images. No additional library.

### Database & Data Rules

- **Always use `createScopedRepository(profileId)` for reads.** Never write raw `WHERE profile_id =` clauses for reads.
- **For writes (`db.insert`, `db.update`, `db.delete`), add defence-in-depth `profileId` filter.** The scoped repo only provides read methods. For writes, always include `eq(table.profileId, profileId)` in the WHERE clause using `and()`:
  ```typescript
  // Read — use scoped repo
  const repo = createScopedRepository(db, profileId);
  const row = await repo.assessments.findFirst(eq(assessments.id, id));

  // Update/Delete — defence-in-depth profileId filter in WHERE
  await db.update(assessments).set(values)
    .where(and(eq(assessments.id, id), eq(assessments.profileId, profileId)));

  // Insert — always include profileId in values
  await db.insert(assessments).values({ ...values, profileId });
  ```
  For tables **without a direct `profileId` column** (e.g., `curriculumTopics` via `curricula → subjects`), verify ownership through the parent chain **before** writing:
  ```typescript
  const subject = await getSubject(db, profileId, subjectId);
  if (!subject) throw new Error('Subject not found');
  // Ownership verified — now safe to write
  await db.update(curriculumTopics).set({ skipped: true })
    .where(eq(curriculumTopics.id, topicId));
  ```
- **Drizzle relational queries for CRUD.** `sql` template tag for complex aggregations (dashboard, retention analytics).
- **Schema files: one per domain,** not one giant file and not one per table.
- **`packages/database/` is the single access point.** Import from `@eduagent/database`, never from internal paths.
- **pgvector queries in `queries/embeddings.ts`** — raw SQL with cosine distance, not Drizzle relational.
- **Migration workflow:** `drizzle-kit push` for dev, `drizzle-kit generate` + committed SQL for staging/prod. Never `push` against production.

### LLM & AI Rules

- **No direct LLM API calls.** Every call goes through `llm/orchestrator.ts` → `routeAndCall()`. Ensures metering, logging, provider fallback, cost tracking. A direct `fetch` to Anthropic/OpenAI bypasses metering.
- **Embedding generation is separate from LLM orchestration.** Different call pattern (single vector, no streaming). Lives in `services/embeddings.ts`.
- **Soft ceiling €0.05/session is a monitoring threshold, not a cutoff.** Never interrupt a learning session for cost reasons.
- **Model routing by conversation state (escalation rung),** not initial classification. Gemini Flash for rung 1-2, reasoning models for rung 3+.

### Background Jobs (Inngest) Rules

- **Use Inngest for any async work that should survive a request lifecycle.** Never fire-and-forget in a route handler.
- **Event naming: `app/{domain}.{action}`** — e.g., `app/session.completed`, `app/coaching.precompute`.
- **Payloads always include `profileId` + `timestamp`.** Never include secrets or connection strings (e.g., `databaseUrl`) — event payloads are serialized to queues.
- **Database access inside Inngest steps:** Use a `getStepDatabase()` helper that reads `process.env['DATABASE_URL']` at runtime. Cloudflare Worker env bindings are request-scoped and unavailable in step functions.
- **Event handlers call `services/` for logic.** Inngest functions orchestrate steps, services do the work.
- **`session.completed` chain:** SM-2 → coaching card KV write → dashboard update → embedding generation. Test full chain with `inngest/test`, not just individual steps.

### Caching Rules

- **Workers KV for coaching cards + subscription status.** Write-rare/read-often. No Redis/Upstash.
- **KV coaching card TTL: 24h safety net.** Overwritten on recompute. On miss, query Neon and backfill.
- **Never call Stripe during a learning session.** Read from local DB (webhook-synced subscription state).

## Testing Rules

- **Co-located tests.** `sessions.ts` → `sessions.test.ts` in same directory. No `__tests__/` directories.
- **Integration/E2E tests** in top-level `tests/` directory (exception to co-location).
- **`packages/factory/` for test data.** Imports types from `@eduagent/schemas` — TypeScript catches schema drift at build time.
- **`packages/test-utils/` for shared mocks** (Clerk, Neon, Inngest).
- **Inngest lifecycle chain needs integration test** (`inngest/test` mode) — unit tests of individual steps give false confidence.

## Code Organization Rules

- **Feature-based components,** not type-based. `components/coaching/`, `components/session/`, not `components/buttons/`, `components/cards/`.
- **Package imports from barrel file only:**
  ```typescript
  // CORRECT
  import { sessionEventSchema } from '@eduagent/schemas';
  // WRONG
  import { sessionEventSchema } from '@eduagent/schemas/src/session/events';
  ```
- **Dependency direction (strictly enforced — applies to ALL dependency graphs):**
  ```
  apps/mobile  →  @eduagent/schemas, @eduagent/retention
  apps/api     →  @eduagent/schemas, @eduagent/database, @eduagent/retention
  @eduagent/database  →  @eduagent/schemas
  @eduagent/retention →  (no workspace deps)
  @eduagent/schemas   →  (no workspace deps — leaf package)
  ```
  This applies to: runtime `import` statements, `tsconfig.json` project `references`, AND `package.json` `dependencies`. For example, `apps/mobile/tsconfig.json` must NOT reference `../api` — that would create a build-time dependency from mobile→api.
  `packages/` never imports from `apps/`. Circular dependencies are build-breaking errors.
- **Cross-service calls through exported function interfaces.** Never import internals from another service file.

## Development Workflow Rules

- **Commit quality:** Husky + lint-staged + commitlint enforced from forked repo.
- **CI matrix:** lint → typecheck → test → build → deploy. Nx Cloud for remote caching and affected-only builds.
- **Neon branching** for dev/staging databases. No local PostgreSQL.
- **Environment config:** Typed config object (`apps/api/src/config.ts`) validated with Zod at startup. Never `process.env.NODE_ENV` checks in application code. Never raw `process.env` reads.

## Critical Anti-Patterns

| Do NOT | Instead |
|--------|---------|
| Write `WHERE profile_id = $1` manually (reads) | Use `createScopedRepository(profileId)` |
| Write/update without `profileId` filter | Add `and(eq(table.id, id), eq(table.profileId, profileId))` on all writes |
| Import ORM primitives (`eq`, tables) in route files | Move the query to a service function |
| Put `databaseUrl` or secrets in Inngest event payloads | Use `getStepDatabase()` helper reading runtime env |
| Call LLM providers directly | Use `routeAndCall()` from `llm/orchestrator.ts` |
| Define API/client-facing types locally | Import from `@eduagent/schemas`. A type is "client-facing" if it's returned by an exported service function, appears in a route response, or is used by more than one file. Local types are OK only for: single-function parameter bundles, intermediate computation shapes within one function body, and mapper helpers. |
| Use default exports | Use named exports (except Expo Router pages) |
| Read `process.env` directly | Use typed config from `apps/api/src/config.ts` |
| Import from internal package paths | Import from package barrel (`@eduagent/schemas`) |
| Create `__tests__/` directories | Co-locate tests next to source files |
| Add Zustand/global state store | Use TanStack Query (server state) or React Context (auth/profile) |
| Render differently per persona in components | Use CSS variables — components are persona-unaware |
| Hardcode hex colors in component props/styles | Use NativeWind semantic classes (`bg-surface`, `text-primary`) |
| Check `persona` inside any component | Only root `_layout.tsx` reads persona; components use semantic tokens |
| Call Stripe during learning sessions | Read from local DB (webhook-synced subscription state) |
| Use `.then()` chains | Use `async`/`await` |
| Put all schemas in one file | One schema file per domain |
| Fire async work from route handlers | Use Inngest for durable background jobs |

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Refer to `docs/architecture.md` for full architectural decisions, project structure, and integration details

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack or patterns change
- Remove rules that become obvious over time

Last Updated: 2026-02-17
