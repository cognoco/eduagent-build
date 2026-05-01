# AUTH-05: Unsupported MFA Method Recovery

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` AUTH-05

## Problem

When a user's account requires an MFA method the app doesn't support (e.g., webauthn/passkeys), they see "this build does not support that yet" with a suggestion to try Google/Apple SSO or contact support. If the user has no SSO linked, they are completely stranded.

## Current State

The app already supports three MFA strategies in priority order:
1. `totp` (authenticator app)
2. `email_code`
3. `phone_code`

Unsupported strategies (`webauthn`, `backup_code`, etc.) trigger `formatUnsupportedVerificationMessage()` with a contact-support mailto fallback.

## Solution — Two Changes

### 1. Add `backup_code` strategy support

This is the lowest-hanging fruit. Clerk's backup codes work identically to TOTP — the user enters a static code, app calls `attemptSecondFactor({ strategy: 'backup_code', code })`. No prepare step needed. The UI is the same 6-digit (or longer) code input.

**Priority order becomes:** `totp` → `email_code` → `phone_code` → `backup_code`

**UI for backup_code:**
- Heading: "Enter a backup code"
- Body: "Enter one of the backup codes you saved when you set up two-factor authentication."
- Input: single text input (backup codes are typically 8-10 chars, alphanumeric)
- No "Resend code" button (same as TOTP)

This unblocks users who have backup codes saved but no other supported method. It also means webauthn-only accounts can fall back to backup codes if they set them up.

### 2. Improve unsupported method messaging

When the *only* remaining method is truly unsupported (webauthn without backup codes), improve the fallback:

**Current:** "Try Google or Apple if you use them on this account, or contact support for help."

**New — tiered messaging:**

If SSO providers are available on the account:
> "You can sign in with {Google/Apple} instead — tap above. If that doesn't work, contact support."

If no SSO providers available:
> "This account requires {method} which isn't available on mobile yet. Contact support and we'll help you sign in."

Remove the generic "try Google or Apple" suggestion when we can detect from Clerk's response that no SSO providers are linked — it's misleading.

**Contact support button** already exists and works (pre-filled mailto). No changes needed there.

## Scope Exclusion

Full webauthn/passkey support is out of scope. It requires `react-native-passkeys` or similar, platform-specific credential handling, and significant testing across devices. The backup_code path covers the most common "locked out" scenario.

## Files Touched

- `apps/mobile/src/app/(auth)/sign-in.tsx` — add `backup_code` to `getVerificationStep()`, update `formatUnsupportedVerificationMessage()`, add SSO-aware messaging
- `apps/mobile/src/app/(auth)/sign-in.test.tsx` — tests for backup_code flow, improved unsupported messaging variants

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Invalid backup code | Wrong code entered | "That backup code is incorrect" | Try another code, contact support |
| All backup codes used | Clerk rejects all codes | Same as invalid code | Contact support — codes exhausted |
| No supported method at all | webauthn-only, no backup codes, no SSO | Clear "not available on mobile" + contact support | Support email (pre-filled mailto) |
| Backup code attempt fails (network) | API error during attemptSecondFactor | Toast error + retry | Retry button, same as other strategies |
