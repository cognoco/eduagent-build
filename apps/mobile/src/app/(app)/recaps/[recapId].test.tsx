import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  // gc1-allow: i18n init requires full provider tree — not available in JSDOM unit test environment
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts === 'object') {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
  }),
}));

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockGoBackOrReplace = jest.fn();

jest.mock('expo-router', () => ({
  // gc1-allow: expo-router requires native navigation context — cannot run in JSDOM
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
    replace: mockReplace,
    push: jest.fn(),
  }),
  useLocalSearchParams: () => ({ recapId: 'recap-001' }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`mock-redirect-${href}`}>{href}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  // gc1-allow: requires native SafeAreaProvider — not available in JSDOM
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// prettier-ignore
jest.mock('../../../lib/navigation', () => ({ // gc1-allow: imports expo-router Router type; goBackOrReplace calls router.back which requires native navigation context
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  FAMILY_RECAPS_HREF: '/(app)/recaps',
  FAMILY_RECAPS_RETURN_TO: 'family-recaps',
}));

// prettier-ignore
jest.mock('../../../components/common', () => ({ // gc1-allow: barrel exports RN components including Reanimated animations — cannot render in JSDOM
  ErrorFallback: ({
    title,
    message,
    primaryAction,
    secondaryAction,
    testID,
  }: {
    title?: string;
    message?: string;
    primaryAction?: { label: string; onPress: () => void; testID?: string };
    secondaryAction?: { label: string; onPress: () => void; testID?: string };
    testID?: string;
  }) => {
    const { View, Text, Pressable } = require('react-native');
    return (
      <View testID={testID}>
        {title ? <Text testID={`${testID}-title`}>{title}</Text> : null}
        {message ? <Text testID={`${testID}-message`}>{message}</Text> : null}
        {primaryAction ? (
          <Pressable
            testID={primaryAction.testID ?? `${testID}-primary`}
            onPress={primaryAction.onPress}
          >
            <Text>{primaryAction.label}</Text>
          </Pressable>
        ) : null}
        {secondaryAction ? (
          <Pressable
            testID={secondaryAction.testID ?? `${testID}-secondary`}
            onPress={secondaryAction.onPress}
          >
            <Text>{secondaryAction.label}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
  TimeoutLoader: () => null,
}));

// prettier-ignore
jest.mock('../../../components/family/AddToMyLearningButton', () => ({ // gc1-allow: wraps mutation hooks requiring QueryClientProvider — cannot run standalone in JSDOM
  AddToMyLearningButton: () => null,
}));

// prettier-ignore
jest.mock('../../../components/guards/RequireFamilyContext', () => ({ // gc1-allow: guard owns app-context mutation + i18n; this unit verifies recap detail delegates to the guard
  RequireFamilyContext: ({ route }: { route: string }) => {
    const { View } = require('react-native');
    return <View testID={`mock-family-guard-${route}`} />;
  },
}));

const mockUseNavigationContract = jest.fn();
// prettier-ignore
jest.mock('../../../hooks/use-navigation-contract', () => ({ // gc1-allow: wraps multiple context hooks (profile, subscription, app-context) requiring full provider tree
  useNavigationContract: () => mockUseNavigationContract(),
}));

const mockUseRecap = jest.fn();
// prettier-ignore
jest.mock('../../../hooks/use-recaps', () => ({ // gc1-allow: wraps api-client fetch boundary — needs network stub in unit tests
  useRecap: (...args: unknown[]) => mockUseRecap(...args),
}));

const RecapDetailScreen = require('./[recapId]').default as React.ComponentType;

const RECAP_DATA = {
  recapId: 'recap-001',
  sessionId: 'session-001',
  childProfileId: 'child-001',
  childDisplayName: 'Emma',
  topicTitle: 'Fractions',
  subjectName: 'Maths',
  displayTitle: 'Maths session',
  displaySummary: 'Emma worked on fractions.',
  narrative: 'Emma had a great session on fractions.',
  highlight: null,
  conversationPrompt: null,
  startedAt: '2026-05-20T10:00:00Z',
  exchangeCount: 5,
  topicId: 'topic-001',
  verifiedProof: null,
};

const VERIFIED_PROOF = {
  topicId: 'topic-001',
  topicTitle: 'Fractions',
  subjectId: 'subject-001',
  verifiedAt: '2026-07-10T10:00:00.000Z',
  verificationState: 'fresh',
  retentionStatus: 'strong',
  nextReviewDate: '2026-07-17T10:00:00.000Z',
  quote: 'Equivalent fractions name the same amount.',
} as const;

describe('RecapDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNavigationContract.mockReturnValue({
      canEnter: () => true,
      effectiveAppContext: 'guardian',
    });
  });

  describe('not-found state', () => {
    beforeEach(() => {
      mockUseRecap.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
    });

    it('renders the not-found ErrorFallback', () => {
      render(<RecapDetailScreen />);
      expect(screen.getByTestId('recap-detail-not-found')).toBeTruthy();
    });

    it('renders the Back primary action on not-found', () => {
      render(<RecapDetailScreen />);
      expect(screen.getByTestId('recap-detail-not-found-back')).toBeTruthy();
    });

    it('renders the Go Home secondary action on not-found (BUG-685)', () => {
      render(<RecapDetailScreen />);
      expect(screen.getByTestId('recap-detail-not-found-go-home')).toBeTruthy();
    });

    it('Go Home secondary action routes to /(app)/home (BUG-685)', () => {
      render(<RecapDetailScreen />);
      fireEvent.press(screen.getByTestId('recap-detail-not-found-go-home'));
      expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    });

    it('Back primary action calls goBackOrReplace (BUG-685)', () => {
      render(<RecapDetailScreen />);
      fireEvent.press(screen.getByTestId('recap-detail-not-found-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    it('renders the error ErrorFallback with retry and back', () => {
      mockUseRecap.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: jest.fn(),
      });

      render(<RecapDetailScreen />);
      expect(screen.getByTestId('recap-detail-error')).toBeTruthy();
      expect(screen.getByTestId('recap-detail-retry')).toBeTruthy();
      expect(screen.getByTestId('recap-detail-error-back')).toBeTruthy();
    });
  });

  describe('loaded state', () => {
    beforeEach(() => {
      mockUseRecap.mockReturnValue({
        data: RECAP_DATA,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });
    });

    it('renders the recap detail screen', () => {
      render(<RecapDetailScreen />);
      expect(screen.getByTestId('recap-detail-screen')).toBeTruthy();
    });

    it('renders the back button', () => {
      render(<RecapDetailScreen />);
      expect(screen.getByTestId('recap-detail-back')).toBeTruthy();
    });

    it('renders the verified-proof block with quote and retention state', () => {
      mockUseRecap.mockReturnValue({
        data: { ...RECAP_DATA, verifiedProof: VERIFIED_PROOF },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapDetailScreen />);

      expect(screen.getByTestId('recap-detail-verified-proof')).toBeTruthy();
      expect(
        screen.getByText('“Equivalent fractions name the same amount.”'),
      ).toBeTruthy();
      expect(screen.getByText('recaps.verifiedProof.holdsStrong')).toBeTruthy();
      expect(
        screen.getByText(/^recaps\.verifiedProof\.recheckDue:/),
      ).toBeTruthy();
    });

    it('renders no verified-proof block when the response field is null', () => {
      render(<RecapDetailScreen />);

      expect(screen.queryByTestId('recap-detail-verified-proof')).toBeNull();
    });

    it('renders the abstracted line when an aged proof has no quote', () => {
      mockUseRecap.mockReturnValue({
        data: {
          ...RECAP_DATA,
          verifiedProof: { ...VERIFIED_PROOF, quote: null },
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapDetailScreen />);

      expect(screen.getByTestId('recap-detail-verified-proof')).toBeTruthy();
      expect(
        screen.getByText('home.parent.verifiedProof.quoteUnavailable'),
      ).toBeTruthy();
    });
  });

  describe('access control', () => {
    it('renders the family guard when canEnter returns false', () => {
      mockUseNavigationContract.mockReturnValue({
        canEnter: () => false,
        effectiveAppContext: 'learner',
      });
      mockUseRecap.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapDetailScreen />);
      expect(
        screen.getByTestId('mock-family-guard-recaps/[recapId]'),
      ).toBeTruthy();
    });
  });
});
