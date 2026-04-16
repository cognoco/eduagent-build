import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseTopicProgress = jest.fn();
const mockUseActiveSessionForTopic = jest.fn();
const mockUseTopicRetention = jest.fn();
const mockUseEvaluateEligibility = jest.fn();
const mockUseTopicParkingLot = jest.fn();

jest.mock('../../../hooks/use-progress', () => ({
  useTopicProgress: (...args: unknown[]) => mockUseTopicProgress(...args),
  useActiveSessionForTopic: (...args: unknown[]) =>
    mockUseActiveSessionForTopic(...args),
}));

jest.mock('../../../hooks/use-retention', () => ({
  useTopicRetention: (...args: unknown[]) => mockUseTopicRetention(...args),
  useEvaluateEligibility: (...args: unknown[]) =>
    mockUseEvaluateEligibility(...args),
}));

jest.mock('../../../hooks/use-sessions', () => ({
  useTopicParkingLot: (...args: unknown[]) => mockUseTopicParkingLot(...args),
}));

const { useLocalSearchParams } = require('expo-router') as {
  useLocalSearchParams: jest.Mock;
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

const TopicDetailScreen = require('./[topicId]').default;

describe('TopicDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocalSearchParams.mockReturnValue({
      subjectId: 'sub-1',
      topicId: 'topic-1',
    });
    mockUseTopicParkingLot.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mockUseEvaluateEligibility.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mockUseActiveSessionForTopic.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  it('shows loading state', () => {
    mockUseTopicProgress.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    mockUseTopicRetention.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('topic-detail-loading')).toBeTruthy();
    expect(screen.getByText('Loading topic...')).toBeTruthy();
  });

  it('shows empty state when topic not found', () => {
    mockUseTopicProgress.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('topic-detail-empty')).toBeTruthy();
    expect(screen.getByText('Topic not found')).toBeTruthy();
  });

  it('shows missing params state', () => {
    useLocalSearchParams.mockReturnValue({});
    mockUseTopicProgress.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    // Component renders an error state when route params are missing
    expect(screen.getByTestId('topic-detail-missing-params-back')).toBeTruthy();
    expect(screen.getByText('Topic not found')).toBeTruthy();
  });

  it('shows retry and go-back buttons when retention query errors [3B.6]', () => {
    const mockRefetchProgress = jest.fn().mockResolvedValue(undefined);
    const mockRefetchRetention = jest.fn().mockResolvedValue(undefined);

    mockUseTopicProgress.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: mockRefetchProgress,
    });
    mockUseTopicRetention.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchRetention,
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    // Full-screen error state must render with both actions so user is never stuck
    expect(screen.getByTestId('topic-detail-retry')).toBeTruthy();
    expect(screen.getByTestId('topic-detail-go-back')).toBeTruthy();
    expect(screen.getByText("We couldn't load this topic")).toBeTruthy();

    fireEvent.press(screen.getByTestId('topic-detail-retry'));
    expect(mockRefetchProgress).toHaveBeenCalled();
    expect(mockRefetchRetention).toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('topic-detail-go-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders topic progress and retention details', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Algebra Basics',
        description: 'Introduction to algebraic expressions',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: 0.85,
        summaryExcerpt: 'Learned about variables and equations',
        xpStatus: 'verified',
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({
      data: {
        topicId: 'topic-1',
        easeFactor: 2.7,
        intervalDays: 14,
        repetitions: 5,
        nextReviewAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
        xpStatus: 'verified',
        failureCount: 0,
      },
      isLoading: false,
    });
    mockUseTopicParkingLot.mockReturnValue({
      data: [
        {
          id: 'parked-1',
          question: 'Why does factoring help here?',
          explored: false,
          createdAt: '2026-02-15T10:00:00.000Z',
        },
      ],
      isLoading: false,
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Algebra Basics')).toBeTruthy();
    expect(
      screen.getByText('Introduction to algebraic expressions')
    ).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('Thriving')).toBeTruthy();
    expect(screen.getByText('14 days')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(
      screen.getByText('Learned about variables and equations')
    ).toBeTruthy();
    expect(screen.getByText('Parking Lot')).toBeTruthy();
    expect(screen.getByText('Why does factoring help here?')).toBeTruthy();
  });

  it('shows struggle status when not normal', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Calculus',
        description: 'Derivatives and integrals',
        completionStatus: 'in_progress',
        retentionStatus: 'weak',
        struggleStatus: 'needs_deepening',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Exploring further')).toBeTruthy();
  });

  it('navigates back on back button press', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Algebra',
        description: '',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('topic-detail-back'));

    expect(mockBack).toHaveBeenCalled();
  });

  it('navigates to review session on Start Review press', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Algebra',
        description: '',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('start-review-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'practice',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicName: 'Algebra',
      },
    });
  });

  it('navigates to assessment on Request Re-test press', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Algebra',
        description: '',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('request-retest-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/recall-test',
      params: { subjectId: 'sub-1', topicId: 'topic-1' },
    });
  });

  it('shows "Start Learning" button for not_started topics', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'New Topic',
        description: '',
        completionStatus: 'not_started',
        retentionStatus: 'weak',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('start-learning-button')).toBeTruthy();
    expect(screen.getByText('Start Learning')).toBeTruthy();
    expect(screen.queryByTestId('continue-learning-button')).toBeNull();
    expect(screen.queryByTestId('start-review-button')).toBeNull();
  });

  it('navigates to freeform session on Start Learning press for not_started', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'New Topic',
        description: '',
        completionStatus: 'not_started',
        retentionStatus: 'weak',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('start-learning-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'freeform',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicName: 'New Topic',
      },
    });
  });

  it('shows primary "Continue Learning" + secondary "Start Review" for in_progress topics', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Calculus',
        description: '',
        completionStatus: 'in_progress',
        retentionStatus: 'weak',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('continue-learning-button')).toBeTruthy();
    expect(screen.getByText('Continue Learning')).toBeTruthy();
    expect(screen.getByTestId('start-review-button')).toBeTruthy();
    expect(screen.getByText('Start Review Session')).toBeTruthy();
  });

  it('navigates to freeform session on Continue Learning press for in_progress', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Calculus',
        description: '',
        completionStatus: 'in_progress',
        retentionStatus: 'weak',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('continue-learning-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'freeform',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicName: 'Calculus',
      },
    });
  });

  it('includes sessionId in Continue Learning navigation when active session exists [F-4]', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Calculus',
        description: '',
        completionStatus: 'in_progress',
        retentionStatus: 'weak',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });
    mockUseActiveSessionForTopic.mockReturnValue({
      data: { sessionId: 'active-session-123' },
      isLoading: false,
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('continue-learning-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'freeform',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicName: 'Calculus',
        sessionId: 'active-session-123',
      },
    });
  });

  it('shows primary "Start Review" + secondary "Continue Learning" for completed topics', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Algebra',
        description: '',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('start-review-button')).toBeTruthy();
    expect(screen.getByTestId('continue-learning-button')).toBeTruthy();
    expect(screen.getByText('Continue Learning')).toBeTruthy();
  });

  it('navigates to freeform session on Continue Learning press for completed topic', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Algebra',
        description: '',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('continue-learning-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'freeform',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicName: 'Algebra',
      },
    });
  });

  it('navigates to relearn page on Relearn press', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Algebra',
        description: '',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'needs_deepening',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('relearn-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: { subjectId: 'sub-1', topicId: 'topic-1' },
    });
  });

  // -------------------------------------------------------------------------
  // BUG-364: Gap-fill tests — error Go Home, failureCount relearn, empty parking lot
  // -------------------------------------------------------------------------

  it('navigates home on "Go Home" button in error state', () => {
    const mockReplace = jest.fn();
    const routerModule = require('expo-router') as {
      useRouter: () => Record<string, jest.Mock>;
    };
    // Temporarily override the mock to capture replace
    jest.spyOn(routerModule, 'useRouter').mockReturnValue({
      back: mockBack,
      push: mockPush,
      canGoBack: jest.fn(() => true),
      replace: mockReplace,
    });

    mockUseTopicProgress.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });
    mockUseTopicRetention.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('topic-detail-go-home')).toBeTruthy();
    fireEvent.press(screen.getByTestId('topic-detail-go-home'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });

  it('shows Relearn button when failureCount >= 3 (even without needs_deepening)', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Trigonometry',
        description: '',
        completionStatus: 'completed',
        retentionStatus: 'weak',
        struggleStatus: 'normal',
        masteryScore: 0.4,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({
      data: {
        topicId: 'topic-1',
        easeFactor: 2.0,
        intervalDays: 3,
        repetitions: 2,
        nextReviewAt: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        xpStatus: null,
        failureCount: 4,
      },
      isLoading: false,
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('relearn-button')).toBeTruthy();
    // With failureCount >= 3, the retest button shows "Review and Re-test" variant
    expect(screen.getByText('Review and Re-test')).toBeTruthy();
  });

  it('shows empty parking lot message when no items exist', () => {
    mockUseTopicProgress.mockReturnValue({
      data: {
        topicId: 'topic-1',
        title: 'Chemistry',
        description: '',
        completionStatus: 'completed',
        retentionStatus: 'strong',
        struggleStatus: 'normal',
        masteryScore: null,
        summaryExcerpt: null,
        xpStatus: null,
      },
      isLoading: false,
    });
    mockUseTopicRetention.mockReturnValue({ data: null, isLoading: false });
    mockUseTopicParkingLot.mockReturnValue({ data: [], isLoading: false });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Parking Lot')).toBeTruthy();
    expect(
      screen.getByText('No parked questions for this topic yet.')
    ).toBeTruthy();
  });

  // 3E.2: Evaluate (Devil's Advocate) entry point
  describe('evaluate challenge button', () => {
    it('shows Challenge button when topic is eligible for evaluate', () => {
      mockUseTopicProgress.mockReturnValue({
        data: {
          topicId: 'topic-1',
          title: 'Strong Topic',
          completionStatus: 'stable',
          retentionStatus: 'strong',
          struggleStatus: 'normal',
          masteryScore: 0.9,
          summaryExcerpt: null,
          xpStatus: 'verified',
        },
        isLoading: false,
      });
      mockUseTopicRetention.mockReturnValue({
        data: {
          topicId: 'topic-1',
          easeFactor: 2.7,
          intervalDays: 14,
          repetitions: 5,
          nextReviewAt: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
          lastReviewedAt: null,
          xpStatus: 'verified',
          failureCount: 0,
        },
        isLoading: false,
      });
      mockUseEvaluateEligibility.mockReturnValue({
        data: {
          eligible: true,
          topicId: 'topic-1',
          topicTitle: 'Strong Topic',
          currentRung: 2,
          easeFactor: 2.7,
          repetitions: 5,
        },
        isLoading: false,
      });
      mockUseTopicParkingLot.mockReturnValue({ data: [], isLoading: false });

      render(<TopicDetailScreen />, { wrapper: createWrapper() });

      expect(screen.getByTestId('evaluate-challenge-button')).toBeTruthy();
      expect(screen.getByText('Challenge yourself')).toBeTruthy();
      expect(screen.getByText(/rung 2\/4/)).toBeTruthy();
    });

    it('hides Challenge button when not eligible', () => {
      mockUseTopicProgress.mockReturnValue({
        data: {
          topicId: 'topic-1',
          title: 'Weak Topic',
          completionStatus: 'in_progress',
          retentionStatus: 'weak',
          struggleStatus: 'normal',
          masteryScore: 0.3,
          summaryExcerpt: null,
          xpStatus: 'pending',
        },
        isLoading: false,
      });
      mockUseTopicRetention.mockReturnValue({
        data: {
          topicId: 'topic-1',
          easeFactor: 2.0,
          intervalDays: 1,
          repetitions: 0,
          nextReviewAt: null,
          lastReviewedAt: null,
          xpStatus: 'pending',
          failureCount: 0,
        },
        isLoading: false,
      });
      mockUseEvaluateEligibility.mockReturnValue({
        data: { eligible: false, reason: 'Not strong enough' },
        isLoading: false,
      });
      mockUseTopicParkingLot.mockReturnValue({ data: [], isLoading: false });

      render(<TopicDetailScreen />, { wrapper: createWrapper() });

      expect(screen.queryByTestId('evaluate-challenge-button')).toBeNull();
    });
  });

  // 3E.1: Teach-back entry point
  describe('teach-back button', () => {
    it('shows Teach it back button when retention is strong enough', () => {
      mockUseTopicProgress.mockReturnValue({
        data: {
          topicId: 'topic-1',
          title: 'Teachable Topic',
          completionStatus: 'completed',
          retentionStatus: 'strong',
          struggleStatus: 'normal',
          masteryScore: 0.8,
          summaryExcerpt: null,
          xpStatus: 'verified',
        },
        isLoading: false,
      });
      mockUseTopicRetention.mockReturnValue({
        data: {
          topicId: 'topic-1',
          easeFactor: 2.5,
          intervalDays: 10,
          repetitions: 3,
          nextReviewAt: null,
          lastReviewedAt: null,
          xpStatus: 'verified',
          failureCount: 0,
        },
        isLoading: false,
      });
      mockUseTopicParkingLot.mockReturnValue({ data: [], isLoading: false });

      render(<TopicDetailScreen />, { wrapper: createWrapper() });

      expect(screen.getByTestId('teach-back-button')).toBeTruthy();
      expect(screen.getByText('Teach it back')).toBeTruthy();
    });

    it('hides Teach it back when ease factor is too low', () => {
      mockUseTopicProgress.mockReturnValue({
        data: {
          topicId: 'topic-1',
          title: 'New Topic',
          completionStatus: 'in_progress',
          retentionStatus: 'weak',
          struggleStatus: 'normal',
          masteryScore: null,
          summaryExcerpt: null,
          xpStatus: 'pending',
        },
        isLoading: false,
      });
      mockUseTopicRetention.mockReturnValue({
        data: {
          topicId: 'topic-1',
          easeFactor: 2.0,
          intervalDays: 1,
          repetitions: 0,
          nextReviewAt: null,
          lastReviewedAt: null,
          xpStatus: 'pending',
          failureCount: 0,
        },
        isLoading: false,
      });
      mockUseTopicParkingLot.mockReturnValue({ data: [], isLoading: false });

      render(<TopicDetailScreen />, { wrapper: createWrapper() });

      expect(screen.queryByTestId('teach-back-button')).toBeNull();
    });
  });

  // FR90: Knowledge decay visualization
  describe('DecayBar', () => {
    it('shows decay bar when retention card has lastReviewedAt', () => {
      mockUseTopicProgress.mockReturnValue({
        data: {
          topicId: 'topic-1',
          title: 'Decay Test',
          completionStatus: 'completed',
          retentionStatus: 'strong',
          struggleStatus: 'normal',
          masteryScore: 0.8,
          summaryExcerpt: null,
          xpStatus: 'verified',
        },
        isLoading: false,
      });
      mockUseTopicRetention.mockReturnValue({
        data: {
          topicId: 'topic-1',
          easeFactor: 2.5,
          intervalDays: 10,
          repetitions: 3,
          nextReviewAt: new Date(
            Date.now() + 5 * 24 * 60 * 60 * 1000
          ).toISOString(),
          lastReviewedAt: new Date(
            Date.now() - 5 * 24 * 60 * 60 * 1000
          ).toISOString(),
          xpStatus: 'verified',
          failureCount: 0,
        },
        isLoading: false,
      });
      mockUseTopicParkingLot.mockReturnValue({ data: [], isLoading: false });

      render(<TopicDetailScreen />, { wrapper: createWrapper() });

      expect(screen.getByTestId('decay-bar')).toBeTruthy();
      expect(screen.getByText('Memory decay')).toBeTruthy();
      expect(screen.getByText('5 days left')).toBeTruthy();
    });

    it('shows "Due for review" when interval has elapsed', () => {
      mockUseTopicProgress.mockReturnValue({
        data: {
          topicId: 'topic-1',
          title: 'Overdue Topic',
          completionStatus: 'completed',
          retentionStatus: 'weak',
          struggleStatus: 'normal',
          masteryScore: 0.6,
          summaryExcerpt: null,
          xpStatus: 'pending',
        },
        isLoading: false,
      });
      mockUseTopicRetention.mockReturnValue({
        data: {
          topicId: 'topic-1',
          easeFactor: 2.5,
          intervalDays: 7,
          repetitions: 2,
          nextReviewAt: new Date(
            Date.now() - 2 * 24 * 60 * 60 * 1000
          ).toISOString(),
          lastReviewedAt: new Date(
            Date.now() - 9 * 24 * 60 * 60 * 1000
          ).toISOString(),
          xpStatus: 'pending',
          failureCount: 0,
        },
        isLoading: false,
      });
      mockUseTopicParkingLot.mockReturnValue({ data: [], isLoading: false });

      render(<TopicDetailScreen />, { wrapper: createWrapper() });

      expect(screen.getByTestId('decay-bar')).toBeTruthy();
      expect(screen.getByText('Due for review')).toBeTruthy();
    });

    it('does not show decay bar when lastReviewedAt is null', () => {
      mockUseTopicProgress.mockReturnValue({
        data: {
          topicId: 'topic-1',
          title: 'New Topic',
          completionStatus: 'in_progress',
          retentionStatus: 'weak',
          struggleStatus: 'normal',
          masteryScore: null,
          summaryExcerpt: null,
          xpStatus: 'pending',
        },
        isLoading: false,
      });
      mockUseTopicRetention.mockReturnValue({
        data: {
          topicId: 'topic-1',
          easeFactor: 2.5,
          intervalDays: 1,
          repetitions: 0,
          nextReviewAt: null,
          lastReviewedAt: null,
          xpStatus: 'pending',
          failureCount: 0,
        },
        isLoading: false,
      });
      mockUseTopicParkingLot.mockReturnValue({ data: [], isLoading: false });

      render(<TopicDetailScreen />, { wrapper: createWrapper() });

      expect(screen.queryByTestId('decay-bar')).toBeNull();
    });
  });
});
