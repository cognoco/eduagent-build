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

function toProxySurface(
  parentProxy: ReturnType<typeof useParentProxy>,
): NavigationProxySurface {
  return {
    active: parentProxy.isParentProxy,
    childName: parentProxy.childProfile?.displayName ?? '',
    childProfileId: parentProxy.childProfile?.id ?? null,
    parentProfileId: parentProxy.parentProfile?.id ?? null,
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

  return {
    contract,
    homeTabPresentation,
    proxy: toProxySurface(parentProxy),
    visibleTabs,
  };
}

export function useNavigationHomeContract(): NavigationHomeContract {
  const subscription = useSubscriptionStatus({
    enabled:
      FEATURE_FLAGS.MODE_NAV_V1_ENABLED || !FEATURE_FLAGS.MODE_NAV_V0_ENABLED,
  });
  const { contract, parentProxy } = useResolvedNavigationState(
    toSubscriptionContext(subscription.data),
  );

  return {
    contract,
    proxy: toProxySurface(parentProxy),
  };
}

export function useNavigationDataScopeContract(): NavigationContract {
  return useResolvedNavigationState({
    status: 'ready',
    tier: null,
  }).contract;
}
