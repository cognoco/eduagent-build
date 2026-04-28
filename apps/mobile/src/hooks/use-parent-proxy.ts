import { useEffect, useMemo } from 'react';
import { useProfile, type Profile } from '../lib/profile';
import { setProxyMode } from '../lib/api-client';
import * as SecureStore from '../lib/secure-storage';
import { sanitizeSecureStoreKey } from '../lib/secure-storage';
import { Sentry } from '../lib/sentry';

// [BUG-827 / F-CMP-003] Mirror the sanitized constant in profile.ts so reads
// and writes share the same shape. The literal is currently identity-safe,
// but wrapping defends against future refactors that interpolate a dynamic
// segment (which would be silently rejected by iOS Keychain).
const PARENT_PROXY_KEY = sanitizeSecureStoreKey('parent-proxy-active');

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
    // [CR-PROXY-3] Keychain writes can fail (device locked, quota). Without a
    // catch, the in-memory flag set by setProxyMode() and the persisted flag
    // diverge: requests in flight send X-Proxy-Mode correctly, but on the
    // next cold start the hook sees the wrong persisted value and a parent
    // could silently regain write access on the child profile. Surfacing the
    // error to Sentry gives us a queryable signal per the silent-recovery
    // rule (console.warn alone is insufficient).
    if (isParentProxy) {
      SecureStore.setItemAsync(PARENT_PROXY_KEY, 'true').catch(
        Sentry.captureException
      );
    } else {
      SecureStore.deleteItemAsync(PARENT_PROXY_KEY).catch(
        Sentry.captureException
      );
    }
  }, [activeProfile, isParentProxy]);

  return { isParentProxy, childProfile, parentProfile };
}
