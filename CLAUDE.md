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
- Error responses use `apiErrorSchema` (schema) / `ApiError` (type) from `@eduagent/schemas`.

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

**Complete — all routes production-ready:**
- Epics 0-5: full API layer (1,302 API tests + 315 mobile tests + 8 integration test suites, all passing)
- All 21 route groups wired to real services with DB persistence
- Mobile: 20+ screens (41 test suites), all using real API calls via TanStack Query + Hono RPC
- Background jobs: 9 Inngest functions (session-completed chain, trial-expiry, consent-reminders, account-deletion, review-reminder, payment-retry, quota-reset, subject-auto-archive)
- Auth: Clerk (SSO + email/password), PasswordInput with show/hide + requirements
- Billing: Stripe integration (checkout, portal, webhooks, KV-cached status, quota metering)
- Email: Resend integration (consent emails, reminders)
- Push: Expo Push API (trial warnings, review reminders, daily reminders)
- Error tracking: Sentry (API via `@sentry/cloudflare`, mobile via `@sentry/react-native`)
- Embeddings: Voyage AI (session content → pgvector storage in session-completed chain)
- SSE streaming: mobile SSE client + `useStreamMessage` hook for learning/homework sessions
- Coaching cards: precompute service, 24h cache, `GET /v1/coaching-card` route, `AdaptiveEntryCard` wired on home screen
- Session close summary: `SessionCloseSummary` screen at `/session-summary/[sessionId]`, replaces raw exchange-count display
- Parent dashboard: real data from DB via `familyLinks` (children list, session counts, time, retention signals)
- Failed recall remediation (FR52-58): `processRecallTest()` returns `failureAction: redirect_to_learning_book` after 3+ failures; `startRelearn()` resets retention card and creates new session
- Interleaved retrieval (FR92): `services/interleaved.ts`, `interleavedSessionStartSchema`, `GET /v1/retention/stability`, full stack implemented
- Recall bridge after homework (FR Story 2.7): `POST /v1/sessions/:sessionId/recall-bridge` + `generateRecallBridge()` service
- Homework camera capture (Story 2.5): ML Kit OCR on device, camera state machine + `useHomeworkOcr` hook + full camera UI; server-side `OcrProvider` interface with stub implementation in `services/ocr.ts`
- XP ledger: `insertSessionXpEntry()` wired in session-completed Step 3
- Needs-deepening auto-promotion (FR63): `updateNeedsDeepeningProgress()` wired in session-completed Step 1b

- UX audit remediation (55 gaps): consent gating (C16/COPPA), camera-first homework (C8), parent transcript view (C13), session mode configs (C7), math rendering (M21), animations (M22), dark mode, confidence scoring, retention trends, ProfileSwitcher, Inter font, Ionicons, WCAG contrast fixes, shared Button component

**Not yet integrated:** OCR provider (server-side fallback; ML Kit primary on device).

**UX gaps (from 2024 persona walkthroughs, not yet in canonical docs):**
- Post-approval child landing screen — what child sees after parent grants GDPR consent
- Parent account-owner landing — what parent sees after clicking consent email link in browser
- Child-friendly paywall — age-appropriate "Ask Parent to Subscribe" instead of standard Stripe paywall
- GDPR consent revocation UX flow
- Preview mode button on pending-consent screen

**Deferred to Phase 2:**
- Profile switch PIN/biometric authentication — deferred per UX spec Party Mode revision (line 1631). **Security note:** `profiles.tsx` is reachable via More tab — a child can switch to a parent profile with zero protection. Data isolation is enforced by `createScopedRepository(profileId)` (verified by `profile-isolation.test.ts`), but there is no authentication gate on the profile switch itself. Phase 2 should add PIN/biometric before profile switch completes.

**Pre-launch configuration (not code):**
- [ ] Clerk: configure custom email domain (SPF/DKIM/DMARC) so verification/consent emails don't land in spam
- [ ] Sentry: create projects + set `SENTRY_DSN` secrets for API and mobile
- [ ] Resend: set `RESEND_API_KEY` secret, verify sending domain

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
