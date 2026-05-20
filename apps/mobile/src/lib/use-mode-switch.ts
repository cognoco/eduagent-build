import { useCallback, useRef, type MutableRefObject } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAppContext, type AppMode } from './app-context';
import { bucketAccountAge, hashProfileId, track } from './analytics';
import { MODE_SCOPED_KEYS } from './mode-scoped-keys';
import { useProfile } from './profile';

export function useModeSwitch(): {
  switchMode: (mode: AppMode) => void;
  isSwitchingRef: MutableRefObject<boolean>;
} {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mode, setMode } = useAppContext();
  const { activeProfile } = useProfile();
  const isSwitchingRef = useRef(false);

  const switchMode = useCallback(
    (nextMode: AppMode): void => {
      if (isSwitchingRef.current || mode === nextMode) return;
      isSwitchingRef.current = true;
      const previousMode = mode;
      setMode(nextMode);
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
      router.replace('/(app)/home');
      queueMicrotask(() => {
        isSwitchingRef.current = false;
      });
    },
    [activeProfile, mode, queryClient, router, setMode],
  );

  return { switchMode, isSwitchingRef };
}
