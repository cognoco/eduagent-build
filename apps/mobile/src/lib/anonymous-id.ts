/**
 * Device-scoped anonymous id — WI-1689.
 *
 * Generated once per install and persisted in SecureStore so activation
 * events fired before and after signup (and across sign-out/sign-in cycles)
 * can be correlated to the same device. Contains no user identifier — a
 * random v4 UUID only.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from './secure-storage';
import { ACTIVATION_ANONYMOUS_ID_KEY } from './secure-store-keys';

let cachedAnonymousId: string | null = null;

/** Test-only reset so each test starts from a clean cache. */
export function __resetAnonymousIdCacheForTests(): void {
  cachedAnonymousId = null;
}

export async function getAnonymousId(): Promise<string> {
  if (cachedAnonymousId) return cachedAnonymousId;

  const existing = await SecureStore.getItemAsync(ACTIVATION_ANONYMOUS_ID_KEY);
  if (existing) {
    cachedAnonymousId = existing;
    return existing;
  }

  const generated = Crypto.randomUUID();
  await SecureStore.setItemAsync(ACTIVATION_ANONYMOUS_ID_KEY, generated);
  cachedAnonymousId = generated;
  return generated;
}
