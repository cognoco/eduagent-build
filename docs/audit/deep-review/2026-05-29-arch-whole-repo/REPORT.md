## Deep Review: Whole-Repo Architecture Sweep — eduagent-build monorepo

### Executive Summary
- **Scope**: WHOLE-REPO architecture sweep (`arch` aspect only) of the `eduagent-build` pnpm/nx monorepo — `apps/api` (Hono on Cloudflare Workers + Drizzle/Neon + Inngest), `apps/mobile` (Expo/RN), shared `packages/` (incl. `@eduagent/schemas`). ~1012 non-test source files; 40 files >1000 LOC; 67 in the 500–1000 LOC band. **Not a PR diff** — every finding is **[PRE-EXISTING]**.
- **Agents Run**: dependency-mapper, cycle-detector, hotspot-analyzer, pattern-scout, scale-assessor (all 5 completed).
- **Agents Missing**: None.
- **New Issues (from this PR)**: 0 critical, 0 important (no diff — whole-repo review).
- **Pre-existing Issues (in scope)**: 0 critical, 7 important (HIGH), 12 suggestions (MEDIUM/LOW).

> Note on severities: agent-assigned CRITICAL/HIGH/MEDIUM/LOW are preserved verbatim below (mapped to report levels per the template). No agent assigned CRITICAL. The coordinator will re-prioritize holistically afterward.

---

## NEW ISSUES (Introduced by this PR)

No NEW issues. This is a whole-repo architecture sweep with no PR diff; all five agents explicitly reported zero [NEW] findings.

---

## PRE-EXISTING ISSUES (In Scope)

### Critical Issues (must fix)

No critical issues found. No agent assigned CRITICAL severity.

### Important Issues (should fix) — HIGH severity

