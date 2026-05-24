import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAppContext, type AppMode } from './app-context';
import { bucketAccountAge, hashProfileId, track } from './analytics';
import { FEATURE_FLAGS } from './feature-flags';
import { MODE_SCOPED_KEYS } from './mode-scoped-keys';
import { useProfile } from './profile';

export function useModeSwitch(): {
  switchMode: (mode: AppMode) => void;
  isSwitching: boolean;
  isSwitchingRef: MutableRefObject<boolean>;
  switchError: AppMode | null;
  dismissError: () => void;
} {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mode, setMode } = useAppContext();
  const { activeProfile } = useProfile();
  const isSwitchingRef = useRef(false);
  const [isSwitching, setIsSwitching] = useState(false);
  // Holds the requested mode when setMode rejected. UI surfaces this so a
  // failed switch is visible instead of a silent no-op.
  const [switchError, setSwitchError] = useState<AppMode | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const modeRef = useRef(mode);

  const dismissError = useCallback(() => setSwitchError(null), []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, []);

  const switchMode = useCallback(
    (nextMode: AppMode): void => {
      if (
        !FEATURE_FLAGS.MODE_NAV_V0_ENABLED &&
        !FEATURE_FLAGS.MODE_NAV_V1_ENABLED
      ) {
        return;
      }
      const currentMode = modeRef.current;
      if (isSwitchingRef.current || currentMode === nextMode) return;
      isSwitchingRef.current = true;
      setIsSwitching(true);
      const previousMode = currentMode;

      const releaseSwitchLock = (): void => {
        isSwitchingRef.current = false;
        if (mountedRef.current) {
          setIsSwitching(false);
        }
      };

      if (mountedRef.current) {
        setSwitchError(null);
      }
      setMode(nextMode, {
        onError: () => {
          if (mountedRef.current) {
            setSwitchError(nextMode);
          }
          releaseSwitchLock();
        },
        onSuccess: () => {
          if (!mountedRef.current) {
            releaseSwitchLock();
            return;
          }
          void queryClient.invalidateQueries({
            predicate: (query) =>
              MODE_SCOPED_KEYS.includes(
                String(query.queryKey[0]) as (typeof MODE_SCOPED_KEYS)[number],
              ),
          });
          if (activeProfile && previousMode) {
            track('mode_switched', {
              from: previousMode,
              to: nextMode,
              profileIdHash: hashProfileId(activeProfile.id),
              accountAgeBucket: bucketAccountAge(activeProfile.createdAt),
            });
          }
          pendingTimerRef.current = setTimeout(() => {
            pendingTimerRef.current = null;
            try {
              router.replace('/(app)/home');
            } finally {
              releaseSwitchLock();
            }
          }, 0);
        },
      });
    },
    [activeProfile, queryClient, router, setMode],
  );

  return { switchMode, isSwitching, isSwitchingRef, switchError, dismissError };
}
