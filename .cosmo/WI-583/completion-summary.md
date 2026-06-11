## What was done:

Red-green-revert evidence round for WI-583 (WP-W4-billing-credits) — fourth review pass requested explicit regression proof for the F-124 fix (pass with fix → revert fix → fail with matching symptom → restore → pass). Produced mechanically in a throwaway worktree from current origin/main (post-#897-merge, base 1830b960b); nothing committed or pushed; worktree deleted afterwards. All prior rounds (re-attribution fix #876, in-tx reads + FOR UPDATE serialization both paths + race test #897, merge e6e2af75e, Fixed In 7bde68edd) stand unchanged.

## What changed:

Nothing in the repo — this round is verification-only. Procedure:

1. `bash scripts/setup-worktree.sh wi583-revert-proof` (throwaway worktree from origin/main @ 1830b960b, includes the merged fix).
2. REVERT: neutralized the F-124 fix substance — early `return 0;` at the top of `reattributeTopUpCreditsOnModelChange` (tier.ts), killing re-attribution at both call sites (`handleTierChange` + `updateSubscriptionAndQuotaFromRevenuecatWebhook`) in one surgical edit; clean compile, "the world without the fix".
3. RED: `pnpm exec jest --config apps/api/jest.integration.config.cjs --testPathPatterns="tier.integration"` → **Test Suites: 1 failed; Tests: 10 failed, 10 passed, 20 total**.
4. RESTORE: `git checkout -- apps/api/src/services/billing/tier.ts` (tree clean again).
5. GREEN: same command → **Test Suites: 1 passed; Tests: 20 passed, 20 total**.
6. `git worktree remove --force` + prune + branch delete.

## Verification:

Failing assertions in the RED run match the F-124 symptom exactly — credits NOT re-attributed across a quota-model change:

- `[BREAK F-124] shared-pool to per-profile: credits with profileId=null re-attributed to owner` → `expect(credit.profileId).toBe(owner.id)` — Expected: "019eb656-2f6a-…" (owner id), Received: **null** (credits stranded with profileId=null after upgrade to per-profile — the original F-124 value-loss).
- `[BREAK F-124] per-profile to shared-pool: credits with profileId=owner re-attributed to null` → `expect(credit.profileId).toBeNull()` — Received: "019eb656-35fc-…" (stale owner attribution survives).
- `[BREAK F-124] per-profile (plus) to pro (shared-pool): credits nullified` → same symptom.
- `[BREAK F-124] fully-consumed credits (remaining=0) are not re-attributed` → active credit not attributed (Expected owner id, Received null).
- RevenueCat webhook path (3 tests): family→plus re-attribution, plus→family nullification, duplicate-delivery stability — all fail with the same Expected-owner/Received-null (or inverse) pattern.
- Stripe chained-hop + same-tier idempotency tests — same pattern.
- Race test `concurrent tier changes serialize on the row lock` also failed in the RED run where the per-profile target won the race (Expected owner id, Received null) — the concurrency invariant catches the regression too.

GREEN after restore: 20/20 pass, worktree clean (`git status` empty before the rerun). The 10 still-passing RED tests are the ones that don't exercise re-attribution (basic contract, schema-coherence builder, no-model-change cases) — exactly as expected.

## Caveats / Follow-ups:

- The neutralization point (`reattributeTopUpCreditsOnModelChange` → `return 0`) is the single choke point both fixed paths flow through, so one revert exercises the full F-124 surface; the FOR UPDATE locking itself was not reverted separately (its absence is only observable under nondeterministic interleaving — accepted in round 3).
- Prior caveats stand: stripe-webhook-handler expiry / trial downgrade-to-free paths re-attribution gap (different class, candidate follow-up WI); pre-existing `revenuecat.integration.test.ts` rollback-test failure (pre-dates WI-583).