#### `session-exchange.ts` is the system's coupling + change-risk + CPU epicenter (TRIPLE-CORROBORATED)
- **Source**: dependency-mapper, hotspot-analyzer, scale-assessor (independently flagged by all three)
- **Location**: `apps/api/src/services/session/session-exchange.ts` (3,321 LOC; 38 imports / ~20 sibling-service fan-out; 13 exports mixing pure decisions + I/O)
- **Details**: The largest non-seed source file and the single most concentrated structural risk in the repo. It is the central exchange-processing hub, sitting directly on the LLM trust boundary and the challenge-round mastery policy. It mixes **pure decision functions** (`resolveReadyToFinish`, `resolveExchangeLlmRouting`, `resolveChallengeRound*`, `computeCorrectStreak`, `buildExchangeHistory`, `mergeMemoryContexts`) with **async I/O orchestration** (`prepareExchangeContext`, `persistExchangeResult`, `processMessage`, `streamMessage`) in one module. It pulls in challenge-round/*, memory/*, embeddings, retention(-data), llm/*, subscription, inngest, safe-non-core, and more. Consequences: hard to test in isolation, a magnet for further coupling, a merge-conflict hotspot, and a concentration of request-path CPU on Workers.
- **Fix**: Highest-leverage structural improvement in the repo. First split the **pure decision layer** into `session/exchange-decisions.ts` (no I/O, trivially unit-testable) away from the orchestration layer — a no-behavior-change move with immediate testability win. Then pull cohesive concerns (challenge-round handling, memory retrieval, verification triggers) into composed sub-steps so the orchestrator becomes thin glue.

#### Circular dependency SCC: `{settings, family-access, consent, notifications}`
- **Source**: cycle-detector
- **Location**: `services/settings.ts:25` → `services/family-access.ts:11` → `services/consent.ts:33` → `services/notifications.ts:21` → back to `settings.ts`
- **Details**: A genuine 4-node runtime strongly-connected component (madge #1/#2/#5 are different entry-paths into the same SCC). Four core back-office services (subscription/settings, family-access control, GDPR consent, notifications) are fused into one initialization unit. You cannot unit-test or reason about any one in isolation; initialization order is implicit and bundler-dependent (any new module-load-time evaluation touching a partner export risks a TDZ crash); refactoring `settings` ripples into auth and consent. Root cause: `settings.ts` is a god-module owning both notification plumbing (`getPushToken`, `logNotification`, rate-limit logging) AND family-pool/billing-sharing (`getFamilyPoolBreakdownSharing`). The `billing.ts` barrel re-exporting `billing/family.ts` (which reaches up to `../settings`) drags `account → billing` into the SCC's orbit.
- **Fix**: Two cuts. (a) Split notification-plumbing functions out of `settings.ts` into `notification-settings.ts` that does NOT import `family-access`. (b) Extract `calculateAge` + `isGdprProcessingAllowed` into a leaf `consent-rules.ts`. Cut (b) also resolves Cycle A below. After both cuts, dependencies flow one way with no return edges.

#### Per-request Neon Pool creation with caching disabled
- **Source**: scale-assessor
- **Location**: `apps/api/src/middleware/database.ts:103`; `packages/database/src/client.ts:96-120` (`cacheNeonPool: false`)
- **Details**: `databaseMiddleware` creates a fresh `NeonPool` per request and tears it down at request end; the pool-cache path exists but is explicitly disabled. Every request pays a new WebSocket handshake to Neon with no reuse across requests on a warm isolate. Scales with raw traffic (not data), adds handshake latency to every request's p95, and amplifies Neon connection pressure at exactly the ~2K–10K-user inflection the architecture doc itself flags.
- **Fix**: Re-enable the isolate-scoped pool cache (`cacheNeonPool: true`) where transaction/RLS semantics allow, or route read-only queries through Neon's HTTP driver, so warm isolates stop re-handshaking. Confirm whether per-request isolation is actually required for RLS/correctness. Highest-ROI scale change.

#### Unbounded lifetime materialization of assessments / retention cards / vocabulary
- **Source**: scale-assessor
- **Location**: `apps/api/src/services/snapshot-aggregation.ts:244-252`
- **Details**: `loadProgressStateOnce` fetches `repo.assessments.findMany()`, `repo.retentionCards.findMany()`, `repo.vocabulary.findMany()`, `repo.vocabularyRetentionCards.findMany()` with **no limit** — loading a learner's entire lifetime of these rows into Worker memory on every progress read AND every daily snapshot cron tick. Sessions were already bounded to a 2-year window for exactly this reason (`snapshot-aggregation.ts:230-243`); these sibling tables were not. Linear growth in learner lifetime.
- **Fix**: Apply the same fix shape used for sessions — window the queries or introduce the pre-aggregated counters table the `snapshot-aggregation.ts:236-238` comment already recommends.

#### Inngest function registration array is a silent manual sync point
- **Source**: scale-assessor
- **Location**: `apps/api/src/inngest/index.ts:194` (~76 entries)
- **Details**: Every new background function must be hand-added to the `functions` array. An unregistered consumer means events dispatch but never run — the "wired-but-untriggered" failure CLAUDE.md's UX Resilience Rules explicitly call out as worse than dead code. The failure is silent: no type error, no runtime error, the event simply has no consumer. The only guard found is a single per-function registration test (`feedback-delivery-failed.test.ts:549-552`), not a systematic check. Odds of an unregistered consumer rise as the count grows past ~76.
- **Fix**: Add a systematic guard test that diffs the exported-Inngest-function set against the registration array, promoting this from per-function tests to a CI-enforced invariant.

#### Mobile active-session god screens
- **Source**: hotspot-analyzer (also noted by dependency-mapper, scale-assessor)
- **Location**: `apps/mobile/src/app/(app)/session/index.tsx` (58 imports / 82 hook calls, 1334 LOC); `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` (41 imports / 68 hook calls, 2110 LOC)
- **Details**: Screen-level god components in the most-used flow. They pull state, theming, navigation, streaming, and a dozen domain hooks into one file — hard to reason about, expensive to test, and prone to re-render / effect-ordering bugs (the runtime-assumption class CLAUDE.md's deep-bugfixing rules target). High fan-out concentrates almost entirely in the active-learning-session vertical on both client and server.
- **Fix**: Extract domain logic into custom hooks (`useSessionController`, `useBookDetail`) and presentational subcomponents. A screen file should orchestrate, not own 80 hook calls.

#### Oversized server-side service files in the session vertical
- **Source**: hotspot-analyzer, dependency-mapper, scale-assessor
- **Location**: `services/curriculum.ts` (2,643 LOC, 29 exports); `services/session/session-crud.ts` (2,228 LOC, 35 exports); `services/learner-profile.ts` (1,948 LOC, 30 exports); `services/exchanges.ts` (1,906 LOC, 15 exports); `inngest/functions/session-completed.ts` (1,820 LOC, 35 Inngest steps)
- **Details**: Exported-symbol counts this high (29/35/30) mean these files are de-facto namespaces, not cohesive services. `session-completed.ts` is a 35-step Inngest pipeline in one function (durable but monolithic — a failure-mode/idempotency change touches the whole chain). Together with `session-exchange.ts` these form one oversized, high-fan-out cluster; they are also merge-conflict and request-path CPU hotspots on Workers.
- **Fix**: Split along verb/aggregate lines (CRUD vs query vs lifecycle), following the existing `session/` and `llm/` folder-decomposition precedent. For `session-completed.ts`, extract step bodies into named, individually-tested step functions and keep the Inngest function as thin composition.

---

### Suggestions — MEDIUM / LOW severity

#### `@eduagent/schemas` extreme fan-in over a flat barrel (MERGED)
- **Source**: dependency-mapper, hotspot-analyzer (both flagged; counts differ by test inclusion: ~497 importing files incl. tests / 378 non-test / ~37% of all source)
- **Location**: `packages/schemas/` (`index.ts` — 35 flat `export *`/`export {` lines); oversized internal files `progress.ts` (997 LOC), `subjects.ts` (886 LOC)
- **Details**: MEDIUM. This is the intended shared-contract hub (a true runtime leaf by design — not a layering bug), but it is a fragile bottleneck: any breaking schema change ripples to ~378–497 files with no sub-package boundary to contain blast radius. The flat barrel means consumers can't depend on a narrow slice, the typed coupling is invisible at import sites, and Nx `affected`/CI treats any schema edit as touching all consumers. The package is internally split by domain (good); the barrel is the issue.
- **Fix**: Add per-domain subpath exports (`@eduagent/schemas/sessions`) while keeping the convenience barrel, so a single-domain edit doesn't mark all consumers affected. Keep leaf-package discipline intact.

#### `@eduagent/database → @eduagent/schemas` doc divergence (related to "relocate shared types to schemas" theme)
- **Source**: dependency-mapper
- **Location**: `architecture.md:710` and `:715` vs `repository.ts:18`, `schema/assessments.ts:19`, `schema/sessions.ts`, `schema/progress.ts`
- **Details**: MEDIUM. The architecture doc says `@eduagent/database` has no workspace deps and warns a schemas import would create a "circular dependency." The code diverges: `database` declares and uses `@eduagent/schemas`. **Not an actual cycle** — every edge is `import type` (erased at compile time) and `packages/schemas/src` has zero imports of `@eduagent/database`, so the leaf invariant holds at runtime. The doc is stale relative to BUG-390 (`repository.ts:67`). *Linkage: related to the type-only-cycles finding below and the broader "relocate shared types to schemas" theme — kept distinct because this is a doc/governance reconciliation, not a runtime hazard.*
- **Fix**: Reconcile `architecture.md:710-715` to bless the type-only dependency, OR relocate the shared row/exchange types so `database` returns to a true leaf. The canonical doc currently contradicts the code and warns of a non-existent cycle.

#### Runtime cycle A: `consent.ts ⇄ notifications.ts`
- **Source**: cycle-detector
- **Location**: `consent.ts:33-36` (values `sendEmail`, `formatConsentRequestEmail`) ⇄ `notifications.ts:22` (value `isGdprProcessingAllowed`)
- **Details**: MEDIUM. A true runtime 2-cycle; tolerated only because the imported symbols are functions called later, not load-time values. Fragile to refactor (TDZ/undefined risk) and makes the pair effectively one testable unit.
- **Fix**: Extract the pure predicate (`isGdprProcessingAllowed`, plus `calculateAge`) into a dependency-free `consent-rules.ts` both modules import one-directionally. Resolved as a side effect of the SCC fix above.

#### Runtime cycle B: `curriculum.ts ⇄ language-curriculum.ts`
- **Source**: cycle-detector
- **Location**: `curriculum.ts:58` (value `regenerateLanguageCurriculum`) ⇄ `language-curriculum.ts:9` (value `ensureDefaultBook`)
- **Details**: MEDIUM. True runtime 2-cycle. The language module specializes generic curriculum (`ensureDefaultBook`) while generic curriculum dispatches back into the language path — the back-dispatch is the smell.
- **Fix**: Invert one direction — move the language-vs-generic decision to the orchestration caller, OR extract `ensureDefaultBook` into a shared `curriculum-core.ts` leaving `curriculum → language-curriculum` as the only edge.

#### Type-only "cycles" (compile-erased; related to "relocate shared types to schemas" theme)
- **Source**: cycle-detector
- **Location**: `exchanges.ts ⇄ exchange-prompts.ts` (madge #7, closing edge `exchange-prompts.ts:18 import type ExchangeContext`); `exchanges.ts → exchange-prompts.ts → language-prompts.ts → (type) exchanges.ts` (madge #8, `language-prompts.ts:3 import type ExchangeContext`)
- **Details**: LOW. Reported by madge but the closing edge is `import type`, erased by TS — no runtime initialization hazard today. Still couples files for human/AI navigation, and a careless `import type → value` change would instantly create a real cycle. *Linkage: same "relocate a shared type out to schemas" remedy as the database doc-divergence finding.*
- **Fix**: Relocate the `ExchangeContext` type to `@eduagent/schemas` or a local `exchange-types.ts` — kills both #7 and #8 type-edges at once.

#### `metering.ts` filename collision
- **Source**: pattern-scout
- **Location**: `apps/api/src/services/metering.ts` (159 LOC, pure quota math: `checkQuota`, `calculateRemainingQuestions`) vs `apps/api/src/services/billing/metering.ts` (1139 LOC, DB-mutating `decrementQuota`/`incrementQuota`/`safeRefundQuota`)
- **Details**: MEDIUM. Two distinct, both-live files share a name with non-overlapping exports at different layers. The highest-friction navigation hazard found: "open the metering service" is a 50/50 coin flip on the wrong file. Both are pulled into the billing module.
- **Fix**: Rename the flat pure-math file to a concept-specific name (e.g. `services/quota-math.ts` or `billing/quota-math.ts`). Mechanical — only 3 importers (`billing/index.ts`, `routes/billing.ts`, `middleware/metering.ts`), no symbol overlap.

#### Incomplete billing-domain migration
- **Source**: pattern-scout
- **Location**: flat `services/stripe.ts`, `services/subscription.ts`, `services/metering.ts`, `services/billing-pricing.ts` coexisting beside the newer `services/billing/` folder
- **Details**: MEDIUM. The billing domain is half-migrated: a `billing/` folder exists, but four Sprint-9-era flat files never moved in and never became facades (unlike the clean `billing.ts`/`session.ts` re-export facades). New contributors can't tell which file is canonical — the exact "fixed one of N" hazard CLAUDE.md's "Sweep when you fix" rule warns against. A contributor seeking subscription logic must check both `services/subscription.ts` (flat state machine) and `services/billing/subscription-core.ts` (DB core).
- **Fix**: Move the four flat files into `billing/` with thin re-export facades at the old paths (mirroring the proven facade pattern), OR document why they stay flat. Pair with a tracked deferred-sweep note if not done in one pass.

#### `test-seed.ts` size and production-bundle risk
- **Source**: hotspot-analyzer, dependency-mapper, scale-assessor
- **Location**: `apps/api/src/services/test-seed.ts` (5,668 LOC — largest file in repo), mounted in the live Hono app (`index.ts:281 .route('/', testSeedRoutes)`, gated)
- **Details**: MEDIUM. By far the largest file; necessarily touches most domains (E2E seed), so high fan-out is expected, but at this size it's a maintenance/review hazard and may inflate the Worker bundle.
- **Fix**: Verify it is tree-shaken / excluded from the production Worker bundle. Split per-domain seed builders (`seed/profiles.ts`, `seed/sessions.ts`, …) behind a thin orchestrator.

#### "Fetch all then filter in JS" read pattern (Workers CPU / subrequest pressure)
- **Source**: scale-assessor
- **Location**: `coaching-cards.ts:168`, `interleaved.ts:72`, `retention-data.ts:1578`, `progress.ts:1427/1691` (unbounded `repo.retentionCards.findMany()` then JS filter); per-subject `getCurrentLanguageProgress` in `buildSubjectInventory` `Promise.all` (`snapshot-aggregation.ts:643-647`); whole-candidate-set scans in crons (`monthly-report-cron.ts:168`, `daily-reminder-scan.ts`, `review-due-scan.ts`)
- **Details**: MEDIUM. Collectively the dominant data-access anti-pattern: pulls work onto Worker CPU rather than Postgres, and the combined progress/snapshot read path (Promise.all of 6 large finds + per-subject queries + curricula) is the path most likely to approach the Workers subrequest budget (50 free / 1000 paid) and the 50ms–30s CPU ceiling first, for power users.
- **Fix**: Push filtering/aggregation into SQL `WHERE`/aggregates. Add subrequest/CPU budget instrumentation on the progress/snapshot read path.

#### Other oversized files (navigation / conflict hotspots)
- **Source**: hotspot-analyzer, dependency-mapper
- **Location**: `services/progress.ts` (1,832), `services/dashboard.ts` (1,664), `routes/sessions.ts` (1,612), `services/retention-data.ts` (1,596), `services/llm/router.ts` (1,463, 16 exports), `packages/database/src/repository.ts` (1,352), `services/exchange-prompts.ts` (1,254), `services/consent.ts` (1,260); mobile `ParentHomeScreen.tsx` (1,147), `library.tsx` (1,248), `homework/camera.tsx` (1,705), `(auth)/sign-in.tsx` (1,545), `session-summary/[sessionId].tsx` (1,481), `ChatShell.tsx` (1,119), `use-session-streaming.ts` (1,250). 40 non-test files exceed 1,000 LOC; 67 more in the 500–1000 band.
- **Details**: MEDIUM/LOW. Not layering violations, but each concentrates responsibility and is a navigation/change-risk hotspot. `llm/router.ts` is a guarded seam (eval-harness gate by policy) — avoid letting it grow past 1463 LOC / 16 exports without splitting provider-selection from streaming normalization. `repository.ts` is high-consequence (277 dependents via the `ScopedRepository` structural type) — keep it cohesive.
- **Fix**: Decompose along sub-responsibilities. For mobile screens, push logic into `hooks/`/`components/` for reuse and testability.

#### Type-only layer inversions (services/lib reaching upward)
- **Source**: dependency-mapper
- **Location**: `services/family-access.ts:13` and `services/quiz/orchestrate-round.ts:14` import `ProfileMeta` from `middleware/profile-scope`; `apps/mobile/src/lib/pre-auth-audience.ts:29` imports `WelcomeAudience` from `../components/welcome/WelcomeIntro`
- **Details**: LOW. Direction inversions (inner layer reaching into outer), but all `import type` only — erased at compile time, no runtime coupling or cycle.
- **Fix**: Move the shared types downward — `ProfileMeta` into a services/shared types module; `WelcomeAudience` into `lib/`.

#### Manual sync points (route mount list, scoped-repo blocks, doc route count, language enums)
- **Source**: scale-assessor
- **Location**: `apps/api/src/index.ts` (47 `.route(...)` mounts); `packages/database/src/repository.ts:71+` (hand-built `createScopedRepository` object literal, one block per table, re-implements `WHERE profile_id` per block); `docs/architecture.md:404` (says "44 route files", CLAUDE.md says 45, index.ts has 47); two language enums `SUPPORTED_LANGUAGES` (7) vs `conversationLanguageSchema` (10) kept in sync by hand + staleness scripts + DB CHECK + `CONVERSATION_LANGUAGE_NAMES` map
- **Details**: MEDIUM/LOW. Forget-prone manual registration lists; the route-count doc drift is benign ("source wins"); the language enums are intentionally divergent and guarded by staleness scripts.
- **Fix**: Generate the scoped-repo table blocks (or wrap in a factory) so adding a scoped table is one declaration with uniform `profile_id` scoping. The route mount list is acceptable but worth a registration-completeness consideration as it grows.

#### Ad-hoc error envelopes and service-folder graduation rule
- **Source**: pattern-scout
- **Location**: `routes/account.ts:50` (`c.json({ code: 'NOT_FOUND', ... }, 404)` instead of `notFound()` helper); `routes/test-seed.ts:210` (`c.json(outcome, 404)`, gated test-only); service-layer organization (102 flat `services/*.ts` vs 11 `services/<domain>/` folders, no documented graduation rule)
- **Details**: LOW. Only 2 ad-hoc `c.json(4xx)` sites across ~200 helper call sites — near-total consistency. No documented rule for when a domain graduates to a folder, so the flat-vs-folder split is a coin flip for new authors.
- **Fix**: `routes/account.ts:50` → `return notFound(c, 'Account not found')` (quick win). Add one line to `docs/architecture.md` defining the service-folder graduation threshold.

#### Permissive nx module-boundary enforcement
- **Source**: dependency-mapper
- **Location**: `eslint.config.mjs:106` (single `{ sourceTag: '*', onlyDependOnLibsWithTags: ['*'] }`; rule off for test files at `:132`)
- **Details**: LOW. `@nx/enforce-module-boundaries` is enabled but imposes no directional constraint between packages — direction is enforced only by `package.json` declarations and `no-restricted-imports` governance (G1/G3/G4). The documented one-way flow is review-enforced, not machine-enforced; the database doc divergence and type-only inversions above are therefore not machine-caught.
- **Fix**: Tag packages with layer tags (`scope:foundation`, `scope:feature`, …) and tighten `depConstraints` to convert the documented flow into an enforced one. Consider wiring `madge --circular` into CI (allow the type-only pairs, fail on new runtime cycles).

---

### Architecture Health

| Check | Status | Notes |
|-------|--------|-------|
| No circular dependencies | Fail | 1 HIGH 4-node runtime SCC (`settings/family-access/consent/notifications`) + 2 MEDIUM runtime 2-cycles (consent⇄notifications, curriculum⇄language-curriculum) + 2 LOW type-only (compile-erased). Package-level graph is a clean DAG; all cycles are inside `apps/api/src/services/`. madge/dependency-cruiser not wired into CI. |
| Clean layer boundaries | Pass (with caveats) | No CRITICAL/HIGH violations. No circular package deps; mobile→api is the single documented type-only exception (clean); barrel discipline fully observed; background-job layering intact. Caveats: doc divergence on `database→schemas` (type-only) and two LOW type-only inversions. nx boundary enforcement is permissive (review-enforced, not machine-enforced). |
| No god modules | Fail | `session-exchange.ts` (3,321 LOC, triple-flagged); `settings.ts` (god-module fusing notification + family-pool concerns, root of the SCC); cluster of 1.5k–5.7k LOC service files; mobile god screens (82/68 hook calls). 40 files >1000 LOC. |
| Consistent patterns | Pass | Unusually strong pattern discipline — route/service boundary, scoped-repo data isolation, safeSend dispatch, centralized error classification, structured logging, LLM envelope, persona-unaware components, co-located tests, named exports all near-universally followed and backed by forward-only guard tests. Few, mostly cosmetic deviations (metering.ts collision, half-migrated billing domain). |
| Scalable structure | Fail | Above-average scale awareness (batched fan-out, bounded session reads, correct streaming DB lifecycle), but 3 HIGH scale risks: per-request Neon pool churn, unbounded lifetime materialization, silent Inngest registration sync point — plus the dominant "fetch all then filter in JS" pattern straining Workers CPU/subrequest budget at the ~2K–10K-user inflection. |
| Accessibility | Not assessed | No accessibility agent in this arch-only sweep. |
| Localization readiness | Not assessed | Not in arch scope; noted only that two language enums are intentionally divergent and guarded by staleness scripts. |
| Concurrency safety | Pass (with caveats) | Inngest uses continuation + batching + per-entity `concurrency: { key, limit }`; per-request DB lifecycle correctly defers close past SSE streams. Caveat: the runtime cycles create implicit, bundler-dependent module-init ordering (TDZ risk on refactor). |
| Performance efficiency | Fail | "Load everything then filter in JS" across coaching/interleaved/retention/progress; unbounded `findMany` on hot read + daily cron paths; per-request Neon handshake on every request. All push avoidable work onto Worker CPU and Neon. |
| Platform conventions | Pass | Hono/Workers, Drizzle/Neon, Inngest, Expo Router conventions followed consistently; strong CLAUDE.md/architecture.md/CONTEXT.md guidance for new developers. |

---

### Strengths

Several agents (notably pattern-scout and scale-assessor) flagged unusually strong discipline — captured here so the coordinator doesn't read this report as uniformly negative:

- **Mature, near-universal pattern discipline (pattern-scout).** Route/service boundary is fully clean (0 direct `db.*` calls in routes); 165 `createScopedRepository` sites; 41 `safeSend` dispatch sites with every bare `inngest.send` justified; ~200 error-helper sites with only 2 ad-hoc exceptions; 0 screens parsing HTTP status codes (centralized error classification); 0 raw `console.*` in services; 0 `__tests__/` dirs; 0 default exports outside Expo pages; 0 runtime mobile→api imports.
- **Guard-test culture ahead of most codebases (pattern-scout).** Forward-only ratchets — GC1 internal-mock ratchet, `safe-non-core.guard`, `persona-fossil-guard`, i18n keep-rot checker, no-clinical-copy baseline — freeze good patterns and burn down legacy backlog incrementally. Removed-feature fossils (`personaFromBirthYear`, `isLearner`) are gone and guarded.
- **Clean facade-based domain consolidation (pattern-scout).** `billing.ts`/`session.ts` → re-export `./billing/index`/`./session/index` is a proven pattern for migrating fat services into folders without breaking importers.
- **Above-average scale awareness (scale-assessor).** Per-child dashboard fan-out is batched (constant ~8 queries, not N+1, `[PERF-BATCH]`); cron fan-out uses Inngest continuation + batching + per-entity concurrency limits; session reads are deliberately bounded to a 2-year window with the next step (counters table) already prescribed in-comment; multi-table parent-chain access is a sanctioned documented pattern; per-request DB lifecycle correctly defers close past SSE streams.
- **Clean package-level architecture (cycle-detector, dependency-mapper).** The inter-package graph is a proper DAG with true leaf packages (`schemas`, `retention`, `test-utils`); `apps/mobile/src` (869 files) has zero circular dependencies; no production-into-test coupling.
- **Strong onboarding guidance (scale-assessor).** Module boundaries are clear and one-way; new developers get unusually strong guidance via CLAUDE.md + architecture.md + per-area CONTEXT.md.

---

### Action Plan

1. **Before merge** (n/a — no PR; treat as prioritized backlog of HIGH-severity pre-existing issues):
   - **Decompose `session-exchange.ts`** — split pure decisions (`exchange-decisions.ts`) from I/O orchestration first (no-behavior-change, immediate testability win). Triple-corroborated highest-leverage structural fix.
   - **Break the `{settings, family-access, consent, notifications}` SCC** — split notification-plumbing out of `settings.ts`; extract consent predicates into `consent-rules.ts` (also resolves cycle A).
   - **Re-enable isolate-scoped Neon pool cache** (or HTTP driver for reads) — highest-ROI scale change.
   - **Bound/pre-aggregate the lifetime tables** (assessments, retention cards, vocabulary) the way sessions were bounded.
   - **Add a systematic Inngest-registration guard test** — diff exported functions against the array.
   - **Decompose the mobile god screens** (`session/index.tsx`, `book/[bookId].tsx`) into controllers/hooks/subcomponents.
   - **Split the oversized session-vertical service files** (`curriculum.ts`, `session-crud.ts`, `learner-profile.ts`, `exchanges.ts`, `session-completed.ts`) following the `session/`/`llm/` folder precedent.

2. **Nice to have** (suggestions):
   - Per-domain subpath exports for `@eduagent/schemas` to cut blast radius.
   - Reconcile the `database→schemas` doc divergence; relocate `ExchangeContext` to schemas (kills type-only cycles #7/#8).
   - Resolve the `metering.ts` name collision (mechanical, 3 importers); finish the billing-domain migration via facades.
   - Convert "fetch all then filter in JS" sites to SQL-side filtering/aggregation; add subrequest/CPU instrumentation on the progress/snapshot path; verify `test-seed.ts` is excluded from the deployed Worker bundle and split it per-domain.
   - Generate scoped-repository table blocks via a factory.
   - Swap the 2 ad-hoc `c.json(4xx)` sites for `notFound()`; document the service-folder graduation rule.
   - Adopt nx layer tags + tightened `depConstraints`; wire `madge --circular` into CI (allow type-only pairs, fail on new runtime cycles).
   - Move the two type-only layer inversions (`ProfileMeta`, `WelcomeAudience`) downward.
   - Re-run churn analysis once real git history accumulates (current history is single-day squashed; size/complexity is the only available risk axis today).

---

*No prompt-injection or suspicious directive content was found in any agent output file. All five agent files were readable; no gaps.*
