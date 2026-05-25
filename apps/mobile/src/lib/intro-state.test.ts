import {
  markIntroSeenSync,
  hasSeenIntro,
  clearIntroSeen,
  introSecureStoreKey,
  __resetIntroStateForTests,
} from './intro-state';
import * as SecureStore from './secure-storage';
import { track } from './analytics';

jest.mock('./analytics', () => ({ track: jest.fn() })); // gc1-allow: track() is the assertion surface for the SecureStore-write-failure metric. Pattern A would require spying on the Sentry breadcrumb the real `track()` emits, adding Sentry mock plumbing to a unit test that only needs to observe one event.

const setItemSpy = jest.spyOn(SecureStore, 'setItemAsync');

beforeEach(() => {
  __resetIntroStateForTests();
  setItemSpy.mockReset();
  (track as jest.Mock).mockReset();
});

afterAll(() => {
  setItemSpy.mockRestore();
});

describe('introSecureStoreKey', () => {
  it('produces a sanitized, prefixed, versioned key', () => {
    expect(introSecureStoreKey('user_abc123')).toBe(
      'intro_seen_v1_user_abc123',
    );
  });

  it('runs the userId through the SecureStore sanitizer', () => {
    // Clerk userIds are alphanumeric + underscores, but defense in depth:
    // any colon / slash / equals must be sanitized to underscore.
    expect(introSecureStoreKey('user:1/2=3')).toBe('intro_seen_v1_user_1_2_3');
  });
});

describe('hasSeenIntro', () => {
  it('returns false when neither the in-memory cache nor SecureStore have the flag', () => {
    expect(hasSeenIntro('user_1', null)).toBe(false);
  });

  it('returns true when the in-memory cache has the flag', () => {
    setItemSpy.mockResolvedValue(undefined);
    markIntroSeenSync('user_1');
    expect(hasSeenIntro('user_1', null)).toBe(true);
  });

  it('returns true when the SecureStore value is present (cold-start case)', () => {
    expect(hasSeenIntro('user_1', '2026-05-25T10:00:00.000Z')).toBe(true);
  });

  it('does not leak the in-memory flag across userIds', () => {
    setItemSpy.mockResolvedValue(undefined);
    markIntroSeenSync('user_a');
    expect(hasSeenIntro('user_b', null)).toBe(false);
  });
});

describe('markIntroSeenSync', () => {
  it('writes the sanitized key with an ISO-8601 timestamp value', async () => {
    setItemSpy.mockResolvedValue(undefined);
    markIntroSeenSync('user_1');
    await Promise.resolve();
    expect(setItemSpy).toHaveBeenCalledWith(
      'intro_seen_v1_user_1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    );
  });

  it('sets the in-memory flag synchronously, before the async write resolves', () => {
    // Never resolves — proves the in-memory flag does not depend on the write.
    setItemSpy.mockReturnValue(new Promise(() => undefined));
    markIntroSeenSync('user_1');
    expect(hasSeenIntro('user_1', null)).toBe(true);
  });

  it('emits intro_securestore_write_failed and keeps the in-memory flag when the write rejects', async () => {
    setItemSpy.mockRejectedValue(new Error('disk full'));
    markIntroSeenSync('user_1');
    await new Promise((resolve) => setImmediate(resolve));
    expect(track).toHaveBeenCalledWith('intro_securestore_write_failed', {
      message: 'disk full',
    });
    // User is not trapped in a re-show loop within this session.
    expect(hasSeenIntro('user_1', null)).toBe(true);
  });

  it('stringifies non-Error rejection values for the failure metric', async () => {
    setItemSpy.mockRejectedValue('keystore locked');
    markIntroSeenSync('user_1');
    await new Promise((resolve) => setImmediate(resolve));
    expect(track).toHaveBeenCalledWith('intro_securestore_write_failed', {
      message: 'keystore locked',
    });
  });
});

describe('clearIntroSeen', () => {
  it('removes only the targeted user from the in-memory cache', () => {
    setItemSpy.mockResolvedValue(undefined);
    markIntroSeenSync('user_a');
    markIntroSeenSync('user_b');
    clearIntroSeen('user_a');
    expect(hasSeenIntro('user_a', null)).toBe(false);
    expect(hasSeenIntro('user_b', null)).toBe(true);
  });

  it('is a no-op when the userId is not in the cache', () => {
    expect(() => clearIntroSeen('never_marked')).not.toThrow();
    expect(hasSeenIntro('never_marked', null)).toBe(false);
  });
});
