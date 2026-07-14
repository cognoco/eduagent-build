# Plan 003: Close the X-Profile-Id owner-gate IDOR on the 7 un-swept owner routes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> This is a security fix; the negative-path break test in the Test plan is
> mandatory, not optional. When done, update the status row in
> `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c049b93f..HEAD -- apps/api/src/services/family-access.ts apps/api/src/routes/consent.ts apps/api/src/routes/dashboard.ts apps/api/src/routes/recaps.ts apps/api/src/routes/curriculum.ts apps/api/src/routes/onboarding.ts apps/api/src/routes/settings.ts apps/api/src/routes/notifications.ts`
> If any changed, compare the excerpts below against live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 002 (so the break test runs in CI on a routes/ diff — soft; the fix is valid without it)
- **Category**: security
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

`assertOwnerProfile(c)` derives owner authority from `profileMeta.isOwner`, which reflects the profile **resolved from the client-supplied `X-Profile-Id` header**. `profileScopeMiddleware` only verifies that `X-Profile-Id` belongs to the caller's organization — not that it is the caller's *own* identity. In any multi-member org (a family: owner + non-owner children who can log in via family-join), an authenticated **non-owner** can send `X-Profile-Id` = the owner's profile id, pass `assertOwnerProfile`, and act as the owner. The worst instance is child consent: `PUT /consent/:childProfileId/revoke` sets a child to `WITHDRAWN` and schedules data deletion after a 7-day grace period, and `GET /consent/:childProfileId/status` discloses a sibling's COPPA/GDPR consent state. The repo already built the fix — `assertCallerIsAccountOwner`, which derives authority from the server-set `callerPersonId` — but only swept it into `account.ts`, `billing.ts`, and `profiles.ts`. The `family-access.ts` doc block explicitly calls the remaining sweep "a separate, tracked follow-up." This plan is that sweep.

## Current state

The vulnerable guard and the fix both live in `apps/api/src/services/family-access.ts`:

```ts
// family-access.ts:206-222 — VULNERABLE: authority from X-Profile-Id-resolved profileMeta
export function assertOwnerProfile(
  source: ProfileMetaSource,
  message = 'Only the account owner can view this surface.',
): void {
  const profileMeta = source.get('profileMeta');
  if (profileMeta?.isOwner !== true) {
    throw new ForbiddenError(message);
  }
  // [Issue 901] ...auto-synthesized owner identity rejected...
  if (profileMeta.resolvedVia !== 'explicit-header') {
    throw new ForbiddenError(message);
  }
}
```

```ts
// family-access.ts:259-278 — THE FIX: authority from server-set callerPersonId
export async function assertCallerIsAccountOwner(
  source: CallerOwnerSource,
  message = 'Only the account owner can perform this action.',
): Promise<void> {
  const account = source.get('account');
  const callerPersonId = source.get('callerPersonId');
  if (!account || !callerPersonId) {
    throw new ForbiddenError(message);
  }
  const db = source.get('db');
  const isCallerAdmin = await verifyPersonIsOrgAdminV2(db, callerPersonId, account.id);
  if (!isCallerAdmin) {
    throw new ForbiddenError(message);
  }
}
```

The canonical application pattern is already in `routes/account.ts` — copy it exactly:

```ts
// routes/account.ts:63-69 — both checks, in this order
assertOwnerProfile(c, 'Only the account owner can view deletion status.');
// [WI-1301] Caller-identity gate — closes the X-Profile-Id spoof IDOR that
// assertOwnerProfile alone does not (see assertCallerIsAccountOwner doc).
await assertCallerIsAccountOwner(
  c,
  'Only the account owner can view deletion status.',
);
```

`account.ts` also declares `callerPersonId` in its route Env `Variables` (`routes/account.ts:46-48`):

```ts
// [WI-1301] The authenticated caller's own person id, resolved server-side
// by accountMiddleware — required by assertCallerIsAccountOwner.
callerPersonId: string | undefined;
```

