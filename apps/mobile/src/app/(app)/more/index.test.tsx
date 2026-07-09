import { createElement, type ReactElement, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Profile } from '@eduagent/schemas';
import { createRoutedMockFetch } from '../../../test-utils/mock-api-routes';
import { ProfileContext, type ProfileContextValue } from '../../../lib/profile';
import { AppContextProvider } from '../../../lib/app-context';
import { createTestProfile } from '../../../test-utils/app-hook-test-utils';

// ─── Boundary mocks (native/external runtime only) ──────────────────────
//
// The real ProfileContext + AppContextProvider drive the real useProfile,
// useSubscription, useFamilySubscription, and useFamilyPoolBreakdownSharing
// hooks against a routed mock fetch. useNavigationContract stays mocked (see
// the KEEP note below). Proxy state is controlled via `isExplicitProxyMode`
// on ProfileContext.

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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

jest.mock(
  '../../../lib/theme' /* gc1-allow: native-boundary — theme hook requires native ColorScheme */,
  () => ({
    useThemeColors: () => ({ textSecondary: '#777', primary: '#6366f1' }),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: native-boundary — wraps native Alert */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

jest.mock('@clerk/expo' /* gc1-allow: external auth provider */, () => ({
  useAuth: () => ({ signOut: jest.fn(), userId: 'user-1' }),
}));

// KEEP: useNavigationContract is mocked here (not converted to the real hook).
// The real `resolveNavigationContract` derives `showAddChild` from a LOCAL
// `isAdultOwner` that uses `computeAgeBracket(birthYear)`, which returns
// 'adult' for a null/undefined birthYear (year - null === year >= 18) — so the
// real hook would SHOW Add-a-child for an owner with unknown birth year. The
// product rule this screen is supposed to enforce is "18+ only", which the
// mock encodes (`typeof birthYear === 'number'`). Running the real hook here
// would force the test to assert the divergent behavior. See FINDING in the
// sweep report. The gate inputs are read from the live render via the module
// vars below, set inside `renderMore`.
let mockNavProfile: { isOwner?: boolean; birthYear?: number | null } | null =
  null;
let mockNavProxy = false;
jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: encodes the 18+ add-child product rule the real contract diverges from (null birthYear) */,
  () => ({
    useNavigationContract: () => ({
      isParentProxy: mockNavProxy,
      gates: {
        showAddChild:
          mockNavProfile?.isOwner === true &&
          typeof mockNavProfile?.birthYear === 'number' &&
          new Date().getFullYear() - mockNavProfile.birthYear >= 18 &&
          !mockNavProxy,
        showRemoveFamilyMember:
          mockNavProfile?.isOwner === true && !mockNavProxy,
      },
    }),
  }),
);

// ─── Local render harness (adds isExplicitProxyMode over renderScreen) ──

interface RenderMoreOptions {
  profile?: Profile;
  profiles?: Profile[];
  isExplicitProxyMode?: boolean;
  routes?: Parameters<typeof createRoutedMockFetch>[0];
}

function renderMore(ui: ReactElement, opts: RenderMoreOptions = {}) {
  const activeProfile =
    opts.profile ?? createTestProfile({ isOwner: true, birthYear: 1990 });
  const profiles = opts.profiles ?? [activeProfile];
  mockNavProfile = {
    isOwner: activeProfile.isOwner,
    birthYear: activeProfile.birthYear,
  };
  mockNavProxy = opts.isExplicitProxyMode ?? false;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const routedFetch = createRoutedMockFetch(opts.routes);
  const prevFetch = globalThis.fetch;
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    routedFetch as unknown as typeof fetch;

  const profileContextValue: ProfileContextValue = {
    profiles,
    activeProfile,
    isExplicitProxyMode: opts.isExplicitProxyMode ?? false,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ProfileContext.Provider,
        { value: profileContextValue },
        createElement(AppContextProvider, null, children),
      ),
    );
  }

  const result = render(ui, { wrapper: Wrapper });
  const cleanup = () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = prevFetch;
  };
  return { result, routedFetch, queryClient, cleanup };
}

