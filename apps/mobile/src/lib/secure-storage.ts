import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';

type GetOptions = Parameters<typeof ExpoSecureStore.getItemAsync>[1];
type SetOptions = Parameters<typeof ExpoSecureStore.setItemAsync>[2];
type DeleteOptions = Parameters<typeof ExpoSecureStore.deleteItemAsync>[1];

const memoryStorage = new Map<string, string>();

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
  options?: GetOptions
): Promise<string | null> {
  if (Platform.OS === 'web') {
    return getWebStorage().getItem(key);
  }

  return options
    ? ExpoSecureStore.getItemAsync(key, options)
    : ExpoSecureStore.getItemAsync(key);
}

export async function setItemAsync(
  key: string,
  value: string,
  options?: SetOptions
): Promise<void> {
  if (Platform.OS === 'web') {
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
  options?: DeleteOptions
): Promise<void> {
  if (Platform.OS === 'web') {
    getWebStorage().removeItem(key);
    return;
  }

  if (options) {
    await ExpoSecureStore.deleteItemAsync(key, options);
  } else {
    await ExpoSecureStore.deleteItemAsync(key);
  }
}
