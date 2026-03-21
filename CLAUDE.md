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

## Testing Rules (Local Development)

**Pre-commit runs surgical tests** via `scripts/pre-commit-tests.sh` — NOT `nx affected`.

### For the AI Agent

**Important:** Jest must run from the project directory (ts-jest resolves tsconfig relative to cwd). Set `TS_NODE_COMPILER_OPTIONS` to override `moduleResolution: "bundler"` from tsconfig.base.json.

1. **After modifying a source file, run only related tests:**
   ```bash
   cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/services/consent.ts --no-coverage
   ```
2. **After modifying a package file, also test API consumers:**
   ```bash
   # Package's own tests
   cd packages/schemas && pnpm exec jest --findRelatedTests src/consent.ts --no-coverage
   # API tests that consume the package (cross-project via moduleNameMapper)
   cd apps/api && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests ../../packages/schemas/src/consent.ts --no-coverage
   ```
3. **Never run `pnpm exec nx run-many -t test` or full suite locally** — that's for CI only.
4. **Never run `pnpm exec nx affected -t test` locally** — the pre-commit hook handles this surgically.
5. **To run a single test file:** `cd <project-dir> && pnpm exec jest <test-file> --no-coverage`
6. **To run a whole project's tests** (rare, only when truly needed):
   `pnpm exec nx test api --no-coverage`

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
- Never put PII (emails, names) in event payloads — look up in step functions via DB query instead. Event payloads are logged and visible in Inngest's dashboard.

## Dependency Direction (strictly enforced)

