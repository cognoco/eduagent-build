## What was done:

Rework round (addendum to the 2026-06-11 completion summary). Two findings addressed: (1) CodeRabbit Major — the Stripe path and the RevenueCat path emitted the same Inngest event name (`app/billing.topup_credits.reattributed`) with two incompatible payload schemas; (2) reviewer rework finding — `previousTier` in `updateSubscriptionAndQuotaFromRevenuecatWebhook` was read BEFORE the transaction opened, so a concurrent webhook for the same account could make the tier-change detection and credit re-attribution act on a stale tier.

## What changed:

- `apps/api/src/services/billing/tier.ts` — added `buildTopUpCreditsReattributedEventData()` (pure builder, single source of truth for the superset payload `{subscriptionId, accountId, previousTier, newTier, previousModel, newModel, reattributedCount, occurredAt}`) and `emitTopUpCreditsReattributedMetric()` (shared safeSend emitter). `handleTierChange` delegates to the shared emitter. One event name, one schema — the two paths cannot diverge.
- `apps/api/src/services/billing/revenuecat.ts` — `updateSubscriptionAndQuotaFromRevenuecatWebhook` now (a) calls the same shared emitter, and (b) reads the previous tier INSIDE the `db.transaction` (scoped repo over txDb), making the read-compare-reattribute sequence coherent with the row the transaction updates.
- `apps/api/src/services/billing/index.ts` — barrel exports for the new builder/emitter and event-data type.
- `apps/api/src/services/billing/tier.integration.test.ts` — two new describe blocks: (1) schema-coherence pinning the canonical 8-field set and asserting both paths' argument shapes produce identical field sets; (2) end-to-end RevenueCat webhook path tests (family→plus re-attribution, plus→family nullification, duplicate-eventId idempotency short-circuit).

Commits this round: `000be67e1` (unified event schema + coherence tests), `ae409b565` (in-transaction previous-tier read + webhook-path end-to-end tests). Prior round: `7b88483a9` (F-124 fix + 12 tests), `21cf5ce4a` (Codex P1 — RevenueCat path wired).

## Verification:

- tier.integration.test.ts — 17/17 pass (12 original + 2 schema-coherence + 3 RevenueCat-path)
- `pnpm exec nx run api:lint --skip-nx-cache` — 0 errors; `api:typecheck --skip-nx-cache` — success
- Pre-push hook on final commit: unit tests + typecheck pass
- PR #876 verified on final commit `ae409b565`: all check-runs completed (Playwright web smoke, main, claude-review, API Quality Gate, changes — success; ota-update, run-smoke — expected skips); commit status CodeRabbit success; none pending
- In-thread disposition replies posted on both GitHub threads (Codex P1 → 21cf5ce4a; CodeRabbit Major → 000be67e1, also self-marked addressed by CodeRabbit); no new threads on the final commit

## Caveats / Follow-ups:

- A deterministic concurrency test for the stale-read fix is not practical through the Neon HTTP driver (no controllable interleaving); the fix is structural — the read now shares the transaction with the update — and the webhook path is covered end-to-end by the three new integration tests.
- `revenuecat.integration.test.ts` has one pre-existing failure (`rolls back the subscription update when the quota row is missing`) confirmed to pre-date this PR; tracked separately.
- Children WI-614 and WI-615 remain absorbed provenance.
