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
export type ActiveProfileRole = 'owner' | 'impersonated-child' | 'child';

export function useActiveProfileRole(): ActiveProfileRole | null {
  const { activeProfile } = useProfile();
  const { isParentProxy } = useParentProxy();

  if (!activeProfile) return null;
  // Precedence matters: in production isParentProxy implies !isOwner (see
  // useParentProxy contract), but tests can set the flags independently.
  // Putting proxy first is also defensive — if a future bug ever flips an
  // owner profile into proxy mode, we'd rather hide destructive actions
  // than expose them.
  if (isParentProxy) return 'impersonated-child';
  if (activeProfile.isOwner) return 'owner';
  return 'child';
}
