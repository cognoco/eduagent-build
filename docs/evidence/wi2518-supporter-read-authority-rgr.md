# WI-2518 supporter-read authority — red/green/revert/restore evidence

Date: 2026-07-31  
Base revision: `b9d2b3c4edb5bfe5b1c39a77e0a8beb4cf55edb9`

## Regression guard

The route-level guard models the exploitable identity split directly:

- `profileId` is another same-account profile selected through the header.
- `callerPersonId` is the credentialed non-owner's server-resolved login
  identity.
- the selected profile has the accepted supporter edge; the caller does not.
- the mocked read service returns data for the selected edge-holder and throws
  `ForbiddenError` for the real caller, matching the real service contract.

Durable tests:

- `apps/api/src/routes/now.test.ts` — both `/now` and `/now/overflow` person
  reads must bind the builder to `callerPersonId` and return 403 for the
  borrowed-edge case.
- `apps/api/src/routes/scopes.test.ts` — structural subjects must pass
  `callerPersonId`, returning 403 when only the selected profile owns an edge.
- `apps/api/src/routes/now.integration.test.ts` and
  `apps/api/src/routes/scopes.integration.test.ts` — real-database same-org,
  credentialed learner-role fixtures cover borrowed-edge denial, honest-header
  success, selected-profile-only edge rejection, and empty borrowed hub.
- `tests/integration/wi2518-supporter-read-authority.integration.test.ts` —
  signed caller credential through the real app/middleware chain, with
  `X-Profile-Id` as the only attacker-controlled identity selector; covers
  person and supporter-hub reads on both Now endpoints plus structural
  subjects.

## RED — tests before production fix

Command:

```text
DATABASE_URL=postgresql://test:test@localhost:5432/mentomate_test pnpm exec jest --config apps/api/jest.config.cjs --runInBand --runTestsByPath apps/api/src/routes/now.test.ts apps/api/src/routes/scopes.test.ts
```

Result: exit 1. The three attack-path assertions failed for the expected
reason:

- `/v1/now`: expected 403, received 200.
- `/v1/now/overflow`: expected 403, received 200.
- `/v1/scopes/:personId/subjects`: expected 403, received 200.

The delivery-finisher reproduction retained the complete final test diff while
stashing only the four production files. That current test shape reports 12
failures and 15 passes: the three attack-path assertions above, plus nine
builder-argument assertions showing that `callerPersonId` was absent from the
Now service options. All failures were authority-threading failures caused by
removing the production fix.

## GREEN — fix applied

Command:

```text
DATABASE_URL=postgresql://test:test@localhost:5432/mentomate_test pnpm exec jest --config apps/api/jest.config.cjs --runInBand --runTestsByPath apps/api/src/routes/now.test.ts apps/api/src/routes/scopes.test.ts apps/api/src/services/now-feed.test.ts
```

Result: exit 0 — 3 suites, 44 tests passed.

## REVERT RED — production fix removed, tests retained

The production-only changes in `route-context.ts`, `now.ts`, `scopes.ts`, and
`now-feed.ts` were reverted while the regression tests remained.

Command: same focused route command as RED.

Result: exit 1. The borrowed-edge assertions returned 200 instead of 403 again;
the Now argument assertions also showed that `callerPersonId` was absent from
the builder options (2 suites failed; 12 failed and 15 passed). This confirms
the tests depend on the authority fix, not on incidental fixture behavior.

## RESTORE GREEN — production fix restored

Command: same 3-suite command as GREEN.

Result: exit 0 — 3 suites, 44 tests passed.

## Real-database runner blocker

`WI-2958` — the separately admitted disposable-schema operation; currently
Ready — owns the canonical integration runner's missing identity schema. The
delivery-finisher did not rerun either database-writing command below and did
not mutate or reset any database.

The implementation session recorded this command before the production fix:

```text
node scripts/doppler-run.mjs run --project mentomate --config dev_integration -- node scripts/run-api-integration.mjs --jest --runTestsByPath apps/api/src/routes/now.integration.test.ts apps/api/src/routes/scopes.integration.test.ts --runInBand
```

Result: exit 1 before any WI-2518 assertion. The canonical `dev_integration`
database reported `relation "organization" does not exist`; pre-existing tests
and cleanup (`subscription`) failed for the same missing identity schema. This
is the WI-2958 integration-infrastructure blocker, not evidence that the
WI-2518 assertions failed.

The exact end-to-end regression file was also attempted independently:

```text
node scripts/doppler-run.mjs run --project mentomate --config dev_integration -- pnpm exec jest --config tests/integration/jest.config.cjs --runInBand tests/integration/wi2518-supporter-read-authority.integration.test.ts
```

Result: exit 1 in `beforeEach`, before the test body, because the same database
also lacks the `login` table. Both failures locate the blocker in the canonical
integration schema rather than in a WI-2518 assertion.

## Preserved WI-2237 boundary

The production change does not modify `acceptedVisibilityCondition()`,
`acceptedSupporterAccessExists()`, or the correlated `EXISTS` in
`readSupporteeStructuralSubjects`. The broader validation reruns the existing
pending/accepted unit coverage; the real-database WI-2237 matrix remains
blocked only by the integration database schema residue above.

## Final validation

- Focused authorization/visibility set: 6 suites, 72 tests passed.
- Full API unit set: 506 suites passed; 10,056 passed, 11 skipped; 3 snapshots
  passed.
- `pnpm typecheck:integration`: passed (72 Jest-selected roots, including the
  new end-to-end test).
- `pnpm exec tsc --build`: passed.
- `nx run api:typecheck` and `nx run api:lint`: passed with `NX_DAEMON=false`;
  API lint reported 0 errors and 55 existing warnings outside the changed
  files.
- Changed-file ESLint: passed.
- Prompt-marker, no-Gemini-runtime, test-only-export, and profile-read-authority
  ratchets: passed.
