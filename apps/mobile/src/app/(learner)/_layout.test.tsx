import { render, screen } from '@testing-library/react-native';
import { useAuth } from '@clerk/clerk-expo';

const mockUseProfile = jest.fn();
const mockTabs = Object.assign(
  ({ children }: { children?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="tabs">{children}</View>;
  },
  {
    Screen: () => null,
  }
);

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
  Tabs: mockTabs,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: jest.fn(),
  useClerk: () => ({ signOut: jest.fn() }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => mockUseProfile(),
}));

jest.mock('../../lib/theme', () => ({
  useTheme: () => ({ persona: 'parent' }),
  useThemeColors: () => ({
    accent: '#0ea5e9',
    border: '#d4d4d8',
    muted: '#71717a',
    surface: '#ffffff',
    textInverse: '#ffffff',
    textPrimary: '#18181b',
    textSecondary: '#52525b',
  }),
  useTokenVars: () => ({}),
}));

jest.mock('../../hooks/use-push-token-registration', () => ({
  usePushTokenRegistration: jest.fn(),
}));

jest.mock('../../hooks/use-revenuecat', () => ({
  useRevenueCatIdentity: jest.fn(),
}));

jest.mock('../../lib/sentry', () => ({
  evaluateSentryForProfile: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const LearnerLayout = require('./_layout').default;

describe('LearnerLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    mockUseProfile.mockReturnValue({
      profiles: [
        { id: 'p1', isOwner: true, consentStatus: null },
        { id: 'c1', isOwner: false, consentStatus: null },
      ],
      activeProfile: { id: 'p1', isOwner: true, consentStatus: null },
      isLoading: false,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: jest.fn(),
    });
  });

  it('keeps linked-parent accounts in the learner tab shell for adaptive home', () => {
    render(<LearnerLayout />);

    expect(screen.getByTestId('tabs')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });
});
