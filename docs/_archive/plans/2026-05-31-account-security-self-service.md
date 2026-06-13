---
title: Account Security Self-Service - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: archived
archived: 2026-06-08
gap_ids: [auth-2, auth-3, auth-4]
---

# Account Security Self-Service - Implementation Plan

> **📦 Archived 2026-06-08 — SHIPPED.** Every task in this plan is implemented:
> `ChangeEmail`, `AddPassword`, `ChangePassword`, the `security-sessions` screen,
> and the `PATCH /account/email` route all exist in source. The `status: draft`
> and "Classification pending" framing below are historical and no longer
> reflect reality.
>
> **Open end-user gaps (to be closed in a separate session).** An adversarial
> end-user review (2026-06-08) found holes the shipped code does *not* address.
> Tracked for follow-up, not yet fixed:
> - **CRITICAL — email-change strand:** app-kill between Clerk primary promotion
>   and the server sync (`change-email.tsx:164-168`) leaves Clerk and
>   `accounts.email` permanently divergent with no in-app recovery (re-running
>   ChangeEmail rejects on an already-owned email). Corrupts the GDPR export
>   identity. Needs a lifecycle-independent startup reconciliation.
> - **CRITICAL — silent takeover:** a live unlocked-phone session can change the
>   email, `destroy()` the old one (`change-email.tsx:111`), and lock out the
>   owner with no security notification and no reverification/step-up.
> - **HIGH — no "sign out everywhere":** `security-sessions.tsx` revokes one row
>   at a time; the lost-phone emergency (auth-4) has no bulk action.
> - **HIGH — indistinguishable device rows:** `formatSessionTitle`
>   (`security-sessions.tsx:26-34`) renders only `deviceType - browserName`, so
>   the user often can't tell which session is the lost device.
> - MEDIUM/LOW: revoke-latency expectation, silent non-owner redirect,
>   cross-profile sign-out unwarned, current-session has no sign-out affordance.

> **⚠️ Classification pending** (added 2026-06-01) — re-triage against the identity-foundation clean-cut target before acting on this plan. Not yet classified as identity-coupled vs. independent. See [`_wip/identity-foundation/ROADMAP.md`](../../../_wip/identity-foundation/ROADMAP.md) § "Sibling-plan re-triage".

**Goal:** Give signed-in users a complete in-app security surface for changing
their login email, adding a backup password to SSO-only accounts, and reviewing
or revoking other active device sessions.

**Approach:** Extend the existing `AccountSecurity` settings area instead of
adding a separate account portal. Use Clerk client resources from
`@clerk/clerk-expo` (`useUser` and current `user` methods) for credential
changes. Device/session listing uses `user.getSessions()` — **not**
`useSessionList()` (see Clerk API Decisions for why). A new authenticated API
route mirrors the new Clerk primary email back into the server-side
`accounts.email` row, because that column is the persisted, `NOT NULL UNIQUE`
account identity and Clerk client changes never reach it. This plan covers only
account-security self-service; the identity/org membership redesign owns
person/org/membership semantics.

> **Single shared Clerk identity.** `accounts.clerkUserId` is unique
> (`packages/database/src/schema/profiles.ts:54`) — one Clerk login holds N
> MentoMate profiles. Email, password, and device sessions are therefore
> **account-level**, shared across every profile. Changing them from a
> non-owner or parent-proxy context would mutate the *owner's* credentials.
> All credential surfaces in this plan must be owner-and-non-proxy gated
> (see CRITICAL-3 / Prerequisites).

## Scope

In scope:
- `apps/mobile/src/components/account-security.tsx`
- `apps/mobile/src/components/change-password.tsx`
- New account-security components next to the existing component.
- `apps/mobile/src/app/(app)/more/account.tsx`
- `apps/mobile/src/app/(auth)/forgot-password.tsx` copy if needed.
- `apps/mobile/src/i18n/locales/en.json` and translated locale files.
- Co-located mobile tests beside changed components/screens.
- **API: a single email-sync route** (`PATCH /account/email`) that updates the
  server-side `accounts.email` row after Clerk confirms the new primary email,
  plus its service in `apps/api/src/services/account.ts` and co-located tests.
  This is the *only* API surface this plan adds and exists solely to keep the
  persisted account identity in sync (CRITICAL-1). It is not the identity/org
  redesign.

