# WI-2986 red/green evidence

## RED — 2026-08-01

Command:

`node scripts/doppler-run.mjs run --project mentomate --config dev_integration -- pnpm test:api:integration --jest apps/api/src/services/identity-v2/guardian-attachment.integration.test.ts --runInBand`

Result: 1 suite failed; 2 new regression tests failed and the 10 pre-existing tests passed.

- Response-loss replay returned a different token because the provider handle was redeemed twice.
- Reusing the same handle with a different learner tuple returned HTTP 200 instead of failing closed.

The run preceded all production-code and schema changes for WI-2986.

## GREEN

Pending revision-pinned disposable-schema bootstrap and rerun after the implementation commit.
