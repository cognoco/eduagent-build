// ---------------------------------------------------------------------------
// [BUG-131] Web fallback security disclosure.
//
// On native (iOS/Android), this module delegates to expo-secure-store which
// stores values in Keychain / Keystore — encrypted at rest, isolated per app,
// and protected by the OS sandbox.
//
// On web, expo-secure-store is unavailable and we fall back to plain
// `localStorage` (or an in-memory map if localStorage itself is blocked).
// localStorage is NOT a secure store:
//   - readable by any JavaScript running on the same origin (incl. XSS)
//   - persists indefinitely, surviving sign-out unless explicitly cleared
//   - synchronously accessible to extensions in some browsers
//
// Consumers must treat values read/written on web as best-effort plaintext.
// Sensitive material (auth tokens, child PII) should NOT be persisted via
// this module on web; route those through Clerk's session cookie (which is
// HttpOnly and managed outside JS) or skip persistence entirely. The runtime
// warning below fires once per process so the leak is visible in dev/web
// without spamming the console.
// ---------------------------------------------------------------------------

import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';

type GetOptions = Parameters<typeof ExpoSecureStore.getItemAsync>[1];
type SetOptions = Parameters<typeof ExpoSecureStore.setItemAsync>[2];
type DeleteOptions = Parameters<typeof ExpoSecureStore.deleteItemAsync>[1];

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY =
  ExpoSecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

const memoryStorage = new Map<string, string>();

// One-shot warning so the web fallback is visible in dev consoles but never
// floods the log on every storage call. Reset by tests via `__resetWebFallbackWarning`.
let _webFallbackWarningEmitted = false;

function warnWebFallbackOnce(): void {
  if (_webFallbackWarningEmitted) return;
  _webFallbackWarningEmitted = true;
  console.warn(
    '[secure-storage] Web fallback in use: values are stored in plain localStorage ' +
      '(or memory) and are NOT encrypted. Do not persist sensitive data through ' +
      'this module on web — see secure-storage.ts header for details.',
  );
}

/**
 * Test-only helper to reset the one-shot warning latch. Lets specs assert that
 * the warning fires exactly once per process; not part of the runtime API.
 */
export function __resetWebFallbackWarning(): void {
  _webFallbackWarningEmitted = false;
}

function getWebStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    const storage = globalThis.localStorage;
    if (storage) {
      try {
        const probeKey = '__mentomate_secure_store_probe__';
        storage.setItem(probeKey, '1');
        storage.removeItem(probeKey);
        return storage;
      } catch {
        // Fall through to the in-memory fallback.
      }
    }
  }

  return {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStorage.set(key, value);
    },
    removeItem: (key: string) => {
      memoryStorage.delete(key);
    },
  };
}

export async function getItemAsync(
  key: string,
  options?: GetOptions,
): Promise<string | null> {
  if (Platform.OS === 'web') {
    warnWebFallbackOnce();
    return getWebStorage().getItem(key);
  }

  return options
    ? ExpoSecureStore.getItemAsync(key, options)
    : ExpoSecureStore.getItemAsync(key);
}

export async function setItemAsync(
  key: string,
  value: string,
  options?: SetOptions,
): Promise<void> {
  if (Platform.OS === 'web') {
    warnWebFallbackOnce();
    getWebStorage().setItem(key, value);
    return;
  }

  if (options) {
    await ExpoSecureStore.setItemAsync(key, value, options);
  } else {
    await ExpoSecureStore.setItemAsync(key, value);
  }
}

export async function deleteItemAsync(
  key: string,
  options?: DeleteOptions,
): Promise<void> {
  if (Platform.OS === 'web') {
    warnWebFallbackOnce();
    getWebStorage().removeItem(key);
    return;
  }

  if (options) {
    await ExpoSecureStore.deleteItemAsync(key, options);
  } else {
    await ExpoSecureStore.deleteItemAsync(key);
  }
}

/**
 * [I-4 / I-5] Sanitize a raw string so it is safe to use as an iOS/Android
 * SecureStore key. iOS Keychain only allows [a-zA-Z0-9._-] — characters like
 * `+`, `/`, `=`, `:`, and Unicode letters crash setItemAsync on iOS.
 *
 * Replace every forbidden character with `_`. This is a lossy transform
 * (two different raw strings may produce the same key), but profileId and
 * sessionId values are UUID-like and only contain alphanumeric + hyphens, so
 * collisions are not a concern in practice.
 */
export function sanitizeSecureStoreKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}
