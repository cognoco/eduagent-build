# Plan 010: Define and apply a read-side profile-authority check (spike + fix)

> **Executor instructions**: This is a **design/spike plan first, implementation
> second**. Do the investigation in Step 1 and write the findings doc BEFORE
> touching any handler. If the investigation contradicts this plan's
> assumptions, STOP and report rather than proceeding. When done, update the
> status row in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/middleware/profile-scope.ts apps/api/src/middleware/proxy-guard.ts apps/api/src/routes/notes.ts apps/api/src/services/family-access.ts`
> On any change, compare excerpts to live code; mismatch → STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: 003 (do the owner-gate write-side sweep first; reuse its org-admin/guardian primitives)
- **Category**: security
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

Profile-scoped **reads** verify only that `X-Profile-Id` belongs to the caller's organization — not that the target profile is the caller's own or a profile the caller guards. `profileScopeMiddleware` sets `profileId` from the header after an org-membership check; the write-side non-owner block (`assertNotProxyMode`) is applied only on write paths. So an authenticated non-owner org member (a family-join teen) can set `X-Profile-Id` to a **peer's** profile id (same org, also non-owner → the write-side block never fires on reads) and read that peer's learning data: notes today, and by the same pattern session transcripts, progress, assessments. For a minors product this is minor-to-minor disclosure of conversation transcripts. Same root cause as plan 003 (org-membership standing in for caller identity) but a different surface (general reads) and a different remedy (a self-or-guardian read-authority check, not an owner gate). The blast radius and the exact guardian-edge semantics need verification before a fix — hence a spike.

## Current state

```ts
// middleware/profile-scope.ts:205-216 — org-membership only, not caller-self/guardian
const scope = await getPersonScope(db, profileIdHeader, account.id);  // verifies org membership
if (!scope) { return forbidden(c, 'Profile does not belong to this account'); }
c.set('profileId', scope.profileId);
c.set('profileMeta', { ...scope.meta, resolvedVia: 'explicit-header' });
```

```ts
// routes/notes.ts:105-142 — reads use the resolved profileId with no ownership check
.get('/subjects/:subjectId/books/:bookId/notes', zValidator('param', bookParamSchema), async (c) => {
  const profileId = requireProfileId(c.get('profileId'));   // <-- header-derived, org-checked only
  const notes = await getNotesForBook(db, profileId, subjectId, bookId);
  ...
})
```

```ts
// middleware/proxy-guard.ts — assertNotProxyMode is the write-side non-owner block;
// grep shows it invoked predominantly on POST/PUT/PATCH, not on GET read handlers.
```

Reusable primitives (verify exact signatures during the spike):
- `verifyPersonIsOrgAdminV2(db, callerPersonId, orgId)` — org-admin check (used by plan 003's `assertCallerIsAccountOwner`).
- A guardianship-edge check written at child creation (`services/identity-v2/child-profile-v2.ts` / `family-access.ts`'s `assertParentAccess`) — the owner→child edge that a legitimate guardian read must still pass.
- `callerPersonId` is available on every route (global `accountMiddleware`, see plan 003).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0 |
| Find read routes using profileId | `rg -n "requireProfileId\(c.get\('profileId'\)\)" apps/api/src/routes` | the read surface |
| Where assertNotProxyMode is used | `rg -n 'assertNotProxyMode' apps/api/src/routes` | write-side sites |
| Integration | `pnpm exec nx run api:integration-api` | pass |

## Suggested executor toolkit

- Load `tech-hono-authz` and `tech-eduagent-db` (repo skills) for the middleware/query patterns.

## Scope

**In scope**:
- `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/010-findings.md` (create) — the spike output: the enumerated read surface, the exact authority rule, and the chosen enforcement point.
- After the spike is reviewed: a new shared check (e.g. `assertCanReadProfile(caller, targetProfileId)` in `services/family-access.ts` or a read-side middleware) and its application at the profile-scoped read boundary.
- A guard/ratchet test for new read routes.
- Co-located tests.

**Out of scope (until the spike says otherwise)**:
- Do NOT bulk-edit every read route before the spike defines the rule and the enforcement point — a wrong primitive applied broadly is worse than the gap.
- The owner-gated write routes — plan 003 owns those.
- Changing `getPersonScope` / `profileScopeMiddleware`'s org-membership semantics — the read-authority check is additive, layered on top.

## Git workflow

- Branch: `advisor/010-read-side-profile-authority`.
- Conventional commits; commit the spike doc separately from the implementation.
- Do NOT push/PR unless instructed.

## Steps

### Step 1 (SPIKE — do this first, write the doc, then pause for review if a reviewer is available)

Investigate and write `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/010-findings.md` answering:
1. **Enumerate the read surface**: every route handler that consumes `c.get('profileId')` for another person's data without a caller-identity/guardian check. Start from `rg -n "requireProfileId\(c.get\('profileId'\)\)" apps/api/src/routes` and classify each as (a) self-only data, (b) guardian-readable child data, (c) both.
2. **Define the authority rule precisely**: a caller may read target profile P iff `callerPersonId` is P's own person, OR the caller has a guardianship edge over P, OR the caller is an org admin. Confirm the exact guardian-edge lookup (the function used at child creation) and that a legitimate guardian reading a managed child passes it.
3. **Choose the enforcement point**: a single read-side middleware at the profile-scope boundary vs. a per-handler `assertCanReadProfile(c, targetProfileId)`. Recommend one, with the trade-off (middleware = uniform but must know which routes are "read another person's data"; per-handler = explicit but must not be forgotten → needs a ratchet).
4. **List routes that would break** if the rule were applied naively (e.g. a guardian dashboard that legitimately reads a child) and how the rule accommodates them.

**Verify**: `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/010-findings.md` exists and answers all four questions with `file:line` evidence. If the investigation shows the gap is NOT reachable (e.g. all such reads already carry a guardian check you missed), STOP and report — the finding is refuted.

### Step 2: Implement the shared read-authority check

Per the spike's recommendation, add `assertCanReadProfile(source, targetProfileId)` (self OR guardianship-edge OR org-admin) reusing `verifyPersonIsOrgAdminV2` and the guardian-edge lookup. Keep it a pure authority assertion throwing `ForbiddenError`, mirroring `assertCallerIsAccountOwner`'s shape.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0; a unit test for the check (self allowed, guardian allowed, peer rejected, org-admin allowed) passes.

### Step 3: Apply at the enforcement point + break test

Apply the check at the point the spike chose, starting with `notes.ts` (the confirmed instance) and expanding to the surface the spike enumerated. Add the break test: a non-owner caller setting `X-Profile-Id` to a peer's id is rejected (403) on `GET .../notes`, while self and guardian reads still succeed.

**Verify (red-green-revert)**: peer-read test passes; remove the check → it fails; restore → passes. `pnpm exec nx run api:integration-api` → pass.

### Step 4: Ratchet for new read routes

If the enforcement is per-handler, add a forward-only guard test (pattern: `safe-non-core.guard.test.ts`) that fails when a profile-scoped read route consumes `profileId` for cross-person data without the check. If it's middleware, document the covered path set.

**Verify**: the ratchet test passes and fails when a deliberately-unguarded read route is added in a scratch commit (then revert the scratch).

## Test plan

- Unit test for `assertCanReadProfile`: self / guardian / peer / org-admin cases.
- Break test on `GET .../notes`: peer rejected (403), self + guardian allowed.
- Ratchet test (if per-handler): new unguarded read route fails CI.
- Structural patterns: `account.test.ts` (authz assertions), `safe-non-core.guard.test.ts` (ratchet).
- Verification: `pnpm exec nx run api:integration-api` + the new unit/break tests pass.

## Done criteria

- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/010-findings.md` enumerates the read surface, the rule, the enforcement point, and the guardian-accommodation, with evidence.
- [ ] `assertCanReadProfile` (or the chosen mechanism) exists with a passing unit test.
- [ ] `notes.ts` peer reads are rejected (403); self + guardian reads still pass; break test recorded red-green-revert.
- [ ] The enumerated read surface is covered (or a scoped subset is, with the remainder tracked in the findings doc).
- [ ] A ratchet/coverage guard exists for new read routes.
- [ ] `pnpm exec nx run api:typecheck`, `api:lint`, `api:integration-api` pass.
- [ ] Only in-scope files modified (`git status`).
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md` status row updated.

## STOP conditions

- The spike shows the reads already carry a guardian/self check somewhere in the chain you initially missed — STOP, mark the finding refuted in `010-findings.md`.
- The guardian-edge lookup can't distinguish a legitimate guardian read from a peer read (the data model doesn't record the edge you assumed) — STOP; this becomes a data-model question, not a middleware fix.
- Applying the check breaks a legitimate guardian dashboard flow and the rule can't be adjusted without weakening it to the org-membership check that caused the bug — STOP and report.

## Maintenance notes

- This is the read-side twin of plan 003. Together they replace "org membership" with "caller identity + guardianship" across both read and write surfaces.
- Reviewer must confirm the guardian accommodation is real (a guardian genuinely reading a child's data passes) — the biggest risk is over-tightening into a support regression.
- Deferred: a full sweep of every profile-scoped read route beyond the spike's initial surface, if the spike scopes the first PR to a subset.
