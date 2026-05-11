// ---------------------------------------------------------------------------
// [BUG-723 / SEC-7] sign-out cleanup — break tests for SecureStore wipe
//
// Pre-fix: sign-out only deleted `hasSignedInBefore`. The next signed-in user
// on the same device inherited the previous account's per-profile keys
// (bookmark prompts, dictation prefs, rating counters, etc).
// ---------------------------------------------------------------------------

import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockDelete = jest.fn().mockResolvedValue(undefined);

jest.mock('./secure-storage', () => ({
  deleteItemAsync: (...args: unknown[]) => mockDelete(...args),
  sanitizeSecureStoreKey: (raw: string) => raw.replace(/[^a-zA-Z0-9._-]/g, '_'),
}));

describe('clearProfileSecureStorageOnSignOut [BUG-723 / SEC-7]', () => {
  beforeEach(() => {
    mockDelete.mockClear();
    jest.spyOn(AsyncStorage, 'multiRemove').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears global keys even when no profileIds are passed', async () => {
    await clearProfileSecureStorageOnSignOut([]);
    const calledWith = mockDelete.mock.calls.map((c) => c[0] as string);
    expect(calledWith).toEqual(
      expect.arrayContaining([
        'hasSignedInBefore',
        'mentomate_pending_auth_redirect',
        'parent-proxy-active',
        'session-recovery-marker',
        'mentomate_active_profile_id',
      ]),
    );
  });

  it('clears every per-profile key for each profileId provided', async () => {
    const ID_A = 'profile-a';
    const ID_B = 'profile-b';
    await clearProfileSecureStorageOnSignOut([ID_A, ID_B]);
    const calledWith = mockDelete.mock.calls.map((c) => c[0] as string);

    for (const id of [ID_A, ID_B]) {
      expect(calledWith).toEqual(
        expect.arrayContaining([
          `earlyAdopterDismissed_${id}`,
          `bookmark-nudge-shown_${id}`,
          `dictation-pace-${id}`,
          `dictation-punctuation-${id}`,
          `rating-recall-success-count-${id}`,
          `rating-last-prompt-${id}`,
          `rating-recall-success-count:${id}`,
          `rating-last-prompt:${id}`,
          `session-recovery-marker-${id}`,
          `postApprovalSeen_${id}`,
          `child-paywall-notified-at-${id}`,
          `permissionSetupSeen_${id}`,
          `notificationFirstAskShown_${id}`,
          `voice-input-mode-${id}`,
          `accentPreset_${id}`,
          `mentomate_parent_home_seen_${id}`,
        ]),
      );
    }
  });

  it('survives per-key delete failures (best-effort)', async () => {
    mockDelete.mockImplementationOnce(() =>
      Promise.reject(new Error('Keychain error')),
    );
    await expect(
      clearProfileSecureStorageOnSignOut(['p1']),
    ).resolves.toBeUndefined();
    expect(mockDelete.mock.calls.length).toBeGreaterThan(5);
  });

  it('skips empty/falsy profileIds without throwing', async () => {
    await clearProfileSecureStorageOnSignOut(['', 'real-id', '']);
    const calledWith = mockDelete.mock.calls.map((c) => c[0] as string);
    expect(calledWith).toEqual(
      expect.arrayContaining([`dictation-pace-real-id`]),
    );
    expect(calledWith).not.toContain('dictation-pace-');
  });

  it('clears legacy account-scoped AsyncStorage keys on sign-out', async () => {
    await clearProfileSecureStorageOnSignOut(['profile-a']);
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(
      expect.arrayContaining(['i18n-auto-suggest-dismissed']),
    );
  });

  describe('[CR-SIGNOUT-TIMEOUT-10] timeout protection', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves within the 3s cap even if every delete hangs forever', async () => {
      const neverResolves = new Promise<void>(() => {
        /* intentionally never resolves — simulates a hung SecureStore.deleteItemAsync */
      });
      mockDelete.mockReturnValue(neverResolves);
      let resolved = false;
      const cleanupPromise = clearProfileSecureStorageOnSignOut([
        'profile-a',
      ]).then(() => {
        resolved = true;
      });
      await jest.advanceTimersByTimeAsync(3_001);
      await cleanupPromise;
      expect(resolved).toBe(true);
    });

    it('resolves promptly when deletes succeed normally', async () => {
      mockDelete.mockResolvedValue(undefined);
      let resolved = false;
      const cleanupPromise = clearProfileSecureStorageOnSignOut([
        'profile-a',
      ]).then(() => {
        resolved = true;
      });
      await jest.advanceTimersByTimeAsync(0);
      await cleanupPromise;
      expect(resolved).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
