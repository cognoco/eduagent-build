---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - 'docs/prd.md'
  - 'docs/analysis/product-brief-EduAgent-2025-12-11.md'
  - 'docs/analysis/epics-inputs.md'
  - 'docs/analysis/architecture-inputs.md'
  - 'docs/analysis/research/market-ai-tutoring-research-2024-12-11.md'
  - 'docs/analysis/research/evidence based learning science.md'
  - 'docs/FB-Run023-parents.yaml'
  - 'docs/FB-Run023-learner.yaml'
  - 'docs/FB-Run023-languages.yaml'
  - 'docs/ux-design-specification.md'
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-02-15'
project_name: 'EduAgent'
user_name: 'Zuzka'
date: '2026-02-15'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

149 FRs across 8 epics. Language Learning (FR96-FR107), Concept Map (FR118-FR127), and Full Voice Mode (FR144-FR145, FR147-FR149) **deferred to v1.1** — architecture designs for extensibility but doesn't build. FR146 (Language SPEAK/LISTEN voice) mapped to Epic 6. Effective MVP scope: 121 FRs.

| PRD Category | FRs | Epic Mapping | Architectural Weight |
|-------------|-----|-------------|---------------------|
| User Management | FR1-FR12 | Epic 0 | Medium — Clerk handles auth, but GDPR consent workflow and multi-profile switching are custom |
| Learning Path Personalization | FR13-FR22 | Epic 1 | High — conversational AI, dynamic curriculum generation, intent detection |
| Interactive Teaching | FR23-FR33 | Epic 2 | Very High — real-time LLM orchestration, Socratic escalation ladder, homework integrity mode |
| Knowledge Retention | FR34-FR42 | Epic 2 | High — mandatory production, parking lot, prior knowledge context injection |
| Learning Verification | FR43-FR51 | Epic 3 | High — SM-2 spaced repetition, mastery scoring, delayed recall scheduling |
| Failed Recall Remediation | FR52-FR58 | Epic 3 | Medium — guided relearning, adaptive method selection |
| Adaptive Teaching | FR59-FR66 | Epic 3 | Medium — three-strike rule, teaching method preferences, "Needs Deepening" scheduling |
| Progress Tracking | FR67-FR76 | Epic 4 | Medium — Learning Book, knowledge decay visualization, topic review |
| Multi-Subject Learning | FR77-FR85 | Epic 4 | Medium — subject management, archive/pause, auto-archive |
| Engagement & Motivation | FR86-FR95 | Epic 4 | Medium — honest streak, retention XP, interleaved retrieval |
| Language Learning (v1.1) | FR96-FR107 | Epic 6 | Deferred — Four Strands, CEFR tracking, vocabulary spaced repetition |
| Subscription Management | FR108-FR117 | Epic 5 | Medium — tiered billing, family pools, top-up credits, reverse trial |
| Concept Map (Prerequisite-Aware Learning) | FR118-FR127 | Epic 7 | v1.1 — DAG data model, graph-aware coaching, visual concept map |
| EVALUATE Verification / Devil's Advocate | FR128-FR133 | Epic 3 | Medium — plausibly flawed reasoning for student critique, Bloom's Level 5-6, reuses escalation rung system |
| Analogy Domain Preferences | FR134-FR137 | Epic 3 | Low — per-subject analogy domain selection, LLM prompt injection, reuses existing teaching preferences infrastructure |
| Feynman Stage (TEACH_BACK) | FR138-FR143 | Epic 3 | MVP — teach-back verification via voice, on-device STT/TTS |
| Full Voice Mode | FR144-FR145, FR147-FR149 | Epic 8 | Shipped 2026-04-03 — voice-first sessions, TTS playback, voice controls, accessibility |

**Non-Functional Requirements driving architecture:**

| NFR | Target | Architectural Implication |
|-----|--------|--------------------------|
| API response (p95) | <200ms excl. LLM | Rules out cold-start-heavy serverless for hot paths |
| LLM first token | <2s | SSE streaming from backend to client, model routing optimization |
| Camera → OCR → first AI response | <3s | Critical path for homework help flow. OCR provider choice directly impacts this budget. |
| App cold start | <3s | Expo bundle optimization, coaching card precomputation |
| Uptime | 99.5% | Multi-provider LLM fallback, circuit breaker with defined thresholds |
| Data durability | 99.99% | Neon managed backups, point-in-time recovery |
| GDPR compliance | Full | Consent state machine, deletion orchestrator, data residency |
| COPPA-adjacent | Ages 11-15 | Parental consent workflow, profile isolation, audit trail |

**UX Specification Implications:**

- **Coaching model** (Recall → Build → Apply → Close): Requires session state machine with rung tracking and LLM context injection
- **Socratic Escalation Ladder**: 5 rungs driving model routing — fastest model at rung 1-2, reasoning models at rung 3+
- **Coaching card two-path loading**: Cached path (<1s, context-hash freshness) vs fresh path (1-2s skeleton) — requires background precomputation pipeline
- **Three-persona theming**: Teen dark, learner calm, parent light — CSS variable layer, components stay persona-unaware
- **Confidence scoring**: Per-problem behavioral metrics feeding parent dashboard — time-to-answer, hints needed, escalation rung, difficulty
- **Cold start framing**: Sessions 1-5 use coaching-voiced three-button menu, invisible transition to adaptive entry at session 6+
- **Phase 1 MVP components**: CoachingCard (planned: BaseCoachingCard + 4 variants per UX-7), Camera Capture, ChatShell + MessageBubble (planned: MessageThread + HomeworkChatWrapper per UX-7), SessionCloseSummary, RetentionSignal, ErrorBoundary (planned: ErrorRecovery per UX-7)

### Scale & Complexity Assessment

**Complexity level: High**
**Primary domain: Mobile-first full-stack AI application**

**Scalability Inflection Points:**

| Users | Inflection | Architectural Response |
|-------|-----------|----------------------|
| ~2K | Neon cold start latency on infrequent queries | Connection pooling, keep-alive strategy |
| ~5K | Background jobs saturate simple queue | Inngest already handles this from MVP |
| ~10K | Concurrent LLM API calls (~500-1000 simultaneous sessions) saturate connection pooling and provider rate limits — not orchestration CPU | Extract orchestration to dedicated service with its own connection pool and provider-level rate limit management |
| ~25K | Parent dashboard queries compete with learning writes | Read replicas for reporting/analytics |
| ~50K | pgvector scan times grow with per-user embeddings | Evaluate dedicated vector store migration |

**Complexity Indicators:**

- **Real-time features**: LLM streaming via SSE, coaching card live updates
- **Multi-tenancy**: Family accounts with profile isolation, shared billing, independent learning state
- **Regulatory**: GDPR (EU users 11-15), data deletion rights, parental consent workflows
- **AI orchestration**: Multi-provider routing by conversation state, cost management, fallback chains
- **Data complexity**: Relational (users, sessions, curricula) + vector (memory embeddings) + temporal (spaced repetition schedules, knowledge decay)
- **Integration complexity**: 4+ external services (Clerk, Stripe, LLM providers, OCR provider)

### Technical Constraints & Dependencies

**Decided Stack:**

| Component | Decision | Rationale |
|-----------|----------|-----------|
| Mobile Framework | Expo (React Native) | Cross-platform iOS/Android/Web, App Store presence |
| Database | Neon (PostgreSQL) + pgvector | Serverless scale-to-zero, branching for dev/staging |
| Authentication | Clerk | Expo SDK, social login, multi-tenant, cost-effective |
| Payments | RevenueCat (native IAP) + Stripe (dormant, for future web) | Mobile: Apple StoreKit 2 + Google Play Billing via RevenueCat. **Stripe will not pass App Store review** for digital services — see Epic 9. Stripe code kept for future web client and B2B. |
| AI/LLM | Multi-provider (Claude, GPT-4, Gemini Flash) | Routing by conversation state, cost optimization |
| Vector Search | pgvector (in Neon) | Per-user embeddings, JOINs with relational data |
| Backend Framework | Hono (Cloudflare Workers preferred, Railway/Fly fallback) | Edge deployment, scale-to-zero matching Neon, lightweight. Not Express. Same framework either runtime — easy migration if Workers constraints bite. |
| Real-time Transport | SSE | Unidirectional streaming sufficient for tutoring chat. Student sends POST, AI streams back via SSE. Simpler than WebSockets — no sticky sessions, works through CDNs, native ReadableStream in Expo. |
| Background Jobs | Inngest | Durable execution, automatic retries, step functions for multi-step jobs (SM-2 → coaching card → dashboard), observability. Pairs well with Workers/serverless. |

**Remaining Architecture Decisions:**

| Decision | Options to Evaluate | Blocking |
|----------|-------------------|----------|
| Push notification infrastructure | Expo Push, Firebase Cloud Messaging, OneSignal | Retention reminders, review nudges |
| Code execution sandbox (v2.0) | Browser-based (WASM) vs server-side | Deferred — programming subjects |
| Offline capability (v2.0) | Local cache strategy, sync protocol | Deferred |

### Cross-Cutting Concerns

| Concern | Architectural Pattern | Scope |
|---------|----------------------|-------|
| **Persona-aware theming** | CSS variable layer via NativeWind. 6 JSON token files (3 personas × 2 color modes). **Swap at app root layout**, not Clerk hook — persona is an application concept, not Clerk's. Flow: Clerk authenticates → app fetches active profile → profile includes persona type → root layout sets CSS variables before any child renders. Profile switching within family account swaps variable set without re-authentication. Components stay completely persona-unaware. **Current implementation vs target:** The token system is implemented in `lib/design-tokens.ts` (single TypeScript file) + `lib/theme.ts` (context + hooks). This deviates from the target `theme/tokens/*.json` + `theme/provider.tsx` structure. Migration is planned for v1.1 (dark mode support), when JSON files are needed for: design tool integration (Figma token plugins), automated contrast ratio validation (a11y linting), and 6 distinct value sets (3 personas × 2 color schemes). Current `design-tokens.ts` has identical light/dark values per persona (MVP ships fixed themes: teen=dark, learner=light, parent=light). | All UI |
| **AI cost management** | Split into two layers: (1) **Metering middleware** calling a **PostgreSQL function** `decrement_quota(profile_id, family_id)` — atomic FIFO logic (monthly pool first, then top-up credits), returns remaining balance or rejection. Middleware interprets result: forward to LLM or return quota-exceeded with soft paywall data. Concurrent family usage handled by PostgreSQL row-level locking (`UPDATE ... SET remaining = remaining - 1 WHERE remaining > 0`) — no application-level locking. (2) **LLM orchestration module** in `services/llm/router.ts` — `routeAndCall(messages: ChatMessage[], rung: EscalationRung, options?) → Promise<RouteResult>`. Handles model selection by escalation rung, provider failover, streaming normalization (`routeAndStream` for SSE). Soft ceiling €0.05/session: **monitoring threshold, not a cutoff.** Never interrupt a learning session for cost reasons. Log when sessions exceed €0.05. If >20% of sessions consistently exceed ceiling, tune routing rules (e.g., lower the escalation rung threshold for reasoning models). Surface as a dashboard metric for cost monitoring. The metering middleware tracks per-session cost accumulation but does not enforce a hard stop — the quota system (monthly pool + top-ups) is the actual spending control. | Backend |
| **Prompt caching** | Provider-level first (Anthropic prompt caching for system prompts — stable per subject/persona combination). **Parallel Example templates** cached in database: keyed by `subject + type + difficulty + system_prompt_hash`. System prompt change → hash change → old cache entries naturally bypassed. No explicit invalidation or TTL needed — stale entries are orphaned and can be garbage-collected periodically. No general-purpose prompt cache layer at MVP. | Backend |
| **Multi-profile data isolation** | **Repository pattern** with automatic scope injection: `createScopedRepository(profileId)` — every query gets `WHERE profile_id = $1` automatically. **Neon RLS** as defense-in-depth, not primary enforcement. Profile ID set via session context, not passed per-request. | Data layer |
| **Session state management** | **Every exchange, hybrid model.** After each AI response completes, in one transaction: (1) **Append session event** (immutable log): `{ exchange_id, timestamp, user_message, ai_response, model_used, escalation_rung, hints_given, time_to_answer, confidence_signals }`. (2) **Upsert session summary row** (mutable current state): `{ session_id, current_rung, total_exchanges, topics_touched, last_exchange_at }`. Event log gives replay/audit/analytics. Summary row gives fast reads for "where are we." Both in same database transaction — not a separate save step. Cost negligible vs. LLM call; no data loss window. | Backend |
| **Client recovery** | **Show partial, auto-retry with backoff.** Stream drops mid-token: freeze partial response in chat UI (student may have read it), show inline "reconnecting..." indicator, auto-retry same request at 1s/2s/4s backoff, max 3 attempts. If all fail: persona-appropriate error + manual retry button. Partial response handling: <20% received → replace on retry; >20% → append with visual separator. Never discard what the student already read. | Frontend |
| **Event-driven lifecycle** | **Direct queue dispatch via Inngest.** `session.completed` → 4-5 known consumers (SM-2 recalculation → coaching card precomputation → parent dashboard update). Inngest step functions for multi-step chains. Fire-and-forget with retry — no full event sourcing at MVP. Lifecycle events (`session.started`, `session.completed`, `session.timed_out`) stored as special event types in the same append-only session event log — replay capability without a full event store. Ordering: per-session/per-profile natural ordering. Overlapping sessions (unlikely): last-write-wins on SM-2 row, recalculation is idempotent. | Backend |
| **Retention & spaced repetition** | SM-2 as **library/module** (~50 lines pure math). Takes `{ previous_interval, previous_ease_factor, quality_score }` → returns `{ next_interval, next_ease_factor, next_review_date }`. Writes to `topic_schedules` table. Consumers are all readers: coaching card ("which topics due/overdue"), notification scheduler ("when is next review"), parent dashboard ("how many topics fading"). Library is the writer, everything else is a reader. Clean interface enables future service extraction. Called through event-driven lifecycle. **EVALUATE scoring (Epic 3 extension):** EVALUATE results feed into SM-2 as a new input source, but the math is unchanged. Modified scoring floor: EVALUATE failure = quality 2-3 (not 0-1) — missing a subtle flaw does not equal not knowing the concept. Prevents score tanking on topics the student actually knows. `evaluateDifficultyRung` (integer 1-4) stored alongside SM-2 state on the retention card; persists across sessions, default null (= never evaluated). | Backend |
| **Data privacy & compliance** | **Consent state machine**: `PENDING → PARENTAL_CONSENT_REQUESTED → CONSENTED → WITHDRAWN`, enforced at repository layer (no data access without CONSENTED). **Deletion orchestrator**: knows every table and external system, anonymizes immediately, full deletion within 30 days, idempotent/retryable steps. | Full stack |
| **Error boundaries & graceful degradation** | Per-dependency circuit breakers with specific thresholds: **LLM providers** — trip after 3 consecutive 5xx/timeouts within 30-second window, half-open after 60s (one probe request). Tight window intentional — 30s wait is already bad UX in tutoring. **OCR** — no circuit breaker; single-request 5s timeout, immediate text input fallback (failures are per-image, not systemic). **Stripe** — no circuit breaker; webhook delays are normal. Check subscription from local DB (webhook-synced), never call Stripe during learning session. 3-day grace period per PRD. **Neon** — if DB is down, almost nothing works. Cache coaching card + Learning Book on client after each successful load, show with "limited mode" banner. Don't build elaborate fallbacks — invest in Neon reliability instead. | Full stack |
| **Observability** | Structured logging with **correlation IDs** (request → LLM call → background job chain). Every LLM call logged: model, tokens in/out, latency, context hash, routing decision, cost. SM-2 decisions logged: card, interval, ease factor, grade. OpenTelemetry recommended. | Backend |
| **i18n** | MVP: English + German UI. Backend: English only. Learning languages: any (via LLM). Framework: react-i18next. RTL deferred. | Frontend |

