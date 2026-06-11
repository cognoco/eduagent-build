import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from '../lib/secure-storage';
import { Sentry } from '../lib/sentry';
import type { DictationPace } from '@eduagent/schemas';

// [escalation] SecureStore writes here are best-effort, but per project
// AGENTS.md "console.warn alone is never sufficient" for fallback paths.
// We log to Sentry with a tag so we can quantify how often these silently
// fail in production without flooding the breadcrumb stream with noise.
function reportSecureStoreFailure(
  scope: 'pace' | 'punctuation',
  err: unknown,
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

function nextPace(prev: DictationPace): DictationPace {
  switch (prev) {
    case 'slow':
      return 'normal';
    case 'normal':
      return 'fast';
    case 'fast':
      return 'slow';
  }
}

export function useDictationPreferences(
  profileId: string | undefined,
): DictationPreferences {
  const [pace, setPaceState] = useState<DictationPace>('slow');
  const [punctuationReadAloud, setPunctState] = useState(true);

  useEffect(() => {
    if (!profileId) return;

    // Reset to defaults immediately so the previous profile's values are
    // never visible while the new profile's SecureStore reads are in flight.
    setPaceState('slow');
    setPunctState(true);

    let cancelled = false;

    void SecureStore.getItemAsync(getPaceKey(profileId))
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'slow' || stored === 'normal' || stored === 'fast') {
          setPaceState(stored);
        }
      })
      .catch((err) =>
        Sentry.captureException(err, { tags: { feature: 'dictation_prefs' } }),
      );

    void SecureStore.getItemAsync(getPunctKey(profileId))
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'true' || stored === 'false') {
          setPunctState(stored === 'true');
        }
      })
      .catch((err) =>
        Sentry.captureException(err, { tags: { feature: 'dictation_prefs' } }),
      );

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const setPace = useCallback(
    (next: DictationPace) => {
      setPaceState(next);
      if (profileId) {
        void SecureStore.setItemAsync(getPaceKey(profileId), next).catch(
          (err) => reportSecureStoreFailure('pace', err),
        );
      }
    },
    [profileId],
  );

  const togglePunctuation = useCallback(() => {
    setPunctState((prev) => {
      const next = !prev;
      if (profileId) {
        void SecureStore.setItemAsync(
          getPunctKey(profileId),
          String(next),
        ).catch((err) => reportSecureStoreFailure('punctuation', err));
      }
      return next;
    });
  }, [profileId]);

  const cyclePace = useCallback(() => {
    setPaceState((prev) => {
      const next = nextPace(prev);
      if (profileId) {
        void SecureStore.setItemAsync(getPaceKey(profileId), next).catch(
          (err) => reportSecureStoreFailure('pace', err),
        );
      }
      return next;
    });
  }, [profileId]);

  return { pace, punctuationReadAloud, setPace, togglePunctuation, cyclePace };
}
