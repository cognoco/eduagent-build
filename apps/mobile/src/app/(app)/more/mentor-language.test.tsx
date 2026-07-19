import i18nextInstance from 'i18next';
import * as ExpoSecureStore from 'expo-secure-store';
import { fireEvent, act, waitFor } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
} from '../../../test-utils/screen-render';
import {
  fetchCallsMatching,
  extractJsonBody,
} from '../../../test-utils/mock-api-routes';
import { useMentorLanguageSync } from '../../../hooks/use-mentor-language-sync';
import { queryKeys } from '../../../lib/query-keys';
import { clearProfileSecureStorageOnSignOut } from '../../../lib/sign-out-cleanup';

// ─── Boundary mocks (native/external runtime only) ──────────────────────
//
// The real ProfileContext drives the real useProfile and useNavigationContract
// hooks; the real useUpdateConversationLanguage hook runs against the routed
// mock fetch installed by renderScreen. react-i18next is NOT mocked here —
// test-setup.ts initializes the real i18next singleton with the real en.json
// catalog, which is exactly what the i18next-unchanged assertions below need.

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock(
  '@expo/vector-icons/Ionicons' /* gc1-allow: native-boundary — bundles native font asset */,
  () => {
    const { Text } = require('react-native');
    return function MockIonicons({ name }: { name: string }) {
      return <Text>{name}</Text>;
    };
  },
);

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native-boundary — requires native insets */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

// prettier-ignore
jest.mock(/* gc1-allow: native-boundary — theme hook requires native ColorScheme */ '../../../lib/theme', () => ({
  useThemeColors: () => ({ textSecondary: '#777', primary: '#6366f1' }),
}));

