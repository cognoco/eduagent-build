import { useEffect, useMemo } from 'react';
import { useProfile } from '../lib/profile';
import type { Profile } from '../lib/profile';
import { setProxyMode } from '../lib/api-client';
import * as SecureStore from '../lib/secure-storage';

export interface ParentProxyState {
  isParentProxy: boolean;
  childProfile: Profile | null;
  parentProfile: Profile | null;
}

export function useParentProxy(): ParentProxyState {
  const { profiles, activeProfile } = useProfile();

  const isParentProxy =
    !activeProfile?.isOwner && profiles.some((p) => p.isOwner);

  const parentProfile = useMemo(
    () => profiles.find((p) => p.isOwner) ?? null,
    [profiles]
  );

  const childProfile = isParentProxy ? activeProfile : null;

  useEffect(() => {
    setProxyMode(isParentProxy);
    if (isParentProxy) {
      void SecureStore.setItemAsync('parent-proxy-active', 'true');
    } else {
      void SecureStore.deleteItemAsync('parent-proxy-active');
    }
  }, [isParentProxy]);

  return { isParentProxy, childProfile, parentProfile };
}
