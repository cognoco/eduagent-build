import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockUseSubjects = jest.fn();
const mockUseOverallProgress = jest.fn();
const mockUseAllBooks = jest.fn();
const mockUseNoteTopicIds = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => mockUseSubjects(),
  useUpdateSubject: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../hooks/use-progress', () => ({
  useOverallProgress: () => mockUseOverallProgress(),
}));

jest.mock('../../hooks/use-all-books', () => ({
  useAllBooks: () => mockUseAllBooks(),
}));

jest.mock('../../hooks/use-notes', () => ({
  useNoteTopicIds: () => mockUseNoteTopicIds(),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return { ...actual, useQueries: jest.fn() };
});

jest.mock('../../components/progress', () => ({
  RetentionSignal: ({ status }: { status: string }) => {
    const { Text } = require('react-native');
    return <Text>{status}</Text>;
  },
}));

jest.mock('../../components/common', () => ({
  BookPageFlipAnimation: () => null,
  BrandCelebration: () => null,
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ accent: '#2563eb' }),
}));

jest.mock('../../lib/api-client', () => ({
  useApiClient: () => ({
    subjects: {
      ':subjectId': {
        retention: {
          $get: jest.fn(),
        },
      },
    },
  }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'profile-1', isOwner: true },
    profiles: [{ id: 'profile-1', isOwner: true }],
  }),
  isGuardianProfile: () => false,
}));

