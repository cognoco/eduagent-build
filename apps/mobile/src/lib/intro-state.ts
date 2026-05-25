// ---------------------------------------------------------------------------
// First-launch welcome intro — per-Clerk-userId, per-device flag.
//
// SecureStore writes are async; the intro completion handler must persist
// the "seen" flag and immediately navigate. If we only relied on SecureStore,
// the layout's intro-gate check could re-read the stale value before the
// write commits and bounce the user back to /welcome.
//
// Fix: pair a synchronous in-memory Set with the async SecureStore write.
// `markIntroSeenSync` flips the in-memory bit synchronously, then fires the
// SecureStore write best-effort. `hasSeenIntro` checks the in-memory cache
// first, falling back to the SecureStore value that the layout effect loaded.
//
// On SecureStore write failure: Sentry capture + `intro_securestore_write_failed`
// metric (per CLAUDE.md "silent recovery without escalation is banned" —
// Sentry alone isn't queryable as a rate). User keeps the in-memory flag for
// this session and never sees the intro twice in one process.
//
// Sign-out path calls `clearIntroSeen(userId)` so a second account signing
// in on the same device doesn't inherit the previous user's in-memory bit
// (the SecureStore key is userId-scoped, so this is belt-and-suspenders).
//
// Versioned `_v1` suffix lets us force a one-time re-show by bumping to
// `_v2`. Not a "what's new" channel.
//
// Spec: docs/specs/2026-05-25-welcome-intro.md
// ---------------------------------------------------------------------------

import { setItemAsync, sanitizeSecureStoreKey } from './secure-storage';
import { Sentry } from './sentry';
import { track } from './analytics';

const KEY_PREFIX = 'intro_seen_v1_';

const inMemoryIntroSeen = new Set<string>();

export function introSecureStoreKey(userId: string): string {
  return sanitizeSecureStoreKey(`${KEY_PREFIX}${userId}`);
}

export function markIntroSeenSync(userId: string): void {
  inMemoryIntroSeen.add(userId);
  setItemAsync(introSecureStoreKey(userId), new Date().toISOString()).catch(
    (err) => {
      Sentry.captureException(err);
      track('intro_securestore_write_failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    },
  );
}

export function hasSeenIntro(
  userId: string,
  securestoreValue: string | null,
): boolean {
  return inMemoryIntroSeen.has(userId) || !!securestoreValue;
}

export function clearIntroSeen(userId: string): void {
  inMemoryIntroSeen.delete(userId);
}

export function __resetIntroStateForTests(): void {
  inMemoryIntroSeen.clear();
}
