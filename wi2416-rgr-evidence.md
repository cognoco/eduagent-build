# WI-2416 — Red-Green-Revert Evidence

Representative HIGH route: **`GET /v1/recaps/self`** (G1).
Break test: `[MANDATORY][AC-2/AC-4][G1] GET /v1/recaps/self: peer spoofing X-Profile-Id is denied (403) and their recap data is not leaked` in `tests/integration/wi2416-read-idor.integration.test.ts`.

Mechanism: `await assertCanReadProfile(c, profileId);` inserted in `apps/api/src/routes/recaps.ts` (`.get('/recaps/self', ...)` handler) immediately after `const { db, profileId } = withProfile(c);`, before the recap read.

Executed against the real staging DB (Doppler `stg` config, Node 22) via:

```
doppler run -- pnpm exec jest --config tests/integration/jest.config.cjs --no-coverage \
  tests/integration/wi2416-read-idor.integration.test.ts -t "MANDATORY"
```

## Cycle

| Step | Guard line present | Result | Status |
|---|---|---|---|
| 1. RED (current main / unfixed) | removed | `GET /v1/recaps/self` with `X-Profile-Id` spoofed to a same-org credentialed peer returned **200** — peer B's recap leaked to caller A | Test failed as expected: `Expected: 403, Received: 200` |
| 2. GREEN (fix applied) | present | Same request returned **403**, response body contained none of peer B's seeded recap content | Test passed |
| 3. REVERT (fix removed again) | removed | Same request returned **200** again — leak reproduced | Test failed again: `Expected: 403, Received: 200` |
| 4. RESTORE (fix reapplied — final PR state) | present | Same request returned **403** | Test passed; full 8-test suite green |

No token, secret, or environment-variable values were captured at any step — only HTTP status codes and pass/fail outcomes.

## AC-5 forward-guard red-green (separate, smaller cycle)

The `services/profile-read-authority.guard.test.ts` ratchet was also independently exercised red→green:

1. Removed the `assertCanReadProfile` call from `GET /recaps/self` (same edit as above).
2. Ran the guard suite: `no NEW unguarded profile-scoped GET route` failed, pointing at `apps/api/src/routes/recaps.ts:63 GET /recaps/self`.
3. Restored the call — guard suite green again (7/7 tests passing).

## Outcome

Final worktree state has the fix applied (step 4 / restore). All 8 tests in `wi2416-read-idor.integration.test.ts` pass; the `profile-read-authority.guard.test.ts` ratchet is green against the current tree (73 pre-existing, out-of-scope gaps grandfathered in `profile-read-authority-baseline.json`).