Enabling facts (verified):
- `accountMiddleware` runs globally (`index.ts:328` `api.use('*', accountMiddleware)`) and sets `callerPersonId` (`middleware/account.ts:156`), so it is available at runtime on every route. The only per-route change needed is adding `callerPersonId: string | undefined` to each route file's Env `Variables` type so `c.get('callerPersonId')` type-checks.
- The 7 route files that still use `assertOwnerProfile` WITHOUT the caller-identity gate (confirmed by grepping which route files import `assertCallerIsAccountOwner` — only account/billing/profiles do):
  - `routes/consent.ts` — `assertOwnerProfile` at lines 478, 516, 564 (manage / **revoke** / restore child consent). **Highest severity.**
  - `routes/dashboard.ts`
  - `routes/recaps.ts`
  - `routes/curriculum.ts`
  - `routes/onboarding.ts`
  - `routes/settings.ts`
  - `routes/notifications.ts`

Repo security convention (`AGENTS.md` → "Fix Development Rules"): a CRITICAL/HIGH security fix **requires a negative-path break test** using the red-green-revert pattern (write test, watch it pass, revert the fix, watch it fail, restore).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm exec nx run api:typecheck` | exit 0, no errors |
| Lint | `pnpm exec nx run api:lint` | exit 0 |
| Unit tests (one file) | `cd apps/api && pnpm exec jest --findRelatedTests src/routes/consent.ts --no-coverage` | pass |
| Integration (consent) | `pnpm exec nx run api:integration-api` | pass |
| Find call sites | `rg -n 'assertOwnerProfile' apps/api/src/routes` | the 7 files above |

## Suggested executor toolkit

- Load the repo skill `.agents/skills/receiving-code-review/SKILL.md` mindset for the break-test discipline; and `superpowers:verification-before-completion` → "Regression tests" for the red-green-revert loop.

## Scope

**In scope**:
- `apps/api/src/routes/consent.ts`, `dashboard.ts`, `recaps.ts`, `curriculum.ts`, `onboarding.ts`, `settings.ts`, `notifications.ts` — add the caller gate + Env `callerPersonId` field.
- The co-located test files for those routes (create the break test in at least `consent.test.ts`; extend others if they already assert owner-gating).

**Out of scope**:
- `apps/api/src/services/family-access.ts` — do NOT modify `assertOwnerProfile`'s body. Its X-Profile-Id pattern is shared by ~30 files; changing it is a different, larger effort. Add the second gate alongside, exactly as `account.ts` does.
- `account.ts`, `billing.ts`, `profiles.ts` — already fixed; don't touch.
- The read-side lateral-disclosure problem (peer reads via `profileId`) — that is plan 010, a different remediation. This plan is owner-gated routes only.

## Git workflow

- Branch: `advisor/003-owner-gate-caller-identity-sweep`.
- Conventional commits, e.g. `fix(api): extend caller-identity owner gate to consent/dashboard/settings [security]`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Consent routes first (highest severity)

In `routes/consent.ts`:
1. Add `callerPersonId: string | undefined;` to the `ConsentRouteEnv` `Variables` block (near the existing `account: Account;` at ~line 173), matching `account.ts:46-48` including the comment.
2. Ensure `assertCallerIsAccountOwner` is imported from `../services/family-access` (add to the existing import that already brings in `assertOwnerProfile` at line 35).
3. At each of the three sites (lines 478, 516, 564), add `await assertCallerIsAccountOwner(c, '<same message>');` immediately AFTER the existing `assertOwnerProfile(c, ...)` call. The handler must be `async` (it already is). Use the same message string already passed to `assertOwnerProfile`.

**Verify**: `pnpm exec nx run api:typecheck` → exit 0. `rg -n 'assertCallerIsAccountOwner' apps/api/src/routes/consent.ts` → 3 matches.

### Step 2: Repeat for the other 6 route files

For each of `dashboard.ts`, `recaps.ts`, `curriculum.ts`, `onboarding.ts`, `settings.ts`, `notifications.ts`:
1. Add `callerPersonId: string | undefined;` to that file's route Env `Variables`.
2. Import `assertCallerIsAccountOwner`.
3. After **every** `assertOwnerProfile(c, ...)` in the file, add the matching `await assertCallerIsAccountOwner(c, '<same message>');`. Make the enclosing handler `async` if it isn't.

Do them one file at a time, typechecking after each so a failure is localized.

**Verify (after all)**: `rg -n 'assertOwnerProfile' apps/api/src/routes | wc -l` equals `rg -n 'assertCallerIsAccountOwner' apps/api/src/routes | wc -l` for these 7 files (every owner assertion now paired). `pnpm exec nx run api:typecheck` → exit 0.

### Step 3: Write the break test (mandatory)

In `routes/consent.test.ts`, add a test for `PUT /consent/:childProfileId/revoke` proving a non-owner caller (a member whose `callerPersonId` is NOT an org admin) who sets `X-Profile-Id` to the owner's profile is **rejected with 403**, even though `profileMeta.isOwner` would be true for that header. Model the test setup after the existing owner-gate tests already in `consent.test.ts` (search it for `revoke` and `assertOwnerProfile`/403 assertions) and after `account.test.ts`'s `assertCallerIsAccountOwner` tests. The test must exercise the real `assertCallerIsAccountOwner` (do not mock `family-access` — internal-mock ban, GC1/GC6).

**Verify (red-green-revert)**:
1. `cd apps/api && pnpm exec jest --findRelatedTests src/routes/consent.ts --no-coverage` → new test passes.
2. Temporarily remove the `await assertCallerIsAccountOwner(...)` line at the revoke handler → re-run → new test FAILS (403 → 200/other).
3. Restore the line → re-run → passes. Record this loop in the PR description.

## Test plan

- **New test** in `apps/api/src/routes/consent.test.ts`: "non-owner caller spoofing X-Profile-Id cannot revoke child consent → 403". Structural pattern: `apps/api/src/routes/account.test.ts` (its `assertCallerIsAccountOwner` cases) + existing consent owner-gate tests.
- If `dashboard.test.ts` / `settings.test.ts` already have owner-gate assertions, extend one of them with the same spoof-caller negative case; otherwise the consent break test satisfies the CRITICAL-fix rule for the shared guard.
- Verification: `pnpm exec nx run api:integration-api` and `cd apps/api && pnpm exec jest --findRelatedTests src/routes/consent.ts --no-coverage` → all pass, new test included.

## Done criteria

ALL must hold:

- [ ] `pnpm exec nx run api:typecheck` exits 0.
- [ ] `pnpm exec nx run api:lint` exits 0.
- [ ] Every `assertOwnerProfile(c, ...)` in the 7 route files is immediately followed by `await assertCallerIsAccountOwner(c, ...)` with the same message.
- [ ] The break test exists in `consent.test.ts`, passes, and provably fails when the revoke-handler gate is removed (red-green-revert recorded).
- [ ] `pnpm exec nx run api:integration-api` passes.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- `assertCallerIsAccountOwner` no longer has the signature in "Current state" (e.g. it now takes a target person id) — the correct call shape changed.
- A route file's Env has no `account: Account` in `Variables` (the gate needs `account`; investigate before adding).
- Adding the gate to a route breaks a legitimate **owner** flow in tests (an owner session that resolves the account owner but whose `callerPersonId` is not org-admin) — this would mean `verifyPersonIsOrgAdminV2` disagrees with `isOwner`; stop and report the discrepancy rather than weakening the gate.
- Any of the 7 files turns out to already call `assertCallerIsAccountOwner` (already swept) — skip it and note it.

## Maintenance notes

- New owner-gated routes must use BOTH `assertOwnerProfile` and `assertCallerIsAccountOwner`. Consider a follow-up lint/guard test that fails when a route calls `assertOwnerProfile` without the caller gate (the repo likes forward-only ratchets; see `safe-non-core.guard.test.ts` for the pattern) — deferred out of this plan but recommended.
- Reviewer should verify no owner assertion was left unpaired and that messages match (a mismatched message is a copy-paste slip, not a security hole, but review-worthy).
- Related: plan 010 (read-side authority) shares this root cause but a different fix; do this one first so the org-admin primitive is the established reference.