Out of scope:
- Identity/org/membership tables or broader API scoping (beyond the single
  email-sync route above).
- New Clerk Dashboard configuration. Required *existing* instance settings are
  documented in Prerequisites; this plan does not change them.
- Email change for parental consent recipients; that is a different flow.
- Two-factor authentication setup; the existing commented 2FA stub remains
  outside this plan.

## Prerequisites

These must hold before T2/T3/T4 can work. They are verification/documentation
items, not new configuration this plan performs (HIGH-2).

- **Password strategy enabled** on the Clerk instance — required for T3's
  first-time `user.updatePassword({ newPassword })`. If the instance is
  configured SSO-only with passwords disabled, the call fails; verify before
  building T3.
- **Email verification code (`email_code`) enabled** — required for T2's
  `prepareVerification` / `attemptVerification`.
- **Session mode** confirmed (single- vs multi-session). `user.getSessions()`
  works in both; this only affects how the "current" session is identified.
- **Owner + non-proxy gating is the access-control boundary** (CRITICAL-3).
  `navigationContract.gates.showAccountSecurity` is `ownerRole &&
  !isParentProxy` (`apps/mobile/src/lib/navigation-contract.ts:364`). Hiding the
  `AccountSecurity` row is defence-in-depth, **not** access control. Any new
  routed screen (e.g. the devices screen in T4) must re-check this gate at its
  own entry and redirect/return null when false, because all profiles share one
  Clerk identity. Mirror the existing rationale comment at
  `apps/mobile/src/app/(app)/more/account.tsx:87-92`.
- Any Clerk secret/config referenced lives in Doppler (never `eas.json` or raw
  env), per repo secrets policy.

## Clerk API Decisions

- The repo currently uses `@clerk/clerk-expo@2.19.23`, which re-exports
  `useUser`, `useClerk`, and the `user` resource methods from Clerk React
  (`@clerk/shared/react`).
