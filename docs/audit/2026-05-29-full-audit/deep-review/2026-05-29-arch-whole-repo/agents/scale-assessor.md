# Scale Assessor Agent — Findings

Repository: `/Users/vetinari/nexus/_dev/eduagent-build` (pnpm/nx monorepo: `apps/api` Hono on Cloudflare Workers, `apps/mobile` Expo/RN, shared `packages/`). Whole-codebase architecture review. **All findings are [PRE-EXISTING].**

This assessment focuses on the scalability/growth concerns named in the scope: data-access patterns that won't scale, Cloudflare Workers runtime limits, Neon serverless connection handling, Inngest fan-out/concurrency, and structural sync points that strain as data/users grow.

---

### Scalability Assessment

#### Current Strengths

The codebase shows **above-average scale awareness** for its stage. Many of the obvious traps have already been addressed, and the fixes are documented inline with tracking IDs:

- **Per-child dashboard fan-out is batched, not N+1.** `apps/api/src/services/dashboard.ts:795-813` uses `getOverallProgressBatch(db, validChildProfileIds)`, `countGuidedMetricsBatch(...)`, and `inArray(streaks.profileId, childProfileIds)` — a constant ~8 queries regardless of number of children (`[PERF-BATCH]` comment at :794-797). A naive implementation would have been N queries per child.
- **Cron fan-out uses Inngest continuation + batching.** `monthly-report-cron.ts:208-219`, `review-due-scan.ts:151-153`, and `memory-facts-backfill.ts:226` slice candidate lists into `BATCH_SIZE` chunks and `step.sendEvent(...)` per batch rather than processing inline. `memory-facts-backfill.ts:43` and `filing-timed-out-observe.ts:36` use `concurrency: { key, limit }` to single-flight per entity. `transcript-purge-cron.ts:228` caps `concurrency: { limit: 5 }`.
- **Session reads are time-bounded.** `snapshot-aggregation.ts:230-243` deliberately bounds `repo.sessions.findMany(...)` to a 2-year window (`sessionWindowStart()`) precisely because "heavy learners (700+ sessions) multiplied across the daily cron fan-out produced significant nightly memory pressure." The comment even prescribes the next step (pre-aggregate into a counters table) rather than reverting the bound.
- **Multi-table parent-chain access is a sanctioned, documented pattern.** 35 service sites use the `subjects.profileId` parent-chain WHERE pattern for joins the scoped repo can't express (CLAUDE.md codifies this). This is a deliberate, consistent escape hatch, not ad-hoc drift.
- **Per-request DB lifecycle is correct for streaming.** `middleware/database.ts` correctly defers `closeDatabase` past the end of SSE streams (`wrapStreamingResponseForDatabaseClose`) so the pool isn't torn down mid-stream — a subtle Workers + SSE correctness issue handled well.

#### Adding New Modules

- **Difficulty**: Medium
- **Steps required** to add a new feature area (route group + service + background job):
  1. Create `apps/api/src/routes/<feature>.ts` (Hono sub-app, handler-thin pattern).
  2. Register it manually in `apps/api/src/index.ts` (one of **47** `.route(...)` mountings).
  3. Add service logic under `apps/api/src/services/<feature>/`.
  4. If the feature touches a new scoped table, **manually add a block to `packages/database/src/repository.ts`** (`createScopedRepository` is a hand-built object literal, one block per table — see below).
  5. If it dispatches background work, add the Inngest function under `apps/api/src/inngest/functions/` **and** add it to the `functions` array in `apps/api/src/inngest/index.ts:194` (currently **~76 entries**).
  6. Add the corresponding mobile screen(s) under `apps/mobile/src/app/(app)/` (Expo Router file-based, mostly automatic) and hooks under `src/hooks/`.
  7. Define shared types/validation in `packages/schemas/`.
- **Pain points**: Two of these steps are **forget-prone manual registration lists** (index.ts route mount, inngest functions array). The Inngest one is partially guarded (see Manual Sync Points) but the guard is per-function, not systematic.

#### Manual Synchronization Points

| What | Where | Classification | Severity |
|------|-------|----------------|----------|
| Inngest function registration array — every new background function must be added by hand; an unregistered consumer means events dispatch but never run ("wired-but-untriggered," explicitly called out as worse than dead code in CLAUDE.md UX Resilience Rules) | `apps/api/src/inngest/index.ts:194` (~76 entries) | [PRE-EXISTING] | HIGH |
| Route mount list — 47 `.route(...)` calls; a new route group only exists if hand-mounted | `apps/api/src/index.ts` | [PRE-EXISTING] | MEDIUM |
| Scoped repository table blocks — `createScopedRepository` is a hand-maintained object literal with one `{ findMany, findFirst }` block per table; adding a scoped table = copy/paste a block; the scoping `WHERE profile_id` is re-implemented per block rather than generated | `packages/database/src/repository.ts:71+` (1352 lines) | [PRE-EXISTING] | MEDIUM |
| Route table in `docs/architecture.md` vs actual mounts — doc says "44 route files," CLAUDE.md says 45, index.ts has 47 mounts; doc concedes "When this list and the source disagree, the source wins" | `docs/architecture.md:404` vs `apps/api/src/index.ts` | [PRE-EXISTING] | LOW |
| Two language enums kept in sync by hand + staleness scripts (`SUPPORTED_LANGUAGES` 7 vs `conversationLanguageSchema` 10) plus a DB CHECK constraint and `CONVERSATION_LANGUAGE_NAMES` map | `apps/mobile/src/i18n/index.ts:23`, `packages/schemas/src/profiles.ts:10`, `apps/api/src/services/llm/router.ts:191` | [PRE-EXISTING] | LOW |

