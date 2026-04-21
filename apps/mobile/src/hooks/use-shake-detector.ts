import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';

const SHAKE_THRESHOLD = 1.8;
const SHAKE_COUNT = 3;
const SHAKE_WINDOW_MS = 600;
const SHAKE_COOLDOWN_MS = 2000;
const UPDATE_INTERVAL_MS = 100;

/**
 * Calls `onShake` when the user shakes their device. Accelerometer-based.
 * On web the hook is a no-op (no physical sensor).
 */
export function useShakeDetector(onShake: () => void): void {
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const available = await Accelerometer.isAvailableAsync();
      if (!available || cancelled) return;

      const timestamps: number[] = [];
      let lastShakeTime = 0;

      Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);

      subscription = Accelerometer.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z) - 1;
        if (magnitude < SHAKE_THRESHOLD) return;

        const now = Date.now();
        timestamps.push(now);

        while (
          timestamps.length > 0 &&
          now - (timestamps[0] ?? 0) > SHAKE_WINDOW_MS
        ) {
          timestamps.shift();
        }

        if (
          timestamps.length >= SHAKE_COUNT &&
          now - lastShakeTime > SHAKE_COOLDOWN_MS
        ) {
          lastShakeTime = now;
          timestamps.length = 0;
          onShakeRef.current();
        }
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);
}
