import {
  markPreAuthAudienceSync,
  readPreAuthAudienceSync,
  readPreAuthAudience,
  clearPreAuthAudience,
  preAuthAudienceSecureStoreKey,
  PRE_AUTH_AUDIENCE_KEY,
  PRE_AUTH_AUDIENCE_TTL_MS,
  __resetPreAuthAudienceForTests,
} from './pre-auth-audience';
import * as SecureStore from './secure-storage';
import { track } from './analytics';

jest.mock('./analytics', () => ({
  ...jest.requireActual('./analytics'),
  track: jest.fn(),
}));

const setItemSpy = jest.spyOn(SecureStore, 'setItemAsync');
const getItemSpy = jest.spyOn(SecureStore, 'getItemAsync');
const deleteItemSpy = jest.spyOn(SecureStore, 'deleteItemAsync');

beforeEach(() => {
  __resetPreAuthAudienceForTests();
  setItemSpy.mockReset().mockResolvedValue(undefined);
  getItemSpy.mockReset().mockResolvedValue(null);
  deleteItemSpy.mockReset().mockResolvedValue(undefined);
  (track as jest.Mock).mockReset();
});

afterAll(() => {
  setItemSpy.mockRestore();
  getItemSpy.mockRestore();
  deleteItemSpy.mockRestore();
});

describe('pre-auth audience carrier', () => {
  describe('preAuthAudienceSecureStoreKey', () => {
    it('returns the static device-scoped key', () => {
      expect(preAuthAudienceSecureStoreKey()).toBe('preAuthAudience.v1');
      expect(preAuthAudienceSecureStoreKey()).toBe(PRE_AUTH_AUDIENCE_KEY);
    });

    it('uses only SecureStore-safe characters', () => {
      expect(preAuthAudienceSecureStoreKey()).toMatch(/^[A-Za-z0-9._-]+$/);
    });
  });

  describe('markPreAuthAudienceSync + readPreAuthAudienceSync', () => {
    it('makes the chosen audience readable synchronously', () => {
      markPreAuthAudienceSync('parent');
      expect(readPreAuthAudienceSync()).toBe('parent');
    });

    it('overwrites a prior choice (learner then parent)', () => {
      markPreAuthAudienceSync('learner');
      markPreAuthAudienceSync('parent');
      expect(readPreAuthAudienceSync()).toBe('parent');
    });

    it('returns null synchronously when nothing has been written', () => {
      expect(readPreAuthAudienceSync()).toBeNull();
    });

    it('persists the audience to SecureStore with a JSON record', async () => {
      markPreAuthAudienceSync('parent');
      await Promise.resolve();
      expect(setItemSpy).toHaveBeenCalledWith(
        'preAuthAudience.v1',
        expect.stringContaining('"audience":"parent"'),
      );
    });

    it('sets the in-memory value synchronously, before the async write resolves', () => {
      // Never resolves — proves the sync read does not depend on the write.
      setItemSpy.mockReturnValue(new Promise(() => undefined));
      markPreAuthAudienceSync('parent');
      expect(readPreAuthAudienceSync()).toBe('parent');
    });

    it('emits audience_securestore_write_failed and keeps the in-memory value when the write rejects', async () => {
      setItemSpy.mockRejectedValue(new Error('disk full'));
      markPreAuthAudienceSync('parent');
      await new Promise((resolve) => setImmediate(resolve));
      expect(track).toHaveBeenCalledWith('audience_securestore_write_failed', {
        message: 'disk full',
      });
      expect(readPreAuthAudienceSync()).toBe('parent');
    });
  });

  describe('readPreAuthAudience (async, cold-start)', () => {
    it('returns the in-memory value without touching SecureStore when warm', async () => {
      markPreAuthAudienceSync('parent');
      await expect(readPreAuthAudience()).resolves.toBe('parent');
      expect(getItemSpy).not.toHaveBeenCalled();
    });

    it('hydrates from SecureStore after an in-memory reset (cold start)', async () => {
      getItemSpy.mockResolvedValue(
        JSON.stringify({ audience: 'parent', savedAt: Date.now() }),
      );
      __resetPreAuthAudienceForTests();
      await expect(readPreAuthAudience()).resolves.toBe('parent');
    });

    it('returns null and deletes the key for a record older than the TTL', async () => {
      getItemSpy.mockResolvedValue(
        JSON.stringify({
          audience: 'parent',
          savedAt: Date.now() - (PRE_AUTH_AUDIENCE_TTL_MS + 1000),
        }),
      );
      __resetPreAuthAudienceForTests();
      await expect(readPreAuthAudience()).resolves.toBeNull();
      expect(deleteItemSpy).toHaveBeenCalledWith('preAuthAudience.v1');
    });

    it('returns null and deletes the key for a malformed record', async () => {
      getItemSpy.mockResolvedValue('not json');
      __resetPreAuthAudienceForTests();
      await expect(readPreAuthAudience()).resolves.toBeNull();
      expect(deleteItemSpy).toHaveBeenCalledWith('preAuthAudience.v1');
    });

    it('returns null and deletes the key for an unrecognized audience value', async () => {
      getItemSpy.mockResolvedValue(
        JSON.stringify({ audience: 'banana', savedAt: Date.now() }),
      );
      __resetPreAuthAudienceForTests();
      await expect(readPreAuthAudience()).resolves.toBeNull();
      expect(deleteItemSpy).toHaveBeenCalledWith('preAuthAudience.v1');
    });

    it('returns null when SecureStore is empty', async () => {
      getItemSpy.mockResolvedValue(null);
      __resetPreAuthAudienceForTests();
      await expect(readPreAuthAudience()).resolves.toBeNull();
    });
  });

  describe('clearPreAuthAudience', () => {
    it('clears both the in-memory value and the SecureStore key', async () => {
      markPreAuthAudienceSync('parent');
      await clearPreAuthAudience();
      expect(readPreAuthAudienceSync()).toBeNull();
      expect(deleteItemSpy).toHaveBeenCalledWith('preAuthAudience.v1');
    });
  });
});
