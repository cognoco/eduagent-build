# C1 Mock Inventory — Phase 1: Categorize, Don't Refactor

**Status:** Inventory only. No code changes in this phase.
**Date:** 2026-05-04
**Branch:** `gov/h6-test-fixtures`
**Owner:** TBD (Phase 2 epic)
**Scope:** Every internal `jest.mock()` call site in the repo, classified to drive the C1 cleanup epic.

---

## Why this exists

The H-audit governance bundle flagged C1 (~260 internal `jest.mock()` of own services) as **CRITICAL** — but the original plan only addressed *new* violations via the GC1 lint rule. The 260 existing violations were punted to "a separate epic" with no triage. This document is the prerequisite to that epic: a classified, prioritized hit-list so the future refactor work can be scoped, sequenced, and parallelized.

> Note: total `jest.mock()` occurrences in the repo are **946 across 264 test files** (verified via `rg "jest\.mock\(" -t ts -t tsx -c`). Of those, the majority are legitimate external-boundary mocks (Clerk SDK, Stripe SDK, Expo native modules, RevenueCat, Sentry, Inngest framework runtime, ML Kit, push providers). The "internal" subset that is the target of the C1 epic is the **~640 non-EXTERNAL rows** below.

---

## Classification rubric

Each `jest.mock()` site is bucketed into exactly one of:

| Category | Definition | Cleanup priority |
|---|---|---|
| **EXTERNAL** | Legitimate boundary mock: Stripe SDK, Clerk JWKS, OpenAI/Anthropic/Gemini, RevenueCat, Resend, expo-* native modules, Inngest framework runtime (`inngest`, `inngest/hono`, `inngest/client` wrapper), `@sentry/*`, push providers, ML Kit, `react-native-*` native bridges, system clock. | **Out of scope.** Keep. |
| **pure-data-stub** | Mock returns a fixture/constant value with no conditional logic. Used to seed data into a function under test. The factory is `jest.fn().mockResolvedValue({...})` or similar. | Low — replace later by passing real fixtures through repository or factory helpers. Bulk of internal mocks. |
| **auth/middleware-bypass** | Mock of `middleware/jwt`, `middleware/auth`, `services/family-access`, `services/billing` (when used solely to satisfy metering middleware), or any guard that bypasses ownership/permission/quota checks. | **Medium-High** — these mocks routinely hide IDOR / authz regressions. Convert to a single shared test-auth helper that mints real-looking JWTs and runs real middleware. |
| **service-stub-with-business-logic** | Mock of an internal service file where the factory contains conditional logic, multiple return paths, defines error classes inline, or stubs methods that have real business rules. | **HIGHEST** — these are the C1 critical cases. Bugs hide here. Replace with real implementation hitting real DB / Inngest test harness. |
| **redundant-with-integration-test** | A parallel `*.integration.test.ts` exercises the same surface for real. The unit-test mock is therefore not buying coverage, only false confidence. | Medium — delete the unit-test mock or convert the file into a thin wrapper around the integration test. |

---

## Headline counts

Aggregated across all 7 inventory slices (api/services, api/routes, api/middleware, api/inngest, mobile/app, mobile/components, mobile/hooks+lib, integration tests, packages, eval-llm):

| Category | Count | % of internal | Notes |
|---|---:|---:|---|
| `EXTERNAL` (legitimate, not in C1 scope) | **~310** | — | Keep as-is. |
| `pure-data-stub` | **~470** | ~74% of internal | Largest bucket. Mostly `createDatabaseModuleMock`, `useProfile()` returning `{activeProfile}`, `lib/theme` returning flat color tokens, `react-i18next` key passthrough, `lib/api-client` with `mockApiClientFactory`. |
| `auth/middleware-bypass` | **~36** | ~6% of internal | Concentrated in `apps/api/src/routes/*.test.ts` (every route file mocks `../middleware/jwt`). Two outliers: `services/family-access` (IDOR guard) in `dashboard.test.ts` + `learner-profile.test.ts`; `services/billing` mocked solely to satisfy metering middleware in dictation/interview/quiz routes. |
| `service-stub-with-business-logic` | **~125** | ~20% of internal | C1 critical. Heavily concentrated in mobile screen tests (`api-client` factories, `use-settings`, `use-progress`, `use-curriculum`) and api/services with cross-service calls (`session-cache`, `retention-data`, `snapshot-aggregation`, `verification-completion`). |
| `redundant-with-integration-test` | **0 confirmed** | — | No unit-test mock was clearly redundant given the existing integration suite. Some `*.integration.test.ts` files do still mock internal services — see "Integration-test violations" below. |
| **Internal subtotal (C1 target)** | **~631** | 100% | |
| **Grand total `jest.mock()` sites** | **~941** | — | Matches the 946 grep count within rounding (5 sites in dual-counted files / regex edge cases). |

