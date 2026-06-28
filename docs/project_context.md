---
project_name: 'MentoMate'
user_name: 'Zuzka'
date: '2026-05-23'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 53
optimized_for_llm: true
source: 'docs/architecture.md'
---

# Project Context for AI Agents

_Critical rules and patterns for implementing code in MentoMate. Focus on unobvious details that agents might otherwise miss. Read `docs/architecture.md` for full architectural decisions._

---

## Technology Stack & Versions

**Pin these versions. Do not upgrade without explicit approval.**

| Technology | Version | Critical Notes |
|-----------|---------|---------------|
| Expo SDK | 54 | SDK 55 is beta — do not upgrade |
| NativeWind | **4.2.1** | v5 is preview only. Pin with Tailwind CSS 3.4.19. |
| Zod | **4.x** | `^4.1.12` in `@eduagent/schemas`. Breaking changes from Zod 3 — use Zod 4 APIs. |
| Hono | 4.11.x | On Cloudflare Workers. Same framework if migrating to Railway. |
| Drizzle ORM | Current stable | Type-safe SQL. Not Prisma. |
| Neon | Managed | PostgreSQL + pgvector. Serverless driver `@neondatabase/serverless`. |
| Clerk | Current | `@clerk/clerk-expo` on mobile. JWKS verification on API. |
| Inngest | v3 | `inngest/hono` serve adapter (Hono on Cloudflare Workers). Use `inngest/cloudflare` only for bare Workers without Hono. |
| Nx | 22.2.0 | `@naxodev/nx-cloudflare` 5.0.x for Workers deployment. |

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

- **Shared components are persona-unaware.** No conditional rendering based on persona type in reusable components. Theming via CSS variables set at root layout. Page-level route files (e.g., `_layout.tsx`) may read persona for routing guards and CSS variable injection — that's the intended boundary.
  - WRONG: `if (persona === 'teen') { color = '#1a1a1a'; }` or `isDark = persona === 'teen'`
  - WRONG: Hardcoded hex colors in component props (`color="#7c3aed"`, `backgroundColor: '#262626'`)
  - RIGHT: Use NativeWind semantic classes (`bg-surface`, `text-primary`, `border-accent`) that resolve via CSS variables. The root `_layout.tsx` sets variables per persona — components never need to know which persona is active.
- **TanStack Query for all server state.** React Context for auth + active profile only. Local state for UI interactions.
- **No Zustand at MVP.** Add only when shared client state crosses navigation boundaries and doesn't come from the server.
- **Expo Router route groups:** `(auth)/`, `(app)/`. Root `_layout.tsx` sets theme CSS variables. (Epic 12 merged the old `(learner)/` and `(parent)/` groups into a unified `(app)/` group.)
- **Expo Image** (built into SDK 54) for all images. No additional library.
- **SecureStore keys must use Expo-safe characters only.** Keys may contain only alphanumeric characters, `.`, `-`, and `_`. Never use `:` in persisted keys; prefer patterns like `${prefix}-${profileId}`.
- **`expo-web-browser` warm-up is best-effort on Android.** Guard `warmUpAsync()` / `coolDownAsync()` with `Platform.OS === 'android'`, catch failures, and only cool down after a successful warm-up. Some devices do not expose the Custom Tabs service.
- **Run Expo bundle/export commands from `apps/mobile`.** In this monorepo, running `expo export:embed` or similar commands from the repo root can make Expo resolve its default `AppEntry` against a nonexistent root `App`.

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
- **Schema changes require a rollout step.** A worker deploy or mobile build does not update Neon. For staging/prod, apply committed migrations against the target `DATABASE_URL` before releasing code that reads the new columns.

### LLM & AI Rules

