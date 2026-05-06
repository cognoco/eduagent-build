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
  // sanitizeSecureStoreKey is referenced for global keys — keep behaviour
  // identical to the real impl so the asserted key strings match.
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
      ])
    );
  });

  it('clears every per-profile key for each profileId provided', async () => {
    const ID_A = 'profile-a';
    const ID_B = 'profile-b';
    await clearProfileSecureStorageOnSignOut([ID_A, ID_B]);
    const calledWith = mockDelete.mock.calls.map((c) => c[0] as string);

    // Pre-fix break: these were never cleared on sign-out, so the next user
    // saw the previous user's bookmark nudges, dictation prefs, rating
    // counters. The assertion list is the literal contract — any new
    // per-profile SecureStore key must be added here AND to the helper.
    for (const id of [ID_A, ID_B]) {
      expect(calledWith).toEqual(
        expect.arrayContaining([
          `earlyAdopterDismissed_${id}`,
          // sanitizeSecureStoreKey replaces colon with _ in bookmark key
          `bookmark-nudge-shown_${id}`,
          `dictation-pace-${id}`,
          `dictation-punctuation-${id}`,
          `rating-recall-success-count-${id}`,
          `rating-last-prompt-${id}`,
          `rating-recall-success-count:${id}`,
          `rating-last-prompt:${id}`,
          `session-recovery-marker-${id}`,
          // [CR-SECURESTORE-REGISTRY-11] Keys added in BUG-723 follow-up.
          // The assertion list is the literal contract — every new per-profile
          // SecureStore key must be added here AND to the helper.
          `postApprovalSeen_${id}`,
          `child-paywall-notified-at-${id}`,
          // sanitizeSecureStoreKey replaces non-[a-zA-Z0-9._-] chars with '_'
          // The mock above uses the same replacement so the key shape matches.
          `permissionSetupSeen_${id}`,
          `voice-input-mode-${id}`,
          // [CR-PR129-M6] Accent preset — was previously hidden from registry
          // enforcement because _layout.tsx was file-scoped in REGISTRY_EXCEPTIONS.
          `accentPreset_${id}`,
        ])
      );
    }
  });

  it('survives per-key delete failures (best-effort)', async () => {
    // One stuck key must not block the rest. Otherwise a single Keychain
    // hiccup would leave most SecureStore entries on the device.
    mockDelete.mockImplementationOnce(() =>
      Promise.reject(new Error('Keychain error'))
    );
    await expect(
      clearProfileSecureStorageOnSignOut(['p1'])
    ).resolves.toBeUndefined();
    // We still attempted to delete every other key.
    expect(mockDelete.mock.calls.length).toBeGreaterThan(5);
  });

  it('skips empty/falsy profileIds without throwing', async () => {
    await clearProfileSecureStorageOnSignOut(['', 'real-id', '']);
    const calledWith = mockDelete.mock.calls.map((c) => c[0] as string);
    expect(calledWith).toEqual(
      expect.arrayContaining([`dictation-pace-real-id`])
    );
    // The empty string would yield malformed keys like `dictation-pace-` —
    // the helper must filter them out.
    expect(calledWith).not.toContain('dictation-pace-');
  });

  it('clears legacy account-scoped AsyncStorage keys on sign-out', async () => {
    await clearProfileSecureStorageOnSignOut(['profile-a']);

    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(
      expect.arrayContaining(['i18n-auto-suggest-dismissed'])
    );
  });

  // [CR-SIGNOUT-TIMEOUT-10] If SecureStore.deleteItemAsync hangs (Android
  // Keystore lock contention, iOS Keychain busy-wait), the helper must
  // resolve within SIGNOUT_CLEANUP_TIMEOUT_MS so sign-out is never trapped
  // behind a stuck secure-storage operation.
  describe('[CR-SIGNOUT-TIMEOUT-10] timeout protection', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves within the 3s cap even if every delete hangs forever', async () => {
      // Hang every delete with a never-resolving promise.
      const neverResolves = new Promise<void>(() => {
        /* deliberately never settle — simulates a stuck Keychain delete */
      });
      mockDelete.mockReturnValue(neverResolves);

      let resolved = false;
      const cleanupPromise = clearProfileSecureStorageOnSignOut([
        'profile-a',
      ]).then(() => {
        resolved = true;
      });

      // Advance past the timeout cap (3s + tiny margin).
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

      // Drain microtasks; cleanup should resolve well before the 3s timeout.
      await jest.advanceTimersByTimeAsync(0);
      await cleanupPromise;

      expect(resolved).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
