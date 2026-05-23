import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = require('react-native');
  return function MockIonicons({ name }: { name: string }) {
    return <Text testID={`icon-${name}`}>{name}</Text>;
  };
});

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      textSecondary: '#6b7280',
      primary: '#6366f1',
    }),
  }),
);

let mockActiveProfile: {
  id: string;
  displayName: string;
  isOwner: boolean;
  pronouns?: string | null;
} = {
  id: 'profile-1',
  displayName: 'Alex',
  isOwner: true,
};

jest.mock(
  '../../../lib/profile' /* gc1-allow: profile context requires full provider tree */,
  () => ({
    useProfile: () => ({
      activeProfile: mockActiveProfile,
    }),
  }),
);

let mockRole: 'owner' | 'child' | 'impersonated-child' | null = 'owner';

jest.mock(
  '../../../hooks/use-active-profile-role' /* gc1-allow: depends on profile + parentProxy context */,
  () => ({
    useActiveProfileRole: () => mockRole,
  }),
);

jest.mock(
  '../../../hooks/use-navigation-contract' /* gc1-allow: depends on profile + parentProxy context */,
  () => ({
    useNavigationContract: () => ({
      gates: {
        showAccountSecurity: mockActiveProfile?.isOwner === true,
        showBilling: mockRole === 'owner',
      },
    }),
  }),
);

let mockSubscriptionData: { tier: string } | undefined = { tier: 'plus' };

jest.mock(
  '../../../hooks/use-subscription' /* gc1-allow: fetches from API network boundary */,
  () => ({
    useSubscription: () => ({ data: mockSubscriptionData }),
  }),
);

// i18n
jest.mock(
  '../../../i18n' /* gc1-allow: language store is app-global native persistence */,
  () => ({
    i18next: { language: 'en' },
    LANGUAGE_LABELS: {
      en: { native: 'English', english: 'English' },
      nb: { native: 'Norsk', english: 'Norwegian' },
    },
    SUPPORTED_LANGUAGES: ['en', 'nb'],
    setStoredLanguage: jest.fn().mockResolvedValue(undefined),
  }),
);

// Feature flags
jest.mock(
  '../../../lib/feature-flags' /* gc1-allow: screen test pins app-wide feature flag branch */,
  () => ({
    FEATURE_FLAGS: { I18N_ENABLED: false },
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: wraps native Alert */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

// AccountSecurity component — renders if visible prop is true
jest.mock(
  '../../../components/account-security' /* gc1-allow: component depends on Clerk hooks and native biometrics */,
  () => ({
    AccountSecurity: ({ visible }: { visible: boolean }) => {
      const { View, Text } = require('react-native');
      if (!visible) return null;
      return (
        <View testID="account-security-section">
          <Text>Account security</Text>
        </View>
      );
    },
  }),
);

// SettingsRow and SectionHeader — pass-through stubs
jest.mock(
  '../../../components/more/settings-rows' /* gc1-allow: uses NativeWind className requiring native runtime */,
  () => {
    const { Pressable, Text, View } = require('react-native');
    return {
      SectionHeader: ({ children }: { children: React.ReactNode }) => (
        <View>
          <Text>{children}</Text>
        </View>
      ),
      SettingsRow: ({
        label,
        value,
        onPress,
        testID,
      }: {
        label: string;
        value?: string;
        onPress?: () => void;
        testID?: string;
      }) => (
        <Pressable onPress={onPress} testID={testID ?? `row-${label}`}>
          <Text>{label}</Text>
          {value ? <Text>{value}</Text> : null}
        </Pressable>
      ),
    };
  },
);

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({
    user: {
      fullName: 'Alex Test',
      firstName: 'Alex',
      primaryEmailAddress: { emailAddress: 'alex@example.com' },
    },
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const AccountScreen = require('./account').default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'owner';
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Alex',
      isOwner: true,
    };
    mockSubscriptionData = { tier: 'plus' };
  });

  it('renders profile and security rows for owner', () => {
    const { getByTestId } = render(<AccountScreen />, {
      wrapper: createWrapper(),
    });
    getByTestId('more-account-scroll');
    getByTestId('more-row-profile');
    // AccountSecurity is visible for owners
    getByTestId('account-security-section');
  });

  it('navigates to /profiles when profile row is pressed', () => {
    const { getByTestId } = render(<AccountScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent.press(getByTestId('more-row-profile'));
    expect(mockPush).toHaveBeenCalledWith('/profiles');
  });

  it('shows subscription row for owner role', () => {
    const { getByTestId } = render(<AccountScreen />, {
      wrapper: createWrapper(),
    });
    getByTestId('more-row-subscription');
  });

  it('navigates to subscription screen when subscription row pressed', () => {
    const { getByTestId } = render(<AccountScreen />, {
      wrapper: createWrapper(),
    });
    fireEvent.press(getByTestId('more-row-subscription'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
  });

  it('hides subscription row for non-owner (child) role', () => {
    mockRole = 'child';
    mockActiveProfile = {
      id: 'profile-2',
      displayName: 'Sam',
      isOwner: false,
    };
    const { queryByTestId } = render(<AccountScreen />, {
      wrapper: createWrapper(),
    });
    // Subscription row should NOT be visible
    expect(queryByTestId('more-row-subscription')).toBeNull();
  });

  it('hides account security section and billing row for non-owner', () => {
    mockRole = 'child';
    mockActiveProfile = {
      id: 'profile-2',
      displayName: 'Sam',
      isOwner: false,
    };
    const { queryByTestId } = render(<AccountScreen />, {
      wrapper: createWrapper(),
    });
    expect(queryByTestId('account-security-section')).toBeNull();
    // Break test: billing must also be hidden for non-owners (child on parent account).
    // A child seeing billing UI would be a CRITICAL security/UX violation.
    expect(queryByTestId('more-row-subscription')).toBeNull();
  });

  it('displays displayName from activeProfile', () => {
    mockActiveProfile = {
      id: 'profile-1',
      displayName: 'Jordan',
      isOwner: true,
    };
    const { getByText } = render(<AccountScreen />, {
      wrapper: createWrapper(),
    });
    getByText('Jordan');
  });

  it('falls back to Clerk user fullName when displayName is undefined', () => {
    mockActiveProfile = {
      id: 'profile-1',
      displayName: undefined as unknown as string,
      isOwner: true,
    };
    const { getByText } = render(<AccountScreen />, {
      wrapper: createWrapper(),
    });
    // Clerk mock returns fullName='Alex Test'
    getByText('Alex Test');
  });
});