- **No direct LLM API calls** — the single-orchestrator rule (`MMT-ADR-0018`). Every call goes through `services/llm/router.ts` → `routeAndCall()` (import via barrel: `from './llm'`). Ensures metering, logging, provider fallback, cost tracking. A direct `fetch` to Anthropic/OpenAI bypasses metering.
- **Embedding generation is separate from LLM orchestration.** Different call pattern (single vector, no streaming). Lives in `services/embeddings.ts`.
- **Soft ceiling €0.05/session is a monitoring threshold, not a cutoff.** Never interrupt a learning session for cost reasons.
- **Model routing is by conversation state (escalation rung), not initial classification** — higher rungs escalate to stronger models, all via `routeAndCall()`. **Do not hardcode the model picture here:** the per-rung/per-tier picks, minor/Family routing, and the vetted set are governed by `MMT-ADR-0014` (router runtime/vetting hard-split) + the live master [`docs/registers/llm-models/master.md`](registers/llm-models/master.md). The older "Family = Gemini-only / Flash rung 1-2 / Gemini Pro rung 3+ / GPT-5.4 rung 5+" wording is **superseded** — Gemini/Vertex are excluded (under-18 prohibition) and gpt-oss-120b (Cerebras) is the universal primary.
- **Commercial LLM routing changes require the live premium-routing gate.** Run `pnpm test:llm:premium-routing` after changing Plus/Family/add-on/provider routing. The runner uses the app services directly, forces hard rung-4 and rung-5 cases, verifies sourceAudit, compares Gemini/Claude quality at rung 4, and verifies the OpenAI advanced candidate is used only at rung 5 when OpenAI is configured.
- **Book and topic-map generation routes at a strong tier and must not silently fall back to a weaker model** — generated topic maps are upstream of tutoring quality. The specific model/policy is governed by `MMT-ADR-0014` + [`docs/registers/llm-models/master.md`](registers/llm-models/master.md), not pinned here. (The prior `providerPolicy: 'gemini_only'` → Gemini 2.5 Pro wording is **superseded**: Gemini is excluded; async deep generation shares the gpt-oss-120b primary path per the register.)
- **Book and topic-map generation changes require the live book-generation gate.** Run `pnpm test:llm:book-generation` after changing book generation, book suggestions, curriculum topic persistence, or session topic-map context. The runner uses the app's book-generation services directly and checks broad/narrow classification, generated topic-map coherence, chapter sequencing, visual connections, age register, overload risk, and unsupported precise factual claims before the tutor uses that structure in sessions. Precise unsourced factual claims are failures; generated curriculum should stay source-neutral until a tutoring turn has reliable source support.
- **LLM responses that drive state-machine decisions use the structured envelope.** Parse with `parseEnvelope()` from `services/llm/envelope.ts`; schema `llmResponseEnvelopeSchema` lives in `@eduagent/schemas`. Never embed `[MARKER]` tokens or JSON blobs in free-text replies. Every envelope signal must have a server-side hard cap (e.g., `MAX_INTERVIEW_EXCHANGES = 4`) so the flow terminates even if the LLM never emits the signal.

### Background Jobs (Inngest) Rules

