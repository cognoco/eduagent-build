import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

// i18n mock — returns English values for the quiz.launch namespace so tests
// can assert on the same English strings as before the migration.
// Note: jest.mock factories are hoisted and must be self-contained.
jest.mock('react-i18next', () => {
  const TRANSLATIONS: Record<string, string> = {
    'quiz.launch.loadingShuffling': 'Shuffling questions...',
    'quiz.launch.loadingPicking': 'Picking a theme...',
    'quiz.launch.loadingAlmost': 'Almost ready...',
    'quiz.launch.challengeTitle': 'Challenge round',
    'quiz.launch.challengeBody':
      "Your mentor's making this harder — you've been crushing it.",
    'quiz.launch.challengeStart': 'Start',
    'quiz.launch.challengeLabel':
      'Challenge round. This round is harder than usual.',
    'quiz.launch.challengeStartLabel': 'Start challenge round',
    'quiz.launch.hardTimeoutTitle': 'Quiz is taking too long',
    'quiz.launch.hardTimeoutMessage':
      'Generating the round took longer than expected. Check your connection and try again.',
    'quiz.launch.errorTitle': "Couldn't create a round",
    'quiz.launch.errorFallback':
      'Try again, or head back and pick a different activity.',
    'quiz.launch.timedOutHint':
      "This is taking longer than usual — tap Cancel if you'd rather try again later.",
    'quiz.launch.cancelLabel': 'Cancel',
    'common.retry': 'Retry',
    'common.goBack': 'Go Back',
  };
  const t = (key: string, opts?: Record<string, unknown>) => {
    const template = TRANSLATIONS[key] ?? key;
    if (!opts) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
      String(opts[k] ?? `{{${k}}}`),
    );
  };
  return { useTranslation: () => ({ t }) };
});

jest.mock('../../../i18n', () => {
  const TRANSLATIONS: Record<string, string> = {
    'quiz.launch.friendlyErrors.upstreamError':
      'Something went wrong creating your quiz. Try again!',
    'quiz.launch.friendlyErrors.timeout':
      'The quiz took too long to create. Try again!',
    'quiz.launch.friendlyErrors.rateLimited':
      'Too many requests — wait a moment and try again.',
    'quiz.launch.friendlyErrors.validationError':
      'Something went wrong. Please try a different activity.',
    'quiz.launch.friendlyErrors.genericShort':
      'Something went wrong. Try again!',
  };
  const t = (key: string, opts?: Record<string, unknown>) => {
    const template = TRANSLATIONS[key] ?? key;
    if (!opts) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
      String(opts[k] ?? `{{${k}}}`),
    );
  };
  return { __esModule: true, i18next: { t } };
});

const mockReplace = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockSetRound = jest.fn();
const mockSetActivityType = jest.fn();
const mockSetSubjectId = jest.fn();
const mockSetLanguageName = jest.fn();
const mockSetReturnTo = jest.fn();
const mockMutate = jest.fn();
let mockSearchParams: Record<string, string> = {};
let mockFlowActivityType: 'capitals' | 'guess_who' | 'vocabulary' | null =
  'capitals';
let mockFlowReturnTo: string | null = null;

// Mutable so timeout tests can flip isPending to true without rerendering.
let mockGenerateRound = {
  mutate: mockMutate,
  isPending: false,
  isError: false,
  error: null as Error | null,
};

const challengeRound = {
  id: 'round-1',
  activityType: 'capitals' as const,
  theme: 'Europe',
  total: 4,
  difficultyBump: true,
  questions: [
    {
      type: 'capitals' as const,
      country: 'Slovakia',
      options: ['Bratislava', 'Prague', 'Warsaw', 'Budapest'],
      funFact: 'Bratislava sits on the Danube.',
      isLibraryItem: false,
    },
  ],
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      primary: '#00b4d8',
      textPrimary: '#111827',
      textSecondary: '#6b7280',
      textInverse: '#ffffff',
      danger: '#ef4444',
    }),
  }),
);