The Inngest array is rated HIGH not because it's broken today but because the failure mode is silent (no type error, no runtime error — the event simply has no consumer) and the only guard found is a single per-function registration test (`feedback-delivery-failed.test.ts:549-552`, "wired into serve()"), not a systematic check that every defined function appears in the array. As the function count grows past ~76, the odds of an unregistered consumer rise.

#### Module Boundary Clarity

- **Rating**: Clear
- The dependency direction is one-way and strictly enforced (`@nx/enforce-module-boundaries`, documented in architecture.md:702-715: mobile/api → schemas; api → database/retention; leaf packages have no workspace deps). Route/service separation is lint-enforced (eslint G1/G5). Feature-based component organization on mobile. Naming conventions are codified. A new developer has unusually strong guidance (CLAUDE.md + architecture.md + per-area CONTEXT.md).
- **Minor issue**: There is no top-level "misc/utils" dumping ground in services (good), but `apps/api/src/services/` has a flat mix of single-file services (e.g. `curriculum.ts` 2643 lines, `progress.ts` 1832 lines) alongside folder-based ones (`session/`, `llm/`, `challenge-round/`). The flat large files are the ones most likely to become merge-conflict hotspots (see Growth Concerns).

#### Growth Concerns

| Area | Current Size | Trajectory | Classification | Severity |
|------|--------------|------------|----------------|----------|
| Per-request Neon Pool churn — `databaseMiddleware` creates a **fresh `NeonPool` per request** (`cacheNeonPool: false`) and tears it down at request end; the pool-cache code path exists but is explicitly disabled. Every request pays a new WebSocket handshake to Neon; no connection reuse across requests on a warm isolate | `apps/api/src/middleware/database.ts:103`, `packages/database/src/client.ts:96-120` | Growing (per-request, scales with traffic) | [PRE-EXISTING] | HIGH |
| Unbounded per-profile materialization — `loadProgressStateOnce` fetches `repo.assessments.findMany()`, `repo.retentionCards.findMany()`, `repo.vocabulary.findMany()`, `repo.vocabularyRetentionCards.findMany()` with **no limit**, loading a learner's entire lifetime of these rows into Worker memory on every progress read **and** on every daily snapshot cron tick. Sessions were already bounded for exactly this reason; these tables were not | `apps/api/src/services/snapshot-aggregation.ts:244-252` | Growing (linear in learner lifetime) | [PRE-EXISTING] | HIGH |
| Per-subject language-progress query inside a `Promise.all` map — `buildSubjectInventory` issues one `getCurrentLanguageProgress(db, ...)` DB round-trip per `four_strands` subject; fan-out grows with subjects per learner | `apps/api/src/services/snapshot-aggregation.ts:643-647` | Growing (bounded by subject count, low) | [PRE-EXISTING] | MEDIUM |
| Whole-candidate-set load in crons before batching — `monthly-report-cron.ts:168` and siblings do a single `profiles.findMany({...})` over all active profiles into cron memory, then slice into batches. Batching the dispatch is good; the initial full scan is the ceiling. Fine at thousands, strains at hundreds of thousands | `apps/api/src/inngest/functions/monthly-report-cron.ts:168`, `daily-reminder-scan.ts`, `review-due-scan.ts` | Growing (linear in active users) | [PRE-EXISTING] | MEDIUM |
| `repo.retentionCards.findMany()` unbounded in hot read paths — `coaching-cards.ts:168`, `interleaved.ts:72`, `retention-data.ts:1578`, `progress.ts:1427/1691` all pull every card for a profile then filter in JS | multiple services | Growing (linear in topics studied) | [PRE-EXISTING] | MEDIUM |
| Large single-file services / screens that will become conflict hotspots and CPU-time risks on Workers — `test-seed.ts` 5668, `session-exchange.ts` 3321, `curriculum.ts` 2643, `session-crud.ts` 2228, `progress.ts` 1832, `session-completed.ts` (Inngest) 1820; mobile `book/[bookId].tsx` 2110, `homework/camera.tsx` 1705 | see file list | Growing | [PRE-EXISTING] | MEDIUM |
| Mobile screen count (~88) all in one `(app)/` route group; tab/gating logic concentrated in `_layout.tsx` + `LearnerScreen.tsx` branching | `apps/mobile/src/app/(app)/` | Growing | [PRE-EXISTING] | LOW |

