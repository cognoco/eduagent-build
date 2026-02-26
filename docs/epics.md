---
stepsCompleted: [1, 2, 3, 4]
status: complete
inputDocuments:
  - 'docs/prd.md'
  - 'docs/architecture.md'
  - 'docs/ux-design-specification.md'
  - 'docs/analysis/epics-inputs.md'
---

# EduAgent - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for EduAgent, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Total: 149 FRs (121 MVP, 28 deferred to v1.1)**

**User Management (FR1-FR12) — Epic 0:**

- FR1: Users can register using email/password, Google OAuth, Apple Sign-in, or OpenAI OAuth
- FR2: Users can verify email addresses to activate accounts
- FR3: Users can reset passwords via email link
- FR4: Users can create multiple learner profiles under single subscription (family accounts)
- FR5: Users can switch between learner profiles
- FR6: Parents can switch into child's profile for full access to learning history
- FR7: Users aged 11-15 in EU can request parental consent during registration
- FR8: Users aged 11-12 in US can request parental consent during registration (COPPA)
- FR9: Parents can approve or decline consent via email link
- FR10: If parent declines consent, child account is deleted immediately with no data retained
- FR11: Users can delete their accounts and all associated data (GDPR)
- FR12: Users can export their learning data (GDPR)

**Learning Path Personalization (FR13-FR22) — Epic 1:**

- FR13: Users can specify any subject they want to learn
- FR14: Users can complete conversational interview to assess goals, background, and current level
- FR15: Users can receive AI-generated personalized curriculum based on interview
- FR16: Users can view complete learning path with topics and learning outcomes
- FR17: Users can request explanation for curriculum topic sequencing ("why this order?")
- FR18: Users can skip topics they already know
- FR19: Users can challenge curriculum and request regeneration
- FR20: Users can see confidence levels on curriculum topics (Core/Recommended/Contemporary/Emerging)
- FR21: Users can have curriculum adapt after module completion based on performance
- FR22: Users can see realistic time estimates per topic

**Interactive Teaching (FR23-FR33) — Epic 2:**

- FR23: Users can chat with AI tutor in real-time with streaming responses
- FR24: Users can ask follow-up questions for clarification
- FR25: Users can request simpler or more complex explanations
- FR26: Users can receive adaptive explanations based on demonstrated understanding
- FR27: Users can see worked examples appropriate to their skill level (full/fading/problem-first based on mastery)
- FR28: Users can receive cognitive load management (1-2 concepts per message maximum)
- FR29: Users can flag content that seems incorrect
- FR30: Users can choose between "Learn something new" and "Get help with homework" modes
- FR31: Users can receive Socratic guidance for homework (guided problem-solving, never answer-giving)
- FR32: Users can photograph homework problems for AI analysis (moved to MVP from v1.1 per UX spec)
- FR33: Users can see sessions marked as "guided problem-solving" in Learning Book

**Knowledge Retention (FR34-FR42) — Epic 2 (session-scoped retention):**

_These FRs happen within or at the close of a learning session. Distinct from Epic 3's lifecycle-scoped retention (spaced repetition, delayed recall)._