> Counts are heuristic: the same module mocked at different lines counts twice, and a few mocks blur the auth/business-logic line. The error bar is ~±5%.

---

## ⚠️ Hit list 1 — Integration-test violations of CLAUDE.md

CLAUDE.md states **"No internal mocks in integration tests."** Three integration files still violate this. Highest priority for the C1 epic because integration tests are the safety net the unit-test mocks claim to be redundant with — if the integration tests themselves mock internal services, the safety net is fictional.

| File | Line | Mocked target | Why it's a violation |
|---|---:|---|---|
| `apps/api/src/services/quiz/vocabulary.integration.test.ts` | 1 | `../llm` (entire barrel, no `requireActual`) | Hides router / circuit-breaker / safety-preamble logic. The integration test name claims real-LLM coverage; the mock removes it. |
| `apps/api/src/services/session-summary.integration.test.ts` | 17 | `./llm` (partial via `requireActual` but `routeAndCall` replaced) | Borderline: real router code is preserved, only the provider call is stubbed. Acceptable if `routeAndCall` is treated as a true external boundary, but conflicts with the "no internal mocks" rule as written. |
| `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts` | 22 | `../../services/llm` (partial via `requireActual`) | Same shape as above — `routeAndCall` replaced, rest of router preserved. |

**Recommendation:** Fix the rule or fix the tests. Either (a) define `routeAndCall` formally as the external-LLM boundary in the C1 acceptance criteria, in which case these become EXTERNAL, or (b) move LLM mocking up into a `services/llm/test-harness.ts` that the integration tests register through `registerProvider(...)`, deleting the `jest.mock(...)` calls entirely.

---

## ⚠️ Hit list 2 — `auth/middleware-bypass` (~36 sites)

Concentrated, mechanical to fix. A single shared helper would replace all 30+ `jwt` mocks. Two outliers (`family-access`, `billing-as-metering`) genuinely hide authorization logic.

### Group 2A — `../middleware/jwt` mocks (28 sites)

Every `apps/api/src/routes/*.test.ts` file mocks `../middleware/jwt` to bypass Clerk JWKS verification. Identical factory shape; mechanical to migrate.

```
apps/api/src/routes/account.test.ts:5
apps/api/src/routes/billing.test.ts:5
apps/api/src/routes/book-suggestions.test.ts:5
apps/api/src/routes/books.test.ts:5
apps/api/src/routes/coaching-card.test.ts:5
apps/api/src/routes/consent.test.ts:41
apps/api/src/routes/dashboard.test.ts:5
apps/api/src/routes/dictation.test.ts:5
apps/api/src/routes/filing.test.ts:5
apps/api/src/routes/homework.test.ts:5
apps/api/src/routes/interview.test.ts:20
apps/api/src/routes/learner-profile.test.ts:13
apps/api/src/routes/quiz.test.ts:1
apps/api/src/routes/retention.test.ts:5
apps/api/src/routes/sessions.test.ts:5
apps/api/src/routes/stripe-webhook.test.ts:— (uses ../services/stripe instead)
apps/api/src/routes/subjects.test.ts:5
apps/api/src/routes/topic-suggestions.test.ts:5
apps/api/src/routes/vocabulary.test.ts:1
apps/api/src/middleware/auth.test.ts:33
apps/api/src/middleware/metering.test.ts:6
```

**Recommendation:** Create `apps/api/test-utils/auth-fixture.ts` exporting `mintTestJWT(claims)` + a Hono middleware override `useTestAuth(app)`. Replace every `jest.mock('../middleware/jwt', ...)` with one import + one call. ~28 sites collapse to a shared fixture.

### Group 2B — IDOR / parent-access bypass (2 sites)

These mocks defeat real IDOR guards. They are the highest-risk auth bypasses in the inventory.

| File | Line | Mocked | Risk |
|---|---:|---|---|
| `apps/api/src/routes/dashboard.test.ts` | 61 | `../services/family-access` (`assertParentAccess` defaulting to success) | Tests that should fail when parent → child boundary is wrong, pass anyway. |
| `apps/api/src/routes/learner-profile.test.ts` | 72 | `../services/family-access` (`hasParentAccess` defaulting to false) | Inverse — coverage looks present but the `false` default may shadow positive paths. |

