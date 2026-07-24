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

import * as Sentry from '@sentry/react-native';
import type { QueryClient } from '@tanstack/react-query';
import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';
import { clearTransitionState } from './auth-transition';
import { clearPendingAuthRedirect } from './pending-auth-redirect';
import {
  buildPersisterKey,
  purgePersisterKeys,
  removeAllScopedPersisterCaches,
} from './query-persister';
import {
  setActiveProfileId,
  setProxyMode,
  resetAuthExpiredGuard,
} from './api-client';
import { clearNavigationTransitionProvenance } from './navigation-transition-provenance';

// [BUG-771] Hard timeout on Clerk's signOut so a stuck network call (web
// socket close, slow Clerk backend, hanging fetch) cannot trap the user in
// their session. Sized well above clearProfileSecureStorageOnSignOut's 3s
// internal cap so the storage cleanup that runs BEFORE clerkSignOut still
// has its full budget; the cap here only guards the Clerk call itself plus
// the resetAuthExpiredGuard finally block.
export const CLERK_SIGNOUT_TIMEOUT_MS = 8_000;

class ClerkSignOutTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Clerk signOut exceeded ${timeoutMs}ms timeout`);
    this.name = 'ClerkSignOutTimeoutError';
  }
}

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
  /**
   * Clerk userId of the account being signed out. [WI-1987] Used to derive
   * and deterministically remove the scoped query-persister AsyncStorage key
   * (`buildPersisterKey(clerkUserId)`) — see the removal step below. When
   * omitted (identity not yet loaded, e.g. an early auth-expired path), the
   * scoped key cannot be targeted and is left for the persister's own
   * throttled write to eventually catch up, same as before this fix.
   */
  clerkUserId?: string;
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
  const { clerkSignOut, queryClient, profileIds, clerkUserId } = params;

  clearNavigationTransitionProvenance();

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

  // [WI-1987] Deterministically remove the on-disk scoped persister cache.
  // queryClient.clear() only empties the in-memory cache — the AsyncStorage
  // mirror (query-persister.ts's createScopedPersister) only picks up the
  // now-empty cache via its throttled (2s) subscription. Relying on that
  // throttle to fire was the bug: a crash/force-quit within the ~2s window
  // left the full pre-sign-out cache — including session transcripts — on
  // disk permanently. Removing the key directly here closes that window;
  // cleanup completing means the scoped blob is gone, independent of the
  // persister's throttle timer.
  //
  // [WI-1987 rework] The no-clerkUserId branch used to skip this entirely
  // and fall back to the racy queryClient.clear() + persister-throttle path
  // — the exact crash window this fix exists to close, left open on the
  // auth-expired / profile-load-timeout paths. It now sweeps every scoped
  // persister key on disk via `removeAllScopedPersisterCaches` — we can't
  // compute the one targeted key without a clerkUserId, so we remove them
  // all instead of leaving any of them to the throttle.
  if (clerkUserId) {
    // [WI-1987] Escalate-on-failure purge (see purgePersisterKeys in
    // query-persister.ts). A swallowed removal here would leave a plaintext
    // learner-content cache on disk while sign-out reported success — the
    // silent recovery the Fix Development Rule bans in auth code. purge never
    // throws (sign-out always completes — session teardown is the primary
    // boundary) and Sentry-reports the KEY NAME on failure; the survivor is
    // re-swept at the next definitively-signed-out moment (app start / before
    // next sign-in) by reattemptPersisterPurgeIfSignedOut in the app shell.
    await purgePersisterKeys([buildPersisterKey(clerkUserId)]);
  } else {
    // [WI-1987] clerkUserId is unavailable (identity not yet loaded — e.g.
    // auth-expired 401 handler, profile-load-timeout). Breadcrumb so this
    // fallback path is observable in production.
    Sentry.addBreadcrumb({
      category: 'auth',
      level: 'warning',
      message:
        'sign-out: scoped persister removal used full-sweep fallback (no clerkUserId)',
    });
    // Escalate-on-failure full sweep — also never throws; Sentry-reports the
    // surviving key names rather than swallowing the failure.
    await removeAllScopedPersisterCaches();
  }

  // [SEC-SENTRY-SCOPE] Wipe the Sentry scope so that any crash between
  // sign-out and the next sign-in does not carry the previous user's
  // breadcrumbs, tags, contexts, or user identity. Sentry.setUser(null) is
  // called by evaluateSentryForProfile() only AFTER the next profile loads —
  // too late. We call both here so the window is bounded to the cleanup block.
  Sentry.getCurrentScope().clear();
  Sentry.setUser(null);

  // SecureStore + AsyncStorage + Outbox cleanup. Bounded by
  // SIGNOUT_CLEANUP_TIMEOUT_MS so a stuck Keychain/Keystore can't trap the
  // user inside their session.
  await clearProfileSecureStorageOnSignOut(profileIds);

  // [BUG-560] Reset the auth-expired guard in a finally block so the flag is
  // cleared regardless of whether clerkSignOut succeeds or throws. Without
  // this, _authExpiredFiring stays true permanently after sign-out, silently
  // swallowing all subsequent 401s for the next signed-in user.
  //
  // [BUG-771] Race clerkSignOut against a hard timeout. Symptom in production:
  // sign-out button hangs > 45s and the user is never returned to the
  // sign-in screen. Per AGENTS.md UX Resilience Rules ("stuck states must
  // have a timeout + recovery action") and Fix Development Rules ("silent
  // recovery without escalation is banned") we:
  //   1. Cap the Clerk call at CLERK_SIGNOUT_TIMEOUT_MS so the caller can
  //      force-redirect to /sign-in regardless of Clerk's state.
  //   2. Emit a Sentry breadcrumb + captureMessage when the timeout fires so
  //      the fallback is observable in production — `console.warn` alone
  //      would be invisible (you can't query how often it triggered).
  // Cleanup that ran BEFORE this block (cache clear, SecureStore wipe,
  // Sentry scope wipe) already removed the previous user's local state, so a
  // timed-out Clerk call leaves the device in a safe state — the auth
  // session may linger server-side but local UI is fully signed out.
  try {
    await raceClerkSignOutWithTimeout(clerkSignOut);
  } finally {
    resetAuthExpiredGuard();
  }
}

async function raceClerkSignOutWithTimeout(
  clerkSignOut: () => Promise<void>,
): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      clerkSignOut(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          const err = new ClerkSignOutTimeoutError(CLERK_SIGNOUT_TIMEOUT_MS);
          Sentry.addBreadcrumb({
            category: 'auth',
            level: 'warning',
            message: 'sign-out: clerkSignOut timed out',
            data: { timeoutMs: CLERK_SIGNOUT_TIMEOUT_MS },
          });
          Sentry.captureMessage('sign-out: clerkSignOut timed out', {
            level: 'warning',
            tags: {
              feature: 'auth',
              fallback: 'clerk-signout-timeout',
            },
            extra: { timeoutMs: CLERK_SIGNOUT_TIMEOUT_MS },
          });
          reject(err);
        }, CLERK_SIGNOUT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

export { ClerkSignOutTimeoutError };
