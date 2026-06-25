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

import AsyncStorage from '@react-native-async-storage/async-storage';

import * as SecureStore from './secure-storage';
import { sanitizeSecureStoreKey } from './secure-storage';
import {
  bookmarkNudgeKey,
  bookmarkNudgeLegacyKey,
  earlyAdopterDismissedKey,
  dictationPaceKey,
  dictationPunctuationKey,
  ratingRecallCountKey,
  ratingLastPromptKey,
  parentHomeSeenKey,
  notificationFirstAskKey,
  guardianNotificationAskKey,
} from './secure-store-keys';

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
  earlyAdopterDismissedKey,
  // BookmarkNudgeTooltip.tsx — getBookmarkNudgeKey writes the dot-separator
  // form post-2026-05-23 (commit 8803082f8). The colon-sanitized form is the
  // legacy variant the writer's getLegacyBookmarkNudgeKey reads as a fallback;
  // we wipe it here too so it doesn't persist forever on devices that
  // dismissed under the old key. [CR-2026-05-21-143]
  bookmarkNudgeKey,
  bookmarkNudgeLegacyKey,
  // Raw un-sanitized colon variant: defensive against any pre-sanitization
  // writer that landed before sanitizeSecureStoreKey was introduced. iOS
  // would have rejected this key; Android may have accepted it.
  (id) => `bookmark-nudge-shown:${id}`,
  // use-dictation-preferences.ts — getPaceKey + getPunctKey
  dictationPaceKey,
  dictationPunctuationKey,
  // use-rating-prompt.ts — current keys only.
  // Legacy `rating-recall-success-count:${id}` and `rating-last-prompt:${id}`
  // colon-delimited keys removed 2026-05-24 (BUG-724 / FCR-2026-05-23-L14.F10).
  // Codebase is pre-launch (no real devices) and SecureStore guardrail forbids
  // colons in keys; the legacy migration in use-rating-prompt.ts is removed in
  // the same change so there is nothing left to clean up.
  ratingRecallCountKey,
  ratingLastPromptKey,
  // session-recovery.ts — getRecoveryKey, sanitized
  (id) => sanitizeSecureStoreKey(`session-recovery-marker-${id}`),
  // [CR-SECURESTORE-REGISTRY-11] Previously-unregistered keys (BUG-723 leak).
  // (app)/_layout.tsx — postApprovalSeen flag per profile
  (id) => `postApprovalSeen_${id}`,
  // (app)/subscription.tsx — getNotifyStorageKey: child-paywall notify timestamp
  (id) => sanitizeSecureStoreKey(`child-paywall-notified-at-${id}`),
  // Legacy permission setup gate — clear orphaned flag from existing installs.
  (id) => sanitizeSecureStoreKey(`permissionSetupSeen_${id}`),
  // use-post-session-notification-ask.ts — one-shot post-session notification primer flag.
  notificationFirstAskKey,
  // use-guardian-notification-ask.ts — one-shot parent-home notification primer flag.
  guardianNotificationAskKey,
  // session-types.ts — getInputModeKey, sanitized
  (id) => sanitizeSecureStoreKey(`voice-input-mode-${id}`),
  // [CR-PR129-M6] (app)/_layout.tsx — ACCENT_STORE_PREFIX: accent preset per profile, sanitized.
  // Was previously hidden from registry enforcement because _layout.tsx was
  // file-scoped in REGISTRY_EXCEPTIONS for its Clerk tokenCache callsite.
  (id) => sanitizeSecureStoreKey(`accentPreset_${id}`),
  // ParentTransitionNotice.tsx — show the parent-home orientation cue once per profile.
  parentHomeSeenKey,
  // scope-context.tsx — last active relationship-lens scope per profile.
  (id) => sanitizeSecureStoreKey(`scope.last-active-${id}`),
];

// AsyncStorage keys cleared at sign-out (account-scoped, not device-scoped).
// Distinct from SecureStore GLOBAL_KEYS below. Each entry must include a
// comment justifying why it is per-account vs. device-level.
//
// app-ui-language: device preference, preserved across sign-out
export const GLOBAL_ASYNCSTORAGE_KEYS: ReadonlyArray<string> = [
  // Legacy per-user dismissal from removed mentor-language suggestion UI.
  // Keep clearing it so existing devices don't retain the orphaned key.
  'i18n-auto-suggest-dismissed',
  // [BUG-357] Legacy un-scoped react-query persister blob. Post-fix the
  // persister key is identity-scoped (`eduagent-query-cache::<userId>`),
  // but devices that wrote to the pre-fix key would otherwise leave the
  // orphan behind forever. Defense-in-depth on top of the primary
  // identity-scoped key fix in query-persister.ts.
  'eduagent-query-cache',
  // AddToMyLearningButton.tsx falls back to the bare TIP_KEY_PREFIX
  // (no profile suffix, no trailing dot) when activeProfile is absent at
  // render time. The PER_PROFILE prefix wipe matches `add_to_my_learning.tip_seen.<id>`
  // but not the bare form — clear it explicitly so the tip resets on sign-out.
  'add_to_my_learning.tip_seen',
];

