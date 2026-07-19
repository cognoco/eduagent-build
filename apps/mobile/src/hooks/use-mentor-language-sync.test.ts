import { renderHook, waitFor } from '@testing-library/react-native';
import i18next from 'i18next';
import * as ExpoSecureStore from 'expo-secure-store';

import { clearProfileSecureStorageOnSignOut } from '../lib/sign-out-cleanup';
import { useMentorLanguageSync } from './use-mentor-language-sync';

// Default implementation: simulates a successful mutation by calling onSuccess.
// Tests that need to simulate failure should use mockMutate.mockImplementationOnce
// and intentionally NOT call onSuccess.
const mockMutate = jest.fn(
  (_vars: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.();
  },
);
let mockIsPending = false;
let mockActiveProfile: { id: string; conversationLanguage: string } | null = {
  id: 'p1',
  conversationLanguage: 'en',
};

jest.mock(
  './use-onboarding-dimensions' /* gc1-allow: useUpdateConversationLanguage requires a real API client + QueryClient context that cannot be wired in this unit-test environment */,
  () => ({
    ...jest.requireActual('./use-onboarding-dimensions'),
    useUpdateConversationLanguage: () => ({
      mutate: mockMutate,
      isPending: mockIsPending,
    }),
  }),
);

jest.mock(
  '../lib/profile' /* gc1-allow: useProfile reads ProfileContext which is only populated by ProfileProvider — that requires SecureStore, useProfiles (network), and QueryClient; cannot run real implementation here */,
  () => ({
    ...jest.requireActual('../lib/profile'),
    useProfile: () => ({
      activeProfile: mockActiveProfile,
    }),
  }),
);

