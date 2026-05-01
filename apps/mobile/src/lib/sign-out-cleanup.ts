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
// readers can verify against the writer. The companion meta-test
// (sign-out-cleanup-registry.test.ts) scans the codebase for
// SecureStore.setItemAsync callsites and fails if any key shape isn't
// covered here, in GLOBAL_KEYS, or in the documented exceptions list.
//
// IMPORTANT: when exporting this array, keep it as `export` so tests can
// introspect; the export is purely for test enforcement.
export const PER_PROFILE_KEYS: ReadonlyArray<(profileId: string) => string> = [
  // EarlyAdopterCard.tsx — DISMISSED_KEY: `earlyAdopterDismissed_${profileId}`
  (id) => `earlyAdopterDismissed_${id}`,
  // BookmarkNudgeTooltip.tsx — getBookmarkNudgeKey: `bookmark-nudge-shown:${profileId}`
  (id) => `bookmark-nudge-shown:${id}`,
  // use-dictation-preferences.ts — getPaceKey + getPunctKey
  (id) => `dictation-pace-${id}`,
  (id) => `dictation-punctuation-${id}`,
  // use-rating-prompt.ts — current + legacy (different separator)
  (id) => `rating-recall-success-count-${id}`,
  (id) => `rating-last-prompt-${id}`,
  (id) => `rating-recall-success-count:${id}`,
  (id) => `rating-last-prompt:${id}`,
  // session-recovery.ts — getRecoveryKey, sanitized
  (id) => sanitizeSecureStoreKey(`session-recovery-marker-${id}`),
  // [CR-SECURESTORE-REGISTRY-11] Previously-unregistered keys (BUG-723 leak).
  // (app)/_layout.tsx — postApprovalSeen flag per profile
  (id) => `postApprovalSeen_${id}`,
  // (app)/subscription.tsx — getNotifyStorageKey: child-paywall notify timestamp
  (id) => `child-paywall-notified-at-${id}`,
  // use-permission-setup.ts — permissionSetupSeen flag, sanitized
  (id) => sanitizeSecureStoreKey(`permissionSetupSeen_${id}`),
  // session-types.ts — getInputModeKey, sanitized
  (id) => sanitizeSecureStoreKey(`voice-input-mode-${id}`),
];

// Global keys that should reset when no one is signed in. Excludes onboarding
// flags that legitimately survive sign-out cycles (e.g., a user who signs out
// to switch accounts on the same device should not be prompted to re-onboard).
export const GLOBAL_KEYS: ReadonlyArray<string> = [
  'hasSignedInBefore', // sign-in.tsx HAS_SIGNED_IN_KEY — "Welcome back" gate
  'mentomate_pending_auth_redirect', // pending-auth-redirect.ts
  sanitizeSecureStoreKey('parent-proxy-active'), // use-parent-proxy.ts / profile.ts
  'session-recovery-marker', // session-recovery.ts (un-keyed legacy form)
  sanitizeSecureStoreKey('mentomate_active_profile_id'), // profile.ts ACTIVE_PROFILE_KEY
  // [CR-SECURESTORE-REGISTRY-11] Previously-unregistered. BYOK waitlist is
  // account-scoped (see BUG-399 comment in subscription.tsx) — clears on sign-out.
  'byok-waitlist-joined',
];

// [CR-SECURESTORE-REGISTRY-11] Documented exceptions — callsites that the
// meta-test should ignore. Each entry must justify why the key is NOT in
// the registry. If a future writer is added that doesn't fit one of these
// categories, register its key shape above instead of expanding this list.
export const REGISTRY_EXCEPTIONS: ReadonlyArray<{
  file: string;
  reason: string;
}> = [
  {
    file: 'apps/mobile/src/lib/secure-storage.ts',
    reason:
      'Wrapper module — calls ExpoSecureStore.setItemAsync directly. Not a callsite that writes app data.',
  },
  {
    file: 'apps/mobile/src/lib/migrate-secure-store-key.ts',
    reason:
      'One-shot migration helper that copies arbitrary oldKey→newKey. Both keys are caller-supplied — registration belongs at the call site of the migration, not here.',
  },
  {
    file: 'apps/mobile/src/app/_layout.tsx',
    reason:
      'Clerk tokenCache adapter — keys are Clerk-internal session/JWT tokens, not app data. Clerk manages their lifecycle; signOut() drops them via the SDK.',
  },
  {
    file: 'apps/mobile/src/lib/summary-draft.ts',
    reason:
      'Drafts use getDraftKey(profileId, sessionId) — multi-key shape with sessionId we cannot enumerate at sign-out. Drafts self-expire via DRAFT_TTL_MS (7d) on next read, so leakage is bounded; document and accept rather than register a prefix-wipe (expo-secure-store has no listKeys API).',
  },
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
