# WI-1153 — shared-stg-DB integration-test isolation root-fix (scope)

**Status:** Executing (claimed `claude:bug-lane`). Interim quarantine rode #1606 (merged `ce496d284`); root-fix is a SEPARATE PR. Fixed In = root-fix PR, **not** #1606.

## Root cause
No per-test isolation in `tests/integration/api-setup.ts`: a shared pg `Pool` is reused across files with **no** truncation / GUC / role / auth-mock reset between tests, and `jest.integration.config.cjs` runs `maxWorkers: 1` (serial). Failures are intermittent by connection/auth-mock assignment + row accumulation, **not** test order. GUC-leak hypothesis REFUTED (no session-level `set_config(...,false)` / bare `SET ROLE` / `SET <guc>` repo-wide).

### CI-DB CORRECTION (2026-06-29, primary source `ci.yml:50,381-385,507`)
The required `main` integration job (`API co-located integration tests` → `pnpm exec nx run api:integration-api`) runs against the **GitHub Actions service Postgres** `postgresql://eduagent:eduagent@localhost:5432/tests` — a **fresh ephemeral container per CI run**, vector-extension-loaded, drizzle-migrated. The flag-ON job (line 507, `always()`, allowed-red) uses a similar fresh DB. So the CI flake is **NOT cross-RUN accumulation and NOT the shared Neon stg DB** — each CI run starts empty. The real CI vector is **intra-RUN cross-FILE state bleed on a clean DB**: either (a) auth/Clerk **mock-state leak** between files, or (b) **within-run row collision** (file A's seeds collide with file B because keys aren't unique per-file/test). `.env.development.local` → Neon stg (`ep-fancy-cherry…neon.tech`) is only what LOCAL dev runs hit; reproducing against stg would inject accumulation artifacts CI never sees (false repro) AND touch WI-1145 seeds. **CI-faithful repro therefore uses a FRESH LOCAL ephemeral Postgres mirroring ci.yml — zero cross-lane risk.** The "NEVER truncation" constraint protects LOCAL stg runs/WI-1145 seeds; the central reset must be safe whichever DB it points at.

## Fix family (applies to every site below)
- Reset auth/Clerk mock state between files.
- Per-test key-uniqueness (unique seed keys per run, e.g. run-id prefixed) so rows don't collide/accumulate.
- For txn-scoped break-tests: seed the parent row INSIDE the rolled-back transaction (or `try/finally` with cleanup in `finally`).
- **NEVER truncation** (orch-040: would wipe WS-18 / WI-1145 seeds in the shared stg DB).

## Sweep sites (must ALL be enumerated in WI-1153's Cosmo AC at root-fix refine/PR time)

5 quarantined (default-skipped via G7 conditional callee, runtime toggle `UNQUARANTINE_WI_1153=1`):
1. `apps/api/src/inngest/functions/session-completed.integration.test.ts` — struggle-detection test.
2. `apps/api/src/inngest/functions/weekly-progress-push.integration.test.ts` — `[BUG-699-FOLLOWUP] does not re-push…`.
3. `apps/api/src/routes/snapshot-progress.integration.test.ts` — `[F-144] proxy read of child milestones does NOT backfill…`.
4. `apps/api/src/services/retention-data.integration.test.ts` — `[WI-234] two concurrent recall submissions… exactly one LLM call`.
5. `apps/api/src/services/billing/alias-merge.integration.test.ts` — `[BUG-783] migrates the paid tier + top-up credits…`.

