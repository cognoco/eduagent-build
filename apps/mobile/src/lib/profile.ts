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

/**
 * Derive a persona string from the profile's birthYear.
 * age < 13 → 'teen', age < 18 → 'learner', else 'parent'.
 * Falls back to 'learner' when birthYear is null/undefined.
 */
export function personaFromBirthYear(
  birthYear: number | null | undefined
): 'teen' | 'learner' | 'parent' {
  if (birthYear == null) return 'learner';
  const age = new Date().getFullYear() - birthYear;
  if (age < 13) return 'teen';
  if (age < 18) return 'learner';
  return 'parent';
}

/**
 * Check if a profile is a guardian — account owner with linked child profiles.
 * Uses the in-memory profile list; no DB call needed.
 *
 * Do NOT use `personaFromBirthYear` for this — it classifies ALL adults 18+
 * as 'parent', but an adult self-learner with no children is not a guardian.
 */
export function isGuardianProfile(
  profile: { isOwner: boolean } | null | undefined,
  allProfiles: ReadonlyArray<{ isOwner: boolean }>
): boolean {
  if (!profile?.isOwner) return false;
  return allProfiles.some((p) => !p.isOwner);
}

export interface SwitchProfileResult {
  success: boolean;
  error?: string;
}

export interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (profileId: string) => Promise<SwitchProfileResult>;
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
  switchProfile: async () => ({ success: true }),
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
      const owner = profiles.find((p) => p.isOwner) ?? profiles[0]!;
      setActiveProfileId(owner.id);
      void storage.setItem(ACTIVE_PROFILE_KEY, owner.id);
    }
  }, [profiles, activeProfileId, isRestoringId]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  );

  const switchProfile = useCallback(
    async (profileId: string): Promise<SwitchProfileResult> => {
      try {
        const res = await client.profiles.switch.$post({
          json: { profileId },
        });
        if (!res.ok) {
          return { success: false, error: 'Failed to switch profile' };
        }
      } catch {
        return {
          success: false,
          error: 'Network error while switching profile',
        };
      }
      await storage.setItem(ACTIVE_PROFILE_KEY, profileId);
      // State update LAST — triggers re-renders that change themeKey and
      // remount the navigation tree.  Callers should close modals before
      // awaiting this function to avoid navigation state corruption.
      setActiveProfileId(profileId);
      // Reset profile-scoped queries to prevent stale data leaking between
      // child profiles. Uses an allow-list so new query keys must be explicitly
      // added here to be reset on switch. 'profiles' is excluded because it
      // belongs to the account (not the individual profile) — resetting it
      // causes isProfileLoading→true which triggers `return null` in the
      // learner layout, blanking the entire screen (blank-screen bug).
      const PROFILE_SCOPED_KEYS = [
        'subjects',
        'progress',
        'sessions',
        'curriculum',
        'assessment',
        'interview',
        'consent-status',
        'dashboard',
        'streaks',
        'xp',
        'settings',
        'subscription',
        'usage',
        'retention',
        'coaching-card',
        'topic',
        'learning-modes',
        'notification-preferences',
        'teaching-preferences',
      ];
      await queryClient.resetQueries({
        predicate: (query) =>
          PROFILE_SCOPED_KEYS.includes(String(query.queryKey[0])),
      });
      return { success: true };
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