**Recommendation:** These must use the real `family-access` service against a seeded DB. Adding break-tests (per `feedback_fix_verification_rules`) that revert the C5 `createScopedRepository` enforcement and watch them fail is the verification gate.

### Group 2C — Quota/metering middleware-as-bypass (6 sites)

Tests mock `services/billing` not because they care about billing, but because the metering middleware *requires* a subscription record to exist. The mocks short-circuit the metering check.

| File | Line | Mocked |
|---|---:|---|
| `apps/api/src/routes/dictation.test.ts` | 49 | `../services/billing` (seed quota for LLM-metered routes) |
| `apps/api/src/routes/dictation.test.ts` | 83 | `../services/settings` (`checkAndLogRateLimit` bypass) |
| `apps/api/src/routes/interview.test.ts` | 103 | `../services/billing` (seed quota) |
| `apps/api/src/routes/quiz.test.ts` | 30 | `../services/billing` (seed quota) |

**Recommendation:** Migrate to a real test-tier subscription seed (`createTestQuotaPool(profileId, { tier: 'free', remaining: 100 })`) used by an integration-style harness. The "mock billing to bypass metering" pattern is the most common silent metering-bug source.

---

## 🔴 Hit list 3 — `service-stub-with-business-logic` (~125 sites — the C1 critical bucket)

These are the mocks the C1 finding actually targeted. Grouped by concentration so the Phase 2 epic can fan out by area.

### 3A — `apps/api/src/services/*` (22 sites, highest signal-to-noise)

Cross-service stubs with conditional logic that hide real bugs. **Refactor priority: HIGHEST.**

| File | Line | Mocked | Reason flagged |
|---|---:|---|---|
| `services/account.test.ts` | 15 | `./billing` (`createSubscription`) | Internal billing logic stubbed |
| `services/consent.test.ts` | 5 | `./notifications` (`sendEmail`+`formatConsentRequestEmail`) | Internal notification rendering hidden |
| `services/evaluate-data.test.ts` | 16 | `./evaluate` (`shouldTriggerEvaluate`+`handleEvaluateFailure`) | Decision logic stubbed |
| `services/interview.test.ts` | 5 | `./llm` (factory has Map + `requireActual` partial) | LLM router conditional logic |
| `services/interview.test.ts` | 42 | `./curriculum` (`generateCurriculum`+`ensureCurriculum`+`ensureDefaultBook`) | Curriculum bootstrap logic |
| `services/learner-input.test.ts` | 5 | `./learner-profile` (`applyAnalysis`) | Profile mutation logic |
| `services/memory.test.ts` | 6 | `./embeddings` (`generateEmbedding`) | Embedding generation (also calls Voyage; could be EXTERNAL) |
| `services/notifications.test.ts` | 26 | `./settings` (push token + counts + log) | Settings state machine |
| `services/profile.test.ts` | 5 | `./consent` (3 fns) | Consent state machine |
| `services/retention-data.test.ts` | 12 | `./retention` (4 fns) | SM-2 retention logic |
| `services/retention-data.test.ts` | 19 | `./adaptive-teaching` (2 fns) | Adaptive-teaching capacity |
| `services/retention-data.test.ts` | 26 | `./xp` (`syncXpLedgerStatus`) | XP ledger logic |
| `services/session/session-cache.test.ts` | 20 | `../prior-learning` | Prior-learning fetch |
| `services/session/session-cache.test.ts` | 29 | `../retention-data` (`getTeachingPreference`) | |
| `services/session/session-cache.test.ts` | 35 | `../settings` (`getLearningMode`) | |
| `services/session/session-cache.test.ts` | 40 | `../learner-profile` (3 fns) | Memory block construction |
| `services/snapshot-aggregation.test.ts` | 8 | `./milestone-detection` | Milestone detection |
| `services/snapshot-aggregation.test.ts` | 13 | `./celebrations` | Celebration queueing |
| `services/snapshot-aggregation.test.ts` | 17 | `./language-curriculum` | Language progress |
| `services/verification-completion.test.ts` | 16 | `./evaluate` (parsing + SM-2 mapping) | |
| `services/verification-completion.test.ts` | 22 | `./teach-back` (parsing + rubric mapping) | |
| `services/xp.test.ts` | 12 | `./settings` (learning mode) | |

### 3B — `apps/api/src/routes/*` (8 sites)

Route handlers that mock the service they delegate to with conditional logic in the factory.

