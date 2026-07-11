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
import { computeAgeBracketFromDate, type Profile } from '@eduagent/schemas';
import { useProfiles } from '../hooks/use-profiles';
import {
  useApiClient,
  setActiveProfileId as pushProfileIdToApiClient,
  setProxyMode,
} from './api-client';
import { formatApiError } from './format-api-error';

export type { Profile };

/**
 * Check if a profile is a guardian — account owner with linked child profiles.
 * Uses the in-memory profile list; no DB call needed.
 */
export function isGuardianProfile(
  profile: { isOwner: boolean } | null | undefined,
  allProfiles: ReadonlyArray<{ isOwner: boolean }>,
): boolean {
  if (!profile?.isOwner) return false;
  return allProfiles.some((p) => !p.isOwner);
}

/**
 * Family-capable profile predicate for Study/Family mode navigation.
 * Capability is linkage-driven, but the active owner must be an adult.
 */
export function isFamilyCapableProfile(
  activeProfile:
    | Pick<Profile, 'id' | 'isOwner' | 'birthYear' | 'birthMonth' | 'birthDay'>
    | null
    | undefined,
  profiles: ReadonlyArray<Pick<Profile, 'id' | 'isOwner'>>,
): boolean {
  if (!activeProfile) return false;
  if (!activeProfile.isOwner) return false;
  if (
    computeAgeBracketFromDate(
      activeProfile.birthYear,
      activeProfile.birthMonth ?? undefined,
      activeProfile.birthDay ?? undefined,
    ) !== 'adult'
  ) {
    return false;
  }
  return profiles.some((p) => p.id !== activeProfile.id && p.isOwner === false);
}

export interface SwitchProfileResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  // [BUG-828] True when the in-memory switch succeeded but the SecureStore
  // write failed — the change won't survive an app restart. Callers should
  // surface a non-blocking warning so the user knows they may need to re-pick
  // the profile after relaunching.
  persistenceFailed?: boolean;
}

export interface SwitchProfileOptions {
  /**
   * [ACCOUNT-04] Set to true ONLY from retained internal/test proxy paths.
   * Normal parent review enters parent-native child routes instead.
   *
   * A plain profile switch (e.g. child switching to their own slot) MUST NOT
   * pass proxyMode:true — that conflates "parent viewing as child" with
   * "child IS the user", breaking learner UI for non-owner profiles.
   *
   * Defaults to false — proxy is always OFF unless the caller sets it.
   */
  proxyMode?: boolean;
}

export interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  /**
   * Whether a parent is explicitly in proxy mode (viewing a child's account).
   * Driven by an explicit opt-in via switchProfile({ proxyMode: true }) —
   * NOT derived from profile shape. False for plain profile switches.
   */
  isExplicitProxyMode: boolean;
  switchProfile: (
    profileId: string,
    options?: SwitchProfileOptions,
  ) => Promise<SwitchProfileResult>;
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
  'mentomate_active_profile_id',
);
const PARENT_PROXY_KEY = sanitizeSecureStoreKey('parent-proxy-active');
const ACTIVE_PROFILE_RESTORE_TIMEOUT_MS = 2_500;

export const PROFILE_SCOPED_KEYS = [
  'all-notes',
  'book-notes',
  'book-sessions',
  'bookmarks',
  'celebrations',
  'consent',
  'subjects',
  'progress',
  'recaps',
  'sessions',
  'session',
  'session-bookmarks',
  'session-summary',
  'session-transcript',
  'curriculum',
  'assessment',
  'consent-status',
  'dashboard',
  'streaks',
  'streak',
  'xp',
  'settings',
  'subscription',
  'subscription-family',
  'subscription-status',
  'usage',
  'retention',
  'coaching-card',
  'topic',
  'topic-note',
  'topic-notes',
  'topic-sessions',
  'topic-suggestions',
  'subject-sessions',
  'learning-modes',
  'language-progress',
  'vocabulary',
  'learner-profile',
  'library',
  'library-search',
  'notification-preferences',
  'note-topic-ids',
  'parking-lot',
  'profile',
  'quiz-recent',
  'quiz-round',
  'quiz-round-detail',
  'quiz-stats',
  'resume-nudge',
  'teaching-preferences',
  'books',
  'book',
  'book-suggestions',
  'all-books',
  'nudges',
] as const;

export const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  activeProfile: null,
  isExplicitProxyMode: false,
  switchProfile: async () => ({ success: true }),
  isLoading: true,
  profileLoadError: null,
  profileWasRemoved: false,
  acknowledgeProfileRemoval: () => undefined,
});

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}

export function useLinkedChildren(): Profile[] {
  const { activeProfile, profiles } = useProfile();

  return useMemo(() => {
    if (activeProfile?.isOwner !== true) return [];

    return profiles
      .filter((profile) => profile.id !== activeProfile.id && !profile.isOwner)
      .slice()
      .sort((a, b) => {
        const aLink = a.linkCreatedAt ?? a.createdAt;
        const bLink = b.linkCreatedAt ?? b.createdAt;
        return aLink.localeCompare(bLink);
      });
  }, [activeProfile?.id, activeProfile?.isOwner, profiles]);
}

export function useHasLinkedChildren(): boolean {
  return useLinkedChildren().length > 0;
}

