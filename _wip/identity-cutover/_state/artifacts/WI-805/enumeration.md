# WI-805 AC#1 Enumeration — legacy `subscriptions` readers (2026-06-18)

> ⚠️ **STALE — DO NOT TRUST THE READER BUCKET BELOW.** This first pass (agent afa8c4b835d320fb5) ran against the MAIN CHECKOUT, which was **19 commits BEHIND origin/main** ([[feedback_subagent_stale_local_repro]]). Its sole class-(c) finding (C1 quota-reset.ts unbranched) is **FALSE on current origin/main**: **WI-810 (#1213, `50fbca3c5`) already flag-branched** the quota-cycle reset (`quota-reset.ts:57`). Re-enumeration against the fresh worktree (origin/main `c0ec04a3a`) is agent a4676d1bd232390a6 — use ITS result. **Verified-direct facts that hold (schema, checkout-independent): the 4 satellite FKs still target legacy `subscriptions` (quota_pools:103, profile_quota_usage:132, usage_events:186, top_up_credits:216) → FK-rehome (AC#5) is real, 4 tables.** AC#4 (cron) already done by WI-810. Reported correction prg06ic-222.

Source: read-only agent afa8c4b835d320fb5 against origin/main checkout.

## Schema facts
- Legacy `subscriptions` (account-keyed, FK accounts.id): `packages/database/src/schema/billing.ts:31`.
- v2 `subscription` (singular, organization-keyed): `packages/database/src/schema/identity.ts`.
- Satellite FK `subscription_id → subscriptions.id ON DELETE CASCADE` (FOUR tables):
  - `quota_pools` billing.ts:103
  - `profile_quota_usage` billing.ts:132
  - `top_up_credits` billing.ts:216
  - `usage_events` billing.ts:184

## Buckets
- **(a) flag-branched (safe): 12 sites** — metering middleware/service, billing routes (9 handlers), stripe/revenuecat webhook dispatch, account export route, profiles POST, notifications route, trial-expiry cron, notify-parent-child-cap-hit, session-completed, account middleware.
- **(b) legacy-fn-with-v2-twin, dead under flag-on: 12 fns** — account-repository subscription helpers, getSubscriptionByAccountId, getSubscriptionForProfile, ensureFreeSubscription, reconcileQuotaStateForSubscription, legacy revenuecat/stripe handler bundles (dead via dispatch.ts), safeRefreshKvCache, findOrCreateAccount (account-mw branches), findExpiredTrials/byTrialDateRange, child-cap-notifications.
- **(c) FLAG-ON-REACHABLE UNBRANCHED (DANGEROUS): 1 confirmed**
  - **C1 `apps/api/src/inngest/functions/quota-reset.ts:50`** → `resetExpiredQuotaCycles(tx,now)` called UNCONDITIONALLY. `resetExpiredQuotaCycles` (`services/billing/trial.ts:124`, raw SQL `FROM subscriptions AS s`) breaks post-drop → ALL quota-cycle rollover fails. v2 twin `resetExpiredQuotaCyclesV2` (`services/billing/billing-v2/trial-v2.ts:317`, joins v2 `subscription`) EXISTS but is NOT wired. **This is C1 = AC#4 = AC#2 fix.**
  - C2 export.ts:380 / C3 profile.ts:508,574 — route-branched (account.ts:258, profiles.ts:138), unreachable flag-on at route level; functions lack internal guard → low risk, awareness only.

## AC reconciliation / deviations
- **AC#5 under-counted**: names quotaPools + profileQuotaUsage; actually FOUR tables FK legacy subscriptions (also top_up_credits + usage_events). ALL must repoint to v2 `subscription` before drop (else drop fails on dangling FK). No real choice — drop requires all 4.
- **AC#3 (account-repo repoint) appears ALREADY SATISFIED**: account-repository legacy subscription helpers (account-repository.ts:41-151) are class (b) — callers are legacy service fns dead under flag-on; v2 organization-keyed helpers (191-232) already serve flag-on. Verify no flag-on caller; if confirmed, AC#3 = no code change (document).

## ✅ RE-ENUM (a4676d1bd232390a6, fresh origin/main c0ec04a3a) — DEFINITIVE
- **ZERO class-(c)** flag-on-reachable unbranched readers. 12 readers: 2 class-(a) (metering.ts:154/810), 10 class-(b) dead-under-flag-on (each with a named flag-on call-site routing to a v2 twin). AC#2/#3/#4 = NO-OPS (WI-586 + WI-810). Reported prg06ic-224.
- **FK-rehome DATA-SAFETY CONFIRMED** (subscription-core-v2.ts header comment): the v2 path inserts satellite rows (`n`/quota_pools etc.) referencing the **NEW v2 `subscription.id`**; the FK still targeting legacy `subscriptions` is precisely the **ic-116 quota_pools FK baseline** (raw FK error on the v2 insert). ⟹ repointing the 4 satellite FKs to v2 `subscription(id)` is DATA-SAFE (stored values are already v2 ids) AND **clears the ic-116 allowed-red**. v2 `subscription` PK = `id` uuid (identity.ts:269).
- Note: schema uses terse local import aliases (`n`, `ln`) — `n` aliases different tables per file; read imports, don't assume.

## Build plan (in .worktrees/WI-805)
1. C1/AC#4/AC#2: branch quota-reset.ts:50 → `isIdentityV2EnabledInStep() ? resetExpiredQuotaCyclesV2 : resetExpiredQuotaCycles`. flag-off byte-identical. TDD: integration test (flag-on) that the cron resets v2-subscription quota cycles + does NOT 500.
2. AC#5: FK-rehome migration — repoint all 4 satellite subscription_id FKs off legacy subscriptions onto v2 subscription, BEFORE drop. Mind existing-row data (prod pre-launch ~0 subscriber rows; confirm).
3. AC#6: subscriptions DROP migration (next free # after 0118) + 2 enums (subscription_status/subscription_tier); ## Rollback + snapshot. POST-flip/before-#11-equivalent.
4. AC#3: verify + document (likely no-op).
5. AC#7: flag-on api:test:integration incl drop migration → billing/quota/cron GREEN, no 500.
6. AC#8: flag-off unchanged.
PROD drop application = OPERATOR-ONLY (orch coordinates + snapshot). Code/migration → orch Gate-1.
