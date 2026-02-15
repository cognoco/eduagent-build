/**
 * API client configuration for the mobile app.
 *
 * Placeholder — will be replaced with Hono RPC client (hc<AppType>)
 * during Epic 0 when the Hono API is scaffolded.
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

  return 'https://api.example.com';
}
