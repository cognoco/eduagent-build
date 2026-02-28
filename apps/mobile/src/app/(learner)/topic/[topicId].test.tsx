import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseTopicProgress = jest.fn();
const mockUseTopicRetention = jest.fn();

jest.mock('../../../hooks/use-progress', () => ({
  useTopicProgress: (...args: unknown[]) => mockUseTopicProgress(...args),
}));

jest.mock('../../../hooks/use-retention', () => ({
  useTopicRetention: (...args: unknown[]) => mockUseTopicRetention(...args),
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

    expect(screen.getByText('No topic selected')).toBeTruthy();
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
        nextReviewAt: '2026-03-01T00:00:00Z',
        xpStatus: 'verified',
        failureCount: 0,
      },
      isLoading: false,
    });

    render(<TopicDetailScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Algebra Basics')).toBeTruthy();
    expect(
      screen.getByText('Introduction to algebraic expressions')
    ).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('Strong')).toBeTruthy();
    expect(screen.getByText('14 days')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(
      screen.getByText('Learned about variables and equations')
    ).toBeTruthy();
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
      pathname: '/(learner)/session',
      params: { mode: 'practice', subjectId: 'sub-1', topicId: 'topic-1' },
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
      pathname: '/(learner)/topic/recall-test',
      params: { subjectId: 'sub-1', topicId: 'topic-1' },
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
      pathname: '/(learner)/topic/relearn',
      params: { subjectId: 'sub-1', topicId: 'topic-1' },
    });
  });
});