jest.mock(
  '../../../lib/navigation' /* gc1-allow: navigation helper mock keeps screen unit-scoped */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

jest.mock(
  '../../../components/common/DeskLampAnimation' /* gc1-allow: DeskLampAnimation is native-animated SVG; stub prevents native module crash */,
  () => ({
    DeskLampAnimation: ({ testID }: { testID?: string }) => {
      const { Text } = require('react-native');
      return <Text testID={testID}>thinking lamp</Text>;
    },
  }),
);

jest.mock('../../../hooks/use-quiz', () => ({
  useGenerateRound: () => mockGenerateRound,
}));

jest.mock('./_layout', () => ({
  useQuizFlow: () => ({
    activityType: mockFlowActivityType,
    returnTo: mockFlowReturnTo,
    subjectId: null,
    setActivityType: mockSetActivityType,
    setSubjectId: mockSetSubjectId,
    setLanguageName: mockSetLanguageName,
    setReturnTo: mockSetReturnTo,
    setRound: mockSetRound,
  }),
}));

const { default: QuizLaunchScreen, friendlyErrorMessage } = require('./launch');

describe('friendlyErrorMessage', () => {
  it('returns friendly message for UPSTREAM_ERROR code', () => {
    const result = friendlyErrorMessage('UPSTREAM_ERROR', 'anything');
    expect(result).toBe('Something went wrong creating your quiz. Try again!');
  });

  it('returns generic message for long fallback strings (over 60 chars)', () => {
    const longMessage =
      'API error 502: {"code":"UPSTREAM_ERROR","message":"Quiz LLM returned invalid structured output"}';
    const result = friendlyErrorMessage(undefined, longMessage);
    expect(result).toBe('Something went wrong. Try again!');
  });

  it('passes through short non-technical fallback messages', () => {
    const result = friendlyErrorMessage(undefined, 'Try again later');
    expect(result).toBe('Try again later');
  });
});

describe('QuizLaunchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockFlowActivityType = 'capitals';
    mockFlowReturnTo = null;
    mockGenerateRound = {
      mutate: mockMutate,
      isPending: false,
      isError: false,
      error: null,
    };
    mockMutate.mockImplementation(
      (
        _input: unknown,
        options?: { onSuccess?: (round: typeof challengeRound) => void },
      ) => {
        options?.onSuccess?.(challengeRound);
      },
    );
  });

  it('shows the challenge banner before entering a difficulty bump round', async () => {
    render(<QuizLaunchScreen />);

    await waitFor(() => {
      screen.getByTestId('quiz-challenge-banner');
    });
    screen.getByText(
      "Your mentor's making this harder — you've been crushing it.",
    );

    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('quiz-challenge-start'));

    expect(mockSetRound).toHaveBeenCalledWith(challengeRound);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/quiz/play');
  });

  it('starts a round from a valid route activityType when context is empty', async () => {
    mockFlowActivityType = null;
    mockSearchParams = { activityType: 'guess_who', returnTo: 'practice' };

    render(<QuizLaunchScreen />);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { activityType: 'guess_who', subjectId: undefined },
        expect.any(Object),
      );
    });
  });

  it('starts a vocabulary round from route params with subject context', async () => {
    mockFlowActivityType = null;
    mockSearchParams = {
      activityType: 'vocabulary',
      subjectId: 'subject-it',
      languageName: 'Italian',
      returnTo: 'practice',
    };

    render(<QuizLaunchScreen />);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { activityType: 'vocabulary', subjectId: 'subject-it' },
        expect.any(Object),
      );
    });
  });

  it('sends launch cancel back to Practice when launched from Practice', () => {
    mockGenerateRound = {
      mutate: mockMutate,
      isPending: true,
      isError: false,
      error: null,
    };
    mockMutate.mockImplementation(() => {
      // Keep launch on the loading screen.
    });
    mockFlowReturnTo = 'practice';

    render(<QuizLaunchScreen />);

    fireEvent.press(screen.getByTestId('quiz-launch-cancel'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
  });

  // [BUG-UX-QUIZ-TIMEOUT] 30s hard UI-level timeout on round generation.
  describe('[BUG-UX-QUIZ-TIMEOUT] 30s safety timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Mutation is stuck in pending — never resolves.
      mockGenerateRound = {
        mutate: mockMutate,
        isPending: true,
        isError: false,
        error: null,
      };
      mockMutate.mockImplementation(() => {
        // Intentionally never calls onSuccess/onError — simulates a hung network.
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does NOT show the error panel before 30s elapses', () => {
      render(<QuizLaunchScreen />);

      screen.getByTestId('quiz-launch-thinking-lamp');
      screen.getByText('quiz.launch.buildingRound');

      act(() => {
        jest.advanceTimersByTime(29_999);
      });

      expect(screen.queryByTestId('quiz-launch-error-fallback')).toBeNull();
    });

    it('shows error panel with Retry and Go Back after 30s', () => {
      render(<QuizLaunchScreen />);

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      screen.getByTestId('quiz-launch-error-fallback');
      screen.getByTestId('quiz-launch-retry');
      screen.getByTestId('quiz-launch-back');
    });

    it('clears the safety timeout when mutation leaves pending before 30s (cleanup)', () => {
      const { rerender } = render(<QuizLaunchScreen />);

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      // Mutation resolves before 30s — reset isPending.
      mockGenerateRound = {
        mutate: mockMutate,
        isPending: false,
        isError: false,
        error: null,
      };
      rerender(<QuizLaunchScreen />);

      // Advance past original 30s mark — timer should have been cleared.
      act(() => {
        jest.advanceTimersByTime(15_001);
      });

      expect(screen.queryByTestId('quiz-launch-error-fallback')).toBeNull();
    });
  });

  describe('typed unretryable errors', () => {
    beforeEach(() => {
      mockMutate.mockImplementation(() => {
        // Keep screen on the current error branch.
      });
    });

    it('suppresses Retry for ForbiddenError-shaped launch failures', () => {
      const forbidden = Object.assign(new Error('Insufficient permissions'), {
        name: 'ForbiddenError',
        errorCode: 'FORBIDDEN',
        apiCode: 'FORBIDDEN',
      });
      mockGenerateRound = {
        mutate: mockMutate,
        isPending: false,
        isError: true,
        error: forbidden,
      };

      render(<QuizLaunchScreen />);

      screen.getByTestId('quiz-launch-error-fallback');
      screen.getByText('Insufficient permissions');
      expect(screen.queryByTestId('quiz-launch-retry')).toBeNull();
      screen.getByTestId('quiz-launch-back');
    });

    it('suppresses Retry for consent-required launch failures', () => {
      const consentRequired = Object.assign(
        new Error('Parent consent is required.'),
        {
          name: 'ConsentRequiredError',
          errorCode: 'CONSENT_REQUIRED',
          code: 'CONSENT_REQUIRED',
        },
      );
      mockGenerateRound = {
        mutate: mockMutate,
        isPending: false,
        isError: true,
        error: consentRequired,
      };

      render(<QuizLaunchScreen />);

      screen.getByTestId('quiz-launch-error-fallback');
      expect(screen.queryByTestId('quiz-launch-retry')).toBeNull();
      screen.getByTestId('quiz-launch-back');
    });
  });
});
