import { fireEvent } from '@testing-library/react-native';
import { type RoutedMockFetch } from '../../../test-utils/mock-api-routes';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
} from '../../../test-utils/screen-render';

// ─── Boundary mocks (external runtime only) ────────────────────────────

jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — returns en.json strings */,
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  'expo-localization' /* gc1-allow: native-boundary — used by i18n init */,
  () => ({
    getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
  }),
);

const mockPush = jest.fn();

jest.mock('expo-router' /* gc1-allow: native-boundary */, () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '@expo/vector-icons/Ionicons' /* gc1-allow: native-boundary — bundles native font asset */,
  () => {
    const { Text } = require('react-native');
    return function MockIonicons({ name }: { name: string }) {
      return <Text testID={`icon-${name}`}>{name}</Text>;
    };
  },
);

jest.mock('@clerk/expo' /* gc1-allow: external auth provider */, () => ({
  useUser: () => ({
    user: {
      fullName: 'Alex Test',
      firstName: 'Alex',
      primaryEmailAddress: { emailAddress: 'alex@example.com' },
      // passwordEnabled drives AccountSecurity's branch: when true the
      // password-row testID renders, which the owner-visibility test asserts.
      passwordEnabled: true,
      externalAccounts: [],
    },
  }),
  useAuth: () => ({ signOut: jest.fn() }),
}));

// Route the Hono RPC client through a shared mock fetch so real hooks
// (useSubscription, useNavigationContract, etc.) actually run.
let mockFetch: RoutedMockFetch;

jest.mock(
  '../../../lib/api-client' /* gc1-allow: transport-boundary — routed mock fetch drives real hooks */,
  () => {
    const actual = jest.requireActual('../../../lib/api-client');
    const {
      createRoutedMockFetch,
    } = require('../../../test-utils/mock-api-routes');
    const { hc } = require('hono/client');
    mockFetch = createRoutedMockFetch();
    return {
      ...actual,
      useApiClient: () => hc('http://localhost', { fetch: mockFetch }),
    };
  },
);

const AccountScreen = require('./account').default as React.ComponentType;

// ─── Test fixtures ──────────────────────────────────────────────────────

const ownerProfile = createTestProfile({
  id: 'profile-owner',
  accountId: 'account-1',
  displayName: 'Alex',
  isOwner: true,
});

const childProfile = createTestProfile({
  id: 'profile-child',
  accountId: 'account-family',
  displayName: 'Sam',
  isOwner: false,
});

function subscriptionResponse(tier: 'plus' | 'free' = 'plus') {
  return {
    subscription: {
      tier,
      effectiveAccessTier: tier,
      billingAccess: 'current',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: '2030-01-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      monthlyLimit: 700,
      usedThisMonth: 0,
      remainingQuestions: 700,
      dailyLimit: null,
      usedToday: 0,
      dailyRemainingQuestions: null,
    },
  };
}

const defaultRoutes = {
  '/subscription': subscriptionResponse('plus'),
};

// ─── Tests ──────────────────────────────────────────────────────────────

describe('AccountScreen', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
    jest.clearAllMocks();
  });

  it('renders profile and security rows for owner', () => {
    active = renderScreen(<AccountScreen />, {
      profile: ownerProfile,
      routes: defaultRoutes,
    });
    active.result.getByTestId('more-account-scroll');
    active.result.getByTestId('more-row-profile');
    // Real AccountSecurity (visible for owners): with passwordEnabled=true
    // the change-password row testID is present. For non-owners the entire
    // AccountSecurity tree is gated out — see the hide test below.
    active.result.getByTestId('change-password-row');
  });

  it('navigates to /profiles when profile row is pressed', () => {
    active = renderScreen(<AccountScreen />, {
      profile: ownerProfile,
      routes: defaultRoutes,
    });
    fireEvent.press(active.result.getByTestId('more-row-profile'));
    expect(mockPush).toHaveBeenCalledWith('/profiles');
  });

  it('shows subscription row for owner role', () => {
    active = renderScreen(<AccountScreen />, {
      profile: ownerProfile,
      routes: defaultRoutes,
    });
    active.result.getByTestId('more-row-subscription');
  });

  it('navigates to subscription screen when subscription row pressed', () => {
    active = renderScreen(<AccountScreen />, {
      profile: ownerProfile,
      routes: defaultRoutes,
    });
    fireEvent.press(active.result.getByTestId('more-row-subscription'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
  });

  it('hides subscription row for non-owner (child) role', () => {
    active = renderScreen(<AccountScreen />, {
      profile: childProfile,
      routes: defaultRoutes,
    });
    // Subscription row should NOT be visible
    expect(active.result.queryByTestId('more-row-subscription')).toBeNull();
  });

  it('hides account security section and billing row for non-owner', () => {
    active = renderScreen(<AccountScreen />, {
      profile: childProfile,
      routes: defaultRoutes,
    });
    // Account security tree is fully suppressed for non-owners — neither the
    // password row nor any of its rendered testIDs exist.
    expect(active.result.queryByTestId('change-password-row')).toBeNull();
    // Break test: billing must also be hidden for non-owners (child on parent account).
    // A child seeing billing UI would be a CRITICAL security/UX violation.
    expect(active.result.queryByTestId('more-row-subscription')).toBeNull();
  });

  it('displays displayName from activeProfile', () => {
    active = renderScreen(<AccountScreen />, {
      profile: createTestProfile({
        id: 'profile-owner',
        accountId: 'account-1',
        displayName: 'Jordan',
        isOwner: true,
      }),
      routes: defaultRoutes,
    });
    active.result.getByText('Jordan');
  });

  it('falls back to Clerk user fullName when displayName is undefined', () => {
    active = renderScreen(<AccountScreen />, {
      profile: createTestProfile({
        id: 'profile-owner',
        accountId: 'account-1',
        displayName: undefined as unknown as string,
        isOwner: true,
      }),
      routes: defaultRoutes,
    });
    // Clerk mock returns fullName='Alex Test'
    active.result.getByText('Alex Test');
  });
});
