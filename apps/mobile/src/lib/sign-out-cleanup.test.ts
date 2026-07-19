// ---------------------------------------------------------------------------
// [BUG-723 / SEC-7] sign-out cleanup — break tests for SecureStore wipe
//
// Pre-fix: sign-out only deleted `hasSignedInBefore`. The next signed-in user
// on the same device inherited the previous account's per-profile keys
// (bookmark prompts, dictation prefs, rating counters, etc).
// ---------------------------------------------------------------------------

import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoSecureStore from 'expo-secure-store';

const mockDelete = jest.mocked(ExpoSecureStore.deleteItemAsync);

describe('clearProfileSecureStorageOnSignOut [BUG-723 / SEC-7]', () => {
  beforeEach(() => {
    mockDelete.mockClear();
    jest.spyOn(AsyncStorage, 'multiRemove').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears mentomate_preview_intent on sign-out', async () => {
    await clearProfileSecureStorageOnSignOut([]);
    const calledWith = mockDelete.mock.calls.map((c) => c[0] as string);
    expect(calledWith).toContain('mentomate_preview_intent');
  });

  // [WI-2225] The pre-auth audience carrier (preAuthAudience.v1) is wiped by
  // key name, regardless of which value — 'learner', 'parent', or the new
  // non-authorizing 'supporter' — was stored under it. This test does not
  // stage a value (the wipe call takes no value, only the key), which is
  // the point: the next signed-out user on a shared device must never
  // inherit a prior supporter choice.
  it('clears preAuthAudience.v1 on sign-out regardless of the stored audience value (incl. supporter)', async () => {
    await clearProfileSecureStorageOnSignOut([]);
    const calledWith = mockDelete.mock.calls.map((c) => c[0] as string);
    expect(calledWith).toContain('preAuthAudience.v1');
  });

  it('clears global keys even when no profileIds are passed', async () => {
    await clearProfileSecureStorageOnSignOut([]);
    const calledWith = mockDelete.mock.calls.map((c) => c[0] as string);
    expect(calledWith).toEqual(
      expect.arrayContaining([
        'hasSignedInBefore',
        'parent-proxy-active',
        'session-recovery-marker',
        'mentomate_active_profile_id',
      ]),
    );
  });

  it('[WI-2098 AC-3] clears every per-profile key, including the explicit Mentor-language override, on sign-out', async () => {
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
          `session-recovery-marker-${id}`,
          `postApprovalSeen_${id}`,
          `child-paywall-notified-at-${id}`,
          `permissionSetupSeen_${id}`,
          `notificationFirstAskShown_${id}`,
          `guardianNotificationAskShown_${id}`,
          `voice-input-mode-${id}`,
          `accentPreset_${id}`,
          `mentomate_parent_home_seen_${id}`,
          `mentorLanguageExplicitOverride_${id}`,
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

  it('[BUG-357] clears legacy un-scoped react-query persister blob on sign-out', async () => {
    // Defense-in-depth on top of the identity-scoped persister key:
    // pre-fix devices wrote to `eduagent-query-cache`; that orphan must be
    // wiped on sign-out so it never gets re-used by a future code path.
    await clearProfileSecureStorageOnSignOut(['profile-a']);
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(
      expect.arrayContaining(['eduagent-query-cache']),
    );
  });

  // -------------------------------------------------------------------------
  // [BUG-128 / BREAK] Prefix-based AsyncStorage scan picks up summary-draft
  // (and any future multi-component-key writer) whose individual key shapes
  // we cannot enumerate at sign-out. Without this scan, children's drafts
  // would accumulate across accounts on a shared device.
  // -------------------------------------------------------------------------
  it('[BREAK / BUG-128] removes AsyncStorage keys matching summary-draft prefix on sign-out', async () => {
    const draftKeysForChildA = [
      'summary-draft-child-a-session-1',
      'summary-draft-child-a-session-2',
    ];
    const draftKeysForChildB = ['summary-draft-child-b-session-9'];
    const unrelatedKey = 'unrelated-key';

    jest
      .spyOn(AsyncStorage, 'getAllKeys')
      .mockResolvedValue([
        ...draftKeysForChildA,
        ...draftKeysForChildB,
        unrelatedKey,
      ]);
    const multiRemoveSpy = jest
      .spyOn(AsyncStorage, 'multiRemove')
      .mockResolvedValue(undefined);

    await clearProfileSecureStorageOnSignOut(['child-a', 'child-b']);

    // The prefix-scan multiRemove must be called with all matched draft keys,
    // not the unrelated key.
    const allRemovedKeys = multiRemoveSpy.mock.calls.flatMap(
      (c) => c[0] as readonly string[],
    );
    for (const key of [...draftKeysForChildA, ...draftKeysForChildB]) {
      expect(allRemovedKeys).toContain(key);
    }
    expect(allRemovedKeys).not.toContain(unrelatedKey);
  });

  it('[BUG-128] tolerates AsyncStorage.getAllKeys failure without aborting cleanup', async () => {
    jest
      .spyOn(AsyncStorage, 'getAllKeys')
      .mockRejectedValue(new Error('AsyncStorage unavailable'));
    jest.spyOn(AsyncStorage, 'multiRemove').mockResolvedValue(undefined);

    await expect(
      clearProfileSecureStorageOnSignOut(['child-a']),
    ).resolves.toBeUndefined();
    // SecureStore wipes still ran despite the prefix scan failing.
    expect(mockDelete).toHaveBeenCalled();
  });

  it('[BUG-128] does not call multiRemove for prefix scan when no keys match', async () => {
    jest
      .spyOn(AsyncStorage, 'getAllKeys')
      .mockResolvedValue(['unrelated-1', 'unrelated-2']);
    const multiRemoveSpy = jest
      .spyOn(AsyncStorage, 'multiRemove')
      .mockResolvedValue(undefined);

    await clearProfileSecureStorageOnSignOut(['child-a']);

    // multiRemove may still be called for outbox/GLOBAL_ASYNCSTORAGE_KEYS,
    // but never with the unrelated keys from the prefix scan.
    const allRemovedKeys = multiRemoveSpy.mock.calls.flatMap(
      (c) => c[0] as readonly string[],
    );
    expect(allRemovedKeys).not.toContain('unrelated-1');
    expect(allRemovedKeys).not.toContain('unrelated-2');
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
