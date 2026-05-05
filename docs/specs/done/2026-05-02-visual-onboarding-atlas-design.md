# Mentomate Visual Onboarding Atlas Design

## Purpose

Create a high-detail visual artifact pack that helps technical non-coders, especially PMs and product owners, understand Mentomate quickly. The pack should explain what the app does, how users move through it, how the system is built, which cloud services it depends on, how data and AI flows work, and how the product is operated.

The target output is not a marketing explainer. It is an internal onboarding reference that preserves real technical nouns and makes them understandable.

## Recommended Direction

Build an interactive HTML atlas as the source of truth, with static PNG exports and a secondary slide deck generated from those exported boards.

This preserves the dense, systems-board look of the provided reference image while adding internal onboarding affordances:

- Guided 9-board sequence with Previous and Next navigation.
- Jump index for returning users.
- Clickable nodes with plain-English explanations.
- Side drawers for repo paths, status, ownership, risks, and related artifacts.
- High-resolution PNG export for docs, Notion, and slide reuse.
- Secondary slide deck built from the exported boards plus short speaker notes.

The atlas should use real names such as Expo, Hono, Cloudflare Workers, Workers KV, Neon, Drizzle, Clerk, Sentry, Inngest, RevenueCat, Stripe, Resend, EAS, Gemini, OpenAI, Anthropic, Voyage AI, SSE, pgvector, Nx, pnpm, Jest, Playwright, Maestro, and Doppler.

## Visual Style

Use an information-dense systems-board style similar in spirit to the reference image provided during planning.

Key traits:

- Large descriptive title per board.
- Broad horizontal lanes for product surface, runtime services, data, async jobs, operations, and risks.
- Boxed system nodes with icon-like symbols, short labels, and small explanatory text.
- Directional arrows for product flow, data flow, async/event flow, and dependency flow.
- Color-coded boundaries for app surfaces, backend/runtime, data, external services, billing, observability, async jobs, and warnings.
- A legend on every board.
- Status labels for `Current`, `Dormant`, `Deferred`, and `Future`.
- Small "where to look" callouts for key nodes, pointing to repo paths or docs.
- Risk and decision notes for non-obvious tradeoffs.

Avoid decorative or marketing-style composition. These boards should look like operational system maps: dense, precise, and useful.

## Navigation Model

Use Guided Tour + Index.

The primary path is a fixed sequence of 9 boards. Each board has:

- Board number and title.
- Previous and Next controls.
- Index control.
- Export PNG control.
- Board legend.
- Clickable nodes.
- Side drawer for selected-node detail.

The index should list all boards and major node groups so users can jump directly to a topic such as AI orchestration, billing, async reliability, or data lifecycle.

## Board Sequence

### 1. Product Narrative

Explain the app in product terms before showing architecture.

Content:

- Mentomate as an AI tutoring platform for learners aged 11+.
- Learner-facing value: Socratic coaching, voice-first sessions, homework help, quizzes, dictation, retention practice, progress visibility.
- Parent-facing value: child oversight, reports, subscription management, consent, profile management.
- Core product loop: choose subject, learn through conversation, produce/retrieve knowledge, review progress, return for spaced repetition.
- Current vs future notes where the repo contains deferred or dormant paths.

Primary nodes:

- Learner
- Parent
- Profile / family account
- Learning session
- Library / subjects / topics
- Progress and reports
- Subscription / entitlement

### 2. Capability Map

Show what exists as a capability landscape.

Content clusters:

- Authentication and account: Clerk, sign-in, profiles, consent, deletion.
- Learning: onboarding interview, subject creation, curriculum, sessions, homework, dictation, quizzes, assessments.
- Retention: SM-2, review due scans, recall nudges, library, progress, milestones.
- Parent view: dashboard, child reports, weekly/monthly progress, mentor memory.
- Billing: RevenueCat mobile IAP as current path, Stripe as dormant/future web and B2B path, quota/top-ups/trials.
- Support and feedback: support route, feedback route, Resend, Sentry.

Node details should include representative repo paths, not every file.

### 3. Journey Flow

Show the most important end-to-end user flows.

Suggested swimlanes:

- Learner onboarding: auth, profile, consent, subject setup, interview, curriculum review.
- Learning session: session start, voice/text input, SSE stream, AI response, session event persistence, recap.
- Homework/dictation/quiz: capture or prompt, process, generate practice, review.
- Parent oversight: select child, review dashboard/progress/reports, manage subscription.
- Payment and entitlement: RevenueCat purchase, webhook sync, local subscription state, quota enforcement.
- Failure/recovery states: pending consent, quota exceeded, stream fallback, stale session cleanup.

### 4. System Architecture

Show the full-stack architecture and dependency direction.

