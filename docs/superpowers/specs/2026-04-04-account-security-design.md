# Account Security — Email 2FA & Password Change

**Date:** 2026-04-04
**Status:** Approved
**Epic:** Pre-Launch UX (standalone story)

## Story

**As** an account owner, **I want** to enable email verification on sign-in and change my password from the settings screen, **so that** my account is protected and I can manage my credentials.

## Scope

- Client-only via Clerk SDK — no new API routes needed
- New "Account Security" section on the existing `more.tsx` settings screen
- Visible only when the current profile is the account owner
- Adapts based on auth method: password users get full controls, SSO users see informational message

### In Scope

- Email verification toggle on sign-in (enable/disable) — note: this is Clerk's email verification step, not a true 2FA method
- Password change form (current + new + confirm)
- "Forgot your password?" escape hatch (signs out, redirects to reset flow)
- SSO detection and appropriate messaging

### Out of Scope

- True 2FA via TOTP / authenticator app (Clerk supports this but deferred — parents unlikely to have authenticator apps)
- True 2FA via SMS / phone-based OTP (Clerk supports this but deferred)
- Backup code management
- Server-side audit logging of 2FA events
- Adding a password for SSO-only users (`user.createPassword()` — future enhancement)

## UI Design

### Password Users (`user.passwordEnabled === true`)

```text
┌─ Account Security ─────────────────────────┐
│                                             │
│  Email Verification              [OFF]      │
│  Require a code sent to your email          │
│  when signing in                            │
│                                             │
│  Change Password                      >     │
│                                             │
└─────────────────────────────────────────────┘
```

### SSO Users (`user.passwordEnabled === false`)

```text
┌─ Account Security ─────────────────────────┐
│                                             │
│  Your account is secured via Google.        │
│  Manage your security settings there.       │
│                                             │
└─────────────────────────────────────────────┘
```

The provider name (Google / Apple) is derived from `user.externalAccounts`.

## Flows

### Email 2FA — Enable

1. User taps toggle (currently OFF)
2. Clerk sends a verification code to the user's primary email
3. User enters the 6-digit code
4. Code is verified via Clerk SDK
5. Toggle shows ON, 2FA is active

If the user cancels mid-flow, 2FA remains OFF.

### Email 2FA — Disable

1. User taps toggle (currently ON)
2. Confirmation dialog: "Turn off email verification? You'll only need your password to sign in."
3. Cancel → no change; Confirm → Clerk disables email 2FA → toggle shows OFF

No re-authentication required to disable (per design decision).

### Password Change

1. User taps "Change Password" — form expands or opens as bottom sheet
2. Fields:
   - Current password (with show/hide via existing `PasswordInput` component)
   - New password (with show/hide + requirements indicator, reused from sign-up)
   - Confirm new password (with show/hide)
3. Validation:
   - Mismatched confirm → inline error
   - Wrong current password → Clerk error via `extractClerkError()`
   - Weak new password → requirements indicator shows unmet rules
4. "Update Password" button → `user.updatePassword({ currentPassword, newPassword })`
5. Success → toast notification → form collapses
6. "Forgot your password?" link below current password field → signs user out → redirects to `/(auth)/sign-in` with reset flow

### SSO Users

No interactive controls. Informational message only. The provider name is detected from `user.externalAccounts[0].provider` and displayed.

## Technical Design

### Approach: Client-Only (Clerk SDK)

The entire feature runs on the mobile client. Clerk's `useUser()` hook provides the `User` object, which exposes all necessary methods. No new API routes are needed.

### Files (retroactive documentation — all already implemented)

| File | Purpose | Status |
|------|---------|--------|
| `apps/mobile/src/components/account-security.tsx` | Shared section component — renders 2FA toggle + password change for password users, informational message for SSO users | Implemented |
| `apps/mobile/src/components/change-password.tsx` | Password change form with validation | Implemented |
| `apps/mobile/src/app/(learner)/more.tsx` | Import and render `<AccountSecurity />` for account owners | Implemented |
| `apps/mobile/src/app/(parent)/more.tsx` | Import and render `<AccountSecurity />` for account owners | Implemented |

### Clerk SDK Methods

