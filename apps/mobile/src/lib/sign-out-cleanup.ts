// ---------------------------------------------------------------------------
// [BUG-723 / SEC-7] Sign-out SecureStore cleanup
//
// On sign-out, every per-profile SecureStore entry left behind on the device
// becomes data leakage on a shared phone — the next signed-in user inherits
// the previous account's bookmark prompts, dictation prefs, rating-prompt
// counters, and other personalisation. The previous sign-out only cleared
// `hasSignedInBefore`, leaving everything else.
//
// This module is the single source of truth for what gets wiped on sign-out.
// When a new SecureStore key is added anywhere in the app, register it here
// (per-profile or global) so cleanup stays exhaustive — relying on grep at
// sign-out time is fragile.
// ---------------------------------------------------------------------------

import * as SecureStore from './secure-storage';
import { sanitizeSecureStoreKey } from './secure-storage';

// Per-profile key constructors. Each takes a profileId and returns the exact
// SecureStore key. Keep these in sync with the writers — if a writer changes
// its key shape, this list must too. Cross-references included so future
// readers can verify against the writer.
const PER_PROFILE_KEYS: ReadonlyArray<(profileId: string) => string> = [
  // EarlyAdopterCard.tsx — `earlyAdopterDismissed_${profileId}`
  (id) => `earlyAdopterDismissed_${id}`,
  // BookmarkNudgeTooltip.tsx — `bookmark-nudge-shown:${profileId}`
  (id) => `bookmark-nudge-shown:${id}`,
  // use-dictation-preferences.ts — pace + punctuation
  (id) => `dictation-pace-${id}`,
  (id) => `dictation-punctuation-${id}`,
  // use-rating-prompt.ts — current + legacy (different separator)
  (id) => `rating-recall-success-count-${id}`,
  (id) => `rating-last-prompt-${id}`,
  (id) => `rating-recall-success-count:${id}`,
  (id) => `rating-last-prompt:${id}`,
  // session-recovery.ts — sanitized `session-recovery-marker-${profileId}`
  (id) => sanitizeSecureStoreKey(`session-recovery-marker-${id}`),
];

// Global keys that should reset when no one is signed in. Excludes onboarding
// flags that legitimately survive sign-out cycles (e.g., a user who signs out
// to switch accounts on the same device should not be prompted to re-onboard).
const GLOBAL_KEYS: ReadonlyArray<string> = [
  'hasSignedInBefore', // sign-in.tsx — guards "Welcome back" copy
  'mentomate_pending_auth_redirect', // pending-auth-redirect.ts
  sanitizeSecureStoreKey('parent-proxy-active'), // use-parent-proxy.ts / profile.ts
  'session-recovery-marker', // session-recovery.ts (un-keyed legacy form)
  sanitizeSecureStoreKey('mentomate_active_profile_id'), // profile.ts ACTIVE_PROFILE_KEY
];

/**
 * Best-effort: try to delete every SecureStore key the app may have written
 * during this user's session. Errors are swallowed individually so one
 * failing key does not block the rest of the cleanup.
 *
 * @param profileIds All profile IDs known to the current account, including
 *   the active profile and any linked child profiles. Passing an empty array
 *   is fine — global keys are always cleared regardless.
 *
 * [CR-SIGNOUT-TIMEOUT-10] Bounded best-effort: the entire cleanup races
 * against SIGNOUT_CLEANUP_TIMEOUT_MS (3s). On Android Keystore lock
 * contention or iOS Keychain busy-waits, individual deleteItemAsync calls
 * can stall — without the cap, sign-out would block on those, leaving the
 * user trapped inside their account. Pre-fix the call was fire-and-forget
 * (`void deleteItemAsync(...)`) which never blocked but also never finished
 * cleanup before signOut(); this fix preserves the cleanup-first ordering
 * while still guaranteeing sign-out completes promptly.
 */
export const SIGNOUT_CLEANUP_TIMEOUT_MS = 3_000;

export async function clearProfileSecureStorageOnSignOut(
  profileIds: ReadonlyArray<string>
): Promise<void> {
  const keys = new Set<string>();

  for (const profileId of profileIds) {
    if (!profileId) continue;
    for (const make of PER_PROFILE_KEYS) {
      keys.add(make(profileId));
    }
  }
  for (const k of GLOBAL_KEYS) {
    keys.add(k);
  }

  // Run in parallel with per-key error isolation. SecureStore.deleteItemAsync
  // is a no-op on missing keys, so we never need to check existence first.
  const cleanup = Promise.all(
    Array.from(keys).map((key) =>
      SecureStore.deleteItemAsync(key).catch(() => {
        // Per-key failure is non-fatal — better to clear what we can than
        // to abort cleanup over one stuck key.
      })
    )
  );

  // [CR-SIGNOUT-TIMEOUT-10] Hard cap so a stuck Keychain/Keystore can't
  // trap the user. Whichever finishes first wins; remaining deletes
  // continue in the background but never block the sign-out flow.
  await Promise.race([
    cleanup,
    new Promise<void>((resolve) =>
      setTimeout(resolve, SIGNOUT_CLEANUP_TIMEOUT_MS)
    ),
  ]);
}
