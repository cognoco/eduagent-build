import type { AgeGateRole } from '@eduagent/schemas';

import { useProfile } from '../lib/profile';
import { useParentProxy } from './use-parent-proxy';

// Discriminated role for the *active* profile. Drives role-aware copy and
// guards (e.g. hiding account-level destructive actions during impersonation,
// suppressing child-targeted celebrations on parent profiles, varying
// "set by your parent" copy for owners who have no parent).
//
// Why three values, not two:
//   - 'owner': adult/parent on their OWN profile (no parent in scope)
//   - 'child': child profile signed in directly (rare — app is 11+)
//   - 'impersonated-child': parent acting AS a child via the proxy banner
//
// The last two share `!isOwner` but differ in copy needs: an impersonating
// parent must not see "Sign out" / "Delete account", but should still see
// the child-scoped "Set by your parent" framing on screens reachable in
// proxy mode.
export type ActiveProfileRole = AgeGateRole;

export interface ActiveProfileRoleState {
  /**
   * Resolved role for the active profile, or null when no profile is loaded.
   * IMPORTANT: `null` does NOT distinguish "still loading" from "loaded but
   * missing" — consumers that need to gate UI on the difference must read
   * `isLoading` as well. Use the simpler `useActiveProfileRole()` wrapper
   * when the distinction does not matter (most copy/role-aware screens).
   */
  role: ActiveProfileRole | null;
  /**
   * True while the underlying profile query is still resolving. Falls to
   * false once a profile is loaded OR the query has resolved with no
   * active profile. Use this to suppress role-gated UI flicker (e.g. a
   * "no access" banner that would briefly flash before the owner profile
   * loads).
   */
  isLoading: boolean;
}

/**
 * [BUG-130] Structured variant that distinguishes "loading" from "loaded
 * but no active profile". Prefer this over `useActiveProfileRole()` when a
 * role-gated UI element would otherwise flash the wrong state during the
 * initial load (e.g. showing "child" copy briefly before the owner profile
 * resolves). The legacy single-return shape collapsed both states to
 * `null`, which is fragile null-as-falsy — callers that branched on
 * "missing" silently fired during the loading window too.
 */
export function useActiveProfileRoleState(): ActiveProfileRoleState {
  const { activeProfile, isLoading } = useProfile();
  const { isParentProxy } = useParentProxy();

  if (!activeProfile) {
    return { role: null, isLoading };
  }
  // Precedence matters: in production isParentProxy implies !isOwner (see
  // useParentProxy contract), but tests can set the flags independently.
  // Putting proxy first is also defensive — if a future bug ever flips an
  // owner profile into proxy mode, we'd rather hide destructive actions
  // than expose them.
  if (isParentProxy) return { role: 'impersonated-child', isLoading: false };
  if (activeProfile.isOwner) return { role: 'owner', isLoading: false };
  return { role: 'child', isLoading: false };
}

/**
 * Convenience wrapper that returns just the role (or null). Existing
 * call-sites that don't need to distinguish loading from missing keep
 * using this — fragile null-as-falsy is preserved where the caller has
 * already accepted that trade-off. New code that gates destructive or
 * privacy-sensitive UI should prefer `useActiveProfileRoleState()` so
 * "still loading" doesn't render the wrong role briefly.
 */
export function useActiveProfileRole(): ActiveProfileRole | null {
  return useActiveProfileRoleState().role;
}
