---
name: Clerk key environment alignment — must match end-to-end
description: Mobile Clerk publishable key must match the API's CLERK_JWKS_URL Clerk instance. Mismatch causes 401 on ALL authenticated calls.
type: project
---

**Pattern:**

The mobile app's Clerk publishable key and the API's `CLERK_JWKS_URL` must point to the SAME Clerk instance. If they don't, JWTs are signed by one instance but verified against another → 401 on every authenticated call.

The mobile key is injected at build time via EAS Environment Variables — it is NOT in committed `eas.json` (denylisted there by `scripts/setup-env.js`). See `docs/deployment-and-secrets.md` § Sink 2 — EAS Environment Variables.

**Required alignment:**

| Build Profile | Mobile Key | API JWKS | Doppler Config |
|---|---|---|---|
| development | `pk_test_` | `whole-iguana-9` (test) | `dev` |
| preview | `pk_test_` | `whole-iguana-9` (test) | `stg` |
| production | `pk_live_` | `clerk.mentomate.com` (live) | `prd` |

**How to apply:** When debugging auth failures in preview/staging builds, FIRST verify the Clerk key alignment table above. The `[AUTH-DEBUG] 401 received | token=present` log is the signature of this mismatch.