Content:

- `apps/mobile`: Expo SDK 54, React Native, Expo Router, NativeWind, TanStack Query, Clerk Expo, RevenueCat, Sentry mobile, Expo updates.
- `apps/api`: Hono on Cloudflare Workers, `/v1` API, middleware chain, route groups, Sentry Cloudflare wrapper.
- Shared packages:
  - `@eduagent/schemas`: Zod schemas and shared contracts.
  - `@eduagent/database`: Drizzle schema, Neon connection, scoped repository, RLS.
  - `@eduagent/retention`: SM-2 algorithm.
  - `@eduagent/test-utils`: test support.
- External services: Cloudflare, Neon, Clerk, Inngest, Sentry, RevenueCat, Stripe, Resend, EAS, LLM providers, Voyage AI.
- Dependency flow: mobile and API depend on schemas; API depends on database and retention; packages do not import from apps.

### 5. Cloud Service Map

Show external services by role.

Service groups:

- Runtime and edge: Cloudflare Workers, Workers KV, Cloudflare WAF rate limiting.
- Data: Neon PostgreSQL, pgvector, Drizzle migrations.
- Auth and identity: Clerk, JWKS verification, user/profile mapping.
- Background jobs: Inngest, signed `/v1/inngest` route, step functions, retries.
- Observability: Sentry Cloudflare, Sentry React Native, structured request logging, `wrangler tail`.
- Payments: RevenueCat current mobile IAP, Stripe dormant/future web/B2B, webhook handling, local subscription state, quota metering.
- Messaging: Resend for transactional email.
- Mobile delivery: EAS Build, EAS Submit, EAS Update, app stores.
- AI: Gemini, OpenAI, Anthropic, Voyage AI embeddings.
- Secrets/environment: Doppler, `.env.example`, Workers secrets, EAS env.

Each service node should answer:

- What is it for?
- Is it current, dormant, deferred, or future?
- Where does it connect to the repo?
- What failure or risk should a PM/PO know about?

### 6. Data Lifecycle

Explain what data is created, where it goes, and how privacy boundaries work.

Major flows:

- Account and profile: Clerk identity mapped to local accounts/profiles.
- Consent: pending/requested/consented/withdrawn states, blocking middleware, reminder jobs, revocation handling.
- Learning data: sessions, exchanges, summaries, topics, curricula, books, notes, parking lot, quiz results.
- Retention data: SM-2 card state, review schedules, nudges, progress snapshots.
- Billing data: RevenueCat/Stripe webhooks, subscription state, quotas, top-ups, trial expiry.
- Embeddings/memory: session-derived content, Voyage AI embedding, pgvector storage and retrieval.
- Observability data: Sentry events, structured logs, request context.
- Deletion/export: scheduled deletion, account deletion job, privacy constraints.

Important callouts:

- Profile scoping is a central data boundary.
- Scoped repository and RLS are defense layers.
- Inngest event payloads must not carry secrets.
- Stripe is not called during learning sessions; local DB/KV state is used.

### 7. AI Orchestration

Explain the LLM system without exposing prompt internals.

Content:

- User action enters app and reaches API.
- Metering middleware enforces quota before LLM-consuming routes.
- LLM middleware registers providers based on environment bindings.
- `services/llm/router.ts` owns `routeAndCall` and `routeAndStream`.
- Provider set: Gemini, OpenAI, Anthropic, with mock provider for tests.
- SSE streaming returns response chunks to the mobile app.
- Envelope parsing and projection keep model output structured.
- Prompt surfaces include sessions, onboarding interview, curriculum, quizzes, dictation, filing, summaries, and suggestions.
- Cost monitoring is a soft ceiling, not a learning-session cutoff.
- Embeddings are separate from conversational LLM calls: Voyage AI to pgvector.

Risks and decisions:

- Direct provider calls bypass metering and observability.
- SSE is simpler than WebSockets, but has runtime limits and fallback paths.
- Long reasoning-heavy responses may eventually require a different streaming runtime.
- Cost tuning is operational, not a hard stop during learning.

### 8. Async Reliability

Show how durable jobs make the app reliable after request completion.

Core Inngest groups:

- Session lifecycle: `sessionCompleted`, stale cleanup, empty reply fallback, orphan persist failure.
- Filing reliability: freeform filing retry, filing completed observe, timed-out observe, stranded backfill.
- Billing lifecycle: trial expiry, trial expiry failure observe, quota reset, top-up expiry reminders, billing trial subscription failure, payment failed observe.
- Consent and account lifecycle: consent reminders, consent revocation, scheduled deletion.
- Learning nudges and progress: recall nudge, review due scan/send, daily reminder scan/send, daily snapshot, weekly progress push, monthly report.
- Content and personalization: book pre-generation, post-session suggestions, ask classification observe, silent classify, interview persist curriculum, subject auto archive.
- Feedback/support observability: feedback delivery failed.

