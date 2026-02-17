/**
 * API base URL resolution.
 *
 * Determines the correct API endpoint based on environment:
 * 1. EXPO_PUBLIC_API_URL env var (explicit override)
 * 2. Expo config extra.apiUrl (app.json / app.config.ts)
 * 3. Platform-specific localhost for __DEV__
 * 4. Production URL fallback
 *
 * Note: The Hono RPC client (`hc<AppType>`) is intentionally NOT exported
 * here. AppType lives in @eduagent/api, which mobile cannot import per
 * dependency direction rules. Use `useApi()` from ./auth-api instead.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  const configUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (configUrl) return configUrl;

  if (__DEV__) {
    return Platform.select({
      ios: 'http://localhost:8787',
      android: 'http://10.0.2.2:8787',
      default: 'http://localhost:8787',
    }) as string;
  }

  return 'https://api.eduagent.app';
}
