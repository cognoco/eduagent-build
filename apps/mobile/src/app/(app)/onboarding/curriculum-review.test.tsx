import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGoBackOrReplace = jest.fn();
const mockSkipMutate = jest.fn();
const mockUnskipMutate = jest.fn();
const mockChallengeMutateAsync = jest.fn();
const mockAddTopicMutateAsync = jest.fn();
const mockExplainTopicMutateAsync = jest.fn();
const mockCurriculumRefetch = jest.fn();
// Mutable so timeout tests can flip isLoading to true.
let mockCurriculumIsLoading = false;
let mockCurriculumData = {
  id: 'curriculum-1',
  subjectId: 'subject-1',
  version: 1,
  topics: [
    {
      id: 'topic-1',
      title: 'Algebra Basics',
      description: 'Intro to expressions',
      sortOrder: 0,
      relevance: 'core',
      estimatedMinutes: 20,
      skipped: false,
    },
  ],
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(true),
  }),
  useLocalSearchParams: () => ({
    subjectId: 'subject-1',
    subjectName: 'History',
    step: '4',
    totalSteps: '4',
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const MockSafeAreaView = View;
  MockSafeAreaView.displayName = 'SafeAreaView';
  const MockSafeAreaProvider = ({ children }: { children: React.ReactNode }) =>
    children;
  MockSafeAreaProvider.displayName = 'SafeAreaProvider';
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: MockSafeAreaView,
    SafeAreaProvider: MockSafeAreaProvider,
    SafeAreaInsetsContext: { Consumer: View },
    initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
  };
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactReq = require('react');
  return {
    __esModule: true,
    default: ({
      visible,
      children,
    }: React.PropsWithChildren<{ visible: boolean }>) =>
      visible
        ? ReactReq.createElement(ReactReq.Fragment, null, children)
        : null,
  };
});

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#94a3b8',
    textInverse: '#ffffff',
    primary: '#2563eb',
  }),
}));

jest.mock('../../../lib/navigation', () => ({
  goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
}));

const mockPlatformAlert = jest.fn();
jest.mock('../../../lib/platform-alert', () => ({
  platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
}));

jest.mock('../../../hooks/use-curriculum', () => ({
  useCurriculum: () => ({
    data: mockCurriculumIsLoading ? undefined : mockCurriculumData,
    isLoading: mockCurriculumIsLoading,
    isError: false,
    refetch: mockCurriculumRefetch,
  }),
  useSkipTopic: () => ({ mutate: mockSkipMutate, isPending: false }),
  useUnskipTopic: () => ({ mutate: mockUnskipMutate, isPending: false }),
  useChallengeCurriculum: () => ({
    mutateAsync: mockChallengeMutateAsync,
    isPending: false,
  }),
  useAddCurriculumTopic: () => ({
    mutateAsync: mockAddTopicMutateAsync,
    isPending: false,
  }),
  useExplainTopic: () => ({
    mutateAsync: mockExplainTopicMutateAsync,
    isPending: false,
  }),
}));

const CurriculumReviewScreen = require('./curriculum-review').default;

