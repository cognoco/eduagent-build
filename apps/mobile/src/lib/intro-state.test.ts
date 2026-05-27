import {
  markPreAuthIntroSeenSync,
  hasSeenPreAuthIntro,
  preAuthIntroSecureStoreKey,
  __resetIntroStateForTests,
} from './intro-state';
import * as SecureStore from './secure-storage';
import { track } from './analytics';

jest.mock('./analytics', () => ({
  ...jest.requireActual('./analytics'),
  track: jest.fn(),
}));

const setItemSpy = jest.spyOn(SecureStore, 'setItemAsync');

beforeEach(() => {
  __resetIntroStateForTests();
  setItemSpy.mockReset();
  (track as jest.Mock).mockReset();
});

afterAll(() => {
  setItemSpy.mockRestore();
});

describe('pre-auth intro state', () => {
  describe('preAuthIntroSecureStoreKey', () => {
    it('returns the static device-scoped key', () => {
      expect(preAuthIntroSecureStoreKey()).toBe('preAuthIntroSeen.v1');
    });

    it('uses only SecureStore-safe characters (letters, digits, dot, dash, underscore)', () => {
      expect(preAuthIntroSecureStoreKey()).toMatch(/^[A-Za-z0-9._-]+$/);
    });
  });

  describe('hasSeenPreAuthIntro', () => {
    it('returns false when neither in-memory nor SecureStore have the flag', () => {
      expect(hasSeenPreAuthIntro(null)).toBe(false);
    });

    it('returns true when the in-memory cache has the flag', () => {
      setItemSpy.mockResolvedValue(undefined);
      markPreAuthIntroSeenSync();
      expect(hasSeenPreAuthIntro(null)).toBe(true);
    });

    it('returns true when the SecureStore value is present (cold-start case)', () => {
      expect(hasSeenPreAuthIntro('2026-05-27T10:00:00.000Z')).toBe(true);
    });
  });

  describe('markPreAuthIntroSeenSync', () => {
    it('writes the device-scoped key with an ISO-8601 timestamp value', async () => {
      setItemSpy.mockResolvedValue(undefined);
      markPreAuthIntroSeenSync();
      await Promise.resolve();
      expect(setItemSpy).toHaveBeenCalledWith(
        'preAuthIntroSeen.v1',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      );
    });

    it('sets the in-memory flag synchronously, before the async write resolves', () => {
      // Never resolves — proves the in-memory flag does not depend on the write.
      setItemSpy.mockReturnValue(new Promise(() => undefined));
      markPreAuthIntroSeenSync();
      expect(hasSeenPreAuthIntro(null)).toBe(true);
    });

    it('emits intro_securestore_write_failed and keeps the in-memory flag when the write rejects', async () => {
      setItemSpy.mockRejectedValue(new Error('disk full'));
      markPreAuthIntroSeenSync();
      await new Promise((resolve) => setImmediate(resolve));
      expect(track).toHaveBeenCalledWith('intro_securestore_write_failed', {
        message: 'disk full',
      });
      // User is not trapped in a re-show loop within this session.
      expect(hasSeenPreAuthIntro(null)).toBe(true);
    });

    it('stringifies non-Error rejection values for the failure metric', async () => {
      setItemSpy.mockRejectedValue('keystore locked');
      markPreAuthIntroSeenSync();
      await new Promise((resolve) => setImmediate(resolve));
      expect(track).toHaveBeenCalledWith('intro_securestore_write_failed', {
        message: 'keystore locked',
      });
    });

    // Race regression: after marking seen in memory, a remount of the pre-auth
    // welcome path must NOT re-show cards even if the SecureStore write has
    // not yet committed (probe reads null from disk).
    it('survives a remount where the SecureStore write has not yet committed', () => {
      // Simulate the SecureStore write still pending.
      setItemSpy.mockReturnValue(new Promise(() => undefined));
      markPreAuthIntroSeenSync();
      // Subsequent probe (e.g. on remount) sees null on disk but the
      // in-memory bit must answer the gate.
      expect(hasSeenPreAuthIntro(null)).toBe(true);
    });
  });
});
