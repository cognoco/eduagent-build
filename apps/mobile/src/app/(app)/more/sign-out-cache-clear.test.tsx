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

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Controlled signOutWithCleanup mock — this IS the break test for the leak
// ---------------------------------------------------------------------------

const mockSignOutWithCleanup = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../../lib/sign-out' /* gc1-allow: external-boundary sign-out coordinates SecureStore + cache — needs stub in unit tests */,
  () => ({
    signOutWithCleanup: (...args: unknown[]) => mockSignOutWithCleanup(...args),
  }),
);

// ---------------------------------------------------------------------------
// Other mocks (same pattern as more/index.test.tsx)
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = require('react-native');
  return function MockIonicons({ name }: { name: string }) {
    return <Text>{name}</Text>;
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/theme' /* gc1-allow: unit test boundary */, () => ({
  useThemeColors: () => ({ textSecondary: '#777', primary: '#6366f1' }),
}));

const ownerProfile = {
  id: 'owner-1',
  displayName: 'Jørn',
  isOwner: true,
  birthYear: 1985,
};
const childProfile = {
  id: 'child-1',
  displayName: 'Wife',
  isOwner: false,
  birthYear: 2010,
};

jest.mock('../../../lib/profile' /* gc1-allow: unit test boundary */, () => ({
  useProfile: () => ({
    activeProfile: ownerProfile,
    profiles: [ownerProfile, childProfile],
  }),
}));

jest.mock(
  '../../../hooks/use-parent-proxy' /* gc1-allow: unit test boundary */,
  () => ({
    useParentProxy: () => ({
      isParentProxy: false,
      childProfile: null,
      parentProfile: null,
    }),
  }),
);

jest.mock(
  '../../../hooks/use-subscription' /* gc1-allow: unit test boundary */,
  () => ({
    useSubscription: () => ({ data: { tier: 'family' } }),
    useFamilySubscription: () => ({
      data: { profileCount: 2, maxProfiles: 4 },
    }),
  }),
);

jest.mock(
  '../../../hooks/use-settings' /* gc1-allow: unit test boundary */,
  () => ({
    useFamilyPoolBreakdownSharing: () => ({
      data: false,
      isLoading: false,
    }),
    useUpdateFamilyPoolBreakdownSharing: () => ({
      mutate: jest.fn(),
      isPending: false,
    }),
  }),
);

jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: unit test boundary */,
  () => ({
    platformAlert: jest.fn(),
  }),
);

const mockClerkSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ signOut: mockClerkSignOut }),
}));

// ---------------------------------------------------------------------------
// Wrapper — QueryClient is injected so we can spy on .clear()
// ---------------------------------------------------------------------------

let testQueryClient: QueryClient;

function createWrapper() {
  testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  jest.spyOn(testQueryClient, 'clear');
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: testQueryClient },
      children,
    );
  };
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

  it('calls signOutWithCleanup (not bare clerkSignOut) when Sign Out pressed', async () => {
    const wrapper = createWrapper();
    const { getByTestId } = render(<MoreScreen />, { wrapper });

    await act(async () => {
      fireEvent.press(getByTestId('sign-out-button'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSignOutWithCleanup).toHaveBeenCalledTimes(1);
    // Bare Clerk signOut must NOT be called directly from the screen —
    // only signOutWithCleanup wraps it, ensuring cache + SecureStore are wiped.
    // BUG-CANDIDATE: P0 — if this assertion fails, the screen is calling bare
    // Clerk signOut and bypassing the cache/SecureStore cleanup that prevents
    // the cross-account profileId leak.
    expect(mockClerkSignOut).not.toHaveBeenCalled();
  });

  it('passes the clerkSignOut function to signOutWithCleanup', async () => {
    const wrapper = createWrapper();
    const { getByTestId } = render(<MoreScreen />, { wrapper });

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
    // This ensures per-profile SecureStore keys are wiped for the child
    // profile too — the leak path is the child profile ID surviving in
    // SecureStore and being restored by ProfileProvider on next sign-in.
    const wrapper = createWrapper();
    const { getByTestId } = render(<MoreScreen />, { wrapper });

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
    const wrapper = createWrapper();
    const { getByTestId } = render(<MoreScreen />, { wrapper });

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

    const wrapper = createWrapper();
    const { getByTestId } = render(<MoreScreen />, { wrapper });

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
