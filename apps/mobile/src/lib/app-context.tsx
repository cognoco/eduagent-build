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

  useEffect(() => {
    modeRequestSeq.current += 1;
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
              setModeOverride(nextMode);
              callbacks?.onSuccess?.();
            },
            onError: () => {
              if (modeRequestSeq.current !== requestId) {
                callbacks?.onError?.();
                void queryClient.invalidateQueries({ queryKey: ['profiles'] });
                return;
              }
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
    [activeProfile, familyCapable, queryClient, updateAppContext],
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
