import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Sentry from '@sentry/react-native';
import BookScreen from './[bookId]';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  'react-i18next',
  () => require('../../../../../test-utils/mock-i18n').i18nMock,
);

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams(),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

let mockSearchParams = () => ({
  subjectId: 'sub-1',
  bookId: 'book-1',
});

const mockBookRefetch = jest.fn();
const mockGenerateMutate = jest.fn();

const mockUseBookWithTopics = jest.fn();
const mockUseGenerateBookTopics = jest.fn();
const mockUseBooks = jest.fn();
const mockUseBookSessions = jest.fn();
const mockUseBookNotes = jest.fn();
const mockUseRetentionTopics = jest.fn();
const mockUseCurriculum = jest.fn();
const mockUseLearningResumeTarget = jest.fn();
const mockStartFirstCurriculumMutateAsync = jest.fn();

jest.mock('../../../../../hooks/use-books', () => ({
  useBookWithTopics: () => mockUseBookWithTopics(),
  useBooks: () => mockUseBooks(),
  useGenerateBookTopics: () => mockUseGenerateBookTopics(),
}));

jest.mock('../../../../../hooks/use-book-sessions', () => ({
  useBookSessions: () => mockUseBookSessions(),
}));

jest.mock('../../../../../hooks/use-notes', () => ({
  useBookNotes: () => mockUseBookNotes(),
  useCreateNote: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateNote: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteNoteById: () => ({ mutate: jest.fn() }),
}));

jest.mock('../../../../../hooks/use-retention', () => ({
  useRetentionTopics: () => mockUseRetentionTopics(),
}));

jest.mock('../../../../../hooks/use-curriculum', () => ({
  useCurriculum: () => mockUseCurriculum(),
}));

jest.mock('../../../../../hooks/use-progress', () => ({
  useLearningResumeTarget: () => mockUseLearningResumeTarget(),
}));

jest.mock(
  '../../../../../hooks/use-sessions',
  /* gc1-allow: session mutation state */ () => ({
    useStartFirstCurriculumSession: () => ({
      mutateAsync: mockStartFirstCurriculumMutateAsync,
      isPending: false,
    }),
  }),
);

jest.mock('../../../../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: [{ id: 'sub-1', name: 'Mathematics' }],
  }),
}));

jest.mock('../../../../../hooks/use-move-topic', () => ({
  useMoveTopic: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../../../../../lib/theme', () => ({
  useThemeColors: () => ({
    accent: '#00bfa5',
    primary: '#0d9488',
    success: '#22c55e',
    danger: '#ef4444',
    textSecondary: '#888',
    textInverse: '#fff',
    surface: '#fff',
  }),
}));

jest.mock('../../../../../lib/format-api-error', () => ({
  formatApiError: (error: unknown) =>
    error instanceof Error ? error.message : 'Unknown error',
}));

jest.mock('../../../../../components/common', () => ({
  BookPageFlipAnimation: () => null,
  MagicPenAnimation: () => null,
  CelebrationAnimation: () => null,
}));

function makeTopic(overrides: Partial<any> = {}) {
  return {
    id: 'topic-1',
    title: 'Linear Equations',
    sortOrder: 1,
    skipped: false,
    chapter: null,
    ...overrides,
  };
}

function baseTopics() {
  return [
    makeTopic({
      id: 'topic-1',
      title: 'Linear Equations',
      sortOrder: 1,
      chapter: 'Foundations',
    }),
    makeTopic({
      id: 'topic-2',
      title: 'Quadratic Equations',
      sortOrder: 2,
      chapter: 'Foundations',
    }),
  ];
}

