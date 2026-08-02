# WI-2988 verification

Date: 2026-08-02
Reviewed base: `ad5cefdd1d69ac81099417fe116c8bf035f93be7`
Runtime: Node `22.16.0`

## Focused contract

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/routes/homework.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts
```

- Exit code: `0`
- Suites: 2 / 2 successful
- Cases: 57 / 57 successful
- Covers withdrawn-consent declared Content-Length rejection, missing and
  non-file image fields, unsupported MIME, over-limit file rejection, all three
  accepted MIME variants, active-consent single dispatch, and structural
  validation -> consent -> provider ordering.

## Routed validation

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
bash scripts/check-change-class.sh --run --fast
```

- Exit code: `0`
- Routed gates: 4 successful, 0 failed, 1 sanctioned slow integration lane
  skipped by `--fast`.
- Full incremental TypeScript build: successful.
- API unit lane: all 508 suites successful; 10,215 cases successful, 9 skipped,
  and 3 snapshots successful.
- Whole-tree no-Gemini runtime ratchet: clean with 76 grandfathered sites and
  zero new sites.
- Test-only exports ratchet: 1 suite / 6 cases successful.

## Static checks

- ESLint on the four touched production/test files: successful; the standalone
  invocation emitted only the repository's known uncached Nx graph warning.
- Prettier check on all four files: successful.
- `git diff --check`: successful.

## Scope audit

The code and test diff is limited to the four authorized collision files:

- `apps/api/src/routes/homework.ts`
- `apps/api/src/routes/homework.test.ts`
- `apps/api/src/middleware/metering.coverage.manifest.ts`
- `apps/api/src/middleware/metering.coverage.guard.test.ts`

The accepted MIME set, exact byte limits, declared Content-Length behavior,
chunked-upload limitation, provider selection/configuration, response schema,
and metering are unchanged. No OCR service file, schema, migration, upload
policy, prompt/model/provider routing, unrelated consent policy, secret,
environment, staging service, or deployment was touched.

The edited route test contains nine pre-existing relative internal module mocks.
They were not introduced or expanded here. Removing them would require an
unrelated rewrite of the route-level database, auth, billing, session, OCR, and
consent test scaffold, so this focused XS fix uses the repository-documented GC6
deferral and records the exact file and count.

Exact-head strict-green Adversarial review remains an external landing gate.
