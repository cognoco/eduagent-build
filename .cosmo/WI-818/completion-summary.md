**Title:** AUTH-11/AUTH-17 — forced session-expired and revoked re-entry banners (docblock reconciliation follow-up)

**What was done:** Corrected the `session-revoked` bullet in the top-of-file docblock of `apps/mobile/e2e-web/helpers/mentor-audit-storage-state.ts`. The prior text claimed the storage state "still carries the now-invalid token, exercising the revoked-token-refresh code path in the Hono RPC client." This was inaccurate and caused a SHOULD_FIX bounce from the first WI-818 review.

**What changed:** The docblock now accurately describes the real mechanism: the `session-revoked` mutator calls `clearClerkSessionCookies()` (identical to the `session-expired` path) to ensure the sign-in route renders pre-auth, and surfaces the revoked banner via the `mentomate_session_revoked_at` sessionStorage marker seeded by `bannerInitScript` via `addInitScript()`. No production Hono RPC revoked-token-refresh path exists. One file changed, comment text only.

**Verification:** Pre-push tsc passed in the mobile lane. Mobile lint passed with zero errors in the mobile lane. PR #1249 passed all six CI checks; claude-review returned APPROVED with zero must-fix, should-fix, or consider findings (the original SHOULD_FIX was confirmed cleared). mergeStateStatus=CLEAN at merge time.

Caveats / Follow-ups:
