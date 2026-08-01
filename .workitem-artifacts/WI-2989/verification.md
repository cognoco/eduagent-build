# WI-2989 verification

Date: 2026-08-01
Reviewed base: `c5cc41fe64632b782f61fcb281bc05b41a1262b4`

## Focused contract

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/routes/retention.test.ts \
  apps/api/src/services/retention-data.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts
```

- Exit code: `0`
- Suites: 3 / 3 successful
- Cases: 196 / 196 successful
- Snapshots: 0
- Covers deterministic `dont_remember`, active cooldown, lost claim, acquired
  claim restoration, thrown restoration failure, optimistic restoration
  rejection, active-consent dispatch, route mapping, and the structural
  consent/metering boundary.

## Routed validation

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
bash scripts/check-change-class.sh --run --fast
```

- Exit code: `0`
- Routed gates: 5 successful, 0 failed, 1 sanctioned slow integration lane
  skipped by `--fast`.
- Full incremental TypeScript build: successful.
- Prompt-marker guard: clean.
- API unit lane: all 506 suites successful; 10,142 cases successful, 11 skipped,
  and 3 snapshots successful.
- Whole-tree no-Gemini runtime ratchet: clean with 76 grandfathered sites and
  zero new sites.
- Test-only exports ratchet: 1 suite / 6 cases successful.

The database URL was an explicit disposable local database. No staging database,
schema, migration, secret, provider configuration, or deployment was touched.
