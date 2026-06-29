**What was done:**
- Verified `WI-1007` was already satisfied by merged upstream work rather than creating a no-op patch.

**What changed:**
- No new code changes were made in this lane.
- The behavior is covered by merged commit `3f071622a4df6756da83150172a4aaf268e89a43` from PR #1411, which includes the Stripe subscription-deleted family-to-free top-up re-attribution path.

**Verification:**
- Fresh focused integration run passed for `stripe-webhook-handler-v2.integration.test.ts`.
- The passing run covered 5 tests, including deleted-branch no-credit no-op and deleted-branch family-to-free re-attribution.

**Caveats / Follow-ups:**
- This item is completed as already fixed upstream; no new branch diff or PR was created for it.
