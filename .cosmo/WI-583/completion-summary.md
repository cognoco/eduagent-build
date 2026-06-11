## What was done:

Fixed F-124 (top-up credits permanently stranded after tier change) and added F-096 integration test coverage for `handleTierChange` and billing/quota/idempotency paths.

The root cause: `consumeOwnerTopUpCredit` (per-profile metering path) filters `eq(topUpCredits.profileId, profileId)`. Credits purchased on a shared-pool tier (family/pro) have `profileId=null`, so they become invisible after upgrading to a per-profile tier (plus). The reverse direction (per-profile → shared-pool) also left credits with a stale non-null `profileId`, making the canonical form inconsistent.

## What changed:

- **`apps/api/src/services/billing/tier.ts`** — Extracted a shared exported helper `reattributeTopUpCreditsOnModelChange(tx, subscriptionId, accountId, oldTier, newTier)` that re-attributes active (remaining > 0) top-up credits inside a transaction:
  - shared-pool → per-profile: `SET profileId = owner.id`
  - per-profile → shared-pool: `SET profileId = NULL`
  Refactored `handleTierChange` to use this helper.

- **`apps/api/src/services/billing/revenuecat.ts`** — Wired the helper into `updateSubscriptionAndQuotaFromRevenuecatWebhook` (the RevenueCat PRODUCT_CHANGE / RENEWAL tier-change path) so credits are re-attributed on RevenueCat-driven tier changes too — fixing the gap identified by Codex P1 finding on PR #876.

- **`apps/api/src/services/billing/index.ts`** — Exported the new helper.

- **`apps/api/src/services/billing/tier.integration.test.ts`** (new) — 12 integration tests: 5 basic contract tests (null sub, tier update, idempotent, same-tier, no credits) + 7 F-124/F-096 break tests (shared-pool→per-profile, per-profile→shared-pool, plus→pro, consumed credits untouched, pool→pool unchanged, per-profile→per-profile unchanged, no-owner-profile edge case).

Both re-attribution paths emit `safeSend` structured metrics (`app/billing.topup_credits.reattributed` / `.revenuecat` suffix) so ops can query the path in production (silent-recovery-banned rule).

## Verification:

- All 12 integration tests pass: `pnpm exec jest --config apps/api/jest.integration.config.cjs --testPathPatterns="tier.integration"`
- Pre-push hook: 2656 unit tests pass across 98 test suites
- `pnpm exec nx run api:lint --skip-nx-cache` — 0 errors
- `pnpm exec nx run api:typecheck --skip-nx-cache` — success
- PR #876 CI: 6/6 checks pass (3 expected skips: ota-update, claude, run-smoke)
- Codex P1 finding addressed in commit `21cf5ce4a` (RevenueCat path wired)

## Caveats / Follow-ups:

- `revenuecat.integration.test.ts` has one pre-existing failure (`rolls back the subscription update when the quota row is missing`) confirmed pre-dating this PR by running against the stashed state. Not introduced by WI-583; tracked separately.
- Children WI-614 (F-124 fix) and WI-615 (F-096 coverage) are absorbed provenance — no separate entries required.
