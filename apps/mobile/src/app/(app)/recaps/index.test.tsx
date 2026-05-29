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

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  // gc1-allow: expo-router requires native navigation context — cannot run in JSDOM
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
  }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`mock-redirect-${href}`}>{href}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  // gc1-allow: requires native SafeAreaProvider — not available in JSDOM
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../lib/format-relative-date', () => ({
  formatRelativeDate: (iso: string) => `relative(${iso})`,
}));

// prettier-ignore
jest.mock('../../../components/common', () => ({ // gc1-allow: barrel exports RN components including Reanimated animations — cannot render in JSDOM
  Button: ({
    label,
    onPress,
    testID,
  }: {
    label: string;
    onPress: () => void;
    testID?: string;
  }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable testID={testID} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  },
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
  TimeoutLoader: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID} />;
  },
}));

const mockUseNavigationContract = jest.fn();
// prettier-ignore
jest.mock('../../../hooks/use-navigation-contract', () => ({ // gc1-allow: wraps multiple context hooks (profile, subscription, app-context) requiring full provider tree
  useNavigationContract: () => mockUseNavigationContract(),
}));

const mockUseRecaps = jest.fn();
// prettier-ignore
jest.mock('../../../hooks/use-recaps', () => ({ // gc1-allow: wraps api-client fetch boundary — needs network stub in unit tests
  useRecaps: (...args: unknown[]) => mockUseRecaps(...args),
}));

const RecapsScreen = require('./index').default as React.ComponentType;

const BASE_RECAP = {
  recapId: 'recap-001',
  sessionId: 'session-001',
  childProfileId: 'child-001',
  childDisplayName: 'Emma',
  topicTitle: 'Fractions',
  subjectName: 'Maths',
  displayTitle: 'Maths session',
  displaySummary: 'Emma worked on fractions.',
  narrative: 'Emma had a great session on fractions.',
  highlight: null as string | null,
  conversationPrompt: null as string | null,
  startedAt: '2026-05-20T10:00:00Z',
  exchangeCount: 5,
  topicId: 'topic-001',
};

describe('RecapsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNavigationContract.mockReturnValue({
      canEnter: () => true,
      effectiveAppContext: 'family',
      isFamilyCapable: true,
    });
  });

  describe('access control', () => {
    it('redirects to home when canEnter("recaps") returns false', () => {
      mockUseNavigationContract.mockReturnValue({
        canEnter: () => false,
        effectiveAppContext: 'learner',
        isFamilyCapable: false,
      });
      mockUseRecaps.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByTestId('mock-redirect-/(app)/home')).toBeTruthy();
      expect(screen.queryByTestId('recaps-screen')).toBeNull();
    });
  });

  describe('loading state', () => {
    it('renders the loading spinner', () => {
      mockUseRecaps.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByTestId('recaps-loading')).toBeTruthy();
      expect(screen.queryByTestId('recaps-empty')).toBeNull();
      expect(screen.queryByTestId('recaps-error')).toBeNull();
    });
  });

  describe('error state', () => {
    it('renders the error fallback with retry and home actions', () => {
      mockUseRecaps.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByTestId('recaps-error')).toBeTruthy();
      expect(screen.getByTestId('recaps-retry')).toBeTruthy();
      expect(screen.getByTestId('recaps-home')).toBeTruthy();
    });

    it('retry action calls refetch on the query', () => {
      const refetch = jest.fn();
      mockUseRecaps.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch,
      });

      render(<RecapsScreen />);
      fireEvent.press(screen.getByTestId('recaps-retry'));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('home action routes to /(app)/home', () => {
      mockUseRecaps.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      fireEvent.press(screen.getByTestId('recaps-home'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/home');
    });
  });

  describe('empty state', () => {
    it('renders the empty card when data is an empty array', () => {
      mockUseRecaps.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByTestId('recaps-empty')).toBeTruthy();
      expect(screen.getByTestId('recaps-empty-start-session')).toBeTruthy();
    });

    it('renders the empty card when data is undefined (loaded with no rows)', () => {
      mockUseRecaps.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByTestId('recaps-empty')).toBeTruthy();
    });

    it('start-session CTA routes to /(app)/home', () => {
      mockUseRecaps.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      fireEvent.press(screen.getByTestId('recaps-empty-start-session'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/home');
    });
  });

  describe('loaded state', () => {
    it('renders one row per recap', () => {
      mockUseRecaps.mockReturnValue({
        data: [
          { ...BASE_RECAP, recapId: 'recap-001' },
          { ...BASE_RECAP, recapId: 'recap-002', childDisplayName: 'Liam' },
        ],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByTestId('recap-row-recap-001')).toBeTruthy();
      expect(screen.getByTestId('recap-row-recap-002')).toBeTruthy();
      expect(screen.queryByTestId('recaps-empty')).toBeNull();
    });

    it('prefers topicTitle over subjectName and displayTitle', () => {
      mockUseRecaps.mockReturnValue({
        data: [BASE_RECAP],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByText('Fractions')).toBeTruthy();
    });

    it('falls back to subjectName when topicTitle is null', () => {
      mockUseRecaps.mockReturnValue({
        data: [{ ...BASE_RECAP, topicTitle: null }],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByText('Maths')).toBeTruthy();
    });

    it('falls back to displayTitle when both topicTitle and subjectName are null', () => {
      mockUseRecaps.mockReturnValue({
        data: [{ ...BASE_RECAP, topicTitle: null, subjectName: null }],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByText('Maths session')).toBeTruthy();
    });

    it('summary prefers narrative', () => {
      mockUseRecaps.mockReturnValue({
        data: [BASE_RECAP],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(
        screen.getByText('Emma had a great session on fractions.'),
      ).toBeTruthy();
    });

    it('summary falls back to displaySummary when narrative is missing', () => {
      mockUseRecaps.mockReturnValue({
        data: [{ ...BASE_RECAP, narrative: null }],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByText('Emma worked on fractions.')).toBeTruthy();
    });

    it('summary falls back to highlight when narrative and displaySummary are missing', () => {
      mockUseRecaps.mockReturnValue({
        data: [
          {
            ...BASE_RECAP,
            narrative: null,
            displaySummary: null,
            highlight: 'Practiced fractions for 12 min',
          },
        ],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByText('Practiced fractions for 12 min')).toBeTruthy();
    });

    it('summary falls back to recaps.summaryPending when all summary fields are missing', () => {
      mockUseRecaps.mockReturnValue({
        data: [
          {
            ...BASE_RECAP,
            narrative: null,
            displaySummary: null,
            highlight: null,
          },
        ],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      expect(screen.getByText('recaps.summaryPending')).toBeTruthy();
    });

    it('pressing a row routes to the recap detail with the recapId param', () => {
      mockUseRecaps.mockReturnValue({
        data: [BASE_RECAP],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      });

      render(<RecapsScreen />);
      fireEvent.press(screen.getByTestId('recap-row-recap-001'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/recaps/[recapId]',
        params: { recapId: 'recap-001' },
      });
    });
  });
});