const { useQueries: mockUseQueries } = require('@tanstack/react-query') as {
  useQueries: jest.Mock;
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const LibraryScreen = require('./library').default;

describe('LibraryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQueries.mockReturnValue([]);
    mockUseAllBooks.mockReturnValue({
      books: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseNoteTopicIds.mockReturnValue({
      data: { topicIds: [] },
      isLoading: false,
    });
  });

  it('shows loading state', () => {
    mockUseSubjects.mockReturnValue({ data: undefined, isLoading: true });
    mockUseOverallProgress.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<LibraryScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('library-loading')).toBeTruthy();
  });

  it('shows empty state when there are no subjects', () => {
    mockUseSubjects.mockReturnValue({ data: [], isLoading: false });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });

    render(<LibraryScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('library-no-content')).toBeTruthy();
    expect(
      screen.getByText('Add a subject to start building your library')
    ).toBeTruthy();
  });

  it('renders subject cards as shelves by default', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'History', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: {
        subjects: [
          {
            subjectId: 'sub-1',
            name: 'History',
            topicsTotal: 12,
            topicsCompleted: 3,
            topicsVerified: 1,
            urgencyScore: 0,
            retentionStatus: 'fading',
            lastSessionAt: null,
          },
        ],
        totalTopicsCompleted: 3,
        totalTopicsVerified: 1,
      },
      isLoading: false,
    });

    render(<LibraryScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('subject-card-sub-1')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('3/12 topics')).toBeTruthy();
  });

  it('shows all topics view when the topics tab is pressed', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });
    mockUseQueries.mockReturnValue([
      {
        data: {
          topics: [
            {
              topicId: 'topic-1',
              topicTitle: 'Fractions',
              easeFactor: 2.5,
              repetitions: 2,
              lastReviewedAt: null,
              nextReviewAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
              xpStatus: 'verified',
              failureCount: 0,
            },
          ],
          reviewDueCount: 0,
        },
        isLoading: false,
      },
    ]);

    render(<LibraryScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('library-tab-topics'));

    expect(screen.getByTestId('topic-row-topic-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('topic-row-topic-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicName: 'Fractions',
      },
    });
  });

  it('navigates to shelf route when a subject is pressed', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'History', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [], totalTopicsCompleted: 0, totalTopicsVerified: 0 },
      isLoading: false,
    });

    render(<LibraryScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('subject-card-sub-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  it('renders three tab badges with counts', () => {
    mockUseSubjects.mockReturnValue({
      data: [
        { id: 'sub-1', name: 'Math', status: 'active' },
        { id: 'sub-2', name: 'History', status: 'active' },
      ],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [] },
      isLoading: false,
    });
    mockUseQueries.mockReturnValue([
      {
        data: {
          topics: [
            {
              topicId: 't1',
              topicTitle: 'A',
              easeFactor: 2.5,
              repetitions: 1,
              lastReviewedAt: null,
              xpStatus: 'pending',
              failureCount: 0,
            },
          ],
          reviewDueCount: 0,
        },
        isLoading: false,
      },
      {
        data: { topics: [], reviewDueCount: 0 },
        isLoading: false,
      },
    ]);
    mockUseAllBooks.mockReturnValue({
      books: [
        {
          book: {
            id: 'book-1',
            subjectId: 'sub-1',
            title: 'Algebra',
            description: null,
            emoji: null,
            sortOrder: 1,
            topicsGenerated: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          subjectId: 'sub-1',
          subjectName: 'Math',
          topicCount: 5,
          completedCount: 2,
          status: 'IN_PROGRESS',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<LibraryScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('library-tab-shelves')).toBeTruthy();
    expect(screen.getByTestId('library-tab-books')).toBeTruthy();
    expect(screen.getByTestId('library-tab-topics')).toBeTruthy();
    expect(screen.getByText('Shelves (2)')).toBeTruthy();
    expect(screen.getByText('Books (1)')).toBeTruthy();
    expect(screen.getByText('Topics')).toBeTruthy();
  });

  it('shows review urgency on the topics tab and matching shelf card', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: {
        subjects: [
          {
            subjectId: 'sub-1',
            name: 'Math',
            topicsTotal: 5,
            topicsCompleted: 2,
            topicsVerified: 1,
            urgencyScore: 0,
            retentionStatus: 'fading',
            lastSessionAt: null,
          },
        ],
        totalTopicsCompleted: 2,
        totalTopicsVerified: 1,
      },
      isLoading: false,
    });
    mockUseQueries.mockReturnValue([
      {
        data: {
          topics: [],
          reviewDueCount: 4,
        },
        isLoading: false,
      },
    ]);

    render(<LibraryScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('library-tab-topics-review-badge')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('4 to review')).toBeTruthy();
  });

  it('shows books tab with all books across subjects', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [] },
      isLoading: false,
    });
    mockUseAllBooks.mockReturnValue({
      books: [
        {
          book: {
            id: 'book-1',
            subjectId: 'sub-1',
            title: 'Algebra',
            description: null,
            emoji: null,
            sortOrder: 1,
            topicsGenerated: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          subjectId: 'sub-1',
          subjectName: 'Math',
          topicCount: 5,
          completedCount: 2,
          status: 'IN_PROGRESS',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<LibraryScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('library-tab-books'));

    expect(screen.getByText('Algebra')).toBeTruthy();
    expect(screen.getByText('Math')).toBeTruthy();
  });

  it('navigates to book route when a book is pressed from books tab', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [] },
      isLoading: false,
    });
    mockUseAllBooks.mockReturnValue({
      books: [
        {
          book: {
            id: 'book-1',
            subjectId: 'sub-1',
            title: 'Algebra',
            description: null,
            emoji: null,
            sortOrder: 1,
            topicsGenerated: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          subjectId: 'sub-1',
          subjectName: 'Math',
          topicCount: 5,
          completedCount: 2,
          status: 'IN_PROGRESS',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<LibraryScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('library-tab-books'));
    fireEvent.press(screen.getByTestId('book-card-book-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
      params: { subjectId: 'sub-1', bookId: 'book-1' },
    });
  });

  // -----------------------------------------------------------------------
  // BUG-82: allBooksQuery failure is non-fatal — library still renders [BUG-82]
  // Previously allBooksQuery.isError triggered a full-page error state.
  // Now book-fetch errors are non-fatal: subjects/progress errors block the
  // view, but a book-fetch failure only degrades the Books tab gracefully.
  // -----------------------------------------------------------------------
  it('does not show full-page error when only allBooksQuery fails', () => {
    mockUseSubjects.mockReturnValue({
      data: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseOverallProgress.mockReturnValue({
      data: { subjects: [] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseAllBooks.mockReturnValue({
      books: [],
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });

    render(<LibraryScreen />, { wrapper: createWrapper() });

    // Library renders normally — tabs and header are visible
    expect(screen.queryByTestId('library-error')).toBeNull();
    expect(screen.getByTestId('library-tab-shelves')).toBeTruthy();
  });
});
