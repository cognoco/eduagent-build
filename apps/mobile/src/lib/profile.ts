import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from 'react';
import { createElement, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from './secure-storage';
import { sanitizeSecureStoreKey } from './secure-storage';
import { Sentry } from './sentry';
import type { Profile } from '@eduagent/schemas';
import { useProfiles } from '../hooks/use-profiles';
import {
  useApiClient,
  setActiveProfileId as pushProfileIdToApiClient,
  setProxyMode,
} from './api-client';
import { formatApiError } from './format-api-error';

export type { Profile };

/**
 * Derive a visual persona for UI theming from the profile's birthYear.
 * Under 13 → 'teen' (child-friendly theme), 13–17 → 'learner', 18+ → 'parent'.
 * Falls back to 'learner' when birthYear is null/undefined.
 *
 * The label names are theme keys, not age descriptions — a child under 13
 * gets the 'teen' theme because the learner/parent themes assume more maturity.
 *
 * @see computeAgeBracket in @eduagent/schemas — shared consent-gating variant
 *   with labels ('child' | 'adolescent' | 'adult'). Same thresholds, different purpose.
 */
export type Persona = 'teen' | 'learner' | 'parent';

export function personaFromBirthYear(
  birthYear: number | null | undefined
): Persona {
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
  // [BUG-828] True when the in-memory switch succeeded but the SecureStore
  // write failed — the change won't survive an app restart. Callers should
  // surface a non-blocking warning so the user knows they may need to re-pick
  // the profile after relaunching.
  persistenceFailed?: boolean;
}

export interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (profileId: string) => Promise<SwitchProfileResult>;
  isLoading: boolean;
  /** Set when the account's profile list could not be loaded. */
  profileLoadError: unknown | null;
  /** Set when a saved profile was removed server-side and we fell back to owner */
  profileWasRemoved: boolean;
  /** Clear the profileWasRemoved flag after user acknowledges */
  acknowledgeProfileRemoval: () => void;
}

// [BUG-827 / F-CMP-003] Run keys through sanitizeSecureStoreKey so that any
// future change introducing a dynamic segment (profileId, etc.) doesn't
// silently break on iOS — the iOS Keychain rejects keys with characters
// outside [a-zA-Z0-9._-]. The current literals are already safe; this is
// belt-and-suspenders and matches summary-draft.ts / session-recovery.ts.
const ACTIVE_PROFILE_KEY = sanitizeSecureStoreKey(
  'mentomate_active_profile_id'
);
const PARENT_PROXY_KEY = sanitizeSecureStoreKey('parent-proxy-active');

export const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  activeProfile: null,
  switchProfile: async () => ({ success: true }),
  isLoading: true,
  profileLoadError: null,
  profileWasRemoved: false,
  acknowledgeProfileRemoval: () => undefined,
});

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}