function makeSession(overrides: Partial<any> = {}) {
  return {
    id: 'sess-1',
    topicId: 'topic-1',
    topicTitle: 'Linear Equations',
    chapter: 'Foundations',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRetentionTopic(overrides: Partial<any> = {}) {
  return {
    topicId: 'topic-1',
    repetitions: 1,
    easeFactor: 2.5,
    xpStatus: 'active',
    failureCount: 0,
    nextReviewAt: null,
    daysSinceLastReview: null,
    ...overrides,
  };
}

function makeBookQuery(overrides: Partial<any> = {}) {
  return {
    data: {
      book: {
        id: 'book-1',
        title: 'Algebra',
        emoji: '📐',
        topicsGenerated: true,
        description: 'Basic algebra',
      },
      topics: baseTopics(),
      completedTopicCount: 0,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockBookRefetch,
    ...overrides,
  };
}

function makeSessionsQuery(overrides: Partial<any> = {}) {
  return {
    data: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  };
}

function makeNotesQuery(overrides: Partial<any> = {}) {
  return {
    data: { notes: [] },
    isLoading: false,
    ...overrides,
  };
}

function makeRetentionQuery(overrides: Partial<any> = {}) {
  return {
    data: { topics: [], reviewDueCount: 0 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  };
}

describe('BookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockSearchParams = () => ({
      subjectId: 'sub-1',
      bookId: 'book-1',
    });

    mockUseBookWithTopics.mockReturnValue(makeBookQuery());
    mockUseGenerateBookTopics.mockReturnValue({
      mutate: mockGenerateMutate,
      isPending: false,
    });
    mockUseBooks.mockReturnValue({
      data: [
        { id: 'book-1', title: 'Algebra', emoji: '📐', topicsGenerated: true },
        { id: 'book-2', title: 'Geometry', emoji: '📏', topicsGenerated: true },
      ],
      isLoading: false,
    });
    mockUseBookSessions.mockReturnValue(makeSessionsQuery());
    mockUseBookNotes.mockReturnValue(makeNotesQuery());
    mockUseRetentionTopics.mockReturnValue(makeRetentionQuery());
    mockUseCurriculum.mockReturnValue({ data: null, isLoading: false });
    mockUseLearningResumeTarget.mockReturnValue({ data: null });
    mockStartFirstCurriculumMutateAsync.mockResolvedValue({
      session: { id: 'session-1', topicId: 'topic-1' },
    });
  });

  it('renders the loading state', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: undefined,
        isLoading: true,
      }),
    );

    const { getByTestId } = render(<BookScreen />);

    // New book screen shows a shimmer skeleton during loading, not a text label
    getByTestId('book-loading');
  });

  it('shows the error state and wires retry plus back', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: undefined,
        isError: true,
        error: new Error('Server exploded'),
      }),
    );

    const { getByTestId, getByText } = render(<BookScreen />);

    getByTestId('book-error');
    getByText('Server exploded');

    fireEvent.press(getByTestId('book-retry-button'));
    fireEvent.press(getByTestId('book-back-button'));

    expect(mockBookRefetch).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  it('shows missing-param guidance when route params are incomplete', () => {
    mockSearchParams = () => ({ subjectId: '', bookId: 'book-1' });

    const { getByTestId, getByText } = render(<BookScreen />);

    getByTestId('book-missing-param');
    expect(
      getByText('Missing book details. Please go back and try again.'),
    ).toBeTruthy();
  });

  it('[BUG-636 / M-4] missing-param "Go back" button navigates somewhere instead of being a silent no-op', () => {
    // Before the fix, handleBack early-returned when subjectId was missing,
    // leaving the user trapped on the error screen with a button that did
    // nothing.
    mockSearchParams = () => ({ subjectId: '', bookId: 'book-1' });
    mockCanGoBack.mockReturnValue(false);

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-missing-param-back'));

    // Either back() or replace() must have been invoked — anything other than
    // a silent no-op. With canGoBack=false (deep-link entry), goBackOrReplace
    // falls back to /(app)/library.
    const totalNavCalls =
      mockBack.mock.calls.length + mockReplace.mock.calls.length;
    expect(totalNavCalls).toBeGreaterThan(0);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('[BUG-798 / F-NAV-05] missing bookId only — fallback navigates to subject shelf', () => {
    // Symmetry test for BUG-798: the missing-param guard is `!subjectId ||
    // !bookId`, but handleBack branches on subjectId. When ONLY bookId is
    // missing (subjectId still present), the user must reach the subject
    // shelf, not be left stranded. The previous bug report flagged that
    // bookId was "not equally guarded" — this locks the symmetric path.
    mockSearchParams = () => ({ subjectId: 'sub-1', bookId: '' });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-missing-param-back'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  it('[BUG-798 / F-NAV-05] missing both params — fallback to library, never silent no-op', () => {
    // Worst case: deep link drops both segments. Must still escape to a
    // working surface (library), not the dreaded silent dead-end.
    mockSearchParams = () => ({ subjectId: '', bookId: '' });
    mockCanGoBack.mockReturnValue(false);

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-missing-param-back'));

    const totalNavCalls =
      mockBack.mock.calls.length + mockReplace.mock.calls.length;
    expect(totalNavCalls).toBeGreaterThan(0);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('renders the compact header on the main view', () => {
    const { getByTestId, getByText } = render(<BookScreen />);

    // New book screen: compact header shows book title and topics progress.
    // Subject name and session count are no longer in the header — these were
    // removed during the Library v3 redesign.
    getByTestId('book-screen');
    getByText('Algebra');
    getByText('0 of 2 topics finished');
  });

  it('derives header progress from retention topics', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          ...makeBookQuery().data,
          topics: [
            makeTopic({ id: 'topic-1', title: 'T1', sortOrder: 1 }),
            makeTopic({ id: 'topic-2', title: 'T2', sortOrder: 2 }),
            makeTopic({ id: 'topic-3', title: 'T3', sortOrder: 3 }),
          ],
        },
      }),
    );
    mockUseRetentionTopics.mockReturnValue(
      makeRetentionQuery({
        data: {
          topics: [
            makeRetentionTopic({ topicId: 'topic-1' }),
            makeRetentionTopic({ topicId: 'topic-2' }),
          ],
          reviewDueCount: 0,
        },
      }),
    );

    const { getByText } = render(<BookScreen />);

    getByText('2 of 3 topics finished');
  });

  it('shows elapsed retention days in the book header when available', () => {
    mockUseRetentionTopics.mockReturnValue(
      makeRetentionQuery({
        data: {
          topics: [
            makeRetentionTopic({
              topicId: 'topic-1',
              nextReviewAt: '2099-01-01T00:00:00.000Z',
              daysSinceLastReview: 9,
            }),
          ],
          reviewDueCount: 0,
        },
      }),
    );

    const { getByText } = render(<BookScreen />);

    getByText('Remembered after 9 days');
  });

  it('offers to set up a fuller topic list when a book only has one starter topic', async () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          ...makeBookQuery().data,
          book: {
            ...makeBookQuery().data.book,
            title: 'Introduction to Programming',
          },
          topics: [
            makeTopic({
              id: 'topic-1',
              title: 'Introduction to Programming',
              sortOrder: 1,
            }),
          ],
        },
      }),
    );

    const { getByTestId, getByText } = render(<BookScreen />);

    getByTestId('book-thin-path-card');
    getByText('Create a fuller topic list');

    fireEvent.press(getByTestId('book-thin-path-build'));

    await waitFor(() => {
      expect(mockStartFirstCurriculumMutateAsync).toHaveBeenCalledWith({
        bookId: 'book-1',
        sessionType: 'learning',
        inputMode: 'text',
      });
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: 'sub-1',
          bookId: 'book-1',
          sessionId: 'session-1',
          topicId: 'topic-1',
          subjectName: 'Introduction to Programming',
        }),
      });
    });
  });

  it('renders continue now and started from in-progress sessions', () => {
    const topics = [
      makeTopic({ id: 'topic-1', title: 'Linear Equations', sortOrder: 1 }),
      makeTopic({ id: 'topic-2', title: 'Quadratic Equations', sortOrder: 2 }),
      makeTopic({ id: 'topic-3', title: 'Functions', sortOrder: 3 }),
    ];

    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: { ...makeBookQuery().data, topics },
      }),
    );
    mockUseBookSessions.mockReturnValue(
      makeSessionsQuery({
        data: [
          makeSession({
            id: 'sess-1',
            topicId: 'topic-1',
            topicTitle: 'Linear Equations',
            createdAt: '2026-04-24T12:00:00.000Z',
          }),
          makeSession({
            id: 'sess-2',
            topicId: 'topic-2',
            topicTitle: 'Quadratic Equations',
            createdAt: '2026-04-24T10:00:00.000Z',
          }),
          makeSession({
            id: 'sess-3',
            topicId: 'topic-2',
            topicTitle: 'Quadratic Equations',
            createdAt: '2026-04-24T09:00:00.000Z',
          }),
        ],
      }),
    );

    const { getByTestId, queryByTestId, getByText } = render(<BookScreen />);

    // [BUG-895] The "Continue now" in-list row was removed in favour of the
    // sticky "▶ Continue: <title>" CTA at the bottom of the screen. The
    // started topic still surfaces in its own section.
    expect(queryByTestId('continue-now-row')).toBeNull();
    getByTestId('started-row-topic-2');
    getByText('2 sessions');
    // Sticky CTA names the continue topic explicitly.
    getByText('▶ Continue: Linear Equations');

    fireEvent.press(getByTestId('book-start-learning'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/[topicId]',
      params: { topicId: 'topic-1', subjectId: 'sub-1' },
    });
  });

  it('renders all started topics inline without an overflow control', () => {
    // The library-redesign removed the "started" overflow/show-more control.
    // All started topics now render immediately inside the chapter-grouped
    // topic list with no truncation or expand affordance.
    const topics = Array.from({ length: 6 }, (_, index) =>
      makeTopic({
        id: `topic-${index + 1}`,
        title: `Topic ${index + 1}`,
        sortOrder: index + 1,
      }),
    );
    const sessions = topics.map((topic, index) =>
      makeSession({
        id: `sess-${index + 1}`,
        topicId: topic.id,
        topicTitle: topic.title,
        createdAt: `2026-04-24T1${9 - index}:00:00.000Z`,
      }),
    );

    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({ data: { ...makeBookQuery().data, topics } }),
    );
    mockUseBookSessions.mockReturnValue(makeSessionsQuery({ data: sessions }));

    const { getByTestId, queryByTestId } = render(<BookScreen />);

    // No overflow control — all started rows visible immediately
    expect(queryByTestId('started-show-more')).toBeNull();
    // All 6 started topics are rendered inline (topic-6 visible without any expand)
    getByTestId('started-row-topic-6');
  });

  it('renders the hero up-next state on a fresh book and starts a session', () => {
    const { getByTestId, getByText } = render(<BookScreen />);

    getByTestId('up-next-row-topic-1');
    getByText('▶ Start: Linear Equations');

    fireEvent.press(getByTestId('book-start-learning'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'sub-1',
        topicId: 'topic-1',
        topicName: 'Linear Equations',
      },
    });
  });

  it('starts from the shared resume target when available', () => {
    mockUseLearningResumeTarget.mockReturnValue({
      data: {
        subjectId: 'sub-1',
        subjectName: 'Mathematics',
        topicId: 'topic-2',
        topicTitle: 'Quadratic Equations',
        sessionId: null,
        resumeFromSessionId: 'sess-previous',
        resumeKind: 'recent_topic',
        lastActivityAt: '2026-04-24T12:00:00.000Z',
        reason: 'Continue Quadratic Equations',
      },
    });

    const { getByTestId } = render(<BookScreen />);

    fireEvent.press(getByTestId('book-start-learning'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'sub-1',
        subjectName: 'Mathematics',
        topicId: 'topic-2',
        topicName: 'Quadratic Equations',
        resumeFromSessionId: 'sess-previous',
      },
    });
  });

  it('shows the sessions error banner and retries while still rendering retention-driven sections', () => {
    const refetchSpy = jest.fn();

    mockUseBookSessions.mockReturnValue(
      makeSessionsQuery({
        data: undefined,
        isError: true,
        refetch: refetchSpy,
      }),
    );
    mockUseRetentionTopics.mockReturnValue(
      makeRetentionQuery({
        data: {
          topics: [makeRetentionTopic({ topicId: 'topic-1' })],
          reviewDueCount: 0,
        },
      }),
    );

    const { getByTestId } = render(<BookScreen />);

    getByTestId('sessions-error-banner');
    getByTestId('done-row-topic-1');
    getByTestId('up-next-row-topic-2');

    fireEvent.press(getByTestId('sessions-error-retry'));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the retention error banner and retries while keeping session-driven sections visible', () => {
    const refetchSpy = jest.fn();

    mockUseBookSessions.mockReturnValue(
      makeSessionsQuery({
        data: [
          makeSession({ topicId: 'topic-1', topicTitle: 'Linear Equations' }),
        ],
      }),
    );
    mockUseRetentionTopics.mockReturnValue(
      makeRetentionQuery({
        data: undefined,
        isError: true,
        refetch: refetchSpy,
      }),
    );

    const { getByTestId } = render(<BookScreen />);

    getByTestId('retention-error-banner');
    // [BUG-895] continue-now-row removed; the sticky CTA still surfaces a
    // way to resume the topic, so the page stays actionable on retention error.
    getByTestId('book-start-learning');

    fireEvent.press(getByTestId('retention-error-retry'));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it('renders the empty topics state with a setup CTA', async () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          book: {
            id: 'book-1',
            title: 'Algebra',
            emoji: '📐',
            topicsGenerated: true,
            description: 'Basic algebra',
          },
          topics: [],
          completedTopicCount: 0,
        },
      }),
    );

    const { getByTestId, getByText } = render(<BookScreen />);

    getByTestId('topics-empty-state');
    getByText('This book is not ready yet');
    getByText('Set up this book');

    fireEvent.press(getByTestId('topics-empty-build'));
    await waitFor(() => {
      expect(mockStartFirstCurriculumMutateAsync).toHaveBeenCalledWith({
        bookId: 'book-1',
        sessionType: 'learning',
        inputMode: 'text',
      });
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/session',
          params: expect.objectContaining({
            mode: 'learning',
            subjectId: 'sub-1',
            bookId: 'book-1',
            sessionId: 'session-1',
            topicId: 'topic-1',
            subjectName: 'Algebra',
          }),
        }),
      );
    });
  });

  it('renders the all-sections fallback when every topic is skipped', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          ...makeBookQuery().data,
          topics: [
            makeTopic({ id: 'topic-1', skipped: true }),
            makeTopic({ id: 'topic-2', skipped: true, sortOrder: 2 }),
          ],
        },
      }),
    );

    const { getByTestId } = render(<BookScreen />);

    getByTestId('all-sections-fallback');
    getByTestId('fallback-start');
  });

  it('renders past conversations and opens session summaries', () => {
    mockUseBookSessions.mockReturnValue(
      makeSessionsQuery({
        data: [
          makeSession({ id: 'sess-1', createdAt: '2026-04-24T09:00:00.000Z' }),
          makeSession({
            id: 'sess-2',
            topicId: 'topic-2',
            topicTitle: 'Quadratic Equations',
            createdAt: '2026-04-24T08:00:00.000Z',
          }),
        ],
      }),
    );

    const { getByTestId } = render(<BookScreen />);

    // Past conversations section is collapsed by default — expand it first.
    // The toggle label includes the session count, so we match via testID.
    fireEvent.press(getByTestId('book-sessions-toggle'));

    fireEvent.press(getByTestId('session-sess-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: 'sess-1',
        subjectId: 'sub-1',
        topicId: 'topic-1',
      },
    });
  });

  it('shows chapter dividers when there are 4 or more sessions across chapters', () => {
    mockUseBookSessions.mockReturnValue(
      makeSessionsQuery({
        data: [
          makeSession({ id: 'sess-1', chapter: 'Chapter A' }),
          makeSession({
            id: 'sess-2',
            topicId: 'topic-2',
            topicTitle: 'Quadratic Equations',
            chapter: 'Chapter A',
          }),
          makeSession({
            id: 'sess-3',
            topicId: 'topic-3',
            topicTitle: 'Functions',
            chapter: 'Chapter B',
          }),
          makeSession({
            id: 'sess-4',
            topicId: 'topic-4',
            topicTitle: 'Inequalities',
            chapter: 'Chapter B',
          }),
        ],
      }),
    );

    const { getByText, getByTestId } = render(<BookScreen />);

    // Past conversations section is collapsed by default — expand it to see chapter dividers
    fireEvent.press(getByTestId('book-sessions-toggle'));

    getByText('Chapter A');
    getByText('Chapter B');
  });

  it('shows the book complete card and routes review to the relearn flow', () => {
    const topics = [
      makeTopic({ id: 'topic-1', title: 'Linear Equations', sortOrder: 1 }),
      makeTopic({ id: 'topic-2', title: 'Quadratics', sortOrder: 2 }),
    ];

    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: { ...makeBookQuery().data, topics },
      }),
    );
    mockUseRetentionTopics.mockReturnValue(
      makeRetentionQuery({
        data: {
          topics: [
            makeRetentionTopic({
              topicId: 'topic-1',
              nextReviewAt: '2026-04-26T00:00:00.000Z',
            }),
            makeRetentionTopic({
              topicId: 'topic-2',
              nextReviewAt: '2026-04-25T00:00:00.000Z',
            }),
          ],
          reviewDueCount: 0,
        },
      }),
    );

    const { getByTestId, queryByTestId } = render(<BookScreen />);

    getByTestId('book-complete-card');
    expect(queryByTestId('book-start-learning')).toBeNull();

    fireEvent.press(getByTestId('book-complete-review'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: {
        topicId: 'topic-2',
        subjectId: 'sub-1',
        topicName: 'Quadratics',
      },
    });

    fireEvent.press(getByTestId('book-complete-next'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  it('does not render the completion card when one topic is still unstarted', () => {
    mockUseRetentionTopics.mockReturnValue(
      makeRetentionQuery({
        data: {
          topics: [makeRetentionTopic({ topicId: 'topic-1' })],
          reviewDueCount: 0,
        },
      }),
    );

    const { queryByTestId } = render(<BookScreen />);

    expect(queryByTestId('book-complete-card')).toBeNull();
  });

  it('shows the continue-learning sticky CTA naming the topic when a continue topic exists [BUG-895]', () => {
    mockUseBookSessions.mockReturnValue(
      makeSessionsQuery({
        data: [
          makeSession({ topicId: 'topic-1', topicTitle: 'Linear Equations' }),
        ],
      }),
    );

    const { getByText, queryByTestId } = render(<BookScreen />);

    // [BUG-895] Sticky CTA names the topic so the duplicated "Continue now"
    // section in-list could be removed without losing context.
    getByText('▶ Continue: Linear Equations');
    expect(queryByTestId('continue-now-row')).toBeNull();
  });

  it('truncates a long continue-topic title in the sticky CTA [BUG-895]', () => {
    const longTitle = 'A very long continuing topic title that exceeds limits';
    mockUseBookSessions.mockReturnValue(
      makeSessionsQuery({
        data: [makeSession({ topicId: 'topic-1', topicTitle: longTitle })],
      }),
    );
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          book: {
            id: 'book-1',
            title: 'Algebra',
            emoji: '📐',
            topicsGenerated: true,
          },
          topics: [
            makeTopic({ id: 'topic-1', title: longTitle, sortOrder: 1 }),
          ],
        },
      }),
    );

    const { getByText } = render(<BookScreen />);

    const truncated = `▶ Continue: ${longTitle.slice(0, 24)}...`;
    getByText(truncated);
  });

  it('shows and wires the build-learning-path link when no curriculum exists', async () => {
    const { getByTestId } = render(<BookScreen />);

    fireEvent.press(getByTestId('book-build-path-link'));
    await waitFor(() => {
      expect(mockStartFirstCurriculumMutateAsync).toHaveBeenCalledWith({
        bookId: 'book-1',
        sessionType: 'learning',
        inputMode: 'text',
      });
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/session',
          params: expect.objectContaining({
            mode: 'learning',
            subjectId: 'sub-1',
            bookId: 'book-1',
            sessionId: 'session-1',
            topicId: 'topic-1',
            subjectName: 'Algebra',
          }),
        }),
      );
    });
  });

  it('hides the build-learning-path link when curriculum already exists', () => {
    mockUseCurriculum.mockReturnValue({
      data: { topics: [{ id: 'ctopic-1' }] },
      isLoading: false,
    });

    const { queryByTestId } = render(<BookScreen />);

    expect(queryByTestId('book-build-path-link')).toBeNull();
  });

  it('hides the sticky CTA in read-only mode', () => {
    mockSearchParams = () => ({
      subjectId: 'sub-1',
      bookId: 'book-1',
      readOnly: 'true',
    });

    const { queryByTestId } = render(<BookScreen />);

    expect(queryByTestId('book-start-learning')).toBeNull();
  });

  it('auto-starts the up-next topic when autoStart is true', async () => {
    mockSearchParams = () => ({
      subjectId: 'sub-1',
      bookId: 'book-1',
      autoStart: 'true',
    });

    render(<BookScreen />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId: 'sub-1',
          topicId: 'topic-1',
          topicName: 'Linear Equations',
        },
      });
    });
  });

  it('shows the generating state while topics are being created', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          book: {
            id: 'book-1',
            title: 'Algebra',
            emoji: '📐',
            topicsGenerated: false,
            description: 'Basic algebra',
          },
          topics: [],
          completedTopicCount: 0,
        },
      }),
    );

    const { getByTestId, getByText } = render(<BookScreen />);

    getByTestId('book-generating');
    getByText('Algebra');
  });

  it('shows an alert when the initial generation request fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          book: {
            id: 'book-1',
            title: 'Algebra',
            emoji: '📐',
            topicsGenerated: false,
            description: null,
          },
          topics: [],
          completedTopicCount: 0,
        },
      }),
    );
    mockGenerateMutate.mockImplementation(
      (_input: unknown, callbacks: { onError: (error: Error) => void }) => {
        callbacks.onError(new Error('LLM service unavailable'));
      },
    );

    render(<BookScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Couldn't build this book",
        expect.any(String),
        expect.any(Array),
        undefined,
      );
    });
  });

  it('fires retry generation only once after the timed-out state', async () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          book: {
            id: 'book-1',
            title: 'Algebra',
            emoji: '📐',
            topicsGenerated: false,
            description: 'Basic algebra',
          },
          topics: [],
          completedTopicCount: 0,
        },
      }),
    );

    mockGenerateMutate.mockImplementationOnce(
      (_input: unknown, callbacks: { onError: (error: Error) => void }) => {
        callbacks.onError(new Error('initial failure'));
      },
    );

    const { getByTestId } = render(<BookScreen />);

    await waitFor(() => {
      getByTestId('book-gen-retry');
    });

    let retryCallCount = 0;
    mockGenerateMutate.mockImplementation(() => {
      retryCallCount += 1;
    });

    fireEvent.press(getByTestId('book-gen-retry'));
    expect(retryCallCount).toBe(1);
  });

  // Back button explicitly replaces with the shelf grid (one screen up).
  // router.back() falls through to the Tabs navigator's `firstRoute` (Home)
  // when the inner stack lacks a sibling `index` — common after cross-tab
  // direct pushes to this leaf route.
  it('replaces with the shelf grid on back press', () => {
    const { getByTestId } = render(<BookScreen />);

    fireEvent.press(getByTestId('book-back'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('logs a breadcrumb and falls back to up next when the latest session topic no longer exists', () => {
    (Sentry.addBreadcrumb as jest.Mock).mockClear();

    mockUseBookSessions.mockReturnValue(
      makeSessionsQuery({
        data: [
          makeSession({
            id: 'sess-1',
            topicId: 'missing-topic',
            topicTitle: 'Deleted Topic',
            chapter: null,
            createdAt: '2026-04-24T12:00:00.000Z',
          }),
        ],
      }),
    );

    const { getByTestId, queryByTestId } = render(<BookScreen />);

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'continueNowTopicId references missing topic',
      }),
    );
    expect(queryByTestId('continue-now-row')).toBeNull();
    getByTestId('up-next-row-topic-1');
  });
});