Each group should show trigger, work performed, side effect, retry/idempotency note, and what PM/POs should watch operationally.

### 9. Delivery + Quality

Explain how the system is built, tested, shipped, and monitored.

Content:

- Monorepo: Nx 22, pnpm 10, TypeScript strict mode.
- Build graph and package boundaries.
- Testing:
  - Jest unit tests colocated with source.
  - Integration tests in `tests/integration`.
  - Playwright web E2E.
  - Maestro mobile E2E, with runbook caveats.
  - Inngest tests and integration tests for lifecycle chains.
- Quality gates:
  - ESLint, Prettier, TypeScript, Husky, lint-staged, commitlint.
  - GitHub Actions and Nx Cloud.
  - CodeRabbit/Dependabot patterns where relevant.
- Deployment:
  - API to Cloudflare Workers by environment.
  - Mobile through EAS Build/Submit/Update.
  - Database via Drizzle migrations, not worker deploys.
  - Secrets through Doppler/Workers/EAS.
- Observability:
  - Sentry on API and mobile.
  - Structured request logs.
  - Inngest function visibility.
  - Cloudflare/Wrangler logs.

## Node Drawer Schema

Clickable nodes should open a consistent detail drawer:

- Name
- Category
- Plain-English role
- Current status: `Current`, `Dormant`, `Deferred`, `Future`
- Inbound dependencies
- Outbound dependencies
- Data touched
- Repo paths
- Related docs
- Tests or verification points
- Operational dashboards/logs
- Risks/decisions
- Related boards

Not every field must be populated for every node. Empty fields should be omitted.

## Source Structure

Use a data-driven HTML/CSS source so content is easier to maintain than hand-edited SVGs.

Proposed structure:

```text
docs/visual-artefacts/
  README.md
  atlas.html
  assets/
    atlas.css
    atlas.js
  data/
    boards.json
    nodes.json
    links.json
    legends.json
  exports/
    png/
    pptx/
  scripts/
    export-png.mjs
    build-deck.mjs
```

The exact structure can be refined during implementation, but the important point is that board content and node metadata live in structured data rather than being embedded only in layout markup.

## Export Targets

Primary:

- Interactive local HTML atlas.
- High-resolution PNG for each board.

Secondary:

- Slide deck with one board per slide and short speaker notes.

The PNG exports should be suitable for docs, Notion, slide decks, and printed reference. The slide deck should not be the canonical source of truth.

## Content Sources

Use repository evidence first:

- `README.md`
- `docs/architecture.md`
- `docs/project_context.md`
- `docs/PRD.md`
- `docs/specs/epics.md`
- `docs/deployment-and-secrets.md`
- `apps/api/src/index.ts`
- `apps/api/src/routes/*`
- `apps/api/src/services/*`
- `apps/api/src/inngest/index.ts`
- `apps/api/wrangler.toml`
- `apps/mobile/app.json`
- `apps/mobile/eas.json`
- `apps/mobile/src/app/**`
- `apps/mobile/src/hooks/**`
- `packages/*`
- `.env.example`
- GitHub workflow files
- E2E runbooks and current testing docs

When docs and code disagree, board copy should prefer current code and mark doc-only/future content clearly.

## Maintenance Rules

- Keep boards honest about current vs dormant vs future state.
- Keep technical nouns visible.
- Use plain-English one-liners beside technical labels.
- Prefer representative repo paths over exhaustive file lists.
- Use a consistent color and legend system across all boards.
- Keep each board independently exportable.
- Do not include secrets, real API keys, or account-sensitive details beyond public/service names already present in tracked config.
- Treat the slide deck as generated or secondary, not manually edited source.

## Acceptance Criteria

The artifact pack is successful when:

- A PM/PO can complete a first-pass onboarding walkthrough in 30-45 minutes.
- A returning stakeholder can jump directly to a board and understand a subsystem in under 5 minutes.
- Every major external service has a clear role, status, repo touchpoint, and risk note.
- The product capabilities, user journeys, architecture, data lifecycle, AI orchestration, async reliability, and delivery model are all represented.
- Static PNG exports preserve readability at high resolution.
- The slide deck can be regenerated or updated without becoming the source of truth.
- The boards do not confuse future intent with implemented behavior.

## Open Decisions

No material product or audience decisions remain open.

Implementation may choose exact CSS, icon strategy, export resolution, and whether to generate the PPTX directly or provide slide-ready PNGs plus a deck template. Those choices should preserve the source-of-truth rule: interactive HTML and structured board data remain canonical.