export function ProfileProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const {
    data: profiles = [],
    isLoading: isProfilesLoading,
    isFetching: isProfilesFetching,
    error: profileLoadError,
  } = useProfiles();
  const client = useApiClient();
  const queryClient = useQueryClient();

  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isRestoringId, setIsRestoringId] = useState(true);
  const [profileWasRemoved, setProfileWasRemoved] = useState(false);

  // On mount: restore saved profile ID from SecureStore
  useEffect(() => {
    const restore = async () => {
      try {
        const savedId = await SecureStore.getItemAsync(ACTIVE_PROFILE_KEY);
        if (savedId) {
          setActiveProfileId(savedId);
        }
      } catch {
        /* SecureStore unavailable */
      }
      setIsRestoringId(false);
    };
    void restore();
  }, []);

  // Seed the API client's proxy flag from the last app session. The
  // useParentProxy hook corrects the flag once the active profile is known.
  useEffect(() => {
    void SecureStore.getItemAsync(PARENT_PROXY_KEY)
      .then((value) => {
        setProxyMode(value === 'true');
      })
      .catch(() => {
        /* SecureStore unavailable */
      });
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
      // profiles.length > 0 is guarded above, so the fallback is always
      // defined; the `as` cast just communicates that to TS under
      // noUncheckedIndexedAccess without a runtime non-null assertion.
      const owner =
        profiles.find((p) => p.isOwner) ??
        (profiles[0] as (typeof profiles)[number]);
      setActiveProfileId(owner.id);
      void SecureStore.setItemAsync(ACTIVE_PROFILE_KEY, owner.id).catch(() => {
        /* non-fatal — in-memory activeProfileId is already set above */
      });
    }
  }, [profiles, activeProfileId, isRestoringId]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId]
  );

  // [BUG-520] Push the active profile ID to the api-client module so
  // customFetch can attach X-Profile-Id without importing profile.ts.
  // [BUG-528 / I-17] Use useLayoutEffect (fires synchronously after DOM
  // mutations, before paint) instead of calling during render. The old
  // render-time call caused React Strict Mode to double-invoke the write,
  // producing a transient stale `undefined` during the second (discarded)
  // render pass of profile-switch. useLayoutEffect fires once per committed
  // render, keeping the module variable consistent with the committed tree.
  // NB: imported as pushProfileIdToApiClient to avoid shadowing the local
  // React state setter (also named setActiveProfileId on line 101).
  useLayoutEffect(() => {
    pushProfileIdToApiClient(activeProfile?.id);
  }, [activeProfile?.id]);

  const switchProfile = useCallback(
    async (profileId: string): Promise<SwitchProfileResult> => {
      try {
        const res = await client.profiles.switch.$post({
          json: { profileId },
        });
        if (!res.ok) {
          return { success: false, error: 'Failed to switch profile' };
        }
      } catch (err) {
        return {
          success: false,
          error: formatApiError(err),
        };
      }
      let persistenceFailed = false;
      try {
        await SecureStore.setItemAsync(ACTIVE_PROFILE_KEY, profileId);
      } catch (storageErr) {
        // [BUG-828] Silent recovery ban — the in-memory switch will still
        // succeed below so navigation does not get stuck, but if SecureStore
        // failed the change won't persist past the next app launch. Capture
        // for telemetry and signal to the caller via persistenceFailed so a
        // non-blocking warning can be shown.
        persistenceFailed = true;
        Sentry.captureException(storageErr, {
          tags: {
            component: 'ProfileProvider',
            action: 'switch-profile-securestore',
          },
        });
      }
      // State update LAST — triggers re-renders that change themeKey and
      // remount the navigation tree.  Callers should close modals before
      // awaiting this function to avoid navigation state corruption.
      setActiveProfileId(profileId);
      // Reset profile-scoped queries to prevent stale data leaking between
      // child profiles. Uses an allow-list so new query keys must be explicitly
      // added here to be reset on switch. 'profiles' is excluded because it
      // belongs to the account (not the individual profile) — resetting it
      // causes isProfileLoading→true which triggers `return null` in the
      // app layout, blanking the entire screen (blank-screen bug).
      const PROFILE_SCOPED_KEYS = [
        'subjects',
        'progress',
        'sessions',
        'curriculum',
        'assessment',
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
      return persistenceFailed
        ? { success: true, persistenceFailed: true }
        : { success: true };
    },
    [client, queryClient]
  );

  const acknowledgeProfileRemoval = useCallback(() => {
    setProfileWasRemoved(false);
  }, []);

  // BUG-264: Treat the profile provider as loading when activeProfileId was
  // explicitly set but the matching profile is not yet in the cached list AND
  // a background refetch is in-flight.  This prevents CreateProfileGate from
  // flashing during the brief race window after profile creation, where
  // switchProfile already set activeProfileId but the invalidated profiles
  // query hasn't returned the new profile yet.
  //
  // [BUG-528] Also cover the gap between SecureStore restore finishing and the
  // validation effect running: profiles arrived + isRestoringId is false, but
  // activeProfileId is still null (initial useState value) because the
  // validation effect hasn't fired yet.  Without this, isLoading falls to
  // false for one render frame with activeProfile === null, causing
  // CreateProfileGate ("Welcome!") to flash.
  const isLoading =
    isProfilesLoading ||
    isRestoringId ||
    (!isRestoringId && profiles.length > 0 && activeProfile === null) ||
    (activeProfileId !== null && activeProfile === null && isProfilesFetching);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profiles,
      activeProfile,
      switchProfile,
      isLoading,
      profileLoadError,
      profileWasRemoved,
      acknowledgeProfileRemoval,
    }),
    [
      profiles,
      activeProfile,
      switchProfile,
      isLoading,
      profileLoadError,
      profileWasRemoved,
      acknowledgeProfileRemoval,
    ]
  );

  return createElement(ProfileContext.Provider, { value }, children);
}
