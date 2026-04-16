import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from '../lib/secure-storage';
import type { DictationPace } from '@eduagent/schemas';

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
          (err) =>
            console.warn('[Dictation] SecureStore write failed (pace):', err)
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
        ).catch((err) =>
          console.warn(
            '[Dictation] SecureStore write failed (punctuation):',
            err
          )
        );
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
          (err) =>
            console.warn('[Dictation] SecureStore write failed (pace):', err)
        );
      }
      return next;
    });
  }, [profileId]);

  return { pace, punctuationReadAloud, setPace, togglePunctuation, cyclePace };
}
