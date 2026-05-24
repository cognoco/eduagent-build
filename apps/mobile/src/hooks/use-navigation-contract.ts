import { useMemo } from 'react';

import { useActiveProfileRole } from './use-active-profile-role';
import { useParentProxy } from './use-parent-proxy';
import { useSubscriptionStatus } from './use-subscription';
import { useAppContext } from '../lib/app-context';
import { FEATURE_FLAGS } from '../lib/feature-flags';
import {
  resolveContractHomeTabPresentation,
  resolveHomeTabPresentation,
  resolveShellVisibleTabs,
  resolveTabShape,
  type ShellHomeTabPresentation,
} from '../lib/legacy-navigation-contract';
import {
  resolveNavigationContract,
  type NavigationContract,
  type NavigationSubscriptionContext,
} from '../lib/navigation-contract';
import { useProfile } from '../lib/profile';

interface ResolvedNavigationState {
  activeProfile: ReturnType<typeof useProfile>['activeProfile'];
  contract: NavigationContract;
  familyCapable: boolean;
  mode: ReturnType<typeof useAppContext>['mode'];
  parentProxy: ReturnType<typeof useParentProxy>;
  profiles: ReturnType<typeof useProfile>['profiles'];
}

export interface NavigationProxySurface {
  active: boolean;
  childName: string;
  childProfileId: string | null;
  parentProfileId: string | null;
}

export interface NavigationShellContract {
  contract: NavigationContract;
  homeTabPresentation: ShellHomeTabPresentation;
  proxy: NavigationProxySurface;
  visibleTabs: ReadonlySet<string>;
}

export interface NavigationHomeContract {
  contract: NavigationContract;
  proxy: NavigationProxySurface;
}

function toSubscriptionContext(
  data: ReturnType<typeof useSubscriptionStatus>['data'],
): NavigationSubscriptionContext {
  return {
    status: data ? 'ready' : 'loading',
    tier: data?.tier ?? null,
  };
}

function useResolvedNavigationState(
  subscription: NavigationSubscriptionContext,
): ResolvedNavigationState {
  const { activeProfile, profiles = [] } = useProfile();
  const { mode, familyCapable } = useAppContext();
  const parentProxy = useParentProxy();
  const role = useActiveProfileRole();
  const subscriptionStatus = subscription.status;
  const subscriptionTier = subscription.tier;

  const contract = useMemo(
    () =>
      resolveNavigationContract({
        activeProfile,
        profiles,
        isParentProxy: parentProxy.isParentProxy,
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
      parentProxy.isParentProxy,
      mode,
      role,
      subscriptionStatus,
      subscriptionTier,
    ],
  );

  return {
    activeProfile,
    contract,
    familyCapable,
    mode,
    parentProxy,
    profiles,
  };
}

export function useNavigationContract(): NavigationContract {
  const subscription = useSubscriptionStatus({
    enabled: FEATURE_FLAGS.MODE_NAV_V1_ENABLED,
  });

  return useResolvedNavigationState(toSubscriptionContext(subscription.data))
    .contract;
}

function useProxySurface(
  parentProxy: ReturnType<typeof useParentProxy>,
): NavigationProxySurface {
  const childId = parentProxy.childProfile?.id ?? null;
  const childName = parentProxy.childProfile?.displayName ?? '';
  const parentId = parentProxy.parentProfile?.id ?? null;
  const active = parentProxy.isParentProxy;
  return useMemo(
    () => ({
      active,
      childName,
      childProfileId: childId,
      parentProfileId: parentId,
    }),
    [active, childName, childId, parentId],
  );
}

export function useNavigationShellContract(): NavigationShellContract {
  const subscription = useSubscriptionStatus({
    enabled: FEATURE_FLAGS.MODE_NAV_V1_ENABLED,
  });
  const {
    activeProfile,
    contract,
    familyCapable,
    mode,
    parentProxy,
    profiles,
  } = useResolvedNavigationState(toSubscriptionContext(subscription.data));
  const tabShape = resolveTabShape({
    activeProfile,
    profiles,
    isParentProxy: parentProxy.isParentProxy,
  });

  const visibleTabs = useMemo(
    () =>
      resolveShellVisibleTabs({
        familyCapable,
        isParentProxy: parentProxy.isParentProxy,
        mode,
        navigationContract: contract,
        tabShape,
        useContract: FEATURE_FLAGS.MODE_NAV_V1_ENABLED,
      }),
    [contract, familyCapable, mode, parentProxy.isParentProxy, tabShape],
  );

  const homeTabPresentation = FEATURE_FLAGS.MODE_NAV_V1_ENABLED
    ? resolveContractHomeTabPresentation(contract.home)
    : resolveHomeTabPresentation(
        tabShape,
        parentProxy.isParentProxy,
        familyCapable ? mode : null,
      );

  const proxy = useProxySurface(parentProxy);

  return {
    contract,
    homeTabPresentation,
    proxy,
    visibleTabs,
  };
}

export function useNavigationHomeContract(): NavigationHomeContract {
  // Home gates (showFamilyHome in particular) depend on familyPlanOwner,
  // which is subscription-derived. Enable unconditionally so the gate
  // resolves correctly under any flag combo — including the transitional
  // V0-on/V1-off config where `V1 || !V0` would have stayed false and
  // permanently suppressed familyPlanOwner.
  const subscription = useSubscriptionStatus({ enabled: true });
  const { contract, parentProxy } = useResolvedNavigationState(
    toSubscriptionContext(subscription.data),
  );

  const proxy = useProxySurface(parentProxy);

  return {
    contract,
    proxy,
  };
}

export function useNavigationDataScopeContract(): NavigationContract {
  return useResolvedNavigationState({
    status: 'ready',
    tier: null,
  }).contract;
}
