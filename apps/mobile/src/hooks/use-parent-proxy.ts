import { useMemo } from 'react';
import { useProfile, type Profile } from '../lib/profile';

export interface ParentProxyState {
  isParentProxy: boolean;
  childProfile: Profile | null;
  parentProfile: Profile | null;
}

/**
 * [ACCOUNT-04] Returns proxy state based on the EXPLICIT proxy flag set in
 * ProfileContext — NOT derived from profile shape.
 *
 * Proxy mode is true only when a retained internal/test path deliberately
 * calls switchProfile(id, { proxyMode: true }). Normal user-facing child
 * review paths use parent-native child routes instead. A plain profile switch
 * always clears proxy mode so a non-owner profile sees normal learner UI.
 *
 * SecureStore persistence and setProxyMode (api-client module var) are now
 * owned by ProfileProvider.switchProfile so they share a single write path.
 */
export function useParentProxy(): ParentProxyState {
  const { profiles = [], activeProfile, isExplicitProxyMode } = useProfile();

  const parentProfile = useMemo(
    () => profiles.find((profile) => profile.isOwner) ?? null,
    [profiles],
  );

  // The explicit flag is necessary but not sufficient: restored state must
  // still describe an owner viewing a non-owner profile in the current
  // operation set. A learner-only response after family join cannot restore
  // the former owner's proxy capability.
  const isParentProxy =
    isExplicitProxyMode &&
    activeProfile?.isOwner === false &&
    parentProfile !== null;
  const childProfile = isParentProxy ? activeProfile : null;

  return { isParentProxy, childProfile, parentProfile };
}
