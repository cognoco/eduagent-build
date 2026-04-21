/**
 * Web stub — no accelerometer on web.
 * Metro resolves this file instead of use-shake-detector.ts for web bundles,
 * avoiding the expo-sensors import that breaks web bundling.
 */
export function useShakeDetector(_onShake: () => void): void {
  // no-op on web — no physical sensor
}
