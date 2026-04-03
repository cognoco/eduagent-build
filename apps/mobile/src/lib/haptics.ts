// ---------------------------------------------------------------------------
// Haptic feedback utilities — Epic 8 voice interactions (FR147, FR149)
// Fire-and-forget — haptics should never block UI or throw.
// Graceful no-op on unsupported devices and simulators.
// ---------------------------------------------------------------------------

import * as Haptics from 'expo-haptics';

/** Light impact — recording start, discard */
export function hapticLight(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Medium impact — recording stop */
export function hapticMedium(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Success notification — message sent */
export function hapticSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
