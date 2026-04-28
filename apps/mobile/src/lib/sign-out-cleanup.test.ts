// ---------------------------------------------------------------------------
// [BUG-723 / SEC-7] sign-out cleanup — break tests for SecureStore wipe
//
// Pre-fix: sign-out only deleted `hasSignedInBefore`. The next signed-in user
// on the same device inherited the previous account's per-profile keys
// (bookmark prompts, dictation prefs, rating counters, etc).
// ---------------------------------------------------------------------------

import { clearProfileSecureStorageOnSignOut } from './sign-out-cleanup';

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
          `bookmark-nudge-shown:${id}`,
          `dictation-pace-${id}`,
          `dictation-punctuation-${id}`,
          `rating-recall-success-count-${id}`,
          `rating-last-prompt-${id}`,
          `rating-recall-success-count:${id}`,
          `rating-last-prompt:${id}`,
          `session-recovery-marker-${id}`,
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
});
