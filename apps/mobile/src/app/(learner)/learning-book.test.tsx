import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseSubjects = jest.fn();
jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => mockUseSubjects(),
}));

const mockUseOverallProgress = jest.fn();
jest.mock('../../hooks/use-progress', () => ({
  useOverallProgress: () => mockUseOverallProgress(),
}));

const mockUseRetentionTopics = jest.fn();
jest.mock('../../hooks/use-retention', () => ({
  useRetentionTopics: () => mockUseRetentionTopics(),
}));

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

const LearningBookScreen = require('./learning-book').default;

describe('LearningBookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRetentionTopics.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
  });

  it('shows loading state', () => {
    mockUseSubjects.mockReturnValue({ data: undefined, isLoading: true });
    mockUseOverallProgress.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<LearningBookScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('learning-book-loading')).toBeTruthy();
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows empty state when no topics', () => {
    mockUseSubjects.mockReturnValue({ data: [], isLoading: false });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });

    render(<LearningBookScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('learning-book-empty')).toBeTruthy();
    expect(
      screen.getByText('No topics yet — add a subject to get started')
    ).toBeTruthy();
  });

  it('renders topics with retention signals', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: {
        subjects: [
          { subjectId: 'sub-1', name: 'Math', retentionStatus: 'fading' },
        ],
        totalTopicsCompleted: 1,
        totalTopicsVerified: 0,
      },
      isLoading: false,
    });
    mockUseRetentionTopics.mockReturnValue({
      data: {
        topics: [
          {
            topicId: 'topic-1',
            easeFactor: 2.5,
            intervalDays: 7,
            repetitions: 3,
            nextReviewAt: '2026-02-25T00:00:00Z',
            xpStatus: 'verified',
            failureCount: 0,
          },
        ],
        reviewDueCount: 0,
      },
      isLoading: false,
    });

    render(<LearningBookScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('topic-row-topic-1')).toBeTruthy();
    expect(screen.getByText('Math')).toBeTruthy();
    expect(screen.getByText('Strong')).toBeTruthy();
  });

  it('navigates to topic detail on topic press', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });
    mockUseRetentionTopics.mockReturnValue({
      data: {
        topics: [
          {
            topicId: 'topic-1',
            easeFactor: 1.5,
            intervalDays: 1,
            repetitions: 1,
            nextReviewAt: null,
            xpStatus: 'pending',
            failureCount: 0,
          },
        ],
        reviewDueCount: 0,
      },
      isLoading: false,
    });

    render(<LearningBookScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('topic-row-topic-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(learner)/topic-detail',
      params: { subjectId: 'sub-1', topicId: 'topic-1' },
    });
  });

  it('shows subject filter tabs when multiple subjects exist', () => {
    mockUseSubjects.mockReturnValue({
      data: [
        { id: 'sub-1', name: 'Math', status: 'active' },
        { id: 'sub-2', name: 'Science', status: 'active' },
      ],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });

    render(<LearningBookScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('subject-filter-tabs')).toBeTruthy();
    expect(screen.getByTestId('filter-all')).toBeTruthy();
    expect(screen.getByTestId('filter-sub-1')).toBeTruthy();
    expect(screen.getByTestId('filter-sub-2')).toBeTruthy();
  });

  it('filters topics when subject tab is pressed', () => {
    mockUseSubjects.mockReturnValue({
      data: [
        { id: 'sub-1', name: 'Math', status: 'active' },
        { id: 'sub-2', name: 'Science', status: 'active' },
      ],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });
    // Return topics for the first subject only (mock is called for all subjects)
    let callCount = 0;
    mockUseRetentionTopics.mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return {
          data: {
            topics: [
              {
                topicId: 'topic-1',
                easeFactor: 2.5,
                intervalDays: 7,
                repetitions: 3,
                nextReviewAt: null,
                xpStatus: 'verified',
                failureCount: 0,
              },
            ],
            reviewDueCount: 0,
          },
          isLoading: false,
        };
      }
      return { data: { topics: [], reviewDueCount: 0 }, isLoading: false };
    });

    render(<LearningBookScreen />, { wrapper: createWrapper() });

    // Initially shows all topics
    expect(screen.getByTestId('topic-row-topic-1')).toBeTruthy();

    // Press Science filter — topic-1 belongs to Math (sub-1), should be filtered out
    fireEvent.press(screen.getByTestId('filter-sub-2'));

    expect(screen.queryByTestId('topic-row-topic-1')).toBeNull();
  });
});
