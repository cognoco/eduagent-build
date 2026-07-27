# WI-2398 — Red-Green-Revert Evidence

Regression test: `tests/integration/wi2398-write-idor.integration.test.ts`
Mandatory test: `[MANDATORY][AC-1] POST /v1/subjects/:subjectId/curriculum/skip: peer spoofing X-Profile-Id=owner is denied (403) and the topic is not skipped` (line 153).

Command executed at each step (real Postgres DB, no mocks):

```
pnpm exec jest --config tests/integration/jest.config.cjs --testPathPatterns=wi2398 -t "MANDATORY"
```

## Cycle

| Step | Fix files (`apps/api/src/middleware/proxy-guard.ts`, `apps/api/src/services/family-access.ts`) | Result | Interpretation |
|---|---|---|---|
| 1. RED | pre-fix (git stash) | `expect(res.status).toBe(403)` FAILED — received 200 | Confirms the IDOR at pre-fix code: a non-owner member spoofing `X-Profile-Id` to the owner's profile id can skip the owner's curriculum topic (mutation applies, `curriculumTopics.skipped` flips to `true`). |
| 2. GREEN | fix restored (git stash pop) | PASSED | Confirms the fix closes the gap: same attack now returns 403, target topic row unchanged. |
| 3. REVERT | pre-fix again (git stash) | FAILED — received 200 (reproduced) | Confirms the red state reproduces reliably, not a one-off. |
| 4. RESTORED | fix restored (git stash pop) | PASSED | Final state — fix in place. |

## Full AC-1 / AC-2 suite at final (restored) state

```
pnpm exec jest --config tests/integration/jest.config.cjs --testPathPatterns=wi2398
```

Result: 4/4 passed —

- `[MANDATORY][AC-1] ... peer spoofing X-Profile-Id=owner is denied (403) and the topic is not skipped` — PASS
- `[AC-1] control: owner acting as themselves (no spoof) can skip their own topic` — PASS
- `[AC-2] PATCH /v1/onboarding/pronouns: peer spoofing X-Profile-Id=owner is denied (403) and pronouns are not mutated` — PASS
- `[AC-2] control: owner acting as themselves (no spoof) can set their own pronouns` — PASS

## Regression sweep

Full `apps/api` unit/route test suite (`pnpm exec jest --no-coverage` from `apps/api/`) at final state: 467/467 suites, 8732/8741 tests passed (9 pre-existing skips), 0 failures.

`pnpm exec nx run api:typecheck`: clean.
`pnpm exec nx run api:lint`: 0 errors (44 pre-existing warnings, none in touched files).
