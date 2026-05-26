import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from '../../../../lib/secure-storage';
import { BYOK_JOINED_KEY } from '../constants';

/**
 * BUG-399: Persistent "already joined" flag for the BYOK waitlist. The flag
 * is account-scoped (per-account email, not per-profile) — see the comment
 * on BYOK_JOINED_KEY in `../constants.ts`.
 *
 * Returns the current joined state and a `markJoined` callback. Both the
 * mount-time read and the markJoined write swallow SecureStore failures
 * (matches pre-refactor behavior — SecureStore may throw on web or
 * restricted environments and the BYOK waitlist join is not blocking).
 */
export function useByokJoinedFlag(): {
  byokJoined: boolean;
  markJoined: () => void;
} {
  const [byokJoined, setByokJoined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(BYOK_JOINED_KEY);
        if (!cancelled && stored === 'true') {
          setByokJoined(true);
        }
      } catch {
        // SecureStore may throw on web or restricted environments
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markJoined = useCallback(() => {
    setByokJoined(true);
    void SecureStore.setItemAsync(BYOK_JOINED_KEY, 'true').catch(
      () => undefined,
    );
  }, []);

  return { byokJoined, markJoined };
}
