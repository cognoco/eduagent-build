# Plan: WI-730 — Derive retry-filing cap from FILING_CONFIG.maxRetries

## Premise (confirmed)

`apps/api/src/services/session/session-crud.ts` line 1934:
```ts
lt(learningSessions.filingRetryCount, 3),
```
`FILING_CONFIG` is already imported at line 77 (`import { FILING_CONFIG } from '../../config/filing';`).
`FILING_CONFIG.maxRetries = 3` (apps/api/src/config/filing.ts).

## Fix

Replace the literal `3` with `FILING_CONFIG.maxRetries`:
```ts
lt(learningSessions.filingRetryCount, FILING_CONFIG.maxRetries),
```

No import changes needed — `FILING_CONFIG` is already imported.

## Regression test

File: `apps/api/src/services/session/session-crud.test.ts`

Test: `claimSessionForFilingRetry — rejects a session at filingRetryCount == FILING_CONFIG.maxRetries (cap is config-driven, not hardcoded)`

Strategy: build a minimal fake `db` that:
- Captures the `where` predicate passed to `update().set().where().returning()`
- Returns `[]` when `filingRetryCount` equals the cap (simulating the cap rejecting the claim)
- We test with `FILING_CONFIG.maxRetries` temporarily lowered by importing FILING_CONFIG and changing the effective cap: we use a direct structural approach — test against cap=2 by having the DB return `[]` only when the predicate would reject count==2, and verify the returned value is `undefined`.

Simpler approach (matching existing db-mock pattern in the file):
- Build a chainable `db` mock where `.update().set().where().returning()` returns `[]` (no row matched = claim rejected)
- Assert `claimSessionForFilingRetry(db, profileId, sessionId)` resolves to `undefined`
- To verify the config-driven binding, we test two cases:
  1. `filingRetryCount < FILING_CONFIG.maxRetries` → row returned (claimed)
  2. `filingRetryCount == FILING_CONFIG.maxRetries` → no row returned (rejected)
  
Since the predicate logic is inside Drizzle's `lt()` (not our code), the easiest approach is:
- Test the DB predicate inspection: walk the where-clause and confirm the cap value IS `FILING_CONFIG.maxRetries` not a literal 3
- OR: test via a thin integration — but we must not mock internal modules (GC1/GC6)

Best approach for this test: use a mock DB (external boundary — the DB is an external dependency in service unit tests; the `db` param is always faked in session-crud.test.ts per the existing pattern). Inspect the `where` predicate passed to `update()`, extract the cap value, assert it equals `FILING_CONFIG.maxRetries`.

## Acceptance criteria checklist

- [ ] `lt(learningSessions.filingRetryCount, 3)` → `lt(learningSessions.filingRetryCount, FILING_CONFIG.maxRetries)` at line 1934
- [ ] Regression test added to `session-crud.test.ts`
- [ ] Test would fail WITHOUT the fix (cap would be 3 = hardcoded literal 3 ≠ what's inspected when maxRetries changes)
- [ ] `pnpm exec nx run api:typecheck` passes
- [ ] `cd apps/api && pnpm exec jest --findRelatedTests src/services/session/session-crud.ts --no-coverage` passes