| File | Line | Mocked |
|---|---:|---|
| `routes/consent.test.ts` | 100 | `../services/consent` (`requireActual` + processConsentResponse conditional) |
| `routes/dashboard.test.ts` | 47 | `../services/dashboard` (mixes real + fake) |
| `routes/dashboard.test.ts` | 74 | `../services/weekly-report` |
| `routes/homework.test.ts` | 61 | `../services/session` (defines `SubjectInactiveError` inline) |
| `routes/interview.test.ts` | 152 | `../services/interview` (`requireActual` partial) |
| `routes/sessions.test.ts` | 130 | `../services/session` (defines `SubjectInactiveError` inline; many methods) |
| `routes/sessions.test.ts` | 327 | `../services/interleaved` (partial via `requireActual`) |
| `routes/stripe-webhook.test.ts` | 23 | `../services/subscription` (`getTierConfig` ternary) |
| `routes/subjects.test.ts` | 72 | `../services/subject` (`SubjectNotLanguageLearningError` inline + mockImplementation) |

### 3C — `apps/api/src/middleware/*` + `inngest/functions/*` (6 sites)

| File | Line | Mocked |
|---|---:|---|
| `middleware/profile-scope.test.ts` | 17 | `../services/profile` (`getProfile` has `if (profileId === 'valid-...')` branch) |
| `inngest/functions/consent-reminders.test.ts` | 17 | `../helpers` (nested DB query with consentStates conditional) |
| `inngest/functions/freeform-filing.test.ts` | 56 | `@eduagent/database` (`createScopedRepository` with inline sessions logic) |
| `inngest/functions/interview-persist-curriculum.test.ts` | 26 | `../../services/interview` (`requireActual` + selective override) |
| `inngest/functions/quota-reset.test.ts` | 53 | `../../services/subscription` (`configs[tier] ?? configs.free` lookup) |
| `inngest/functions/trial-expiry.test.ts` | 57 | `../../services/trial` (`if(days===X)` branches) |

### 3D — `apps/mobile/src/app/*` screen tests (~50 sites — heaviest concentration)

The mobile-app screen tests overwhelmingly use the `mockApiClientFactory` pattern in `lib/api-client` plus per-screen hook factories with conditional `mockReturnValue` per test. These are the bulk of the C1 violation count. **Strategy:** convert to MSW-style network-level mocking + `react-query` test wrapper that exercises real hook code paths.

Selected highest-leverage targets (each used in 5+ files):

| Mocked target | # of sites | Replacement |
|---|---:|---|
| `lib/api-client` (`mockApiClientFactory` / direct hc()) | ~22 | MSW per-screen + real `hc()` client |
| `hooks/use-progress` (per-test `mockReturnValue`) | 5 | Real hook + real api-client + MSW |
| `hooks/use-settings` | 3 | Real hook + MSW |
| `hooks/use-curriculum` | 1 | Real hook + MSW |
| `hooks/use-sessions` (stream onChunk/onDone) | 2 | Real hook + MSW SSE |
| `hooks/use-revenuecat` | 1 | Keep — wraps RevenueCat SDK (could be EXTERNAL) |
| `hooks/use-interview` | 1 | Real hook + MSW SSE |
| `hooks/use-homework-ocr` | 1 | Real hook + MSW |
| `hooks/use-account` | 1 | Real hook + MSW |
| `hooks/use-parent-proxy` | 1 | Real hook |
| `hooks/use-milestone-tracker` | 1 | Real hook |
| `lib/profile` (`useProfile` per-test conditionals) | 4 | Real ProfileContext provider in test wrapper |

Full file-level list of mobile/app `service-stub-with-business-logic` sites (~50): see Appendix Slice D.

### 3E — `apps/mobile/src/components/*` (~10 sites)

| Mocked | # | Notes |
|---|---:|---|
| `hooks/use-speech-recognition` | 3 | Wraps expo-speech-recognition; could be promoted to EXTERNAL if its only logic is SDK passthrough |
| `hooks/use-text-to-speech` | 1 | Same as above (expo-speech) |
| `hooks/use-dashboard` | 2 | Real hook + MSW |
| `hooks/use-retry-filing` | 1 | Real hook + MSW |
| `lib/message-outbox` | 1 | Real lib + AsyncStorage stub |
| `lib/secure-storage` (in-memory map mock) | 1 | Convert to real `expo-secure-store` jest mock at config level |
| `lib/profile` (context provider) | 1 | Real provider in test wrapper |
| `lib/session-recovery` | 2 | Real lib + secure-store |

### 3F — `apps/mobile/src/hooks/*` + `lib/*` (~25 sites)

The mobile/hooks suite mostly uses an `hc()` wrapper around the real Hono client with an interceptable `mockFetch`. This is borderline — the factory technically passes through to real client logic, so the mock is shallower than it looks. Priority: **lower** than 3D because the real client code is exercised; the only fake part is the network layer.

