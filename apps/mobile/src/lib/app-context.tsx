import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { computeAgeBracket, type Profile } from '@eduagent/schemas';

import { FEATURE_FLAGS } from './feature-flags';
import { isFamilyCapableProfile, useProfile } from './profile';
import { useUpdateProfileAppContext } from '../hooks/use-profiles';

export type AppMode = 'study' | 'family';

export interface AppModeSwitchCallbacks {
  onError?: () => void;
  onSuccess?: () => void;
}

export interface AppContextValue {
  mode: AppMode | null;
  setMode: (mode: AppMode, callbacks?: AppModeSwitchCallbacks) => void;
  familyCapable: boolean;
}

const AppContext = createContext<AppContextValue>({
  mode: 'study',
  setMode: (_mode, callbacks) => {
    callbacks?.onError?.();
  },
  familyCapable: false,
});

function isServerFamilyCapableProfile(
  profile: Profile | null | undefined,
): boolean {
  return (
    !!profile &&
    profile.isOwner &&
    computeAgeBracket(profile.birthYear) === 'adult' &&
    profile.hasFamilyLinks === true
  );
}

export function AppContextProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const { activeProfile, profiles, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const updateAppContext = useUpdateProfileAppContext();
  const modeRequestSeq = useRef(0);
  const [modeOverride, setModeOverride] = useState<AppMode | null>(null);
  const familyCapable = useMemo(() => {
    if (FEATURE_FLAGS.MODE_NAV_V1_ENABLED) {
      return isServerFamilyCapableProfile(activeProfile);
    }
    if (FEATURE_FLAGS.MODE_NAV_V0_ENABLED) {
      return isFamilyCapableProfile(activeProfile, profiles);
    }
    return false;
  }, [activeProfile, profiles]);

  const derivedMode = useMemo<AppMode | null>(() => {
    if (FEATURE_FLAGS.MODE_NAV_V1_ENABLED) {
      if (isLoading || !activeProfile) return null;
      return familyCapable && activeProfile.defaultAppContext === 'family'
        ? 'family'
        : 'study';
    }
    if (!FEATURE_FLAGS.MODE_NAV_V0_ENABLED) return null;
    if (isLoading || !activeProfile) return null;
    return familyCapable ? 'family' : 'study';
  }, [activeProfile, familyCapable, isLoading]);

  // Invalidate any in-flight mode switch only on a genuine identity change.
  // `defaultAppContext` is deliberately excluded: an in-flight switch's own
  // confirming refetch lands the target context here, and bumping the seq on
  // that self-induced change would falsely mark the switch's success as stale
  // (WI-816 race -> "Couldn't switch" despite a 200).
  useEffect(() => {
    modeRequestSeq.current += 1;
  }, [
    activeProfile?.id,
    activeProfile?.isOwner,
    activeProfile?.birthYear,
    activeProfile?.hasFamilyLinks,
  ]);

  // Clear the transient override whenever the persisted context (or identity)
  // changes, so the derived mode is authoritative once the server agrees.
  useEffect(() => {
    setModeOverride(null);
  }, [
    activeProfile?.id,
    activeProfile?.isOwner,
    activeProfile?.birthYear,
    activeProfile?.defaultAppContext,
    activeProfile?.hasFamilyLinks,
  ]);

  const mode = useMemo<AppMode | null>(() => {
    if (derivedMode === null) return null;
    if (modeOverride === 'family' && !familyCapable) return derivedMode;
    return modeOverride ?? derivedMode;
  }, [derivedMode, familyCapable, modeOverride]);

  const setMode = useCallback(
    (nextMode: AppMode, callbacks?: AppModeSwitchCallbacks): void => {
      if (FEATURE_FLAGS.MODE_NAV_V1_ENABLED) {
        if (!activeProfile) {
          callbacks?.onError?.();
          return;
        }
        if (nextMode === 'family' && !familyCapable) {
          callbacks?.onError?.();
          return;
        }

        const requestId = modeRequestSeq.current + 1;
        modeRequestSeq.current = requestId;
        const previousMode = mode ?? derivedMode ?? 'study';
        setModeOverride(nextMode);
        updateAppContext.mutate(
          {
            profileId: activeProfile.id,
            defaultAppContext: nextMode,
          },
          {
            onSuccess: (profile) => {
              if (modeRequestSeq.current !== requestId) {
                callbacks?.onError?.();
                void queryClient.invalidateQueries({ queryKey: ['profiles'] });
                return;
              }
              queryClient.setQueriesData<Profile[]>(
                { queryKey: ['profiles'] },
                (existing) =>
                  existing?.map((entry) =>
                    entry.id === profile.id ? profile : entry,
                  ),
              );
              setModeOverride(null);
              callbacks?.onSuccess?.();
            },
            onError: () => {
              if (modeRequestSeq.current !== requestId) {
                callbacks?.onError?.();
                void queryClient.invalidateQueries({ queryKey: ['profiles'] });
                return;
              }
              setModeOverride(previousMode);
              void queryClient.invalidateQueries({ queryKey: ['profiles'] });
              callbacks?.onError?.();
            },
          },
        );
        return;
      }

      if (!FEATURE_FLAGS.MODE_NAV_V0_ENABLED) {
        callbacks?.onError?.();
        return;
      }
      if (nextMode === 'family' && !familyCapable) {
        callbacks?.onError?.();
        return;
      }
      setModeOverride(nextMode);
      callbacks?.onSuccess?.();
    },
    [
      activeProfile,
      derivedMode,
      familyCapable,
      mode,
      queryClient,
      updateAppContext,
    ],
  );

  const value = useMemo<AppContextValue>(
    () => ({ mode, setMode, familyCapable }),
    [familyCapable, mode, setMode],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  return useContext(AppContext);
}