## Starter Template Evaluation

### Primary Technology Domain

Monorepo with two apps: Expo mobile client + Hono API backend. **Starting from fork of existing Nx monorepo** ([cognoco/nx-monorepo](https://github.com/cognoco/nx-monorepo)), not from scratch.

### Current Versions (verified Feb 2026)

| Technology | Version | Notes |
|-----------|---------|-------|
| Expo SDK | 54 (v54.0.33) | SDK 55 in beta |
| Hono | 4.11.x (v4.11.9) | Released Feb 8, 2026 |
| NativeWind | **v4.2.1** (pin) | v5 is preview/pre-release only. Pin to v4.2.1 + Tailwind CSS 3.4.19. |
| Drizzle ORM | Current stable | Type-safe SQL, replaces Prisma |
| Nx | 22.2.0 | Pinned in root package.json |
| @naxodev/nx-cloudflare | 5.0.x | `^5.0.0` in root devDependencies, resolves to 5.0.2 |

### Starter Decision: Fork `cognoco/nx-monorepo`

**Rationale:** The existing monorepo provides ~40% of value by infrastructure — Nx workspace config (with `@nx/expo/plugin` already configured), GitHub Actions CI/CD (lint, test, build, typecheck, deploy with Nx Cloud caching), Husky + lint-staged + commitlint, ESLint 9 flat config, Jest preset, Docker config, CodeRabbit/Dependabot/Sentry patterns, and Claude Code integration. Building this from scratch would be significant effort for zero product differentiation.

**What we keep (high-leverage infrastructure):**

| Asset | Value |
|-------|-------|
| Nx workspace config (`nx.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`) | Already has `@nx/expo/plugin`, `@nx/jest/plugin`, `@nx/eslint/plugin`, Nx Cloud |
| GitHub Actions CI/CD (`ci.yml`, `mobile-ci.yml`, `deploy.yml`) | Lint, test, build, typecheck, deploy matrix with Nx Cloud caching |
| `apps/mobile/` Expo shell | `app.json`, `eas.json`, `metro.config.js`, Jest config — keep and strip app code |
| `packages/schemas/` | Zod schema pattern — becomes single source of shared types + validation |
| `packages/test-utils/`, `packages/factory/` | Testing infrastructure — evaluate and keep what applies |
| Husky + lint-staged + commitlint | Commit quality enforcement |
| ESLint 9 flat config + Prettier | Code quality |
| Jest preset + testing strategy | Testing infrastructure |
| Docker config | Useful for Railway/Fly deployment path |
| `.editorconfig`, `.nvmrc`, TypeScript strict mode | Dev environment consistency |
| CodeRabbit, Dependabot, Sentry patterns | Quality and monitoring |
| Claude Code integration (`claude.yml`, `claude-code-review.yml`, `CLAUDE.md`, `.claude/`) | AI-assisted development |

**What we replace:**

| Current | Replace With | Scope |
|---------|-------------|-------|
| `apps/web/` (Next.js 15) | Remove entirely | Different framework |
| `apps/server/` (Express) | `apps/api/` (Hono on Workers/Railway) | Replace — different framework, same `packages/` consumption |
| `packages/database/` (Prisma + Supabase) | `packages/database/` (Drizzle + Neon) | Replace — different ORM, different connection model |
| `packages/supabase-client/` | Remove, add Clerk SDK config | Different auth provider |
| `packages/api-client/` (REST + OpenAPI) | Hono RPC types in `packages/schemas/` | Single mobile client doesn't need OpenAPI |
| `@nx/next/plugin` in nx.json | Remove | No Next.js |
| `@nx/playwright/plugin` in nx.json | Remove (Detox or Maestro for mobile E2E later) | Different testing target |
| Vercel deployment workflows | EAS (Expo) + Railway/Workers | Different deployment targets |

**What we remove:**

- `apps/web-e2e/` (Playwright) — mobile E2E needs Detox/Maestro
- `packages/supabase-client/` — entirely Supabase-specific
- Vercel-specific deployment workflow
- Supabase environment variable wiring

### Hono App Scaffolding (Manual)

The `@johnlindquist/nx-hono` plugin is dead (0 downloads, missing GitHub repo, no updates since May 2025). Scaffold Hono manually — straightforward:

```
apps/api/
├── src/
│   ├── routes/          # Route handlers
│   ├── services/        # Business logic (includes services/llm/ orchestration)
│   ├── middleware/       # Auth, JWT, profile-scope, request-logger, database, LLM, metering, account
│   ├── inngest/         # Background job functions
│   ├── config.ts        # Typed env config (Zod validated at startup)
│   ├── errors.ts        # Error response helpers (apiError, notFound, forbidden, etc.)
│   └── index.ts         # Hono app entry
├── wrangler.toml        # Cloudflare Workers config
├── project.json         # Nx targets: serve, build, deploy
├── tsconfig.json
├── tsconfig.app.json
└── package.json
```

`project.json` targets use `@naxodev/nx-cloudflare` executors for build/deploy, or `nx:run-commands` wrapping `wrangler dev` / `wrangler deploy`.

### Package Boundaries

**`packages/schemas/`** — single source of truth for shared types AND validation:
- Zod schemas (request/response validation)
- Inferred TypeScript types via `z.infer<>`
- Hono RPC type exports (`AppType` re-export)
- Domain types that have no schema (pure UI state types, enums) also live here until the package outgrows a single concern
- Split into `packages/types/` only when justified by size or divergent concerns

**`packages/database/`** — Drizzle schema definitions, Neon connection factory, scoped repository pattern (`createScopedRepository`), RLS policy definitions. This is library code imported by `apps/api/`.

**`apps/api/drizzle/`** — migration files (not yet created, pending first production migration). Deployment artifacts generated by `drizzle-kit` reading schema from `packages/database/`. Not library code.

**`packages/retention/`** — SM-2 library (~50 lines pure math, no dependencies). Testable in isolation, importable by both API and potentially mobile app (v2.0 offline schedule display).

### Final Workspace Structure (post-fork)

```
eduagent/
├── apps/
│   ├── mobile/              # Expo (kept from fork, app code replaced)
│   │   ├── src/
│   │   │   ├── app/         # Expo Router file-based routes
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   └── assets/
│   └── api/                 # Hono (new, manually scaffolded)
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── middleware/
│       │   ├── inngest/
│       │   └── index.ts
│       └── wrangler.toml
├── packages/
│   ├── schemas/             # Zod schemas + inferred types + Hono RPC exports (kept, extended)
│   ├── retention/           # SM-2 library — pure math, no deps (new)
│   ├── database/            # Drizzle schema + Neon connection + scoped repository (rebuilt)
│   ├── test-utils/          # Testing utilities (kept, adapted)
│   └── factory/             # Test factories (kept, adapted)
├── .github/workflows/       # CI/CD (kept, deployment targets updated)
├── nx.json
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

### Type Safety Strategy — Hono RPC

Hono RPC exports the API type from the server; the client consumes it with full type inference. Lighter than tRPC, works as standard REST, no code generation.

```typescript
// API: apps/api/src/index.ts
const app = new Hono().route('/sessions', sessionsRoute);
export type AppType = typeof app;

// NOTE: AppType cannot live in @eduagent/schemas (circular dep: api→schemas→api).
// Mobile imports directly from the API package using TypeScript project references.
// Mobile: apps/mobile/lib/api.ts
import type { AppType } from '@eduagent/api';
import { hc } from 'hono/client';
const client = hc<AppType>(API_URL);
```

**Note:** Project initialization = fork repo, strip Supabase/Next.js/Express specifics, scaffold Hono API, rebuild database package. This should be the first implementation epic.

### pnpm + Expo Compatibility

Research noted pnpm symlink issues with Expo in some Nx setups. If encountered during project init, fix with `node-linker=hoisted` in `.npmrc`. Don't switch package managers preemptively.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation) — All Resolved:**

| # | Decision | Resolution | Source |
|---|----------|-----------|--------|
| 1 | Database + ORM | Neon + Drizzle + pgvector | Step 2 |
| 2 | Auth provider | Clerk | Step 2 |
| 3 | Backend framework + runtime | Hono on Cloudflare Workers (Railway/Fly fallback) | Step 2 |
| 4 | Real-time transport | SSE | Step 2 |
| 5 | Background jobs | Inngest | Step 2 |
| 6 | LLM orchestration pattern | Inline module, conversation-state routing | Step 2 |
| 7 | Session state persistence | Every exchange, hybrid event log + summary row | Step 2 |
| 8 | Data isolation | Scoped repository + Neon RLS defense-in-depth | Step 2 |
| 9 | Monorepo + starter | Nx, forked from cognoco/nx-monorepo | Step 3 |
| 10 | OCR strategy | ML Kit on-device primary, server-side fallback behind interface | Step 4 |
| 11 | Embedding provider + model | Voyage AI voyage-3.5 (1024 dims), pgvector + HNSW, Inngest Step 4 | ARCH-16 spike |

**Deferred Decisions (Post-MVP):**

| Decision | Deferred To | Rationale |
|----------|-----------|-----------|
| Code execution sandbox | v2.0 | Programming subjects not in MVP |
| Offline capability | v2.0 | Requires local cache + sync protocol |
| Language Learning mode | v1.1 | FR96-FR107, design for but don't build |
| OCR server-side fallback provider | Homework Help epic | Mathpix vs CF Workers AI — design the interface now, choose provider when evaluating real content |
| Zustand (shared client state) | When justified | Start with TanStack Query + Context + local state |

### Data Architecture

**Database:** Neon (PostgreSQL) + pgvector. Serverless scale-to-zero, branching for dev/staging.

**ORM:** Drizzle. Type-safe schema definitions in `packages/database/`. Drizzle relational queries for 90% of operations (standard CRUD, JOINs). Raw SQL via Drizzle's `sql` template tag for parent dashboard aggregations — `GROUP BY`, window functions, time-series grouping across multiple children's topics with retention scoring. Complex queries wrapped in named query functions in `packages/database/` for type safety and reusability.

**Caching — Workers KV (native, zero network hop):**
- **Coaching cards**: Precomputed, written infrequently (on `session.completed` via Inngest), read on every app open. Perfect KV workload.
- **Subscription status**: Updated on Stripe webhook, read on every LLM call by metering middleware. Same write-rare/read-often pattern.
- **Session summary**: No cache needed — read once per session resumption, single DB query is fine.
- No Redis/Upstash. Already on Workers — KV is native.

**Migration Workflow:**
- **Development**: `drizzle-kit push` (fast schema iteration, no migration files)
- **Production/Staging**: `drizzle-kit generate` → committed migration SQL (directory not yet created, pending first prod migration) → `drizzle-kit migrate` applied in CI/CD pipeline
- **Rule**: Never `push` against production or staging
- Schema definitions in `packages/database/`, migration artifacts generated by `drizzle-kit`

**Pagination:**
- **Learning Book**: Full fetch per subject, filter/sort client-side with TanStack Query. Ceiling is a few hundred topics per power user — single query, under 10ms. Cursor pagination adds unnecessary client complexity for a dataset that fits in one response.
- **Session history**: Cursor-based (`WHERE (created_at, id) < ($cursor_time, $cursor_id) ORDER BY created_at DESC, id DESC LIMIT $n`). Grows unbounded, pagination justified.

**Prerequisite Graph (Epic 7, v1.1):**
- New `topic_prerequisites` join table in `packages/database/src/schema/subjects.ts`: `prerequisite_topic_id` → `dependent_topic_id` with `relationship_type` enum (`REQUIRED | RECOMMENDED`)
- Unique constraint on `(prerequisiteTopicId, dependentTopicId)`, check constraint prevents self-references
- Cascade delete from `curriculumTopics` — removing a topic removes its edges
- DAG validation: service-layer cycle detection via topological sort before insert (not a DB constraint — Drizzle doesn't support custom CHECK constraints with subqueries)
- `curriculumAdaptations` table extended with nullable `prerequisiteContext` JSONB column to log orphaned dependents when a prerequisite is skipped. Zod schema for JSONB shape in `@eduagent/schemas`
- SM-2 engine (`packages/retention/`) stays purely per-topic math — no graph awareness. Graph-aware flagging (dependent topics at-risk when prerequisite fades) lives in coaching card precomputation job, consuming SM-2 outputs + graph edges

### Authentication & Security

**Auth provider:** Clerk. JWT-based. `@clerk/clerk-expo` on mobile, Clerk middleware on Hono API.

**Mobile → API auth flow:** Clerk JWT verification. Mobile obtains JWT from Clerk SDK, sends as `Authorization: Bearer` header. Hono middleware verifies via Clerk's JWKS endpoint (cacheable in Workers KV). Profile ID extracted from Clerk session metadata, injected into request context for scoped repository.

**Authorization model:** Custom RBAC on profile metadata, not Clerk Organizations. Clerk orgs are designed for B2B multi-tenancy (team invites, role management UI) — wrong abstraction for family accounts. Store profile type (parent, teen, learner), family linkage, and consent state in Neon. Clerk provides authenticated user identity; application middleware maps to profile and enforces access rules.

**Rate limiting:** Cloudflare Workers built-in rate limiting (100 req/min per user per PRD). Configuration in `wrangler.toml`, not code. For the quota system (questions/month), `decrement_quota` PostgreSQL function is the enforcement point.

**API security:** Input validation via Zod on every route. Parameterized queries via Drizzle. Content Security Policy headers. CORS restricted to mobile app origins.

### API & Communication Patterns

**Transport:** Hono REST API + SSE for LLM streaming. Hono RPC for end-to-end type safety.

**API versioning:** `/v1/` prefix from day one. The moment a binary ships to the App Store, users on old binaries hitting breaking API changes is a real problem. A URL prefix costs nothing today but is painful to retrofit.

**Error response format:** Simple typed envelope with Zod schema in `packages/schemas/`:

```typescript
const ApiErrorSchema = z.object({
  code: z.string(),        // e.g. "QUOTA_EXCEEDED", "SESSION_NOT_FOUND"
  message: z.string(),     // Human-readable
  details: z.unknown().optional()  // Contextual data
});
```

One mobile client, one error handling path. RFC 7807 overengineered for this. Both API and mobile import the same type.

**Pagination:**
- **Learning Book**: Full fetch per subject (few hundred topics max, single response)
- **Session history**: Cursor-based (`WHERE (created_at, id) < ($cursor_time, $cursor_id)`)

**Route structure:**

```
/v1/sessions/*          # Learning sessions, exchanges, session events
/v1/profiles/*          # Profile management, persona, preferences
/v1/curriculum/*        # Curriculum generation, topics, learning paths
/v1/assessments/*       # Quizzes, recall tests, mastery scores
/v1/billing/*           # Billing, quota, top-ups
/v1/subjects/*          # Subject management
/v1/progress/*          # Progress tracking, coaching card, Learning Book
/v1/homework/*          # Homework photo processing (includes OCR endpoint)
/v1/dashboard/*         # Parent dashboard
/v1/settings/*          # User settings
/v1/account/*           # Account management
/v1/consent/*           # GDPR consent flows
/v1/streaks/*           # Streak tracking
/v1/retention/*         # Retention data
/v1/interview/*         # Onboarding interview
/v1/parking-lot/*       # Parking lot topics
/v1/stripe-webhook      # Stripe webhook handler
/v1/inngest             # Inngest webhook — NOT behind Clerk auth.
                        # Verify Inngest signing key, skip JWT middleware.
```

### Frontend Architecture

**State management:**
- **TanStack Query** for all server state (sessions, topics, coaching cards, dashboard data). Handles caching, background refetch, optimistic updates.
- **React Context** for auth state (Clerk session) and active profile (persona type, profile ID)
- **Local component state** for UI interactions (form inputs, modal visibility, scroll position)
- No Zustand at MVP. Add when shared client state crosses navigation boundaries and doesn't come from the server.

**Navigation:** Expo Router with route groups:

```
src/app/
├── (auth)/                    # Login, registration flows
│   ├── _layout.tsx
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   └── forgot-password.tsx
├── (learner)/                 # Learner persona routes
│   ├── _layout.tsx            # Learner tab bar + coaching voice
│   ├── home.tsx
│   ├── more.tsx
│   ├── subscription.tsx
│   ├── book/                  # Learning Book (coaching cards)
│   ├── onboarding/            # Subject creation → interview → curriculum
│   ├── session/               # Active learning/homework session
│   └── topic/[topicId].tsx
├── (parent)/                  # Parent persona routes
│   ├── _layout.tsx            # Parent nav + dashboard
│   ├── dashboard.tsx
│   ├── book.tsx
│   └── more.tsx
├── assessment/                # Standalone assessment flow
├── session-summary/[sessionId].tsx
├── consent.tsx                # Consent collection (outside auth group)
├── create-profile.tsx
├── create-subject.tsx
├── delete-account.tsx
├── profiles.tsx               # Profile switcher
├── sso-callback.tsx
└── _layout.tsx                # Root layout — sets CSS variables from active profile
```

**Styling:** NativeWind v4.2.1 + Tailwind CSS 3.4.19. CSS variable theming — root layout sets variables, all components are persona-unaware.

**Image handling:** Expo Image (built into SDK 54, optimized for React Native, handles caching and progressive loading). No additional library needed.

**Voice infrastructure (Epic 3 TEACH_BACK + Epic 8 Voice Mode):**
- **STT**: `expo-speech-recognition` for speech-to-text (on-device, no cloud dependency). Used in TEACH_BACK (MVP) and Full Voice Mode (v1.1).
- **TTS**: `expo-speech` for text-to-speech (built into Expo, on-device). Reads AI response aloud after SSE streaming completes (Option A: wait for complete response).
- **Recording UI state** in MessageThread: microphone button, waveform animation, transcript preview. Session-level mute toggle for TTS output (not a persistent preference).
- **Audio permissions** via standard Expo permission flow (`expo-speech-recognition` requests microphone on first use).

### Mobile-API Integration Patterns

**X-Profile-Id Header Convention:** All authenticated API requests include an `X-Profile-Id` header. The `useApiClient()` hook in `apps/mobile/src/lib/api-client.ts` automatically injects this from `ProfileProvider`. On the API side, routes extract it via `c.get('profileId')` set by `profileScopeMiddleware`. Falls back to `account.id` when the header is absent.

**SSE Streaming Parser:** Learning sessions use Server-Sent Events for real-time LLM responses. The `useStreamMessage` hook in `apps/mobile/src/hooks/use-sessions.ts` manages an `AsyncGenerator` for text streaming, concatenating chunks and handling cleanup on unmount.

**ProfileProvider/useProfile Lifecycle:** `ProfileProvider` in `apps/mobile/src/lib/profile.ts` loads the active profile on mount via TanStack Query, provides it via React Context, and exposes `switchProfile()`. Root `_layout.tsx` wraps the app with this provider. `useProfile()` is the access point for all profile-dependent UI.

### Infrastructure & Deployment

**Primary deployment:**
- **API**: Cloudflare Workers via `@naxodev/nx-cloudflare` (fallback: Hono on Railway via Docker)
- **Mobile**: EAS Build + EAS Submit (App Store / Google Play)
- **Database**: Neon (managed, auto-scaling)

**CI/CD:** GitHub Actions from forked repo. Nx Cloud for remote caching and affected-only builds. Matrix: lint → typecheck → test → build → deploy (staging on push to main, production on manual dispatch with approval gate).

**Environment configuration:** `.env` files per environment (dev/staging/prod). Cloudflare Workers uses `wrangler.toml` + Workers secrets for sensitive values. Neon branching for dev/staging databases.

**OCR:**
- **Primary**: ML Kit on-device (fast, no network dependency for common case)
- **Fallback**: Server-side OCR behind a service interface for math-heavy content. Provider (Mathpix vs CF Workers AI) evaluated during homework help epic — interface designed now, implementation deferred.

**Push notifications:** Expo Push Notifications (native to Expo, simplest integration, handles iOS APNs + Android FCM). No additional service needed at MVP.

**Embedding pipeline:** On-write via Inngest. When a session completes, `session.completed` event triggers embedding generation for the session's key concepts. Stored in pgvector alongside profile ID. Lazy backfill for existing sessions if needed.

**Observability:**
- **Mobile**: Sentry (`@sentry/react-native`) for crash reporting + performance monitoring
- **API**: `@sentry/cloudflare` (verify during project init it captures what's needed on Workers). If too limited, Sentry for mobile only.
- **Backend debugging**: Axiom as primary. Structured logging with correlation IDs, LLM call logging, SM-2 decision logging routed to Axiom.
- **OpenTelemetry**: Recommended for trace propagation (request → LLM → Inngest job chain)

### Decision Impact Analysis

**Implementation Sequence** (decisions that must be in place before dependent work):

1. Nx monorepo fork + strip (unblocks everything)
2. Neon database + Drizzle schema + scoped repository (unblocks all data-dependent work)
3. Clerk integration (unblocks auth, profile switching, consent)
4. Hono API shell + SSE streaming (unblocks session/LLM work)
5. TanStack Query + Expo Router navigation (unblocks all mobile screens)
6. Inngest setup (unblocks background jobs: SM-2, coaching card precompute)
7. Stripe integration (can be parallel with 4-6)
8. ML Kit OCR (can be parallel, needed for homework flow)

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database (Drizzle schema in `packages/database/`):**

| Element | Convention | Example |
|---------|-----------|---------|
| Tables | snake_case, plural | `learning_sessions`, `topic_schedules`, `session_events` |
| Columns | snake_case | `profile_id`, `created_at`, `escalation_rung` |
| Foreign keys | `{referenced_table_singular}_id` | `profile_id`, `session_id`, `curriculum_id` |
| Indexes | `idx_{table}_{columns}` | `idx_session_events_session_id`, `idx_topic_schedules_next_review` |
| Enums | snake_case type, SCREAMING_SNAKE values | `consent_state` type: `PENDING`, `PARENTAL_CONSENT_REQUESTED`, `CONSENTED`, `WITHDRAWN` |
| Timestamps | Always `created_at` + `updated_at` | UTC, `timestamp with time zone` |

**Drizzle schema file organization:** One schema file per domain, not one giant file and not one file per table.

```
packages/database/src/schema/
├── profiles.ts        # profiles, family_links, consent_states
├── sessions.ts        # learning_sessions, session_events, session_summaries
├── subjects.ts        # curricula, topics, learning_paths, topic_prerequisites (v1.1)
├── assessments.ts     # assessments, recall_tests, mastery_scores
├── billing.ts         # subscriptions, quota_pools, top_up_credits
├── progress.ts        # progress tracking, coaching states
├── embeddings.ts      # pgvector embeddings
└── index.ts           # re-exports all schemas
```

**EVALUATE schema changes (Epic 3 extension):** `verification_type` enum gains `EVALUATE` value. No structural changes to `session_events` table — existing columns store EVALUATE outcomes. Retention card schema (in `progress.ts`) extended with nullable `evaluateDifficultyRung` integer (1-4, default null = never evaluated).

**Analogy Domain schema changes (Epic 3 extension):** `teachingPreferences` table gains nullable `analogyDomain` column (text, constrained by Zod enum). No new table — reuses existing per-profile, per-subject `teachingPreferences` structure. Zod schema: `analogyDomainSchema = z.enum(['cooking', 'sports', 'building', 'music', 'nature', 'gaming'])` in `@eduagent/schemas`. Extends existing `teachingPreferenceSchema` to include optional `analogyDomain`. Existing `PUT /v1/subjects/:subjectId/teaching-preference` route extended to accept `analogyDomain`.

**TEACH_BACK schema changes (Epic 3 extension):** `verification_type` enum gains `TEACH_BACK` value. `session_events` table: new `structured_assessment` JSONB column (nullable) stores assessment rubric output — shared by TEACH_BACK and EVALUATE verification types. Zod schema `teachBackAssessmentSchema` in `@eduagent/schemas`: `{ completeness: z.number().min(0).max(5), accuracy: z.number().min(0).max(5), clarity: z.number().min(0).max(5), overallQuality: z.number().min(0).max(5), weakestArea: z.string(), gapIdentified: z.string() }`. `overallQuality` maps directly to SM-2 quality input.

**API (Hono routes in `apps/api/`):**

| Element | Convention | Example |
|---------|-----------|---------|
| Endpoints | plural nouns, kebab-case for multi-word | `/v1/sessions`, `/v1/progress`, `/v1/parking-lot` |
| Route params | camelCase | `/v1/sessions/:sessionId/exchanges/:exchangeId` |
| Query params | camelCase | `?subjectId=...&cursor=...&limit=20` |
| JSON fields | camelCase | `{ profileId, escalationRung, createdAt }` |
| HTTP methods | Standard REST | GET (read), POST (create), PATCH (partial update), DELETE |

**Code (TypeScript across all packages):**

| Element | Convention | Example |
|---------|-----------|---------|
| Files — components | PascalCase | `CoachingCard.tsx`, `SessionThread.tsx` |
| Files — utilities/hooks | camelCase | `useProfile.ts`, `createScopedRepository.ts` |
| Files — schemas/types | camelCase | `sessionSchemas.ts`, `profileTypes.ts` |
| Files — route handlers | camelCase | `sessions.ts`, `progress.ts` |
| Components | PascalCase | `CoachingCard` (planned: `BaseCoachingCard` per UX-7), `ChatShell` |
| Functions | camelCase | `routeAndCall()`, `decrementQuota()` |
| Constants | SCREAMING_SNAKE | `MAX_RETRY_ATTEMPTS`, `SESSION_TIMEOUT_MS` |
| Types/Interfaces | PascalCase | `SessionEvent`, `CoachingCardState` |
| Zod schemas | camelCase + `Schema` suffix | `sessionEventSchema`, `apiErrorSchema` |
| Inngest functions | `app/{domain}.{action}` | `app/session.completed`, `app/coaching.precompute` |

**Import ordering** (enforced via ESLint `import/order` plugin):

```typescript
// 1. External packages
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

// 2. @eduagent/* workspace packages
import { sessionEventSchema } from '@eduagent/schemas';
import { createScopedRepository } from '@eduagent/database';

// 3. Relative imports
import { processExchange } from '../lib/exchanges';
import { config } from '../config';
```

Groups separated by blank lines. Automated enforcement, not manual discipline.

**Exports:** Named exports everywhere. No default exports except where the framework requires them (Expo Router page components). Default exports make refactoring harder — renaming on import means grep can't find usages. Named exports keep the name consistent across the codebase.

### Structure Patterns

**Test location:** Co-located. Tests live next to the code they test.

```
routes/
├── sessions.ts
├── sessions.test.ts
├── progress.ts
└── progress.test.ts
```

Not a separate `__tests__/` directory. Exception: integration/E2E tests in a top-level `tests/` directory.

**Component organization (mobile):** Feature-based, not type-based.

```
components/
├── coaching/
│   └── CoachingCard.tsx         # (BaseCoachingCard hierarchy planned — UX-7)
├── session/
│   ├── ChatShell.tsx            # Reusable chat UI shell (replaces planned MessageThread)
│   └── MessageBubble.tsx        # Individual message rendering
├── progress/
│   └── RetentionSignal.tsx
└── common/
    ├── ErrorBoundary.tsx        # React error boundary (replaces planned ErrorRecovery)
    ├── DashboardCard.tsx
    └── UsageMeter.tsx
```

> **Note:** Current implementations (`CoachingCard`, `ChatShell`) are simplified versions of the planned UX-7 component hierarchy (`BaseCoachingCard` with 4 variants, `MessageThread` + wrappers). The UX specification component names represent the target architecture.

**Hono handler pattern:** Handler stays inline for route definition and Hono RPC type inference. Business logic extracted into service functions in `apps/api/src/services/` — testable, readable, handler is thin glue.

```typescript
// routes/sessions.ts — handler inline, logic extracted
const sessions = new Hono()
  .post('/:sessionId/exchanges', async (c) => {
    const input = exchangeInputSchema.parse(await c.req.json());
    const result = await processExchange(c.get('repo'), input); // lib/
    return streamSSE(c, result.stream);
  });
```

**Package exports:** Every package has an `index.ts` barrel file. Import from package name, never from internal paths.

```typescript
// CORRECT
import { sessionEventSchema, type SessionEvent } from '@eduagent/schemas';

// INCORRECT
import { sessionEventSchema } from '@eduagent/schemas/src/session/events';
```

**Dependency direction:** One-way flow, strictly enforced.

```
apps/mobile  →  @eduagent/schemas
apps/api     →  @eduagent/schemas
apps/api     →  @eduagent/database
apps/api     →  @eduagent/retention

@eduagent/database  →  (no workspace deps)   (uses drizzle-zod, not @eduagent/schemas directly)
@eduagent/retention →  (no workspace deps)   (pure math, zero deps)
@eduagent/schemas   →  (no workspace deps)   (leaf package)
@eduagent/factory   →  @eduagent/schemas     (test builders use schema types)
```

`packages/` never imports from `apps/`. `packages/schemas` never imports from `packages/database`. An agent importing a Drizzle type into a shared schema creates a circular dependency — the schema package must remain a leaf.

### Format Patterns

**API responses:**

```typescript
// Success — direct data, no wrapper
GET /v1/sessions/:id → { sessionId, currentRung, ... }
GET /v1/progress/:subjectId/topics → [{ topicId, title, retentionStatus, ... }]

// Error — typed envelope (from packages/schemas/)
{ code: "QUOTA_EXCEEDED", message: "Monthly question limit reached", details: { remaining: 0, resetDate: "2026-03-01" } }

// Paginated (cursor-based, session history only)
{ data: [...], cursor: { nextCursor: "2026-02-15T10:30:00Z_abc123" | null } }
```

**Dates:** ISO 8601 strings in JSON (`"2026-02-15T10:30:00Z"`). Always UTC. Frontend formats for display using user's locale.

**Nulls and optionality:**
- **Response schemas**: `.nullable()` — explicit `null` over missing keys so mobile app distinguishes "exists but empty" from "wasn't sent"
- **Request schemas** (POST/PATCH): `.optional()` — client shouldn't send `"fieldName": null` for fields it's not updating
- **Never**: `.nullable().optional()` — pick one

**IDs:** UUID v7 for all primary keys on user-facing entities (sessions, topics, exchanges, profiles). Timestamp-ordered B-tree indexes are naturally chronological — benefits cursor pagination and time-range queries without a separate `created_at` index. v4 only for IDs that must not leak creation order (security tokens).

### Communication Patterns

**Inngest events:**

```typescript
// Naming: app/{domain}.{action}
"app/session.completed"
"app/session.timed_out"
"app/coaching.precompute"
"app/retention.recalculate"

// Payload: always includes profileId + timestamp
{
  name: "app/session.completed",
  data: {
    profileId: "...",
    sessionId: "...",
    subjectId: "...",
    totalExchanges: 8,
    finalRung: 3,
    timestamp: "2026-02-15T10:30:00Z"
  }
}
```

**TanStack Query keys:** Array format, hierarchical, consistent ordering.

```typescript
// Pattern: [domain, resource, ...params]
['sessions', sessionId]
['sessions', sessionId, 'exchanges']
['book', subjectId, 'topics']
['coaching', profileId, 'card']
['billing', profileId, 'quota']
```

**Logging:** Structured JSON to Axiom. Always include correlation ID.

```typescript
logger.info({ correlationId, event: "llm.call.complete", model, tokensIn, tokensOut, latencyMs, cost });
logger.error({ correlationId, event: "llm.call.failed", model, error: err.message, attempt });
```

Log levels: `error` (failures requiring attention), `warn` (degraded but functional), `info` (significant events — LLM calls, session lifecycle, SM-2 decisions), `debug` (development only, never in production).

### Process Patterns

**Async/await:** Always `async`/`await`, never `.then()` chains. Exception: `Promise.all()` for parallel operations is fine.

**Return types:** Explicit return types on all exported functions and service functions. TypeScript can infer them, but explicit types serve as documentation, catch accidental return type changes, and speed up incremental compilation. Internal/private helper functions can rely on inference.

```typescript
// CORRECT — exported, explicit return type
export async function processExchange(repo: ScopedRepository, input: ExchangeInput): Promise<ExchangeResult> { ... }

// OK — private helper, inference fine
function buildPromptContext(session: Session) { ... }
```

**Error handling (API):**

```typescript
// Functional error helpers — no AppError class needed. Each helper returns a typed Hono Response.
// apiError(c, status, code, message, details?) — base helper
// notFound(c, message?) — 404 with ERROR_CODES.NOT_FOUND
// unauthorized(c, message?) — 401 with ERROR_CODES.UNAUTHORIZED
// forbidden(c, message?) — 403 with ERROR_CODES.FORBIDDEN
// validationError(c, details) — 400 with ERROR_CODES.VALIDATION_ERROR

app.onError((err, c) => {
  logger.error({ correlationId: c.get('correlationId'), error: err.message, stack: err.stack });
  return c.json({ code: "INTERNAL_ERROR", message: "Something went wrong" }, 500);
});
```

Functional error response helpers with typed codes (no class hierarchy). All responses follow `{ code, message, details? }` envelope matching `apiErrorSchema` from `@eduagent/schemas`. Never leak stack traces or internal details to client.

**Error handling (mobile):** TanStack Query `onError` callbacks per query/mutation. Global error boundary at root layout for unhandled crashes. Persona-appropriate error messages (coaching voice for learners, direct for parents).

**Loading states (mobile):** TanStack Query's built-in `isLoading`, `isFetching`, `isError`. No custom loading state management. Skeleton screens for initial loads (coaching card, Learning Book). Inline spinners for mutations (submit answer, save summary).

**Validation timing:**
- **Client**: Zod validation before sending (shared schema from `packages/schemas/`)
- **Server**: Zod validation on every route handler input (never trust client)
- **Database**: Drizzle schema constraints as final safety net

Both client and server import the same Zod schemas — single source of truth prevents drift.

**Environment-specific behavior:** Never `if (process.env.NODE_ENV === 'development')` in application code. If behavior differs by environment, drive it through configuration values (the typed config object from `apps/api/src/config.ts`). This prevents invisible behavior differences between environments.

### Enforcement Rules

**All AI agents MUST:**

1. Import types/schemas from `@eduagent/schemas`, never define API types locally
2. Use the scoped repository (`createScopedRepository(profileId)`), never write raw `WHERE profile_id =` clauses
3. Include `correlationId` in every log statement
4. Use Inngest for any async work that should survive a request lifecycle
5. Keep components persona-unaware — no conditional rendering based on persona type. Exception: `(learner)/home.tsx` reads persona for adaptive entry card routing (page-level routing logic that doesn't fit in layout)
6. Write co-located tests for every new route handler and component
7. Use Drizzle relational queries for CRUD, `sql` template tag for complex aggregations
8. Return typed `ApiError` envelope for all error responses, never ad-hoc JSON
9. **No direct LLM API calls.** Every LLM call goes through the orchestration module (`routeAndCall`). Ensures metering, logging, provider fallback, and cost tracking. A direct `fetch` to Anthropic/OpenAI bypasses metering and blinds the cost dashboard.
10. **Typed config object, never raw env reads.** All env vars accessed via typed config validated with Zod at startup (`apps/api/src/config.ts`). Missing var → fail immediately with clear error. Critical on Workers where env comes from `wrangler.toml` bindings.
11. **Respect dependency direction.** `packages/` never imports from `apps/`. `schemas` never imports from `database`. Circular dependencies are build-breaking errors.
12. **Named exports only.** No default exports except framework-required (Expo Router pages).
13. **Cross-service calls through exported interfaces.** `services/exchanges.ts` calling `services/retention.ts` uses the exported function (e.g., `getTopicSchedules(profileId)`), never imports internal helpers. Circular import graphs between services are a refactoring signal — extract shared logic into a new service or push it down to `packages/database`.

## Project Structure & Boundaries

### Complete Project Directory Structure

```
eduagent/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # Lint → typecheck → test → build (Nx Cloud caching)
│   │   ├── mobile-ci.yml            # EAS Build for PR previews
│   │   ├── deploy.yml               # Deploy API (staging on push to main, production on manual dispatch)
│   │   └── claude-code-review.yml   # AI-assisted PR review
│   └── CODEOWNERS
├── .claude/                          # Claude Code config (from fork)
│   └── CLAUDE.md
├── .husky/                           # Git hooks (from fork)
│   ├── pre-commit
│   └── commit-msg
├── apps/
│   ├── mobile/                       # Expo (React Native)
│   │   ├── src/
│   │   │   ├── app/                  # Expo Router file-based routes
│   │   │   │   ├── _layout.tsx       # Root layout — persona CSS vars, Clerk provider, error boundary
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── _layout.tsx
│   │   │   │   │   ├── sign-in.tsx
│   │   │   │   │   ├── sign-up.tsx
│   │   │   │   │   └── forgot-password.tsx
│   │   │   │   ├── (learner)/
│   │   │   │   │   ├── _layout.tsx       # Learner tab bar + coaching voice
│   │   │   │   │   ├── home.tsx          # Coaching card entry point (daily use)
│   │   │   │   │   ├── more.tsx          # Settings/account nav
│   │   │   │   │   ├── subscription.tsx  # Subscription management
│   │   │   │   │   ├── onboarding/
│   │   │   │   │   │   ├── _layout.tsx
│   │   │   │   │   │   ├── interview.tsx     # Conversational goal/background assessment
│   │   │   │   │   │   └── curriculum-review.tsx  # AI-generated path review + customization
│   │   │   │   │   ├── session/
│   │   │   │   │   │   └── index.tsx     # Active learning session
│   │   │   │   │   ├── book/
│   │   │   │   │   │   └── index.tsx     # Learning Book — all subjects
│   │   │   │   │   └── topic/
│   │   │   │   │       └── [topicId].tsx # Topic detail + practice
│   │   │   │   ├── (parent)/
│   │   │   │   │   ├── _layout.tsx       # Parent nav + dashboard
│   │   │   │   │   ├── dashboard.tsx     # Aggregated child progress
│   │   │   │   │   ├── book.tsx          # Parent view of Learning Book
│   │   │   │   │   └── more.tsx          # Parent settings/account
│   │   │   │   ├── assessment/
│   │   │   │   │   └── index.tsx
│   │   │   │   ├── session-summary/
│   │   │   │   │   └── [sessionId].tsx   # Post-session summary view
│   │   │   │   ├── consent.tsx           # GDPR parental consent flow
│   │   │   │   ├── create-profile.tsx
│   │   │   │   ├── create-subject.tsx
│   │   │   │   ├── delete-account.tsx
│   │   │   │   ├── profiles.tsx          # Profile switcher
│   │   │   │   └── sso-callback.tsx
│   │   │   ├── components/
│   │   │   │   ├── coaching/
│   │   │   │   │   └── CoachingCard.tsx      # (BaseCoachingCard hierarchy planned — UX-7)
│   │   │   │   ├── session/
│   │   │   │   │   ├── ChatShell.tsx         # Reusable chat UI shell
│   │   │   │   │   └── MessageBubble.tsx     # Individual message rendering
│   │   │   │   ├── progress/
│   │   │   │   │   └── RetentionSignal.tsx
│   │   │   │   └── common/
│   │   │   │       ├── ErrorBoundary.tsx
│   │   │   │       ├── DashboardCard.tsx
│   │   │   │       └── UsageMeter.tsx
│   │   │   ├── hooks/                    # TanStack Query hooks (kebab-case convention)
│   │   │   │   ├── use-sessions.ts       # Session CRUD + useStreamMessage (SSE)
│   │   │   │   ├── use-coaching-card.ts
│   │   │   │   ├── use-curriculum.ts
│   │   │   │   ├── use-interview.ts
│   │   │   │   ├── use-subjects.ts
│   │   │   │   ├── use-progress.ts
│   │   │   │   ├── use-retention.ts
│   │   │   │   ├── use-streaks.ts
│   │   │   │   ├── use-subscription.ts
│   │   │   │   ├── use-settings.ts
│   │   │   │   ├── use-profiles.ts
│   │   │   │   ├── use-dashboard.ts
│   │   │   │   ├── use-assessments.ts
│   │   │   │   ├── use-account.ts
│   │   │   │   └── use-consent.ts
│   │   │   └── lib/
│   │   │       ├── api.ts               # Hono RPC type export (AppType)
│   │   │       ├── api-client.ts        # useApiClient() hook — Hono RPC client (hc<AppType>)
│   │   │       ├── profile.ts           # ProfileProvider + useProfile() context
│   │   │       ├── sse.ts               # parseSSEStream() for learning session streaming
│   │   │       ├── theme.ts             # Theme utilities
│   │   │       ├── design-tokens.ts     # NativeWind design token definitions
│   │   │       └── clerk-error.ts       # Clerk error handling utilities
│   │   ├── assets/
│   │   │   ├── fonts/
│   │   │   └── images/
│   │   ├── app.json
│   │   ├── eas.json
│   │   ├── metro.config.js
│   │   ├── tailwind.config.js       # NativeWind v4.2.1 config
│   │   ├── tsconfig.json
│   │   ├── jest.config.ts
│   │   ├── project.json             # Nx targets
│   │   └── package.json
│   └── api/                          # Hono (Cloudflare Workers)
│       ├── src/
│       │   ├── index.ts             # Hono app entry, route mounting, global error handler
│       │   ├── routes/
│       │   │   ├── health.ts        # /v1/health — health check
│       │   │   ├── auth.ts          # /v1/auth — authentication
│       │   │   ├── sessions.ts      # /v1/sessions/* — learning sessions, exchanges
│       │   │   ├── profiles.ts      # /v1/profiles/* — profile management, persona
│       │   │   ├── curriculum.ts    # /v1/curriculum/* — curriculum gen, topics, paths
│       │   │   ├── subjects.ts      # /v1/subjects/* — subject management
│       │   │   ├── assessments.ts   # /v1/assessments/* — quizzes, recall, mastery
│       │   │   ├── billing.ts       # /v1/billing/* — billing, quota, top-ups
│       │   │   ├── progress.ts      # /v1/progress/* — progress tracking, coaching card, Learning Book
│       │   │   ├── homework.ts      # /v1/homework/* — homework processing (includes OCR endpoint)
│       │   │   ├── dashboard.ts     # /v1/dashboard/* — parent dashboard
│       │   │   ├── settings.ts      # /v1/settings/* — user settings
│       │   │   ├── account.ts       # /v1/account/* — account management
│       │   │   ├── consent.ts       # /v1/consent/* — GDPR consent flows
│       │   │   ├── interview.ts     # /v1/interview/* — onboarding interview
│       │   │   ├── streaks.ts       # /v1/streaks/* — streak tracking
│       │   │   ├── retention.ts     # /v1/retention/* — retention data
│       │   │   ├── parking-lot.ts   # /v1/parking-lot/* — parking lot topics
│       │   │   ├── stripe-webhook.ts # Stripe webhook handler
│       │   │   └── inngest.ts       # /v1/inngest — Inngest webhook (signing key auth)
│       │   ├── middleware/
│       │   │   ├── auth.ts          # Clerk JWT verification via JWKS (cached in KV)
│       │   │   ├── jwt.ts           # JWT token handling
│       │   │   ├── profile-scope.ts # Extracts profile, creates scoped repository
│       │   │   ├── request-logger.ts # Request logging + correlation ID injection
│       │   │   ├── database.ts      # Database connection middleware
│       │   │   ├── metering.ts      # Quota metering + rate limiting
│       │   │   ├── llm.ts           # LLM-related middleware
│       │   │   └── account.ts       # Account-related middleware
│       │   ├── services/
│       │   │   ├── exchanges.ts     # Exchange processing, prompt assembly, response handling
│       │   │   ├── curriculum.ts    # Curriculum generation, topic management
│       │   │   ├── assessments.ts   # Quiz generation, recall test scoring, mastery calc
│       │   │   ├── retention.ts     # SM-2 orchestration — calls @eduagent/retention, writes DB
│       │   │   ├── retention-data.ts # Retention data queries + updateRetentionFromSession
│       │   │   ├── embeddings.ts    # Embedding generation — provider call + pgvector write
│       │   │   ├── notifications.ts # Expo Push — batch sends, token cleanup, receipt checking
│       │   │   ├── metering.ts      # Quota enforcement (calls decrement_quota)
│       │   │   ├── session.ts       # Session management
│       │   │   ├── session-lifecycle.ts # Session lifecycle management
│       │   │   ├── adaptive-teaching.ts # Adaptive teaching logic
│       │   │   ├── subscription.ts  # Subscription management
│       │   │   ├── billing.ts       # Billing logic + quota pool/trial queries for Inngest
│       │   │   ├── trial.ts         # Trial management
│       │   │   ├── xp.ts            # XP/engagement tracking
│       │   │   ├── progress.ts      # Progress tracking, coaching card, Learning Book
│       │   │   ├── dashboard.ts     # Parent dashboard data
│       │   │   ├── profile.ts       # Profile management logic
│       │   │   ├── account.ts       # Account management
│       │   │   ├── consent.ts       # Consent management
│       │   │   ├── deletion.ts      # Account deletion orchestrator
│       │   │   ├── export.ts        # GDPR data export
│       │   │   ├── interview.ts     # Onboarding interview logic
│       │   │   ├── prior-learning.ts # Prior learning context
│       │   │   ├── summaries.ts     # Session summaries + createPendingSessionSummary
│       │   │   ├── parking-lot.ts   # Parking lot topic management
│       │   │   ├── escalation.ts    # Escalation logic
│       │   │   ├── streaks.ts       # Streak tracking + recordSessionActivity
│       │   │   ├── subject.ts       # Subject management
│       │   │   ├── subject-urgency.ts # Subject urgency calculations
│       │   │   ├── logger.ts        # Structured logging factory
│       │   │   ├── kv.ts            # Workers KV caching helpers
│       │   │   ├── settings.ts     # User settings management
│       │   │   ├── stripe.ts       # Stripe SDK helpers (customer, checkout, portal)
│       │   │   └── llm/             # LLM orchestration — imported via barrel
│       │   │       ├── router.ts    # routeAndCall(messages, rung, options?) — model routing, streaming
│       │   │       ├── types.ts     # ChatMessage, EscalationRung, RouteResult, StreamResult
│       │   │       ├── index.ts     # Barrel: export { routeAndCall, routeAndStream, registerProvider }
│       │   │       └── providers/
│       │   │           ├── gemini.ts # Gemini Flash (rung 1-2) + Gemini Pro (rung 3+)
│       │   │           └── mock.ts  # Test provider
│       │   ├── inngest/
│       │   │   ├── client.ts             # Inngest client init
│       │   │   ├── helpers.ts            # getStepDatabase() helper for step DB access
│       │   │   ├── index.ts              # Barrel for all Inngest functions
│       │   │   └── functions/
│       │   │       ├── session-completed.ts   # session.completed → SM-2 → coaching → dashboard → embeddings
│       │   │       ├── consent-reminders.ts   # Consent reminder schedule (7/14/25/30 days)
│       │   │       ├── account-deletion.ts    # Deletion orchestrator (7-day grace period)
│       │   │       ├── review-reminder.ts     # Scheduled retention review notifications
│       │   │       ├── payment-retry.ts       # Payment failure retry logic
│       │   │       ├── quota-reset.ts         # Monthly quota cycle reset
│       │   │       └── trial-expiry.ts        # Trial expiration handling
│       │   ├── config.ts            # Typed env config (Zod validated at startup)
│       │   └── errors.ts            # AppError class, typed error codes
│       ├── wrangler.toml            # Workers config + KV namespace bindings + rate limiting rules
│       ├── tsconfig.json
│       ├── tsconfig.app.json
│       ├── jest.config.ts
│       ├── project.json             # Nx targets: serve, build, deploy
│       └── package.json
├── packages/
│   ├── schemas/                     # Zod schemas + inferred types + Hono RPC exports
│   │   ├── src/
│   │   │   ├── sessions.ts
│   │   │   ├── profiles.ts
│   │   │   ├── subjects.ts         # Curricula, topics, learning paths, topic_prerequisites (v1.1)
│   │   │   ├── assessments.ts
│   │   │   ├── billing.ts          # Subscriptions, quota, top-ups
│   │   │   ├── auth.ts             # Authentication schemas
│   │   │   ├── common.ts           # Shared/common schemas
│   │   │   ├── account.ts          # Account management schemas
│   │   │   ├── consent.ts          # Consent flow schemas
│   │   │   ├── progress.ts         # Progress tracking schemas
│   │   │   ├── errors.ts           # ApiErrorSchema, typed error codes
│   │   │   └── index.ts            # Barrel export
│   │   ├── tsconfig.json
│   │   ├── project.json
│   │   └── package.json
│   ├── database/                    # Drizzle schema + Neon connection + scoped repository
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── profiles.ts     # profiles, family_links, consent_states
│   │   │   │   ├── sessions.ts     # learning_sessions, session_events, session_summaries
│   │   │   │   ├── subjects.ts     # curricula, topics, learning_paths, topic_prerequisites (v1.1)
│   │   │   │   ├── assessments.ts  # assessments, recall_tests, mastery_scores
│   │   │   │   ├── billing.ts      # subscriptions, quota_pools, top_up_credits
│   │   │   │   ├── progress.ts     # progress tracking, coaching states
│   │   │   │   ├── embeddings.ts   # pgvector embeddings
│   │   │   │   └── index.ts        # Re-exports all schemas
│   │   │   ├── repository.ts       # createScopedRepository(profileId)
│   │   │   ├── client.ts       # Neon serverless connection factory
│   │   │   ├── queries/            # Named query functions for complex/non-standard queries
│   │   │   │   ├── dashboard.ts    # Parent dashboard: GROUP BY, window functions
│   │   │   │   ├── retention.ts    # Retention analytics, decay calculations
│   │   │   │   └── embeddings.ts   # pgvector similarity search (cosine distance, LIMIT N)
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   ├── project.json
│   │   └── package.json
│   ├── retention/                   # SM-2 library — pure math, zero deps
│   │   ├── src/
│   │   │   ├── sm2.ts              # ~50 lines: interval, ease factor, next review date
│   │   │   ├── sm2.test.ts
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   ├── project.json
│   │   └── package.json
│   ├── test-utils/                  # Shared testing utilities
│   │   ├── src/
│   │   │   ├── setup.ts            # Jest environment setup
│   │   │   ├── mocks.ts            # Common mocks (Clerk, Neon, Inngest)
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   ├── project.json
│   │   └── package.json
│   └── factory/                     # Test data factories (types from @eduagent/schemas)
│       ├── src/
│       │   ├── profiles.ts
│       │   ├── sessions.ts
│       │   ├── subjects.ts
│       │   └── index.ts
│       ├── tsconfig.json
│       ├── project.json
│       └── package.json
├── nx.json                          # Nx workspace config, plugins, Nx Cloud
├── tsconfig.base.json               # Shared TS config, path aliases
├── pnpm-workspace.yaml
├── package.json
├── eslint.config.mjs                # ESLint 9 flat config (import ordering enforced)
├── .prettierrc
├── .editorconfig
├── .nvmrc
├── .npmrc                           # node-linker=hoisted if needed for Expo+pnpm
├── .env.example
├── .gitignore
└── commitlint.config.js
```

### Key Structural Decisions

**`apps/api/src/` split — `services/` (including `services/llm/`), `inngest/`, `middleware/` instead of flat `lib/`:**

The original `lib/` was accumulating too many unrelated concerns. Replaced with purpose-specific directories:

- **`services/`** — Business logic extracted from route handlers, including the `services/llm/` orchestration sub-module. Cross-service calls go through exported function interfaces (e.g., `exchanges.ts` calls `getTopicSchedules()` from `retention.ts`), never internal imports. When the dependency graph between services gets tangled, that's a refactoring signal.
- **`services/llm/`** — LLM orchestration module, nested inside `services/`. `routeAndCall()` in `router.ts`, exported via `index.ts` barrel. Services import as `from './llm'`. Currently only Gemini provider (Flash for rung 1-2, Pro for rung 3+) and mock provider. Does NOT include embedding generation — embedding is a different call pattern (single vector output, not streaming conversation).

**EVALUATE verification prompt (Epic 3 extension):**

New prompt template in `services/llm/` for generating plausibly flawed explanations. The LLM presents reasoning that contains a deliberate error; the student must identify the flaw. Forces Bloom's Level 5-6 (Evaluate/Create). Trigger condition: strong retention topics only (`easeFactor >= 2.5` and `repetitions > 0` on the SM-2 retention card) — students must demonstrate solid foundational knowledge before being challenged with analytical critique.

- **Prompt inputs:** topic key concepts, common misconceptions, student mastery level, current EVALUATE difficulty rung (1-4, stored on retention card as `evaluateDifficultyRung`).
- **Difficulty calibration reuses the existing escalation rung system** — not a parallel mechanism. Rung 1-2: obvious flaw (wrong formula, reversed cause-effect). Rung 3-4: subtle flaw (correct reasoning with one incorrect premise, edge case error).
- **Prompt engineering constraint:** the flawed argument must sound plausible. Too obvious = no learning value, too subtle = frustrating. The difficulty rung controls this balance.
- **Persona-aware framing** injected via the existing persona voice system in `buildSystemPrompt()`.

**Analogy Domain Injection (Epic 3 extension):**

`buildSystemPrompt()` checks `ExchangeContext.analogyDomain` (nullable string). When set, appends instruction: *"When explaining abstract concepts, use analogies from the domain of [domain]. Maintain this analogy framework consistently throughout the session. Adapt analogy complexity to the learner's level."* When null, no analogy instruction is added — direct technical explanation.

- **6 curated domains at launch:** cooking, sports, building, music, nature, gaming.
- **Single universal list** (not split by persona) — the LLM already adjusts tone via `getPersonaVoice()`, so analogies naturally adapt to teen vs adult register.
- **Domain selection is per-profile, per-subject** — stored alongside existing teaching method preference in `teachingPreferences` table. CRUD via `services/retention-data.ts` (same service that handles `get/set/deleteTeachingPreference`).
- **Prompt hash keying:** existing `system_prompt_hash` approach handles invalidation automatically when domain changes — a different analogy domain produces a different system prompt, which produces a different hash, which naturally bypasses stale cached prompt templates.

**TEACH_BACK verification prompt (Epic 3 extension):**

TEACH_BACK is the 9th verification type — Feynman Technique at scale. The LLM plays a "clueless but interested student" role while the student explains a concept verbally. On-device STT (`expo-speech-recognition`) produces a transcript, sent as a normal user message to the exchange endpoint.

- **Two-part LLM response:** (1) conversational follow-up question (visible to the student — maintains the "curious student" persona), (2) hidden structured assessment JSON stored in `session_events.structured_assessment` JSONB.
- **Assessment schema:** `{ completeness: 0-5, accuracy: 0-5, clarity: 0-5, overallQuality: 0-5, weakestArea: string, gapIdentified: string }`. `overallQuality` maps directly to SM-2 quality input. Weighting: accuracy 50%, completeness 30%, clarity 20%.
- **Same two-output pattern as EVALUATE** — natural student interaction + machine-readable scoring. The conversational response keeps the student engaged; the structured assessment feeds the retention system without exposing raw scores mid-session.
- **Trigger condition:** moderate-to-strong retention topics only (student must know the concept before teaching it). Weaker than EVALUATE's threshold (`easeFactor >= 2.5`) — TEACH_BACK tests explanation ability, not analytical critique.
- **TTS response:** `expo-speech` (built into Expo) reads the AI response aloud after SSE streaming completes (Option A: wait for complete response). Session-level mute toggle for TTS output, not a persistent preference.
- **Persona-aware framing** injected via the existing persona voice system in `buildSystemPrompt()`.

**Prerequisite context in system prompt (Epic 7, v1.1):**

`buildSystemPrompt()` will include prerequisite context when available. When a student is learning a topic whose prerequisite was skipped (recorded in `prerequisiteContext` JSONB on `curriculumAdaptations`), the system prompt receives additional context listing the skipped prerequisites so the LLM can bridge knowledge gaps — e.g., providing brief refreshers or explicit callouts when the current topic depends on concepts the student has not formally studied. This is injected alongside the existing analogy domain and persona voice, using the same prompt assembly pipeline.

- **`inngest/`** — Inngest client + all event handler functions in `inngest/functions/`. Each event handler is a step function (e.g., `session.completed` → SM-2 → coaching card → dashboard → embeddings). Isolated because Inngest functions have different execution context (durable, retryable, not request-scoped). Event handlers call into `services/` for actual logic.

**Embedding pipeline — separate from LLM orchestration:**

Embeddings are structurally different from conversational LLM calls: single input → single vector output, no streaming, no routing decisions, no escalation rung. The pipeline:
- **`services/embeddings.ts`** — Owns the embedding provider call (Voyage AI `voyage-3.5`, 1024 dimensions; behind an interface so provider is swappable). Content extracted from session events (`user_message` + `ai_response`), truncated to 8000 chars. Generates embedding vectors, writes to pgvector via `packages/database/src/queries/embeddings.ts`.
- **`packages/database/src/queries/embeddings.ts`** — Vector similarity search queries. Uses raw SQL (`ORDER BY embedding <=> $1 LIMIT $n` with cosine distance), not Drizzle relational queries. Different query pattern than standard CRUD.
- **`inngest/functions/session-completed.ts`** — Inngest step calls `services/embeddings.ts` as the final step after SM-2 and coaching card precompute.

**Adaptive teaching modes — per-subject preferences and within-session switching:**

Two complementary mechanisms control how the AI teaches:

1. **Per-subject teaching method preferences** (FR64-66, Epic 3 Story 3.9): `teaching_preferences` table stores method per `(profile_id, subject_id)` — one of `visual_diagrams`, `step_by_step`, `real_world_examples`, `practice_problems`. CRUD via `services/retention-data.ts` (`get/set/deleteTeachingPreference`). Prompt templates in `services/adaptive-teaching.ts` (`buildMethodPreferencePrompt`). **Wiring note:** method preference is not yet injected into `ExchangeContext` — hook point exists in `buildSystemPrompt()` but the fetch + injection in `session.ts` is pending.

2. **Within-session Socratic→Direct switching** (FR59-60, Epic 3): Three-strike rule in `services/adaptive-teaching.ts`. After 3 consecutive wrong answers on the same concept, `recordWrongAnswer()` returns `action: 'switch_to_direct'`, triggering `getDirectInstructionPrompt()` — clear explanation with concrete example, no more Socratic questioning. At 4+ strikes, `flag_needs_deepening` schedules the topic for revisiting. This is session-scoped (resets per session), not persistent.

3. **EVALUATE failure escalation** (Epic 3 extension): EVALUATE (Devil's Advocate / Debate Mode) uses a distinct escalation path from standard verification failures. Failing to spot a subtle flaw is not the same as conceptual misunderstanding — the escalation reflects this:
   - After EVALUATE failure: (1) reveal and explain the specific flaw (direct teaching on the misconception), (2) present a similar challenge at a lower difficulty rung, (3) if still failing, mark for standard review.
   - This is NOT re-teaching from scratch. The student knows the concept; they missed a critical evaluation step. The response targets analytical skill, not foundational knowledge.
   - Difficulty rung (`evaluateDifficultyRung` 1-4 on retention card) persists across sessions and advances independently of the Socratic escalation rung.

**Epic 6 extension point (v1.1):** Language learning (FR96-107) will require a third mechanism — a per-subject `teachingMode` distinguishing Socratic (default) from Four Strands methodology (language) and direct error correction. The existing `teaching_method` enum covers _how_ to teach (visual vs step-by-step); the new mode would control _what pedagogy_ to use. Likely implemented as an additional column on subjects or a new `pedagogy_mode` enum. **Note:** FR146 (Language SPEAK/LISTEN voice) is mapped to Epic 6, not Epic 8. Epic 8 (Full Voice Mode stories 8.1-8.2) must complete before Epic 6 SPEAK/LISTEN stories can begin — voice infrastructure is the dependency.

**Voice Mode Architecture (Epic 8 — v1.1):**

Voice-first session mode, orthogonal to session type (learning/homework/interleaved). Builds on the STT/TTS infrastructure established by TEACH_BACK (Epic 3, MVP). No new cloud dependencies — the entire voice pipeline is on-device.

- **TTS playback:** Option A at launch — wait for complete SSE response, then `expo-speech` reads aloud. Sentence-buffered Option B documented as upgrade path: sentence boundary detection is non-trivial (abbreviations like "Dr.", decimals like "3.14", URLs, code snippets all produce false splits). Option B requires a robust sentence tokenizer and introduces partial-playback/cancel complexity.
- **Voice session controls:** pause/resume TTS, replay last response, speed control (0.75x/1x/1.25x via `expo-speech` rate parameter), interrupt (stop current TTS and begin new STT recording).
- **VAD (FR148):** Optional/stretch — manual tap-to-stop is the reliable default. Voice Activity Detection has false positives in noisy environments (classrooms, public transport). If implemented, use `expo-speech-recognition`'s built-in silence detection with a conservative threshold (2s silence), not a custom VAD model.
- **Voice accessibility (FR149):** Shipped with the conservative coexistence strategy: detect when a screen reader is active, suppress app auto-play, keep the visual transcript available, and expose manual replay/speed controls plus haptics for recording state changes. This avoids competing audio channels while preserving voice-mode access. Physical iOS/Android verification is still recommended before store submission, but the product decision is no longer open.
- **Epic 8 dependency chain:** Epic 8 stories 8.1-8.2 (voice infrastructure + voice session mode) must complete before Epic 6 (Language Learning) SPEAK/LISTEN stories. Voice is the platform; language learning is a consumer.

**Onboarding as route-level split, not conditional rendering:**

`(learner)/onboarding/` is a separate route group with `interview.tsx` and `curriculum-review.tsx`. The alternative — conditional rendering inside `home.tsx` based on onboarding state — overloads one component with two responsibilities and makes testing harder. Onboarding is a distinct flow with different UI needs (conversational interview, curriculum display with skip/accept). After onboarding completes, `router.replace('/(learner)/home')` navigates to daily coaching. The `(learner)/_layout.tsx` wraps both, so coaching voice and tab bar are shared.

**`routes/homework.ts` — homework processing route (includes OCR):**

ML Kit handles OCR on-device (primary path). The server-side OCR endpoint exists within `routes/homework.ts` for the fallback case: when ML Kit fails or returns low-confidence results on math-heavy content. Mobile sends the image to the server, server runs it through the OCR provider interface (Mathpix vs CF Workers AI, provider TBD, interface defined now). The route accepts a base64-encoded image, returns structured text.

**Coaching card KV invalidation:**

Write-through on recompute: when `app/coaching.precompute` Inngest function completes, it writes the new card directly to Workers KV (key: `coaching:{profileId}`). No explicit invalidation -- overwrite replaces stale data. KV TTL set to 24h as safety net (if Inngest fails to recompute, stale card expires rather than persisting indefinitely). On KV miss, API queries Neon and backfills KV.

**SSE streaming and Workers CPU limits:**

Workers have a 30-second CPU time limit (wall-clock can exceed this since I/O waits don't count). For LLM streaming, CPU usage is minimal — mostly awaiting the provider's SSE stream and forwarding chunks. Typical tutoring exchanges complete well within limits. If long reasoning-heavy model responses push CPU time, Durable Objects is the escape hatch — maintains a persistent connection with no CPU time limit. Design the SSE handler so streaming logic is behind an interface, enabling migration to Durable Objects without changing route contracts.

**Rate limiting — two layers, different purposes:**

1. **Cloudflare rate limiting** (configured in `wrangler.toml`): 100 req/min per user per PRD. Stops abuse before it hits application code. Applies to all routes.
2. **Quota metering** (`services/metering.ts`): Per-profile question limits based on subscription tier. Applies to LLM-consuming routes only. Calls `decrement_quota` PostgreSQL function.

Different concerns: rate limiting protects infrastructure, quota metering enforces billing.

**Notifications service — centralized push delivery:**

`services/notifications.ts` encapsulates `expo-server-sdk`: batch sends, expired token handling (410 → remove token from DB), receipt checking, per-platform rate limit awareness. Any Inngest handler that needs to send a push calls this service rather than making direct Expo Push API calls. Failure modes are isolated and retry logic is written once.

**Observability files — established from day one:**

- **`logger.ts`** — Axiom structured logging factory. Creates loggers with automatic correlation ID injection. Every service file imports from here. Convention established at project init, not retrofitted after 20 service files exist.
- **`sentry.ts`** — `@sentry/cloudflare` initialization. Captures unhandled errors, sets user context from Clerk session, tags with profile ID and persona type.

**i18n — two distinct concerns:**

1. **UI translations**: `apps/mobile/assets/locales/{en,de}/*.json` via react-i18next. Namespace files per feature area (common, coaching, assessment, settings). Standard string lookup, nothing novel.
2. **LLM language preference**: NOT i18n infrastructure. The learner's preferred language is a field on their profile (`preferredLanguage`), injected into the system prompt during prompt assembly in `services/exchanges.ts`. The LLM responds in the learner's language naturally. This is a prompt construction concern, not a translation file concern. UI language and LLM language can differ (e.g., German UI, learning Spanish content).

**Test factory schema sync:**

`packages/factory/` imports types from `packages/schemas/` (same Zod-inferred types the API uses). If a schema changes and a factory doesn't update, TypeScript compilation fails — the type mismatch is caught at build time, not at test runtime. No runtime sync mechanism needed; the type system enforces it. CI runs `nx affected --target=typecheck` on every PR.

### Architectural Boundaries

**API Boundaries:**

| Boundary | Internal | External | Auth |
|----------|----------|----------|------|
| `/v1/sessions/*` | Exchange processing, session state | LLM providers (via orchestrator) | Clerk JWT |
| `/v1/profiles/*` | Profile CRUD, persona, family links | Clerk (user metadata sync) | Clerk JWT |
| `/v1/curriculum/*` | Curriculum generation, topic management | LLM providers (via orchestrator) | Clerk JWT |
| `/v1/assessments/*` | Quiz generation, recall scoring, mastery | LLM providers (via orchestrator) | Clerk JWT |
| `/v1/billing/*` | Subscription state, quota reads | Stripe (webhook-synced) | Clerk JWT |
| `/v1/progress/*` | Progress tracking, coaching card, Learning Book | Workers KV (cache reads) | Clerk JWT |
| `/v1/homework/*` | Homework processing, OCR text extraction | OCR provider (server-side fallback) | Clerk JWT |
| `/v1/dashboard/*` | Parent dashboard data | — | Clerk JWT |
| `/v1/account/*` | Account management | — | Clerk JWT |
| `/v1/consent/*` | GDPR consent flows | — | Clerk JWT |
| `/v1/subjects/*` | Subject management | — | Clerk JWT |
| `/v1/streaks/*` | Streak tracking | — | Clerk JWT |
| `/v1/retention/*` | Retention data | — | Clerk JWT |
| `/v1/interview/*` | Onboarding interview | LLM providers (via orchestrator) | Clerk JWT |
| `/v1/settings/*` | User settings | — | Clerk JWT |
| `/v1/parking-lot/*` | Parking lot topics | — | Clerk JWT |
| `/v1/stripe-webhook` | Stripe event processing | Stripe | Webhook signing secret |
| `/v1/inngest` | Event handler dispatch | Inngest platform | Inngest signing key |

**Component Boundaries (Mobile):**

```
Root Layout (_layout.tsx)
├── Sets: Clerk Provider, TanStack QueryClient, persona CSS variables, Sentry
├── Owns: Global error boundary, font loading, splash screen
│
├── (auth)/ — Auth-gated, no persona context yet
│   └── Communicates: Clerk SDK directly, no API calls except registration
│
├── (learner)/ — Requires authenticated profile with learner/teen persona
│   ├── home.tsx → reads: coaching card (TanStack Query → /v1/progress)
│   ├── onboarding/ → interview + curriculum review (first-run only, then router.replace to home)
│   ├── session/[id].tsx → reads/writes: session state (SSE stream + POST exchanges)
│   ├── homework/camera.tsx → uses: ML Kit OCR (on-device), falls back to /v1/homework/ocr
│   └── book/ → reads: Learning Book (full fetch, TanStack Query → /v1/progress)
│
└── (parent)/ — Requires authenticated profile with parent persona
    ├── dashboard.tsx → reads: aggregated child data (/v1/profiles/*/progress)
    └── profiles/[profileId].tsx → reads: child's session history, coaching state
```

**Service Boundaries (API):**

```
Route Handler (thin glue)
  │ validates input (Zod), calls service, formats response
  ▼
Service Function (business logic)
  │ orchestrates: DB queries, LLM calls, KV reads/writes
  │ never touches Hono context (c) — receives typed args, returns typed results
  │ cross-service calls: through exported function interfaces only
  ▼
┌──────────────────┬────────────────┬──────────────┬──────────────────┐
│ @eduagent/database │ services/llm/    │ Workers KV     │ services/embeddings │
│ (scoped repo +     │ (routeAndCall)    │ (coaching, sub) │ (embedding provider) │
│  queries/*)        │                   │                │                      │
└──────────────────┴────────────────┴──────────────┴──────────────────┘
```

**Data Boundaries:**

| Data Store | Reads | Writes | Boundary |
|-----------|-------|--------|----------|
| Neon (PostgreSQL) | All services via scoped repository | All services via scoped repository | `packages/database` — single access point |
| pgvector (in Neon) | `queries/embeddings.ts` — vector similarity search for memory retrieval | `services/embeddings.ts` via Inngest (on session.completed) | Same Neon connection, separate query module |
| Workers KV | `middleware/auth.ts` (JWKS), `services/progress.ts` (coaching card), `services/metering.ts` (subscription) | Inngest events (coaching precompute), Stripe webhook handler (subscription sync) | KV namespace bindings in wrangler.toml |
| Client storage | TanStack Query cache (automatic) | TanStack Query cache (automatic), `lib/storage.ts` (offline resilience) | AsyncStorage for persistence across app restarts |

### Requirements to Structure Mapping

**Epic-to-Structure Mapping:**

| Epic | Routes | Services | Components | Schemas | Database |
|------|--------|----------|------------|---------|----------|
| **Epic 0: Registration** | `profiles.ts`, `account.ts`, `consent.ts` | `profile.ts`, `account.ts`, `consent.ts`, `deletion.ts`, `export.ts` | `(auth)/*` | `profiles.ts`, `account.ts`, `consent.ts` | `schema/profiles.ts` |
| **Epic 1: Onboarding** | `curriculum.ts`, `interview.ts`, `subjects.ts` | `curriculum.ts`, `interview.ts`, `subject.ts` | `(learner)/onboarding/*` | `subjects.ts` | `schema/subjects.ts` |
| **Epic 2: Learning** | `sessions.ts`, `homework.ts` | `exchanges.ts`, `embeddings.ts`, `session-lifecycle.ts`, `adaptive-teaching.ts`, `escalation.ts` | `session/*`, `homework/*`, `coaching/*` | `sessions.ts` | `schema/sessions.ts` |
| **Epic 3: Assessment** | `assessments.ts`, `retention.ts` | `assessments.ts`, `retention.ts`, `retention-data.ts` | `assessment/*` | `assessments.ts` | `schema/assessments.ts` |
| **Epic 4: Progress** | `progress.ts`, `streaks.ts`, `dashboard.ts`, `parking-lot.ts` | `progress.ts`, `dashboard.ts`, `notifications.ts`, `streaks.ts`, `xp.ts`, `summaries.ts`, `parking-lot.ts` | `progress/*`, `book/*` | `progress.ts` | `schema/progress.ts` |
| **Epic 5: Subscription** | `billing.ts`, `stripe-webhook.ts` | `billing.ts`, `subscription.ts`, `trial.ts`, `metering.ts` | `(auth)/upgrade.tsx` (inline) | `billing.ts` | `schema/billing.ts` |
| **Epic 6: Language (v1.1)** | New route file | New service file | New component directory | New schema file | New schema file |
| **Epic 7: Concept Map (v1.1)** | `curriculum.ts` (extend), `concept-map.ts` | `concept-map.ts` (new), `coaching-cards.ts` (extend) | `concept-map/` (new), `book/` (extend) | `subjects.ts` (extend `topic_prerequisites`), `curriculumAdaptations` (add JSONB column) | `@eduagent/schemas` (prerequisiteContext Zod schema) |
| **Epic 8: Full Voice Mode (v1.1)** | `sessions.ts` (extend for voice mode flag) | `exchanges.ts` (extend for voice context) | `session/` (extend: voice controls, waveform), `hooks/use-voice.ts` (new) | `sessions.ts` (extend: voice mode schemas) | `schema/sessions.ts` (voice mode flag on sessions) |

**Cross-Cutting Concerns Mapping:**

| Concern | Location |
|---------|----------|
| Authentication | `middleware/auth.ts`, `middleware/jwt.ts`, `@clerk/clerk-expo` in root layout |
| Profile scoping | `middleware/profile-scope.ts` → `packages/database/repository.ts` |
| Quota/metering | `services/metering.ts` → `packages/database/` (`decrement_quota` function) |
| LLM orchestration | `services/llm/router.ts`, `services/llm/providers/gemini.ts`, `services/llm/types.ts` |
| Embedding pipeline | `services/embeddings.ts` (provider call) → `queries/embeddings.ts` (vector search) |
| Background jobs | `inngest/functions/*.ts` (Inngest functions) → call `services/` for logic |
| Push notifications | `services/notifications.ts` (centralized) ← called by Inngest event handlers |
| Persona theming | `theme/tokens/*.json`, `theme/provider.tsx`, root `_layout.tsx` |
| Error handling | `errors.ts` (API), `common/ErrorBoundary.tsx` (mobile) |
| Observability | `logger.ts` (Axiom), `sentry.ts`, `middleware/request-logger.ts` (correlation ID) |
| i18n (UI) | `assets/locales/{en,de}/*.json` via react-i18next |
| i18n (LLM) | Profile `preferredLanguage` field → system prompt in `services/exchanges.ts` |
| Spaced repetition | `packages/retention/` (math), `services/retention.ts` (orchestration) |

### Integration Points

**Internal Communication:**

```
Mobile App                          API (Hono on Workers)
    │                                    │
    ├── Hono RPC (typed HTTP)  ──────────┤
    │   POST /v1/sessions/:id/exchanges  │──→ services/exchanges.ts
    │   GET  /v1/progress/:profileId      │──→ services/progress.ts (→ KV → Neon fallback)
    │   GET  /v1/progress/:subjectId     │──→ packages/database (full fetch)
    │                                    │
    ├── SSE stream  ◀────────────────────┤
    │   (LLM response chunks)            │──→ services/llm/router.ts → LLM provider
    │                                    │
    └── Expo Push  ◀──────────── inngest/functions/ → services/notifications.ts
        (retention reminders)            │──→ Expo Push API
```

**External Integrations:**

| Service | Integration Point | Protocol | Auth |
|---------|------------------|----------|------|
| Clerk | `middleware/auth.ts`, `middleware/jwt.ts` + `@clerk/clerk-expo` | JWKS verification, REST API | JWT + API key |
| Stripe | `routes/stripe-webhook.ts`, `routes/billing.ts` | Webhook events, REST | Webhook signing secret |
| LLM providers (currently Gemini only; Claude, GPT-4 planned) | `services/llm/router.ts` | REST + SSE | API keys per provider |
| Voyage AI (voyage-3.5) | `services/embeddings.ts` | REST (`https://api.voyageai.com/v1/embeddings`) | API key |
| Inngest | `routes/inngest.ts` + `inngest/functions/*.ts` | Webhook | Inngest signing key |
| Neon | `packages/database/client.ts` | PostgreSQL wire protocol (serverless driver) | Connection string |
| Expo Push | `services/notifications.ts` | REST API | Expo push token |
| ML Kit | Mobile on-device (no server integration) | Native SDK | — |
| OCR fallback provider | `routes/homework.ts` (OCR sub-route) | REST API | API key |
| Axiom | `logger.ts` | HTTPS ingest | API token |
| Sentry | `sentry.ts` + `@sentry/react-native` | SDK | DSN |

**Data Flow — Learning Session:**

```
1. Student opens app
   └─ Mobile reads coaching card: TanStack Query → GET /v1/progress → KV (hit) or Neon (miss)

2. Student starts session
   └─ POST /v1/sessions → creates session row + first event

3. Student sends message / submits photo
   ├─ Text: POST /v1/sessions/:id/exchanges { message }
   └─ Photo: ML Kit OCR on-device → extracted text → POST /v1/sessions/:id/exchanges { message, source: "ocr" }
       └─ ML Kit fails? → POST /v1/homework/ocr { image } → extracted text → same exchange endpoint

4. API processes exchange
   ├─ middleware/auth.ts → Clerk JWT verification
   ├─ services/metering.ts → decrement_quota() → quota check
   ├─ middleware/profile-scope.ts → scoped repository
   └─ services/exchanges.ts:
       ├─ Loads session context (summary row + recent events + pgvector memory via queries/embeddings.ts)
       ├─ Assembles prompt (system + context + student message + preferredLanguage)
       ├─ services/llm/router.ts → routes to model by escalation rung → streams response
       └─ SSE stream back to mobile (client renders incrementally)

5. Exchange complete (stream ends)
   └─ Same transaction: append session_event + upsert session_summary

6. Session completes
   └─ POST /v1/sessions/:id/complete → fires "app/session.completed" to Inngest

7. Inngest step function executes (async, durable)
   ├─ Step 1: SM-2 recalculation (services/retention.ts → @eduagent/retention → topic_schedules)
   ├─ Step 2: Coaching card precompute (services/progress.ts → Workers KV write, 24h TTL)
   ├─ Step 3: Parent dashboard data update
   └─ Step 4: Embedding generation (services/embeddings.ts → embedding provider → pgvector INSERT)
```

### Development Workflow Integration

**Development Server Structure:**

```
# Terminal 1: Expo dev server (mobile)
nx serve mobile          # Metro bundler, hot reload

# Terminal 2: Hono dev server (API)
nx serve api             # wrangler dev (local Workers runtime) or node

# Terminal 3: Database
#   Neon branch for dev — no local PostgreSQL needed
#   drizzle-kit push for fast schema iteration
```

**Build Process:**

```
nx build mobile          # EAS Build (cloud) — iOS + Android bundles
nx build api             # Workers bundle (wrangler) or Docker (Railway)
nx run-many --target=typecheck   # All packages + apps — catches cross-boundary breaks
nx run-many --target=test        # Co-located tests, affected-only in CI
nx run-many --target=lint        # ESLint (import ordering, naming conventions)
```

**Deployment:**

| Target | Staging | Production |
|--------|---------|------------|
| API | `wrangler deploy --env staging` (on push to main) | `wrangler deploy --env production` (manual dispatch + approval) |
| Mobile | EAS Build → internal distribution | EAS Submit → App Store / Google Play |
| Database | Neon branch (auto-created per PR) | Neon main branch, migrations via CI |
| KV | Staging KV namespace | Production KV namespace |

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:**

All technology choices verified compatible (Feb 2026):
- Expo SDK 54 + NativeWind v4.2.1 (Tailwind 3.4.19) — confirmed working combination
- Hono 4.11.x on Cloudflare Workers — native SSE streaming via `streamSSE()`, Workers KV bindings
- Drizzle ORM + Neon serverless driver (`@neondatabase/serverless`) — both target PostgreSQL, connection factory pattern handles serverless pooling
- Clerk `@clerk/clerk-expo` + Hono middleware — JWT/JWKS verification compatible with Workers runtime, KV-cacheable JWKS
- Inngest + Cloudflare Workers — Inngest v3 supports Workers via `inngest/hono` serve adapter (for Hono apps) or `inngest/cloudflare` (bare Workers)
- Nx 22.2.0 + `@naxodev/nx-cloudflare` 5.0.x — version-compatible, plugin actively maintained
- pgvector in Neon — supported natively, no extensions to install

No contradictory decisions found. The Workers → Railway/Fly fallback path is clean because Hono runs on both without framework changes.

**Pattern Consistency:**

- Naming conventions are comprehensive (DB snake_case, API camelCase, code PascalCase/camelCase, Inngest `app/domain.action`)
- Import ordering, export rules, and dependency direction are consistent and enforceable via ESLint
- Co-located test pattern is uniform across routes, services, and components
- Error handling follows single pattern: functional helpers (`apiError`, `forbidden`, etc.) → typed `{ code, message }` envelope → `apiErrorSchema` in `packages/schemas`
- All 13 enforcement rules are non-contradictory and cover the most common agent mistakes

**Structure Alignment:**

- Project tree directly maps to all architectural decisions (services/, services/llm/, inngest/ correspond to documented patterns)
- Package boundaries (`schemas` → leaf, `database` → imports schemas, `retention` → zero deps) support the dependency direction rule
- Route structure mirrors API boundary table 1:1
- Mobile route groups align with persona boundaries (auth, learner, parent)
- Onboarding route split (`(learner)/onboarding/`) consistent between project tree and Epic 1 mapping

### Requirements Coverage Validation

**Epic Coverage:**

| Epic | Architectural Support | Coverage |
|------|----------------------|----------|
| Epic 0: Registration & Account Setup | Clerk auth, consent state machine, profile scoping, deletion orchestrator | Full |
| Epic 1: Onboarding & Interview | LLM orchestration for curriculum gen, `(learner)/onboarding/` route split (interview + curriculum review), curricula schema | Full |
| Epic 2: Learning Experience | SSE streaming, session state hybrid model, exchange processing, LLM routing by escalation rung, OCR pipeline (ML Kit + server fallback), homework integrity via prompt design | Full |
| Epic 3: Assessment & Retention | SM-2 library, Inngest lifecycle chain, mastery scoring in schema, delayed recall scheduling, "Needs Deepening" topic flagging, analogy domain injection in system prompt, TEACH_BACK verification (Feynman stage) with on-device STT/TTS | Full |
| Epic 4: Progress & Motivation | Learning Book (full fetch), coaching card (KV cache), decay visualization, honest streak, notifications service | Full |
| Epic 5: Subscription | Stripe webhook-synced, `decrement_quota` PostgreSQL function, KV-cached subscription status, family pool with row-level locking | Full |
| Epic 6: Language Learning (v1.1) | Deferred. Route/service/schema/component extension points documented. No blocking architectural debt. | Deferred by design |
| Epic 7: Concept Map (v1.1) | `topic_prerequisites` join table, DAG cycle detection service, graph-aware coaching card precomputation, `prerequisiteContext` JSONB on adaptations | Planned (v1.1) |
| Epic 8: Full Voice Mode (v1.1) | On-device STT/TTS pipeline (`expo-speech-recognition` + `expo-speech`), voice session controls (pause/resume/replay/speed), session-level input mode for all session types, screen-reader-aware manual playback fallback, VAD left as stretch. Dependency: Epic 8 before Epic 6 SPEAK/LISTEN | Implemented (8.6 stretch deferred) |

**Functional Requirements Coverage (121 MVP FRs):**

All 121 MVP functional requirements have architectural support. The architecture provides the structural slots, patterns, and infrastructure for every FR category. Specific algorithmic details (mastery formula, decay model, escalation thresholds, interleaved topic selection) are implementation concerns for individual stories — the architecture provides the right service files, database schemas, and integration patterns for those algorithms to live in.

**Non-Functional Requirements Coverage:**

| NFR | Target | Architectural Support | Status |
|-----|--------|----------------------|--------|
| API response (p95) | <200ms excl. LLM | Workers edge deployment, KV caching, scoped repository | Covered |
| LLM first token | <2s | SSE streaming, model routing (Gemini Flash for simple, Claude/GPT-4 for complex) | Covered |
| Camera → OCR → first AI | <3s | ML Kit on-device (no network), server fallback behind interface | Covered |
| App cold start | <3s | Coaching card precompute (KV), Expo bundle optimization | Covered |
| Uptime | 99.5% | Multi-provider LLM fallback, circuit breakers, Inngest durable jobs | Covered |
| Data durability | 99.99% | Neon managed backups, point-in-time recovery | Covered |
| Rate limiting | 100 req/min | Cloudflare Workers rate limiting (wrangler.toml) + quota metering middleware | Covered |
| GDPR | Full | Consent state machine, deletion orchestrator, data export, profile isolation | Covered |
| COPPA-adjacent | Ages 11-15 | Parental consent workflow, profile-scoped data access | Covered |
| i18n | EN+DE MVP | react-i18next + locale files + LLM `preferredLanguage` in system prompt | Covered |
| Accessibility | WCAG 2.1 AA | Phased per UX spec (MVP free, v1.1 moderate, v2.0 operational). NativeWind supports accessibility props. | Phased |
| Offline behavior | Read-only cached data | See "Offline Boundary" below | Defined |

**Offline Boundary:**

MVP offline behavior is **read-only cached data, no offline writes**:
- **Available offline**: Last-fetched coaching card, Learning Book topics, and profile data — cached by TanStack Query in `lib/storage.ts` (AsyncStorage persistence). Stale but useful.
- **Not available offline**: Active learning sessions, assessments, new exchanges, subscription changes — all require server roundtrip.
- **Behavior**: When offline, show cached data with a subtle "offline" indicator. Disable actions that require the server (start session, submit answer, take assessment). No offline queue or sync protocol.
- **Why this boundary**: Offline sessions would require local LLM inference or request queuing with conflict resolution — fundamentally different architecture. Defining this now prevents scope creep. Full offline is deferred to v2.0.

### Implementation Readiness Validation

**Decision Completeness:**

- All 10 critical decisions documented with specific versions
- 5 deferred decisions documented with clear deferral rationale
- Implementation patterns cover naming, structure, format, communication, and process
- 13 enforcement rules provide clear guardrails for AI agents
- Code examples provided for every major pattern (Hono handlers, scoped repository, error handling, Inngest events, TanStack Query keys, logging)

**Structure Completeness:**

- Complete project tree with every file and directory specified
- All 8 epics mapped to specific routes, services, components, schemas, and database files
- 13 cross-cutting concerns mapped to specific file locations
- Integration points documented with protocol, auth, and data flow

**Pattern Completeness:**

- Naming, structure, format, communication, and process patterns fully specified
- Import ordering, export rules, dependency direction — all enforceable via tooling
- Error handling, validation, loading states — patterns complete for both API and mobile

### Gap Analysis Results

**No critical gaps found.** All 121 MVP functional requirements have architectural homes. The following are important items to address during the Epics & Stories phase — they are implementation details, not architectural decisions:

**Implementation details to specify in stories (not architecture):**

| Area | Detail Needed | Where to Specify |
|------|---------------|-----------------|
| Summary quality validation (FR34-37) | Heuristic for copy-paste detection vs. legitimate summaries | Story acceptance criteria for mandatory production feature |
| Escalation rung thresholds (FR59-60) | When to advance from Socratic to direct instruction | Tech spec for LLM prompt engineering |
| Mastery scoring formula (FR48) | How to calculate 0-1 mastery from assessment performance | Story for mastery tracking feature |
| Knowledge decay model (FR90) | Mathematical model for retention decay visualization | Story for decay visualization component |
| Interleaved topic selection (FR92) | Algorithm for picking related/confusable topics for mixed recall | Story for interleaved retrieval feature |
| Parent dashboard precomputation | Whether to use live queries or snapshot tables | Tech spec for parent dashboard epic |

**Items to finalize during implementation (structural slots exist, decisions pending):**

| Item | Description | When |
|------|-------------|------|
| Embedding model/provider selection | RESOLVED — Voyage AI `voyage-3.5` (1024 dimensions), pgvector + HNSW index, cosine distance. Benchmark tool at `scripts/embedding-benchmark.ts`. | Completed (ARCH-16 spike) |
| Parental consent timeout Inngest job | Scheduled reminder emails (Day 7, 14, 25) + auto-delete (Day 30) | Epic 0 stories |
| Notification preferences schema | `notification_preferences` JSONB on profiles table | Epic 4 stories |
| Content flagging storage | How user-flagged content is persisted and reviewed | Epic 2 stories |
| Data export endpoint | GDPR data export format and endpoint | Epic 0 stories |
| Concept Map / prerequisite DAG | Cycle detection algorithm, LLM structured output for edges, graph-aware coaching card logic, visualization library selection | Epic 7 stories |

### Risk Areas

**Inngest lifecycle chain — highest integration risk:**

The `session.completed` → SM-2 recalculation → coaching card precompute → parent dashboard update → embedding generation chain is the most complex async flow in the system. Individual step unit tests will not catch the bugs that hide here: step ordering assumptions, data shape mismatches between steps, idempotency failures on retry, and partial chain completion. **Recommendation**: When writing Epic 3 stories, include an integration test that exercises the full chain using Inngest's test mode (`inngest/test`). Test the chain end-to-end: fire `session.completed`, assert all downstream side effects (topic_schedules updated, KV coaching card written, embedding generated). This is where most production bugs will surface.

**E2E testing — spike during Epic 2, not after:**

Detox/Maestro setup on CI with Expo is notoriously finicky — device farms, build configurations, Metro bundler integration, and CI runner compatibility all need to work. Leaving this to the end creates a release blocker with no slack. **Recommendation**: Spike E2E testing infrastructure during Epic 2 (when there's actual UI to test — session flow, coaching card). Solve the CI plumbing early. Even if initial coverage is just "app launches and navigates to home," the infrastructure being proven matters more than the test count.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed (149 FRs mapped, NFRs with targets, UX spec implications)
- [x] Scale and complexity assessed (5 inflection points, high complexity confirmed)
- [x] Technical constraints identified (decided stack with versions, remaining decisions with deferral rationale)
- [x] Cross-cutting concerns mapped (14 concerns with architectural patterns and scope)

**Architectural Decisions**

- [x] Critical decisions documented with versions (10 critical, all resolved)
- [x] Technology stack fully specified (Expo 54, Hono 4.11, Drizzle, Neon, Clerk, Stripe, Inngest, NativeWind 4.2.1)
- [x] Integration patterns defined (Hono RPC, SSE, Inngest events, Workers KV, Expo Push)
- [x] Performance considerations addressed (KV caching, ML Kit on-device, streaming, circuit breakers)

**Implementation Patterns**

- [x] Naming conventions established (DB, API, code, imports, exports — with examples)
- [x] Structure patterns defined (co-located tests, feature-based components, service extraction)
- [x] Communication patterns specified (Inngest events, TanStack Query keys, structured logging)
- [x] Process patterns documented (async/await, return types, error handling, validation, env config)

**Project Structure**

- [x] Complete directory structure defined (every file and directory)
- [x] Component boundaries established (API, mobile, service, data)
- [x] Integration points mapped (11 external services with protocol and auth)
- [x] Requirements to structure mapping complete (8 epics + 13 cross-cutting concerns)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High for architecture. Moderate for the Inngest lifecycle chain (integration risk) and E2E testing infrastructure (tooling risk). Both are mitigatable with the recommendations above.

**Key Strengths:**

1. **Strong type safety chain**: Zod schemas → Hono RPC → TanStack Query — type errors caught at compile time, not runtime
2. **Clean separation of concerns**: Routes (thin) → Services (logic) → Database (scoped) — testable at every layer
3. **Pragmatic caching strategy**: Workers KV for write-rare/read-often data, no over-engineered cache layer
4. **Durable background processing**: Inngest step functions handle multi-step lifecycle chains with built-in retry and observability
5. **Extensibility without overengineering**: Language Learning v1.1, Zustand, Durable Objects, dedicated vector store — all have clear migration paths without restructuring
6. **Cost-conscious AI design**: Metering middleware + routing by conversation state + soft ceiling monitoring — cost control without compromising learning experience
7. **Starting from existing infrastructure**: Fork of working Nx monorepo with CI/CD, commit quality, and testing already in place
8. **Clear offline boundary**: Read-only cached data at MVP, no ambiguity about what works without connectivity

**Areas for Future Enhancement:**

- Durable Objects migration for SSE if Workers CPU limits become an issue
- Parent dashboard snapshot precomputation if live queries exceed <200ms target
- Zustand for shared client state when TanStack Query + Context proves insufficient
- Dedicated vector store if pgvector scan times grow beyond acceptable at ~50K users
- Full offline capability with local cache + sync protocol (v2.0)

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented in this file
- Use implementation patterns consistently across all components (13 enforcement rules)
- Respect project structure and package boundaries (dependency direction is a build-breaking error)
- Refer to this document for all architectural questions before making independent decisions
- When a decision isn't covered here, it belongs in a story's tech spec — don't invent architectural precedent

**Implementation Sequence:**

1. Fork `cognoco/nx-monorepo`, strip Supabase/Next.js/Express specifics
2. Scaffold Hono API (`apps/api/`), rebuild database package (Drizzle + Neon)
3. Clerk integration (auth middleware, Expo SDK, consent flow)
4. Hono API shell + SSE streaming (unblocks session/LLM work)
5. TanStack Query + Expo Router navigation (unblocks all mobile screens)
6. Inngest setup (unblocks background jobs)
7. Stripe integration (can parallel with 4-6)
8. ML Kit OCR (can parallel, needed for homework flow)

**Early spikes:**

- E2E testing infrastructure (Detox or Maestro + CI) — spike during Epic 2
- Inngest lifecycle chain integration test — include in Epic 3 stories
- Embedding model/provider selection — COMPLETED. Voyage AI `voyage-3.5` selected after benchmark (`scripts/embedding-benchmark.ts`). 1024 dimensions, cosine distance, HNSW index.

---

## Architecture Completion Summary

**Architecture Decision Workflow:** COMPLETED
**Total Steps Completed:** 8
**Date Completed:** 2026-02-15
**Document Location:** `docs/architecture.md`

**Deliverables:**

- 11 critical architectural decisions resolved (all with specific versions)
- 5 deferred decisions documented with deferral rationale
- 13 enforcement rules for AI agent consistency
- Complete project directory structure (~100 files/directories)
- 121 MVP functional requirements mapped to architectural components
- 8 epics + 13 cross-cutting concerns mapped to specific file locations
- 11 external service integrations documented with protocol and auth
- 2 risk areas identified with mitigation strategies

**Architecture Status:** READY FOR IMPLEMENTATION

**Next Phase:** Epics & Stories (`/bmad:bmm:workflows:create-epics-stories`)

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.