describe('useMentorLanguageSync', () => {
  beforeEach(async () => {
    // mockReset clears call history AND restores the default success implementation.
    mockMutate.mockReset();
    mockMutate.mockImplementation(
      (_vars: unknown, opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
    );
    mockIsPending = false;
    mockActiveProfile = { id: 'p1', conversationLanguage: 'en' };
    await i18next.changeLanguage('en');
  });

  it('patches profile when i18next language differs from stored value', async () => {
    await i18next.changeLanguage('nb');

    renderHook(() => useMentorLanguageSync());

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { conversationLanguage: 'nb' },
        expect.any(Object),
      ),
    );
  });

  it('[WI-2098 AC-2] auto-syncs app-language changes when no explicit override exists', async () => {
    renderHook(() => useMentorLanguageSync());

    await i18next.changeLanguage('ja');

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { conversationLanguage: 'ja' },
        expect.any(Object),
      ),
    );
  });

  it('[WI-2098 AC-1] preserves an explicitly selected mentor language when app language changes', async () => {
    await ExpoSecureStore.setItemAsync(
      'mentorLanguageExplicitOverride_profile-1',
      'true',
    );
    mockActiveProfile = {
      id: 'profile-1',
      conversationLanguage: 'en',
    };

    renderHook(() => useMentorLanguageSync());

    await i18next.changeLanguage('de');

    await waitFor(() => expect(mockMutate).not.toHaveBeenCalled());
  });

  it('[WI-2098 AC-3] restores a profile-scoped override after remount without suppressing another profile', async () => {
    await ExpoSecureStore.setItemAsync(
      'mentorLanguageExplicitOverride_profile-1',
      'true',
    );
    mockActiveProfile = {
      id: 'profile-1',
      conversationLanguage: 'en',
    };

    const firstMount = renderHook(() => useMentorLanguageSync());
    await i18next.changeLanguage('de');
    await waitFor(() => expect(mockMutate).not.toHaveBeenCalled());
    firstMount.unmount();

    mockActiveProfile = {
      id: 'profile-2',
      conversationLanguage: 'en',
    };
    const secondMount = renderHook(() => useMentorLanguageSync());

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { conversationLanguage: 'de' },
        expect.any(Object),
      ),
    );
    secondMount.unmount();

    await clearProfileSecureStorageOnSignOut(['profile-1']);
    mockMutate.mockClear();
    mockActiveProfile = {
      id: 'profile-1',
      conversationLanguage: 'en',
    };
    renderHook(() => useMentorLanguageSync());

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith(
        { conversationLanguage: 'de' },
        expect.any(Object),
      ),
    );
  });

  it('[WI-2098 AC-4] keeps the explicit override latched across app-language changes and an explicit change back', async () => {
    const overrideKey = 'mentorLanguageExplicitOverride_profile-1';
    await ExpoSecureStore.setItemAsync(overrideKey, 'true');
    mockActiveProfile = {
      id: 'profile-1',
      conversationLanguage: 'en',
    };

    renderHook(() => useMentorLanguageSync());
    await i18next.changeLanguage('de');
    await waitFor(() => expect(mockMutate).not.toHaveBeenCalled());

    // A later explicit selection writes the same durable marker; it must not
    // be consumed by, or toggle with, automatic app-language synchronization.
    await ExpoSecureStore.setItemAsync(overrideKey, 'true');
    await i18next.changeLanguage('ja');

    await waitFor(() => expect(mockMutate).not.toHaveBeenCalled());
    await expect(ExpoSecureStore.getItemAsync(overrideKey)).resolves.toBe(
      'true',
    );
  });

  it('does not patch when languages already match', async () => {
    renderHook(() => useMentorLanguageSync());

    await waitFor(() => expect(mockMutate).not.toHaveBeenCalled());
  });

  it('does not patch when i18next language is not a supported mentor language', async () => {
    await i18next.changeLanguage('xx');

    renderHook(() => useMentorLanguageSync());

    await waitFor(() => expect(mockMutate).not.toHaveBeenCalled());
  });

  it('skips when mutation is already in flight', async () => {
    mockIsPending = true;
    await i18next.changeLanguage('nb');

    renderHook(() => useMentorLanguageSync());

    await waitFor(() => expect(mockMutate).not.toHaveBeenCalled());
  });

  it('skips when there is no active profile yet', async () => {
    mockActiveProfile = null;
    await i18next.changeLanguage('nb');

    renderHook(() => useMentorLanguageSync());

    await waitFor(() => expect(mockMutate).not.toHaveBeenCalled());
  });

  it('deduplicates repeated languageChanged events for the same language', async () => {
    // lastSyncedRef guard: the second languageChanged event for the same
    // language must be a no-op — mutate should be called exactly once even
    // if the event fires twice.
    await i18next.changeLanguage('nb');

    renderHook(() => useMentorLanguageSync());

    // First sync fires immediately on mount (language !== profile.conversationLanguage).
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

    // Fire the same language again — lastSyncedRef is already 'nb', so no
    // second call should happen.
    await i18next.changeLanguage('nb');

    // Give any async effects a chance to settle.
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
  });

  it('[BUG-800] retries after a failed mutation — does not permanently suppress retry', async () => {
    // First mutate call simulates a network failure: it receives the onSuccess
    // callback but never calls it (the real useMutation omits onSuccess on
    // error). This means lastSyncedRef must NOT be set after the first call.
    let firstCallDone = false;
    mockMutate.mockImplementationOnce((_vars: unknown, _opts: unknown) => {
      // Intentionally do NOT call opts.onSuccess — simulates a failed patch.
      firstCallDone = true;
    });

    await i18next.changeLanguage('nb');
    mockActiveProfile = { id: 'p1', conversationLanguage: 'en' };

    const { rerender } = renderHook(() => useMentorLanguageSync());

    // First call should fire (language 'nb' !== profile 'en').
    await waitFor(() => expect(firstCallDone).toBe(true));
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // Re-fire languageChanged with the same language — because onSuccess was
    // never invoked, lastSyncedRef is still null, so a second attempt must occur.
    await i18next.changeLanguage('nb');
    // Force rerender so the effect re-registers (isPending may have changed).
    rerender(undefined);

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
    expect(mockMutate).toHaveBeenNthCalledWith(
      2,
      { conversationLanguage: 'nb' },
      expect.any(Object),
    );
  });

  it('[B-599] syncs newly active profile even when app language has not changed (profile-switch regression)', async () => {
    // Profile A: conversationLanguage='en', app language nb -> sync fires.
    await i18next.changeLanguage('nb');
    mockActiveProfile = { id: 'p1', conversationLanguage: 'en' };
    const { rerender } = renderHook(() => useMentorLanguageSync());
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

    // Switch to profile B with the same gap (still en convo lang, app lang
    // still nb). Pre-fix code keyed lastSyncedRef by language only, so the
    // 'nb === nb' guard would suppress the second mutate. Post-fix, the key
    // is (profileId, language), so the switch must re-trigger sync for B.
    mockActiveProfile = { id: 'p2', conversationLanguage: 'en' };
    rerender(undefined);
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
  });
});
