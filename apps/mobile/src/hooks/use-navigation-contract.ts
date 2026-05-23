import { useMemo } from 'react';

import { useActiveProfileRole } from './use-active-profile-role';
import { useParentProxy } from './use-parent-proxy';
import { useSubscriptionStatus } from './use-subscription';
import { useAppContext } from '../lib/app-context';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import {
  resolveNavigationContract,
  type NavigationContract,
  type NavigationSubscriptionContext,
} from '../lib/navigation-contract';
import { useProfile } from '../lib/profile';

function useResolvedNavigationContract(
  subscription: NavigationSubscriptionContext,
): NavigationContract {
  const { activeProfile, profiles = [] } = useProfile();
  const { mode } = useAppContext();
  const { isParentProxy } = useParentProxy();
  const role = useActiveProfileRole();
  const subscriptionStatus = subscription.status;
  const subscriptionTier = subscription.tier;

  return useMemo(
    () =>
      resolveNavigationContract({
        activeProfile,
        profiles,
        isParentProxy,
        appContext: mode,
        role,
        subscription: {
          status: subscriptionStatus,
          tier: subscriptionTier,
        },
        flags: {
          MODE_NAV_V0_ENABLED: FEATURE_FLAGS.MODE_NAV_V0_ENABLED,
          MODE_NAV_V1_ENABLED: FEATURE_FLAGS.MODE_NAV_V1_ENABLED,
        },
      }),
    [
      activeProfile,
      profiles,
      isParentProxy,
      mode,
      role,
      subscriptionStatus,
      subscriptionTier,
    ],
  );
}

export function useNavigationContract(): NavigationContract {
  const subscription = useSubscriptionStatus({
    enabled: FEATURE_FLAGS.MODE_NAV_V1_ENABLED,
  });
  const subscriptionData = subscription.data;

  return useResolvedNavigationContract({
    status: subscriptionData ? 'ready' : 'loading',
    tier: subscriptionData?.tier ?? null,
  });
}

export function useNavigationDataScopeContract(): NavigationContract {
  return useResolvedNavigationContract({
    status: 'ready',
    tier: null,
  });
}
