# WI-2128 — red-green-revert evidence

Regression under test:
`tests/integration/wi2128-family-join-identity.integration.test.ts`
(real Postgres, two synthetic Clerk subjects, real
JWT → accountMiddleware → profileScopeMiddleware → route chain, no mocks of
internal code).

Database: staging Neon (`ep-fancy-cherry-…`, migrate-managed). The dev Neon
branch cannot run this suite — it is `db:push`-managed and has drifted
(`column "past_due_at" of relation "subscription" does not exist`), which is
the pre-existing dev schema-drift trap, not a fault of this change.

## Root cause — first authority substitution

The Clerk-subject → Person binding is correct all the way to the middleware:

1. `apps/api/src/services/identity-v2/identity-resolve.ts:97` —
   `resolveIdentityV2` returns `personId: loginRow.personId`, i.e. the Person
   named by the verified Clerk subject's `login.person_id`. Correct before and
   after family join; only the organization id changes.
2. `apps/api/src/middleware/account.ts:156` —
   `c.set('callerPersonId', resolved.personId)`. Correct: `callerPersonId` is
   the learner.
3. **`apps/api/src/middleware/profile-scope.ts:145` (pre-fix, `f6278efd9`) —
   `const ownerScope = await findOwnerPersonScope(db, account.id);`**
   ← **the first authority decision that substitutes the owner Person.**
   The headerless branch discards the correct `callerPersonId` and re-resolves
   by *organization*, so every joined learner request without an explicit
   `X-Profile-Id` is scoped to the family owner's Person.

The explicit-header branch is the second seam: pre-fix it verified organization
*membership* only, which admits any same-org Person (owner, sibling) into
profile context.

## RED — full pre-fix production code + the new test

All five API production files reverted to `origin/main` (`f6278efd9`), test kept:

```
git checkout f6278efd9 -- \
  apps/api/src/middleware/profile-scope.ts \
  apps/api/src/middleware/proxy-guard.ts \
  apps/api/src/routes/profiles.ts \
  apps/api/src/services/identity-v2/ownership-v2.ts \
  apps/api/src/services/identity-v2/profile-v2.ts
```

Result: **6 failed, 7 passed, 13 total.**

Failing tests and their pre-fix behaviour:

| Test | Pre-fix result |
|---|---|
| `[MANDATORY][RED-GREEN-REVERT] resolves a headerless learner request to the learner Person, never the family owner` | 403 — the learner cannot reach its own `/v1/learner-profile`; the owner Person was substituted and a downstream owner/proxy gate then refused |
| `returns only profiles the authenticated learner may operate…` | `GET /v1/profiles` returned **4 Person ids** (learner + owner + sibling + managed charge) instead of 1 — cross-Person roster disclosure |
| `[MANDATORY] does not disclose the owner through a learner profile-create replay` | **201** instead of 403 — owner payload disclosed through the idempotent replay branch |
| `[MANDATORY] allows a joined learner self-write while rejecting guardian proxy writes` | 403 — learner blocked from its own self-write |
| `fails closed on a non-owned profile route parameter while preserving guardian access` | failed |
| `does not let the learner fresh-factor token elevate into the owner Person` | failed |

The substitution therefore manifests two ways from one root cause: the learner
is **denied its own** self surfaces, and the **family roster / owner payload
leaks** to the learner credential.

A partial revert (headerless resolution only, proxy-guard fix left in place)
was rejected as invalid evidence: it failed with a 403 raised by the *retained*
fix rather than reproducing the vulnerability. Only the full revert above is
cited as the red.

## GREEN — fix restored

Working tree restored to the committed state; suite re-run unchanged:

**13 passed, 13 total.**

## Supporting validation

| Check | Result |
|---|---|
| `nx run api:typecheck --skip-nx-cache` | pass |
| `nx run api:test --skip-nx-cache` | 496/496 suites, 9937 passed, 9 skipped |
| `nx run api:lint --skip-nx-cache` | 0 errors (55 pre-existing repo-wide warnings) |
| mobile `jest --findRelatedTests` (profile.ts, use-profiles.ts, use-parent-proxy.ts) | 197 suites, 3319 passed |
| mobile `navigation-contract-usage-guard.test.ts` | 6 passed |
| `apps/mobile` `tsc --noEmit` | pass |
| i18n orphans / staleness / JSX-literal ratchet, no-gemini-runtime, prompt-markers | pass |
| `nx run api:integration-api` (co-located suite) | **not runnable locally** — the runner requires a Doppler config named `integration`; project `mentomate` has only `dev`, `dev_personal`, `stg`, `prd`. CI is the gate for this suite. |

## Containment

`FAMILY_JOIN_ENABLED` gates the whole `/v1/family-join/*` surface at the top of
the middleware chain and is fail-closed — only the exact string `'true'` opens
it (`apps/api/src/middleware/family-join-gate.ts:62`).

| Environment | Value | Family join |
|---|---|---|
| production | secret absent → default `'false'` | **dark** |
| dev | secret absent → default `'false'` | **dark** |
| staging | `'true'` | **ARMED** |

Staging is not contained. Flagged for the orchestrator; deliberately not
changed here.
