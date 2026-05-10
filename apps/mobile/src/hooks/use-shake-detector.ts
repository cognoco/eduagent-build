import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
let Accelerometer: typeof import('expo-sensors').Accelerometer | null = null;
try {
  Accelerometer = require('expo-sensors').Accelerometer;
} catch {
  // Native module unavailable (dev-client missing expo-sensors)
}

const SHAKE_THRESHOLD = 1.8;
const SHAKE_COUNT = 3;
const SHAKE_WINDOW_MS = 600;
const SHAKE_COOLDOWN_MS = 2000;
const UPDATE_INTERVAL_MS = 100;

/**
 * Calls `onShake` when the user shakes their device. Accelerometer-based.
 * On web the hook is a no-op (no physical sensor).
 */
export function useShakeDetector(onShake: () => void): {
  shakeAvailable: boolean;
} {
  const onShakeRef = useRef(onShake);
  const [shakeAvailable, setShakeAvailable] = useState(false);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!Accelerometer) {
      if (__DEV__) {
        console.warn(
          '[ShakeDetector] Accelerometer module not available - shake-to-feedback disabled',
        );
      }
      return;
    }

    let subscription: { remove: () => void } | null = null;
    let cancelled = false;
    const Accel = Accelerometer;

    (async () => {
      const available = await Accel.isAvailableAsync();
      if (cancelled) return;
      if (!available) {
        if (__DEV__) {
          console.warn(
            '[ShakeDetector] Accelerometer sensor not supported on this device - shake-to-feedback disabled',
          );
        }
        return;
      }

      const timestamps: number[] = [];
      let lastShakeTime = 0;

      Accel.setUpdateInterval(UPDATE_INTERVAL_MS);

      subscription = Accel.addListener(({ x, y, z }) => {
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
      setShakeAvailable(true);
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return { shakeAvailable };
}
