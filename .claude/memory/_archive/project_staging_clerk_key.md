---
name: Staging Clerk keys — RESOLVED, all environments aligned
description: RESOLVED 2026-04-05. Doppler stg already had test keys. The only issue was eas.json preview using pk_live_ instead of pk_test_. Fixed in commit 5e24261.
type: project
---

**Status: FULLY RESOLVED (2026-04-05)**

Doppler `stg` config was verified to already have correct test Clerk keys:
- `CLERK_PUBLISHABLE_KEY`: `pk_test_...`
- `CLERK_SECRET_KEY`: `sk_test_...`
- `CLERK_JWKS_URL`: `https://whole-iguana-9.clerk.accounts.dev/.well-known/jwks.json`

The only mismatch was `eas.json` preview profile using `pk_live_` instead of `pk_test_`. Fixed in commit `5e24261`. New preview APK build deployed (build `8331fb1b`).

This is no longer a launch blocker. See `project_signin_clerk_key_root_cause.md` for the full investigation.