#### Cloudflare Workers Runtime Notes (scope-specific)

- **Subrequest budget vs unbounded fans + per-subject queries.** Workers cap outbound subrequests per invocation (50 on the free tier, 1000 on paid). The unbounded `findMany` materializations and per-subject `getCurrentLanguageProgress` calls are individually well under that, but the progress/snapshot path combines many reads (`Promise.all` of 6 large finds + per-subject inventory queries + curricula). For a power user with many subjects this is the path most likely to approach subrequest/CPU limits first. No code-level guard caps the count.
- **CPU time.** The "load everything then filter/aggregate in JS" pattern (retention cards, assessments, vocabulary) pushes work onto Worker CPU rather than Postgres. On the daily cron fan-out this is partly mitigated by per-profile Inngest steps, but the synchronous progress-read path runs in the request Worker and is the one bound by the 50ms–30s CPU ceiling.
- **Bundle size.** Not measured here, but the flat large service files (5k+ line `test-seed.ts` is dev/test-only and should be tree-shaken out of the deploy — worth verifying it is not bundled into the Worker).

#### Top 5 Scalability Risks (by severity)

1. **(HIGH) Per-request Neon Pool creation with caching disabled** (`middleware/database.ts:103`). Every API request opens and closes a fresh Neon WebSocket connection. This is the single highest-leverage scale risk: it scales with raw traffic (not data), adds handshake latency to every request's p95, and amplifies Neon connection pressure exactly at the ~2K–10K-user inflection the architecture doc itself flags. The cache path already exists — the question is whether per-request isolation is required for RLS/correctness or whether a warm-isolate cache (or Neon's HTTP driver for non-transactional reads) can be reintroduced safely.
2. **(HIGH) Unbounded lifetime materialization of assessments / retention cards / vocabulary** (`snapshot-aggregation.ts:244-252`). The team already proved this matters by bounding sessions to 2 years; the sibling tables remain full-scan-into-memory on a hot read path and the daily cron. Same fix shape applies (window or pre-aggregated counters).
3. **(HIGH) Inngest functions registration array is a silent manual sync point** (`inngest/index.ts:194`, ~76 entries). Forgetting to register a new consumer produces a dispatched-but-dead event — the exact "wired-but-untriggered" failure the project's own rules warn against — with no compile/runtime signal. Needs a systematic guard test (assert every exported function is in the array), not per-function tests.
4. **(MEDIUM) "Fetch all then filter in JS" read pattern across coaching/interleaved/retention/progress services.** Individually small today, collectively this is the dominant data-access anti-pattern and the main consumer of Worker CPU and subrequest budget as topics-per-learner grows. Push filtering into SQL `WHERE`/aggregates.
5. **(MEDIUM) Large single-responsibility files becoming maintenance + CPU hotspots** (`session-exchange.ts` 3321, `curriculum.ts` 2643, `session-completed.ts` 1820, etc.). These block parallel development (merge conflicts) and concentrate request-path CPU; the `session/` and `llm/` folder decomposition is the model to extend to `curriculum.ts` and `progress.ts`.

#### Recommendations

**[NEW] issues (introduced by this PR)**:
- None. This is a whole-repository architecture review with no PR diff in scope; all findings are pre-existing.

**[PRE-EXISTING] issues (scalability concerns to track / address)**:
- **Reconsider per-request Neon Pool teardown.** Either re-enable the isolate-scoped pool cache (`cacheNeonPool: true`) where transaction/RLS semantics allow, or route read-only queries through Neon's HTTP driver, so warm isolates stop re-handshaking on every request. This is the highest-ROI change.
- **Bound or pre-aggregate the remaining lifetime tables** (assessments, retention cards, vocabulary) the same way sessions were bounded, or introduce the counters table the `snapshot-aggregation.ts:236-238` comment already recommends. Convert "fetch all then filter in JS" sites to SQL-side filtering/aggregation.
- **Add a systematic guard that every defined Inngest function is registered in `inngest/index.ts`** (a test that diffs the exported-functions set against the array), replacing the per-function registration tests. Promotes the HIGH manual sync point to a CI-enforced invariant.
- **Generate the scoped-repository table blocks** (or wrap them in a factory) so adding a scoped table is one declaration, not a copied `{ findMany, findFirst, scopedWhere }` block — removes a MEDIUM copy-paste sync point and guarantees the `profile_id` scoping is uniform.
- **Decompose the largest flat service files** (`curriculum.ts`, `progress.ts`, `session-exchange.ts`) into folders like the existing `session/` and `llm/` precedent, to relieve conflict hotspots and bound request-path CPU.
- **Add a subrequest/CPU budget check or instrumentation on the progress/snapshot read path**, the path most likely to hit Workers limits first for power users, and verify `test-seed.ts` (5668 lines, dev-only) is excluded from the deployed Worker bundle.
