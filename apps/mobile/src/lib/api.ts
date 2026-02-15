/**
 * Hono RPC client — provides end-to-end type safety from API to mobile.
 *
 * The `hc<AppType>` pattern gives full autocomplete for all API routes
 * and response types without code generation.
 */
import { hc } from 'hono/client';
import type { AppType } from '@eduagent/api';
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

export const api = hc<AppType>(getApiUrl());
