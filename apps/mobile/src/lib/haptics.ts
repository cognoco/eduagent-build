// ---------------------------------------------------------------------------
// Haptic feedback utilities — Epic 8 voice interactions (FR147, FR149)
// Fire-and-forget — haptics should never block UI or throw.
// Graceful no-op on unsupported devices and simulators.
//
// [BUG-778 / M-16] All entry points short-circuit on web. expo-haptics is
// installed for native, but on web there is no equivalent and historic SDKs
// could throw "TypeError: Cannot read properties of undefined" depending on
// build. Routing every call through this module guarantees a single guard.
// ---------------------------------------------------------------------------

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function isWeb(): boolean {
  return Platform.OS === 'web';
}

/** Light impact — recording start, discard, lightweight selection */
export function hapticLight(): void {
  if (isWeb()) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium impact — recording stop */
export function hapticMedium(): void {
  if (isWeb()) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Success notification — message sent, correct answer */
export function hapticSuccess(): void {
  if (isWeb()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** Error notification — wrong answer, quiz fail */
export function hapticError(): void {
  if (isWeb()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
