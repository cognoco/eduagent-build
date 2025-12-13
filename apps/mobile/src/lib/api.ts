/**
 * API client configuration for the mobile app.
 *
 * This module provides environment-aware URL configuration for making
 * type-safe API calls from the mobile app to the Express server.
 *
 * @module api
 * @see Story 6.2: Configure API Client for Mobile
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { createApiClient, type ApiClient } from '@nx-monorepo/api-client';

// Re-export types for convenience
export type { paths, components, ApiClient } from '@nx-monorepo/api-client';

/**
 * Gets the appropriate API URL based on the current environment and platform.
 *
 * Priority order:
 * 1. Expo config `extra.apiUrl` (from app.json or EAS build)
 * 2. `EXPO_PUBLIC_API_URL` environment variable
 * 3. Platform-specific development defaults:
 *    - iOS Simulator: http://localhost:4000/api
 *    - Android Emulator: http://10.0.2.2:4000/api (Android's localhost alias)
 *    - Default: http://localhost:4000/api
 *
 * @returns The API base URL for the current environment
 */
export function getApiUrl(): string {
  // 1. Check Expo config (set via app.json extra or EAS environment)
  const configUrl = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (configUrl) {
    return configUrl;
  }

  // 2. Check environment variable (set via EAS build or local .env)
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }

  // 3. Development fallback based on platform
  // Note: __DEV__ is a React Native global that's true in development mode
  if (__DEV__) {
    return Platform.select({
      // iOS Simulator can use localhost directly
      ios: 'http://localhost:4000/api',
      // Android Emulator requires 10.0.2.2 to reach host machine's localhost
      android: 'http://10.0.2.2:4000/api',
      // Web and other platforms use localhost
      default: 'http://localhost:4000/api',
    }) as string;
  }

  // 4. Production fallback - should be set via config but provide sensible default
  // This will be overridden by EAS environment variables in staging/production builds
  return 'https://api.example.com/api';
}

/**
 * Pre-configured API client instance for the mobile app.
 *
 * Uses the environment-aware URL configuration and provides
 * full type safety for all API endpoints.
 *
 * @example
 * ```typescript
 * import { apiClient } from '../lib/api';
 *
 * // Type-safe GET request
 * const { data, error } = await apiClient.GET('/health');
 *
 * if (error) {
 *   console.error('Health check failed:', error);
 * } else {
 *   console.log('Health status:', data);
 * }
 * ```
 */
export const apiClient: ApiClient = createApiClient({
  baseUrl: getApiUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * API configuration constants.
 *
 * @deprecated Use `getApiUrl()` or `apiClient` instead.
 * Kept for backwards compatibility with Story 6.1 validation code.
 */
export const API_CONFIG = {
  baseUrl: getApiUrl(),
} as const;
