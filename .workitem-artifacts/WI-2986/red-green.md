# WI-2986 red/green evidence

## RED — 2026-08-01

Command:

`node scripts/doppler-run.mjs run --project mentomate --config dev_integration -- pnpm test:api:integration --jest apps/api/src/services/identity-v2/guardian-attachment.integration.test.ts --runInBand`

Result: 1 suite failed; 2 new regression tests failed and the 10 pre-existing tests passed.

- Response-loss replay returned a different token because the provider handle was redeemed twice.
- Reusing the same handle with a different learner tuple returned HTTP 200 instead of failing closed.

The run preceded all production-code and schema changes for WI-2986.

## GREEN

Revision: `9c0f357cb3369c88b25fa8e7259432cc18cf9702`

The shared remote disposable target was left untouched because its guarded
bootstrap marker belonged to another Orion session. Equivalent verification
ran against two isolated, ephemeral local `pgvector/pgvector:pg16` containers;
both containers and all test data were deleted immediately afterward.

- Fresh committed migration-chain replay: `pnpm --filter @eduagent/database run db:migrate` — passed through migration `0164_busy_mongu`; the new table exposed 21 columns and 13 constraints/FKs.
- Focused API integration: `pnpm test:api:integration --jest apps/api/src/services/identity-v2/guardian-attachment.integration.test.ts --runInBand` with an explicit local integration DSN — 15/15 passed.
- Database schema unit suite — 2/2 passed.
- Guardian authority-token unit suite — 8/8 passed.
- Guardian attachment mobile suites — 4/4 passed.
- API, database, and mobile TypeScript checks passed; the API Wrangler dry-run build passed.

The green integration matrix covers ordinary success, exact response-loss
recovery, concurrent duplicate redemption across two database connections,
mutated learner-tuple replay, provider success followed by missing local
persistence, and a correctly signed token without a durable receipt.
