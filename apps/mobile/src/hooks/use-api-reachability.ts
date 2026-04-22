import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { getApiUrl } from '../lib/api';

export interface ApiReachability {
  /** Whether the API health endpoint responded successfully */
  isApiReachable: boolean;
  /** Whether the initial check has completed */
  isChecked: boolean;
  /** Trigger a manual re-check */
  recheck: () => Promise<void>;
}

const HEALTH_TIMEOUT_MS = 5_000;
const RECHECK_INTERVAL_MS = 60_000;

/**
 * Pings the API health endpoint periodically to determine reachability.
 *
 * Unlike `useNetworkStatus` (which checks device connectivity via NetInfo),
 * this hook verifies the API server itself is reachable. This catches:
 * - API URL pointing to a non-running local server
 * - Staging/production API being down
 * - Network issues between the device and the API (firewall, VPN, etc.)
 *
 * Re-checks on app foreground and every 60 seconds while mounted.
 */
export function useApiReachability(): ApiReachability {
  const [isApiReachable, setIsApiReachable] = useState(true);
  const [isChecked, setIsChecked] = useState(false);
  const pendingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async (): Promise<void> => {
    // Skip if a check is already in flight — prevents runaway polling when
    // rapid foreground/background transitions (permission dialogs, notification
    // shade) fire multiple AppState 'active' events in quick succession.
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

      const res = await fetch(`${getApiUrl()}/v1/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      setIsApiReachable(res.ok);
    } catch {
      setIsApiReachable(false);
    } finally {
      setIsChecked(true);
      pendingRef.current = false;
    }
  }, []);

  // Initial check + periodic re-check
  useEffect(() => {
    void checkHealth();

    intervalRef.current = setInterval(() => {
      void checkHealth();
    }, RECHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkHealth]);

  // Re-check when app comes to foreground (native only — BUG-613: on web,
  // AppState 'change' fires on every DOM focus/blur event, causing continuous
  // polling instead of the intended 60s interval).
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handler = (nextState: AppStateStatus): void => {
      if (nextState === 'active') {
        void checkHealth();
        // Reset the periodic interval so the next tick is a full 60s away,
        // avoiding a duplicate check shortly after the foreground one.
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          void checkHealth();
        }, RECHECK_INTERVAL_MS);
      }
    };

    const subscription = AppState.addEventListener('change', handler);
    return () => subscription.remove();
  }, [checkHealth]);

  return { isApiReachable, isChecked, recheck: checkHealth };
}