- **Use Inngest for any async work that should survive a request lifecycle.** Never fire-and-forget in a route handler.
- **Non-core dispatches go through `safeSend()`.** Telemetry, post-success notifications, and observability events dispatch via `safeSend()` in `apps/api/src/services/safe-non-core.ts` so a dispatch failure reaches Sentry but never throws and never breaks the user action. Bare `inngest.send(...)` is reserved for CORE flows where dispatch failure must short-circuit the user action — those sites carry a `// core-send: <reason>` comment immediately above the call. Forward-only ratchet test: `apps/api/src/services/safe-non-core.guard.test.ts`.
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
- **Test data factories** import types from `@eduagent/schemas` — TypeScript catches schema drift at build time.
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
  apps/mobile  →  @eduagent/schemas
  apps/api     →  @eduagent/schemas, @eduagent/database, @eduagent/retention
  @eduagent/database  →  @eduagent/schemas
  @eduagent/retention →  (no workspace deps)
  @eduagent/schemas   →  (no workspace deps — leaf package)
  ```
  This applies to: runtime `import` statements, `tsconfig.json` project `references`, AND `package.json` `dependencies`. The one documented exception is `apps/mobile/tsconfig.json` referencing `../api` so `import type { AppType } from '@eduagent/api'` resolves for the Hono RPC client. Type-only imports from `@eduagent/api` are accepted for that contract; runtime imports and `package.json` dependencies on `@eduagent/api` remain forbidden because they can pull API server code into the mobile bundle.
  `packages/` never imports from `apps/`. Circular dependencies are build-breaking errors.
- **Cross-service calls through exported function interfaces.** Never import internals from another service file.

## Development Workflow Rules

- **Supported dev platforms — OS-agnostic by default (MMT-ADR-0019):** development happens on Windows (native), WSL, macOS, and Linux; CI is Linux. Developer tooling (hooks, scripts, CI invocations, local-dev docs) must work on every OS in active use — write it portably first. Where portability is genuinely impractical, an OS-specific workaround is accepted and **kept**, not removed; "it only matters on one OS" is never on its own a reason to strip it. Never assume a single dev OS.
- **Commit quality:** Husky + lint-staged + commitlint enforced from forked repo.
- **CI matrix:** lint → typecheck → test → build → deploy. Nx Cloud for remote caching and affected-only builds.
- **Neon branching** for dev/staging databases. No local PostgreSQL.
- **Environment config:** Typed config object (`apps/api/src/config.ts`) validated with Zod at startup. Never `process.env.NODE_ENV` checks in application code. Never raw `process.env` reads in API code. Exception: Expo mobile uses `process.env.EXPO_PUBLIC_*` per Expo convention.

## Critical Anti-Patterns

| Do NOT | Instead |
|--------|---------|
| Write `WHERE profile_id = $1` manually (reads) | Use `createScopedRepository(profileId)` |
| Write/update without `profileId` filter | Add `and(eq(table.id, id), eq(table.profileId, profileId))` on all writes |
| Import ORM primitives (`eq`, tables) in route files | Move the query to a service function |
| Put `databaseUrl` or secrets in Inngest event payloads | Use `getStepDatabase()` helper reading runtime env |
| Call LLM providers directly | Use `routeAndCall()` from `services/llm/` (import via barrel: `from './llm'`) |
| Define API/client-facing types locally | Import from `@eduagent/schemas`. A type is "client-facing" if it's returned by an exported service function, appears in a route response, or is used by more than one file. Local types are OK only for: single-function parameter bundles, intermediate computation shapes within one function body, and mapper helpers. |
| Use default exports | Use named exports (except Expo Router pages) |
| Read `process.env` directly (API) | Use typed config from `apps/api/src/config.ts`. Exception: Expo mobile uses `process.env.EXPO_PUBLIC_*` per Expo convention. |
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

## Challenge Round

Challenge Round is the assessment mode where the tutor proposes a timed retrieval challenge after sufficient practice. API code lives under `apps/api/src/services/challenge-round/`; mobile components live under `apps/mobile/src/components/session/` (ChallengeOfferCard, ChallengeRoundBanner, DraftedNoteReview) and the orchestration hook at `apps/mobile/src/hooks/use-challenge-round.ts`.

- **Trigger:** `apps/api/src/services/challenge-round/trigger.ts` — `evaluateChallengeReadiness()` runs in `prepareExchangeContext()` before each exchange. Hard-gates homework/review/quiz/freeform/practice/recall/dictation, struggling status, short streaks, in-flight round, decline cooldown (24h per profile+topic), and insufficient remaining-turn budget (`MIN_CHALLENGE_REMAINING_TURNS = 5`).
- **State machine:** `apps/api/src/services/challenge-round/state.ts` — `transitionChallengeState()` enforces legal transitions; lives in `sessionMetadata.challengeRound` and is parsed via `challengeRoundSessionStateSchema` from `@eduagent/schemas`.
- **Prompt blocks:** `apps/api/src/services/challenge-round/prompts.ts` exports `challengeOfferPrompt`, `challengeRoundActivePrompt`, `challengeRoundDraftingPrompt`. Injected by `exchange-prompts.ts` based on `challengeRound.state` + `challengeEligible`.
- **Envelope signals:** `signals.challenge_round_offer: boolean` and `signals.challenge_round_evaluation: ChallengeRoundEvaluationItem[]` (each item has `concept`, `result ∈ {solid, partial, missing, misconception}`, `evidence`, `answerEventId`, `learnerQuote`, optional `correction`). UI hints: `ui_hints.challenge_round` (active/index/total) and `ui_hints.note_draft` (content + source_concepts + source_answer_event_ids). All defined in `packages/schemas/src/llm-envelope.ts`.
- **Mastery decision:** `decideMasteryAndReview()` in `apps/api/src/services/challenge-round/evaluation.ts`. Server-owned and conservative — mastery only when every evaluation is `solid`; mixed outcomes write `needs_deepening_topics` rows with `source = 'challenge_round'` and never mark mastery; empty evaluation returns `outcome: 'invalid'` (CRIT-9).
- **Note-draft guard:** `apps/api/src/services/challenge-round/note-draft.ts` — `validateNoteDraft()` requires ≥40% lexical overlap with `solidAnswerQuotes` (Unicode-aware tokenizer with character n-gram fallback for non-spaced scripts). Drafter is fed ONLY solid quotes, never the full transcript or partial/misconception text.
- **Routes:** `POST /challenge-round/{maybe-offer,accept,decline,abort}` — all profile-scoped via `createScopedRepository`. Not yet registered in `AppType`; the mobile hook (`use-challenge-round.ts`) uses raw `fetch` with auth headers rather than the typed Hono client. "Too easy" mobile chip calls `/maybe-offer`; if eligible, the offer card renders, otherwise the chip falls through to today's `too_easy` system-prompt dispatch.
- **Mobile components:** `ChallengeOfferCard`, `ChallengeRoundBanner`, `DraftedNoteReview` in `apps/mobile/src/components/session/`; `use-challenge-round` hook in `apps/mobile/src/hooks/`. Streaming hook (`use-session-streaming.ts`) consumes typed `done`-frame fields only — never parses raw envelope JSON from chat text.
- **Cooldowns:** `challenge_round_cooldowns` table (profile_id × topic_id unique) records 24h cooldown after decline.
- **Routing:** Challenge Round never bypasses commercial policy. Offer turns route normally; `accepted|active|drafting` turns set `ExchangeContext.llmRoutingRung = max(escalationRung, 4)` and feed it through `resolveExchangeLlmRouting()`. Per-tier model routing (incl. minor/Family) follows `MMT-ADR-0014` + [`docs/registers/llm-models/master.md`](registers/llm-models/master.md) — the prior "Family stays Gemini-only" wording is superseded (Gemini excluded under-18).
- **Read-side verification state (Phase 5):** `resolveMasteryVerificationState()` in `apps/api/src/services/challenge-round/verification.ts` computes `'unverified' | 'fresh' | 'stale'` from the latest `assessments.mastery_challenge_verified_at` and the topic's `needs_deepening_topics` rows. `'stale'` triggers when a `pending_review` or `active` row was created AFTER the verification timestamp — i.e. later weak-spot evidence has contradicted the verified state. `getTopicProgress` / `getTopicProgressBatch` emit only `masteryVerificationState` in `TopicProgress`; the raw timestamp is intentionally NOT shipped on the wire. Mobile (`topic/[topicId].tsx`) reads `masteryVerificationState === 'fresh'` to surface the verified badge — never the raw timestamp.
- **No-clinical-copy ratchet (Phase 5):** `scripts/check-no-clinical-copy.ts` blocks NEW banned tone words (failed/wrong/incorrect/struggle/weak/declining/trouble/mistake) in `apps/mobile/src/i18n/locales/en.json`. Pre-commit hook runs it whenever `en.json` is staged. Existing offenses are grandfathered in `scripts/no-clinical-copy-baseline.json`. Run `pnpm check:no-clinical-copy --accept` to refresh the baseline when reframing existing copy or when a genuinely-technical error string is added.
- **Hardcoded-JSX-literal ratchet (Phase 3):** `scripts/check-i18n-jsx-literals.ts` is a `ts-morph` AST walker that blocks NEW hardcoded English in `JsxText` nodes (`<Text>Add child</Text>`) and JSX-children `StringLiteral`/`NoSubstitutionTemplateLiteral` nodes (`<Text>{'Continue'}</Text>`, conditional/`&&`/`??` children) across `apps/mobile/src/**/*.tsx` — the complement to the `t()`-only orphan-key checker. Forward-only baseline ratchet: 361 existing literals grandfathered in `scripts/i18n-jsx-literals-baseline.json`, keyed on `{file, kind, text}` (line-independent, so reformatting doesn't churn). CI step `i18n hardcoded-JSX-literal check` in `ci.yml` runs it on every push; unit-tested in `scripts/check-i18n-jsx-literals.test.ts` (17 cases). JSX **attribute** literals (`label="Continue"`) are deliberately out of scope — separate per-prop model in `docs/audit/2026-05-29-full-audit/workflow-1/proposed-baseline.json`. Run `pnpm check:i18n:jsx-literals --accept` to refresh the baseline when adding genuinely non-translatable JSX copy.
- **Runtime flag status:** `CHALLENGE_ROUND_RUNTIME_ENABLED` still defaults to `'false'` in `apps/api/src/config.ts`. Doppler must flip it per environment to make the runtime learner-visible; until then, prompt injection / state transitions / typed SSE fields / mobile rendering all stay dark. The Phase 5 read-side hardening above is the gate the plan called out before the flip is safe.

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

Last Updated: 2026-05-22 (envelope contract, safeSend pattern, store status, llm-routing gate)