async function getSecureStoreItemWithTimeout(
  key: string,
  timeoutMs: number,
): Promise<string | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      SecureStore.getItemAsync(key),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          Sentry.addBreadcrumb({
            category: 'profile',
            level: 'warning',
            message: 'active profile SecureStore read timed out',
          });
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export function ProfileProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const profilesQuery = useProfiles();
  const profiles = useMemo(
    () => profilesQuery.data ?? [],
    [profilesQuery.data],
  );
  const isProfilesLoading = profilesQuery.isLoading;
  const isProfilesFetching = profilesQuery.isFetching;
  // A stale-while-refetch failure should not eject a signed-in user from the
  // app when we still have a usable profile list in cache.
  const profileLoadError = profiles.length === 0 ? profilesQuery.error : null;
  const client = useApiClient();
  const queryClient = useQueryClient();

  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isRestoringId, setIsRestoringId] = useState(true);
  const [profileWasRemoved, setProfileWasRemoved] = useState(false);
  // [ACCOUNT-04] Explicit proxy flag — true only when retained internal/test
  // paths request it. Plain profile switches never set this. Initialised to
  // false; restored from SecureStore on cold start.
  const [isExplicitProxyMode, setIsExplicitProxyMode] = useState(false);

  // On mount: restore saved profile ID from SecureStore
  useEffect(() => {
    const restore = async () => {
      try {
        const savedId = await getSecureStoreItemWithTimeout(
          ACTIVE_PROFILE_KEY,
          ACTIVE_PROFILE_RESTORE_TIMEOUT_MS,
        );
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

  // [ACCOUNT-04] Seed the API client's proxy flag and the explicit React state
  // from the last app session. The useParentProxy hook reads isExplicitProxyMode
  // from context — no more shape-derived override on cold start.
  useEffect(() => {
    void SecureStore.getItemAsync(PARENT_PROXY_KEY)
      .then((value) => {
        const restoredProxy = value === 'true';
        setProxyMode(restoredProxy);
        setIsExplicitProxyMode(restoredProxy);
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
    [profiles, activeProfileId],
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
    async (
      profileId: string,
      options?: SwitchProfileOptions,
    ): Promise<SwitchProfileResult> => {
      try {
        const res = await client.profiles.switch.$post({
          json: { profileId },
        });
        if (!res.ok) {
          let error = 'Failed to switch profile';
          let errorCode: string | undefined;
          const bodyText = await res.text().catch(() => '');
          if (bodyText) {
            try {
              const body = JSON.parse(bodyText) as {
                code?: unknown;
                message?: unknown;
              };
              if (typeof body.message === 'string') error = body.message;
              if (typeof body.code === 'string') errorCode = body.code;
            } catch {
              // Keep the stable fallback above for non-JSON API failures.
            }
          }
          return {
            success: false,
            error,
            ...(errorCode !== undefined ? { errorCode } : {}),
          };
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

      // [ACCOUNT-04] Proxy mode is driven by explicit caller intent, NOT derived
      // from profile shape. User-facing parent review now uses parent-native
      // child routes; retained internal/test callers can still pass
      // proxyMode:true. All plain profile switches (child switching to their
      // own slot, switchBack from ProxyBanner, etc.) default to false.
      const nextIsParentProxy = options?.proxyMode === true;

      // Persist the explicit proxy flag alongside the active profile ID so the
      // correct state survives a cold start.
      if (nextIsParentProxy) {
        SecureStore.setItemAsync(PARENT_PROXY_KEY, 'true').catch(
          Sentry.captureException,
        );
      } else {
        SecureStore.deleteItemAsync(PARENT_PROXY_KEY).catch(
          Sentry.captureException,
        );
      }

      // Keep imperative request headers in step with the requested switch
      // before resetting/refetching profile-scoped queries. Waiting for the
      // next committed render leaves a brief window where resetQueries can
      // reload child routes with the previous X-Profile-Id / proxy flag.
      pushProfileIdToApiClient(profileId);
      setProxyMode(nextIsParentProxy);

      // State update LAST — triggers re-renders that change themeKey and
      // remount the navigation tree.  Callers should close modals before
      // awaiting this function to avoid navigation state corruption.
      setActiveProfileId(profileId);
      setIsExplicitProxyMode(nextIsParentProxy);
      // Reset profile-scoped queries to prevent stale data leaking between
      // child profiles. Uses an allow-list so new query keys must be explicitly
      // added here to be reset on switch. 'profiles' is excluded because it
      // belongs to the account (not the individual profile) — resetting it
      // causes isProfileLoading→true which triggers `return null` in the
      // app layout, blanking the entire screen (blank-screen bug).
      await queryClient.resetQueries({
        predicate: (query) =>
          PROFILE_SCOPED_KEYS.includes(
            String(query.queryKey[0]) as (typeof PROFILE_SCOPED_KEYS)[number],
          ),
      });
      return persistenceFailed
        ? { success: true, persistenceFailed: true }
        : { success: true };
    },
    [client, queryClient],
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
      isExplicitProxyMode,
      switchProfile,
      isLoading,
      profileLoadError,
      profileWasRemoved,
      acknowledgeProfileRemoval,
    }),
    [
      profiles,
      activeProfile,
      isExplicitProxyMode,
      switchProfile,
      isLoading,
      profileLoadError,
      profileWasRemoved,
      acknowledgeProfileRemoval,
    ],
  );

  return createElement(ProfileContext.Provider, { value }, children);
}
