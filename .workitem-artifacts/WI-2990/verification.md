# WI-2990 verification

Date: 2026-08-01
Reviewed base: `021ab325bef0cb00d1d4a73da72542943090620c`

## Focused contract

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/routes/assessments.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts
```

- Exit code: `0`
- Suites: 2 / 2 successful
- Cases: 61 / 61 successful
- Snapshots: 0
- Covers invalid-schema handler exclusion; missing and scoped-hidden session
  `404` behavior under withdrawn consent; topic-scoped and topicless consent
  denial before dispatch; active-consent topic and general-context dispatch;
  response preservation; and the structural consent/metering boundary.

## Routed validation

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
bash scripts/check-change-class.sh --run --fast
```

- Exit code: `0`
- Routed gates: 4 successful, 0 failed, 1 sanctioned slow integration lane
  skipped by `--fast`.
- Full incremental TypeScript build: successful.
- API unit lane: all 506 suites successful; 10,149 cases successful, 11 skipped,
  and 3 snapshots successful.
- Whole-tree no-Gemini runtime ratchet: clean with 76 grandfathered sites and
  zero new sites.
- Test-only exports ratchet: 1 suite / 6 cases successful.

## Scope and delivery gates

The implementation diff is limited to the four authorized route, route-test,
manifest, and structural-guard files plus WI lifecycle evidence. Quick-check
metering remains route-owned. No schema, migration, session policy,
scoped-repository ownership rule, response schema, prompt, model, provider
routing, secret, environment, provider configuration, staging, production, or
deployment surface changed.

Exact-head adversarial review is an external PR landing prerequisite and is not
self-attested by this builder-authored file. The GitHub review and check state
for the final PR head is authoritative for that gate.

The database URL was an explicit disposable local database. No database schema
or durable data was mutated by these validations.