- FR34: Users can write 3-5 sentence summaries in their own words at topic completion (mandatory production)
- FR35: Users can receive AI feedback on summary quality and understanding
- FR36: Users can be guided to self-correct misunderstandings before AI provides corrections
- FR37: Users can skip summary production (with consequences: pending verification status)
- FR38: Users can have questions parked for later exploration (parking lot)
- FR39: Users can access parked questions in Topic Review
- FR40: Users can have AI reference prior learning in new lessons _(bridge FR: session-scoped behavior reading lifecycle data — depends on Epic 3's retention data model)_
- FR41: Users can receive understanding checks during lessons
- FR42: Users can choose in-app or push notifications for review reminders

**Learning Verification (FR43-FR51) — Epic 3 (lifecycle-scoped retention):**

- FR43: Users can take in-lesson quick checks (2-3 questions)
- FR44: Users can explain reasoning for answers (not just final answer)
- FR45: Users can receive feedback on WHERE thinking went wrong (not just "wrong")
- FR46: Users can take topic completion assessments
- FR47: Users can request re-tests on old topics from saved summaries
- FR48: Users can see mastery level per topic (0-1 score)
- FR49: Users can take delayed recall tests (2-week, 6-week intervals)
- FR50: Users can have XP verified only after passing delayed recall
- FR51: Users can see XP decay if recall tests fail

**Failed Recall Remediation (FR52-FR58) — Epic 3:**

- FR52: Users who fail recall tests (3+ times) are guided to Learning Book for that topic
- FR53: Users can see their previous scores, "Your Words" summary, and decay status
- FR54: Users can choose "Review & Re-test" (re-test available after 24+ hours)
- FR55: Users can choose "Relearn Topic" to restart learning
- FR56: Users who choose Relearn can select "Same method" or "Different method"
- FR57: Users who select "Different method" are asked by AI what would help (conversational prompt)
- FR58: AI adapts teaching approach based on user's feedback

**Adaptive Teaching (FR59-FR66) — Epic 3:**

- FR59: AI applies three-strike rule during lessons (3 wrong answers -> switch to direct instruction)
- FR60: AI explains with examples after 3 failed attempts, then rephrases question
- FR61: Topics where AI had to explain are saved to "Needs Deepening" section if user still struggles
- FR62: "Needs Deepening" topics are automatically scheduled for more frequent review
- FR63: "Needs Deepening" topics move to normal section after 3+ successful recalls
- FR64: Users can store teaching method preference per subject (not global)
- FR65: System auto-applies stored method preference when user starts session in that subject
- FR66: Users can reset teaching method preferences from Settings

**EVALUATE Verification — Devil's Advocate (FR128-FR133) — Epic 3 extension:**

- FR128: EVALUATE verification type — 8th type, Bloom L5-6, strong-retention gating
- FR129: Strong-retention gating — never on new/weak/fading topics
- FR130: Persona-appropriate framing — teen playful, adult academic
- FR131: Difficulty calibration — `evaluateDifficultyRung` 1-4 on retention card, tied to escalation rung system
- FR132: Modified SM-2 scoring floor — failure = quality 2-3, not 0-1
- FR133: Three-strike escalation — reveal flaw → lower difficulty → standard review

**Analogy Domain Preferences — Multiverse of Analogies (FR134-FR137) — Epic 3 extension:**

- FR134: Analogy domain selection — 6 curated domains per subject, nullable
- FR135: System prompt injection — softer wording: "prefer analogies... use naturally... don't force"
- FR136: Onboarding integration — optional step during subject onboarding
- FR137: Preference persistence — changeable anytime, takes effect next exchange

**Feynman Stage — Teach-Back Via Voice (FR138-FR143) — Epic 3 extension:**

- FR138: TEACH_BACK verification type — 9th type, Feynman Technique, AI plays "confused student," Bloom L6
- FR139: On-device speech-to-text — `expo-speech-recognition`, no cloud dependency
- FR140: Structured assessment rubric — two-output pattern (conversational + hidden JSON), completeness/accuracy/clarity scoring
- FR141: Voice response (TTS) — `expo-speech`, Option A (wait for complete), no cloud
- FR142: Voice toggle — session-level mute, not persistent preference
- FR143: Recording UI — microphone button, waveform animation, transcript preview

**Progress Tracking (FR67-FR76) — Epic 4:**

- FR67: Users can view Learning Book with all past topics
- FR68: Users can browse topic summaries with "Your Words" (user's own writing)
- FR69: Users can see retention scores and knowledge decay bars
- FR70: Users can see topic retention status (Strong/Fading/Weak/Forgotten) and struggle status (Normal/Needs Deepening/Blocked) as separate indicators
- FR71: Users can view progress through learning path (topics completed vs remaining)
- FR72: Users can see "completed vs verified" topic status
- FR73: Users can access topic review with key concepts, examples, user summary, and teacher notes
- FR74: Users can initiate re-learning for weak topics
- FR75: Users can continue from last topic ("Continue where I left off")
- FR76: Users can view "Needs Deepening" section with topics requiring extra review

**Multi-Subject Learning (FR77-FR85) — Epic 4:**

- FR77: Users can create multiple curricula (subjects) under one profile
- FR78: Users can view all active subjects on Home Screen with progress summary
- FR79: Users can switch between subjects from Home Screen or Learning Book
- FR80: Users can pause a subject (hidden from Home, accessible in Learning Book)
- FR81: Users can resume a paused subject
- FR82: Users can archive a subject (removes from active view, Learning Book entries preserved)
- FR83: Users can restore archived subjects from Settings
- FR84: Users can see subjects auto-archived after 30 days of inactivity
- FR85: Learning Book organizes topics by subject with subject switcher

**Engagement & Motivation (FR86-FR95) — Epic 4:**

- FR86: Users can maintain Honest Streak (consecutive days passing recall, not just opening app)
- FR87: Users can see Streak pause for 3 days (not instant break)
- FR88: Users can earn Retention XP (pending -> verified after delayed recall)
- FR89: Users can see "topics completed" vs "topics verified" distinction
- FR90: Users can view knowledge decay visualization (progress bars fading over time)
- FR91: Users can receive review reminders for fading topics
- FR92: Users can take interleaved retrieval sessions (multiple topics mixed, questions randomized)
- FR93: Users can see topics become "Stable" after 5+ consecutive successful retrievals
- FR94: Users can choose learning mode: "Serious Learner" (mastery gates, verified XP) or "Casual Explorer" (no gates, completion XP)
- FR95: Users can receive daily push notifications for learning reminders

**Language Learning (FR96-FR107) — DEFERRED to v1.1:**

- FR96: System detects language learning intent and switches to Four Strands methodology automatically
- FR97: Users can specify native language for grammar explanations
- FR98: Users can see realistic time estimates (FSI category: 600-2200 hours)
- FR99: Users can receive explicit grammar instruction (not Socratic discovery)
- FR100: Users can practice output (speaking/writing) every session
- FR101: Users can read comprehensible passages at 95-98% known words
- FR102: Users can practice vocabulary with spaced repetition (SM-2 algorithm)
- FR103: Users can see vocabulary count and CEFR progress (A1 -> A2 -> B1...)
- FR104: Users can practice fluency with time-pressured drills
- FR105: Users can learn collocations and phrases (not just isolated words)
- FR106: Users can see hours studied vs FSI estimate
- FR107: Users can receive direct error correction (not Socratic hints)

**Subscription Management (FR108-FR117) — Epic 5:**

- FR108: Users can start 14-day free trial with full access
- FR109: Users can have progress saved during and after trial
- FR110: Users can receive trial expiry warnings (3 days before)
- FR111: Users can upgrade to premium subscription (tiered: Plus/Family/Pro)
- FR112: Users can cancel subscription at any time
- FR113: Users can view subscription status and renewal date
- FR114: Users can access BYOK waitlist (email capture for future feature)
- FR115: Users can choose monthly or yearly billing (with annual discount)
- FR116: Users can add additional profiles to family account (per-profile pricing)
- FR117: Users can view token usage against tier ceiling

**Concept Map — Prerequisite-Aware Learning (FR118-FR127) — Epic 7 (v1.1):**

- FR118: Topic prerequisite graph — DAG data model, `topic_prerequisites` join table, REQUIRED/RECOMMENDED relationship types, cycle detection
- FR119: Prerequisite-aware session ordering — check prereq completion before recommending topic
- FR120: Skip warning on prerequisite topics — dialog + log to `curriculumAdaptations.prerequisiteContext`
- FR121: Visual concept map — read-only DAG visualization, nodes colored by retention status
- FR122: Prerequisite edge generation — LLM generates edges on subject creation, targeted call for new topics
- FR123: Graph-aware coaching card — new "newly unlocked" card type for topics with completed prerequisites
- FR124: Orphan edge handling — skipped prereqs logged, dependents remain accessible
- FR125: Prerequisite context as teaching signal — system prompt includes prereq context for gap bridging
- FR126: Topological sort for learning path — default ordering uses DAG topological sort
- FR127: Manual prerequisite override — parent/advanced learner marks prereq as "already known"

**Full Voice Mode (FR144-FR145, FR147-FR149) — Epic 8 (v1.1):**

- FR144: Voice-first session mode — any session type via voice, toggle at session start
- FR145: TTS playback — Option A at launch (wait for complete), sentence-buffered Option B as documented upgrade path
- FR147: Voice session controls — pause/resume, replay, speed (0.75x/1x/1.25x), interrupt
- FR148: Voice activity detection — OPTIONAL/STRETCH, manual tap-to-stop is default, VAD has false-positive issues
- FR149: Voice accessibility — VoiceOver/TalkBack coexistence with app TTS, needs spike/research first

_Note: FR146 (Language SPEAK/LISTEN voice integration) is mapped to Epic 6 (Language Learning). Epic 6 SPEAK/LISTEN stories depend on Epic 8.1-8.2._

### NonFunctional Requirements

**Performance:**

- NFR1: API response time <200ms (p95, excluding LLM calls)
- NFR2: LLM first token <2s (streaming response start)
- NFR3: App cold start <3s (on modern devices)
- NFR4: Real-time chat latency <100ms
- NFR5: Database query time <100ms (p95, simple queries)
- NFR6: Page load time <2s (initial app load)
- NFR7: Camera -> OCR -> first AI response <3s (homework help critical path)

**Reliability:**

- NFR8: System uptime 99.5% (excluding planned maintenance)
- NFR9: Data durability 99.99% (managed database service)
- NFR10: Multi-provider AI fallback (automatic failover between LLM providers)
- NFR11: Session recovery (automatic reconnection, restore state after temporary disconnection)
- NFR12: Daily automated backups

**Security:**

- NFR13: Token-based authentication with automatic expiration (Clerk JWT)
- NFR14: Data encryption in transit (industry-standard protocols)
- NFR15: Data encryption at rest for sensitive data
- NFR16: API rate limiting: 100 requests/minute per user (Cloudflare Workers)
- NFR17: All user inputs validated and sanitized (Zod on every route)
- NFR18: SQL injection prevention (parameterized queries via Drizzle)
- NFR19: XSS prevention (Content Security Policy, output encoding)
- NFR20: Secure session management with automatic expiration

**Privacy & Compliance:**

- NFR21: GDPR compliance (account deletion within 30 days, data export, parental consent)
- NFR22: Age verification (11+ minimum, birthdate validation)
- NFR23: Parental consent required for ages 11-15 in EU
- NFR24: COPPA compliance for ages 11-12 in US
- NFR25: Cookie consent (EU, web only)
- NFR26: Privacy policy available during registration
- NFR27: Terms of service acceptance required during registration

**Scalability:**

- NFR28: MVP: 1-1,000 users (managed services with auto-scaling)
- NFR29: Growth: 1,000-50,000 users (scaled managed services)
- NFR30: Scale: 50,000+ users (enterprise cloud infrastructure)

**Accessibility:**

- NFR31: WCAG 2.1 Level AA compliance (phased: MVP free, v1.1 moderate, v2.0 operational)
- NFR32: Full keyboard navigation support
- NFR33: Screen reader support (iOS VoiceOver, Android TalkBack)
- NFR34: Color contrast 4.5:1 minimum (text and UI elements)
- NFR35: System font scaling support up to 200%

**Localization:**

- NFR36: UI languages: English + German (MVP)
- NFR37: Learning languages: ANY (via LLM capability)
- NFR38: UTC + user local timezone support
- NFR39: EUR currency (MVP)

**Monitoring & Observability:**

- NFR40: Application error monitoring (Sentry) with crash reporting
- NFR41: User behavior analytics (event tracking, funnels, retention cohorts)
- NFR42: System performance tracking (CPU, memory, response times)
- NFR43: AI usage tracking (token usage, cost per session, provider distribution, correlation IDs)
- NFR44: Service availability monitoring (uptime, incident detection)

**Offline Behavior:**

- NFR45: Read-only cached data available offline (coaching card, Learning Book, profile data)
- NFR46: No offline writes or active sessions at MVP
- NFR47: Subtle "offline" indicator when disconnected; disable server-dependent actions

### Additional Requirements

**From Architecture — Starter Template & Infrastructure:**

- ARCH-1: Fork `cognoco/nx-monorepo`, strip Supabase/Next.js/Express specifics, scaffold Hono API, rebuild database package (Epic 0 Story 1)
- ARCH-2: Nx 22.5.0 monorepo with pnpm, `@naxodev/nx-cloudflare` 6.0.0 for Workers deployment
- ARCH-3: GitHub Actions CI/CD: lint -> typecheck -> test -> build -> deploy (Nx Cloud caching, affected-only)
- ARCH-4: Husky + lint-staged + commitlint from forked repo
- ARCH-5: Neon branching for dev/staging databases (no local PostgreSQL)
- ARCH-6: Environment config: typed config object (`config.ts`) validated with Zod at startup. Never raw `process.env` reads.

**From Architecture — Technical Patterns:**

- ARCH-7: Scoped repository pattern (`createScopedRepository(profileId)`) for all data access. Never raw `WHERE profile_id =` clauses.
- ARCH-8: LLM orchestration module (`routeAndCall()`) — all LLM calls must go through this. No direct provider API calls.
- ARCH-9: Model routing by conversation state (escalation rung): Gemini Flash for rung 1-2, reasoning models for rung 3+.
- ARCH-10: SM-2 as pure math library in `packages/retention/` (~50 lines, zero deps)
- ARCH-11: Workers KV for coaching cards (write on Inngest precompute, read on app open) and subscription status (write on Stripe webhook, read on metering)
- ARCH-12: SSE streaming for LLM responses via Hono `streamSSE()`. Design handler behind interface for potential Durable Objects migration.
- ARCH-13: Inngest for all async work that survives request lifecycle. Event naming: `app/{domain}.{action}`, payloads always include `profileId` + `timestamp`.
- ARCH-14: ML Kit on-device OCR primary, server-side fallback behind interface at `/v1/ocr`
- ARCH-15: Hono RPC for end-to-end type safety. `AppType` exported via `@eduagent/schemas`.
- ARCH-16: pgvector for per-user memory embeddings. `services/embeddings.ts` + `queries/embeddings.ts` (raw SQL cosine distance). Embedding model/provider TBD at Epic 2.
- ARCH-17: Two-layer rate limiting: Cloudflare (100 req/min, wrangler.toml) + quota metering middleware (per-profile questions/month via `decrement_quota` PostgreSQL function)
- ARCH-18: Centralized push notifications via `services/notifications.ts` (Expo Push SDK)
- ARCH-19: 13 enforcement rules for AI agent consistency (see architecture.md)
- ARCH-20: Typed error envelope (`ApiErrorSchema` from `@eduagent/schemas`) for all API error responses

**From Architecture — Testing & Quality:**

- ARCH-21: Co-located tests (`.test.ts` next to source, no `__tests__/` directories)
- ARCH-22: `packages/factory/` for test data (imports types from `@eduagent/schemas` — TypeScript catches drift at build time)
- ARCH-23: `packages/test-utils/` for shared mocks (Clerk, Neon, Inngest)
- ARCH-24: E2E testing spike during Epic 2 (Detox or Maestro + CI)
- ARCH-25: Inngest lifecycle chain integration test during Epic 3 (`inngest/test` mode)
- ARCH-26: Observability from day one: `logger.ts` (Axiom structured logging) + `sentry.ts` (crash reporting)

**From UX Design Specification:**

- UX-1: Camera input is MVP (moved from v1.1). Non-negotiable for homework mode.
- UX-2: Homework Fast Lane — separate, stripped-down UI within the app. No gamification, no curriculum clutter.
- UX-3: Parallel Example Pattern — max 2-3 Socratic questions before demonstrating method on a different but similar problem
- UX-4: Socratic Escalation Ladder — 5 rungs: Socratic Questions -> [skip] -> Parallel Example -> Transfer Bridge -> Teaching Mode Pivot
- UX-5: Coaching card two-path loading: cached (<1s, context-hash freshness) vs fresh (1-2s skeleton)
- UX-6: Three-persona theming (teen dark, learner calm, parent light) via CSS variables — components are persona-unaware
- UX-7: BaseCoachingCard component hierarchy with 4 variants (CoachingCard, AdaptiveEntryCard, ParentDashboardSummary, SessionCloseSummary)
- UX-8: Adaptive entry for child profiles (context-aware opening based on time, retention, patterns). Cold start (sessions 1-5) uses coaching-voiced three-button fallback.
- UX-9: Parent simulated dashboard during onboarding (trust demo with sample data)
- UX-10: Session maximum length: teen nudge 15min/cap 20min, eager learner nudge 25min/cap 30min
- UX-11: "Not Yet" feedback system — universal across all personas. Never "wrong" or "incorrect."
- UX-12: Silence & re-engagement: 3min gentle prompt (once), 30min auto-save to coaching card
- UX-13: Parent dashboard: 5-second glance design with one-sentence summary, traffic lights, temporal comparison, drill-down/drill-across
- UX-14: Profile switch: instant theme crossfade (100ms), content skeleton if data fetch needed
- UX-15: Recall warmup moved to AFTER homework success (completion/bridge phase)
- UX-16: "I don't know" is a valid input in homework help, not a failure state
- UX-17: NativeWind v4.2.1 + React Native Reusables (shadcn/ui-style copy-paste components)
- UX-18: Behavioral confidence scoring: per-problem time-to-answer, hints needed, escalation rung, difficulty. Feeds parent dashboard "guided vs immediate" signal.
- UX-19: Verification depth levels (parked PRD update #5) — enhance FR72: assessments track recall -> explain -> transfer (3 levels). Adds `verification_depth` field to `schema/assessments.ts`. Affects mastery scoring in Epic 3.

**Parked PRD Updates — Audit Summary (23 items from UX spec):**

_Audited during Step 1 to determine if any are architectural blockers._

| Status | Items | Count |
|--------|-------|-------|
| Already absorbed into ARCH-*/UX-* above | #1, #2, #3, #9, #14, #15, #16, #17, #25, #26, #27 | 11 |
| Deferred to v1.1/v2.0 (no action) | #4, #6, #10, #11, #18 | 5 |
| UX refinements — resolve during story writing | #7, #8, #12, #13, #19, #28 | 6 |
| Data model impact — surfaced as UX-19 above | #5 | 1 |

**No architectural blockers remaining.** One data model addition (UX-19 verification depth) captured.

### Story Decomposition Notes

**Session-scoped vs lifecycle-scoped retention boundary:**
- **Epic 2 (session-scoped):** FR34-42 — summaries, parking lot, prior learning references, in-lesson checks. Happen within/at close of a session.
- **Epic 3 (lifecycle-scoped):** FR43-66, FR128-143 — spaced repetition, delayed recall, mastery scoring, XP verification, EVALUATE verification, analogy domain preferences, Feynman Stage (TEACH_BACK via voice). Happen across sessions over time.
- **FR40 is the bridge:** session-scoped behavior reading lifecycle data. Story in Epic 2, dependency on Epic 3's retention data model.

**Homework as cohesive journey (within Epic 2):**
Homework Help spans FR30-33, UX-1 through UX-4, ARCH-14, and UX Journey 4. During story decomposition, these will be grouped as a **Homework Help story cluster** preserving the end-to-end flow: camera capture -> OCR -> Socratic guidance -> Parallel Example -> solution discovery -> recall bridge -> session close. Not scattered across unrelated stories.

**Offline NFR reconciliation:**
NFR45-47 derive from the architecture's "Offline Boundary" definition (architecture.md Step 7). The PRD's original NFR tables did not include offline. The architecture explicitly defined this boundary to prevent scope creep. These NFRs are architecturally grounded.

### FR Coverage Map

**All 149 FRs mapped. 121 MVP (Epics 0-5), 28 deferred (Epics 6, 7, 8).**

| FR Range | Category | Epic | Scope |
|----------|----------|------|-------|
| FR1-FR12 | User Management | Epic 0 | MVP |
| FR13-FR22 | Learning Path Personalization | Epic 1 | MVP |
| FR23-FR33 | Interactive Teaching | Epic 2 | MVP |
| FR34-FR41 | Knowledge Retention (session-scoped) | Epic 2 | MVP |
| FR42 | Review Notification Preferences | Epic 4 | MVP |
| FR43-FR51 | Learning Verification (lifecycle-scoped) | Epic 3 | MVP |
| FR52-FR58 | Failed Recall Remediation | Epic 3 | MVP |
| FR59-FR66 | Adaptive Teaching | Epic 3 | MVP |
| FR128-FR133 | EVALUATE Verification (Devil's Advocate) | Epic 3 | MVP |
| FR134-FR137 | Analogy Domain Preferences (Multiverse of Analogies) | Epic 3 | MVP |
| FR138-FR143 | Feynman Stage (TEACH_BACK via Voice) | Epic 3 | MVP |
| FR67-FR76 | Progress Tracking | Epic 4 | MVP |
| FR77-FR85 | Multi-Subject Learning | Epic 4 | MVP |
| FR86-FR95 | Engagement & Motivation | Epic 4 | MVP |
| FR96-FR107 | Language Learning | Epic 6 | v1.1 |
| FR108-FR117 | Subscription Management | Epic 5 | MVP |
| FR118-FR127 | Concept Map (Prerequisite-Aware Learning) | Epic 7 | v1.1 |
| FR144-FR145, FR147-FR149 | Full Voice Mode | Epic 8 | v1.1 |
| FR146 | Language SPEAK/LISTEN Voice | Epic 6 | v1.1 |

**Coverage verification:** 12 + 10 + 11 + 8 + 1 + 9 + 7 + 8 + 6 + 4 + 6 + 10 + 9 + 10 + 12 + 10 + 10 + 5 + 1 = **149 FRs, zero gaps.**

## Epic List

**9 epics total: 6 MVP (Epics 0-5), 3 deferred (Epics 6, 7, 8).**

### Epic 0: Project Foundation & User Registration

Users can register, authenticate, create family accounts with multiple profiles, and manage GDPR/COPPA consent. Foundation infrastructure (monorepo, CI/CD, database, auth) is established as part of delivering this user value.

**FRs covered:** FR1-FR12 (12 FRs)
**ARCH requirements:** ARCH-1 (starter template fork), ARCH-2 (Nx monorepo), ARCH-3 (CI/CD), ARCH-4 (commit quality), ARCH-5 (Neon branching), ARCH-6 (typed config), ARCH-7 (scoped repository), ARCH-15 (Hono RPC), ARCH-19 (enforcement rules), ARCH-20 (error envelope), ARCH-21 (co-located tests), ARCH-22 (test factory), ARCH-23 (shared mocks), ARCH-26 (observability)
**NFRs addressed:** NFR13-20 (Security), NFR21-27 (Privacy/Compliance), NFR28 (Scalability MVP tier), NFR40-44 (Monitoring)

**Implementation notes:**
- Fork `cognoco/nx-monorepo`, scaffold Hono API, database package, schemas package
- Clerk integration for auth (JWT, social login, multi-profile switching)
- GDPR account deletion + data export, COPPA/EU parental consent workflows
- CI/CD pipeline: lint → typecheck → test → build → deploy (Nx Cloud)
- Scoped repository pattern (`createScopedRepository`) established here, used by all subsequent epics
- **⚠️ Sprint time watch:** Infrastructure stories must not consume all sprint capacity — user-facing registration must ship in the same cycle. Time-box infra to ~40% of epic effort.

**Dependencies:** None (first epic)
**Enables:** All subsequent epics

---

### Epic 1: Onboarding & Curriculum Generation

Users can specify subjects, complete an AI-powered conversational assessment interview, receive a personalized curriculum with confidence levels and time estimates, and begin their learning journey. Parents see a simulated dashboard during onboarding.

**FRs covered:** FR13-FR22 (10 FRs)
**ARCH requirements:** ARCH-8 (LLM orchestrator `routeAndCall()`), ARCH-9 (model routing by escalation rung), ARCH-12 (SSE streaming)
**UX requirements:** UX-8 (adaptive entry, cold start 3-button fallback for sessions 1-5), UX-9 (parent simulated dashboard with sample data)

**Implementation notes:**
- First LLM integration — establishes `routeAndCall()` pattern used by all subsequent AI features
- Conversational interview requires SSE streaming via Hono `streamSSE()`
- Curriculum generation uses Gemini Flash (rung 1-2 routing)
- Parent onboarding journey: simulated dashboard with sample data for trust-building
- Cold start handling: sessions 1-5 use coaching-voiced three-button fallback (UX-8)

**Dependencies:** Epic 0 (auth, profiles, infrastructure)
**Enables:** Epic 2 (learning sessions need curriculum context)

---

### Epic 2: Learning Experience & Homework Help

Users can learn through real-time AI tutoring sessions with Socratic guidance, get homework help via camera capture and OCR, and have session-scoped retention features (mandatory summaries, parking lot, understanding checks, prior learning references).

**FRs covered:** FR23-FR42 (20 FRs)
**ARCH requirements:** ARCH-8 (LLM orchestrator), ARCH-9 (model routing), ARCH-12 (SSE streaming), ARCH-14 (ML Kit OCR + server fallback), ARCH-16 (pgvector embeddings — spike story)
**UX requirements:** UX-1 (camera MVP), UX-2 (Homework Fast Lane UI), UX-3 (Parallel Example Pattern), UX-4 (Socratic Escalation Ladder), UX-5 (coaching card two-path loading), UX-7 (BaseCoachingCard hierarchy), UX-10 (session length caps), UX-11 ("Not Yet" feedback), UX-12 (silence & re-engagement), UX-15 (recall warmup after homework), UX-16 ("I don't know" valid input), UX-18 (behavioral confidence scoring)

**Implementation notes:**
- **⚠️ Heaviest epic** (20 FRs + 10 UX/ARCH = 30 items). If story decomposition produces >15 stories, consider splitting into "Core Learning Sessions" (FR23-29, FR34-42) and "Homework Help" (FR30-33 + UX-1 through UX-4 + ARCH-14) as separate epics.
- **Homework Help story cluster** (cohesive journey, not scattered): camera capture → OCR → Socratic guidance → Parallel Example → solution discovery → recall bridge → session close
- **FR40 bridge dependency:** Session-scoped behavior reading lifecycle data from Epic 3's retention model. Story MUST include **"works with empty state"** acceptance criterion so it doesn't block on Epic 3.
- **ARCH-16 embedding spike:** Explicit spike story to finalize embedding model/provider decision. Required before Epic 3's Inngest chain generates embeddings.
- **ARCH-24 E2E testing spike:** Detox or Maestro evaluation + CI integration
- SSE streaming for real-time chat (builds on Epic 1's streaming foundation)
- ML Kit on-device OCR primary, server-side fallback behind `/v1/ocr` interface (ARCH-14)

**Dependencies:** Epic 0 (infrastructure), Epic 1 (curriculum context, LLM patterns)
**Enables:** Epic 3 (assessment/retention lifecycle), Epic 4 (progress tracking reads session data)

---

### Epic 3: Assessment, Retention & Adaptive Teaching

Users can take assessments with verified understanding, have knowledge tracked via SM-2 spaced repetition with delayed recall tests, receive adaptive teaching when struggling, and see mastery verified through multi-level recall (recall → explain → transfer).

**FRs covered:** FR43-FR66, FR128-FR143 (40 FRs)
**ARCH requirements:** ARCH-10 (SM-2 pure math library), ARCH-11 (Workers KV coaching cards), ARCH-13 (Inngest lifecycle chain), ARCH-16 (pgvector embedding generation), ARCH-25 (Inngest integration test)
**UX requirements:** UX-19 (verification depth levels: recall → explain → transfer)

**Implementation notes:**
- SM-2 as pure math library in `packages/retention/` (~50 lines, zero deps) — ARCH-10
- Inngest lifecycle chain: SM-2 calculation → coaching card KV write → dashboard update → embedding generation. Full chain integration test required (ARCH-25, `inngest/test` mode)
- Verification depth levels (UX-19): adds `verification_depth` field to `schema/assessments.ts`. Enhances FR72 mastery scoring.
- pgvector embedding generation uses provider/model decided in Epic 2's ARCH-16 spike
- Workers KV coaching cards: write-rare/read-often, 24h TTL safety net, overwritten on recompute (ARCH-11)
- Three-strike adaptive teaching rule (FR59-60) with "Needs Deepening" topic management
- Failed recall remediation flow: 3+ failures → Learning Book → Review & Re-test (24h cooldown) or Relearn Topic
- EVALUATE verification (Devil's Advocate): AI presents flawed reasoning for strong-retention topics, student identifies errors. Uses escalation rung system for difficulty calibration, modified SM-2 scoring floor.
- Multiverse of Analogies (FR134-FR137): per-subject analogy domain preference (6 curated domains), injected into LLM system prompt with softer wording ("prefer analogies... use naturally... don't force").
- Feynman Stage (FR138-FR143): TEACH_BACK verification type — AI plays "confused student" for Bloom L6 mastery. On-device STT/TTS via `expo-speech-recognition` and `expo-speech`. Structured assessment rubric (completeness/accuracy/clarity) with two-output pattern. Session-level voice toggle.

**Dependencies:** Epic 2 (session infrastructure, embedding spike decision)
**Enables:** Epic 4 (progress/dashboard reads retention data)

---

### Epic 4: Progress, Motivation & Parent Dashboard

Users can track progress via Learning Book, earn Honest Streak and Retention XP, manage multiple subjects, and parents can monitor children's learning via a 5-second-glance dashboard with traffic lights, temporal comparison, and drill-down.

**FRs covered:** FR67-FR95 (29 FRs)
**ARCH requirements:** ARCH-11 (coaching card KV reads), ARCH-18 (centralized push notifications via Expo Push SDK)
**UX requirements:** UX-5 (coaching card loading), UX-6 (three-persona theming), UX-7 (coaching card variants), UX-13 (parent dashboard design), UX-14 (profile switch crossfade)

**Implementation notes:**
- **Naturally parallel feature clusters** — less concerned about size:
  - Learning Book & Progress (FR67-76): topic summaries, retention scores, decay bars, "Your Words"
  - Multi-Subject Management (FR77-85): subject CRUD, pause/resume/archive, auto-archive 30d
  - Engagement & Motivation (FR86-95): Honest Streak, Retention XP, interleaved retrieval, Serious/Casual modes
  - Parent Dashboard (UX-13): one-sentence summary, traffic lights, temporal comparison, drill-down/drill-across
- Three-persona theming (UX-6): teen dark, learner calm, parent light via CSS variables. Components remain persona-unaware.
- Coaching card variants (UX-7): CoachingCard, AdaptiveEntryCard, ParentDashboardSummary, SessionCloseSummary
- Profile switch: instant theme crossfade (100ms), content skeleton if data fetch needed (UX-14)
- Push notifications for review reminders (FR91, FR95) via `services/notifications.ts` (ARCH-18)

**Dependencies:** Epic 2 (session data), Epic 3 (retention/mastery data for dashboard and Learning Book)
**Enables:** Full learning loop visible to users and parents

---

### Epic 5: Subscription & Billing

Users can start 14-day free trials, subscribe to premium tiers (Plus/Family/Pro), manage billing with monthly/yearly options, add family profiles, and see token usage against tier ceilings.

**FRs covered:** FR108-FR117 (10 FRs)
**ARCH requirements:** ARCH-11 (subscription status KV — write on Stripe webhook, read on metering), ARCH-17 (two-layer rate limiting: Cloudflare + quota metering middleware)

**Implementation notes:**
- Stripe integration: Checkout, subscriptions, family billing, top-up credits
- **Can be parallelized with Epics 2-4** — only touchpoint is metering middleware
- **✅ Metering middleware implemented:** Real quota enforcement is live via `middleware/metering.ts` (402 on quota exceeded, KV-cached subscription status, atomic `decrementQuota` with TOCTOU guards, refund on LLM failure). The original stub plan was superseded — metering was built alongside Epics 2-4 rather than deferred to Story 5.6.
- Webhook-synced subscription state in local DB. Never call Stripe during learning sessions — read from local cache.
- Subscription state machine: trial → active → cancelled → expired
- Workers KV for subscription status: write on webhook, read on metering check (ARCH-11)
- 14-day trial with full access, expiry warnings at 3 days

**Dependencies:** Epic 0 (auth, profiles, infrastructure)
**Enables:** Revenue, usage gating

---

### Epic 6: Language Learning (DEFERRED — v1.1)

Users can learn languages using Four Strands methodology with explicit grammar instruction, vocabulary spaced repetition, CEFR progress tracking, and time estimates based on FSI categories.

**FRs covered:** FR96-FR107 (12 FRs) + FR146 (Language SPEAK/LISTEN Voice, from Epic 8 dependency)

**Implementation notes:**
- Not in MVP scope. Deferred to v1.1.
- Requires Four Strands methodology integration (separate from general Socratic teaching)
- Auto-detection of language learning intent (FR96) switches teaching methodology
- Vocabulary SR uses same SM-2 engine from Epic 3's `packages/retention/`
- CEFR level tracking (A1→A2→B1→B2→C1→C2) as progress metric
- FR146 (SPEAK/LISTEN voice integration) depends on Epic 8.1-8.2 (voice-first session toggle + TTS playback)

**Dependencies:** Epics 0-3 (full learning infrastructure), Epic 8.1-8.2 (voice infrastructure for SPEAK/LISTEN stories)

---

### Epic 7: Concept Map — Prerequisite-Aware Learning (DEFERRED — v1.1)

**Scope:** v1.1 (post-MVP, pre-launch)
**FRs:** FR118-FR127 (10 FRs)

Knowledge graph of topic prerequisite relationships. Currently curriculum topics are a flat ordered list (`sortOrder`). Epic 7 adds directed acyclic graph (DAG) edges between topics, enabling prerequisite-gated progression, graph-aware coaching, and visual knowledge map.

**Key decisions:**
- DAG data model (not graph DB) — separate `topic_prerequisites` join table with `REQUIRED | RECOMMENDED` relationship types
- SM-2 stays pure per-topic — graph awareness in coaching precomputation only
- Skip + orphan pattern: skipping a prerequisite warns user, deletes edges, logs orphaned dependents in `curriculumAdaptations.prerequisiteContext` JSONB for LLM context injection
- Adding a topic: targeted LLM call for new edges only (not full graph regeneration)
- Visualization deferred to implementation — likely `react-native-svg` + Sugiyama layout. No WebView. Small graphs (15-50 nodes per subject).

**Dependencies:** Epic 3 (retention infrastructure), Epic 1 (curriculum/topic infrastructure)

---

### Epic 8: Full Voice Mode (DEFERRED — v1.1)

Users can use voice as the primary input/output mode for any session type, with playback controls, accessibility considerations, and optional voice activity detection.

**FRs covered:** FR144-FR145, FR147-FR149 (5 FRs). FR146 mapped to Epic 6.

**Key decisions:**
- On-device STT/TTS (no cloud) — reuses `expo-speech-recognition` and `expo-speech` infrastructure established by Feynman Stage (Epic 3 Cluster G)
- Option A TTS at launch (wait for complete SSE response before audio playback). Sentence-buffered Option B documented as upgrade path.
- VAD (voice activity detection) is STRETCH — manual tap-to-stop is the default. VAD has false-positive issues in noisy environments.
- Voice accessibility (screen reader coexistence) needs spike/research before implementation.

**Dependencies:** Epic 3 Cluster G (Feynman Stage establishes STT/TTS infrastructure). Epic 8 extends it to all session types. Epic 6 (Language Learning) SPEAK/LISTEN stories depend on Epic 8.1-8.2.
**Enables:** Epic 6 SPEAK/LISTEN voice stories (v1.1)

---

### Epic Dependency Graph

```
Epic 0 ──→ Epic 1 ──→ Epic 2 ──→ Epic 3 ──→ Epic 4
  │                      │           │           │
  └──→ Epic 5 (parallel) ┘           │           │
                                     │           │
                              Epic 3 Cluster G (Feynman Stage, MVP)
                                     │
                              Epic 8 (Full Voice, v1.1)
                                     │
                              Epic 6 (v1.1) ─────┘ (SPEAK/LISTEN depends on Epic 8.1-8.2)
                                     │
                              Epic 7 (v1.1) ← depends on Epic 1 + Epic 3
```

**Parallelization opportunities:**
- Epic 5 can start after Epic 0, running in parallel with Epics 1-4
- Epic 4's feature clusters (Learning Book, Multi-Subject, Engagement, Parent Dashboard) can be staffed in parallel
- Epic 2 potential split (if >15 stories): Core Learning Sessions and Homework Help can parallelize after initial session infrastructure

**Epic 7 dependencies:** Epic 3 (retention infrastructure — SM-2 data needed for graph-aware coaching) and Epic 1 (curriculum/topic infrastructure — `curriculumTopics` table must exist for prerequisite edges)

**Epic 8 dependency chain:** Epic 3 Cluster G (Feynman Stage, MVP) establishes STT/TTS infrastructure → Epic 8 (Full Voice Mode, v1.1) extends it to all session types → Epic 6 (Language Learning SPEAK/LISTEN, v1.1) depends on Epic 8.1-8.2. This means Epic 8 core (8.1-8.2) must complete before Epic 6 language voice stories.

---

## Epic 0: Project Foundation & User Registration — Stories

**Goal:** Users can register, authenticate, create family accounts with multiple profiles, and manage GDPR/COPPA consent. Foundation infrastructure established as part of delivering this user value.
**FRs:** FR1-FR12 (12 FRs) | **Stories:** 6

### Story 0.1: Email Registration & Account Activation

As a new user,
I want to register with my email and password and verify my email,
So that I can create my learning account.

**Acceptance Criteria:**

**Given** no account exists
**When** user submits email + password
**Then** account is created in Clerk and profile row created in Neon
**And** verification email is sent via Clerk

**Given** user has unverified account
**When** user clicks verification link
**Then** account is activated and user can log in

**Given** user submits invalid email or weak password
**When** form is submitted
**Then** Zod validation returns typed error envelope (ARCH-20)

**Given** Hono API is running
**When** a route is defined with Zod input/output schemas
**Then** `AppType` is exported via `@eduagent/schemas` and a mobile client call infers request + response types end-to-end (minimal working example: one route, one client call, type errors on mismatch — validates the RPC contract before all subsequent epics build on it)

**Given** authenticated user with valid JWT
**When** JWT approaches expiry during active use
**Then** `@clerk/clerk-expo` silently refreshes the token without interrupting the user session

**Given** token refresh fails (network error, revoked session)
**When** next API call is made
**Then** user is redirected to login with a clear message (not a cryptic auth error)

**Infrastructure delivered (no separate infra story):**
- Fork `cognoco/nx-monorepo`, scaffold Hono API + database + schemas packages (ARCH-1, ARCH-2)
- Hono RPC with `AppType` exported via `@eduagent/schemas` — validated with minimal end-to-end example (ARCH-15)
- Neon database with branching for dev/staging (ARCH-5). **All entity PKs use UUID v7 generation (`gen_random_uuid()` replacement or application-generated v7), not default v4.**
- Typed config validated with Zod at startup (ARCH-6)
- CI/CD: lint → typecheck → test → build → deploy (ARCH-3)
- Husky + lint-staged + commitlint (ARCH-4)
- Co-located test structure + `packages/factory/` + `packages/test-utils/` with Clerk mock (ARCH-21, 22, 23)
- Observability: `logger.ts` (Axiom) + `sentry.ts` (crash reporting) (ARCH-26)
- ESLint enforcement rules for import ordering and project conventions (ARCH-19)

**Sizing note:** Largest story in the entire project despite being the "simplest" feature. Actual email registration is ~20% of effort. Remaining ~80% is fork cleanup, Hono scaffolding, Neon database setup, CI/CD pipeline, observability, test infrastructure, and RPC type-safety chain. Estimate infrastructure honestly.

**FRs:** FR1 (email/password only), FR2

---

### Story 0.2: Social Login (Google & Apple)

As a new user,
I want to sign in with Google or Apple,
So that I can start quickly without creating a password.

**Acceptance Criteria:**

**Given** user is on registration screen
**When** user taps "Sign in with Google"
**Then** Google OAuth flow completes and account is created

**Given** user is on registration screen
**When** user taps "Sign in with Apple"
**Then** Apple Sign-in flow completes and account is created

**Given** user previously registered with email
**When** user signs in with social provider using same email
**Then** accounts are linked (Clerk handles)
**And** social login works on both iOS and Android via `@clerk/clerk-expo`

**FRs:** FR1 (Google OAuth, Apple Sign-in)

---

### Story 0.3: Password Reset

As a user who forgot their password,
I want to reset it via email link,
So that I can recover access to my account.

**Acceptance Criteria:**

**Given** user exists
**When** user requests password reset
**Then** reset email is sent via Clerk

**Given** user has reset link
**When** user clicks link and enters new password
**Then** password is updated and user can log in

**Given** email doesn't match any account
**When** user requests reset
**Then** same success message shown (no email enumeration)

**FRs:** FR3

---

### Story 0.4: Family Profiles & Profile Switching

As a parent,
I want to create multiple learner profiles under my account and switch between them,
So that each of my children has their own learning space.

**Acceptance Criteria:**

**Given** authenticated user
**When** user creates a new learner profile (name, age, avatar)
**Then** profile is created with UUID v7 and scoped data isolation

**Given** account has multiple profiles
**When** user taps profile switcher
**Then** profiles are listed and user can switch instantly (UX-14: theme crossfade 100ms)

**Given** parent account
**When** parent switches into child's profile
**Then** parent has full read access to child's learning history (FR6)
**And** all data access uses `createScopedRepository(profileId)` — no raw `WHERE profile_id =` clauses (ARCH-7)
**And** `packages/factory/` includes profile test data fixtures (ARCH-22)

**FRs:** FR4, FR5, FR6

**Phase 2 deferral:** Profile switch PIN/biometric authentication deferred per UX spec Party Mode revision (line 1631). Currently `profiles.tsx` is reachable via More tab — a child can switch to parent profile without authentication. Data isolation is enforced by `createScopedRepository(profileId)` but no auth gate protects the switch action itself. Phase 2 should add PIN/biometric verification before completing profile switch.

---

### Story 0.5: Parental Consent (GDPR & COPPA)

As a young user (11-15 in EU, 11-12 in US),
I want to request parental consent during registration,
So that I can use the app in compliance with privacy regulations.

**Acceptance Criteria:**

**Given** user enters age 11-15 and EU location
**When** registration continues
**Then** parental consent flow is triggered (FR7)

**Given** user enters age 11-12 and US location
**When** registration continues
**Then** COPPA consent flow is triggered (FR8)

**Given** consent requested
**When** parent receives email and approves
**Then** child account is activated (FR9)

**Given** consent requested
**When** parent declines
**Then** child account and ALL data are deleted immediately (FR10)
**And** consent state stored in Clerk user metadata
**And** consent email includes clear explanation of data collected and purpose

**Given** consent pending
**When** Day 7 reached
**Then** reminder email sent to parent

**Given** consent still pending
**When** Day 14 reached
**Then** second reminder sent

**Given** consent still pending
**When** Day 25 reached
**Then** final warning sent ("account will be deleted in 5 days")

**Given** consent pending for 30 days
**When** Day 30 reached
**Then** account and all data are auto-deleted (Inngest scheduled job)

**FRs:** FR7, FR8, FR9, FR10

---

### Story 0.6: Account Deletion & Data Export (GDPR)

As a user,
I want to delete my account and export my data,
So that I can exercise my privacy rights under GDPR.

**Acceptance Criteria:**

**Given** authenticated user
**When** user requests account deletion from Settings
**Then** deletion is scheduled with 7-day grace period (user can cancel during this window)

**Given** grace period active
**When** user changes their mind
**Then** user can cancel deletion and account is fully restored

**Given** grace period expires (Day 7)
**When** processing begins
**Then** all user data is permanently removed by Day 30 from original request (7-day grace + 23-day processing window = 30 days total, GDPR clock starts at request)

**Given** authenticated user
**When** user requests data export
**Then** downloadable JSON/CSV file is generated containing all personal data, learning history, and summaries (FR12)
**And** data export completes within reasonable time (<60s for typical account)

**Given** family account with multiple profiles
**When** account owner deletes account
**Then** all child profiles are also deleted
**And** deletion is handled as Inngest background job (survives request lifecycle, ARCH-13)

**FRs:** FR11, FR12

---

## Epic 1: Onboarding & Curriculum Generation — Stories

**Goal:** Users can specify subjects, complete an AI-powered conversational assessment interview, receive a personalized curriculum, and begin their learning journey.
**FRs:** FR13-FR22 (10 FRs) | **Stories:** 5
**Deferred from this epic:** UX-9 (parent simulated dashboard → Epic 4 as demo-mode toggle on real dashboard), UX-8 (cold-start three-button fallback → Epic 2 where it's actually used)

### Story 1.1: Subject Selection & Onboarding Entry

As a new learner,
I want to specify what subject I want to learn,
So that the AI can begin personalizing my learning path.

**Acceptance Criteria:**

**Given** authenticated user with a profile
**When** user navigates to "Learn something new"
**Then** subject input screen is displayed

**Given** user on subject input
**When** user types any subject (free text)
**Then** subject is accepted and stored (FR13)
**And** system does not restrict to a predefined list — any subject is valid (LLM handles the breadth)

**Given** this is the user's first subject
**When** subject is submitted
**Then** conversational interview begins (transition to Story 1.2)

**Given** user already has subjects
**When** user adds another subject
**Then** same flow, new curriculum created under same profile

**FRs:** FR13

---

### Story 1.2: Conversational Assessment Interview

As a new learner,
I want to have a conversation with the AI about my goals, background, and current level,
So that my curriculum is personalized to where I actually am.

**Acceptance Criteria:**

**Given** user has selected a subject
**When** interview begins
**Then** AI asks about learning goals, prior experience, and current knowledge level via streamed conversational exchange (ARCH-12: SSE via Hono `streamSSE()`)
**And** all LLM calls go through `routeAndCall()` — establishing the orchestrator pattern for all subsequent AI features (ARCH-8)
**And** interview uses Gemini Flash (rung 1-2 routing, ARCH-9) — this is a low-complexity conversational task

**Given** user responds to interview questions
**When** AI has enough signal (typically 3-5 exchanges)
**Then** AI signals interview complete and triggers curriculum generation (FR14)

**Given** user provides minimal or vague answers
**When** AI detects insufficient signal
**Then** AI asks targeted follow-up questions (not open-ended repetition)

**Given** primary LLM provider (Gemini Flash) is unavailable
**When** `routeAndCall()` attempts the call
**Then** automatic failover to configured backup provider succeeds and interview continues (provider failover test required in DoD — not just happy path)
**And** `routeAndCall()` logs provider switch with correlation ID for observability (ARCH-26)

**Given** user starts interview and leaves mid-conversation
**When** user returns within 7 days
**Then** interview resumes with "Continue your interview?" prompt and summary of what was discussed

**Given** interview abandoned >7 days
**When** user returns
**Then** interview expired, must restart
**And** user can manually "Restart interview" from draft curriculum screen
**And** interview state persisted in `onboarding_drafts` table (JSONB column for exchange history + extracted signals) — custom state outside normal session model, linked to profile + subject

**Architectural significance:** This story establishes three foundational patterns every subsequent epic depends on: `routeAndCall()` orchestration, SSE streaming via `streamSSE()`, and provider failover. The interview feature is almost secondary to getting these patterns right.

**FRs:** FR14

---

### Story 1.3: Curriculum Generation & Display

As a learner,
I want to see my AI-generated personalized curriculum with topics, learning outcomes, and time estimates,
So that I know what I'll learn and how long it will take.

**Acceptance Criteria:**

**Given** interview is complete
**When** curriculum is generated
**Then** user sees complete learning path with topics and learning outcomes (FR16)
**And** each topic shows its relevance category: **Core** (essential foundation), **Recommended** (important but not blocking), **Contemporary** (current practices), **Emerging** (cutting-edge, optional) — displayed as a label, not a numeric score (FR20)
**And** each topic shows realistic time estimate (FR22)

**Given** curriculum is displayed
**When** user taps a topic
**Then** user sees brief description of what they'll learn

**Given** curriculum generation takes >2s
**When** user is waiting
**Then** skeleton UI with progress indicator is shown (not a blank screen)
**And** generated curriculum is stored in database linked to profile + subject

**Schema note:** `topic_relevance: enum('core', 'recommended', 'contemporary', 'emerging')` on curriculum topic record. PRD calls these "confidence levels" but they are topic relevance categories — how central the topic is to the subject, not AI confidence in the learner.

**FRs:** FR15, FR16, FR20, FR22

---

### Story 1.4: Curriculum Interaction (Skip, Challenge, Explain)

As a learner,
I want to skip topics I know, challenge the AI's curriculum, and understand why topics are ordered the way they are,
So that I have agency over my learning path.

**Acceptance Criteria:**

**Given** curriculum is displayed
**When** user marks a topic as "I already know this"
**Then** topic is skipped and curriculum adjusts (FR18)
**And** skipped topics can be un-skipped later

**Given** curriculum is displayed
**When** user taps "Why this order?" on any topic
**Then** AI explains the pedagogical reasoning for the sequencing (FR17)

**Given** user disagrees with curriculum
**When** user taps "Regenerate" and provides feedback
**Then** AI regenerates curriculum incorporating user's input (FR19)

**Given** user has marked >80% of curriculum topics as "I already know this"
**When** user tries to proceed
**Then** system offers placement assessment: Option A (take assessment → AI places at appropriate level), Option B (continue → curriculum with advanced/edge topics only), Option C (choose different subject)

**FRs:** FR17, FR18, FR19

---

### Story 1.5: Curriculum Adaptation Endpoint

As a learner who has completed modules,
I want my remaining curriculum to adapt based on my performance,
So that my learning path reflects what I actually need to work on.

**Acceptance Criteria:**

**Given** curriculum exists for a subject
**When** adaptation endpoint is called with performance data
**Then** remaining topics are re-prioritized based on demonstrated strengths/weaknesses (FR21)
**And** adaptation API endpoint and schema are implemented and unit-testable with mock performance data
**And** `curriculum_adaptations` table records each adaptation event (before/after topic ordering, trigger source)

**⚠️ Fully testable with real performance data only after Epic 3** (assessments + retention scoring). Unit tests use mock performance payloads. Integration test deferred to Epic 3 story dependency.

**FRs:** FR21

---

## Epic 2: Learning Experience & Homework Help — Stories

**Goal:** Users can learn through real-time AI tutoring sessions with Socratic guidance, get homework help via camera capture, and have session-scoped retention (summaries, parking lot, understanding checks).
**FRs:** FR23-FR41 (19 FRs — FR42 moved to Epic 4) | **Stories:** 12
**Deferred from this epic:** FR42 (notification preferences → Epic 4 where notifications actually fire), full adaptive coaching card logic (→ Epic 4 when retention/mastery data exists), UX-9 (parent simulated dashboard → Epic 4 as demo-mode toggle)

### Cluster A: Core Learning Sessions

### Story 2.1: Learning Session Infrastructure & Real-time Chat

As a learner,
I want to chat with my AI tutor in real time with streaming responses and ask follow-up questions,
So that I can learn interactively.

**Acceptance Criteria:**

**Given** learner has a curriculum with topics
**When** learner starts a session
**Then** session record is created (`session_events` table, linked to profile + subject + topic)

**Given** session is active
**When** learner sends a message
**Then** AI responds via SSE streaming (ARCH-12, builds on Epic 1's `streamSSE()` pattern)
**And** all LLM calls routed through `routeAndCall()` with model selection by escalation rung (ARCH-8, ARCH-9)

**Given** AI has responded
**When** learner asks a follow-up question
**Then** AI responds with full conversation context preserved (FR24)
**And** session state includes exchange history, current topic, escalation rung, and timestamp

**Given** session was interrupted (crash, force-quit, network loss)
**When** learner reopens app within 4 hours
**Then** session resumes from last persisted exchange with "Continue where you left off?" prompt (recovery = replay event log)

**Given** session was interrupted >4 hours ago
**When** learner reopens
**Then** session is auto-closed, partial progress saved to coaching card, learner starts fresh
**And** exchanges are persisted per-event to `session_events` table — recovery is log replay, not in-memory state reconstruction

**And** metering middleware enforces real quota (✅ implemented — `middleware/metering.ts` with atomic decrement, KV caching, and 402 responses)

**And** exchange processing pipeline implemented in `services/exchanges.ts` with explicit stages:
1. **Load context:** session exchange history, current topic metadata, escalation rung state, learner profile
2. **Assemble prompt:** system prompt template with persona voice (from profile theme/age), topic scope (from curriculum), escalation state (current rung), prior exchange summary (sliding window or full history within token budget), and any injected context (worked example level from 2.2, behavioral tracking from 2.3)
3. **Route to model:** `routeAndCall()` with escalation rung determining model selection (ARCH-9)
4. **Stream response:** SSE via `streamSSE()`, chunks forwarded to client in real-time
5. **Persist event:** each exchange (user message + AI response) saved to `session_events` with metadata (model used, token count, latency, escalation rung)
6. **Update state:** session summary updated, escalation rung adjusted if triggered

**And** `services/exchanges.ts` never imports from `hono` — receives typed args, returns typed results. Testable without mocking Hono context (architecture rule).
**And** prompt assembly is the integration point that Stories 2.2, 2.3, 2.6, and 2.10 all plug into — each adds its context to the prompt assembly stage, not separate pipelines.

**FRs:** FR23, FR24

---

### Story 2.2: Adaptive Explanations & Worked Examples

As a learner,
I want explanations adapted to my level with appropriate worked examples,
So that I'm never overwhelmed or under-challenged.

**Acceptance Criteria:**

**Given** learner asks for simpler explanation
**When** request is sent
**Then** AI rephrases at a lower complexity level (FR25)

**Given** learner asks for more detail
**When** request is sent
**Then** AI provides deeper explanation (FR25)

**Given** learner's demonstrated understanding level
**When** AI generates explanations
**Then** explanations adapt automatically without explicit request (FR26)

**And** worked example level determined by two signals passed in prompt context: (1) topic mastery score from retention model when available (Epic 3 data), (2) current session performance — escalation rung reached and hint count in this session. When neither signal exists (first session on a new topic), LLM defaults to full worked examples and adjusts within the session based on learner responses.

**Given** topic mastery score is 0.0-0.3 OR no prior data exists
**When** worked example is needed
**Then** full worked example shown (all steps) (FR27)

**Given** topic mastery score is 0.3-0.7 OR learner has answered 2+ questions correctly in session
**When** worked example is needed
**Then** fading example with some steps omitted, learner fills gaps (FR27)

**Given** topic mastery score is 0.7+ OR learner has reached no escalation in session
**When** worked example is needed
**Then** problem-first approach — attempt first, hints on demand (FR27)

**And** each AI message contains maximum 1-2 new concepts (cognitive load management, FR28)

**FRs:** FR25, FR26, FR27, FR28

---

### Story 2.3: Session Lifecycle & Behavioral Tracking

As a learner,
I want session length management, understanding checks, and honest feedback,
So that my learning is sustainable and effective.

**Acceptance Criteria:**

**Given** session is active
**When** AI detects a concept boundary
**Then** understanding check is presented (FR41)
**And** all negative feedback uses "Not Yet" framing — never "wrong" or "incorrect" (UX-11)

**Given** teen profile
**When** session reaches 15min
**Then** gentle nudge shown; hard cap at 20min (UX-10)

**Given** eager learner profile
**When** session reaches 25min
**Then** gentle nudge shown; hard cap at 30min (UX-10)

**Given** learner is silent for 3 minutes
**When** timeout fires
**Then** one gentle re-engagement prompt (UX-12)

**Given** learner is silent for 30 minutes
**When** timeout fires
**Then** session auto-saves to coaching card (UX-12)

**Given** learner finds incorrect content
**When** learner taps "flag"
**Then** content is flagged for review and learner is thanked (FR29)

**And** per-problem behavioral data captured: time-to-answer, hints needed, escalation rung reached, difficulty level. Stored in `session_events` for parent dashboard "guided vs immediate" signal (UX-18)

**And** timer precedence rules: (1) Session hard cap is absolute — when 20min (teen) or 30min (eager) is reached, session closes regardless of other timers. (2) Silence timer runs independently alongside session length. (3) After session nudge (15min/25min), if learner acknowledges ("one more question") then continues, silence timer resets from that acknowledgment. If learner goes silent after acknowledging the nudge, 3-minute gentle prompt still fires normally. (4) If hard cap triggers while silence timer is also counting, hard cap takes precedence — session closes with auto-save, silence prompt is suppressed. No competing UI prompts shown simultaneously.

**FRs:** FR29, FR41 | **UX:** UX-10, UX-11, UX-12, UX-18

✅ **UX-18 implementation status:** Behavioral confidence scoring data capture complete.
- `ExchangeBehavioralMetrics` interface in `session.ts`: escalationRung, isUnderstandingCheck, timeToAnswerMs, hintCountInSession
- Stored in `sessionEvents.metadata` JSONB on every `ai_response` event
- `hintCount` computed from event history (AI responses at rung >= 2)
- Dashboard wired: `countGuidedMetrics()` in `dashboard.ts` queries this data for guided/immediate ratio

---

### Story 2.4: Coaching Card & Adaptive Entry (Minimal)

As a returning learner,
I want a personalized coaching card when I open the app,
So that I can jump right into learning.

**Acceptance Criteria:**

**Given** learner opens app with session history
**When** profile has prior sessions
**Then** basic coaching card shows: last topic, suggested next action ("Continue [topic]?" or "Start [next topic]?"), pulled from Workers KV (ARCH-11)

**And** KV write happens on session close (Inngest event, ARCH-13). KV read on app open.
**And** BaseCoachingCard component hierarchy implemented with 4 variants: CoachingCard, AdaptiveEntryCard, ParentDashboardSummary, SessionCloseSummary (UX-7) — component shells with basic rendering. Full adaptive content logic deferred to Epic 4 when retention/mastery data exists.

**Given** cold-start user (sessions 1-5)
**When** learner opens app
**Then** coaching-voiced three-button fallback entry shown instead of adaptive entry (UX-8)
**And** coaching card component is persona-unaware — theming via CSS variables only (UX-6)
**And** simple "last-write-wins" KV with 24h TTL safety net. Context-hash comparison (time_bucket + dayType + retentionSnapshot + lastSessionType) deferred to Epic 4.

**FRs:** (UX-5, UX-6, UX-7, UX-8 requirements)

---

### Cluster B: Homework Help

### Story 2.5: Homework Entry, Camera Capture & OCR

As a learner,
I want to choose homework help mode and photograph my problem so the AI can read it,
So that I can get guided help without typing complex problems.

**Acceptance Criteria:**

**Given** learner is on home screen
**When** learner taps "Get help with homework"
**Then** Homework Fast Lane UI loads (stripped-down, no gamification — UX-2) (FR30)

**Given** learner is in homework mode
**When** learner taps camera
**Then** camera interface opens with capture guide overlay

**Given** photo is captured
**When** image is processed
**Then** ML Kit on-device OCR extracts text (primary path, ARCH-14)

**Given** on-device OCR fails or confidence is low
**When** fallback triggered
**Then** server-side OCR at `/v1/ocr` processes the image (ARCH-14)

**Given** OCR result is available
**When** result is displayed
**Then** learner can confirm, edit, or retake before proceeding

**And** camera → OCR → **initial AI acknowledgment** ("I see a quadratic equation, let me help you work through this") completes in <3s (NFR7). This is the acknowledgment, not the first substantive Socratic question — that arrives via normal SSE streaming with <2s first token (NFR2). Budget: ~500ms OCR + ~300ms SSE setup + ~2.2s for acknowledgment token. Achievable with Gemini Flash (rung 1-2). If escalation to reasoning model happens later in conversation, the 3s target does not apply to those responses.

**Given** learner completes a homework help session
**When** session ends
**Then** session is marked as "guided problem-solving" in Learning Book (FR33)
**And** homework sessions use distinct `session_type` enum value in data model
**And** camera uses Expo Image (SDK 54) — no additional library

**FRs:** FR30, FR32, FR33 | **UX:** UX-1, UX-2 | **ARCH:** ARCH-14

---

### Story 2.6: Socratic Homework Guidance & Parallel Example

As a learner stuck on homework,
I want guided problem-solving that teaches me the method without giving me the answer,
So that I actually learn how to solve similar problems.

**Acceptance Criteria:**

**Given** homework problem is loaded
**When** AI begins guidance
**Then** AI uses Socratic questioning — never gives the direct answer (FR31)
**And** Socratic Escalation Ladder followed: Socratic Questions (rung 1-2) → Parallel Example (rung 3) → Transfer Bridge (rung 4) → Teaching Mode Pivot (rung 5) (UX-4)

**Given** learner struggles after 2-3 Socratic questions
**When** escalation triggers
**Then** AI demonstrates method on a different but similar problem (Parallel Example Pattern, max 2-3 questions before escalating — UX-3)

**Given** Parallel Example is demonstrated
**When** AI returns to original problem
**Then** Transfer Bridge asks learner to apply the method they just saw (UX-4 rung 4)

**Given** learner says "I don't know"
**When** response is processed
**Then** treated as valid input, not failure — AI adjusts approach accordingly (UX-16)

**Given** learner explicitly requests the answer ("just tell me the answer," "what's the solution?")
**When** AI processes the request
**Then** AI acknowledges the frustration empathetically and redirects to the current escalation rung ("I get that this is frustrating. Let's try it from a different angle..."). AI never provides the direct answer regardless of persistence. If learner persists after rung 5 (Teaching Mode Pivot), AI teaches the full method and asks learner to apply the final step themselves — the learner always does the last mile.

**And** model routing escalates: Gemini Flash for rung 1-2, reasoning models for rung 3+ (ARCH-9)
**And** Homework Fast Lane UI throughout — no gamification elements visible (UX-2)

**FRs:** FR31 | **UX:** UX-2, UX-3, UX-4, UX-16

---

### Story 2.7: Recall Bridge After Homework Success

As a learner who just solved a homework problem,
I want a brief recall warmup on the underlying concept,
So that the knowledge sticks beyond just this assignment.

**Acceptance Criteria:**

**Given** learner successfully completes homework problem
**When** solution is confirmed
**Then** recall warmup is presented on the underlying concept/method (UX-15)
**And** recall warmup is brief (1-2 questions) and positioned as celebration of success, not additional work

**Given** learner completes recall warmup
**When** session closes
**Then** transition to session close flow (Story 2.8 summary production)

**Given** learner skips recall warmup
**When** skip is selected
**Then** session closes without penalty but topic marked as "completed, not reinforced"

**FRs:** (UX-15 requirement)

---

### Cluster C: Session-scoped Retention

### Story 2.8: Mandatory Summary, Session Close & Event Dispatch

As a learner finishing a topic,
I want to write a summary in my own words and get AI feedback,
So that I actively consolidate what I learned.

**Acceptance Criteria:**

**Given** learner reaches topic completion
**When** session close begins
**Then** summary production prompt appears asking for 3-5 sentences in own words (FR34)

**Given** learner submits summary
**When** AI evaluates quality
**Then** AI provides specific feedback on understanding demonstrated (FR35)

**Given** summary reveals misunderstanding
**When** AI detects gap
**Then** AI guides learner to self-correct before providing corrections (FR36)

**Given** learner doesn't want to write summary
**When** learner taps "Skip"
**Then** summary is skipped but topic status becomes "pending verification" — no XP awarded (FR37)
**And** skipped summaries tracked: after 5 consecutive skips → warning; after 10 → prompt to switch to Casual Explorer mode (cross-ref: FR94, Epic 4 — actual mode switching implemented there; this story stores the user's response as a flag)

**And** summary stored as "Your Words" in Learning Book, linked to topic and session

**Given** summary is accepted (or skipped)
**When** session close triggers
**Then** SessionCloseSummary component (UX-7 variant) renders with: session duration, topics covered, summary status, next suggested action
**And** session status updates to `completed` in database
**And** `app/session.completed` Inngest event dispatched with payload: `{ profileId, sessionId, topicId, subjectId, summaryStatus, escalationRungs, timestamp }` (ARCH-13)
**And** this event is the entry point for Epic 3's Inngest lifecycle chain (SM-2 → coaching card KV → dashboard update → embedding generation). Chain doesn't execute yet (Epic 3), but event contract is established and tested — fire event, verify received by Inngest in test mode.

**Given** session ends via hard cap (UX-10) or 30-min silence auto-save (UX-12)
**When** session close triggers without summary
**Then** same close flow fires with `summaryStatus: 'auto_closed'`

**FRs:** FR34, FR35, FR36, FR37

---

### Story 2.9: Parking Lot & Topic Review

As a learner with tangential questions,
I want to park them for later without derailing my current session,
So that I stay focused but don't lose interesting threads.

**Acceptance Criteria:**

**Given** learner has a tangential question during session
**When** learner (or AI) parks the question
**Then** question is saved to parking lot linked to current topic (FR38)

**Given** learner is in Topic Review
**When** learner views a topic
**Then** parked questions for that topic are accessible and explorable (FR39)
**And** parking lot has configurable limit (default: 10 per topic) to prevent unbounded growth

**FRs:** FR38, FR39

---

### Story 2.10: Prior Learning References (Bridge FR)

As a learner in a new lesson,
I want the AI to reference what I learned before,
So that new knowledge connects to existing understanding.

**Acceptance Criteria:**

**Given** learner has prior session history for this subject
**When** AI generates new lesson content
**Then** AI references relevant prior topics and concepts (FR40)

**Given** learner is brand new (no prior sessions)
**When** AI generates lesson content
**Then** feature works with empty state — no errors, no empty references, just teaches without callbacks to prior learning

**And** prior learning context injected via **system prompt enrichment**: completed topic IDs, topic titles, and "Your Words" summaries for current subject included in LLM system prompt as structured context. Context-window approach, not semantic search.

**Given** profile has >20 completed topics for a subject
**When** system prompt would exceed context budget
**Then** most recent 10 + highest-mastery 5 topics included (recency + relevance heuristic). pgvector replaces this heuristic in Epic 3.

**And** this story does NOT depend on Story 2.11 (embedding spike). Ships with session history queries only. pgvector similarity search is an Epic 3 enhancement.

**✅ Implementation status:**
- Service layer complete: `services/prior-learning.ts` — `buildPriorLearningContext()` with recency+mastery heuristic, empty state handling, 13 passing tests.
- Prompt injection: `ExchangeContext.priorLearningContext` field wired into `buildSystemPrompt()`.
- Session orchestration: `fetchPriorTopics()` called in `prepareExchangeContext()` — queries completed sessions joined with topic titles and learner summaries.
- Bridge FR fully connected from DB → service → prompt.

**FRs:** FR40

---

### Cluster D: Technical Spikes

### Story 2.11: Embedding Model & Provider Decision (Spike)

As a development team,
We need to finalize the embedding model and provider for pgvector,
So that Epic 3's Inngest chain can generate embeddings with a known configuration.

**Acceptance Criteria:**

**Given** ARCH-16 flags embedding model/provider as TBD
**When** spike is completed
**Then** decision is documented: model name, provider, embedding dimensions, cost per 1K tokens
**And** `services/embeddings.ts` is implemented with chosen provider (ARCH-16)
**And** `queries/embeddings.ts` has raw SQL cosine distance query working against pgvector (ARCH-16)
**And** a test embedding is generated and stored/retrieved successfully in Neon
**And** decision considers: cost (batch vs single), latency, dimension size vs accuracy tradeoff, provider availability/fallback
**And** latency benchmark established: embedding generation + pgvector storage completes within 500ms per session summary (single embedding). Runs in Inngest post-session chain — total chain budget ~5s, embedding is one step of four.

**FRs:** (ARCH-16 requirement)

✅ **Implementation status:** Completed.
- Provider: Voyage AI `voyage-3.5` (1024 dimensions, cosine distance)
- Decision documented in `docs/architecture.md` (ARCH-16 resolved)
- `services/embeddings.ts`: generation + storage pipeline
- `packages/database/src/schema/embeddings.ts`: pgvector schema + HNSW index
- `packages/database/src/queries/embeddings.ts`: cosine distance query
- Benchmark tool: `scripts/embedding-benchmark.ts`
- Inngest chain step 4: generates embeddings after session completes

---

### Story 2.12: E2E Testing Framework Spike

As a development team,
We need to evaluate and set up an E2E testing framework for the mobile app,
So that subsequent epics can include E2E tests in CI.

**Acceptance Criteria:**

**Given** ARCH-24 requires E2E testing decision
**When** spike is completed
**Then** framework is chosen (Detox or Maestro) with rationale documented
**And** one smoke test runs against the registration flow (Epic 0) in CI
**And** test infrastructure is integrated into the Nx CI pipeline (ARCH-3)
**And** documentation covers: how to write a new E2E test, how to run locally, how CI executes them
**And** spike documents known limitations, flaky test risks, and CI reliability expectations — Detox/Maestro on CI with Expo is notoriously unreliable. Document: expected flake rate, retry strategies, whether to gate deploys on E2E or treat as advisory, estimated CI time impact.

**FRs:** (ARCH-24 requirement)

⚠️ **Implementation status:** In progress.
- ✅ Framework chosen: Maestro (rationale in `docs/e2e-testing-strategy.md`)
- ✅ 4 smoke flows written: `apps/mobile/e2e/flows/` (app-launch, create-subject, view-curriculum, start-session)
- ✅ Local dev docs: `apps/mobile/e2e/README.md`
- ✅ API integration tests in CI: 3 test files in `tests/integration/`
- ✅ Flakiness baseline documented (strategy doc section 8)
- ✅ CI workflow: `.github/workflows/e2e-ci.yml` (advisory, not blocking)
- ⬜ Tier 2 full flows (blocked on feature completion)

---

### Story 2.13: Invisible Bridge to Learning (UX Decision #6)

As a learner completing a homework session,
I want the AI to offer to explain concepts I struggled with,
So that I can optionally transition from homework to genuine understanding.

**Status:** Planned (next sprint)

**Acceptance Criteria:**

**Given** a homework session where escalation reached rung >= 3 on any exchange
**When** the session close response is generated
**Then** a `bridgePrompt` string is included (e.g., "You struggled with quadratic factoring — want me to explain the pattern?")
**And** the mobile SessionCloseSummary renders it as a secondary button

**Given** the learner taps the bridge prompt
**When** the bridge session starts
**Then** a new learning session is created for the same topic with session type "learning"
**And** the AI's opening references the specific struggle from the homework session

**Given** the learner taps "Done" instead
**When** they dismiss the session close
**Then** no bridge session is created and the learner returns to home

**Given** a homework session where no exchange reached escalation rung >= 3
**When** the session close response is generated
**Then** no bridge prompt is included (field omitted from response)

**Data Contract:**
- Extend session close API response: add optional `bridgePrompt?: string`
- Bridge prompt generated by LLM call with inputs: topic title, escalation events from session, specific struggles
- If no escalation >= rung 3 occurred → no bridge prompt → field omitted

**Implementation Path:**
1. `apps/api/src/services/bridge.ts` — `generateBridgePrompt(db, sessionId, profileId): Promise<string | null>`
2. Extend `closeSession()` return type to include `bridgePrompt`
3. Wire into session close route response
4. Mobile: pass `bridgePrompt` from close response to `SessionCloseSummary` props
5. Mobile: `onBridgeAccept` → create new learning session via existing mutation

**Dependencies:** Story 2.1 (session infrastructure), Story 2.8 (session close flow)
**FRs:** UX-6 (Invisible Bridge)

---

### Epic 2 Execution Order

```
2.1 (Session Infra) → 2.2, 2.3, 2.4 (can parallel) → 2.5, 2.6, 2.7 (can parallel) → 2.8 (close flow) → 2.9, 2.10 (can parallel)
2.11, 2.12 (spikes — independent, run anytime)
2.13 (Invisible Bridge — depends on 2.1 + 2.8, planned for next sprint)
```

---

## Epic 3: Assessment, Retention & Adaptive Teaching — Stories

**Scope:** FR43-FR66, FR128-FR143 (40 FRs) + ARCH-10, ARCH-11, ARCH-13, ARCH-16, ARCH-25 + UX-19
**Stories:** 18

### Cluster A: Verification & Mastery

### Story 3.1: In-Lesson Quick Checks

As a learner,
I want to answer quick comprehension checks during a lesson,
So that I can verify understanding before moving on.

**Acceptance Criteria:**

**Given** the learner is mid-lesson and AI determines a concept checkpoint is appropriate
**When** a quick check is triggered
**Then** 2-3 questions are presented inline within the conversation (FR43)
**And** questions require the learner to explain their reasoning, not just provide a final answer (FR44)
**And** if the learner's reasoning is wrong, feedback identifies WHERE thinking went wrong, not just "incorrect" (FR45)
**And** feedback uses "Not Yet" framing (UX-11) — never "wrong" or "incorrect"
**And** quick check results are stored as part of the session exchange history
**And** results feed into the behavioral confidence score (UX-18): time-to-answer, hints needed, escalation rung

**FRs:** FR43, FR44, FR45

---

### Story 3.2: Topic Completion Assessments & Mastery Scoring

As a learner,
I want to take a completion assessment when I finish a topic,
So that my mastery is measured and tracked with a meaningful score.

**Acceptance Criteria:**

**Given** a learner completes all content for a topic
**When** the completion assessment is triggered
**Then** the assessment tests at increasing verification depth levels automatically: recall → explain → transfer (UX-19)
**And** depth level is determined by automatic escalation: assessment starts at recall level, if passed escalates to explain, if passed escalates to transfer. Learner does not choose level — AI determines progression based on responses.
**And** mastery score (0-1) is calculated with caps per depth achieved: recall-only = max 0.5, explain = max 0.8, transfer = max 1.0 (FR48)
**And** `verification_depth` field is stored in `schema/assessments.ts` (UX-19)
**And** SM-2 algorithm (`packages/retention/`) computes the initial next-review interval synchronously during this assessment (ARCH-10). This is the authoritative SM-2 calculation for assessed topics.
**And** assessment results, mastery score, and verification depth are persisted via scoped repository
**And** assessment is conversational (AI-driven), not a static quiz form

**FRs:** FR46, FR48
**ARCH:** ARCH-10 (SM-2), UX-19 (verification depth)

---

### Story 3.3: Delayed Recall, Re-tests & XP Verification

As a learner,
I want to take delayed recall tests and request re-tests on old topics,
So that my knowledge is verified over time and my XP reflects genuine retention.

**Acceptance Criteria:**

**Given** a topic has been completed and SM-2 has computed a review interval
**When** the review interval arrives
**Then** the learner can take a delayed recall test (FR49)
**And** initial intervals are 2 weeks (first review) and 6 weeks (second review) as SM-2 starting points only — SM-2 dynamically adjusts all subsequent intervals based on ease factor and performance. If learner scores poorly, SM-2 may schedule the next review in days, not weeks. The fixed 2w/6w values are seeds, not constraints. (FR49)
**And** XP transitions from "pending" to "verified" only after passing delayed recall (FR50)
**And** if recall test fails, XP decays proportionally to mastery score drop (FR51)
**And** learners can request re-tests on any previously completed topic from their Learning Book at any time (FR47)

**Display layer (merged from verification feedback):**
**And** RetentionSignal component renders dual-state: pending (outline badge) vs verified (filled badge)
**And** topic detail view shows verification history: date, depth achieved, mastery score per attempt
**And** Learning Book topic list shows "X verified / Y completed" summary count

**FRs:** FR47, FR49, FR50, FR51
**ARCH:** ARCH-10 (SM-2 intervals)

---

### Story 3.4: Inngest Lifecycle Chain (session.completed)

As a development team,
We need the post-session async processing chain to run reliably,
So that SM-2 recalculation, coaching cards, dashboard data, and embeddings stay current.

**Acceptance Criteria:**

**Given** a `session.completed` event is emitted (from Epic 2 Story 2.8)
**When** Inngest receives the event
**Then** the chain executes 4 steps in sequence (ARCH-13):
  1. **SM-2 recalculation** — updates next-review intervals for all topics touched in session. For topics already assessed in Story 3.2 (synchronous SM-2), this step is a **no-op** — it does not recalculate. It only runs SM-2 for non-assessed topics (e.g., quick-check-only topics, homework topics). This prevents double-calculation.
  2. **Coaching card KV write** — precomputes and writes to Workers KV (ARCH-11), 24h TTL safety net, overwritten on recompute
  3. **Dashboard data update** — aggregates session data for parent dashboard and progress views
  4. **Embedding generation** — generates session summary embedding via `services/embeddings.ts` using provider/model from Story 2.11 spike, stores in pgvector via `queries/embeddings.ts` (ARCH-16). Must complete within 500ms per session summary (Story 2.11 benchmark). Total chain budget ~5s.
**And** each step has independent error handling: if any step fails after max retries, subsequent steps still execute. Failed steps are logged for manual investigation. Chain continues regardless of individual step failure. (Inngest step-level try/catch)
**And** event payload always includes `profileId` + `timestamp` (ARCH-13)
**And** full chain integration test using `inngest/test` mode validates the complete sequence (ARCH-25)
**And** event naming follows `app/{domain}.{action}` convention: `app/session.completed`

**FRs:** (architectural requirement — no direct FR)
**ARCH:** ARCH-10, ARCH-11, ARCH-13, ARCH-16, ARCH-25

---

### Cluster B: Failed Recall & Remediation

_Cluster B depends on Story 3.3 (delayed recall tests must exist to fail)._

### Story 3.5: Failed Recall Flow & Learning Book Redirect

As a learner who struggles to recall a topic,
I want targeted guidance based on how many times I've failed,
So that I get appropriate support without being prematurely redirected.

**Acceptance Criteria:**

**Given** a learner fails a recall test for the first or second time
**When** the result is shown
**Then** AI provides targeted feedback identifying specific knowledge gaps and suggests focused review strategies, but does NOT redirect to Learning Book yet (failure 1-2 experience)

**Given** a learner has failed recall for a topic 3+ times (FR52)
**When** the third failure occurs
**Then** the learner is guided to Learning Book for that topic
**And** Learning Book shows: previous mastery scores, the learner's "Your Words" summary, and current decay status (FR53)
**And** the learner can choose "Review & Re-test" — re-test is available only after 24+ hours (anti-cramming cooldown) (FR54)
**And** the learner can choose "Relearn Topic" to restart the learning sequence (FR55)
**And** failure count is tracked per-topic in the retention data model

**FRs:** FR52, FR53, FR54, FR55

✅ **Implementation status:** Completed.
- API: `processRecallTest()` tracks failure count per-topic, returns `failureAction: redirect_to_learning_book` after 3+ failures with remediation data (cooldown, retention status, suggestions)
- API: 24h anti-cramming cooldown (FR54) enforced in `processRecallTest()`
- Mobile: `recall-test.tsx` screen — ChatShell-based recall check with animated AI feedback
- Mobile: `RemediationCard` component — cooldown timer, "Review & Re-test" / "Relearn Topic" buttons
- Mobile: Topic detail (`[topicId].tsx`) — failure count display, rewired buttons to recall-test and relearn screens
- Mobile: Learning Book (`book/index.tsx`) — "Needs attention" indicator on topics with 3+ failures
- Mobile: `useSubmitRecallTest()` mutation hook invalidates retention + progress queries

---

### Story 3.6: Relearn Topic with Method Adaptation

As a learner who chooses to relearn a topic,
I want to try a different teaching approach,
So that I can find a method that works better for me.

**Acceptance Criteria:**

**Given** a learner selects "Relearn Topic" from the failed recall flow
**When** the relearn experience starts
**Then** the learner can choose "Same method" or "Different method" (FR56)
**And** if "Different method" is selected, AI asks conversationally what would help: "What would help you learn this better?" (FR57)
**And** if the learner provides a vague response ("I don't know", "make it easier", shrug-equivalent), AI offers concrete method options: visual diagrams, step-by-step walkthrough, real-world examples, practice problems. Presented as a selectable menu, not another open-ended question.
**And** AI adapts the teaching approach based on the learner's feedback or selection (FR58)
**And** the new teaching method is recorded for this topic (feeds into Story 3.9 teaching preferences)
**And** relearn resets the topic's mastery score to 0 and restarts SM-2 intervals

**FRs:** FR56, FR57, FR58

✅ **Implementation status:** Completed.
- API: `startRelearn()` resets SM-2 retention card (easeFactor, interval, repetitions) and creates new learning session
- API: `getTeachingPreference()` retrieves stored method preference per subject
- API: Teaching preference injected into LLM system prompt via `ExchangeContext.teachingPreference` (FR58)
- Mobile: `relearn.tsx` screen — two-phase UI: Same/Different method choice → teaching method grid (visual diagrams, step-by-step, real-world examples, practice problems)
- Mobile: `useStartRelearn()` mutation hook with session redirect on success
- Tests: exchanges.test.ts (teaching pref in/out), session.test.ts (teaching pref wiring)

---

### Cluster C: Adaptive Teaching

_Cluster C depends on Story 3.2 (mastery scoring must exist for struggle detection)._

### Story 3.7: Three-Strike Rule & Direct Instruction

As a learner struggling with a concept during a lesson,
I want the AI to switch to direct instruction after repeated wrong answers,
So that I'm not stuck in Socratic loops and actually learn the concept.

**Acceptance Criteria:**

**Given** a learner gets 3 wrong answers on the same concept within a session (FR59)
**When** the third wrong answer is submitted
**Then** AI switches from Socratic questioning to direct instruction: explains with concrete examples, then rephrases the original question (FR60)
**And** the three-strike counter is scoped per-concept within a session, not per-question (a concept may span multiple related questions)
**And** the three-strike counter resets between sessions — if a learner gets 1 wrong answer in session A and 2 in session B, that does NOT trigger the rule. Cross-session struggle is caught by the retention system (delayed recall failures in Story 3.5).
**And** if the learner still struggles after direct instruction, the topic is flagged for "Needs Deepening" (FR61)
**And** the AI's direct instruction uses "Not Yet" framing (UX-11) throughout

**FRs:** FR59, FR60, FR61

---

### Story 3.8: Needs Deepening Management

As a learner with topics I find particularly difficult,
I want those topics automatically scheduled for more frequent review,
So that I get extra practice where I need it most.

**Acceptance Criteria:**

**Given** a topic is flagged as "Needs Deepening" (from Story 3.7 three-strike or other struggle signals)
**When** the flag is set
**Then** the topic is added to the "Needs Deepening" section with shortened SM-2 review intervals (FR62)
**And** maximum 10 active "Needs Deepening" topics per subject. When topic 11 would be added, the topic closest to exit criteria (highest consecutive successful recall count) is promoted to normal status. Promoted topics retain their current (shortened) SM-2 intervals — they don't reset to default spacing.
**And** a topic exits "Needs Deepening" after 3+ consecutive successful recalls (FR63)
**And** when a topic exits, its SM-2 intervals return to the standard algorithm-computed values
**And** "Needs Deepening" status is a separate indicator from retention status (topic can be "Needs Deepening" + "Strong" or "Needs Deepening" + "Fading")

**FRs:** FR62, FR63

---

### Story 3.9: Teaching Method Preferences

As a learner,
I want my preferred teaching method remembered per subject,
So that future sessions start with an approach that works for me.

**Acceptance Criteria:**

**Given** a learner's teaching method has been recorded (from Story 3.6 relearn flow or explicit preference)
**When** the learner starts a new session in that subject
**Then** the stored method preference is auto-applied (FR65)
**And** preferences are stored per-subject, not globally (FR64) — a learner might prefer visual diagrams for math but step-by-step walkthroughs for chemistry
**And** method preference is a signal to the LLM prompt context, not a hard override — AI can adapt if the learner's response pattern suggests a different approach would work better
**And** users can reset teaching method preferences from Settings (FR66)
**And** preferences persist across sessions and profile switches

**FRs:** FR64, FR65, FR66

---

### Cluster D: Technical Enhancement

### Story 3.10: pgvector Prior Learning Enhancement

As a development team,
We need to enhance prior learning references with embedding-based retrieval,
So that the AI draws on semantically relevant past topics, not just recent ones.

**Acceptance Criteria:**

**Given** Epic 2 Story 2.10 established prior learning references via session history (topic IDs + summaries in system prompt)
**When** pgvector embeddings are available (populated by Story 3.4 Inngest chain)
**Then** prior learning retrieval combines embedding similarity (top-N cosine distance) with recency weighting to produce a final ranked list — does NOT fully replace the recency heuristic. A topic discussed yesterday is more relevant than a semantically similar topic from three months ago, even if embedding distance is smaller.
**And** `queries/embeddings.ts` uses raw SQL cosine distance query against pgvector (ARCH-16)
**And** retrieval results are injected into the LLM system prompt as context, same format as Story 2.10 (topic IDs + summaries)
**And** graceful fallback: if pgvector query fails or returns no results, falls back to session-history-only approach from Story 2.10
**And** retrieval query scoped to current profile via `createScopedRepository(profileId)` (ARCH-7)

**FRs:** (ARCH-16 bridge — enhances FR40 from Epic 2)
**ARCH:** ARCH-16 (pgvector)

---

### Cluster E: EVALUATE Verification (Devil's Advocate)

_Cluster E depends on Story 3.2 (mastery scoring must exist) and Story 3.8 (retention status "strong" requires SM-2 data). EVALUATE only triggers for strong-retention topics._

### Story 3.11: EVALUATE Verification Type (Devil's Advocate)

As a learner with strong retention on a topic,
I want the AI to challenge my understanding with a flawed explanation,
So that I can prove my mastery by identifying the error (Bloom's Level 5-6: Evaluate).

**Acceptance Criteria:**

**Given** a learner has strong retention on a topic (easeFactor ≥ 2.5 and repetitions > 0)
**When** a verification is triggered for that topic
**Then** EVALUATE may be selected as the verification type — AI presents a plausibly flawed explanation for the topic (FR128)
**And** EVALUATE only triggers for topics with retention status "strong" (FR129)
**And** `verification_type` enum gains `EVALUATE` value in `packages/database/src/schema/`
**And** new LLM prompt template generates plausibly flawed explanation for the topic
**And** prompt accesses: topic key concepts, common misconceptions, student mastery level, current EVALUATE difficulty rung
**And** framing is persona-appropriate: teen ("Hmm, I think you might be wrong...") vs learner ("Here's a common misconception...") (FR130)
**And** chat UI shows visual "challenge mode" indicator on the AI's flawed message
**And** student response assessed by AI: did they correctly identify the specific flaw?

**FRs:** FR128, FR129, FR130

---

### Story 3.12: EVALUATE Difficulty Calibration & Scoring

As a system,
I need to calibrate EVALUATE difficulty using the escalation rung system and score results with a modified SM-2 floor,
So that tricky challenges don't unfairly tank retention scores.

**Acceptance Criteria:**

**Given** a learner encounters an EVALUATE verification
**When** the difficulty is determined
**Then** `evaluateDifficultyRung` (integer 1-4, nullable) is added to retention card schema (FR131)
**And** first EVALUATE on a topic uses obvious flaw (rung 1-2): wrong formula, reversed cause-effect
**And** if student catches it easily, next EVALUATE escalates to subtle flaw (rung 3-4): correct reasoning with one incorrect premise, edge case error
**And** if student struggles, difficulty stays at current level
**And** EVALUATE success: SM-2 quality 4-5 (same as standard verification)
**And** EVALUATE failure: SM-2 quality 2-3 (NOT 0-1) — preserves retention score accuracy (FR132)
**And** SM-2 engine math unchanged — only the quality input value is adjusted for EVALUATE type

**FRs:** FR131, FR132

---

### Story 3.13: EVALUATE Three-Strike Escalation

As a learner who fails an EVALUATE challenge,
I want the AI to explain the specific flaw rather than re-teach the entire concept,
So that my time isn't wasted on material I actually understand.

**Acceptance Criteria:**

**Given** a learner fails an EVALUATE verification
**When** the failure is processed
**Then** AI reveals and explains the specific flaw — direct teaching on the misconception, not the whole topic (FR133)
**And** second attempt: present similar challenge at lower difficulty rung
**And** third consecutive failure: mark topic for standard review (not EVALUATE), do not re-teach from scratch
**And** failing to spot a subtle flaw does not trigger full concept re-teaching
**And** escalation state tracked per topic in the session context

**FRs:** FR133

---

### Cluster F: Analogy Domain Preferences (Multiverse of Analogies)

_Dependency: After 3.4 (teaching preference infrastructure exists)._

### Story 3.14: Analogy Domain Preference Storage & API

As a learner,
I want to choose an analogy domain for each subject (e.g., cooking, sports, nature),
So that the AI tutor explains concepts using analogies from a world I relate to.

**Acceptance Criteria:**

**Given** the system needs a shared analogy domain type
**When** the schema is defined
**Then** `analogyDomainSchema` Zod enum in `@eduagent/schemas` with 6 values (`cooking`, `sports`, `building`, `music`, `nature`, `gaming`) is created and used by both API and mobile (FR134)

**Given** the database needs to store the preference
**When** the schema is updated
**Then** nullable `analogyDomain` column is added to `teachingPreferences` table (FR134)

**Given** a learner wants to set or change their analogy domain
**When** they call `PUT /v1/subjects/:subjectId/teaching-preference`
**Then** the endpoint accepts an optional `analogyDomain` field and persists it immediately (FR137)
**And** `GET /v1/subjects/:subjectId/teaching-preference` returns `analogyDomain` (null when unset) (FR137)

**Given** a learner is on the subject settings screen in the mobile app
**When** they view teaching preferences
**Then** an icon/label picker row shows 6 analogy domain options + "None/Default" (FR134)
**And** selection is persisted immediately and reflected in next exchange (FR137)

**Given** a learner is going through subject onboarding
**When** they reach the teaching preferences step
**Then** an optional analogy preference step is presented (skippable) (FR136)

**FRs:** FR134, FR136, FR137

---

### Story 3.15: Analogy Domain Prompt Integration

As a learner with an analogy domain preference set,
I want the AI tutor to consistently use analogies from my chosen domain during sessions,
So that explanations feel familiar and concepts click faster.

**Acceptance Criteria:**

**Given** the exchange context needs analogy awareness
**When** `ExchangeContext` is prepared
**Then** `ExchangeContext` is extended with a nullable `analogyDomain` field (FR135)
**And** `prepareExchangeContext()` in `session.ts` fetches analogy domain from `teachingPreferences` (FR135)

**Given** a learner has an analogy domain set (non-null)
**When** `buildSystemPrompt()` constructs the LLM prompt
**Then** an analogy instruction section is appended with softer wording — "prefer analogies from [domain]... use naturally... don't force" (FR135)

**Given** a learner has no analogy domain set (null)
**When** `buildSystemPrompt()` constructs the LLM prompt
**Then** no analogy section is included in the prompt — AI uses direct technical explanation (FR135)

**Given** the analogy domain changes between sessions
**When** a new session starts
**Then** the prompt hash changes naturally from the content change (no explicit logic needed)

**Given** the integration needs verification
**When** an integration test runs a session with analogy domain set
**Then** the LLM response contains analogy-themed content from the chosen domain (FR135)

**FRs:** FR135

---

### Cluster G: Feynman Stage — Teach-Back Via Voice

_Dependency: After 3.2 (needs retention status infrastructure). Voice infra is self-contained (on-device STT/TTS)._

### Story 3.16: TEACH_BACK Verification Type & Prompt Template

As a learner with moderate-to-strong retention on a topic,
I want the AI to play a "confused student" so I can teach the concept and prove deep understanding,
So that I achieve Bloom Level 6 mastery through the Feynman Technique.

**Acceptance Criteria:**

**Given** a learner has moderate-to-strong retention on a topic
**When** a verification is triggered
**Then** TEACH_BACK may be selected as the verification type (FR138)
**And** TEACH_BACK is the 9th verification type added to `verification_type` enum
**And** retention gate enforced: TEACH_BACK only triggers for moderate-to-strong topics (student must know concept before teaching) (FR138)
**And** LLM prompt template: "You are a curious but clueless student..." — AI asks naive follow-up questions, probes for gaps, never corrects directly (FR138)
**And** two-output response pattern: conversational follow-up question (visible to student) + structured JSON assessment (hidden) (FR140)
**And** `structured_assessment` JSONB column on `session_events` stores `{ completeness, accuracy, clarity, overallQuality, weakestArea, gapIdentified }` (FR140)
**And** Zod schema `TeachBackAssessment` defined in `@eduagent/schemas` (FR140)
**And** `overallQuality` maps to SM-2 quality input: accuracy 50%, completeness 30%, clarity 20% (FR140)

**FRs:** FR138, FR140

---

### Story 3.17: Voice Input/Output Integration

As a learner in a TEACH_BACK session,
I want to explain concepts aloud and hear the AI's responses,
So that the teach-back experience is natural and conversational.

**Acceptance Criteria:**

**Given** a learner is in a TEACH_BACK session (or any session with voice enabled)
**When** they tap the microphone button
**Then** `expo-speech-recognition` captures on-device speech-to-text — no cloud dependency, audio permissions via standard Expo flow (FR139)
**And** microphone button appears in chat input area with waveform/pulse animation while recording (FR143)
**And** transcript preview shown before sending — learner can edit or re-record (FR143)
**And** tap to start recording, tap to stop recording (manual stop, no VAD) (FR143)
**And** after SSE streaming completes, `expo-speech` reads AI response aloud (Option A: wait for complete response before TTS playback) (FR141)
**And** session-level voice toggle in header — mute/unmute AI TTS (FR142)
**And** TEACH_BACK sessions default to voice-on; other session types default to voice-off (FR142)
**And** voice toggle is NOT a persistent preference — session-scoped only, resets on new session (FR142)

**FRs:** FR139, FR141, FR142, FR143

---

### Story 3.18: TEACH_BACK Scoring Calibration & SM-2 Integration

As a system,
I need TEACH_BACK assessments to produce reliable SM-2 quality inputs and feed downstream features,
So that teach-back results integrate seamlessly with retention tracking, coaching, and parent visibility.

**Acceptance Criteria:**

**Given** a TEACH_BACK session produces a structured assessment
**When** scoring is computed
**Then** rubric weights are applied: accuracy 50%, completeness 30%, clarity 20% (FR140)
**And** `overallQuality` 0-5 maps directly to SM-2 quality input — no additional transformation
**And** coaching card precomputation (Story 3.4) consumes `structured_assessment` for topic recommendations
**And** parent dashboard shows teach-back performance summary: completeness/accuracy/clarity breakdown per session
**And** integration test validates: TEACH_BACK session produces valid structured assessment JSON matching `TeachBackAssessment` schema + correct SM-2 quality mapping from rubric weights

**FRs:** FR140 (scoring specifics)

---

### Epic 3 Execution Order

```
Cluster A: 3.1 → 3.2 → 3.3 and 3.4 (parallel after 3.2)
Cluster B: 3.5 → 3.6 (after 3.3 — delayed recall must exist to fail)
Cluster C: 3.7 → 3.8 (after 3.2 — mastery scoring needed for struggle detection). 3.9 after 3.6 (method recording feeds preferences).
Cluster D: 3.10 (after 3.4 — needs embeddings populated by Inngest chain)
Cluster E: 3.11 → 3.12 → 3.13 (after 3.2 + 3.8 — needs mastery scoring and retention status "strong")
Cluster F: 3.14 → 3.15 (after 3.4 — needs teaching preference infrastructure)
Cluster G: 3.16 → 3.17 → 3.18 (after 3.2 — needs retention status)
```

**Cross-epic dependency:** Story 3.4 depends on Epic 2 Story 2.11 (embedding spike decision).
**SM-2 dual invocation:** Story 3.2 = synchronous during assessment (authoritative for assessed topics). Story 3.4 = async Inngest chain for non-assessed topics only (no-op if already calculated in 3.2).
**EVALUATE scoring:** Story 3.12 modifies the quality input to SM-2, not the SM-2 math itself. The `packages/retention/` library remains unchanged.

---

## Epic 4: Progress, Motivation & Parent Dashboard — Stories

**Scope:** FR67-FR95 (29 FRs) + FR42 (deferred from Epic 2) + UX-5, UX-6, UX-7, UX-8, UX-9, UX-13, UX-14
**Deferred items arriving:** FR42 (notification preferences), full adaptive coaching card logic (Epic 2 shipped minimal), UX-9 (parent simulated dashboard → demo-mode toggle)
**Stories:** 11

> **Sprint planning note:** This epic averages ~3 FRs per story, denser than previous epics. Most FRs are read-side display concerns (show X, render Y), which are simpler than write-side logic. However, Stories 4.1 (7 FRs), 4.10 (3 UX requirements with complex variant logic), and 4.11 (dashboard + drill-down + demo-mode) may each implement like 2-3 stories in practice. Size honestly during sprint planning — split if estimates exceed single-agent capacity.

### Cluster A: Learning Book & Progress

### Story 4.1: Learning Book & Topic Browser

As a learner,
I want to browse all past topics organized by subject with progress and retention status,
So that I can review what I've learned, track my progress, and continue where I left off.

**Acceptance Criteria:**

**Given** a learner navigates to Learning Book
**When** the screen loads
**Then** all past topics are displayed organized by subject with a subject switcher (FR67, FR85)
**And** each topic shows the learner's "Your Words" summary excerpt (FR68)
**And** progress through the learning path is visible: topics completed vs remaining per subject (FR71)
**And** each topic shows "completed" vs "verified" status (completed = finished, verified = passed delayed recall) (FR72)
**And** "Continue where I left off" (FR75) means "start a new session on the last topic the learner was progressing through in the current subject" — this is a navigation shortcut, NOT session resumption. Session resumption (crash recovery within 4-hour window) is Epic 2 Story 2.1. FR75 identifies the last incomplete or most-recently-completed topic and offers to begin the next one.
**And** learner can initiate re-learning for any weak topic (triggers Epic 3 Story 3.6 relearn flow) (FR74)
**And** data loaded via TanStack Query with stale-while-revalidate — no loading spinners on return visits

**FRs:** FR67, FR68, FR71, FR72, FR74, FR75, FR85

---

### Story 4.2: Topic Detail & Retention Visualization

As a learner,
I want to see detailed retention status, knowledge decay, and review history for each topic,
So that I know exactly where my knowledge is strong and where it's fading.

**Acceptance Criteria:**

**Given** a learner taps a topic in Learning Book
**When** the topic detail view loads
**Then** topic review shows: key concepts, worked examples, the learner's "Your Words" summary, and AI teacher notes (FR73)
**And** retention score per topic displayed as a visual decay bar (progress bar fading over time) (FR69, FR90)
**And** topic shows two separate status indicators: retention status (Strong/Fading/Weak/Forgotten) AND struggle status (Normal/Needs Deepening/Blocked) — never conflated (FR70)
**And** struggle status "Blocked" is triggered when a learner has failed the full relearn cycle twice: completed Relearn Topic (Story 3.6) → re-assessed → failed delayed recall → relearned again → re-assessed → failed again. Two full relearn-fail cycles = Blocked. This is a rare state indicating the current approach is fundamentally insufficient. Blocked topics surface a "Try a different angle" suggestion (prerequisite review, alternative framing) distinct from normal "Relearn" flow.
**And** "Needs Deepening" section is accessible showing all topics requiring extra review, organized by subject (FR76)
**And** RetentionSignal component used for all retention indicators — color + text label always paired, never color alone (accessibility)
**And** decay visualization updates reflect SM-2 interval data from Epic 3

**FRs:** FR69, FR70, FR73, FR76, FR90

---

### Cluster B: Multi-Subject Management

### Story 4.3: Multi-Subject Home Screen & Subject Switching

As a learner managing multiple subjects,
I want to see all my active subjects on the Home Screen and switch between them,
So that I can organize my learning across different areas.

**Acceptance Criteria:**

**Given** a learner has created multiple curricula (subjects)
**When** the Home Screen loads
**Then** all active subjects are displayed with progress summary per subject (FR78)
**And** learners can create new curricula (subjects) under their profile (FR77) — triggers Epic 1 onboarding flow for the new subject
**And** learners can switch between subjects from Home Screen or from within Learning Book (FR79)
**And** SubjectRetentionStrip component renders horizontal scrollable subject chips with retention status (Strong/Fading/Weak) per the UX spec
**And** subject with most urgent retention need is highlighted (pulsing or accent border per UX spec)
**And** urgency ranking algorithm: weighted score combining (1) count of overdue recall tests past SM-2 due date (heaviest weight — most time-sensitive), (2) count of topics in Weak/Forgotten retention status, (3) days since last session in that subject. Ties broken by subject with more total topics (larger investment at risk). Algorithm implemented server-side, returned as sort order in the subjects API response.

**FRs:** FR77, FR78, FR79

---

### Story 4.4: Subject Lifecycle Management

As a learner,
I want to pause, resume, archive, and restore subjects,
So that I can manage my learning load without losing progress.

**Acceptance Criteria:**

**Given** a learner wants to temporarily stop studying a subject
**When** they pause the subject
**Then** the subject is hidden from Home Screen but remains accessible in Learning Book (FR80)
**And** learners can resume a paused subject, returning it to the Home Screen (FR81)
**And** learners can archive a subject (removes from active view entirely, but all Learning Book entries are preserved) (FR82)
**And** archived subjects can be restored from Settings (FR83)
**And** subjects with no activity for 30 days are auto-archived with a notification before auto-archive (FR84)
**And** auto-archived subjects can be restored the same way as manually archived ones
**And** paused/archived subjects do NOT generate review reminders or count against Honest Streak
**And** when a subject is paused or archived, Inngest recall chain steps check subject status at execution time and short-circuit (skip) if subject is paused/archived. No need to cancel queued events — jobs self-suppress. When subject is resumed, SM-2 recalculates intervals based on total elapsed time since last recall (the gap counts as decay, not as a pause).

**FRs:** FR80, FR81, FR82, FR83, FR84

---

### Cluster C: Engagement & Motivation

### Story 4.5: Honest Streak & Retention XP

As a learner,
I want to track my learning consistency and earn XP that reflects genuine understanding,
So that my progress metrics are meaningful, not gameable.

**Acceptance Criteria:**

**Given** a learner uses the app daily
**When** they pass at least one recall test in a session
**Then** their Honest Streak increments (consecutive days with passing recall — opening the app alone doesn't count) (FR86)
**And** if the learner misses a day, the streak pauses for up to 3 days before breaking (FR87) — not an instant reset
**And** during the 3-day grace period, streak display shows: "Streak: 12 days (paused — 2 days left)" with a visual indicator (dimmed/amber state, not the normal green). The count does NOT decrement during the pause — it freezes. If the learner returns and passes a recall test within the grace window, the streak resumes and increments. If the grace period expires, streak resets to 0 with an encouraging message ("Streaks restart — your knowledge doesn't. Pick up where you left off.")
**And** Retention XP is earned in "pending" state when a topic is completed (FR88)
**And** pending XP transitions to "verified" only after passing delayed recall tests (Epic 3 Story 3.3 verification) (FR88)
**And** the UI clearly distinguishes "topics completed" vs "topics verified" so learners understand the difference (FR89)
**And** streak and XP data loaded from server via TanStack Query, not computed client-side

**FRs:** FR86, FR87, FR88, FR89

---

### Story 4.6: Interleaved Retrieval & Knowledge Stability

As a learner,
I want to take mixed-topic retrieval sessions and see topics become stable,
So that I build durable cross-topic understanding and can see my strongest knowledge.

**Acceptance Criteria:**

**Given** a learner has multiple completed topics across subjects
**When** they start an interleaved retrieval session
**Then** questions are drawn from multiple topics and randomized (not grouped by subject) (FR92)
**And** interleaved sessions use the same exchange processing pipeline as regular sessions (Epic 2 Story 2.1)
**And** results feed back into SM-2 interval calculations per topic
**And** "consecutive successful retrievals" counts equally regardless of session type — interleaved passes count the same as focused recall tests. Interleaved retrieval is a desirable difficulty (higher cognitive demand due to context-switching), which produces stronger long-term retention. The key qualifier is "successful retrieval" — meaning the learner demonstrated recall at the depth level established in their last assessment (Story 3.2), not just answered a surface-level question.
**And** topics that achieve 5+ consecutive successful retrievals across any session type are marked "Stable" (FR93)
**And** "Stable" status is visible in Learning Book and on the subject retention strip
**And** stable topics are still included in interleaved sessions at reduced frequency (SM-2 handles this naturally via extended intervals)

**FRs:** FR92, FR93

---

### Story 4.7: Learning Mode Selection (Serious/Casual)

As a learner,
I want to choose between a mastery-focused mode and a casual exploration mode,
So that the app matches my learning intent without forcing one approach.

**Acceptance Criteria:**

**Given** a learner wants to configure their learning experience
**When** they select their learning mode
**Then** "Serious Learner" mode enables: mastery gates (must pass assessment before progressing), verified XP only (pending until delayed recall), mandatory summaries (FR94)
**And** "Casual Explorer" mode enables: no mastery gates (progress freely), completion XP (earned immediately, no verification required), summaries optional (FR94)
**And** mode is selectable per-profile (not per-subject) from Settings
**And** switching mode mid-journey preserves all progress — mode change affects future behavior only, does not retroactively change XP status
**And** the system prompts learners who skip >10 consecutive topics: "Would you like to switch to Casual Explorer mode?" (cross-reference: Epic 1 skip-prevention threshold)
**And** this story is the authoritative definition of Casual Explorer mode (cross-referenced by Epic 2 Story 2.8's summary behavior)
**And** learning mode affects AI coaching voice and framing, not just mechanics. Serious Learner framing is mastery-oriented: "You have 3 topics pending verification — want to lock them in?" Casual Explorer framing is curiosity-oriented: "Ready to explore something new? Or revisit something interesting?" Mode is a signal in the LLM system prompt context (same pattern as teaching method preferences in Story 3.9). Components remain mode-unaware — difference is entirely in AI-generated text and gate/XP logic.

**FRs:** FR94

---

### Story 4.8: Notification Preferences & Review Reminders

As a learner,
I want to receive review reminders for fading topics and configure my notification preferences,
So that I'm prompted to review before knowledge decays too far.

**Acceptance Criteria:**

**Given** a learner has topics with fading retention
**When** the retention system detects decay below threshold
**Then** review reminders are sent for fading topics (FR91)
**And** learners can choose in-app or push notifications for review reminders (FR42) — this is where FR42 (deferred from Epic 2) is implemented because notifications now have something to notify about
**And** learners can receive daily push notifications for general learning reminders (FR95)
**And** push notifications use `services/notifications.ts` via Expo Push SDK (ARCH-18)
**And** all notification types are opt-in, off by default — user enables in Settings
**And** notifications never fire during an active learning session (queue until session close per UX spec)
**And** notification content uses coaching voice, not system-alert tone: "Your Chemistry topics are fading — 4 minutes would help" not "REVIEW NOW"
**And** maximum 3 push notifications per day per profile, prioritized by urgency (overdue recall tests first, then fading topics, then general reminders). If more than 3 topics need attention, the notification aggregates: "3 topics fading across Math and Science — 10 minutes would help." In-app notifications (badge/indicator) are not capped — they show the full list when the learner opens the app.

**FRs:** FR42, FR91, FR95
**ARCH:** ARCH-18

---

### Cluster D: Dashboard, Theming & Coaching Cards

### Story 4.9: Three-Persona Theming & Profile Switch

As a user switching between profiles,
I want the app to instantly adapt its visual theme to my persona,
So that each profile feels like a tailored experience.

**Acceptance Criteria:**

**Given** the app supports three persona themes
**When** a user logs in or switches profile
**Then** CSS variables are set at root layout: teen dark theme, learner calm theme, parent light theme (UX-6)
**And** components remain persona-unaware — no conditional rendering per persona type. Theming is purely via CSS variable swap.
**And** profile switch triggers instant theme crossfade (100ms transition), with content skeleton if data fetch is needed (UX-14)
**And** the full theme token set includes: primary/secondary/accent colors, surface/background colors, text-primary/text-secondary/text-muted, border colors, input/card/overlay surface variants, and the 12 retention signal tokens (4 signals × fg/bg/on-bg). Full token spec defined in `docs/ux-design-specification.md` (semantic tokens: `bg-surface`, `text-primary`, `border-accent`, etc.). This story implements the complete token set per the UX spec — no ad-hoc token invention.
**And** all contrast ratios pass WCAG AA (4.5:1 text, 3:1 large text) across all three themes
**And** theme is "who am I?" not "whose data am I looking at?" — parent viewing child's Learning Book stays in parent theme

**FRs:** (UX requirements)
**UX:** UX-6, UX-14

---

### Story 4.10: Adaptive Coaching Card System

As a user,
I want context-aware opening and closing cards that adapt to my situation,
So that each session starts and ends with relevant, personalized guidance.

**Acceptance Criteria:**

**Given** Epic 2 established a minimal coaching card ("Welcome back, continue [topic]?")
**When** full retention and mastery data is available (from Epic 3)
**Then** BaseCoachingCard component is implemented with shared layout, tokens, animation, and skeleton loading (UX-7)
**And** four variants render from the same base: CoachingCard (eager learner), AdaptiveEntryCard (child), ParentDashboardSummary (parent), SessionCloseSummary (all personas) (UX-7)
**And** coaching card uses two-path loading: cached path (<1s, reads from Workers KV, freshness via context-hash: time_bucket + dayType + retentionSnapshot + lastSessionType) vs fresh path (1-2s skeleton: triggers on first launch, gap >48h, context mismatch, new device) (UX-5)
**And** AdaptiveEntryCard is context-aware based on time, retention, and behavioral patterns (UX-8):
  - Homework-predicted: "Ready for homework?" → [Camera] / [Something else]
  - Gap-detected: "2 things fading — 4-minute refresh?" → [Sure] / [Just ask]
  - Post-test: "How'd the test go?" → [Let's go] / [Not now]
  - No-context fallback: "What do you need?" → [Homework] / [Practice] / [Just ask]
**And** context prediction logic lives entirely server-side in the Inngest precompute step (Story 3.4, step 2: coaching card KV write). The precompute step evaluates: time-of-day patterns from session history (homework-predicted), retention snapshot from SM-2 data (gap-detected), recent assessment results (post-test), and falls back to no-context when signals are insufficient. Decision is written to Workers KV as the selected variant + content. Mobile client reads KV and renders — no prediction logic on device. Local-only signal (e.g., time-of-day at app open) is passed as a KV cache key parameter so the server can precompute multiple time-bucket variants.
**And** cold start (sessions 1-5) uses coaching-voiced three-button fallback instead of adaptive entry (UX-8)
**And** SessionCloseSummary shows: what stuck, what needs work, when AI will check back — "Solid on this. I'll check in 4 days."
**And** skeleton state is announced to screen readers as "loading"

**FRs:** (UX requirements)
**UX:** UX-5, UX-7, UX-8

---

### Story 4.11: Parent Dashboard

As a parent,
I want a 5-second-glance dashboard showing each child's learning status with trends,
So that I can verify the app is working without switching into child profiles.

**Acceptance Criteria:**

**Given** a parent opens the app
**When** the parent dashboard loads (<2 seconds)
**Then** one-sentence summary per child is displayed with process visibility (UX-13):
  - "Alex: Math — 5 problems, 3 guided. Science fading. 4 sessions this week (↑ from 2 last week)."
**And** confidence signal "guided vs immediate" ratio is shown per child — process visibility without accusation
**And** temporal comparison is always visible without any taps: session count + time this week vs last week with directional arrow (↑ ↓ →) (UX-13)
**And** subject retention signals per child: Green (Strong) / Yellow (Fading) / Red (Weak) — always paired with text labels, never color alone
**And** drill-down supported: tap child → subject cards → topic list → session history → max 3 levels of navigation
**And** full session transcript access is age-gated: parents of children aged 11-14 see full transcripts (younger children, parental oversight expected). Parents of children aged 15-17 see session summaries only (topic, duration, mastery outcome, guided-vs-immediate ratio) — full transcript replaced with "Detailed transcripts are private for older learners." Age threshold aligns with the GDPR consent boundary in Epic 0. If the PRD doesn't address this explicitly, flag as a PRD update.
**And** drill-across supported: week-over-week trends in plain language ("This week: 4 sessions, 3 hours. Retention improving in Math, fading in Science.")
**And** demo-mode toggle (deferred UX-9): static JSON fixture shipped with the app bundle — not LLM-generated, not fetched from server. Fixture contains 2 sample children with realistic session history, retention signals, and temporal comparison data. Predictable, deterministic, no API calls. Demo badge is always visible when viewing fixture data. Toggle available in Settings after real data exists.
**And** dashboard uses ParentDashboardSummary coaching card variant from Story 4.10
**And** dashboard always shows current data — silent refresh in background, never stale
**And** dual-signal anti-gaming: trend shows BOTH session count AND time ("4 sessions, 3 hours total") to catch brief sessions that game streak

**FRs:** FR42 (parent notification settings)
**UX:** UX-13, UX-9

---

### Epic 4 Execution Order

```
Cluster A: 4.1 → 4.2 (topic detail drills from topic list)
Cluster B: 4.3 → 4.4 (lifecycle needs home screen first)
Cluster C: 4.5, 4.6, 4.7 (can parallel) → 4.8 (notifications need content to notify about)
Cluster D: 4.9 (theming) → 4.10 (coaching cards use theme tokens) → 4.11 (dashboard uses coaching card variant)

Clusters A-D are independent and can run in parallel.
```

**Cross-epic dependencies:** Epic 3 Stories 3.2-3.3 (retention/mastery data), Epic 2 Story 2.1 (session infrastructure), Epic 2 Story 2.8 (session close summary data).
**Convergence note:** Story 4.10 (Coaching Card) has triple convergence: depends on Story 3.4 (Inngest precompute), Story 4.9 (theming tokens), and Epic 2's minimal card as upgrade base. Sprint planning must schedule 4.10 after all three are complete — this is the critical path for Cluster D.

---

## Epic 5: Subscription & Billing — Stories

**Scope:** FR108-FR117 (10 FRs) + ARCH-11 (subscription status KV), ARCH-17 (two-layer rate limiting)
**Note:** This epic was parallelized with Epics 2-4. ✅ Metering middleware is fully implemented — the original stub plan was superseded by early delivery of real quota enforcement.
**Stories:** 6

### Story 5.1: Stripe Integration & Webhook Sync

As a development team,
We need Stripe webhook handling and local subscription state sync,
So that subscription data is always available without calling Stripe during learning sessions.

**Acceptance Criteria:**

**Given** a Stripe event occurs (subscription created, updated, cancelled, payment succeeded/failed)
**When** Stripe webhook fires to `/v1/stripe/webhook`
**Then** subscription state is synced to local database (Neon) and Workers KV (ARCH-11)
**And** webhook endpoint uses Stripe signature verification, NOT Clerk JWT (skip auth middleware for this route)
**And** subscription state machine is implemented: `trial → active → past_due → cancelled → expired`
**And** Workers KV stores subscription status for metering reads (write on webhook, read on quota check) — ARCH-11
**And** payment failure handling: 3-day grace period with automatic retry on Day 1, 2, 3. Email notification on each failed attempt. After Day 3 → downgrade to Free tier (progress preserved).
**And** never call Stripe API during learning sessions — all reads from local DB/KV
**And** Stripe customer ID linked to Clerk user ID in the accounts table
**And** webhook handler is idempotent (duplicate events handled gracefully)
**And** webhook handler uses Stripe event `created` timestamp to resolve out-of-order delivery — never overwrite newer state with older event. If an incoming event's timestamp is older than the last-processed timestamp for that subscription, skip the update and log the out-of-order event.

**FRs:** (infrastructure — no direct FR)
**ARCH:** ARCH-11

---

### Story 5.2: 14-Day Trial & Reverse Trial Soft Landing

As a new user,
I want to experience full Plus access during a trial period with a gradual step-down,
So that I can discover the app's value before committing to a subscription.

**Acceptance Criteria:**

**Given** a new user registers
**When** account is created
**Then** 14-day trial with full Plus access starts automatically (FR108)
**And** credit card required for trial start (2.7x higher conversion). Messaging: "Try for €0" not "Free trial".
**And** all progress is saved during and after trial — progress persists regardless of subscription state (FR109)
**And** trial expiry warnings sent: "3 days left", "1 day left", "Last day of trial" (FR110)
**And** trial expires at end of day (midnight user's timezone), not mid-session
**And** user timezone captured during registration (inferred from device via `Intl.DateTimeFormat().resolvedOptions().timeZone`) and stored on the account record. Dependency on Epic 0 Story 0.1: add `timezone` text field to accounts table, populated at registration, updatable from Settings. Fallback to UTC if missing.
**And** if user is mid-session when trial ends, session completes fully — next period limits apply after
**And** reverse trial soft landing: Days 15-28 = extended trial (15 questions/day). Day 29+ = Free tier (50/month).
**And** soft landing messaging: Day 15 ("giving you 15/day for 2 more weeks"), Day 21 ("1 week left"), Day 28 ("tomorrow you move to Free")
**And** trial state tracked via Stripe subscription with trial period, synced to local DB via Story 5.1 webhook

**FRs:** FR108, FR109, FR110

---

### Story 5.3: Subscription Tiers, Billing & Top-Up Credits

As a user,
I want to subscribe to a tier that matches my needs with monthly or yearly billing,
So that I can access the right level of learning capacity.

**Acceptance Criteria:**

**Given** a user wants to upgrade from Free or trial
**When** they select a subscription tier
**Then** they can choose Plus (€18.99/mo), Family (€28.99/mo), or Pro (€48.99/mo) (FR111)
**And** annual billing available with ~25-26% discount (FR115)
**And** Stripe Checkout handles payment flow — no custom payment form
**And** context-aware upgrade prompts shown at natural moments: Free→Plus at 50/month cap, Plus→Family when adding family member, Plus→Family when 3+ top-ups purchased, Family→Pro when needing 5-6 users
**And** downgrade preserves all progress (Learning Book, curricula, XP, summaries). Only usage limits change. No data archived or deleted.
**And** top-up credits purchasable anytime: €10/500 (Plus), €5/500 (Family/Pro). Not available on Free tier.
**And** top-up usage: monthly quota consumed first, then top-ups in FIFO order. Monthly quota does NOT roll over; top-ups DO (12-month expiry).
**And** top-up expiry reminders at month 6, 8, 10, and 12
**And** on mid-cycle upgrade: user receives the new tier's full monthly allocation minus questions already consumed in the current cycle. Example: Plus user consumed 200/500, upgrades to Family (1,500) → remaining becomes 1,300 (1,500 - 200). Stripe handles billing proration; `decrement_quota` reads the new tier ceiling from the webhook-synced subscription record.
**And** on mid-cycle downgrade: if already consumed more than the lower tier's allocation, user cannot ask more questions until cycle reset but loses no progress or data. Example: Family user consumed 800, downgrades to Plus (500) → 0 remaining until cycle resets. No negative balance.
**And** confirmed: monthly quota does NOT roll over — unused questions expire at billing cycle reset. As the cycle end approaches (5 days before reset), coaching card includes a gentle usage nudge: "You have 200 questions left — your cycle resets Tuesday." Nudge logic in Inngest coaching card precompute (Story 3.4 / 4.10), reading quota data from the metering system.

**FRs:** FR111, FR115

---

### Story 5.4: Subscription Lifecycle & Status

As a subscriber,
I want to view my subscription status, cancel anytime, and access the BYOK waitlist,
So that I'm always in control of my subscription.

**Acceptance Criteria:**

**Given** a user has an active subscription
**When** they navigate to subscription settings
**Then** they can view: current tier, renewal date, billing cycle, payment method (FR113)
**And** users can cancel subscription at any time (FR112)
**And** cancellation is immediate but access continues until end of current billing period
**And** after billing period ends, account reverts to Free tier — progress preserved indefinitely
**And** BYOK waitlist: email capture form for future "Bring Your Own Key" feature (FR114). Simple form, stores email in database, sends confirmation. No integration with external services at MVP.
**And** subscription status shown in app header/settings — loaded from Workers KV (fast read), not Stripe API

**FRs:** FR112, FR113, FR114

---

### Story 5.5: Family Billing & Shared Question Pool

As a family account owner,
I want to add profiles to my subscription with shared question allocation,
So that my family can learn together under one billing plan.

**Acceptance Criteria:**

**Given** a user is on Family (up to 4 profiles) or Pro (up to 6 profiles) tier
**When** they add a learner profile
**Then** the profile is added to the subscription with per-profile pricing (FR116)
**And** all profiles draw from the same monthly question pool (Family: 1,500/mo, Pro: 3,000/mo)
**And** shared pool creates natural household coordination — no per-profile quotas
**And** when pool is exhausted: purchase top-ups or upgrade tier prompt shown
**And** anyone can be invited to a family account (no household verification)
**And** family owner cancellation → all profiles downgrade to Free tier (each member notified)
**And** individual profile removal from family: profile converts to Free tier, profile owner notified
**And** profile can leave family voluntarily (converts to Free tier with confirmation)
**And** proration handled by Stripe for mid-cycle profile additions
**And** when a profile is removed mid-cycle, questions already consumed by that profile remain "spent" — no clawback, no retroactive pool adjustment. The family pool simply has fewer remaining questions going forward.

**FRs:** FR116

---

### Story 5.6: Quota Metering & Usage Display

As a user,
I want to see my question usage and receive warnings as I approach limits,
So that I can manage my usage and upgrade before hitting the ceiling.

**Acceptance Criteria:**

**✅ IMPLEMENTED** — Real quota enforcement shipped alongside Epics 2-4 (no stub phase needed).

**Given** the metering system
**Then** real quota enforcement via atomic `decrementQuota` in `services/billing.ts` with SQL WHERE guards (ARCH-17)
**And** two-layer rate limiting: Cloudflare Workers (100 req/min per user, wrangler.toml) + quota metering middleware (per-profile questions/month) (ARCH-17)
**And** question counting rules: each user message triggering an AI response counts. System messages, curriculum generation, and onboarding interview do NOT count.
**And** quota is decremented once per user message, before the LLM call (optimistic decrement). Provider retries and failover within `routeAndCall()` count as one question regardless of how many providers are attempted. If the LLM call fails after all provider retries are exhausted, quota is refunded via `increment_quota`. The user sees an error and their question count is unchanged.
**And** `decrement_quota` PostgreSQL function uses `SELECT FOR UPDATE` on the quota pool row to prevent race conditions in shared Family/Pro pools where concurrent requests from multiple family members could race.
**And** usage display: remaining questions shown in app header/dashboard (FR117)
**And** soft warning at 80% of monthly ceiling: "You're approaching your monthly limit"
**And** hard warning at 95%: "X questions remaining this month"
**And** at ceiling: current AI exchange completes fully (never interrupt mid-response), then upgrade/top-up prompt shown
**And** ceiling resets on billing cycle date
**And** for shared pools (Family/Pro): usage display shows pool-level consumption, not per-profile
**And** metering reads subscription status from Workers KV (written by Story 5.1 webhook handler) — never calls Stripe

**FRs:** FR117
**ARCH:** ARCH-17

---

### Epic 5 Execution Order

```
5.1 (Stripe foundation) → 5.2, 5.3, 5.4 (can parallel after Stripe infra) → 5.5 (family needs tiers) → 5.6 (metering needs all subscription states)
```

**Cross-epic dependency (resolved):** ✅ Metering was delivered alongside Epics 2-4 — the original stub→replace plan was superseded. Real quota enforcement is live: `middleware/metering.ts` (402 on exceeded), `services/metering.ts` (pure logic), `services/billing.ts` (atomic DB operations), mobile hooks (`useSubscriptionStatus`), Inngest cron (quota reset + trial expiry).

---

## Epic 6: Language Learning (DEFERRED — v1.1) — Placeholder Stories

**Scope:** FR96-FR107 (12 FRs)
**Status:** Deferred to v1.1. Placeholder stories for scope confirmation and FR coverage only. Full acceptance criteria to be written during v1.1 planning based on MVP learnings.
**Stories:** 5 (placeholders)
**Dependencies:** Epics 0-3 (full learning infrastructure), specifically `packages/retention/` SM-2 engine

### Story 6.1: Language Intent Detection & Methodology Switch

FR96: System auto-detects language learning intent and switches from Socratic teaching to Four Strands methodology.
FR97: Users can specify native language for grammar explanations in their target language.

**FRs:** FR96, FR97

---

### Story 6.2: Explicit Grammar & Output Practice

FR99: Users receive explicit grammar instruction (direct teaching, not Socratic discovery — language learning requires different pedagogy).
FR100: Users practice output (speaking/writing) every session.
FR107: Users receive direct error correction (not Socratic hints — immediate correction is more effective for language errors).

**⚠️ Architectural prerequisite — per-subject pedagogy mode:**
FR99 and FR107 represent a **meaningful behavior change from the Socratic default** used everywhere else. The existing within-session three-strike `switch_to_direct` mechanism (Epic 3, `adaptive-teaching.ts`) only triggers after repeated wrong answers — it's a fallback, not a default mode. Language learning needs direct correction as the _default_ pedagogy, not a fallback.

**Required before implementation:**
- A `pedagogy_mode` enum or similar flag on the `subjects` table (or a new `subject_config` table) distinguishing `'socratic'` (default for all current subjects) from `'four_strands'` (language learning).
- The existing `teaching_method` enum (`visual_diagrams`, `step_by_step`, etc.) stays orthogonal — it controls _how_ to explain, while `pedagogy_mode` controls _whether_ to use Socratic questioning or direct instruction as the baseline teaching approach.
- `buildSystemPrompt()` in `services/exchanges.ts` must read `pedagogy_mode` and switch between Socratic escalation ladder prompts and direct instruction prompts accordingly.
- Auto-detection of language learning intent (FR96, Story 6.1) should set `pedagogy_mode` on the subject at creation time.

**FRs:** FR99, FR100, FR107

---

### Story 6.3: Comprehensible Input & Vocabulary SR

FR101: Users read comprehensible passages at 95-98% known words (Krashen's input hypothesis).
FR102: Users practice vocabulary with spaced repetition — reuses `packages/retention/` SM-2 engine from Epic 3.
FR105: Users learn collocations and phrases (not just isolated words).

**FRs:** FR101, FR102, FR105

---

### Story 6.4: CEFR Progress & FSI Time Estimates

FR98: Users see realistic time estimates based on FSI language categories (600-2200 hours depending on language).
FR103: Users see vocabulary count and CEFR progress tracking (A1 → A2 → B1 → B2 → C1 → C2).
FR106: Users see hours studied vs FSI estimate for their target language.

**FRs:** FR98, FR103, FR106

---

### Story 6.5: Fluency Drills

FR104: Users practice fluency with time-pressured drills (speed and automaticity practice).

**FRs:** FR104

---

### Epic 6 FR Coverage

All 12 FRs (FR96-FR107) + FR146 (Language SPEAK/LISTEN Voice, depends on Epic 8.1-8.2) mapped across 5 placeholder stories. Full ACs deferred to v1.1 planning.

---

## Epic 7: Concept Map — Prerequisite-Aware Learning (v1.1) — Stories

**Scope:** FR118-FR127 (10 FRs), 6 stories
**Dependencies:** Epic 3 (retention infrastructure), Epic 1 (curriculum/topic infrastructure)

### Story 7.1: Topic Prerequisite Data Model

As a system,
I need a prerequisite graph data model and LLM edge generation,
So that curriculum topics can express dependency relationships as a DAG.

**Acceptance Criteria:**

**Given** the database needs prerequisite support
**When** the schema is created
**Then** `topic_prerequisites` join table is created with `prerequisiteTopicId`, `dependentTopicId`, `relationshipType` (REQUIRED/RECOMMENDED enum), `createdAt`
**And** DAG cycle detection is implemented in the service layer (topological sort validation before insert)
**And** LLM generates initial prerequisite edges on subject creation as part of curriculum generation
**And** targeted edge generation for new topics added to existing curriculum (not full graph regeneration)

**FRs:** FR118, FR122

---

### Story 7.2: Prerequisite-Aware Session Ordering

As a learner,
I want my learning path to respect prerequisite order,
So that I build knowledge on solid foundations.

**Acceptance Criteria:**

**Given** a curriculum with prerequisite edges
**When** the coaching card recommends the next topic
**Then** coaching card checks prerequisites before recommending — topics with incomplete REQUIRED prerequisites are not surfaced
**And** default ordering uses topological sort (prerequisite depth)
**And** ties within the same topological layer are broken by retention urgency (most urgent first)

**FRs:** FR119, FR126

---

### Story 7.3: Skip Warning & Orphan Edge Handling

As a learner skipping a topic,
I want to understand the impact on dependent topics,
So that I make informed decisions about what to skip.

**Acceptance Criteria:**

**Given** a learner wants to skip a topic that has dependents
**When** the skip is initiated
**Then** a warning dialog is shown listing dependent topics and relationship types
**And** skip is logged in `curriculumAdaptations.prerequisiteContext` JSONB
**And** dependent topics remain accessible (not locked) after prerequisite is skipped
**And** coaching card notes missing foundation for topics with skipped prerequisites

**FRs:** FR120, FR124

---

### Story 7.4: Prerequisite Context as Teaching Signal

As a learner studying a topic with skipped prerequisites,
I want the AI tutor to bridge knowledge gaps,
So that I can still learn effectively despite missing foundations.

**Acceptance Criteria:**

**Given** a learner is in a session for a topic with prerequisite context
**When** `buildSystemPrompt()` constructs the LLM prompt
**Then** prerequisite context is included when available (e.g., "student skipped fractions, which was a prerequisite for this topic")
**And** LLM bridges knowledge gaps for topics with skipped prerequisites by providing foundational context inline

**FRs:** FR125

---

### Story 7.5: Graph-Aware Coaching Card

As a learner progressing through a curriculum,
I want coaching to reflect my prerequisite graph progress,
So that I know when new topics are unlocked and when foundations are at risk.

**Acceptance Criteria:**

**Given** the coaching card precomputation runs
**When** prerequisite graph data is available
**Then** coaching precomputation considers prerequisite graph
**And** new "newly unlocked" card type surfaces topics whose REQUIRED prerequisites have all reached strong retention
**And** at-risk flagging warns when foundational prerequisites drop to fading/weak for dependent topics

**FRs:** FR123

---

### Story 7.6: Visual Concept Map & Manual Override

As a learner,
I want to see a visual map of how my curriculum topics connect,
And optionally mark prerequisites as "already known,"
So that I can track my progress visually and customize my learning path.

**Acceptance Criteria:**

**Given** a learner navigates to the concept map view
**When** the visualization loads
**Then** read-only DAG visualization is rendered (library TBD — likely react-native-svg + Sugiyama layout)
**And** nodes are colored by retention status (green = strong, yellow = fading, red = weak, gray = not started)
**And** parent or advanced learner can mark a prerequisite as "already known" to unlock dependents without completing it

**FRs:** FR121, FR127

---

### Epic 7 Execution Order

```
7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6 (sequential — each builds on previous)
```

### Epic 7 FR Coverage

All 10 FRs (FR118-FR127) mapped across 6 stories. Implementation deferred to post-MVP, pre-launch phase.

---

## Epic 8: Full Voice Mode (v1.1) — Stories

**Scope:** FR144-FR145, FR147-FR149 (5 FRs), 5 stories + 1 stretch
**Dependencies:** Epic 3 Cluster G (Feynman Stage establishes STT/TTS infrastructure)
**Status:** Deferred to v1.1. Stories defined with acceptance criteria. FR146 (Language SPEAK/LISTEN Voice) mapped to Epic 6 — depends on Epic 8.1-8.2.

### Story 8.1: Voice-First Session Toggle

As a learner starting a session,
I want to choose between text mode and voice mode,
So that I can learn using the input method that suits my current context.

**Acceptance Criteria:**

**Given** a learner is starting any session (learning, homework, interleaved)
**When** the session start screen loads
**Then** a toggle is presented: "Text mode" (default) / "Voice mode" (FR144)
**And** session type is orthogonal to input mode — voice works with learning, homework, and interleaved sessions (FR144)
**And** mode is stored on the session record (`input_mode` field: `text` | `voice`)
**And** voice mode activates STT input + TTS output, reusing `expo-speech-recognition` and `expo-speech` infrastructure from Feynman Stage (Epic 3 Story 3.17) (FR144)
**And** mode can be switched mid-session via the voice toggle (same toggle from Story 3.17, extended to all session types)

**FRs:** FR144

---

### Story 8.2: TTS Playback — Option A

As a learner in voice mode,
I want the AI's response read aloud after streaming completes,
So that I can listen to explanations while following along visually.

**Acceptance Criteria:**

**Given** a learner is in voice mode and the AI generates a response
**When** SSE streaming completes (full response received)
**Then** the complete response plays as audio via `expo-speech` (FR145)
**And** text streams visually during generation — student reads along while waiting for audio (FR145)
**And** audio plays once streaming is complete (Option A: wait for complete) (FR145)
**And** playback respects voice toggle state — if muted, no audio plays (FR145)
**And** documented upgrade path to sentence-buffered Option B: sentence boundary detection deferred because abbreviations, decimals, and URLs make naive detection unreliable. Option B requires a sentence segmentation library or LLM-side sentence markers. (FR145)

**FRs:** FR145

---

### Story 8.3: Voice Session Controls

As a learner in voice mode,
I want playback controls so I can manage the audio experience,
So that I can pause, replay, and adjust speed to match my learning pace.

**Acceptance Criteria:**

**Given** a learner is in voice mode
**When** they interact with voice controls
**Then** pause/resume recording mid-speech is supported (FR147)
**And** replay last AI response button available — re-triggers `expo-speech` on the last response text (FR147)
**And** TTS speed control: 0.75x, 1x (default), 1.25x — persisted for the session (FR147)
**And** interrupt AI mid-speech: tapping microphone while TTS is playing stops playback and starts new recording (FR147)
**And** voice controls are rendered in a compact toolbar below the chat input area

**FRs:** FR147

---

### Story 8.4: Spike — Screen Reader + App TTS Coexistence

As a development team,
We need to understand how VoiceOver/TalkBack interacts with app-initiated TTS audio,
So that voice mode is accessible and does not conflict with assistive technology.

**Acceptance Criteria:**

**Given** the app plays TTS audio via `expo-speech` while a screen reader is active
**When** both attempt to produce audio simultaneously
**Then** the spike documents observed behavior on iOS (VoiceOver) and Android (TalkBack) (FR149)
**And** three approaches are documented with trade-offs: (1) defer to screen reader — disable app TTS when screen reader detected, (2) audio ducking — lower screen reader volume during app TTS, (3) manual user control — explicit "Play audio" button instead of auto-play (FR149)
**And** recommended approach is selected with rationale
**And** testing performed on physical iOS + Android devices (not simulators)
**And** findings documented in architecture decisions (`docs/architecture.md`)

**FRs:** FR149 (research prerequisite)

---

### Story 8.5: Voice Accessibility Implementation

As a learner using assistive technology,
I want voice mode to coexist with my screen reader,
So that I can use voice features without losing accessibility support.

**Acceptance Criteria:**

**Given** the recommended approach from Story 8.4 spike
**When** voice accessibility is implemented
**Then** the chosen approach from the spike is fully implemented (FR149)
**And** screen reader detection is integrated — app detects when VoiceOver/TalkBack is active
**And** graceful fallback: visual transcript is always available regardless of audio state (FR149)
**And** haptic feedback on recording state changes (start/stop recording) for non-visual confirmation
**And** tested with VoiceOver on physical iOS device and TalkBack on physical Android device
**And** all voice UI elements have proper accessibility labels and roles

**Depends on:** Story 8.4

**FRs:** FR149

---

### Story 8.6 (STRETCH): Voice Activity Detection

As a learner in voice mode,
I want recording to end automatically when I stop speaking,
So that I don't have to manually tap to stop every time.

**Acceptance Criteria:**

**Given** a learner is recording in voice mode with VAD enabled
**When** silence is detected for a configurable threshold (default 2 seconds)
**Then** recording ends automatically without manual tap (FR148)
**And** VAD can be toggled off — reverts to manual tap-to-stop (FR148)
**And** tested in quiet and noisy environments — false-positive rate documented (FR148)
**And** VAD sensitivity is configurable (low/medium/high) to accommodate different environments
**And** this is a STRETCH story — only build if user feedback from manual tap-to-stop (Stories 3.17 + 8.1) shows demand

**Note:** VAD is explicitly optional. Manual tap-to-stop is the default and may be sufficient for most users. False-positive issues (VAD triggering on background noise, pauses in speech, or breathing) are well-documented in speech recognition literature. Ship manual first, measure demand, then consider VAD.

**FRs:** FR148

---

### Epic 8 Execution Order

```
8.1 (Voice Toggle) → 8.2 (TTS Playback) → 8.3 (Voice Controls) → 8.4 (Accessibility Spike) → 8.5 (Accessibility Implementation)
Story 8.6 (STRETCH: VAD) is independent — build only if user feedback warrants it.
```

### Epic 8 FR Coverage

All 5 FRs (FR144-FR145, FR147-FR149) mapped across 5 stories + 1 stretch. FR146 (Language SPEAK/LISTEN Voice) mapped to Epic 6 — depends on Epic 8.1-8.2. Implementation deferred to v1.1.