```
apps/mobile  →  @eduagent/schemas
apps/api     →  @eduagent/schemas, @eduagent/database, @eduagent/retention
@eduagent/database  →  (no workspace deps)
@eduagent/retention →  (no workspace deps)
@eduagent/schemas   →  (no workspace deps — leaf package)
@eduagent/factory   →  @eduagent/schemas (test builders)
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
| Check `persona` inside components | Only `_layout.tsx` files read persona. Exception: `(learner)/home.tsx` reads persona for adaptive entry card routing (documented architectural exception — routing logic that doesn't fit in layout) |
| Use Stripe for mobile billing | Native IAP via RevenueCat (`react-native-purchases`). Apple/Google reject Stripe for digital services. Stripe stays for future web. See Epic 9. |

## Current Status

**Complete — all routes production-ready:**
- Epics 0-5: full API layer (~1,443 API tests + ~404 mobile tests + 15 integration test suites, all passing)
- All 23 route files wired to real services with DB persistence (including `consent-web` browser flow and `test-seed` E2E endpoints)
- Mobile: 38+ screens (49 test suites), all using real API calls via TanStack Query + Hono RPC
- Background jobs: 10 Inngest functions (session-completed chain, trial-expiry, consent-reminders, consent-revocation, account-deletion, review-reminder, payment-retry, quota-reset, topup-expiry-reminder, subject-auto-archive)
- Auth: Clerk (SSO + email/password), PasswordInput with show/hide + requirements
- Billing: Stripe integration built (checkout, portal, webhooks, KV-cached status, quota metering) — **mobile must add native IAP (RevenueCat) before App Store submission** (Epic 9). Stripe code kept for future web client.
- Email: Resend integration (consent emails, reminders)
- Push: Expo Push API (trial warnings, review reminders, daily reminders) + `usePushTokenRegistration` hook auto-registers Expo push tokens on mount in both learner and parent layouts
- Consent middleware: `consentMiddleware` blocks data-collecting routes for profiles with pending/revoked consent (AUDIT-001)
- Error tracking: Sentry (API via `@sentry/cloudflare`, mobile via `@sentry/react-native`)
- Embeddings: Voyage AI (session content → pgvector storage in session-completed chain)
- SSE streaming: mobile SSE client + `useStreamMessage` hook for learning/homework sessions
- Coaching cards: precompute service, 24h cache, `GET /v1/coaching-card` route, `AdaptiveEntryCard` wired on home screen
- Session close summary: `SessionCloseSummary` screen at `/session-summary/[sessionId]`, replaces raw exchange-count display
- Parent dashboard: real data from DB via `familyLinks` (children list, session counts, time, retention signals) + consent management (withdraw/restore) on child detail screen
- Failed recall remediation (FR52-58): `processRecallTest()` returns `failureAction: redirect_to_learning_book` after 3+ failures; `startRelearn()` resets retention card and creates new session
- Interleaved retrieval (FR92): `services/interleaved.ts`, `interleavedSessionStartSchema`, `GET /v1/retention/stability`, full stack implemented
- Recall bridge after homework (FR Story 2.7): `POST /v1/sessions/:sessionId/recall-bridge` + `generateRecallBridge()` service
- Homework camera capture (Story 2.5): ML Kit OCR on device, camera state machine + `useHomeworkOcr` hook + full camera UI; server-side `OcrProvider` interface with stub implementation in `services/ocr.ts`
- XP ledger: `insertSessionXpEntry()` wired in session-completed Step 3, `useXpSummary` hook for client-side XP display
- Needs-deepening auto-promotion (FR63): `updateNeedsDeepeningProgress()` wired in session-completed Step 1b
- E2E testing infrastructure: `test-seed` route for deterministic test data, 10 integration suites in `tests/integration/` (auth-chain, onboarding, session-completed-chain, stripe-webhook, account-deletion, health-cors, profile-isolation, test-seed, learning-session, retention-lifecycle), Maestro foundation (seed.js, setup flows, Nx e2e target, 4 Tier 1 smoke flows), enhanced CI workflow with PostgreSQL + API server for mobile-maestro job
- Expo web mode: `.npmrc` with `shamefully-hoist=true` enables `expo start --web` in pnpm monorepo (required for Metro/Babel transitive plugin resolution). Web deps (`react-dom`, `react-native-web`) in root and mobile `package.json`.

- UX audit remediation (55 gaps): consent gating (C16/COPPA), camera-first homework (C8), parent transcript view (C13), session mode configs (C7), math rendering (M21), animations (M22), dark mode, confidence scoring, retention trends, ProfileSwitcher, Inter font, Ionicons, WCAG contrast fixes, shared Button component
- UX persona walkthrough gaps (all resolved): post-approval child landing (`PostApprovalLanding` + SecureStore), parent account-owner landing (`consentWebRoutes` with personalized child name + deep links), child-friendly paywall (`ChildPaywall` with real stats + 24h rate-limit countdown), GDPR consent revocation (full stack: services, routes, Inngest 7-day grace period, child `ConsentWithdrawnGate`, parent withdraw/restore UI), preview mode on pending-consent screen (`PreviewSubjectBrowser` + `PreviewSampleCoaching`)

**Not yet integrated:** OCR provider (server-side fallback; ML Kit primary on device).

**Epic 9 (COMPLETE): Native In-App Purchases** — Apple StoreKit 2 / Google Play Billing via RevenueCat SDK integrated. Existing Stripe code **kept intact** (dormant) for future web client and B2B/school licensing. Business logic (quota metering, subscription tiers, KV caching) is payment-agnostic and unchanged.

**Epic 3 extensions — now implemented:**
- **EVALUATE verification type (Devil's Advocate, FR128-FR133)** — 8th verification type. AI presents flawed reasoning for student to critique (Bloom's Level 5-6). Strong-retention gating (`shouldTriggerEvaluate`), modified SM-2 quality floor (2-3 for failure), `evaluateDifficultyRung` 1-4 on retention card, three-strike escalation, `evaluate-data.ts` DB service, eligibility route (`GET /v1/topics/:topicId/evaluate-eligibility`), wired into session-completed Step 1c.
- **Analogy Domain Preferences (Multiverse of Analogies, FR134-FR137)** — Per-subject analogy domain (cooking, sports, building, music, nature, gaming). Nullable `analogyDomain` on `teachingPreferences`, soft LLM prompt injection in `buildSystemPrompt()`, `AnalogyDomainPicker` component, settings routes, onboarding step (`analogy-preference.tsx` in subject onboarding flow).
- **Feynman Stage / TEACH_BACK (FR138-FR143)** — 9th verification type. Student explains concept, AI plays "confused student". On-device STT (`expo-speech-recognition`) + TTS (`expo-speech`). Two-output pattern: visible follow-up + hidden `structured_assessment` JSON. Scoring rubric (accuracy 50%, completeness 30%, clarity 20%) → SM-2 quality. Voice UI: `VoiceRecordButton`, `VoiceToggle`, `useSpeechRecognition`, `useTextToSpeech`. Wired into session-completed Step 1c.

**Deferred — v1.1 (post-MVP, pre-launch):**
- **Epic 7: Concept Map & Prerequisite-Aware Learning** (FR118-FR127) — `topic_prerequisites` join table (DAG), prerequisite-aware curriculum generation, graph-aware coaching cards ("newly unlocked" type), LLM context injection for weak/skipped prerequisites, Learning Book topological ordering with locked/unlocked indicators, concept map visualization (`react-native-svg` + Sugiyama layout). SM-2 stays pure per-topic — graph logic in coaching precomputation. Skip behavior: warn + orphan edges + log `prerequisiteContext` JSONB in `curriculumAdaptations`.
- **Epic 8: Full Voice Mode** (FR144-FR145, FR147-FR149) — voice-first session mode for all session types. TTS Option A at launch (wait for complete response). Voice controls (pause, replay, speed). VAD is stretch. Accessibility needs spike (VoiceOver/TalkBack coexistence). FR146 (Language SPEAK/LISTEN voice) in Epic 6. Dependency chain: Epic 3 Cluster G (Feynman, MVP) → Epic 8 → Epic 6.

**Deferred — Phase 2:**
- Profile switch PIN/biometric authentication — deferred per UX spec Party Mode revision (line 1631). **Security note:** `profiles.tsx` is reachable via More tab — a child can switch to a parent profile with zero protection. Data isolation is enforced by `createScopedRepository(profileId)` (verified by `profile-isolation.test.ts`), but there is no authentication gate on the profile switch itself. Phase 2 should add PIN/biometric before profile switch completes.

**Pre-launch configuration (not code):**
- [ ] Clerk: configure custom email domain (SPF/DKIM/DMARC) so verification/consent emails don't land in spam
- [x] Sentry: mobile project created (`zwizzly/mentomate-mobile`), DSN set in local env — still need auth token in EAS Secrets for source map uploads
- [ ] Resend: set `RESEND_API_KEY` secret, verify sending domain
- [ ] Apple Developer Program enrollment ($99/year) — required for App Store + IAP
- [x] Google Play Developer account ($25 one-time) — done 2026-03-21
- [ ] RevenueCat project setup — connect both stores, configure entitlements & offerings (see Epic 9)

## Required Reading (before any implementation work)

**You MUST read these before writing code:**

1. `docs/architecture.md` — Full architecture decisions and technical design
2. `docs/epics.md` — Epic breakdown with stories (understand what's built vs planned)
3. `docs/project_context.md` — Detailed AI agent implementation rules (47 rules)
4. `docs/ux-design-specification.md` — UX patterns, theming, component specs, accessibility

**Read as needed:**

- `docs/prd.md` — Product requirements (149 FRs)

## Quality Rules

- **Always test your own work before concluding a task.** Run the relevant tests for any code you write or modify. Do not declare a task complete until tests pass.

## E2E Testing Documentation (Mandatory)

**When working on anything related to E2E tests** (writing flows, fixing bugs, updating seed data, modifying test infrastructure, running test sessions), you MUST:

1. **Read all docs in `docs/E2Edocs/`** at the start of your task to understand current state.
2. **Update the relevant docs** before concluding your task. The folder contains:
   - `e2e-test-results.md` — Session-by-session results, cumulative pass/fail counts
   - `e2e-test-bugs.md` — Bug tracker (BUG-XX entries) with status and root causes
   - `e2e-emulator-issues.md` — Emulator/environment issues and session findings
   - `e2e-tech-spec.md` — Technical spec, phase tasks, infrastructure details
   - `e2e-testing-strategy.md` — Overall strategy, architecture, flow inventory
3. **Keep docs consistent** — if you fix a bug, update both `e2e-test-bugs.md` (status) and `e2e-test-results.md` (session entry). If you add flows, update `e2e-testing-strategy.md` inventory.
4. **When emulator or app issues occur — ALWAYS read `docs/E2Edocs/e2e-emulator-issues.md` FIRST.** Every time you encounter a problem with the Android emulator (crashes, dialogs, boot issues, ADB failures, Bluetooth, ANR) or the app (launch failures, bundle loading, Metro connectivity, dev-client issues), you MUST read the emulator issues doc before attempting any fix. The doc contains tested solutions for all known issues. Do NOT guess or try ad-hoc solutions — the documented procedures exist because they were discovered through painful trial and error.

### E2E Flow Integrity Rules (Mandatory)

These rules protect test coverage from silent erosion. Violations are treated as bugs.

1. **Never weaken a test to make it pass.** If an assertion is failing, investigate and report the root cause. Do NOT remove the assertion, add `optional: true`, or rewrite the flow description to match a weaker test. A passing test with no coverage is worse than a failing test.

2. **`optional: true` requires explicit justification.** Only use it when the element is genuinely optional in the UI by design (e.g., a feature flag, a conditional dialog). Never use it because the element is flaky or currently broken. Every `optional: true` must have a comment on the preceding line explaining why.

3. **Removed assertions or navigation steps must be flagged.** If you remove a `tapOn`, `assertVisible`, `scrollUntilVisible`, or any navigation step from an existing flow, you MUST explicitly tell the user what was removed and why. Silent deletion of coverage is not allowed.

4. **The implemented app code is the source of truth.** E2E flows must mirror the real UI as closely as possible (testIDs, text labels, navigation paths, screen structure). If a test fails, the test must be updated to match the app — not the other way around. It is **forbidden** to modify app code to make a test pass (e.g., adding testIDs that don't belong, changing UI behavior to satisfy an assertion, altering navigation to fit a flow). The only exception is when the test caught a genuine bug in the app — then the app code is fixed because it was actually broken, not because a test demanded it.


## Git Rules

- **Never commit unless explicitly asked.**
- **Never force push, reset --hard, or destructive git operations.**
- Use commitlint conventional commits format.
- Pre-commit hook runs lint-staged + surgical tests (only tests related to staged files).