// Global keys that should reset when no one is signed in. Excludes onboarding
// flags that legitimately survive sign-out cycles (e.g., a user who signs out
// to switch accounts on the same device should not be prompted to re-onboard).
export const GLOBAL_KEYS: ReadonlyArray<string> = [
  'hasSignedInBefore', // sign-in.tsx HAS_SIGNED_IN_KEY — "Welcome back" gate
  sanitizeSecureStoreKey('parent-proxy-active'), // use-parent-proxy.ts / profile.ts
  'session-recovery-marker', // session-recovery.ts (un-keyed legacy form)
  sanitizeSecureStoreKey('mentomate_active_profile_id'), // profile.ts ACTIVE_PROFILE_KEY
  // [CR-SECURESTORE-REGISTRY-11] Previously-unregistered. BYOK waitlist is
  // account-scoped (see BUG-399 comment in subscription.tsx) — clears on sign-out.
  'byok-waitlist-joined',
  // preview-onboarding-state.ts — pre-signup intent + topic (1h TTL).
  // Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md
  // Unconditional: cleanup is harmless when key absent; prevents cross-account
  // leak if feature flag is off but the key was written in a prior session.
  'mentomate_preview_intent',
  // pre-auth-audience.ts — chooser audience carried across signup (1h TTL).
  // Unlike the intro-seen flag this is transient onboarding intent, not a
  // durable "seen" latch, so it IS wiped on sign-out: the next signed-out user
  // on a shared device must start from a clean chooser, not inherit the prior
  // user's parent/learner choice. Spec: docs/plans/2026-05-28-parent-audience-add-child-onboarding.md
  'preAuthAudience.v1',
];

