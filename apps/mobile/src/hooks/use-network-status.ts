import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  /** Whether the device has internet reachability (not just connected to a network) */
  isOffline: boolean;
  /** Whether the initial check has completed */
  isReady: boolean;
}

/**
 * Subscribes to network state changes and returns whether the device is offline.
 * Uses `isInternetReachable` rather than `isConnected` to detect captive portals
 * and WiFi-without-internet scenarios.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOffline, setIsOffline] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Proactive initial check — show offline banner immediately if already offline
    // rather than waiting for the first connectivity-change event.
    // .catch ensures isReady is always set even if NetInfo.fetch() rejects.
    NetInfo.fetch()
      .then((state: NetInfoState) => {
        const offline = state.isInternetReachable === false;
        setIsOffline(offline);
        setIsReady(true);
      })
      .catch(() => {
        setIsReady(true);
      });

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // isInternetReachable can be null during initial check — treat null as online
      const offline = state.isInternetReachable === false;
      setIsOffline(offline);
      setIsReady(true);
    });

    return unsubscribe;
  }, []);

  return { isOffline, isReady };
}
