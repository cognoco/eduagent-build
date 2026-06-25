// ---------------------------------------------------------------------------
// Pre-auth welcome intro — device-scoped first-open flag.
//
// The welcome intro is shown BEFORE sign-in, so there is no Clerk userId to
// scope the "seen" state against. The flag is per-device: a fresh install
// sees the cards once; subsequent cold opens (signed-out or signed-in) skip
// straight to the sign-in / app shell. The UX consequence is accepted: on a
// shared device, only the first signed-out first-open user sees the welcome
// cards. A second user signing up later on the same device goes straight to
// auth (see the plan's "Product Decisions" section).
//
// SecureStore writes are async; the bridge CTAs must persist the flag and
// immediately navigate to /sign-up or /sign-in. If we only relied on
// SecureStore, the root entry's intro probe could re-read the stale (null)
// value on the next mount and bounce the user back to /welcome. Fix: pair a
// synchronous in-memory boolean with the async SecureStore write.
// `markPreAuthIntroSeenSync` flips the in-memory bit synchronously, then
// fires the SecureStore write best-effort. `hasSeenPreAuthIntro` checks the
// in-memory bit first, falling back to the SecureStore value the caller
// loaded.
//
// On SecureStore write failure: Sentry capture + `intro_securestore_write_failed`
// metric (per AGENTS.md "silent recovery without escalation is banned" —
// Sentry alone isn't queryable as a rate). The in-memory bit still answers
// the gate for the remainder of the process so the user is never trapped in
// a re-show loop.
//
// The flag intentionally survives sign-out: a user who completes the intro,
// signs in, then signs out should not re-see the intro on the next sign-in.
// That's why sign-out cleanup does NOT clear this key (the previous per-user
// `clearIntroSeen(userId)` call was removed when this module moved
// pre-auth).
//
// Versioned `.v1` suffix lets us force a one-time re-show by bumping to
// `.v2`. Not a "what's new" channel.
//
// Spec: docs/plans/2026-05-27-pre-auth-welcome-flow.md
// ---------------------------------------------------------------------------

import { setItemAsync } from './secure-storage';
import { Sentry } from './sentry';
import { track } from './analytics';
import { PRE_AUTH_INTRO_KEY } from './secure-store-keys';

let inMemoryIntroSeen = false;

export function preAuthIntroSecureStoreKey(): string {
  return PRE_AUTH_INTRO_KEY;
}

export function markPreAuthIntroSeenSync(): void {
  inMemoryIntroSeen = true;
  setItemAsync(PRE_AUTH_INTRO_KEY, new Date().toISOString()).catch((err) => {
    Sentry.captureException(err);
    track('intro_securestore_write_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

export function hasSeenPreAuthIntro(securestoreValue: string | null): boolean {
  return inMemoryIntroSeen || !!securestoreValue;
}

export function __resetIntroStateForTests(): void {
  inMemoryIntroSeen = false;
}