// [CR-SECURESTORE-REGISTRY-11] Documented exceptions — specific callsites that
// the meta-test should ignore. Each entry is scoped to a single callsite
// (file + line number) rather than an entire file, so that adding a registered
// key to the same file does not silently bypass the guard for that new key.
//
// [CR-PR129-M6] Changed from file-scoped to callsite-scoped (file + line) to
// prevent a registered key in an exception-listed file from silently swallowing
// an unregistered key in the same file.
//
// If a future writer is added that doesn't fit one of these categories,
// register its key shape in PER_PROFILE_KEYS / GLOBAL_KEYS above instead of
// expanding this list.
export const REGISTRY_EXCEPTIONS: ReadonlyArray<{
  file: string;
  line: number;
  reason: string;
}> = [
  {
    file: 'apps/mobile/src/lib/secure-storage.ts',
    line: 97,
    reason:
      'Wrapper module — this is the setItemAsync function definition, not a callsite. The scanner matches the function signature; the key parameter is caller-supplied.',
  },
  {
    file: 'apps/mobile/src/lib/secure-storage.ts',
    line: 109,
    reason:
      'Wrapper module — delegates to ExpoSecureStore.setItemAsync (with options). Not a callsite that writes app data; caller-supplied key.',
  },
  {
    file: 'apps/mobile/src/lib/secure-storage.ts',
    line: 111,
    reason:
      'Wrapper module — delegates to ExpoSecureStore.setItemAsync (without options). Not a callsite that writes app data; caller-supplied key.',
  },
  {
    file: 'apps/mobile/src/lib/migrate-secure-store-key.ts',
    line: 26,
    reason:
      'One-shot migration helper that copies arbitrary oldKey→newKey. Both keys are caller-supplied — registration belongs at the call site of the migration, not here.',
  },
  {
    file: 'apps/mobile/src/app/_layout.tsx',
    line: 55,
    reason:
      'Clerk tokenCache adapter — keys are Clerk-internal session/JWT tokens, not app data. Clerk manages their lifecycle; signOut() drops them via the SDK.',
  },
  {
    file: 'apps/mobile/src/lib/summary-draft.ts',
    line: 54,
    reason:
      'Drafts use getDraftKey(profileId, sessionId) — multi-key shape with sessionId we cannot enumerate at sign-out. Drafts self-expire via DRAFT_TTL_MS (7d) on next read, so leakage is bounded; document and accept rather than register a prefix-wipe (expo-secure-store has no listKeys API). [Line updated WI-1090: KEY_PREFIX const replaced by barrel import, shifted line by 1]',
  },
  {
    file: 'apps/mobile/src/lib/intro-state.ts',
    line: 53,
    reason:
      'Pre-auth welcome-intro "seen" flag is device-scoped (single static key, no userId or profileId) — falls outside PER_PROFILE_KEYS. Per GLOBAL_KEYS comment, onboarding flags that legitimately survive sign-out cycles are intentionally excluded from the global wipe: a user who signs out and back in on the same device must not re-see the intro. The key contains no user identifier, so cross-account leakage is structurally impossible (the only signal is "this device has been through the welcome cards once"). Spec: docs/plans/2026-05-27-pre-auth-welcome-flow.md. [Line updated WI-1090: local const replaced by barrel import, shifted line by 4]',
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

const OUTBOX_FLOWS = ['session'] as const;

// [BUG-128] Prefixes whose keys we cannot enumerate ahead of time (e.g.
// summary-draft uses `summary-draft-${profileId}-${sessionId}` and we do not
// retain a list of all session ids the user ever drafted against). For any
// store that exposes a `getAllKeys()` API (AsyncStorage does; expo-secure-store
// does NOT), we scan post-hoc and remove matching keys at sign-out time so
// per-child drafts cannot accumulate across accounts on a shared device.
//
// IMPORTANT scope note: today summary-draft writes to SecureStore (no
// getAllKeys), so this scan is effectively a no-op for production data. The
// proper fix is to (a) move the draft index to AsyncStorage, or (b) maintain
// an AsyncStorage-side index of active draft keys per profile that
// summary-draft.ts updates on every write/clear. Both options live in
// summary-draft.ts which is outside this worker's file scope — recorded as a
// follow-up. Until then this scan still serves as a forward-only guard so any
// future migration to AsyncStorage is automatically wiped on sign-out.
// AddToMyLearningButton.tsx writes `add_to_my_learning.tip_seen.${profileId}`
// to AsyncStorage. We can't enumerate every profileId we ever wrote against
// (a shared device can sign in/out across many accounts), and the writer
// uses AsyncStorage rather than SecureStore, so the registry meta-test
// (sign-out-cleanup-registry.test.ts) wouldn't catch a missing wipe here.
// Forward-only prefix wipe covers all per-profile tip-seen keys.
const ASYNCSTORAGE_PREFIX_WIPE: ReadonlyArray<string> = [
  'summary-draft-',
  'add_to_my_learning.tip_seen.',
];

export async function clearProfileSecureStorageOnSignOut(
  profileIds: ReadonlyArray<string>,
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

  // Outbox entries live in AsyncStorage, not SecureStore. Build the key list
  // so they are wiped alongside SecureStore keys below.
  const outboxKeys: string[] = [];
  for (const profileId of profileIds) {
    if (!profileId) continue;
    for (const flow of OUTBOX_FLOWS) {
      outboxKeys.push(`outbox-${profileId}-${flow}`);
    }
  }

  // [BUG-128] Best-effort AsyncStorage prefix scan. Catches summary-draft and
  // any other multi-component-key writer that lands in AsyncStorage. The
  // promise wrapper isolates getAllKeys failures from the rest of cleanup —
  // an AsyncStorage error here must not block SecureStore wipes or sign-out.
  const prefixScanRemoval = (async () => {
    if (ASYNCSTORAGE_PREFIX_WIPE.length === 0) return;
    let allKeys: readonly string[];
    try {
      allKeys = await AsyncStorage.getAllKeys();
    } catch {
      return; // getAllKeys failed — non-fatal, skip prefix scan
    }
    const matched = allKeys.filter((k) =>
      ASYNCSTORAGE_PREFIX_WIPE.some((prefix) => k.startsWith(prefix)),
    );
    if (matched.length === 0) return;
    try {
      await AsyncStorage.multiRemove(matched);
    } catch {
      // Per-key failure is non-fatal — same policy as the static lists below.
    }
  })();

  // Run in parallel with per-key error isolation. SecureStore.deleteItemAsync
  // is a no-op on missing keys, so we never need to check existence first.
  const cleanup = Promise.all([
    ...Array.from(keys).map((key) =>
      SecureStore.deleteItemAsync(key).catch(() => {
        // Per-key failure is non-fatal — better to clear what we can than
        // to abort cleanup over one stuck key.
      }),
    ),
    outboxKeys.length > 0
      ? AsyncStorage.multiRemove(outboxKeys).catch(() => {
          // Per-key failure is non-fatal — same policy as SecureStore deletes above.
        })
      : Promise.resolve(),
    GLOBAL_ASYNCSTORAGE_KEYS.length > 0
      ? AsyncStorage.multiRemove([...GLOBAL_ASYNCSTORAGE_KEYS]).catch(() => {
          // Per-key failure is non-fatal — same policy as outbox + SecureStore.
        })
      : Promise.resolve(),
    prefixScanRemoval,
  ]);

  // [CR-SIGNOUT-TIMEOUT-10] Hard cap so a stuck Keychain/Keystore can't
  // trap the user. Whichever finishes first wins; remaining deletes
  // continue in the background but never block the sign-out flow.
  await Promise.race([
    cleanup,
    new Promise<void>((resolve) =>
      setTimeout(resolve, SIGNOUT_CLEANUP_TIMEOUT_MS),
    ),
  ]);
}
