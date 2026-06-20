import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import {
  useAppContext,
  type AppMode,
  type AppModeSwitchCallbacks,
} from './app-context';
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
    if (switchError !== null && mode === switchError) {
      setSwitchError(null);
    }
  }, [mode, switchError]);

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

/**
 * Lightweight bridge: ensure the user is in Study mode before running
 * `then`. If already in Study (or any non-Family mode), `then` runs
 * synchronously. If in Family, `setMode('study', ...)` runs first and
 * `then` runs in either branch — so destinations in STUDY_TABS (e.g.
 * `/library`) stay reachable from family-context screens.
 *
 * Why this exists here: the only Study/Family mode-write boundary is
 * `useAppContext().setMode`. Consumers that read `mode` + call `setMode`
 * inline duplicate that boundary across screens and trip the navigation
 * usage guard. This hook is the canonical wrapper for the
 * "switch-to-Study-then-navigate" pattern (recall-test, LearnerScreen
 * loading fallback, Learn-this-too bridge).
 */
export function useEnsureStudyMode(): (then: () => void) => void {
  const { mode, setMode } = useAppContext();

  return useCallback(
    (then: () => void): void => {
      if (mode !== 'family') {
        then();
        return;
      }
      setMode('study', {
        onSuccess: () => then(),
        onError: () => then(),
      });
    },
    [mode, setMode],
  );
}

/**
 * Lightweight bridge: enter Family mode via the explicit-opt-in CTA in
 * RequireFamilyContext. Unlike `useModeSwitch.switchMode`, this does NOT
 * invalidate query caches, fire analytics, or `router.replace('/home')` —
 * those are appropriate for a global mode switch, but the family-route
 * guard wants to render its protected child immediately at the current
 * URL once the mode flips.
 *
 * Accepts callbacks so the caller can surface a failed switch instead of
 * navigating silently. With the server-side guard in `profile.ts` that
 * 403s on a non-eligible family-context switch (commit `add34c732`), the
 * mutation can now reject — `onError` is no longer dead code.
 */
export function useEnterFamilyMode(): (
  callbacks?: AppModeSwitchCallbacks,
) => void {
  const { setMode } = useAppContext();
  return useCallback(
    (callbacks?: AppModeSwitchCallbacks): void => {
      setMode('family', callbacks);
    },
    [setMode],
  );
}
