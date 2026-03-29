import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { createElement, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import type { Profile } from '@eduagent/schemas';
import { useProfiles } from '../hooks/use-profiles';
import { useApiClient } from './api-client';

// expo-secure-store is native-only; fall back to localStorage on web
const isWeb = Platform.OS === 'web';
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isWeb) return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (isWeb) {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
};

export type { Profile };

export interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (profileId: string) => Promise<void>;
  isLoading: boolean;
  /** Set when a saved profile was removed server-side and we fell back to owner */
  profileWasRemoved: boolean;
  /** Clear the profileWasRemoved flag after user acknowledges */
  acknowledgeProfileRemoval: () => void;
}

const ACTIVE_PROFILE_KEY = 'mentomate_active_profile_id';

export const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  activeProfile: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  switchProfile: async () => {},
  isLoading: true,
  profileWasRemoved: false,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  acknowledgeProfileRemoval: () => {},
});

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}

export function ProfileProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { data: profiles = [], isLoading: isProfilesLoading } = useProfiles();
  const client = useApiClient();
  const queryClient = useQueryClient();

  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isRestoringId, setIsRestoringId] = useState(true);
  const [profileWasRemoved, setProfileWasRemoved] = useState(false);

  // On mount: restore saved profile ID from SecureStore
  useEffect(() => {
    const restore = async () => {
      const savedId = await storage.getItem(ACTIVE_PROFILE_KEY);
      if (savedId) {
        setActiveProfileId(savedId);
      }
      setIsRestoringId(false);
    };
    void restore();
  }, []);

  // Once profiles arrive, validate that saved ID exists in the list.
  // Fall back to owner profile if saved ID is stale or missing.
  useEffect(() => {
    if (isRestoringId || profiles.length === 0) return;

    const savedExists = profiles.some((p) => p.id === activeProfileId);
    if (!savedExists) {
      // Profile was removed server-side (consent denied / auto-deleted)
      if (activeProfileId) {
        setProfileWasRemoved(true);
      }
      const owner = profiles.find((p) => p.isOwner) ?? profiles[0];
      setActiveProfileId(owner.id);
      void storage.setItem(ACTIVE_PROFILE_KEY, owner.id);
    }
  }, [profiles, activeProfileId, isRestoringId]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  );

  const switchProfile = useCallback(
    async (profileId: string) => {
      await client.profiles.switch.$post({ json: { profileId } });
      await storage.setItem(ACTIVE_PROFILE_KEY, profileId);
      // State update LAST — triggers re-renders that change themeKey and
      // remount the navigation tree.  Callers should close modals before
      // awaiting this function to avoid navigation state corruption.
      setActiveProfileId(profileId);
      // resetQueries() immediately clears all cached data AND marks queries
      // stale so components show loading states — NOT stale data from the
      // previous child's profile.  This prevents a privacy leak where a
      // parent briefly sees the wrong child's learning data during switch.
      // (Previously fire-and-forget invalidateQueries which left old data
      // visible until the refetch completed.)
      await queryClient.resetQueries();
    },
    [client, queryClient]
  );

  const acknowledgeProfileRemoval = useCallback(() => {
    setProfileWasRemoved(false);
  }, []);

  const isLoading = isProfilesLoading || isRestoringId;

  const value = useMemo<ProfileContextValue>(
    () => ({
      profiles,
      activeProfile,
      switchProfile,
      isLoading,
      profileWasRemoved,
      acknowledgeProfileRemoval,
    }),
    [
      profiles,
      activeProfile,
      switchProfile,
      isLoading,
      profileWasRemoved,
      acknowledgeProfileRemoval,
    ]
  );

  return createElement(ProfileContext.Provider, { value }, children);
}
