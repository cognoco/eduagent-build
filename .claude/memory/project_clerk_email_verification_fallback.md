---
name: Clerk Email Verification Fallback
description: Remember the auth incident where a missing Clerk token claim caused valid staging sessions to look expired.
type: project
---

Clerk session-token custom claims are not authoritative for account validity. If
`email_verified` is missing or stale, the API should verify the user's primary
email through the Clerk Backend API using `CLERK_SECRET_KEY` and fail closed with
account-specific errors instead of treating the session as expired.

**Why:** On 2026-05-22, staging preview sign-in failed with "Your session expired"
because `/v1/profiles` returned a generic 401 after the token omitted
`email_verified`.

**How to apply:** Keep `apps/api/src/services/clerk-user.ts` as the canonical
verification path. `docs/pre-launch-checklist.md` and
`docs/deployment-and-secrets.md` document the token-template fast path plus the
Backend API fallback.
