# WI-2434 — red-green-revert evidence

Reject old cw2 bearer tokens against newer tokenless consent grants.

## Scope confirmed at GATE-0

- Baseline: current `origin/main` at claim time (`a7608f5a1`), not the
  captured/reviewed commit `882f14ba5`.
- `stampWithdrawal` (`apps/api/src/services/identity-v2/consent-v2.ts:1122`)
  and `getGdprGrantWithdrawalStateV2` (`apps/api/src/services/identity-v2/consent-v2.ts:1615`)
  both used a null-wildcard comparison
  (`expectedTokenId !== undefined && current.withdrawalTokenId !== null && current.withdrawalTokenId !== expectedTokenId`)
  — an old, defined `cw2` `expectedTokenId` matched ANY current grant whose
  `withdrawalTokenId` was `null`, including a fresh tokenless grant appended
  after the old token's grant was superseded/withdrawn. Confirmed bug present
  at current main.
- `appendRestoreGrant` (`apps/api/src/services/identity-v2/consent-v2.ts:1214`)
  no longer accepts `expectedTokenId` (removed by WI-2348,
  commit `fa76715d4`) — confirmed OUT of scope, per the WI's PM-ratified
  refinement notes. Fix scope = `stampWithdrawal` + `getGdprGrantWithdrawalStateV2`
  only.

## Cycle executed

Test file:
`apps/api/src/services/identity-v2/consent-v2.integration.test.ts`
(new `describe('[WI-2434] exact-match token equality (no null-as-wildcard)', ...)`
block, ~lines 859-975: two named regression tests + an `it.each` six-row
matrix.)

1. **RED (pre-fix, current origin/main code)** — ran the new WI-2434 tests
   (`-t "WI-2434"`) against the unmodified `consent-v2.ts`:
   `PASS (5) FAIL (3) skipped (59)`. The 3 failures were exactly the two
   named regression tests (AC-1/AC-2, AC-3) and the matrix row
   `"cw2 id vs tokenless current grant -> REJECT (WI-2434 fix target)"` — the
   old-cw2-vs-tokenless case was wrongly ACCEPTED / returned non-null state.
   The other 5 matrix rows (unaffected pre-existing behavior) already
   passed.
2. **Fix applied** — replaced the null-wildcard condition with exact
   equality (`expectedTokenId !== undefined && current.withdrawalTokenId !== expectedTokenId`)
   in both functions; corrected the two docblocks that described the
   null-as-wildcard contract to state exact-match instead.
3. **GREEN (post-fix)** — ran the full file:
   `PASS (67) FAIL (0)`. All existing withdrawal/restore/idempotency/
   non-enumeration/expiry coverage stayed green alongside the new tests.
4. **REVERT** — `git stash push -- apps/api/src/services/identity-v2/consent-v2.ts`
   to restore the pre-fix code with the new tests still in place; re-ran
   `-t "WI-2434"`: `PASS (5) FAIL (3) skipped (59)` — identical 3 failures
   reproduced.
5. **RESTORE** — `git stash pop`; re-ran the full file:
   `PASS (67) FAIL (0)`.

## Additional regression coverage run

- `apps/api/src/routes/consent-web.test.ts` (unit, the web route that calls
  `withdrawConsentByToken` / `getGdprGrantWithdrawalStateV2`): `PASS (19) FAIL (0)`.
- `apps/api/src/routes/consent-web.integration.test.ts`: `PASS (42) FAIL (0)`.
- `pnpm exec nx run api:typecheck`: success.
- `pnpm exec nx run api:lint`: 0 errors (pre-existing warnings in unrelated
  files only).

## Toolchain note

Local Node is v24 (breaks eduagent-build's pre-push `helpers.test.ts` per
repo convention); all test/typecheck/lint runs above used a local Node 22
binary (`~/.local/node22/bin`) on `PATH`, matching the repo's declared
`engines.node: 22.x`. Commit/push hooks run under Node 22 the same way.
