---
title: Account Security Self-Service - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: draft
gap_ids: [auth-2, auth-3, auth-4]
---

# Account Security Self-Service - Implementation Plan

**Goal:** Give signed-in users a complete in-app security surface for changing
their login email, adding a backup password to SSO-only accounts, and reviewing
or revoking other active device sessions.

**Approach:** Extend the existing `AccountSecurity` settings area instead of
adding a separate account portal. Use Clerk client resources from
`@clerk/clerk-expo` (`useUser`, `useSessionList`, and current `user` methods)
for credential changes, and keep all MentoMate profile data changes on the
existing API side. This plan covers only account-security self-service; the
identity/org membership redesign owns person/org/membership semantics.

## Scope

In scope:
- `apps/mobile/src/components/account-security.tsx`
- `apps/mobile/src/components/change-password.tsx`
- New account-security components next to the existing component.
- `apps/mobile/src/app/(app)/more/account.tsx`
- `apps/mobile/src/app/(auth)/forgot-password.tsx` copy if needed.
- `apps/mobile/src/i18n/locales/en.json` and translated locale files.
- Co-located mobile tests beside changed components/screens.

Out of scope:
- Identity/org/membership tables or API scoping.
- Clerk Dashboard configuration changes beyond documenting required settings.
- Email change for parental consent recipients; that is a different flow.
- Two-factor authentication setup; the existing commented 2FA stub remains
  outside this plan.

## Clerk API Decisions

- The repo currently uses `@clerk/clerk-expo@2.19.23`, which re-exports
  `useUser`, `useClerk`, and `useSessionList` from Clerk React.
- Email change uses a two-step custom flow:
  `user.createEmailAddress({ email })`, `emailAddress.prepareVerification({
  strategy: 'email_code' })`, then `emailAddress.attemptVerification({ code })`.
  After verification, set the new verified email as primary using the Clerk user
  API available in the installed SDK and call `user.reload()`.
- Add-password for SSO-only users must call `user.updatePassword` in first-time
  password-set mode, without requiring `currentPassword`. The existing
  `ChangePassword` component remains the password-change flow for users who
  already have a password.
- Session/device management uses `useSessionList()` for the current user's
  sessions. The current session is displayed but not revokable from this screen;
  other sessions can be revoked.

## Tasks

- [ ] **T1: Refactor `AccountSecurity` into explicit rows for password, email,
  and devices.** Done when: the current password-change path still renders for
  `passwordEnabled === true`; SSO-only users see an actionable "Add password"
  row instead of only a static provider note; tests cover password-enabled and
  SSO-only branches.

- [ ] **T2: Add a verified email-change flow.** Done when:
  `ChangeEmail` adds an unverified email, sends an email-code verification,
  verifies the code, promotes the verified email to primary, reloads Clerk user
  state, and never mutates local profile display data until Clerk confirms the
  new primary email. Tests mock Clerk as an external boundary and cover
  duplicate email, invalid code, and successful primary-email change.

- [ ] **T3: Add first-time password setup for SSO-only users.** Done when:
  `AddPassword` accepts new password + confirmation, calls Clerk's password-set
  path without a current-password field, renders provider context clearly, and
  after success the screen switches to the normal password-change state. Tests
  cover mismatched confirmation, weak password, Clerk rejection, and success.

- [ ] **T4: Add a devices/sessions management screen.** Done when:
  `SecuritySessions` lists current and other active sessions from
  `useSessionList`, identifies the current session, lets the user revoke other
  sessions only, refreshes after revoke, and renders a useful empty/loading
  state. Tests cover current-session protection and another-session revoke.

- [ ] **T5: Wire account settings navigation and recovery copy.** Done when:
  `more/account.tsx` surfaces the expanded account-security area; forgot-password
  copy does not imply email is immutable; all new strings are in i18n; small-phone
  layout fits on a Galaxy S10e width.

- [ ] **T6: Add regression tests for the three audit gaps.** Done when: tests
  named with `auth-2`, `auth-3`, and `auth-4` fail on current behavior and pass
  with the implementation: change email is reachable, SSO user can add password,
  and other sessions can be revoked.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Email already belongs to another Clerk user | `createEmailAddress` rejects | Inline error on the email form | Enter a different email or contact support |
| Verification code expired or wrong | `attemptVerification` rejects or remains unverified | Inline code error | Resend code from the same screen |
| Primary email update fails after verification | Clerk update/reload fails | Email verified but not primary warning | Retry primary update; keep old email active |
| SSO user sets weak password | Clerk password policy rejects | Inline password-rule error | Enter a stronger password |
| Session revoke fails | Network or Clerk failure | Row-level retry state | Retry revoke; current session stays active |
| User tries to revoke current session | Taps current session row | Disabled action with explanation | Use the normal sign-out button |

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

