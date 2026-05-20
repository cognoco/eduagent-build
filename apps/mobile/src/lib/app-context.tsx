import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { FEATURE_FLAGS } from './feature-flags';
import { isFamilyCapableProfile, useProfile } from './profile';

export type AppMode = 'study' | 'family';

export interface AppContextValue {
  mode: AppMode | null;
  setMode: (mode: AppMode) => void;
  familyCapable: boolean;
}

const AppContext = createContext<AppContextValue>({
  mode: 'study',
  setMode: () => undefined,
  familyCapable: false,
});

export function AppContextProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const { activeProfile, profiles, isLoading } = useProfile();
  const [modeOverride, setModeOverride] = useState<AppMode | null>(null);
  const familyCapable = useMemo(
    () =>
      FEATURE_FLAGS.MODE_NAV_V0_ENABLED
        ? isFamilyCapableProfile(activeProfile, profiles)
        : false,
    [activeProfile, profiles],
  );

  const derivedMode = useMemo<AppMode | null>(() => {
    if (!FEATURE_FLAGS.MODE_NAV_V0_ENABLED) return null;
    if (isLoading || !activeProfile) return null;
    return familyCapable ? 'family' : 'study';
  }, [activeProfile, familyCapable, isLoading]);

  useEffect(() => {
    setModeOverride(null);
  }, [activeProfile?.id, activeProfile?.isOwner, activeProfile?.birthYear]);

  const mode = useMemo<AppMode | null>(() => {
    if (derivedMode === null) return null;
    if (modeOverride === 'family' && !familyCapable) return derivedMode;
    return modeOverride ?? derivedMode;
  }, [derivedMode, familyCapable, modeOverride]);

  const setMode = useCallback(
    (nextMode: AppMode): void => {
      if (!FEATURE_FLAGS.MODE_NAV_V0_ENABLED) return;
      if (nextMode === 'family' && !familyCapable) return;
      setModeOverride(nextMode);
    },
    [familyCapable],
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
