// ---------------------------------------------------------------------------
// Centralized sign-out cleanup
//
// Every sign-out path in the app MUST call `signOutWithCleanup` instead of
// invoking Clerk's `signOut()` directly. Skipping this leaves two classes of
// state from the previous user behind on a shared device:
//
// 1. SecureStore — `mentomate_active_profile_id` + every per-profile key
//    (bookmark prompts, dictation prefs, rating-prompt counters, accent
//    preset, etc.) survive across sign-outs.
// 2. TanStack Query cache — the `['profiles', userId]` entry (and every
//    other cached query) survives across sign-outs.
//
// The cross-account leak (2026-05-10) chained these: ProfileProvider restored
// the previous user's saved profile id, matched it against the stale cached
// profiles list (savedExists=true), and pushed that id into the api-client
// module as `X-Profile-Id`. The server's profile-scope middleware then 403'd
// the mismatched id, surfacing as the "We could not load your profile" error
// fallback in (app)/_layout.tsx, AND — when the wrong id matched a profile
// the *current* user did own — counting requests against the wrong profile's
// quota server-side.
//
// Per-call-site cleanup (the pre-2026-05-10 pattern) drifts: of the 9
// sign-out call sites that existed before this consolidation, only one
// (more/index.tsx) wiped SecureStore, and only one (the auth-expired
// callback) cleared the query cache. This module is the single source of
// truth — new sign-out call sites should import `signOutWithCleanup` rather
// than re-implementing the steps.
// ---------------------------------------------------------------------------

import type { QueryClient } from '@tanstack/react-query';
import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';
import { clearTransitionState } from './auth-transition';
import { clearPendingAuthRedirect } from './pending-auth-redirect';
import { setActiveProfileId, setProxyMode } from './api-client';

export interface SignOutWithCleanupParams {
  /** Clerk's `signOut` function — obtain via `useClerk()` or `useAuth()`. */
  clerkSignOut: () => Promise<void>;
  /** TanStack Query client — obtain via `useQueryClient()`. */
  queryClient: QueryClient;
  /**
   * All profile IDs the current account owns (active + any linked children).
   * Used to wipe per-profile SecureStore keys. Pass an empty array when the
   * profile list is unavailable (e.g. auth-expired path before profiles
   * load) — only global keys are wiped in that case.
   */
  profileIds: ReadonlyArray<string>;
}

/**
 * Standard sign-out path. Performs cleanup in dependency order, then calls
 * Clerk's `signOut`. Throws whatever `clerkSignOut` throws; cleanup itself
 * never throws (per-key SecureStore failures are swallowed inside
 * `clearProfileSecureStorageOnSignOut`, bounded by SIGNOUT_CLEANUP_TIMEOUT_MS).
 */
export async function signOutWithCleanup(
  params: SignOutWithCleanupParams,
): Promise<void> {
  const { clerkSignOut, queryClient, profileIds } = params;

  // Reset in-memory api-client identity FIRST so any request that fires
  // between here and the Clerk signOut resolution cannot ship a stale
  // X-Profile-Id. The token will also be invalidated once Clerk signs out,
  // but the module-level identity is what scopes server-side responses.
  setActiveProfileId(undefined);
  setProxyMode(false);

  // Clear navigation/transition state so a half-finished sign-in flow can't
  // resume after the next sign-in, and the saved post-auth redirect from
  // user A can't carry over to user B.
  clearTransitionState();
  clearPendingAuthRedirect();

  // Drop every cached query — profiles, subjects, progress, dashboard, etc.
  // Without this, ProfileProvider's "saved id exists in cached profiles"
  // check (profile.ts) can match a previous user's profile and propagate
  // their id back into the api-client module.
  queryClient.clear();

  // SecureStore + AsyncStorage + Outbox cleanup. Bounded by
  // SIGNOUT_CLEANUP_TIMEOUT_MS so a stuck Keychain/Keystore can't trap the
  // user inside their session.
  await clearProfileSecureStorageOnSignOut(profileIds);

  await clerkSignOut();
}
