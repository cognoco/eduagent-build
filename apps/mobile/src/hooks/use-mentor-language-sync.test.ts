import { renderHook, waitFor } from '@testing-library/react-native';
import i18next from 'i18next';

import { useMentorLanguageSync } from './use-mentor-language-sync';

const mockMutate = jest.fn();
let mockIsPending = false;
let mockActiveProfile:
  | { id: string; conversationLanguage: string }
  | null = {
  id: 'p1',
  conversationLanguage: 'en',
};

const mockUseUpdateConversationLanguage = jest.fn(() => ({
  mutate: mockMutate,
  isPending: mockIsPending,
}));
const mockUseProfile = jest.fn(() => ({
  activeProfile: mockActiveProfile,
}));

jest.mock('./use-onboarding-dimensions', () => ({
  get useUpdateConversationLanguage() {
    return mockUseUpdateConversationLanguage;
  },
}));

jest.mock('../lib/profile', () => ({
  get useProfile() {
    return mockUseProfile;
  },
}));

describe('useMentorLanguageSync', () => {
  beforeEach(async () => {
    mockMutate.mockClear();
    mockIsPending = false;
    mockActiveProfile = { id: 'p1', conversationLanguage: 'en' };
    await i18next.changeLanguage('en');
  });

  it('patches profile when i18next language differs from stored value', async () => {
    await i18next.changeLanguage('nb');

    renderHook(() => useMentorLanguageSync());

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({ conversationLanguage: 'nb' })
    );
  });

  it('patches profile after a languageChanged event', async () => {
    renderHook(() => useMentorLanguageSync());

    await i18next.changeLanguage('ja');

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({ conversationLanguage: 'ja' })
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
});
