---
name: Sign-in verification race — 401 handler must check if token was sent
description: After Clerk setActive(), JWT may not be minted yet. api-client 401 handler must only signOut when a token was actually sent. Fixed PR #99 (2026-04-03).
type: project
---

**Bug (fixed in PR #99, 2026-04-03):**

After email verification sign-in, Clerk's `setActive()` activates the session but the JWT isn't minted instantly. In the brief window, ProfileProvider fires its first API query without a token → 401 → `api-client.ts` 401 handler called `signOut()` → user bounced back to empty sign-in screen.

**Fix (in `apps/mobile/src/lib/api-client.ts`):**
Only trigger `signOut()` when a token was actually sent with the request (genuine token expiry). Tokenless 401s are left to TanStack Query's retry mechanism, which naturally succeeds once the JWT is ready.

**Pattern:** This is a token-based auth race condition. "Session is active" and "token is available" are NOT atomic states. The fix distinguishes:
- Token sent + 401 → genuine expiry → `signOut()`
- No token sent + 401 → JWT not yet minted → retry (TanStack handles it)

**How to apply:** If similar auth-related sign-out loops appear in the future, check whether the 401 handler is distinguishing between "expired token" and "no token yet." This is the same class of bug as the Clerk preview key mismatch (see `project_clerk_key_environments.md`).