| Action | Method | Notes |
|--------|--------|-------|
| Check auth method | `user.passwordEnabled` | Boolean — true if user has a password |
| Get SSO provider | `user.externalAccounts` | Array of linked OAuth providers |
| Check 2FA status | `user.twoFactorEnabled` | Boolean — whether any 2FA is active |
| Enable 2FA | Clerk TOTP/SMS flow | **Note:** Clerk does not support email as a 2FA method. Supported MFA: SMS OTP, TOTP (authenticator app), backup codes. The "Email Verification" toggle in the UI mockup above controls Clerk's email verification on sign-in, not a true second factor. |
| Disable 2FA | `clerkClient.users.disableUserMFA(userId)` | Removes all MFA methods |
| Change password | `user.updatePassword({ currentPassword, newPassword })` | Throws on wrong current password |

### Account Owner Detection

```ts
const { user } = useUser();
const { activeProfile } = useProfile();
const isAccountOwner = user?.id === activeProfile?.userId;
```

Only render `<AccountSecurity />` when `isAccountOwner` is true.

### State Management

- Local `useState` for form state and flow step tracking
- No React Query needed (no server state — all Clerk client-side)
- Clerk auto-refreshes the `user` object after mutations

### Error Handling

All Clerk errors processed through the existing `extractClerkError()` utility (`apps/mobile/src/lib/clerk-error.ts`).

### Dependencies

No new dependencies needed. Everything uses existing Clerk SDK + existing UI components (`PasswordInput`, toast).

## Acceptance Criteria

### Email Verification on Sign-In

> **Important:** Clerk does not support email as a true 2FA method. The toggle below controls Clerk's email verification step on sign-in — an additional verification prompt, not a second authentication factor. The UI labels this "Email Verification" (not "2FA") to avoid misleading users.

- [ ] AC-1: Account Security section only visible when current profile is the account owner
- [ ] AC-2: Toggle shows current email verification status (ON/OFF) based on Clerk user state
- [ ] AC-3: Toggle OFF → ON: initiates Clerk's email verification enrollment flow (prepareEmailAddressVerification + attemptEmailAddressVerification), user enters code, email verification activates on sign-in
- [ ] AC-4: Canceling mid-enable keeps email verification OFF
- [ ] AC-5: Toggle ON → OFF: confirmation dialog ("Turn off email verification? You'll only need your password to sign in."), confirm disables email verification
- [ ] AC-6: Canceling disable dialog keeps email verification ON

### Password Change

- [ ] AC-7: Current, new, and confirm password fields with show/hide toggle
- [ ] AC-8: New password shows requirements indicator (reused from sign-up)
- [ ] AC-9: Mismatched confirm password shows inline error before submission
- [ ] AC-10: Wrong current password shows Clerk error message
- [ ] AC-11: Successful change shows toast and collapses form
- [ ] AC-12: "Forgot your password?" link signs out and redirects to password reset flow

### SSO Users

- [ ] AC-13: If `user.passwordEnabled === false`, show informational message instead of controls
- [ ] AC-14: Informational message names the SSO provider (Google / Apple)

### General

- [ ] AC-15: All Clerk errors surfaced via `extractClerkError()` with user-friendly messages
- [ ] AC-16: Works on both iOS and Android
- [ ] AC-17: No regressions to existing sign-in email-code second factor flow
- [ ] AC-18: Existing sign-in TOTP flow unaffected (if user has TOTP from another source)

## Testing Strategy

- Unit tests for `account-security.tsx` — owner detection, SSO vs password rendering
- Unit tests for `change-password.tsx` — validation, error states, success flow
- Mock Clerk's `useUser()` to control `passwordEnabled`, `twoFactorEnabled`, `externalAccounts`
- Test enable/disable 2FA flow steps and cancellation
- Test password validation (mismatch, wrong current, success)

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Client-only (no API routes) | Clerk SDK handles everything — adding backend routes would be pure pass-through |
| Account owner only | 2FA and password are account-level (Clerk User), not profile-level |
| No verification to disable 2FA | User requested simple toggle; email fallback exists for recovery |
| "Forgot password?" signs out | Only way to access Clerk's password reset is from the sign-in screen |
| SSO users see info message only | SSO security is managed by the OAuth provider, not our app |
| Email verification over TOTP | Target audience (parents) may not have authenticator apps; email is universal. Note: this is Clerk's email verification on sign-in, not a true 2FA method |
