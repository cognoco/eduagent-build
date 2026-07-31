import i18next from 'i18next';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import {
  cleanupScreen,
  createTestProfile,
  renderScreen,
} from '../../../test-utils/screen-render';
import {
  extractJsonBody,
  fetchCallsMatching,
} from '../../../test-utils/mock-api-routes';

const mockClerkSignOut = jest.fn().mockResolvedValue(undefined);
const mockSafeAreaInsets = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};
const mockSignOutWithCleanup = jest.fn().mockResolvedValue(undefined);

jest.mock('@clerk/expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
  useClerk: () => ({ signOut: mockClerkSignOut }),
  useUser: () => ({ user: { id: 'clerk-user-1' } }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: native-boundary — Alert.alert is a no-op in jsdom */,
  () => ({ platformAlert: jest.fn() }),
);

jest.mock(
  '../../../lib/sign-out' /* gc1-allow: native-boundary — signOutWithCleanup wraps Clerk + SecureStore which cannot run in jest */,
  () => ({
    signOutWithCleanup: (...args: unknown[]) => mockSignOutWithCleanup(...args),
  }),
);

const FirstMentorLanguageGate =
  require('./FirstMentorLanguageGate').FirstMentorLanguageGate;

const learner = createTestProfile({
  id: 'learner-1',
  isOwner: false,
  conversationLanguage: 'cs',
  conversationLanguageConfirmed: false,
  isCurrentUser: true,
});

describe('FirstMentorLanguageGate', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  afterEach(async () => {
    active?.cleanup();
    active = null;
    cleanupScreen();
    await i18next.changeLanguage('en');
    jest.clearAllMocks();
    Object.assign(mockSafeAreaInsets, {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  });

  it('offers the canonical 10 conversation languages independently of UI locale', () => {
    active = renderScreen(<FirstMentorLanguageGate />, {
      profile: learner,
      routes: { '/onboarding/': { success: true } },
    });

    for (const language of [
      'en',
      'cs',
      'es',
      'fr',
      'de',
      'it',
      'pt',
      'pl',
      'ja',
      'nb',
    ]) {
      active.result.getByTestId(`first-mentor-language-option-${language}`);
    }
    expect(
      active.result.getByTestId('first-mentor-language-option-cs').props
        .accessibilityState,
    ).toMatchObject({ selected: true });
  });

  it('explicitly confirms the persisted non-English value without changing UI language', async () => {
    await i18next.changeLanguage('en');
    active = renderScreen(<FirstMentorLanguageGate />, {
      profile: learner,
      routes: { '/onboarding/': { success: true } },
    });

    await act(async () => {
      fireEvent.press(
        active!.result.getByTestId('first-mentor-language-confirm'),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      const patches = fetchCallsMatching(
        active!.routedFetch,
        '/onboarding/language',
      ).filter((call) => call.init?.method === 'PATCH');
      expect(extractJsonBody(patches[patches.length - 1]?.init)).toEqual({
        conversationLanguage: 'cs',
        confirm: true,
      });
    });
    expect(i18next.language).toBe('en');
  });

  it('keeps the choice retryable when the confirmation request fails', async () => {
    active = renderScreen(<FirstMentorLanguageGate />, {
      profile: learner,
      routes: {
        '/onboarding/': new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    });
    fireEvent.press(
      active.result.getByTestId('first-mentor-language-option-fr'),
    );
    fireEvent.press(active.result.getByTestId('first-mentor-language-confirm'));

    await waitFor(() =>
      expect(
        active!.result.getByTestId('first-mentor-language-error'),
      ).toBeTruthy(),
    );
    expect(
      active.result.getByTestId('first-mentor-language-option-fr').props
        .accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      active.result.getByTestId('first-mentor-language-confirm'),
    ).not.toBeDisabled();
  });

  it('offers the standard cleanup-backed sign-out escape from the blocking gate', async () => {
    const sibling = createTestProfile({ id: 'learner-2' });
    active = renderScreen(<FirstMentorLanguageGate />, {
      profile: learner,
      profiles: [learner, sibling],
      routes: { '/onboarding/': { success: true } },
    });

    fireEvent.press(
      active.result.getByTestId('first-mentor-language-sign-out'),
    );

    await waitFor(() => {
      expect(mockSignOutWithCleanup).toHaveBeenCalledWith({
        clerkSignOut: mockClerkSignOut,
        queryClient: active!.queryClient,
        profileIds: ['learner-1', 'learner-2'],
        clerkUserId: 'clerk-user-1',
      });
    });
  });

  it('adds large safe-area insets to the gate content padding', () => {
    Object.assign(mockSafeAreaInsets, {
      top: 59,
      bottom: 34,
    });
    active = renderScreen(<FirstMentorLanguageGate />, {
      profile: learner,
      routes: { '/onboarding/': { success: true } },
    });

    expect(
      active.result.getByTestId('first-mentor-language-scroll').props
        .contentContainerStyle,
    ).toMatchObject({
      paddingTop: 83,
      paddingBottom: 58,
    });
  });

  // [WI-1556] useMentorLanguageSync runs unconditionally in (app)/_layout.tsx
  // (line 429) before this gate renders, and auto-sync is only suppressed once
  // an EXPLICIT operation begins — i.e. at Continue, not while the gate merely
  // sits open. So an automatic PATCH + profile refetch can rewrite the
  // persisted language while the learner is still choosing.
  it('[WI-1556] keeps an in-progress selection when automatic sync rewrites the persisted language', async () => {
    const syncing = createTestProfile({
      id: 'learner-sync',
      isOwner: false,
      conversationLanguage: 'cs',
      conversationLanguageConfirmed: false,
      isCurrentUser: true,
    });

    active = renderScreen(<FirstMentorLanguageGate />, {
      profile: syncing,
      routes: { '/onboarding/': { success: true } },
    });

    // The learner picks German before the automatic PATCH and its profile-list
    // refetch settle.
    fireEvent.press(
      active.result.getByTestId('first-mentor-language-option-de'),
    );
    expect(
      active.result.getByTestId('first-mentor-language-option-de').props
        .accessibilityState.selected,
    ).toBe(true);

    // The automatic sync lands: the refetched profile now carries the
    // device-locale value instead of the inherited one.
    syncing.conversationLanguage = 'es';
    await act(async () => {
      active!.result.rerender(<FirstMentorLanguageGate />);
      await Promise.resolve();
    });

    // The learner's dirty choice must survive the background write.
    expect(
      active.result.getByTestId('first-mentor-language-option-de').props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      active.result.getByTestId('first-mentor-language-option-es').props
        .accessibilityState.selected,
    ).toBe(false);

    // Continue must confirm what the learner chose, not the auto-synced locale.
    await act(async () => {
      fireEvent.press(
        active!.result.getByTestId('first-mentor-language-confirm'),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      const patches = fetchCallsMatching(
        active!.routedFetch,
        '/onboarding/language',
      ).filter((call) => call.init?.method === 'PATCH');
      expect(extractJsonBody(patches[patches.length - 1]?.init)).toEqual({
        conversationLanguage: 'de',
        confirm: true,
      });
    });
  });

  it('[WI-1556] still adopts the persisted language when the learner has not chosen yet', async () => {
    const pristine = createTestProfile({
      id: 'learner-pristine',
      isOwner: false,
      conversationLanguage: 'cs',
      conversationLanguageConfirmed: false,
      isCurrentUser: true,
    });

    active = renderScreen(<FirstMentorLanguageGate />, {
      profile: pristine,
      routes: { '/onboarding/': { success: true } },
    });

    // No interaction — a pristine gate must keep tracking the persisted value.
    pristine.conversationLanguage = 'es';
    await act(async () => {
      active!.result.rerender(<FirstMentorLanguageGate />);
      await Promise.resolve();
    });

    expect(
      active.result.getByTestId('first-mentor-language-option-es').props
        .accessibilityState.selected,
    ).toBe(true);
  });
});
