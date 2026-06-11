import { AccessibilityInfo, Platform } from 'react-native';
import { useCallback } from 'react';

/**
 * Returns a stable `announce(text)` function that calls
 * AccessibilityInfo.announceForAccessibility on native platforms.
 * No-ops on web (AccessibilityInfo.announceForAccessibility is
 * absent / unreliable there).
 *
 * Use this hook when an event-driven accessibility announcement is needed
 * (streaming completion, quiz result, toast mount, loading state).
 * For persistent live-region banners, prefer accessibilityLiveRegion on
 * the rendered View instead.
 */
export function useAnnounce(): (text: string) => void {
  return useCallback((text: string) => {
    if (Platform.OS === 'web') return;
    if (!text.trim()) return;
    AccessibilityInfo.announceForAccessibility(text);
  }, []);
}
