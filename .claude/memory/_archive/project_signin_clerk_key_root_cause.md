---
name: Sign-in root cause — Clerk key mismatch between preview APK and staging API
description: RESOLVED 2026-04-05. Preview APK used pk_live_ but staging API verified against test JWKS → 401 on every authenticated call. Fixed by switching eas.json preview to pk_test_.
type: project
---

## Root Cause (resolved 2026-04-05)

The preview APK's `eas.json` had `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_..."` (live Clerk instance) but the staging API's `CLERK_JWKS_URL` in Doppler `stg` pointed to `whole-iguana-9.clerk.accounts.dev` (test Clerk instance). Every JWT sent by the mobile app was signed by the live instance but verified against the test instance's JWKS → **401 on every authenticated API call**.

## Symptoms (all caused by the same 401)

1. **Verification code during sign-in** — Clerk accepted the password, but the app couldn't complete the flow because post-auth API calls failed
2. **Empty sign-in screen after verification** — `setActive()` succeeded client-side, but the first API call (profiles query) got 401 → retries exhausted → empty profiles → CreateProfileGate shown OR signOut triggered
3. **"Session expired — signing out" on profile creation** — The profile creation POST sent a valid-looking token that the staging API rejected → 401 → `_onAuthExpired` → signOut
4. **Consent screen never shown** — User never got past profile creation, so consent gate never evaluated
5. **"Email taken" on sign-up** — User's previous sign-up created a Clerk account (in live instance) but no DB record (API rejected the profile creation call). Clerk said "taken" but DB had no matching account.

## Fix

- Changed `eas.json` preview profile: `pk_live_...` → `pk_test_d2hvbGUtaWd1YW5hLTkuY2xlcmsuYWNjb3VudHMuZGV2JA`
- Required a new EAS build (not OTA — Clerk key is baked at build time)
- Commit: `5e24261`

## Environment alignment (must always match)

| Build Profile | Mobile Clerk Key | API JWKS Instance | Doppler Config |
|---|---|---|---|
| development | `pk_test_` | `whole-iguana-9` (test) | `dev` |
| preview | `pk_test_` | `whole-iguana-9` (test) | `stg` |
| production | `pk_live_` | `clerk.mentomate.com` (live) | `prd` |

## How to detect in the future

If you see `"Session expired — signing out"` immediately after sign-in or during profile creation, the FIRST thing to check is whether the mobile Clerk key and the API JWKS URL point to the same Clerk instance.

Debug logs (`[AUTH-DEBUG] 401 received | token=present`) confirm token was sent but rejected — this is the key mismatch signature.