const MoreScreen = require('./index').default;

// ─── Fixtures ────────────────────────────────────────────────────────────

const adultOwner = createTestProfile({
  id: 'profile-1',
  accountId: 'account-1',
  displayName: 'Alex',
  isOwner: true,
  birthYear: 1990,
});

const linkedChild = createTestProfile({
  id: 'profile-2',
  accountId: 'account-1',
  displayName: 'Sam',
  isOwner: false,
  birthYear: 2015,
});

// Family-tier owner with one linked child is the default fixture for the
// landing rows + breakdown-sharing toggle.
function familyOwnerRoutes() {
  return {
    '/subscription': { subscription: { tier: 'family' } },
    '/subscription/family': { family: { profileCount: 1, maxProfiles: 4 } },
    '/settings/family-pool-breakdown-sharing': { value: false },
  };
}

describe('MoreScreen landing', () => {
  let active: ReturnType<typeof renderMore> | null = null;

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    jest.clearAllMocks();
  });

  it('renders the master/detail landing rows', () => {
    active = renderMore(<MoreScreen />, {
      profile: adultOwner,
      profiles: [adultOwner, linkedChild],
      routes: familyOwnerRoutes(),
    });
    const { root } = active.result;

    screen.getByTestId('more-row-learning-preferences');
    screen.getByText('Your learning');
    screen.getByText('Preferences');
    screen.getByTestId('more-row-mentor-memory');
    screen.getByTestId('more-row-mentor-language');
    screen.getByTestId('add-child-link');
    screen.getByTestId('more-row-notifications');
    screen.getByTestId('more-row-account');
    screen.getByTestId('more-row-privacy');
    screen.getByTestId('more-row-help');
    screen.getByTestId('sign-out-button');
    expect(
      screen.queryByTestId('learning-accommodation-section-header'),
    ).toBeNull();
    expect(screen.queryByTestId('mentor-memory-link')).toBeNull();
    screen.getByTestId('family-breakdown-sharing-toggle');
    screen.getByText('Share family usage');
    screen.getByText('Show usage per profile.');

    const textValues = root
      .findAllByType(Text)
      .map((node: { props: { children: unknown } }) => node.props.children);
    expect(textValues.indexOf('Your learning')).toBeLessThan(
      textValues.indexOf('Preferences'),
    );
    expect(textValues.indexOf('Preferences')).toBeLessThan(
      textValues.indexOf('Mentor memory'),
    );
    expect(textValues.indexOf('Mentor memory')).toBeLessThan(
      textValues.indexOf('Mentor language'),
    );
    expect(textValues.indexOf('Mentor language')).toBeLessThan(
      textValues.indexOf('Profile'),
    );
  });

  it('navigates directly to the accommodation picker from Preferences', () => {
    active = renderMore(<MoreScreen />, {
      profile: adultOwner,
      profiles: [adultOwner, linkedChild],
      routes: familyOwnerRoutes(),
    });

    fireEvent.press(screen.getByTestId('more-row-learning-preferences'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/more/accommodation');
  });

  it('navigates to the four More sub-screens', () => {
    active = renderMore(<MoreScreen />, {
      profile: adultOwner,
      profiles: [adultOwner, linkedChild],
      routes: familyOwnerRoutes(),
    });

    fireEvent.press(screen.getByTestId('more-row-notifications'));
    fireEvent.press(screen.getByTestId('more-row-account'));
    fireEvent.press(screen.getByTestId('more-row-privacy'));
    fireEvent.press(screen.getByTestId('more-row-help'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/more/notifications');
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/account');
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/privacy');
    expect(mockPush).toHaveBeenCalledWith('/(app)/more/help');
  });

  it('hides Add a child for minor owners and unknown birth years', () => {
    const minorOwner = createTestProfile({
      id: 'profile-1',
      accountId: 'account-1',
      displayName: 'Alex',
      isOwner: true,
      birthYear: new Date().getFullYear() - 17,
    });
    active = renderMore(<MoreScreen />, {
      profile: minorOwner,
      profiles: [minorOwner],
      routes: familyOwnerRoutes(),
    });

    expect(screen.queryByTestId('add-child-link')).toBeNull();
    active.cleanup();

    const unknownAgeOwner = createTestProfile({
      id: 'profile-1',
      accountId: 'account-1',
      displayName: 'Alex',
      isOwner: true,
      birthYear: null as unknown as number,
    });
    active = renderMore(<MoreScreen />, {
      profile: unknownAgeOwner,
      profiles: [unknownAgeOwner],
      routes: familyOwnerRoutes(),
    });

    expect(screen.queryByTestId('add-child-link')).toBeNull();
  });

  it('navigates to create-profile when Add a child is pressed', () => {
    active = renderMore(<MoreScreen />, {
      profile: adultOwner,
      profiles: [adultOwner, linkedChild],
      routes: familyOwnerRoutes(),
    });

    fireEvent.press(screen.getByTestId('add-child-link'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('uses the ready navigation gate to add a child even while the full subscription query hydrates', () => {
    // No /subscription route configured → useSubscription stays undefined, but
    // the navigation gate (showAddChild) is derived from the adult-owner
    // profile and resolves immediately.
    active = renderMore(<MoreScreen />, {
      profile: adultOwner,
      profiles: [adultOwner, linkedChild],
    });
    fireEvent.press(screen.getByTestId('add-child-link'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
    expect(mockPlatformAlert).not.toHaveBeenCalled();
  });

  it('hides add-child for non-owner (child on parent account)', () => {
    const childActive = createTestProfile({
      id: 'profile-2',
      accountId: 'account-1',
      displayName: 'Sam',
      isOwner: false,
      birthYear: 2010,
    });
    active = renderMore(<MoreScreen />, {
      profile: childActive,
      profiles: [childActive],
      routes: familyOwnerRoutes(),
    });

    // Break test: a non-owner (child account) must never see the add-child link.
    expect(screen.queryByTestId('add-child-link')).toBeNull();
    // Regular More rows are still visible for non-owner users
    screen.getByTestId('more-row-learning-preferences');
    screen.getByTestId('more-row-account');
  });

  it('locks More settings in parent preview', () => {
    active = renderMore(<MoreScreen />, {
      profile: adultOwner,
      profiles: [adultOwner, linkedChild],
      isExplicitProxyMode: true,
      routes: familyOwnerRoutes(),
    });

    screen.getByTestId('more-proxy-preview-locked');
    screen.getByText('Settings are paused in parent preview');
    expect(screen.queryByTestId('more-row-learning-preferences')).toBeNull();
    expect(screen.queryByTestId('more-row-mentor-memory')).toBeNull();
    expect(screen.queryByTestId('more-row-mentor-language')).toBeNull();
    expect(screen.queryByTestId('more-row-account')).toBeNull();
    expect(screen.queryByTestId('more-row-notifications')).toBeNull();
    expect(screen.queryByTestId('more-row-privacy')).toBeNull();
    expect(screen.queryByTestId('more-row-help')).toBeNull();
    expect(screen.queryByTestId('add-child-link')).toBeNull();
    expect(screen.queryByTestId('sign-out-button')).toBeNull();
  });

  it('routes Free owners directly to child creation instead of paywalling', () => {
    active = renderMore(<MoreScreen />, {
      profile: adultOwner,
      profiles: [adultOwner, linkedChild],
      routes: {
        '/subscription': { subscription: { tier: 'free' } },
        '/settings/family-pool-breakdown-sharing': { value: false },
      },
    });
    fireEvent.press(screen.getByTestId('add-child-link'));

    expect(mockPlatformAlert).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });

  it('lets the server enforce family-tier profile capacity', () => {
    active = renderMore(<MoreScreen />, {
      profile: adultOwner,
      profiles: [adultOwner, linkedChild],
      routes: {
        '/subscription': { subscription: { tier: 'family' } },
        '/subscription/family': { family: { profileCount: 4, maxProfiles: 4 } },
        '/settings/family-pool-breakdown-sharing': { value: false },
      },
    });
    fireEvent.press(screen.getByTestId('add-child-link'));

    expect(mockPlatformAlert).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
  });
});
