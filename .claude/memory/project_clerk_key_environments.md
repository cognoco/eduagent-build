---
name: Clerk key environment alignment — must match end-to-end
description: Mobile Clerk publishable key must match the API's CLERK_JWKS_URL Clerk instance. Mismatch causes 401 on ALL authenticated calls. Resolved 2026-04-05.
type: project
---

**Pattern (resolved 2026-04-05 in commit `5e24261`):**

The mobile app's Clerk publishable key and the API's `CLERK_JWKS_URL` must point to the SAME Clerk instance. If they don't, JWTs are signed by one instance but verified against another → 401 on every authenticated call.

**Required alignment:**

| Build Profile | Mobile Key | API JWKS | Doppler Config |
|---|---|---|---|
| development | `pk_test_` | `whole-iguana-9` (test) | `dev` |
| preview | `pk_test_` | `whole-iguana-9` (test) | `stg` |
| production | `pk_live_` | `clerk.mentomate.com` (live) | `prd` |

**History:**
- PR #101 (2026-04-03): Attempted fix, but eas.json preview still had `pk_live_` after merge
- Commit `5e24261` (2026-04-05): Actually fixed eas.json preview → `pk_test_`
- New preview APK build `8331fb1b` deployed with correct key

**How to apply:** When debugging auth failures in preview/staging builds, FIRST verify the Clerk key alignment table above. The `[AUTH-DEBUG] 401 received | token=present` log is the signature of this mismatch.
