# WI-867 test-migration — per-file rollout brief (fresh builder)

**Context.** WI-867 collapses `IDENTITY_V2_ENABLED` to v2-only (source commit `7e0d75157`).
ic-204 (Option A) absorbed the test-migration INTO WI-867-A. The collapse makes the
v2 seams run UNCONDITIONALLY on the request path, breaking ~69 legacy-pinned unit
suites whose mock DBs never satisfied the v2 reads.

**REJECTED approach — do NOT repeat.** A prior builder added ~235 internal
`jest.mock('../services/identity-v2/...')` / `billing-v2` calls with blanket
`gc1-allow` "covered by integration tests". That INCREASES internal-mock count
(opposite of the GC6 burn-down), and `gc1-allow` is doctrine-reserved for code
that genuinely can't run in the test env — `resolveIdentityV2` CAN run given DB
rows, so mocking it is abuse. That work was reset.

## Central foundation (already committed — build on it, don't touch)

1. **`packages/test-utils/src/lib/neon-mock.ts`** — `db.select()` chain now resolves
   to `[]` per its own documented contract (was a truthy garbage proxy that crashed
   on `rows[0].field`). Also adds a non-enumerable `__defaultMockDb` marker.
2. **`apps/api/src/test-utils/database-module.ts`** — `seedV2IdentityGraph` seeds the
   canonical OWNER identity graph (`login`→`membership`→`organization`) into the db
   `createDatabaseModuleMock` hands the middleware, so the REAL `resolveIdentityV2`
   resolves (account/org id `test-account-id`, person id `test-profile-id`). Tests
   override `db.query.{login,membership,organization}` for graphless/non-owner.
3. **`apps/api/src/test-utils/identity-v2-scope-mock.ts`** — `personScope()` shape
   builder + the per-file continuity-mock recipe (in its header comment).

These three turn the SEAM crashes into clean resolution. Seam classes:

| Seam | Mechanism | Disposition |
|---|---|---|
| `resolveIdentityV2` (account-resolve mw) | `db.query.*` table-keyed | **seeded centrally — never mock it** |
| `findOwnerPersonScope`/`getPersonScope` (profile-scope mw) | `db.select()` chain | per-file continuity mock of `services/identity-v2/profile-v2` |
| family/parent-access (parent→child routes, e.g. dashboard `assertParentAccess`) | `db.select()` chain (`services/.../family-v2` etc.) | per-file continuity mock, same pattern |
| billing-v2 quota/subscription (billing routes, metering mw) | mostly `db.select()` | per-file continuity mock of the billing-v2 fn(s) the route calls |

## Per-file recipe

For each failing route/function test file:

1. **Mirror, don't invent.** The file ALREADY mocked the LEGACY equivalent
   (`services/profile` `findOwnerProfile`/`getProfile`; legacy family-link/child
   services). Add the v2 continuity mock that returns the SAME values under the
   renamed v2 function — preserving the file's per-test defaults (including `null`
   defaults — e.g. dashboard's `findOwnerProfile` defaulted to `null`) and per-test
   overrides. Use `mock`-prefixed consts (jest hoisting) + `personScope()`.
2. **gc1-allow only for `db.select`-chain seams**, justified as *continuity* (replaces
   the pre-collapse legacy mock; db.select chain unrunnable on the unit mock DB; real
   path covered by the identity/billing integration suite). NEVER add a mock for
   `identity-resolve`/`resolveIdentityV2` (seeded centrally).
3. **DELETE obsolete flag-gating tests** — e.g. `returns 401 when flag off — confirms
   the branch is flag-gated`. The collapse removed that branch; the test asserts dead
   behavior. Frame as the collapse's natural consequence + GC burn-down in the PR body.
4. **`account/*` (ic-204 guardrail 2):** NO integration twin — migrate/add one; don't
   just delete. Zero net coverage hole on account/*.

## Discriminator (per test case)

- Crash-on-seam + asserts BUSINESS logic, no integration twin → KEEP + continuity mock.
- Asserts v2 GUARDIAN/CONSENT/RELATIONSHIP behavior AND a NAMED v2 integration twin
  covers it → DELETE the case; mapping (deleted → covering twin) in the PR body.
- Asserts the removed `identityV2Enabled` opts threading → UPDATE the assertion.
- Asserts a LEGACY handler/fn was called → DELETE.

## Canonical example

`apps/api/src/routes/dashboard.test.ts` (partial): shows profile-v2 continuity wiring
(`mockFindOwnerPersonScope` default `null`, `mockGetPersonScope` default owner, non-owner
override). Residual child-route 403s need the family/parent-access continuity mock —
the SAME pattern against the route's `services/.../family-v2` (or equivalent) import.
Finish dashboard as the first rollout file.

## Anti-stall (hard rules)

- Targeted cluster runs only; NEVER block on a full-suite run (background it if needed).
- Commit incrementally per cluster; emit progress lines; no 600s silent grinds.
- Push with EXPLICIT refspec `HEAD:WI-867` (never bare). Do NOT open a PR — the
  shepherd merges.