const mockPlatformAlert = jest.fn();
// prettier-ignore
jest.mock(/* gc1-allow: native-boundary — wraps native Alert */ '../../../lib/platform-alert', () => ({
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

const MentorLanguageScreen = require('./mentor-language').default;

function MentorLanguageWithSync({
  onProfilesRefetch,
}: {
  onProfilesRefetch?: () => Promise<void>;
}): React.ReactElement {
  useMentorLanguageSync();
  useQuery({
    queryKey: queryKeys.profiles.list(undefined),
    queryFn: async () => {
      await onProfilesRefetch?.();
      return [];
    },
  });
  return <MentorLanguageScreen />;
}

// ─── Fixtures ────────────────────────────────────────────────────────────

const owner = createTestProfile({
  id: 'profile-1',
  accountId: 'account-1',
  displayName: 'Alex',
  isOwner: true,
  birthYear: 1990,
  conversationLanguage: 'en',
});

const child = createTestProfile({
  id: 'child-1',
  accountId: 'account-1',
  displayName: 'Mia',
  isOwner: false,
  birthYear: 2014,
  conversationLanguage: 'en',
});

const onboardingRoutes = { '/onboarding/': { success: true } };

describe('MentorLanguageScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    mockSearchParams = {};
    mockCanGoBack.mockReturnValue(false);
  });

  afterEach(async () => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
    await clearProfileSecureStorageOnSignOut([
      'profile-1',
      'profile-race',
      'profile-unmount',
      'profile-retry',
      'profile-failure',
    ]);
    await i18nextInstance.changeLanguage('en');
    jest.clearAllMocks();
  });

  it('renders all 10 conversationLanguageSchema locales, not just the 7 UI-shell locales', () => {
    active = renderScreen(<MentorLanguageScreen />, {
      profile: owner,
      routes: onboardingRoutes,
    });

    for (const lang of [
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
      active.result.getByTestId(`mentor-language-option-${lang}`);
    }
  });

  it('writes the self profile conversation language via /onboarding/language', async () => {
    active = renderScreen(<MentorLanguageScreen />, {
      profile: owner,
      routes: onboardingRoutes,
    });

    await act(async () => {
      fireEvent.press(active!.result.getByTestId('mentor-language-option-es'));
      await Promise.resolve();
    });

    await waitFor(() => {
      const patches = fetchCallsMatching(
        active!.routedFetch,
        '/onboarding/language',
      ).filter((c) => c.init?.method === 'PATCH');
      expect(patches.length).toBeGreaterThanOrEqual(1);
      expect(extractJsonBody(patches[patches.length - 1]?.init)).toEqual({
        conversationLanguage: 'es',
      });
    });
  });

  it('[WI-2098 AC-1] records a profile-scoped override only after a successful explicit save', async () => {
    active = renderScreen(<MentorLanguageScreen />, {
      profile: owner,
      routes: onboardingRoutes,
    });

    await act(async () => {
      fireEvent.press(active!.result.getByTestId('mentor-language-option-es'));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(ExpoSecureStore.setItemAsync).toHaveBeenCalledWith(
        'mentorLanguageExplicitOverride_profile-1',
        'true',
      ),
    );
  });

  it('[WI-2098 AC-5] does not latch the override when the explicit save fails', async () => {
    active = renderScreen(<MentorLanguageScreen />, {
      profile: owner,
      routes: {
        '/onboarding/': new Response(JSON.stringify({ error: 'save failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    });

    await act(async () => {
      fireEvent.press(active!.result.getByTestId('mentor-language-option-es'));
      await Promise.resolve();
    });

    await waitFor(() => expect(mockPlatformAlert).toHaveBeenCalled());
    expect(ExpoSecureStore.setItemAsync).not.toHaveBeenCalledWith(
      'mentorLanguageExplicitOverride_profile-1',
      'true',
    );
  });

  it('[WI-2098 adversarial] protects an explicit choice during profile invalidation before the screen callback can run', async () => {
    const raceProfile = createTestProfile({
      ...owner,
      id: 'profile-race',
      conversationLanguage: 'de',
    });
    const patchLanguages: string[] = [];
    let refetches = 0;
    await i18nextInstance.changeLanguage('de');

    active = renderScreen(
      <MentorLanguageWithSync
        onProfilesRefetch={async () => {
          refetches += 1;
          if (refetches === 2) {
            i18nextInstance.emit('languageChanged', 'de');
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }}
      />,
      {
        profile: raceProfile,
        routes: {
          '/onboarding/': (_url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body)) as {
              conversationLanguage: string;
            };
            patchLanguages.push(body.conversationLanguage);
            raceProfile.conversationLanguage = body.conversationLanguage;
            return { success: true };
          },
        },
      },
    );

    await waitFor(() => expect(refetches).toBe(1));
    fireEvent.press(active.result.getByTestId('mentor-language-option-en'));

    await waitFor(() => expect(refetches).toBeGreaterThanOrEqual(2));
    await waitFor(() =>
      expect(
        ExpoSecureStore.getItemAsync(
          'mentorLanguageExplicitOverride_profile-race',
        ),
      ).resolves.toBe('true'),
    );
    expect(patchLanguages).toEqual(['en']);
    expect(raceProfile.conversationLanguage).toBe('en');
  });

  it('[WI-2098 AC-4] preserves API order and marker across explicit choice, app change, and explicit choice back', async () => {
    const orderedProfile = createTestProfile({
      ...owner,
      id: 'profile-race',
      conversationLanguage: 'de',
    });
    const patchLanguages: string[] = [];
    await i18nextInstance.changeLanguage('de');

    active = renderScreen(<MentorLanguageWithSync />, {
      profile: orderedProfile,
      routes: {
        '/onboarding/': (_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            conversationLanguage: string;
          };
          patchLanguages.push(body.conversationLanguage);
          orderedProfile.conversationLanguage = body.conversationLanguage;
          return { success: true };
        },
      },
    });

    fireEvent.press(active.result.getByTestId('mentor-language-option-en'));
    await waitFor(() => expect(patchLanguages).toEqual(['en']));
    await act(async () => {
      await i18nextInstance.changeLanguage('ja');
    });
    fireEvent.press(active.result.getByTestId('mentor-language-option-de'));

    await waitFor(() => expect(patchLanguages).toEqual(['en', 'de']));
    expect(orderedProfile.conversationLanguage).toBe('de');
    await expect(
      ExpoSecureStore.getItemAsync(
        'mentorLanguageExplicitOverride_profile-race',
      ),
    ).resolves.toBe('true');
  });

  it('[WI-2098 lifecycle] persists the marker when the screen unmounts before the API resolves', async () => {
    let resolveSave!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const unmountProfile = createTestProfile({
      ...owner,
      id: 'profile-unmount',
    });
    active = renderScreen(<MentorLanguageScreen />, {
      profile: unmountProfile,
      routes: {
        '/onboarding/': async () => {
          await saveGate;
          return { success: true };
        },
      },
    });

    fireEvent.press(active.result.getByTestId('mentor-language-option-es'));
    active.result.unmount();
    resolveSave();

    await waitFor(() =>
      expect(
        ExpoSecureStore.getItemAsync(
          'mentorLanguageExplicitOverride_profile-unmount',
        ),
      ).resolves.toBe('true'),
    );
  });

  it('[WI-2098 recovery] protects the explicit value and retries marker persistence after one storage failure', async () => {
    const retryProfile = createTestProfile({
      ...owner,
      id: 'profile-retry',
      conversationLanguage: 'de',
    });
    const patchLanguages: string[] = [];
    const realSetItem = ExpoSecureStore.setItemAsync.getMockImplementation();
    ExpoSecureStore.setItemAsync
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockImplementation(realSetItem!);
    await i18nextInstance.changeLanguage('de');
    active = renderScreen(<MentorLanguageWithSync />, {
      profile: retryProfile,
      routes: {
        '/onboarding/': (_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            conversationLanguage: string;
          };
          patchLanguages.push(body.conversationLanguage);
          retryProfile.conversationLanguage = body.conversationLanguage;
          return { success: true };
        },
      },
    });

    fireEvent.press(active.result.getByTestId('mentor-language-option-en'));
    await waitFor(() => expect(patchLanguages).toEqual(['en']));
    await act(async () => {
      await i18nextInstance.changeLanguage('ja');
    });

    await waitFor(() =>
      expect(
        ExpoSecureStore.getItemAsync(
          'mentorLanguageExplicitOverride_profile-retry',
        ),
      ).resolves.toBe('true'),
    );
    expect(patchLanguages).toEqual(['en']);
  });

  it('[WI-2098 failure] clears in-flight coordination after API failure without creating a marker', async () => {
    const failureProfile = createTestProfile({
      ...owner,
      id: 'profile-failure',
      conversationLanguage: 'de',
    });
    const patchLanguages: string[] = [];
    let failExplicit = true;
    await i18nextInstance.changeLanguage('de');
    active = renderScreen(<MentorLanguageWithSync />, {
      profile: failureProfile,
      routes: {
        '/onboarding/': (_url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body)) as {
            conversationLanguage: string;
          };
          patchLanguages.push(body.conversationLanguage);
          if (failExplicit) {
            failExplicit = false;
            return new Response(JSON.stringify({ error: 'save failed' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          failureProfile.conversationLanguage = body.conversationLanguage;
          return { success: true };
        },
      },
    });

    fireEvent.press(active.result.getByTestId('mentor-language-option-en'));
    await waitFor(() => expect(mockPlatformAlert).toHaveBeenCalled());
    await act(async () => {
      await i18nextInstance.changeLanguage('ja');
    });

    await waitFor(() => expect(patchLanguages).toEqual(['en', 'ja']));
    await expect(
      ExpoSecureStore.getItemAsync(
        'mentorLanguageExplicitOverride_profile-failure',
      ),
    ).resolves.toBeNull();
  });

  it('writes a linked child conversation language via the guardian route, keyed by childProfileId', async () => {
    mockSearchParams = { childProfileId: 'child-1' };
    active = renderScreen(<MentorLanguageScreen />, {
      profile: owner,
      profiles: [owner, child],
      routes: onboardingRoutes,
    });

    await active.result.findByText("Mia's mentor language");

    await act(async () => {
      fireEvent.press(active!.result.getByTestId('mentor-language-option-de'));
      await Promise.resolve();
    });

    await waitFor(() => {
      const patches = fetchCallsMatching(
        active!.routedFetch,
        '/onboarding/child-1/language',
      ).filter((c) => c.init?.method === 'PATCH');
      expect(patches.length).toBeGreaterThanOrEqual(1);
      expect(extractJsonBody(patches[patches.length - 1]?.init)).toEqual({
        conversationLanguage: 'de',
      });
    });
    // The self route must never be hit for a guardian-on-behalf-of-child write.
    expect(
      fetchCallsMatching(active.routedFetch, '/onboarding/language').filter(
        (c) => c.init?.method === 'PATCH',
      ),
    ).toHaveLength(0);
  });

  it('never touches i18next.language / i18next.changeLanguage when picking a mentor language', async () => {
    const changeLanguageSpy = jest.spyOn(i18nextInstance, 'changeLanguage');
    const languageBefore = i18nextInstance.language;

    active = renderScreen(<MentorLanguageScreen />, {
      profile: owner,
      routes: onboardingRoutes,
    });

    // 'cs' is a conversation-only locale (not in SUPPORTED_LANGUAGES), so if
    // this row were ever mis-wired to i18next.changeLanguage the app-shell
    // language would visibly (and detectably) flip to an unsupported value.
    await act(async () => {
      fireEvent.press(active!.result.getByTestId('mentor-language-option-cs'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        fetchCallsMatching(active!.routedFetch, '/onboarding/language').filter(
          (c) => c.init?.method === 'PATCH',
        ).length,
      ).toBeGreaterThanOrEqual(1);
    });

    expect(changeLanguageSpy).not.toHaveBeenCalled();
    expect(i18nextInstance.language).toBe(languageBefore);
    changeLanguageSpy.mockRestore();
  });

  it('shows expectation-setting copy for a conversation-only locale', () => {
    active = renderScreen(<MentorLanguageScreen />, {
      profile: owner,
      routes: onboardingRoutes,
    });

    active.result.getByText(
      'Tutor will speak Italian; app menus stay in English.',
    );
  });

  it('leaves child-editing mode when the active profile is not the owner', async () => {
    mockSearchParams = { childProfileId: 'child-1' };
    active = renderScreen(<MentorLanguageScreen />, {
      profile: child,
      profiles: [owner, child],
      routes: onboardingRoutes,
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
    });
    active.result.getByTestId('mentor-language-access-pending');
    expect(active.result.queryByTestId('mentor-language-option-de')).toBeNull();
  });

  it('fails closed for a stale direct child deep link outside the live profile list', async () => {
    mockSearchParams = { childProfileId: 'stale-child' };
    active = renderScreen(<MentorLanguageScreen />, {
      profile: owner,
      profiles: [owner],
      routes: onboardingRoutes,
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
    });
    active.result.getByTestId('mentor-language-access-pending');
    expect(active.result.queryByTestId('mentor-language-option-de')).toBeNull();
  });

  describe('back navigation', () => {
    it('replaces to the Account screen when no back stack in self mode', async () => {
      mockCanGoBack.mockReturnValue(false);
      active = renderScreen(<MentorLanguageScreen />, {
        profile: owner,
        routes: onboardingRoutes,
      });

      fireEvent.press(active.result.getByTestId('mentor-language-back'));

      expect(mockReplace).toHaveBeenCalledWith('/(app)/more/account');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('replaces to the child settings route in child-editing mode', async () => {
      mockSearchParams = { childProfileId: 'child-1' };
      mockCanGoBack.mockReturnValue(false);
      active = renderScreen(<MentorLanguageScreen />, {
        profile: owner,
        profiles: [owner, child],
        routes: onboardingRoutes,
      });

      await active.result.findByTestId('mentor-language-back');
      fireEvent.press(active.result.getByTestId('mentor-language-back'));

      expect(mockReplace).toHaveBeenCalledWith(
        '/(app)/child/child-1?mode=settings',
      );
      expect(mockBack).not.toHaveBeenCalled();
    });
  });
});
