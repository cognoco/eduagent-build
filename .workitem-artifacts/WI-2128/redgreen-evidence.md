# WI-2128 — authoritative red-green-revert evidence

Regression under test:
`tests/integration/wi2128-family-join-identity.integration.test.ts`
(real PostgreSQL, two synthetic Clerk subjects, and the real
JWT → account middleware → profile-scope middleware → route chain).

## Authoritative environment

All evidence cited by the final WI-2128 tree was produced against the
repository-sanctioned disposable local database from `docker-compose.test.yml`
on Orion, with an explicit local `DATABASE_URL`. No shared development or
staging database is part of the authoritative evidence.

The database started from its disposable tmpfs state. The schema was applied
after locally enabling the extensions required by the current schema. That
setup residue is tracked separately as WI-2893.

## Root cause — first authority substitution

The Clerk-subject → Person binding is correct through identity resolution:

1. `apps/api/src/services/identity-v2/identity-resolve.ts` returns the Person
   named by the verified Clerk subject's login.
2. `apps/api/src/middleware/account.ts` stores that Person as
   `callerPersonId`.
3. The pre-fix headerless branch in
   `apps/api/src/middleware/profile-scope.ts` discarded the correct
   `callerPersonId` and called `findOwnerPersonScope(db, account.id)`.
   Organization-owner lookup was therefore the first authority decision that
   substituted the family owner for the joined learner.

The explicit-header branch was a second authority seam because organization
membership alone admitted an owner or credentialed sibling into the learner
credential's profile context.

## RED — production-only first-substitution revert

The regression test remained unchanged. The headerless production call in
`apps/api/src/middleware/profile-scope.ts` was temporarily reverted from the
caller-bound:

```ts
getPersonScope(db, callerPersonId, account.id, callerPersonId)
```

to the pre-fix owner lookup:

```ts
findOwnerPersonScope(db, account.id)
```

The mandatory named case:

```text
resolves a headerless learner request to the learner Person, never the family owner
```

failed against that production-only revert: it expected HTTP 200 and received
HTTP 403. This reproduces the first owner-substitution boundary—the joined
learner no longer reaches its own profile once the headerless request is
rebound to the organization owner.

## RESTORE — exact production fix

The caller-bound `getPersonScope(...)` call was restored exactly and the same
named regression, unchanged, passed against the same local database.

The then-current WI-specific real-database suite passed all 13 cases in this
historical pre-review-bounce run. The later 15-case corrective run is recorded
in `verification.md`. This historical run covered:

- learner and owner headerless self-binding;
- fail-closed owner, credentialed-sibling, and unrelated-Person headers;
- learner self-write and guardian proxy-write boundaries;
- owner operation of an uncredentialed managed charge;
- profile-list and profile-create replay disclosure boundaries;
- fresh-factor non-elevation; and
- preserved Person, learning history, family membership, supportership, and
  billing relationships.

## Supporting validation

| Check | Result |
|---|---|
| Full API unit suite with explicit local database URL | 496 suites passed; 9,937 tests passed; 9 skipped |
| All 19 touched API suites with explicit local database URL | pass |
| Five touched mobile suites | 217 tests passed |
| API typecheck | pass |
| Mobile TypeScript check | pass |
| Changed-file ESLint | pass |
| Prompt-marker, i18n, no-Gemini-runtime, and test-only-export guards | pass |

The repository-wide integration typecheck has an unrelated current-main
fixture drift in the memory workstream. It is captured as WI-2896 and is not
part of WI-2128 or BID-49.

## Superseded evidence provenance

Commit `87ed9032d4e87244d4fd23f3b4d499766252944e` was created and pushed by an
unowned concurrent process before executor handoff. Its original version of
this file cited a shared-staging database run and environment containment
values. That run was unsanctioned for this executor and is non-authoritative;
none of its environment or containment claims are relied on by WI-2128.

The immutable commit remains in history as required. This replacement is the
additive correction, and the final tree cites only the sanctioned explicit-
local proof above.
