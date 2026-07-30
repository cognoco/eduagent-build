# WI-2128 — Bind joined learner credentials to their own Person

Status: implementation plan after GATE-0 premise verification  
Type: Bug (P0, adversarial review)  
Claimant: `codex:builder:WI-2128`

## Goal and success criteria

Bind every authenticated request to the Person referenced by the verified
Clerk subject's `login.person_id`. Moving that Person's membership into a
family organization must not replace self authority with the organization
admin.

Done means:

1. A joined learner credential resolves its own Person/profile with or without
   `X-Profile-Id`.
2. The family owner credential continues to resolve the owner.
3. An explicit header naming the owner, a credentialed sibling, or an unrelated
   Person fails closed for the learner credential.
4. A guardian credential can still select an uncredentialed managed charge;
   credentialed charges are not operable through the guardian path.
5. Owner-only capabilities remain derived from the authenticated caller Person,
   not from the selected header or fresh-factor state belonging to another
   Person.
6. The join preserves the learner's Person id, learning history, family
   membership, opt-in supportership, and family billing relationship.
7. Fresh web, token refresh/sign-in, native cold-start, stale saved selection,
   and omitted-header bootstrap all converge on the caller's own profile.
8. A real-Postgres regression with two distinct Clerk subjects fails when the
   old owner-substitution behavior is restored and passes with the fix.

## GATE-0 and authority trace

Premise test:

```text
pnpm exec jest --config apps/api/jest.config.cjs \
  apps/api/src/middleware/profile-scope.test.ts --runInBand \
  --testNamePattern "auto-resolves owner profile when X-Profile-Id header is absent"
```

Result on the merged `origin/main` base: PASS. The test proves the live
headerless path intentionally selects `owner-profile-id`.

Trace:

1. `authMiddleware` verifies the Clerk JWT and exposes its subject.
2. `accountMiddleware` calls `resolveIdentityV2(db, clerkUserId)`.
3. `resolveIdentityV2` correctly reads `login.person_id`, then that Person's
   single membership and organization. After family join, it still returns the
   learner Person id; only the organization id changes.
4. `accountMiddleware` correctly sets `callerPersonId = resolved.personId`.
5. **First authority substitution:** `profileScopeMiddleware`, on an omitted
   `X-Profile-Id`, ignores `callerPersonId` and calls
   `findOwnerPersonScope(db, account.id)`. This replaces learner selfhood with
   the family admin profile.
6. Explicit headers are checked for organization membership only. That admits a
   same-org owner/sibling into profile context even when the caller has no
   self/managed-charge authority; downstream route guards catch many but not
   every profile/shell/capability consumer.
7. `GET /profiles` returns full profiles for every organization member.
   `ProfileProvider` restores a saved id, otherwise prefers `isOwner`; therefore
   a fresh web session or cleared/stale native selection chooses the owner even
   though the token resolved the learner Person.
8. Query persistence is already Clerk-subject partitioned, but the in-memory
   cache can retain pre-join `isOwner` metadata for the same Clerk subject.
   Capability-bearing shell state must wait for an authoritative profile
   revalidation on mount/resume, and an impossible persisted proxy relationship
   must be cleared.
9. `assertNotProxyMode` substitutes profile shape for caller authority by
   treating every `isOwner:false` Person as a guardian proxy. A joined learner
   therefore resolves correctly but still cannot use self-learning writes.
10. Post-graph `POST /profiles` authorizes only `kind:'child'`; a learner can
    omit `kind` and receive the organization owner's profile through the
    idempotent replay branch.

## Implementation

### 1. Central person-operation authority resolver

Files:

- `apps/api/src/services/identity-v2/ownership-v2.ts`
- focused unit/integration coverage beside the service

Extract one named resolver used by both the existing write guard and profile
selection. It returns a non-sensitive authority result:

- `self`
- `managed-charge`
- `not-member`
- `no-authority`
- `credentialed-charge`

Authority remains canonical: self, or an active guardianship edge to a charge
with no Login. Membership alone is never enough; supportership and payer state
do not grant profile operation.

### 2. Bind profile scope to the authenticated Person

Files:

- `apps/api/src/middleware/profile-scope.ts`
- `apps/api/src/middleware/profile-scope.test.ts`

For no header, resolve `getPersonScope(db, callerPersonId, account.id)` rather
than the organization owner. For an explicit header, require the central
authority resolver before creating profile context. Keep the existing
`resolvedVia` distinction so headerless requests cannot gain owner-only
capabilities.

