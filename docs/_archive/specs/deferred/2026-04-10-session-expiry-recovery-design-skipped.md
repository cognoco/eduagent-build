# AUTH-11: Session Expiry Recovery Path

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` AUTH-11

## Problem

When a session expires (401 from API), the app calls `queryClient.clear()` + `signOut()` and dumps the user at sign-in with a message: "Your session expired. Sign in again to continue learning." After re-signing in, the user always lands on `/(app)/home` — whatever they were doing is lost with no way back.

Additionally, the expiry notice has a 60-second window (`auth-expiry.ts`). If the user is slow to reach the sign-in screen (backgrounded app), the message is silently dropped and they see a bare sign-in form with no explanation.

## Solution

### 1. Persist the return route before sign-out

Before calling `signOut()` in `_layout.tsx`, capture the current route pathname and store it in a module-level variable (same pattern as `auth-expiry.ts`). After re-sign-in, redirect to the stored route instead of always going to `/(app)/home`.

**Implementation in `auth-expiry.ts`:**

```typescript
let _returnRoute: string | null = null;

export function markSessionExpired() {
  _sessionExpiredAt = Date.now();
  // Capture current route from expo-router
  _returnRoute = /* current pathname */;
}

export function consumeReturnRoute(): string | null {
  const route = _returnRoute;
  _returnRoute = null;
  return route;
}
```

**In `sign-in.tsx` after successful `setActive()`:** Check `consumeReturnRoute()`. If non-null, navigate there instead of relying on the layout guard's default `/(app)/home` redirect.

**Route validation:** Only restore routes within the `(app)` group. Discard routes that require specific params (like `/(app)/session` with a session ID — the session is gone). Safe routes: `/(app)/home`, `/(app)/library`, `/(app)/library/[subjectId]`, `/(app)/progress`, `/(app)/more`. Unsafe routes (discard): `/(app)/session/*`, `/(app)/onboarding/*`.

### 2. Extend the expiry notice window

Change `SESSION_EXPIRED_WINDOW_MS` from 60 seconds to 5 minutes. The notice is consumed once and cleared, so there's no risk of stale display — the only risk with 60s is missing it entirely.

### 3. Improve the expiry message

Current: "Your session expired. Sign in again to continue learning."

New: "Your session expired — sign in to pick up where you left off."

When a return route is stored, add context: "Your session expired — sign in to return to {Library/Progress/Home}."

## Scope Exclusions

- **Preserving unsent chat messages** — out of scope. Chat messages are streamed server-side; the session transcript is already persisted. The user can resume from the session recovery marker (30-min window, already implemented in `session-recovery.ts`).
- **Background token refresh** — Clerk handles this automatically. Session expiry typically means the refresh token itself expired (long inactivity), not a transient failure.

## Files Touched

- `apps/mobile/src/lib/auth-expiry.ts` — add `_returnRoute`, `consumeReturnRoute()`, extend window
- `apps/mobile/src/app/_layout.tsx` — capture route in the 401 handler before `signOut()`
- `apps/mobile/src/app/(auth)/sign-in.tsx` — consume return route after `setActive()`

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Return route is stale/invalid | Route was removed or requires missing params | Fallback to `/(app)/home` | Normal home experience |
| Expiry during active session | 401 mid-chat | Expiry message + session recovery marker still in SecureStore | Re-sign-in → home → learn-new shows "Continue where you left off" |
| Multiple rapid 401s | API flap | `_authExpiredFiring` guard deduplicates | Single sign-out, single message |
| App backgrounded > 5 min after expiry | Delayed sign-in screen arrival | No expiry message (window exceeded) | Normal sign-in, no confusion |
