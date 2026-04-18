import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from '../lib/secure-storage';
import { Sentry } from '../lib/sentry';
import type { DictationPace } from '@eduagent/schemas';

// [escalation] SecureStore writes here are best-effort, but per project
// CLAUDE.md "console.warn alone is never sufficient" for fallback paths.
// We log to Sentry with a tag so we can quantify how often these silently
// fail in production without flooding the breadcrumb stream with noise.
function reportSecureStoreFailure(
  scope: 'pace' | 'punctuation',
  err: unknown
): void {
  console.warn(`[Dictation] SecureStore write failed (${scope}):`, err);
  Sentry.captureException(err, {
    tags: { feature: 'dictation', secure_store_scope: scope },
  });
}

const getPaceKey = (profileId: string) => `dictation-pace-${profileId}`;
const getPunctKey = (profileId: string) => `dictation-punctuation-${profileId}`;

export interface DictationPreferences {
  pace: DictationPace;
  punctuationReadAloud: boolean;
  setPace: (pace: DictationPace) => void;
  togglePunctuation: () => void;
  cyclePace: () => void;
}

const PACE_CYCLE: DictationPace[] = ['slow', 'normal', 'fast'];

export function useDictationPreferences(
  profileId: string | undefined
): DictationPreferences {
  const [pace, setPaceState] = useState<DictationPace>('slow');
  const [punctuationReadAloud, setPunctState] = useState(true);

  useEffect(() => {
    if (!profileId) return;

    void SecureStore.getItemAsync(getPaceKey(profileId)).then((stored) => {
      if (stored === 'slow' || stored === 'normal' || stored === 'fast') {
        setPaceState(stored);
      }
    });

    void SecureStore.getItemAsync(getPunctKey(profileId)).then((stored) => {
      if (stored === 'true' || stored === 'false') {
        setPunctState(stored === 'true');
      }
    });
  }, [profileId]);

  const setPace = useCallback(
    (next: DictationPace) => {
      setPaceState(next);
      if (profileId) {
        void SecureStore.setItemAsync(getPaceKey(profileId), next).catch(
          (err) => reportSecureStoreFailure('pace', err)
        );
      }
    },
    [profileId]
  );

  const togglePunctuation = useCallback(() => {
    setPunctState((prev) => {
      const next = !prev;
      if (profileId) {
        void SecureStore.setItemAsync(
          getPunctKey(profileId),
          String(next)
        ).catch((err) => reportSecureStoreFailure('punctuation', err));
      }
      return next;
    });
  }, [profileId]);

  const cyclePace = useCallback(() => {
    setPaceState((prev) => {
      const idx = PACE_CYCLE.indexOf(prev);
      const next = PACE_CYCLE[(idx + 1) % PACE_CYCLE.length]!;
      if (profileId) {
        void SecureStore.setItemAsync(getPaceKey(profileId), next).catch(
          (err) => reportSecureStoreFailure('pace', err)
        );
      }
      return next;
    });
  }, [profileId]);

  return { pace, punctuationReadAloud, setPace, togglePunctuation, cyclePace };
}
