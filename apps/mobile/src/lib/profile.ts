import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { createElement, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import type { Profile } from '@eduagent/schemas';
import { useProfiles } from '../hooks/use-profiles';
import { useApiClient } from './api-client';

export type { Profile };

export interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (profileId: string) => Promise<void>;
  isLoading: boolean;
}

const ACTIVE_PROFILE_KEY = 'eduagent_active_profile_id';

export const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  activeProfile: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  switchProfile: async () => {},
  isLoading: true,
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

  // On mount: restore saved profile ID from SecureStore
  useEffect(() => {
    const restore = async () => {
      const savedId = await SecureStore.getItemAsync(ACTIVE_PROFILE_KEY);
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
      const owner = profiles.find((p) => p.isOwner) ?? profiles[0];
      setActiveProfileId(owner.id);
      void SecureStore.setItemAsync(ACTIVE_PROFILE_KEY, owner.id);
    }
  }, [profiles, activeProfileId, isRestoringId]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  );

  const switchProfile = useCallback(
    async (profileId: string) => {
      await client.profiles.switch.$post({ json: { profileId } });
      setActiveProfileId(profileId);
      await SecureStore.setItemAsync(ACTIVE_PROFILE_KEY, profileId);
      await queryClient.invalidateQueries();
    },
    [client, queryClient]
  );

  const isLoading = isProfilesLoading || isRestoringId;

  const value = useMemo<ProfileContextValue>(
    () => ({ profiles, activeProfile, switchProfile, isLoading }),
    [profiles, activeProfile, switchProfile, isLoading]
  );

  return createElement(ProfileContext.Provider, { value }, children);
}
