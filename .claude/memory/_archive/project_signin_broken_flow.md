---
name: Sign-in auth flow — navigation race fixed, transition spinner added
description: Navigation race (setActive vs isSignedIn propagation) fixed by removing explicit router calls. Transition spinner added 2026-04-05 in shared auth-transition.ts. Client Trust was NOT the root cause — the real issue was Clerk key mismatch (see project_signin_clerk_key_root_cause.md).
type: project
---

**Status (2026-04-05):** THREE FIXES APPLIED — transition spinner, navigation race, 401 token check.

## Fix 1: Transition spinner (2026-04-05)

After `setActive()`, both sign-in and sign-up now call `markSessionActivated()` from shared `auth-transition.ts`. The sign-in screen shows a "Signing you in…" spinner instead of the empty form. Module-level timestamp survives component remounts. 8-second timeout fallback with clear error.

## Fix 2: Navigation race condition (2026-04-05)

Removed explicit `router.replace('/(learner)/home')` from all auth screens. Navigation is now handled reactively by the auth layout guard, which only redirects when `useAuth().isSignedIn` has propagated to `true`.

## Fix 3: 401 token check (PR #99, 2026-04-03)

The `api-client.ts` 401 handler only calls `signOut()` when a token was actually sent. Tokenless 401s are left to TanStack Query retry.

## Correction: Client Trust was NOT the root cause

The 2026-04-04 investigation assumed Clerk's "Client Trust" setting was causing verification codes during sign-in. The 2026-04-05 investigation confirmed Client Trust / "Sign-in with email" verification methods were both OFF in the Clerk Dashboard. The real root cause was the Clerk key mismatch (see `project_signin_clerk_key_root_cause.md`).

## Account-not-found redirect (2026-04-05)

When Clerk returns `form_identifier_not_found`, sign-in.tsx auto-redirects to sign-up with email pre-filled. Sign-up shows a "We couldn't find an account" banner.

## Debug instrumentation (2026-04-05)

`[AUTH-DEBUG]` console logs added across: sign-in.tsx, sign-up.tsx, (auth)/_layout.tsx, (learner)/_layout.tsx, _layout.tsx (root), api-client.ts.