describe('CurriculumReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurriculumIsLoading = false;
    mockCurriculumData = {
      id: 'curriculum-1',
      subjectId: 'subject-1',
      version: 1,
      topics: [
        {
          id: 'topic-1',
          title: 'Algebra Basics',
          description: 'Intro to expressions',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 20,
          skipped: false,
        },
      ],
    };
    // Default: explain resolves with a plain string (as returned by the service).
    mockExplainTopicMutateAsync.mockResolvedValue(
      'Algebra Basics is first because it builds the foundation.'
    );
  });

  it('previews and confirms a user-added topic', async () => {
    mockAddTopicMutateAsync
      .mockResolvedValueOnce({
        mode: 'preview',
        preview: {
          title: 'Trigonometry Basics',
          description: 'Angles, sine, cosine, and triangles.',
          estimatedMinutes: 35,
        },
      })
      .mockResolvedValueOnce({
        mode: 'create',
        topic: {
          id: 'topic-2',
          title: 'Trigonometry Basics',
        },
      });

    render(<CurriculumReviewScreen />);

    fireEvent.press(screen.getByTestId('add-topic-button'));
    fireEvent.changeText(screen.getByTestId('add-topic-title-input'), 'trig');
    fireEvent.press(screen.getByTestId('add-topic-preview'));

    await waitFor(() => {
      expect(mockAddTopicMutateAsync).toHaveBeenNthCalledWith(1, {
        mode: 'preview',
        title: 'trig',
      });
    });

    await waitFor(() => {
      screen.getByTestId('add-topic-description-input');
      screen.getByTestId('add-topic-minutes-input');
    });

    expect(screen.getByTestId('add-topic-title-input').props.value).toBe(
      'Trigonometry Basics'
    );
    expect(screen.getByTestId('add-topic-description-input').props.value).toBe(
      'Angles, sine, cosine, and triangles.'
    );
    expect(screen.getByTestId('add-topic-minutes-input').props.value).toBe(
      '35'
    );

    fireEvent.changeText(
      screen.getByTestId('add-topic-description-input'),
      'Angles, unit circles, and triangle relationships.'
    );
    fireEvent.changeText(screen.getByTestId('add-topic-minutes-input'), '40');
    fireEvent.press(screen.getByTestId('add-topic-confirm'));

    await waitFor(() => {
      expect(mockAddTopicMutateAsync).toHaveBeenNthCalledWith(2, {
        mode: 'create',
        title: 'Trigonometry Basics',
        description: 'Angles, unit circles, and triangle relationships.',
        estimatedMinutes: 40,
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('add-topic-title-input')).toBeNull();
    });
  });

  it('shows error when preview fails', async () => {
    mockAddTopicMutateAsync.mockRejectedValueOnce(
      new Error('API error 500: Internal server error')
    );

    render(<CurriculumReviewScreen />);

    fireEvent.press(screen.getByTestId('add-topic-button'));
    fireEvent.changeText(screen.getByTestId('add-topic-title-input'), 'trig');
    fireEvent.press(screen.getByTestId('add-topic-preview'));

    await waitFor(() => {
      screen.getByText(/went wrong on our end/i);
    });
  });

  it('navigates back when back button is pressed', () => {
    render(<CurriculumReviewScreen />);

    fireEvent.press(screen.getByTestId('curriculum-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pathname: '/(app)/onboarding/accommodations',
        params: expect.objectContaining({
          subjectId: 'subject-1',
          subjectName: 'History',
          step: '3',
          totalSteps: '4',
        }),
      })
    );
  });

  it('renders the onboarding step indicator', () => {
    render(<CurriculumReviewScreen />);

    screen.getByText('Step 4 of 4');
  });

  it('cancels add-topic modal without creating', async () => {
    render(<CurriculumReviewScreen />);

    fireEvent.press(screen.getByTestId('add-topic-button'));
    screen.getByTestId('add-topic-title-input');

    fireEvent.press(screen.getByTestId('add-topic-cancel'));

    await waitFor(() => {
      expect(screen.queryByTestId('add-topic-title-input')).toBeNull();
    });
    expect(mockAddTopicMutateAsync).not.toHaveBeenCalled();
  });

  // [UX-DE-M2] skipTopic onError — silent failure replaced with user feedback
  it('shows an alert when skipTopic fails', async () => {
    mockSkipMutate.mockImplementation(
      (_topicId: unknown, callbacks?: { onError?: (err: Error) => void }) => {
        callbacks?.onError?.(new Error('Network error'));
      }
    );

    render(<CurriculumReviewScreen />);

    // Open the skip confirmation dialog
    fireEvent.press(screen.getByTestId('skip-topic-1'));

    // platformAlert is called to show the confirmation — simulate pressing "Skip"
    expect(mockPlatformAlert).toHaveBeenCalledWith(
      'Skip this topic?',
      expect.any(String),
      expect.any(Array)
    );

    // Call the "Skip" button's onPress from the alert options
    const [, , buttons] = mockPlatformAlert.mock.calls[0] as [
      string,
      string,
      Array<{ text: string; onPress?: () => void }>
    ];
    const skipButton = buttons.find((b) => b.text === 'Skip');
    skipButton?.onPress?.();

    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Could not skip topic',
        expect.any(String)
      );
    });
  });

  // [UX-DE-M2] unskipTopic onError — silent failure replaced with user feedback
  it('shows an alert when unskipTopic fails', async () => {
    mockCurriculumData = {
      ...mockCurriculumData,
      topics: [
        {
          ...mockCurriculumData.topics[0]!,
          skipped: true,
        },
      ],
    };

    mockUnskipMutate.mockImplementation(
      (_topicId: unknown, callbacks?: { onError?: (err: Error) => void }) => {
        callbacks?.onError?.(new Error('Server error'));
      }
    );

    render(<CurriculumReviewScreen />);
    fireEvent.press(screen.getByTestId('restore-topic-1'));

    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Could not restore topic',
        expect.any(String)
      );
    });
  });

  it('offers placement actions after skipping more than 80% of topics', () => {
    mockCurriculumData = {
      id: 'curriculum-1',
      subjectId: 'subject-1',
      version: 3,
      topics: [
        {
          id: 'topic-1',
          title: 'Basics',
          description: 'Start here',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 20,
          skipped: true,
        },
        {
          id: 'topic-2',
          title: 'Intermediates',
          description: 'Level up',
          sortOrder: 1,
          relevance: 'recommended',
          estimatedMinutes: 25,
          skipped: true,
        },
        {
          id: 'topic-3',
          title: 'Advanced Problems',
          description: 'Stretch topics',
          sortOrder: 2,
          relevance: 'recommended',
          estimatedMinutes: 30,
          skipped: true,
        },
        {
          id: 'topic-4',
          title: 'Proof Techniques',
          description: 'Go deeper',
          sortOrder: 3,
          relevance: 'emerging',
          estimatedMinutes: 40,
          skipped: true,
        },
        {
          id: 'topic-5',
          title: 'Exam Strategy',
          description: 'Time pressure practice',
          sortOrder: 4,
          relevance: 'emerging',
          estimatedMinutes: 35,
          skipped: true,
        },
        {
          id: 'topic-6',
          title: 'Challenge Set',
          description: 'Advanced only',
          sortOrder: 5,
          relevance: 'emerging',
          estimatedMinutes: 45,
          skipped: false,
        },
      ],
    };

    render(<CurriculumReviewScreen />);

    screen.getByTestId('placement-check-button');
    screen.getByTestId('continue-advanced-button');
    screen.getByTestId('choose-different-subject-button');
  });

  it('[BUG-692-FOLLOWUP] setShowWhyModal does not open when user navigates back during explainTopic', async () => {
    let resolveExplain!: (value: string) => void;
    mockExplainTopicMutateAsync.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveExplain = resolve;
      })
    );

    render(<CurriculumReviewScreen />);

    fireEvent.press(screen.getByTestId('explain-topic-1'));
    fireEvent.press(screen.getByTestId('curriculum-back'));

    resolveExplain('Algebra is foundational for all other maths.');
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText('Why this order?')).toBeNull();
  });

  // [BUG-UX-CURRICULUM-TIMEOUT] 30s hard UI-level timeout on curriculum load.
  describe('[BUG-UX-CURRICULUM-TIMEOUT] 30s loading safety timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // Drive screen into the loading spinner phase.
      mockCurriculumIsLoading = true;
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does NOT show the timeout panel before 30s elapses', () => {
      render(<CurriculumReviewScreen />);

      act(() => {
        jest.advanceTimersByTime(29_999);
      });

      expect(screen.queryByTestId('curriculum-loading-timeout')).toBeNull();
      // Normal loading spinner is still present.
      expect(screen.getByTestId('curriculum-loading')).toBeTruthy();
    });

    it('shows timeout panel with Try again and Go home after 30s', () => {
      render(<CurriculumReviewScreen />);

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(screen.getByTestId('curriculum-loading-timeout')).toBeTruthy();
      expect(screen.getByTestId('curriculum-timeout-retry')).toBeTruthy();
      expect(screen.getByTestId('curriculum-timeout-home')).toBeTruthy();
    });

    it('clears the safety timeout when loading finishes before 30s (cleanup)', () => {
      const { rerender } = render(<CurriculumReviewScreen />);

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      // Loading resolves — flip back to loaded state.
      mockCurriculumIsLoading = false;
      rerender(<CurriculumReviewScreen />);

      // Advance past original 30s mark — timer must have been cleared.
      act(() => {
        jest.advanceTimersByTime(15_001);
      });

      expect(screen.queryByTestId('curriculum-loading-timeout')).toBeNull();
    });
  });
});
