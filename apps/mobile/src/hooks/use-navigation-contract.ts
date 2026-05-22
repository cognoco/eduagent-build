import { useMemo } from 'react';

import { useActiveProfileRole } from './use-active-profile-role';
import { useParentProxy } from './use-parent-proxy';
import { useSubscriptionStatus } from './use-subscription';
import { useAppContext } from '../lib/app-context';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import {
  resolveNavigationContract,
  type NavigationContract,
} from '../lib/navigation-contract';
import { useProfile } from '../lib/profile';

export function useNavigationContract(): NavigationContract {
  const { activeProfile, profiles } = useProfile();
  const { mode } = useAppContext();
  const { isParentProxy } = useParentProxy();
  const role = useActiveProfileRole();
  const subscription = useSubscriptionStatus();
  const subscriptionData = subscription.data;

  return useMemo(
    () =>
      resolveNavigationContract({
        activeProfile,
        profiles,
        isParentProxy,
        appContext: mode,
        role,
        subscription: {
          status: subscriptionData ? 'ready' : 'loading',
          tier: subscriptionData?.tier ?? null,
        },
        flags: {
          MODE_NAV_V0_ENABLED: FEATURE_FLAGS.MODE_NAV_V0_ENABLED,
          MODE_NAV_V1_ENABLED: FEATURE_FLAGS.MODE_NAV_V1_ENABLED,
        },
      }),
    [activeProfile, profiles, isParentProxy, mode, role, subscriptionData],
  );
}
