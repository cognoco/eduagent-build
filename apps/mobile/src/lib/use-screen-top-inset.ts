import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// [BUG-933] On native devices, `useSafeAreaInsets().top` reflects the device
// status bar / notch and is the right value to pad the screen header. On web
// (Expo Web / RN-Web) the underlying `env(safe-area-inset-top)` CSS variable
// returns 0 except in standalone/PWA mode on iOS Safari. The result is that
// every web screen header sits flush against the browser chrome (URL bar +
// tab strip), which the user reported on /quiz/history.
//
// This hook adds a web-only minimum top inset so the header has breathing
// room from the URL bar without affecting native rendering. The minimum is
// intentionally small — large enough to feel intentional, small enough that
// when the SafeAreaProvider eventually returns a real value (e.g. PWA
// fullscreen mode reporting an actual notch height), we still defer to it.
//
// Use this hook in any screen that pads its top by `insets.top + N`. The
// returned object has the same shape as `useSafeAreaInsets()`, with `top`
// adjusted on web — other edges pass through unchanged.

const WEB_MIN_TOP_INSET = 24;

export function useScreenTopInset(): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'web') {
    return {
      top: Math.max(insets.top, WEB_MIN_TOP_INSET),
      bottom: insets.bottom,
      left: insets.left,
      right: insets.right,
    };
  }
  return insets;
}
