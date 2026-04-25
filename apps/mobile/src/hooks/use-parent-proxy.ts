import { useEffect, useMemo } from 'react';
import { useProfile, type Profile } from '../lib/profile';
import { setProxyMode } from '../lib/api-client';
import * as SecureStore from '../lib/secure-storage';

export interface ParentProxyState {
  isParentProxy: boolean;
  childProfile: Profile | null;
  parentProfile: Profile | null;
}

export function useParentProxy(): ParentProxyState {
  const { profiles, activeProfile } = useProfile();

  const parentProfile = useMemo(
    () => profiles.find((profile) => profile.isOwner) ?? null,
    [profiles]
  );

  const isParentProxy = Boolean(
    activeProfile && !activeProfile.isOwner && parentProfile
  );
  const childProfile = isParentProxy ? activeProfile : null;

  useEffect(() => {
    if (!activeProfile) return;

    setProxyMode(isParentProxy);
    if (isParentProxy) {
      void SecureStore.setItemAsync('parent-proxy-active', 'true');
    } else {
      void SecureStore.deleteItemAsync('parent-proxy-active');
    }
  }, [activeProfile, isParentProxy]);

  return { isParentProxy, childProfile, parentProfile };
}
