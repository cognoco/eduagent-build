# WI-808 Flag-ON Integration Triage — Cluster Map

Triage of the 97 `apps/api/src/**/*.integration.test.ts` suites now running flag-ON
(via PR #1220's routing fix). Static analysis (Sonnet agent a7132c7b, 2026-06-17),
shepherd-verified. **Fixes HELD** per ic-orch-125 until orch Gate-1+merges #1220 +
picks a cluster. A few root causes, not 97 fixes (cascade-root-cause lesson).

## Clusters

### Cluster 1 — Direct legacy accounts/profiles seed, no v2 rows (~68 suites) — THE BULK
Root cause: tests `db.insert(accounts)`/`db.insert(profiles)` with NO matching
`person`/`login`/`membership`/`organization`. Flag-ON, `resolveIdentityV2()`
(identity-resolve.ts) finds no `login` for the seeded `clerkUserId` → middleware
sets `clerkIdentity` not `account` → downstream 401 / empty-identity.
Fix lever: flag-gated dual-write. **Proven template = `weekly-progress-push`
(WI-793), lines 231/291/481**: under `process.env['IDENTITY_V2_ENABLED']==='true'`
insert organization+person+login+membership(+guardianship), `person.id=profile.id`
/ `org.id=account.id` (WI-788 deterministic invariant); teardown deletes v2 first.

- **1a — Route suites via shared helpers (~7) — HIGHEST SINGLE-PR LEVERAGE.**
  Seed through `createProfileViaRoute`/`setSubscriptionTierForProfile`
  (`tests/integration/route-fixtures.ts`) + `cleanupAccounts`
  (`tests/integration/helpers.ts`). Fix the 3 shared helpers ONCE → unblock all 7
  route suites in ONE small PR. Examples: celebrations, notices, streaks, sessions,
  consent-web, snapshot-progress, language-progress.
- **1b — Service suites seeding inline (~55).** Each seeds legacy rows inline for FK
  anchoring then calls services directly. Per-suite dual-write; independent →
  parallelizable (template-mechanical → Sonnet sub-agents, per-domain batches:
  session/**, services/, inngest/, routes/).

### Cluster 2 — Legacy billing reading dropped `subscriptions` (7) — WI-805, NOT WI-808
billing/{subscription-core,metering,revenuecat,tier,trial}, safe-refresh-kv-cache,
routes/stripe-webhook. Read `subscriptions.*`; fail once that table drops. WI-805 scope.

### Cluster 3 — v2 billing, dual-store, drop-gated (4) — WI-805, NOT WI-808
billing-v2/{subscription-core-v2,subscription-core-v2-cancel,revenuecat-v2,family-usage-v2}.
Seed both stores; pass while legacy `subscriptions` present; WI-805/drop concern.

### Cluster 4 — Already v2-native / should pass flag-ON (~15)
identity-v2/* (pure v2 seed), schema-introspect (database-fk-indexes,
**database-rls-coverage = the WI-794 guard**), test-seed.* (own dual-write), and the
4 flag-gated-template suites (weekly-progress-push, review-due-scan,
family-access-inner-guard-v2, dashboard-v2). No work expected.

## Recommended sequence (for the orch's cluster-pick)
1. **Cluster 1a first** — one shared-helper PR unblocks ~7 route suites. Smallest blast
   radius, validates the dual-write template against the real flag-on CI lane.
2. **Cluster 1b** — parallelized per-domain batches (Sonnet sub-agents, no git → I commit),
   each adversarially reviewed → small per-domain PRs.
3. **Exclude WI-805 set (~11)** from WI-808 scope; flag to orch.

## ⚠️ CRITICAL EMPIRICAL UPDATE (2026-06-17, sub-agent a581b93 + shepherd-verified) — STATIC MAP OVERTURNED
Ran 12 sample suites flag-ON against a real through-0117 committed-migration PG (initdb PG17, 46 pg_policies). **10/12 PASS.** The 2 fails are PRE-EXISTING flag-blind test-data bugs, NOT v2/WI-808: snapshot-progress (`createChildProfile birthYear=2014` age12 < 13-floor → 400, F-144) + curriculum (`seedFiledTopicFixture` passes a bare uninserted `otherSessionId` → FK violation). The ~68-fixture burndown premise does NOT reproduce.
ROOT CAUSE (verified): (1) `buildIntegrationEnv()` (tests/integration/helpers.ts:25-39) OMITS `IDENTITY_V2_ENABLED`; the route path reads `isIdentityV2Enabled(c.env...)` (config.ts:274) from Workers bindings, NOT process.env → ROUTE suites are FLAG-BLIND (stay v1) even in the "flag-on" lane. (2) The DB is through-0117 (the 0118 legacy-table DROP is freeze-only/unjournaled), so accounts/profiles STILL EXIST → direct-insert fixtures succeed. (3) Inngest path reads `isIdentityV2EnabledInStep()` = `getEnvBinding ?? process.env` (inngest/helpers.ts:101) → DID see the flag → already fixed by WI-793 (weekly-progress-push/review-due-scan).
IMPLICATION: the WI-808 "488 fail" observation was almost certainly a POST-DROP DB (legacy tables gone → FK-fail mass-red) or the cross-package COLON suite — NOT the apps/api dash suites on a through-0117 DB. Fixture migration to v2-native seeding is only NECESSARY if the target DB drops legacy tables (post-0118) OR buildIntegrationEnv propagates the flag so routes exercise v2. **FIXES HELD — reconciliation question put to orch (prg06ic-168).** PR #1220 still correct (97 suites incl WI-794 guard now RUN in CI) but on the through-0117 lane they mostly PASS, not the expected diagnostic reds.

## Shepherd verification (spot-checks)
- Helpers exist: route-fixtures.ts:80/137, helpers.ts:45. ✓
- 72 suites insert legacy accounts/profiles (corroborates ~68 bulk). ✓
- WI-793 dual-write template confirmed in weekly-progress-push (231/291/481). ✓
