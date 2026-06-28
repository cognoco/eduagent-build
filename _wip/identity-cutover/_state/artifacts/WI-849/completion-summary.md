**What was done:** Closed the v2 account-deletion GDPR gaps in `executeDeletionV2` so a whole-org erasure completes without aborting on RESTRICT foreign keys — the subscription-row teardown (Gap-1) and the surviving relationship-edge teardown (Gap-3).

**What changed:** `apps/api/src/services/identity-v2/deletion-v2.ts` now snapshots the org subscriptions, deletes those subscription rows inside the deletion transaction before the per-person drop, and tears down `guardianship` / `supportership` edges (active and revoked, edges only — never the out-of-org counterpart person). Canon moved lockstep: the data-model sections of `docs/architecture.md` and `docs/adr/MMT-ADR-0026-whole-org-erasure-tears-down-surviving-edges.md` (Accepted).

**Verification:** The gap-targeted deletion tests in `apps/api/src/services/identity-v2/deletion-v2.test.ts` exercise the subscription-row and relationship-edge teardown and pass; the required CI lanes are green on the landed commit.

**Caveats / Follow-ups:** Full Stripe / RevenueCat store-side cancellation of the erased subscription is deferred to `WI-885` — the DB-row teardown here stops the RESTRICT-FK abort, while the external billing-cancel window is closed there; the advisory Flag-ON integration lane (`docs/change-classes.md`, Flag-ON Integration Lane advisory per WI-789) is not a close-blocker.