- **Email change** uses a custom flow on the `user` resource:
  1. `const newEmail = await user.createEmailAddress({ email })`
  2. `await newEmail.prepareVerification({ strategy: 'email_code' })`
  3. `await newEmail.attemptVerification({ code })`
  4. Promote to primary with the explicit API (no placeholder, MEDIUM-1):
     `await user.update({ primaryEmailAddressId: newEmail.id })`
  5. `await user.reload()`
  6. **Sync the server identity (CRITICAL-1):** call `PATCH /account/email`
     so the API updates `accounts.email`. The mobile UI shows success only
     after *both* Clerk promotion and the API sync succeed.
  7. **Remove the old address (HIGH-1):** `await oldEmail.destroy()`. The old
     email is otherwise still a valid sign-in and password-reset identifier
     (`forgot-password.tsx:110-113` keys on the email), which defeats the
     "switching providers / lost access" intent of auth-2. If product decides
     to retain it, document why — but the default is to destroy it.
  - Wrap every Clerk call above in the existing `withTimeout` helper pattern
    (`forgot-password.tsx:30-69`, #617/AUTH-06) — these calls can hang (MEDIUM-2).
- **Why `accounts.email` must sync (CRITICAL-1):** `accounts.email` is
  `text('email').notNull().unique()` (`packages/database/src/schema/profiles.ts:55`)
  and is the persisted account identity — it backs the GDPR export
  (`packages/schemas/src/account.ts:89`) and is set once at provisioning.
  `findOrCreateAccount` returns the existing account by `clerkUserId` and
  **never updates the email** (`apps/api/src/services/account.ts:92-149`); there
  is no Clerk `user.updated` webhook (the only webhook, `resend-webhook.ts`, is
  Resend/Svix). Without the sync route, Clerk and DB email diverge permanently.
  The sync route must handle the `accounts.email` UNIQUE constraint the same way
  creation does (`account.ts:165-224`): if the target email already belongs to a
  different account, reject with a clear conflict rather than 500.
- **Server email staleness (HIGH-3):** `resolveVerifiedClerkEmail` returns the
  JWT `tokenEmail` when present and caches the Clerk-API email for 5 minutes
  (`apps/api/src/services/clerk-user.ts:8,124-131,190`). After a change, the
  email-sync route must invalidate that cache (promote the existing
  `clearVerifiedClerkEmailCacheForTest` into a real exported invalidator keyed by
  `userId`), and we document that the JWT email claim refreshes only on the next
  token rotation.
- **Add-password** for SSO-only users calls `user.updatePassword({ newPassword })`
  in first-time password-set mode (no `currentPassword`). Requires the Password
  strategy enabled on the instance (see Prerequisites). The existing
  `ChangePassword` component remains the flow for users who already have a
  password.
- **Session/device management** uses `await user.getSessions()` (CRITICAL-2),
  which returns `SessionWithActivities[]` for the user across **all devices**
  (carrying device/browser/location), each revokable via the returned session's
  `.revoke()`. Do **not** use `useSessionList()`: it enumerates only the current
  device's client sessions (multi-account-on-one-device), so it would never list
  or revoke a lost phone — the exact auth-4 intent. The audit's expected path
  also names `user.getSessions / session.revoke`
  (`docs/audits/2026-05-31-logical-gap-audit.md:124`). The current session is
  identified by the active session id, displayed but not revokable from this
  screen; other sessions can be revoked. Refresh via `user.getSessions()` after
  a revoke.
- **Reuse existing infra** (MEDIUM-4): error formatting via `extractClerkError`
  (`apps/mobile/src/lib/clerk-error.ts`); password fields via `PasswordInput`
  with `showRequirements`; cross-platform alerts via `platformAlert`; hang
  protection via `withTimeout`. Do not reinvent these.

## Tasks

- [ ] **T1: Refactor `AccountSecurity` into explicit rows for password, email,
  and devices.** Done when: the current password-change path still renders for
  `passwordEnabled === true`; SSO-only users see an actionable "Add password"
  row instead of only a static provider note; tests cover password-enabled and
  SSO-only branches.

- [ ] **T2: Add a verified email-change flow.** Done when:
  `ChangeEmail` adds an unverified email, sends an email-code verification,
  verifies the code, promotes the verified email to primary via
  `user.update({ primaryEmailAddressId })`, reloads Clerk user state, **calls
  `PATCH /account/email` to sync `accounts.email` (T7) and surfaces success only
  after that sync returns**, then **destroys the old email address (HIGH-1)**.
  All Clerk calls are wrapped in `withTimeout`. Tests mock Clerk as an external
  boundary and cover: duplicate email (Clerk reject), invalid/expired code,
  successful primary-email change with server sync, server-sync failure after
  Clerk success (UI must not claim success), and old-email-destroy failure.
  Note: the consistency risk this guards is the server `accounts.email` row, not
  the local profile display name (LOW-1) — `account.tsx:36-41` shows
  `displayName` first and email only as a last-resort fallback.

- [ ] **T3: Add first-time password setup for SSO-only users.** Done when:
  `AddPassword` accepts new password + confirmation, calls Clerk's password-set
  path without a current-password field, renders provider context clearly, and
  after success the screen switches to the normal password-change state. Tests
  cover mismatched confirmation, weak password, Clerk rejection, and success.

- [ ] **T4: Add a devices/sessions management screen.** Done when:
  `SecuritySessions` lists current and other active sessions from
  `await user.getSessions()` (CRITICAL-2 — **not** `useSessionList`, which only
  sees the current device), identifies the current session by active session id,
  lets the user revoke other sessions only (via the session's `.revoke()`),
  refreshes via `user.getSessions()` after revoke, wraps Clerk calls in
  `withTimeout`, re-checks `navigationContract.gates.showAccountSecurity` at its
  own entry if it is a routed screen (T8 / CRITICAL-3), and renders useful
  empty / loading / load-failure states. Tests cover current-session protection,
  another-session revoke (asserting `session.revoke` is called), and the
  list-load-failure state.

- [ ] **T5: Wire account settings navigation and recovery copy.** Done when:
  `more/account.tsx` surfaces the expanded account-security area; forgot-password
  copy does not imply email is immutable; all new strings are in i18n; small-phone
  layout fits on a Galaxy S10e width.

- [ ] **T6: Add regression tests for the three audit gaps.** Done when: tests
  named with `auth-2`, `auth-3`, and `auth-4` fail on current behavior and pass
  with the implementation. Assert **behavior, not mere reachability** (LOW-2):
  the email test asserts `user.update({ primaryEmailAddressId })` **and** the
  `PATCH /account/email` sync fire and old email is destroyed; the add-password
  test asserts `user.updatePassword` is called with no `currentPassword`; the
  sessions test asserts `user.getSessions` is queried and the chosen session's
  `.revoke()` is called (and the current session's is not). Clerk is mocked as
  an external boundary; the API sync route is exercised against the real service
  in its own co-located API test, not mocked.

- [ ] **T7: Add the `accounts.email` sync route (CRITICAL-1).** Done when:
  `PATCH /account/email` exists in `apps/api/src/routes/account.ts`, is gated by
  `assertOwnerProfile` (matching the other `/account/*` routes), delegates to a
  service in `apps/api/src/services/account.ts` that updates `accounts.email`
  for the authenticated `clerkUserId` inside a transaction, **rejects with a
  typed conflict if the target email already belongs to a different account**
  (reuse the `account.ts:165-224` collision pattern → `ConflictError`),
  invalidates the verified-email cache for that `userId` (HIGH-3), and never
  trusts a client-supplied email without confirming it matches the caller's
  verified Clerk primary email. Includes a **break test**: a non-owner / wrong
  `clerkUserId` attempting to change another account's email is rejected.
  Business logic stays in the service (no inline logic / `drizzle-orm` import in
  the route, per eslint G1/G5).

- [ ] **T8: Gate every new credential surface at its own entry (CRITICAL-3).**
  Done when: any new routed screen (T4 devices screen, and any sub-route) checks
  `navigationContract.gates.showAccountSecurity` (`ownerRole && !isParentProxy`)
  on mount and redirects/returns null when false — not relying on the
  `AccountSecurity` row being hidden. Tests cover owner (renders), non-owner
  (blocked), and parent-proxy (blocked).

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Email already belongs to another Clerk user | `createEmailAddress` rejects | Inline error on the email form | Enter a different email or contact support |
| New email already used by another account (DB `accounts.email` UNIQUE) | `PATCH /account/email` returns conflict | Inline error: this email is already in use | Enter a different email; old email/login stays active |
| Verification code expired or wrong | `attemptVerification` rejects or remains unverified | Inline code error | Resend code from the same screen |
| Primary email update fails after verification | Clerk `user.update` / reload fails | "Email verified but not yet your primary" warning | Retry primary update; old email stays active until success |
| Server email sync fails after Clerk succeeds | `PATCH /account/email` errors after primary promotion | Warning: login email changed but account record is updating; not marked complete | Auto-retry the sync; surface manual retry; do not destroy old email until sync succeeds |
| Old-email removal fails after successful change | `oldEmail.destroy()` rejects | Non-blocking notice: old email still active | Retry removal; primary change already succeeded |
| SSO user sets weak password | Clerk password policy rejects | Inline password-rule error | Enter a stronger password |
| Password strategy disabled on the instance | `updatePassword` rejects (misconfig) | Generic "couldn't set password" + Sentry breadcrumb | Surface support path; fix instance config (Prerequisites) |
| Session list fails to load | `user.getSessions()` errors/times out | Load-failure state with retry | Retry; fall back to "manage on the web" guidance |
| Session revoke fails | Network or Clerk failure | Row-level retry state | Retry revoke; current session stays active |
| User tries to revoke current session | Taps current session row | Disabled action with explanation | Use the normal sign-out button |
| Non-owner / proxy reaches a credential screen by deep link | Direct route push bypassing the hidden row | Redirected away / blocked | Owner-only by design (T8); no action available |

## Verification

Focused checks:

```powershell
Push-Location apps/mobile
pnpm exec jest --findRelatedTests src/components/account-security.tsx src/components/change-password.tsx --no-coverage
pnpm exec jest --testPathPattern account-security --no-coverage
pnpm exec tsc --noEmit
Pop-Location
```

Whole mobile checks:

```powershell
pnpm exec nx lint mobile
pnpm check:i18n:orphans
```

API checks (for the T7 email-sync route):

```powershell
pnpm exec nx run api:test
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
# DB/auth-scoping not covered by unit tests — required for any apps/api change:
pnpm exec nx test:integration api
```