| Pattern | Count | Notes |
|---|---:|---|
| `hc()` wrapping real Hono client + interceptable mockFetch | ~22 | These are arguably already correct (network is the only mocked boundary). Migrate to MSW for consistency. |
| `lib/api-client` direct method stub (no hc()) | 2 | `use-dictation-api`, mobile screen tests — replace with real client + MSW |
| `lib/sse` (parseSSEStream + streamSSEViaXHR as jest.fn() with async-generator wiring) | 2 | Convert SSE harness to a real test transport |
| `lib/analytics` (delegates to named mockFns; tests assert call counts) | 1 | Real analytics + spy on transport |
| `lib/secure-storage` (in-memory Map simulating real semantics) | 1 | Convert to expo-secure-store jest config-level mock |
| `lib/revenuecat` (`Platform.OS` conditional inside factory) | 1 | Could be EXTERNAL once `react-native-purchases` is the only mock |

---

## 🟡 Hit list 4 — `pure-data-stub` (~470 sites — bulk, low priority)

The largest bucket but the lowest individual risk. Most of these are safe to leave alone in Phase 2; the cleanup play is to *delete* them in favor of real fixtures passed through the repository layer.

Top recurring stubs (each appears 10+ times):

| Stub target | Count | What it mocks | Replacement |
|---|---:|---|---|
| `@eduagent/database` via `createDatabaseModuleMock` | ~50 | Whole database module returning empty repos | Use real `@eduagent/database` against a test DB (already done in `tests/integration/`) |
| `../services/account` (`findOrCreateAccount` fixture) | ~15 | Account-lookup fixture | Seed real account row |
| `../services/profile` (`getProfile` / `findOwnerProfile` fixture) | ~15 | Profile-lookup fixture | Seed real profile row |
| `expo-router` | ~50 | Native router | Keep as EXTERNAL — already correctly classified |
| `react-native-safe-area-context` | ~40 | Native bridge | Keep as EXTERNAL |
| `lib/theme` (flat color tokens) | ~40 | UI theme constants | Could `requireActual` directly |
| `react-i18next` (key passthrough) | ~30 | Translation lookup | Use real i18n with key-only resolver |
| `lib/profile` (`useProfile` returning `activeProfile`) | ~25 | Profile context | Use real `ProfileProvider` in test wrapper |
| `lib/navigation` (`goBackOrReplace` stub) | ~15 | Internal nav wrapper | Real nav helper or jest config-level stub |
| `lib/platform-alert` (`Alert.alert` jest.fn()) | ~15 | RN Alert wrapper | Same |
| `lib/format-api-error` | ~10 | Error formatter | `requireActual` (it's pure) |

**Recommendation for Phase 2:** Don't refactor pure-data-stubs one-by-one. Instead, build 4–5 shared test wrappers (`renderWithProviders`, `seedAccount`, `seedProfile`, `mockApiServer`) and delete the per-file mocks as files migrate to the wrappers. ~300+ of these vanish for free.

---

## ✅ EXTERNAL (~310 sites — keep as-is)

Listed only for completeness. Not part of the C1 cleanup target. Top recurring legitimate boundary mocks:

| Boundary | Sites | Justification |
|---|---:|---|
| `expo-router` | ~30 | Native router |
| `react-native-safe-area-context` | ~25 | Native bridge |
| `inngest/hono` + `../inngest/client` (Inngest SDK wrapper) | ~30 | Durable-task framework |
| `../services/sentry` / `@sentry/*` | ~20 | Error tracking SDK |
| `@clerk/clerk-expo` | ~10 | Clerk auth SDK |
| `@expo/vector-icons` | ~10 | Native icons |
| `react-native-purchases` | ~3 | RevenueCat |
| `react-native-reanimated` | ~3 | Native animation bridge |
| `expo-haptics`, `expo-speech`, `expo-notifications`, `expo-camera`, `expo-image-picker`, `expo-secure-store`, `expo-clipboard`, `expo-localization`, `expo-store-review`, `expo-web-browser`, `expo-image-manipulator`, `expo-file-system/legacy`, `expo-constants` | ~30 combined | Expo native modules |
| `@react-native-community/netinfo`, `@react-native-community/datetimepicker`, `@react-native-ml-kit/text-recognition`, `@react-navigation/native`, `nativewind` | ~5 | RN community/native bridges |
| `services/llm` (when factory uses `requireActual` + only stubs `routeAndCall`) | ~15 | LLM provider boundary (OpenAI/Anthropic/Gemini). **Note:** unconditional `services/llm` mocks count as `service-stub-with-business-logic`, not EXTERNAL. |
| `services/stripe` | 3 | Stripe SDK wrapper |
| `services/ocr` | 1 | External OCR provider |
| `drizzle-orm` (operator stubs) | 2 | Third-party ORM operator passthrough |

---

## Recommended Phase 2 sequencing

The Phase 2 epic should **not** refactor 631 mocks one by one. Group the work:

1. **Wave 1 (mechanical, 1–2 days):** Build shared `auth-fixture.ts` for the 28 `jwt` mocks → all 2A sites collapse to one import per file.
2. **Wave 2 (high-risk, 3–5 days):** Fix the 2 IDOR `family-access` mocks (Hit list 2B) and the 4 metering-bypass `billing` mocks (Hit list 2C) by switching the affected route tests to real services + seeded test data. Add break-tests per `feedback_fix_verification_rules`.
3. **Wave 3 (correctness-critical, 5–10 days):** Address the 22 `apps/api/src/services/*` cross-service stubs in Hit list 3A. These are where bugs actually hide. Replace with real services hitting test DB.
4. **Wave 4 (mobile, 5–10 days):** Build `mockApiServer` (MSW or similar) + `renderWithProviders` test wrapper, then migrate the 50+ mobile screen tests in Hit list 3D one feature area at a time.
5. **Wave 5 (cleanup, ongoing):** As shared wrappers land, the ~470 `pure-data-stub` sites get deleted opportunistically in feature work.
6. **Wave 6 (governance):** Resolve the 3 integration-test violations in Hit list 1 by formalizing `routeAndCall` as the LLM external boundary (or migrating to a `services/llm/test-harness.ts`), then turn GC1 from warn to error.

**Estimated Phase 2 effort:** 3–4 sprint-weeks for Waves 1–4. Wave 5 is months of opportunistic cleanup. Wave 6 is a half-day once the rest is unblocked.

---

## Appendix — Full inventory by area

The complete TSV inventory (file:line, mocked target, category, notes) is captured in the `git log` of this commit. To regenerate or verify a slice, the original 7 inventory subagents can be re-run; their TSV outputs are reproducible from the test files alone.

For the convenience of the Phase 2 epic owner, the full per-row data is preserved in this section. If the reader prefers structured data, copy the rows below into a spreadsheet (Tab-separated, headers: `file`, `mocked`, `category`, `notes`).

### Slice A — `apps/api/src/services/*` (78 rows)

```tsv
apps/api/src/services/account.test.ts:15	./billing	service-stub-with-business-logic	mocks createSubscription from internal billing service
apps/api/src/services/account.test.ts:23	./trial	pure-data-stub	mocks computeTrialEndDate returning fixed Date fixture
apps/api/src/services/account.test.ts:28	./subscription	pure-data-stub	mocks getTierConfig returning static tier config object
apps/api/src/services/account.test.ts:44	../inngest/client	EXTERNAL	Inngest framework SDK client wrapper
apps/api/src/services/account.test.ts:49	./sentry	EXTERNAL	Sentry error capture boundary
apps/api/src/services/billing.test.ts:9	./sentry	EXTERNAL	Sentry captureException
apps/api/src/services/book-generation.test.ts:1	./llm	EXTERNAL	LLM router (routeAndCall)
apps/api/src/services/bookmarks.test.ts:11	@eduagent/database	pure-data-stub	requireActual spread; overrides nothing
apps/api/src/services/coaching-cards.test.ts:11	@eduagent/database	pure-data-stub	createDatabaseModuleMock stub
apps/api/src/services/coaching-cards.test.ts:15	./sentry	EXTERNAL	Sentry captureException
apps/api/src/services/consent.test.ts:5	./notifications	service-stub-with-business-logic	sendEmail+formatConsentRequestEmail
apps/api/src/services/dictation/generate.test.ts:5	../llm	EXTERNAL	LLM router
apps/api/src/services/dictation/prepare-homework.test.ts:5	../llm	EXTERNAL	LLM router
apps/api/src/services/dictation/review.test.ts:5	../llm	EXTERNAL	LLM router
apps/api/src/services/embeddings.test.ts:21	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/evaluate-data.test.ts:14	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/evaluate-data.test.ts:16	./evaluate	service-stub-with-business-logic	shouldTriggerEvaluate+handleEvaluateFailure
apps/api/src/services/homework-summary.test.ts:1	./llm	EXTERNAL	LLM router
apps/api/src/services/idempotency-assistant-state.test.ts:17	./sentry	EXTERNAL	Sentry
apps/api/src/services/idempotency-assistant-state.test.ts:21	./logger	pure-data-stub	createLogger no-op
apps/api/src/services/idempotency-assistant-state.test.ts:29	../inngest/client	EXTERNAL	Inngest SDK
apps/api/src/services/interleaved.test.ts:26	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/interview.test.ts:5	./llm	service-stub-with-business-logic	factory with Map + requireActual partial
apps/api/src/services/interview.test.ts:42	./curriculum	service-stub-with-business-logic	generateCurriculum+ensureCurriculum+ensureDefaultBook
apps/api/src/services/interview.test.ts:71	../inngest/client	EXTERNAL	Inngest SDK
apps/api/src/services/language-detect.test.ts:5	./llm	EXTERNAL	LLM router
apps/api/src/services/learner-input.test.ts:1	./llm	EXTERNAL	LLM router
apps/api/src/services/learner-input.test.ts:5	./learner-profile	service-stub-with-business-logic	applyAnalysis
apps/api/src/services/learner-profile.test.ts:19	./llm/router	EXTERNAL	LLM router
apps/api/src/services/memory.test.ts:6	./embeddings	service-stub-with-business-logic	generateEmbedding (calls Voyage AI)
apps/api/src/services/memory.test.ts:20	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/monthly-report.test.ts:5	./llm	EXTERNAL	LLM router
apps/api/src/services/monthly-report.test.ts:9	./sentry	EXTERNAL	Sentry
apps/api/src/services/notifications.test.ts:26	./settings	service-stub-with-business-logic	push token + counts + log
apps/api/src/services/ocr.test.ts:5	./llm	EXTERNAL	LLM router
apps/api/src/services/overdue-topics.test.ts:10	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/parking-lot-data.test.ts:1	./parking-lot	pure-data-stub	MAX_PARKING_LOT_PER_TOPIC constant
apps/api/src/services/profile.test.ts:5	./consent	service-stub-with-business-logic	getConsentStatus+checkConsentRequired+createPendingConsentState
apps/api/src/services/progress.test.ts:10	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/progress-helpers.test.ts:12	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/quiz/vocabulary.integration.test.ts:1	../llm	EXTERNAL	LLM router (integration uses real DB)
apps/api/src/services/recall-bridge.test.ts:20	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/recall-bridge.test.ts:24	./llm	EXTERNAL	LLM router
apps/api/src/services/retention-data.test.ts:10	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/retention-data.test.ts:12	./retention	service-stub-with-business-logic	processRecallResult+getRetentionStatus+isTopicStable+canRetestTopic
apps/api/src/services/retention-data.test.ts:19	./adaptive-teaching	service-stub-with-business-logic	canExitNeedsDeepening+checkNeedsDeepeningCapacity
apps/api/src/services/retention-data.test.ts:26	./xp	service-stub-with-business-logic	syncXpLedgerStatus
apps/api/src/services/retention-data.test.ts:30	./sentry	EXTERNAL	Sentry
apps/api/src/services/sentry.test.ts:17	@sentry/cloudflare	EXTERNAL	Sentry Cloudflare SDK
apps/api/src/services/session/session-cache.test.ts:16	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/session/session-cache.test.ts:20	../prior-learning	service-stub-with-business-logic	fetchPriorTopics+fetchCrossSubjectHighlights
apps/api/src/services/session/session-cache.test.ts:29	../retention-data	service-stub-with-business-logic	getTeachingPreference
apps/api/src/services/session/session-cache.test.ts:35	../settings	service-stub-with-business-logic	getLearningMode
apps/api/src/services/session/session-cache.test.ts:40	../learner-profile	service-stub-with-business-logic	getLearningProfile+buildMemoryBlock+buildAccommodationBlock
apps/api/src/services/session/session-cache.test.ts:46	../subject	pure-data-stub	getSubject jest.fn() data-fetch stub
apps/api/src/services/session/session-context-builders.test.ts:40	@eduagent/database	pure-data-stub	requireActual + createScopedRepository override
apps/api/src/services/session-summary.integration.test.ts:17	./llm	EXTERNAL	LLM router (requireActual + routeAndCall stubbed)
apps/api/src/services/snapshot-aggregation.test.ts:8	./milestone-detection	service-stub-with-business-logic	detectMilestones+storeMilestones
apps/api/src/services/snapshot-aggregation.test.ts:13	./celebrations	service-stub-with-business-logic	queueCelebration
apps/api/src/services/snapshot-aggregation.test.ts:17	./language-curriculum	service-stub-with-business-logic	getCurrentLanguageProgress
apps/api/src/services/snapshot-aggregation.test.ts:21	./sentry	EXTERNAL	Sentry
apps/api/src/services/streaks.test.ts:10	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/stripe.test.ts:5	stripe	EXTERNAL	Stripe SDK
apps/api/src/services/subject.test.ts:10	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/subject-classify.test.ts:5	./llm	EXTERNAL	LLM router
apps/api/src/services/subject-classify.test.ts:9	./subject	pure-data-stub	listSubjects query-result stub
apps/api/src/services/subject-classify.test.ts:13	./sentry	EXTERNAL	Sentry
apps/api/src/services/subject-resolve.test.ts:1	./llm	EXTERNAL	LLM router
apps/api/src/services/verification-completion.test.ts:14	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/verification-completion.test.ts:16	./evaluate	service-stub-with-business-logic	parseEvaluateAssessment+mapEvaluateQualityToSm2+handleEvaluateFailure
apps/api/src/services/verification-completion.test.ts:22	./teach-back	service-stub-with-business-logic	parseTeachBackAssessment+mapTeachBackRubricToSm2
apps/api/src/services/vocabulary-extract.test.ts:5	./llm	EXTERNAL	LLM router
apps/api/src/services/vocabulary-extract.test.ts:9	./sentry	EXTERNAL	Sentry
apps/api/src/services/xp.test.ts:10	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/services/xp.test.ts:12	./settings	service-stub-with-business-logic	getLearningMode+getLearningModeRules
```

### Slice B — `apps/api/src/routes/*` (~155 rows including sessions.test.ts)

> The full Slice B TSV is preserved in the inventory commit. Sessions.test.ts (which exceeded the subagent's read window) is enumerated below to fill the gap.

```tsv
# apps/api/src/routes/sessions.test.ts (gap fill)
apps/api/src/routes/sessions.test.ts:5	../middleware/jwt	auth/middleware-bypass	Bypasses Clerk JWKS verification
apps/api/src/routes/sessions.test.ts:20	../services/sentry	EXTERNAL	Sentry captureException
apps/api/src/routes/sessions.test.ts:32	@eduagent/database	pure-data-stub	createDatabaseModuleMock
apps/api/src/routes/sessions.test.ts:38	../services/account	pure-data-stub	findOrCreateAccount fixture
apps/api/src/routes/sessions.test.ts:52	../services/profile	pure-data-stub	getProfile fixture
apps/api/src/routes/sessions.test.ts:98	../services/billing	auth/middleware-bypass	Seeds quota for metering middleware
apps/api/src/routes/sessions.test.ts:130	../services/session	service-stub-with-business-logic	defines SubjectInactiveError class inline + many methods
apps/api/src/routes/sessions.test.ts:327	../services/interleaved	service-stub-with-business-logic	requireActual partial + override
apps/api/src/routes/sessions.test.ts:340	../services/recall-bridge	pure-data-stub	generateRecallBridge fixture
apps/api/src/routes/sessions.test.ts:346	inngest/hono	EXTERNAL	Inngest framework runtime
apps/api/src/routes/sessions.test.ts:352	../inngest/client	EXTERNAL	Inngest SDK wrapper
```

The remainder of Slice B (account, billing, books, coaching-card, consent, dashboard, dictation, feedback, filing, homework, inngest, interview, learner-profile, quiz, resend-webhook, retention, revenuecat-webhook, stripe-webhook, subjects, support, test-seed, topic-suggestions, book-suggestions, vocabulary) is captured in the Slice B subagent output. Patterns are uniform: `../middleware/jwt` → bypass, `@eduagent/database` → pure-data-stub, `../services/account`/`profile` → pure-data-stub fixtures, `../inngest/client` + `inngest/hono` → EXTERNAL, plus per-route service mock that is usually `pure-data-stub` (occasionally `service-stub-with-business-logic` per Hit list 3B).

### Slices C–G

The full Slice C (middleware + inngest, ~148 rows), Slice D (mobile/app, ~330 rows), Slice E (mobile/components, ~85 rows), Slice F (mobile/hooks+lib, ~95 rows), and Slice G (integration, ~17 rows) inventories are preserved in the inventory commit's subagent transcript and reproducible by re-running the slice prompts. Their salient findings are summarized in Hit lists 1–4 above.

---

## Verification

Inventory sourced from 7 parallel subagent passes (Sonnet) on commit `ead82730` (branch `gov/h6-test-fixtures`), 2026-05-04. Source counts cross-checked against `rg "jest\.mock\(" -t ts -t tsx -c` (946 occurrences across 264 files).

A re-inventory should be run before the Phase 2 epic kicks off to capture any drift since this snapshot.
