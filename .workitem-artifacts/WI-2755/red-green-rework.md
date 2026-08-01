# WI-2755 rework red/green evidence

All commands used an explicit loopback-only placeholder URL. No database connection was attempted by this focused unit suite.

## Initial red

Command:

`DATABASE_URL=postgresql://test:test@127.0.0.1:5433/eduagent_test DIRECT_URL= corepack pnpm exec jest -c apps/api/jest.config.cjs apps/api/src/db/profiles-dropped-migrate-replay-teardown.test.ts --runInBand --no-coverage`

Before the resolver implementation existed, Jest failed with `Cannot find module './scratch-database-url'`.

## Green

After implementing direct-endpoint selection, the focused suite passed: one suite and five tests.

## Symptom-matching mutation red

The Neon-pooler branch was temporarily changed to return the original pooled `DATABASE_URL`. The behavioral regression then failed because the received hostname still contained `-pooler`, reproducing the connection-selection defect that left PgBouncer's idle backend attached to the scratch database.

## Restored green

The direct-endpoint conversion was restored. The focused suite again passed: one suite and five tests. The temporary mutation is not present in the submitted diff.
