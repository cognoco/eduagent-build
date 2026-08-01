# WI-2987 verification

Date: 2026-08-01
Reviewed base: `f20fe9bf8`
Runtime: Node `22.16.0`

## Focused contract

```sh
DATABASE_URL=postgresql://vetinari@localhost:5432/tests_v2 \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/routes/dictation.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts
```

- Exit code: `0`
- Suites: 2 / 2 successful
- Cases: 84 / 84 successful
- Covers withdrawn-consent rate exhaustion, aggregate prompt-budget rejection,
  LLM-ready consent denial/no-dispatch, active-consent dispatch, and structural
  rate/budget -> consent -> provider-dispatch ordering.

## Routed validation

```sh
DATABASE_URL=postgresql://vetinari@localhost:5432/tests_v2 \
bash scripts/check-change-class.sh --run --fast
```

- Exit code: `0`
- Routed gates: 4 successful, 0 failed, 1 sanctioned slow integration lane
  skipped by `--fast`.
- Full incremental TypeScript build: successful.
- API unit lane: all 506 suites successful; 10,152 cases successful, 9 skipped,
  and 3 snapshots successful.
- Whole-tree no-Gemini runtime ratchet: clean with 76 grandfathered sites and
  zero new sites.
- Test-only exports ratchet: 1 suite / 6 cases successful.

## Static checks

- ESLint on the four touched production/test files: successful (the standalone
  invocation emitted only the repository's known uncached Nx graph warning).
- Prettier check on all four files: successful.
- `git diff --check`: successful.

The database URL was an explicit disposable local database. No staging database,
schema, migration, secret, provider configuration, rate-limit policy, metering
policy, or deployment was touched.
