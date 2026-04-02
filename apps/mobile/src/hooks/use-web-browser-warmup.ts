import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Pre-warms Chrome Custom Tabs on Android for faster OAuth / SSO flows.
 *
 * No-op on iOS (SFSafariViewController doesn't support pre-warming) and web.
 * Properly cleans up on unmount — cooldown is only called if warmup succeeded,
 * and a stale-closure guard prevents cooldown after the component has unmounted.
 */
export function useWebBrowserWarmup(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let isActive = true;
    let warmedUp = false;

    void (async () => {
      try {
        await WebBrowser.warmUpAsync();
        if (!isActive) {
          void WebBrowser.coolDownAsync().catch(() => undefined);
          return;
        }
        warmedUp = true;
      } catch {
        // Some Android devices do not expose the Custom Tabs service.
      }
    })();

    return () => {
      isActive = false;
      if (!warmedUp) return;
      void WebBrowser.coolDownAsync().catch(() => undefined);
    };
  }, []);
}
