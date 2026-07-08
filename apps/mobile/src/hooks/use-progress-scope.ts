import { useAppContext } from '../lib/app-context';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import { useProfile } from '../lib/profile';
import { useActiveProfileRole } from './use-active-profile-role';
import { useNavigationDataScopeContract } from './use-navigation-contract';

export function useProgressNavigationScope(): {
  activeProfile: ReturnType<typeof useProfile>['activeProfile'];
  mode: ReturnType<typeof useAppContext>['mode'];
  profileId: string | undefined;
  canAccessFamilyChildData: boolean;
} {
  const { activeProfile } = useProfile();
  const { mode: legacyMode } = useAppContext();
  const activeProfileRole = useActiveProfileRole();
  const navigationContract = useNavigationDataScopeContract();
  const mode = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? navigationContract.queryScope.appContext
    : legacyMode;
  const profileId = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? (navigationContract.queryScope.profileId ?? undefined)
    : activeProfile?.id;
  const canAccessFamilyChildData = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? navigationContract.gates.showFamilyChildActivity
    : legacyMode !== 'study' && activeProfileRole === 'owner';

  return { activeProfile, mode, profileId, canAccessFamilyChildData };
}

export function useSelfProgressNavigationScope(): {
  activeProfile: ReturnType<typeof useProfile>['activeProfile'];
  mode: ReturnType<typeof useAppContext>['mode'];
  profileId: string | undefined;
} {
  const { activeProfile } = useProfile();
  const { mode: legacyMode } = useAppContext();
  const navigationContract = useNavigationDataScopeContract();

  if (!FEATURE_FLAGS.MODE_NAV_V1_ENABLED) {
    return { activeProfile, mode: legacyMode, profileId: activeProfile?.id };
  }

  return {
    activeProfile,
    mode: navigationContract.queryScope.appContext,
    profileId: navigationContract.queryScope.profileId ?? undefined,
  };
}