Failures use one stable 403 response. Diagnostic events contain only categorical
reason/resolution fields and booleans—no Clerk subject, email, Person id,
organization id, or requested profile id.

### 3. Return only profiles the caller may operate

Files:

- `apps/api/src/services/identity-v2/profile-v2.ts`
- `apps/api/src/routes/profiles.ts`
- `apps/api/src/routes/profiles.test.ts`
- `apps/mobile/src/lib/profile.test.tsx`

Add a caller-aware profile-list function that filters the organization-scoped
list through the central authority resolver. `GET /profiles` uses the
server-derived `callerPersonId`; a joined credentialed learner receives only
self, while an owner receives self plus uncredentialed managed charges.

Apply the same authority predicate to `POST /profiles/switch` before the
owner-elevation logic. A fresh factor proves the current Clerk subject; it
cannot transform a learner subject into the owner's Person.

The mobile provider treats the profile list as capability metadata: revalidate
on mount/resume, withhold the shell while fetching, surface refresh failure
instead of falling back to cached authority, and clear persisted proxy mode
when the returned operation set cannot represent an owner→charge view.

### 4. Close downstream authority substitutions

Files:

- `apps/api/src/middleware/proxy-guard.ts`
- `apps/api/src/routes/profiles.ts`
- focused route/guard tests

Derive proxy mode from `callerPersonId !== profileId`, not `isOwner`. Require
explicit profile selection for writes, allow both owner-self and
joined-learner-self, and reject guardian proxy writes.

On post-graph owner-create replay, compare the fetched owner Person to the
server-derived caller before returning any profile payload. Organization
membership never authorizes replay disclosure.

### 5. Real-database joined-family regression

File:

- `tests/integration/wi2128-family-join-identity.integration.test.ts`
  (or the API integration directory if its existing harness is a closer fit)

Use the real identity graph and family-join transaction:

1. Create owner and learner graphs with distinct Clerk subjects/logins.
2. Seed learner history, a real invite, and the target subscription.
3. Accept the invite with supportership opt-in.
4. Assert stable learner Person/history, learner membership in the family org,
   supportership preservation, owner payer/subscription preservation, and
   unchanged payer/subscription ownership. Per-profile quota usage remains
   lazily created and is not a join invariant.
5. Exercise the real JWT/account/profile middleware chain:
   - learner: omitted header and self header resolve self;
   - owner: omitted header resolves owner;
   - learner: owner, credentialed sibling, and unrelated headers return 403;
   - learner: owner-only capability/header combination returns 403;
   - owner: managed-charge selection remains allowed;
   - learner: a real self-write succeeds while owner→charge proxy write fails;
   - owner: a guardianship edge to a credentialed charge remains inoperable;
   - learner: owner-create replay returns 403 without owner disclosure.
6. Assert learner `GET /profiles` exposes only self and owner `GET /profiles`
   retains the permitted family profiles.

The test must first fail on the current code for the named owner-substitution
behavior before production edits.

## Verification

1. Red: run the real-DB regression before implementation and capture the exact
   wrong-owner/failure assertion.
2. Green: run the new integration suite plus focused middleware, identity,
   profiles-route, family-access, family-join, and mobile provider tests.
3. Revert proof: temporarily restore the old
   `findOwnerPersonScope(db, account.id)` headerless behavior; the mandatory
   real-DB test must fail for the named reason. Restore the fix and rerun green.
4. Run API/integration typecheck, focused lint, schema/security/change-class
   checks, and relevant package tests.
5. Run the repo verification-before-completion checklist.
6. Request a fresh, non-forked adversarial review of the final diff and fix all
   valid blocker/must-fix/should-fix findings.
7. Commit and push through the repo commit skill, open one PR, wait for required
   checks and configured automated review on the current head, and report only
   when the PR is clean and green.

## Explicit non-goals

- No schema or production-data migration.
- No family-join transaction redesign.
- No supportership visibility-consent implementation (belongs to the blocked
  follow-up).
- No mobile persona/screen-specific workaround; cache/proxy handling remains
  centralized in the profile authority provider.
- No Delivery Batch mutation and no work-item completion before the PR lands on
  `origin/main`.

## Overlap boundaries

- PR #2658 touches only V2 nav-shell E2E files.
- PR #2591 touches Journal/progress navigation.
- PR #2568 touches mobile navigation/profile/sign-out and E2E surfaces.

Keep mobile changes confined to centralized profile capability/cache handling;
recheck these PR file maps before final push.
