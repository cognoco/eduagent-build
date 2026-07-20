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

## Reachability caveat (surfaced by pre-PR adversarial review)

The comparison-logic bug itself is unambiguously confirmed by reading the
source (the null-wildcard condition is exactly as described above). Separately,
the AC-1 "old cw2-tokened grant, then a later tokenless grant, same
person+org+basis" state is **not currently reachable through any live
`apps/api` write path** — verified by tracing every `insert(consentGrant)`
site for the `gdpr_parental_consent` basis:
- `processConsentResponseV2` mints `withdrawalTokenId = crypto.randomUUID()`
  on every `approved` branch (`consent-v2.ts:822`) — never `null` after an
  approve.
- `createDirectConsentGrant` (the only tokenless-grant writer) is called
  exclusively from `createChildProfileV2` (`child-profile-v2.ts:210`) inside
  the same transaction as the person's own creation — it cannot fire for a
  `chargePersonId` that already holds a prior grant.
- `appendRestoreGrant` carries the **current** grant's `withdrawalTokenId`
  forward unchanged (`consent-v2.ts:1273`) — it cannot null it.
- No `UPDATE` anywhere in the repo sets `withdrawalTokenId` to `null`
  (grepped repo-wide).

AC-1's literal wording asks for a "constructible state" with a "test fixture
building that grant sequence" — which is what the tests below do, directly at
the DB layer. The fix is correct, necessary boolean-logic hardening (exact
equality is strictly more correct than the null-wildcard it replaces) and
matches the AC's literal ask; it should ship regardless. But the test
comments and evidence below deliberately do NOT claim this is a
currently-exploitable production path — only that the state is constructible
and that the guard now handles it correctly. Flagged to the shepherd/PM in
the final report; not resolved by narrowing or reinterpreting the AC (no
authority to do that as builder) — resolved by keeping the evidence honest
about what "reachable" means here.

## Cycle executed

Test file:
`apps/api/src/services/identity-v2/consent-v2.integration.test.ts`
(new `describe('[WI-2434] exact-match token equality (no null-as-wildcard)', ...)`
block: two named regression tests (AC-1/AC-2 construct the state at the DB
layer — an earlier cw2-minted grant withdrawn via that token, then a fresh
tokenless grant appended after, per the reachability caveat above; AC-3 the
read-path twin) + an `it.each` six-row matrix (AC-4) exercised against BOTH
`stampWithdrawal` (write path via `withdrawConsentByToken`) and
`getGdprGrantWithdrawalStateV2` (read path) per row.)

Cycle run twice — once with the initial (lone-row) fixtures, then again
after strengthening AC-1's fixture to the real reachable sequence and
extending AC-4 to drive both functions (post-review). Final cycle:

1. **RED (pre-fix, current origin/main code)** — `git checkout a7608f5a1 --
   apps/api/src/services/identity-v2/consent-v2.ts` (restores the exact
   pre-fix file content) with the new tests in place; ran `-t "WI-2434"`:
   `PASS (5) FAIL (3) skipped (59)`. The 3 failures were exactly the two
   named regression tests (AC-1/AC-2, AC-3) and the matrix row
   `"cw2 id vs tokenless current grant -> REJECT (WI-2434 fix target)"` — the
   old-cw2-vs-tokenless case was wrongly ACCEPTED / returned non-null state.
   The other 5 matrix rows (unaffected pre-existing behavior, both write and
   read paths) already passed.
2. **Fix applied** — replaced the null-wildcard condition with exact
   equality (`expectedTokenId !== undefined && current.withdrawalTokenId !== expectedTokenId`)
   in both functions; corrected the two docblocks that described the
   null-as-wildcard contract to state exact-match instead.
3. **GREEN (post-fix)** — ran the full file:
   `PASS (67) FAIL (0)`. All existing withdrawal/restore/idempotency/
   non-enumeration/expiry coverage stayed green alongside the new tests.
4. **REVERT** — `git checkout a7608f5a1 -- apps/api/src/services/identity-v2/consent-v2.ts`
   again, to restore the pre-fix code with the new tests still in place;
   re-ran `-t "WI-2434"`: `PASS (5) FAIL (3) skipped (59)` — identical 3
   failures reproduced.
5. **RESTORE** — `git checkout HEAD -- apps/api/src/services/identity-v2/consent-v2.ts`;
   re-ran the full file: `PASS (67) FAIL (0)`.

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
