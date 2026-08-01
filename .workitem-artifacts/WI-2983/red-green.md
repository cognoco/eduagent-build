# WI-2983 red-green evidence

## Red

- GitHub Actions run 30653298824 failed the normal API co-located integration
  lane at `payment-failed-alert.integration.test.ts:257` after the hard-coded
  2026-08-01 period end ceased to be future.
- GitHub Actions run 30687802948 independently failed the same assertion in
  both the normal and `IDENTITY_V2_ENABLED` lanes.
- Each run passed the rest of the surrounding API integration population apart
  from this one test, and neither originating PR changes the billing-alert
  service or test.

## Green

- `pnpm exec eslint apps/api/src/services/billing/payment-failed-alert.integration.test.ts`
- `pnpm exec prettier --check apps/api/src/services/billing/payment-failed-alert.integration.test.ts`
- `git diff --check`
- Exact-head ephemeral-database CI: pending PR execution.

## Revert and restore

The production diff is test-only. Restoring either fixed 2026-08-01 setup value
reproduces the already-captured date-boundary failure; restoring the derived
fixture makes setup and expectation share the same future instant. Exact-head CI
is the authoritative restore proof because it provisions the current schema
without touching a shared environment.