6th site (added per orch-049 — claude-review CONSIDER on #1589/WI-1104; NOT quarantined, same leak-on-throw family):
6. `tests/integration/profile-isolation.integration.test.ts` ~L554 — the `concept_mastery` WITH CHECK test seeds its parent `concept` row OUTSIDE the rolled-back transaction and cleans up with a bare `await db.delete(...)`; an unexpected throw before cleanup leaks the row into later runs. Fix = `try/finally` (seed in try, delete in finally) or move the seed inside the rolled-back txn and pass the id out.

## Validation + DoD
- Validate the candidate fix greens all 5 quarantined via `UNQUARANTINE_WI_1153=1` against a CI-faithful full-suite repro, THEN flip the source default (delete the conditional callee, leave bare `it()`).
- DoD: restore all 5 quarantined sites + fix site 6 + 3 consecutive green `main` integration runs + forward-guard `grep -r UNQUARANTINE_WI_1153` → zero.
- Cross-lane: WS-18 WI-867 main-gate shares this exact cluster.

## PHASE-1 REPRO FINDINGS (2026-06-29) — REFRAMES THE ROOT CAUSE
Built a CI-faithful local repro: fresh local Postgres `mm_wi1153_repro` (eduagent role = ci.yml's), `CREATE EXTENSION vector`, `drizzle-kit migrate` (124 migrations) — matches ci.yml exactly, zero cross-lane (never touches stg/WI-1145).

**Probe 1 — each victim ALONE (own jest process = fresh mocks), fresh DB, `UNQUARANTINE_WI_1153=1`, with AND without `CI=true`: ALL 5 FAIL DETERMINISTICALLY**, each failing only its own quarantined assertion, fast (17–72ms):
- `alias-merge` `[BUG-783]`: `pool.monthlyLimit` Expected 700 (plus) Received 100 (free) — survivor tier upgrades (line 239 passes) but quota pool not upgraded (line 246).
- `retention-data` `[WI-234]` concurrent-recall: `UpstreamLlmError: recall grader unavailable` (retention-data.ts:1054) — even though the test self-registers an LLM fixture (`registerLlmProviderFixture()`, `setChatResponse('4')`); failure is in the CONCURRENT/dedup path.
- `session-completed` struggle-detection: assertion `push fired …` fails (incidental `No provider registered for: openai` warn from insight-gen is tolerated noise, not the failure).
- `weekly-progress-push` `[BUG-699-FOLLOWUP]`: Expected `{status:throttled,reason:dedup_24h}` Received `{status:completed}` — dedup precondition not met.
- `snapshot-progress` `[F-144]`: `createProfileViaRoute` returns **403** at fixture setup (auth), not the real assertion.

**CRITICAL CORRECTION to the quarantine premise:** the quarantine comments claimed "passes in local isolation" — that was against the SEEDED shared **stg** DB (WI-1145 seeds + accumulated rows), NOT a fresh CI-faithful DB. Against fresh, they fail alone. So "flaky/passes-isolated" was misdiagnosed.

**Running ALONE is NOT CI-faithful** — CI runs the FULL serial co-located suite (`nx run api:integration-api`, ~329 files, one DB). Hypothesis: victims DEPEND on cross-file/suite state (provider-registration timing, seeded preconditions, concurrency ordering) present mid-suite but absent alone → they pass in-suite, fail alone, and the CI flake is file-ORDER (victim scheduled before its state-provider). **CONSEQUENCE: the assumed fix (central `api-setup.ts` mock-RESET between files) may be WRONG/harmful** — if victims rely on leaked state, resetting worsens them. Full-suite repro in progress to confirm whether victims pass in-suite.

## PHASE-1 CORRECTION (2026-06-29, advisor-driven) — TWO HYPOTHESES FALSIFIED; REPRO INFIDELITY PROVEN
Anchored to ground truth instead of another local run:

1. **The cited "@09:19 green" (CI run 28361732814) SKIPPED the integration step.** `gh run view` shows the `main` job green BUT its `API co-located integration tests` + `API integration tests` steps = **skipped** (a MOBILE-only commit `b5d7ec05d`, change-class routed past api). So "passed @09:19" meant **didn't execute**, not passed. The quarantine premise was false.

2. **Full-suite probe (fresh DB, UNQUARANTINE=1, CI=true, the CI command): victims FAIL IN-SUITE too.** All 5 quarantined are among the 8 failed suites — they do NOT "pass in-suite, fail alone." => the "depend-on-cross-file-state / pass-in-suite" hypothesis (bug-lane-069, endorsed by orch-054) is **FALSIFIED**, AND the per-victim-self-sufficiency fix direction built on it is on hold.

3. **REPRO INFIDELITY PROVEN.** 3 NON-quarantined suites also fail in my repro: `recall-nudge-send`, `review-due-send`, `deletion`. These are NOT quarantined, so they ran in #1606/#1589's CI (fresh DB) and PASSED (those main checks were green). Pass-in-CI + fail-in-my-repro on a fresh DB ⇒ **my repro lacks something CI provides** — so NONE of the 8 failures (incl. the 5 victims) can be trusted as "real bugs" yet.

4. Migration integrity OK: 124 journaled migrations applied (89 tables); the 2 extra .sql files (`0106_identity_t1_org_membership`, `0107_gorgeous_cardiac`) are the intentionally-excluded reverted-T1 migrations (not in `_journal.json`, correctly not applied).

5. CI main-job env == my repro env (only `DATABASE_URL`+`CI`+NX flags; NO seed-secret/LLM/Clerk). Remaining fidelity gap = **CI runs cross-package `api:test:integration` against the SAME DB BEFORE the co-located step** (ci.yml:376 then :385). Experiment running: cross-package-first then co-located on one fresh DB — if the 3 non-quarantined (and/or victims) then pass, that ordering was the infidelity.

**ALL fix directions (mock-reset AND self-sufficiency) ON HOLD until a faithful repro exists (the 3 non-quarantined must pass, matching CI).** Quarantine validity unchanged (the 5 wall the gate when run).

## CROSS-PACKAGE-FIRST VERDICT (2026-06-29) — STILL NOT FAITHFUL; new suspects
Ran CI's faithful sequence on one fresh DB: `api:test:integration` (cross-package, EXIT 0 = passed) → `api:integration-api` (co-located, EXIT 1). The 3 non-quarantined suites STILL fail → cross-package-first ordering was NOT the (sole) infidelity. The fidelity gate (orch-055: do the 3 non-quarantined pass?) = **NO**. Repro still unfaithful; all fix directions remain on hold.

New evidence:
- **Failure set VARIES run-to-run**: full-suite run #1 failed `deletion`; cross-pkg-first run failed `transcript-purge` instead (8→9 tests). My repro has genuine intermittency (the non-quarantined failures are order/state-sensitive), even though the 5 victims fail deterministically alone.
- **Non-quarantined failures are cross-profile topic-scoping**: `recall-nudge-send`/`review-due-send` "falls back to generic label when the topic id belongs to another profile" — the fallback didn't happen ⇒ an UNORDERED query returned another profile's row. Smells like a missing `ORDER BY` / order-sensitive `LIMIT 1`.
- **PG VERSION GAP (overlooked fidelity suspect)**: CI = `pgvector/pgvector:pg16` (Postgres **16**); my local running PG = **17.10**. PG17's planner can return unordered rows in a different order than PG16 → order-sensitive queries (and the quota-pool/topic-title picks) may differ. This could explain why tests that pass in CI's pg16 fail in my pg17 repro.

NEXT-CONTEXT GATE (unchanged): achieve a faithful repro where the 3 non-quarantined PASS (matching CI). Live fidelity suspects to close, in order: (1) match **Postgres 16** (find/run a pg16+pgvector locally, or accept this needs docker which is unavailable → may require a pg16 install); (2) jest file-ORDER/sequencer parity with CI; (3) only then trust any victim failure. Do NOT pick a fix direction until the 3 non-quarantined pass.

## ORCH-057 QUERY-LEVEL CHECK (2026-06-29) — missing-ORDER-BY NOT confirmed at this site
Read the cross-profile-scoping query behind `recall-nudge-send`/`review-due-send` (`recall-nudge-send.ts:102-131`): the topic-title lookup IS profile-scoped — `.where(and(inArray(curriculumTopics.id, topTopicIds), eq(subjects.profileId, profileId)))` (line 128) — joined topics→books→curricula→subjects. `topTopicTitle = topics[0]?.title ?? 'your fading topic'` (line 133) has no `ORDER BY`/`LIMIT`, BUT the WHERE already filters to the caller's profile, so a topic owned by ANOTHER profile yields an empty set → fallback fires (expected). ⇒ the "unordered query surfaces another profile's row" / missing-ORDER-BY determinism hypothesis is **NOT confirmed at this query**. The "fallback-didn't-fire" failure in the repro must come from elsewhere (test seed creating a same-profile topic, or accumulated-data interaction) — NOT a query determinism bug here. Still points back to repro infidelity / fresh-DB sensitivity, not a clean code bug. Fix direction remains UNDETERMINED; faithful-repro-first stands.

## ★ FAITHFUL REPRO FOUND IN CI HISTORY (2026-06-29) — fidelity gate MET, pg16 detour UNNECESSARY
The faithful repro was in CI history all along. **Run 28360360388** (commit `42bb43913`, *"fix(ci): route API co-located integration suite"* — the commit that first routed the co-located suite onto `main`), job `main` (84013245919):
- **FAIL = exactly the 5 quarantined victims** and nothing else: `session-completed`, `weekly-progress-push`, `snapshot-progress`, `retention-data`, `alias-merge`.
- **PASS = the 3 "non-quarantined"**: `recall-nudge-send` (09:09:12), `review-due-send` (09:09:11), `deletion` (09:08:25).
- The advisor's fidelity gate ("the 3 non-quarantined must PASS, matching CI") is **MET by this real CI run**. ⇒ A perfect local pg16 repro is **not required**; this run IS the ground truth.
- **Why my LOCAL pg17 repro was infidel:** it *over-failed* — the 3 non-quarantined ALSO failed locally (pg17 planner / fresh-DB seeding), which CI does not. The infidelity was extra local failures, not missing ones. The 5 victims fail in BOTH ⇒ the 5 are REAL.

### Real CI failure modes (deterministic — NOT flake)
1. **session-completed** (all 10 tests in file) — `NonRetriableError: [session-completed] Invalid event payload: path ["mode"], expected string received null` (`session-completed.ts:410`). This is the **WI-1147 `mode:null` fixture bug** — **FIXED by #1606** (this run predates the 14:04 merge). ⇒ session-completed's quarantine is **entangled with the now-fixed WI-1147**; likely passes on current main. RE-CHECK on current main; may need only skip-removal, no code fix.
2. **weekly-progress-push** [BUG-699-FOLLOWUP] (`:752`) — `toEqual` got `{status:'completed'}` expected `{status:'throttled', reason:'dedup_24h'}`. Dedup-24h didn't fire ⇒ no prior `weekly_progress` notification row exists on a fresh DB. **Unmet precondition.**
3. **snapshot-progress** [F-144] (`:581` via `createProfileViaRoute` route-fixtures.ts:134) — child-profile create returns **403** not 201. Auth/ownership precondition absent on fresh DB. **Unmet precondition.**
4. **retention-data** [WI-234] (`retention-data.ts:1054`) — `UpstreamLlmError: recall grader unavailable` in the CONCURRENT path. LLM grader fixture not registered/visible for that path. **Unmet precondition (provider fixture).**
5. **alias-merge** [BUG-783] (`:240`) — `pool.monthlyLimit` 700 vs **100**. Tier upgraded but quota pool not seeded/migrated. **Unmet precondition.**

### Re-justified fix direction (from FAITHFUL ground truth, NOT the retracted hypothesis)
The 5 fail **deterministically on a fresh ephemeral DB** because each depends on a precondition (quota pool / prior notification / LLM grader fixture / auth-ownership) that existed in the old SEEDED-stg local runs but is **absent on CI's fresh pg16 DB**. They were authored against a stateful DB and are **not self-sufficient**. Fix = **per-victim self-sufficiency** (each seeds its own precondition). This is the orch-054 direction, re-reached by a CORRECT chain (the earlier retraction was because the *supporting* hypothesis came from the infidel local repro; the direction itself is sound). NOT truncation, NOT mock-reset, NOT cross-file order.

### KEY: single-victim-alone-on-fresh-DB IS faithful for these deterministic failures
Because the 5 are deterministic-broken-on-fresh-DB (not order-dependent), running ONE victim alone on a fresh local DB reproduces the **same assertion** as CI (verified: alias-merge 700-vs-100 alone == CI). ⇒ The fix can be iterated locally per-victim (alone, fresh DB) with faithful failure → fix self-sufficiency → green-alone. The infidelity only afflicted the FULL-suite local run. Final gate stays: un-quarantine ALL + green in real CI.

### Resume plan (pg16 gate CLOSED)
1. Per-victim, on current main: run the victim ALONE on a fresh local DB; confirm it fails with the CI assertion; make it seed its own precondition; green-alone.
2. session-completed first — re-check whether WI-1147 already fixed it (likely skip-removal only).
3. 3 victims overlap WS-18/WI-1145 sweep → **flag orchestrator before editing** session-completed + profile-isolation site#6 (+ any chain/pipeline file).
4. Un-quarantine all 5 (+ fix site#6), push, achieve green real-CI integration step (the inevitable faithful confirmation). Forward-guard: `grep UNQUARANTINE_WI_1153` → zero.

## ★★ CONFIRMED ON CURRENT main (e561d316f) — alone-on-fresh-DB is faithful (2026-06-29)
Rebuilt fresh DB `mm_wi1153_v2` (eduagent, CREATE EXTENSION vector, drizzle-kit migrate) at latest origin/main; ran each victim ALONE (own jest process, UNQUARANTINE_WI_1153=1, CI=true). All 5 fail; modes MATCH the CI run 42bb43913 exactly ⇒ alone-on-fresh-DB faithfully reproduces CI for these deterministic failures (NO pg16, NO full suite needed to iterate the fix):
- **session-completed**: 12 PASS, ONLY `struggle detection` fails — `expoPushCalls.length toBeGreaterThan(0)` got **0** (push NOT fired), `:1298`. ⇒ mode:null is FIXED by WI-1147; the residual is push-not-fired. De-entangled.
- **weekly-progress-push** [BUG-699-FOLLOWUP] `:758` — `{status:'completed'}` vs expected `{status:'throttled', reason:'dedup_24h'}`.
- **snapshot-progress** [F-144] `:587` via `createProfileViaRoute` (route-fixtures.ts:135) — **403** not 201 creating child profile.
- **retention-data** [WI-234] `:493` — `UpstreamLlmError: recall grader unavailable` (retention-data.ts:1054), concurrent path.
- **alias-merge** [BUG-783] `:246` — `pool.monthlyLimit` 700 vs **100**.
Fresh DB: `postgresql://eduagent:eduagent@localhost:5432/mm_wi1153_v2`. Repro cmd per victim: `pnpm exec jest --config apps/api/jest.integration.config.cjs <file> --forceExit --runInBand` with DATABASE_URL=fresh + UNQUARANTINE_WI_1153=1 + CI=true.
NEXT: per-victim root-cause — classify TEST-BUG (unmet precondition the test should seed) vs PRODUCT-BUG (code genuinely broken on fresh state). Flag orchestrator before EDITING session-completed (WS-18 overlap) + profile-isolation site#6.

## ★★★ PER-VICTIM CLASSIFICATION (2026-06-29) — 3 TEST-BUG, 2 PRODUCT-BUG (mechanism-verified)
5 read-only sonnet diagnosis agents + my source-verification of the 2 product claims. The quarantine comments' "shared-stg-DB accumulation" root cause is WRONG for all 5; real cause = tests written against the dev's flag-on + seeded-stg env, broken on CI's flag-off + fresh-DB `main` lane.

| # | Victim (test) | Class | Root cause (verified file:line) | Fix |
|---|---|---|---|---|
| 1 | snapshot-progress [F-144] | TEST-BUG | flag-off `createChildProfile` omits `actingProfileId` → no `X-Profile-Id` → `resolvedVia:'auto'` trips Issue-901 guard `services/profile.ts:283` → 403 | add `actingProfileId: owner.id` to the `createProfileViaRoute` call (~test:153) |
| 2 | retention-data [WI-234] | TEST-BUG | fixture `setChatResponse('4')` (bare digit); `parseRecallGradeJson` needs JSON obj → `extractFirstJsonObject('4')`=null → `graded:false` → throw `retention-data.ts:1054`. (Single call would fail too — not a concurrency bug.) | `setChatResponse({quality:4,verdict:'solid',rationale:'...',misconception:null})` (test:480) |
| 3 | session-completed [struggle] **WS-18 OVERLAP** | TEST-BUG | `sendStruggleNotification` `notifications.ts:557` flag-off → queries v1 `familyLinks`; test seeds only v2 `guardianship`; `IDENTITY_V2_ENABLED` absent from test Doppler secrets → v1 path → no parent → no push (`expoPushCalls`=0) | force `setIdentityV2Enabled('true')` + finally-reset around handler. **FLAG before edit.** |
| 4 | alias-merge [BUG-783] | **PRODUCT-BUG** | per-profile tier reconcile `quota-reconcile.ts:147-153` updates only `profileQuotaUsage`; ONLY the `shared-pool` branch (`:64-94`) updates `quotaPools.monthlyLimit`; `updateSubscriptionAndQuotaFromRevenuecatWebhook`'s 4th arg `_quota` (`revenuecat.ts:132`) is UNUSED; so free→plus alias-merge leaves `quotaPools.monthlyLimit`=100. `monthlyLimit` IS enforced (`metering.ts:361`,`:415`,`:493`). Asymmetric vs `activateSubscriptionFromRevenuecat` (`revenuecat.ts:497-535`) which DOES update it. Test is CORRECT. | PRODUCT fix (sync `quotaPools` in per-profile reconcile) → **separate WI**; un-quarantine rides with it |
| 5 | weekly-progress [BUG-699-FOLLOWUP] | **PRODUCT-BUG** (intent-ambiguous) | email step (`weekly-progress-push.ts:853-968`) has NO `getRecentNotificationCount` read — only `logNotification('weekly_progress')` write; push step DOES dedup (`:826-834`). So a 24h-prior notif throttles push but email fires → outer status `pushResult.sent\|\|emailSent ? completed : throttled` (`:972`) = `completed`. Also `reason:'dedup_24h'` is structurally unreachable in the outer return `{status,parentId}` (stale assertion; field existed pre-WI-998). | PRODUCT fix (re-add read-only dedup in prepare step) + test pref `weeklyProgressEmail:false` → **separate WI**; needs product-intent confirm (should email dedup?) |

DECOMPOSITION: WI-1153 un-quarantines the **3 TEST-BUGs** (snapshot, retention, session-completed). The **2 PRODUCT-BUGs** (alias-merge, weekly-progress) each need a product fix in its OWN WI; their test un-quarantine rides WITH that product fix. So WI-1153 closes 3 of 5; the other 2 un-quarantine after their product WIs land.

## ★★★★ CORRECTED VERDICT (2026-06-29) — BOTH "product bugs" FLIP TO TEST-BUG; WI-1153 closes all 5
Advisor + orchestrator (orch-062) flagged: I verified the MECHANISM (quotaPools.monthlyLimit not written by per-profile reconcile) but not the HARM (which table per-profile enforcement READS). Positively verified the read-path:

**alias-merge → TEST-BUG (no harm, no prod change).** Read-path evidence:
- `apps/api/src/services/subscription.ts`: `plus` is `quotaModel:'per-profile'` (:76), `ownerMonthlyQuota:700` (:78), `childMonthlyQuota:100` (:80). Only `family`/higher are `shared-pool` (:92,:108).
- `metering.ts:259 decrementQuota` → `:283 if (getTierConfig(tier).quotaModel === 'per-profile')` dispatches per-profile tiers to the **profileQuotaUsage** path (`attemptProfileDecrementInTx`, decrements `profileQuotaUsage.usedThisMonth < profileQuotaUsage.monthlyLimit`). The `quotaPools.monthlyLimit` enforcement (`:361`) is the **shared-pool** branch only.
- `quota-reconcile.ts:103-153` (per-profile branch) provisions + sets the survivor OWNER's `profileQuotaUsage.monthlyLimit = config.ownerMonthlyQuota` (=700 for plus). So the alias-merged plus owner IS correctly metered at 700 via `profileQuotaUsage`. `quotaPools.monthlyLimit=100` is **vestigial for per-profile** (never read).
- ⇒ The test asserts the WRONG table (`quotaPools.monthlyLimit`). FIX (test-only): assert the owner's `profileQuotaUsage.monthlyLimit === getTierConfig('plus').ownerMonthlyQuota` (700). No product change; NO billing defect.
- DEFERRED (optional, NOT a bug/WI): `quotaPools.monthlyLimit` goes stale on alias-merge for per-profile tiers — harmless today (vestigial); would only matter if a tier ever switches per-profile→shared-pool. Do NOT add a `quotaPools` write in the per-profile reconcile branch (dead/risky across the model separation).

**weekly-progress → TEST-BUG (fix in WI-1153).** `weeklyProgressEmail:false` in `seedWeeklyPushPrefs` isolates the push-dedup the test is literally named for ("does not re-push"). Also drop the stale `reason:'dedup_24h'` from the `toEqual` (outer handler returns only `{status,parentId}` post-WI-998; the field is unreachable). FIX (test-only): `weeklyProgressEmail:false` + assert `{status:'throttled', parentId}`.
- DEFERRED (optional product enhancement, NOT captured per orch-062): "should the within-24h weekly EMAIL also dedup (matching push)?" — separable; operator escalation withdrawn. Sub-finding: the `reason:'dedup_24h'` return became unreachable when WI-998 moved dedup from the prepare step into the push step.

**NET: all 5 are TEST-BUGs → WI-1153 closes all 5. No product WIs, no quota-reconcile prod write.** Fixes are test-file-only: snapshot-progress (actingProfileId), retention-data (JSON fixture), session-completed (flag-pin wrapper — WS-18 overlap, flag before edit), alias-merge (assert profileQuotaUsage), weekly-progress (weeklyProgressEmail:false + drop reason).

## ★★★★★ ALL 5 FIXED + GREEN alone-on-fresh-DB (2026-06-29)
All 5 un-quarantined (plain `it`) + self-sufficiency fix applied; each PASSES alone on fresh DB mm_wi1153_v2 (current main e561d316f):
- snapshot-progress: 17/17 (added `actingProfileId: owner.id`).
- retention-data: 7/7 (valid recallGradeJson fixture).
- alias-merge: 4/4 (assert owner `profileQuotaUsage.monthlyLimit === getTierConfig('plus').ownerMonthlyQuota` — mirrors passing v2 twin; NO product change).
- weekly-progress: 6/6 full file (push-only `seedWeeklyPushPrefs` + drop stale `reason:'dedup_24h'`).
- session-completed: 13/13 (flag-pin `setIdentityV2Enabled('true')`+finally around the struggle handler; v2 guardianship path fires push).
Validations: forward-guard `rg UNQUARANTINE_WI_1153` = 0; no `QUARANTINE WI-1153` comments left; `tsc --build apps/api` exit 0; eslint 0 errors (2 pre-existing unused-var warnings untouched); GC6 = 0 internal jest.mock in all 5. Scope = exactly the 5 test files. NO product code changed.
NOTE (orch-064): this greens the REQUIRED flag-off `main` lane; it is DISTINCT from the WI-1057 `mergeAliasedSubscriptionV2` flag-ON suite gating 867 (same file, different tests) — does NOT unblock 867.
LAND: rebase WI-1153 PR onto current origin/main (1161, possibly 867) before merge; re-verify forward-guard greps to zero post-rebase.
