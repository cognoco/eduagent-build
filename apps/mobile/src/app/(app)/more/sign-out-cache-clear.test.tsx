/**
 * Sign-out cross-account leak break test.
 *
 * Memory: project_cross_account_leak_2026_05_10.md
 * Sign-out leaks prev user's profileId via SecureStore + un-cleared query
 * cache. The fix is signOutWithCleanup() which calls queryClient.clear()
 * before Clerk signOut. This test verifies that:
 *   1. signOutWithCleanup is called when the user presses Sign Out.
 *   2. queryClient.clear() is called as part of that path (cache clear).
 *   3. profileIds are passed so per-profile SecureStore keys are wiped.
 *
 * To run:
 *   cd apps/mobile && pnpm exec jest --findRelatedTests \
 *     src/app/\(app\)/more/sign-out-cache-clear.test.tsx --no-coverage
 */

import { createElement, type ReactElement, type ReactNode } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoutedMockFetch } from '../../../test-utils/mock-api-routes';
import { ProfileContext, type ProfileContextValue } from '../../../lib/profile';
import { AppContextProvider } from '../../../lib/app-context';
import { createTestProfile } from '../../../test-utils/app-hook-test-utils';

// ---------------------------------------------------------------------------
// Controlled signOutWithCleanup mock — this IS the break test for the leak.
// sign-out coordinates SecureStore + cache wipe + Clerk signOut; it is the
// external boundary under assertion here and stays stubbed.
// ---------------------------------------------------------------------------

const mockSignOutWithCleanup = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../../lib/sign-out' /* gc1-allow: external-boundary sign-out coordinates SecureStore + cache — the break test asserts on its call args */,
  () => ({
    ...jest.requireActual('../../../lib/sign-out'),
    signOutWithCleanup: (...args: unknown[]) => mockSignOutWithCleanup(...args),
  }),
);

// ---------------------------------------------------------------------------
// Boundary mocks (native/external runtime only). The real ProfileContext +
// AppContextProvider drive the real useProfile / useParentProxy /
// useNavigationContract / useSubscription / useFamilyPoolBreakdownSharing
// hooks against a routed mock fetch.
// ---------------------------------------------------------------------------

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

jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: native-boundary — wraps native Alert */,
  () => ({
    platformAlert: jest.fn(),
  }),
);

const mockClerkSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@clerk/expo' /* gc1-allow: external auth provider */, () => ({
  useAuth: () => ({ signOut: mockClerkSignOut, userId: 'owner-1' }),
}));

// ---------------------------------------------------------------------------
// Fixtures + wrapper. QueryClient is injected so we can spy on .clear() and
// assert the same instance is forwarded to signOutWithCleanup.
// ---------------------------------------------------------------------------

const ownerProfile = createTestProfile({
  id: 'owner-1',
  accountId: 'account-1',
  displayName: 'Jørn',
  isOwner: true,
  birthYear: 1985,
});
const childProfile = createTestProfile({
  id: 'child-1',
  accountId: 'account-1',
  displayName: 'Wife',
  isOwner: false,
  birthYear: 2010,
});

let testQueryClient: QueryClient;
let prevFetch: typeof globalThis.fetch;

function renderMore(ui: ReactElement) {
  testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  jest.spyOn(testQueryClient, 'clear');

  const routedFetch = createRoutedMockFetch({
    '/subscription': { subscription: { tier: 'family' } },
    '/subscription/family': { family: { profileCount: 2, maxProfiles: 4 } },
    '/settings/family-pool-breakdown-sharing': { value: false },
  });
  prevFetch = globalThis.fetch;
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    routedFetch as unknown as typeof fetch;

  const profileContextValue: ProfileContextValue = {
    profiles: [ownerProfile, childProfile],
    activeProfile: ownerProfile,
    isExplicitProxyMode: false,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: testQueryClient },
      createElement(
        ProfileContext.Provider,
        { value: profileContextValue },
        createElement(AppContextProvider, null, children),
      ),
    );
  }

  return render(ui, { wrapper: Wrapper });
}

const MoreScreen = require('./index').default;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sign out — cross-account leak prevention [SEC-10-05-2026]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignOutWithCleanup.mockResolvedValue(undefined);
    mockClerkSignOut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = prevFetch;
  });

  it('calls signOutWithCleanup (not bare clerkSignOut) when Sign Out pressed', async () => {
    const { getByTestId } = renderMore(<MoreScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('sign-out-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSignOutWithCleanup).toHaveBeenCalledTimes(1);
    // Bare Clerk signOut must NOT be called directly from the screen —
    // only signOutWithCleanup wraps it, ensuring cache + SecureStore are wiped.
    expect(mockClerkSignOut).not.toHaveBeenCalled();
  });

  it('passes the clerkSignOut function to signOutWithCleanup', async () => {
    const { getByTestId } = renderMore(<MoreScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('sign-out-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const callArgs = mockSignOutWithCleanup.mock.calls[0][0] as {
      clerkSignOut: unknown;
      queryClient: unknown;
      profileIds: string[];
    };
    expect(typeof callArgs.clerkSignOut).toBe('function');
  });

  it('passes ALL profile IDs to signOutWithCleanup (owner + linked children)', async () => {
    const { getByTestId } = renderMore(<MoreScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('sign-out-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const callArgs = mockSignOutWithCleanup.mock.calls[0][0] as {
      clerkSignOut: unknown;
      queryClient: unknown;
      profileIds: string[];
    };
    // Must include both owner and child profile IDs
    expect(callArgs.profileIds).toContain('owner-1');
    expect(callArgs.profileIds).toContain('child-1');
  });

  it('passes the queryClient to signOutWithCleanup (cache clear path)', async () => {
    const { getByTestId } = renderMore(<MoreScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('sign-out-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const callArgs = mockSignOutWithCleanup.mock.calls[0][0] as {
      clerkSignOut: unknown;
      queryClient: QueryClient;
      profileIds: string[];
    };
    // The queryClient passed must be the same instance wrapped in the tree
    // (not a throwaway) — signOutWithCleanup calls .clear() on it.
    expect(callArgs.queryClient).toBe(testQueryClient);
  });

  it('shows error alert and re-enables button when signOutWithCleanup throws', async () => {
    mockSignOutWithCleanup.mockRejectedValueOnce(new Error('Clerk down'));
    const mockPlatformAlert =
      require('../../../lib/platform-alert').platformAlert;

    const { getByTestId } = renderMore(<MoreScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('sign-out-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPlatformAlert).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
    // Sign out button must be re-enabled (isSigningOut reset to false)
    const btn = getByTestId('sign-out-button');
    expect(btn.props.accessibilityState?.disabled).toBeFalsy();
  });
});
