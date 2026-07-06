import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Sentry from '@sentry/react-native';
import {
  ProfileContext,
  type ProfileContextValue,
} from '../../../../../lib/profile';
import { createTestProfile } from '../../../../../test-utils/app-hook-test-utils';
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
const mockDeleteBookMutateAsync = jest.fn();

const mockUseBookWithTopics = jest.fn();
const mockUseGenerateBookTopics = jest.fn();
const mockUseBooks = jest.fn();
const mockUseBookSessions = jest.fn();
const mockUseBookNotes = jest.fn();
const mockUseRetentionTopics = jest.fn();
const mockUseCurriculum = jest.fn();
const mockUseLearningResumeTarget = jest.fn();
const mockStartFirstCurriculumMutateAsync = jest.fn();

jest.mock(
  '../../../../../hooks/use-books' /* gc1-allow: pattern-a conversion; use-books hooks fire network queries; pattern-a spy controls book/topic shape per-test */,
  () => ({
    ...jest.requireActual('../../../../../hooks/use-books'),
    useBookWithTopics: () => mockUseBookWithTopics(),
    useBooks: () => mockUseBooks(),
    useGenerateBookTopics: () => mockUseGenerateBookTopics(),
    useDeleteBook: () => ({
      mutateAsync: mockDeleteBookMutateAsync,
      isPending: false,
    }),
  }),
);

jest.mock(
  '../../../../../hooks/use-book-sessions' /* gc1-allow: pattern-a conversion; hook fires network query; pattern-a spy controls session list shape */,
  () => ({
    ...jest.requireActual('../../../../../hooks/use-book-sessions'),
    useBookSessions: () => mockUseBookSessions(),
  }),
);

jest.mock(
  '../../../../../hooks/use-notes' /* gc1-allow: pattern-a conversion; hooks fire network queries/mutations; pattern-a spy controls note list and CRUD behavior */,
  () => ({
    ...jest.requireActual('../../../../../hooks/use-notes'),
    useBookNotes: () => mockUseBookNotes(),
    useConceptMasterySignals: () => ({ data: { signals: {} } }),
    useCreateNote: () => ({ mutate: jest.fn(), isPending: false }),
    useUpdateNote: () => ({ mutate: jest.fn(), isPending: false }),
    useDeleteNoteById: () => ({ mutate: jest.fn() }),
  }),
);

jest.mock(
  '../../../../../hooks/use-retention' /* gc1-allow: pattern-a conversion; hook fires network query; pattern-a spy controls retention topics shape */,
  () => ({
    ...jest.requireActual('../../../../../hooks/use-retention'),
    useRetentionTopics: () => mockUseRetentionTopics(),
  }),
);

jest.mock(
  '../../../../../hooks/use-curriculum' /* gc1-allow: pattern-a conversion; hook fires network query; pattern-a spy controls curriculum shape */,
  () => ({
    ...jest.requireActual('../../../../../hooks/use-curriculum'),
    useCurriculum: () => mockUseCurriculum(),
  }),
);

jest.mock(
  '../../../../../hooks/use-progress' /* gc1-allow: pattern-a conversion; hook fires network query; pattern-a spy controls resume target shape */,
  () => ({
    ...jest.requireActual('../../../../../hooks/use-progress'),
    useLearningResumeTarget: () => mockUseLearningResumeTarget(),
  }),
);

jest.mock(
  '../../../../../hooks/use-sessions',
  /* gc1-allow: transport-boundary: hook calls useApiClient which requires real HTTP transport */ () => ({
    useStartFirstCurriculumSession: () => ({
      mutateAsync: mockStartFirstCurriculumMutateAsync,
      isPending: false,
    }),
  }),
);

jest.mock(
  '../../../../../hooks/use-subjects' /* gc1-allow: pattern-a conversion; hook fires network query; pattern-a spy controls subject list shape */,
  () => ({
    ...jest.requireActual('../../../../../hooks/use-subjects'),
    useSubjects: () => ({
      data: [{ id: 'sub-1', name: 'Mathematics' }],
    }),
  }),
);

jest.mock(
  '../../../../../hooks/use-move-topic' /* gc1-allow: pattern-a conversion; hook fires network mutation; pattern-a spy isolates move-topic behavior from real API calls */,
  () => ({
    ...jest.requireActual('../../../../../hooks/use-move-topic'),
    useMoveTopic: () => ({ mutate: jest.fn(), isPending: false }),
  }),
);

jest.mock(
  '../../../../../components/common' /* gc1-allow: native-boundary; animations use reanimated worklets/SVG modules in JSDOM */,
  () => ({
    BookPageFlipAnimation: () => null,
    MagicPenAnimation: () => null,
    CelebrationAnimation: () => null,
  }),
);

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
    exchangeCount: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRetentionTopic(overrides: Partial<any> = {}) {
  return {
    topicId: 'topic-1',
    repetitions: 1,
    easeFactor: 2.5,
    xpStatus: 'verified',
    masteredAt: null,
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

const ownerProfile = createTestProfile({
  id: 'owner-profile',
  isOwner: true,
  displayName: 'Owner',
});
const childProfile = createTestProfile({
  id: 'child-profile',
  isOwner: false,
  displayName: 'Child',
});

function renderBookScreen(profileContext?: Partial<ProfileContextValue>) {
  const value: ProfileContextValue = {
    profiles: [ownerProfile, childProfile],
    activeProfile: ownerProfile,
    isExplicitProxyMode: false,
    switchProfile: async () => ({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: () => undefined,
    ...profileContext,
  };

  return render(
    <ProfileContext.Provider value={value}>
      <BookScreen />
    </ProfileContext.Provider>,
  );
}

describe('BookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
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
    mockDeleteBookMutateAsync.mockResolvedValue({
      deleted: true,
      bookId: 'book-1',
      subjectId: 'sub-1',
      topicCount: 2,
      startedTopicCount: 0,
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

  it('uses a localized loading fallback instead of the raw book id', () => {
    mockUseBooks.mockReturnValue({ data: [], isLoading: false });
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: undefined,
        isLoading: true,
      }),
    );

    const { getByText, queryByText } = render(<BookScreen />);

    getByText('Book');
    expect(queryByText('book-1')).toBeNull();
  });

  it('keeps cached book content visible during a background refetch', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        isLoading: true,
      }),
    );

    const { getByTestId, getByText, queryByTestId } = render(<BookScreen />);

    getByTestId('book-screen');
    getByText('Algebra');
    getByTestId('up-next-row-topic-1');
    expect(queryByTestId('book-loading')).toBeNull();
  });

  it('keeps cached book content visible if a background refresh errors', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        isError: true,
        error: new Error('Refresh failed'),
      }),
    );

    const { getByTestId, queryByTestId, getByText } = render(<BookScreen />);

    getByTestId('book-screen');
    getByText('Algebra');
    expect(queryByTestId('book-error')).toBeNull();
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
    getByText('0 mastered · 0 learning · 2 total');
  });

  it('mirrors the topic notes strip and keeps book notes collapsed by default', () => {
    mockUseBookNotes.mockReturnValue(
      makeNotesQuery({
        data: {
          notes: [
            {
              id: 'note-1',
              topicId: 'topic-1',
              sessionId: null,
              content: 'Plants use chlorophyll to capture light.',
              createdAt: '2026-05-17T10:00:00.000Z',
              updatedAt: '2026-05-17T10:00:00.000Z',
            },
          ],
        },
      }),
    );

    const { getByTestId, getByText, queryByText } = render(<BookScreen />);

    getByText('Notes for this book');
    getByText('1 note saved for this book');
    expect(queryByText('Plants use chlorophyll to capture light.')).toBeNull();

    fireEvent.press(getByTestId('book-notes-strip'));

    getByTestId('note-note-1');
    getByText('Plants use chlorophyll to capture light.');
    getByText('+ Add a note');
  });

  it('hides destructive and note write affordances in parent-proxy view', () => {
    mockUseBookNotes.mockReturnValue(
      makeNotesQuery({
        data: {
          notes: [
            {
              id: 'note-1',
              topicId: 'topic-1',
              sessionId: null,
              content: 'Plants use chlorophyll to capture light.',
              createdAt: '2026-05-17T10:00:00.000Z',
              updatedAt: '2026-05-17T10:00:00.000Z',
            },
          ],
        },
      }),
    );

    const { getByTestId, queryByTestId, queryByText } = renderBookScreen({
      activeProfile: childProfile,
      isExplicitProxyMode: true,
    });

    expect(queryByTestId('book-delete-button')).toBeNull();

    fireEvent.press(getByTestId('book-notes-strip'));

    getByTestId('note-note-1');
    expect(queryByTestId('note-note-1-menu')).toBeNull();
    expect(queryByText('+ Add a note')).toBeNull();
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

    getByText('0 mastered · 2 learning · 3 total');
  });

  it('ignores verified retention topics from other books', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          ...makeBookQuery().data,
          topics: [
            makeTopic({ id: 'topic-1', title: 'T1', sortOrder: 1 }),
            makeTopic({ id: 'topic-2', title: 'T2', sortOrder: 2 }),
          ],
        },
      }),
    );
    mockUseRetentionTopics.mockReturnValue(
      makeRetentionQuery({
        data: {
          topics: [
            makeRetentionTopic({ topicId: 'topic-1' }),
            makeRetentionTopic({ topicId: 'other-book-topic' }),
          ],
          reviewDueCount: 0,
        },
      }),
    );

    const { getByText, queryByTestId } = render(<BookScreen />);

    getByText('0 mastered · 1 learning · 2 total');
    expect(queryByTestId('book-complete-card')).toBeNull();
  });

  it('does not count pending retention repetitions as finished topics', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          ...makeBookQuery().data,
          topics: [
            makeTopic({ id: 'topic-1', title: 'T1', sortOrder: 1 }),
            makeTopic({ id: 'topic-2', title: 'T2', sortOrder: 2 }),
          ],
        },
      }),
    );
    mockUseRetentionTopics.mockReturnValue(
      makeRetentionQuery({
        data: {
          topics: [
            makeRetentionTopic({ topicId: 'topic-1', xpStatus: 'pending' }),
          ],
          reviewDueCount: 0,
        },
      }),
    );

    const { getByText, queryByTestId } = render(<BookScreen />);

    getByText('0 mastered · 1 learning · 2 total');
    expect(queryByTestId('done-row-topic-1')).toBeNull();
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

  it('automatically expands the topic list when a book only has one starter topic', async () => {
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

    const { queryByTestId } = render(<BookScreen />);

    expect(queryByTestId('book-thin-path-card')).toBeNull();

    await waitFor(() => {
      expect(mockGenerateMutate).toHaveBeenCalledWith(
        {
          expandExisting: true,
          priorKnowledge:
            'The book already has these starter topics: Introduction to Programming',
        },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });
    expect(mockStartFirstCurriculumMutateAsync).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
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

    // The in-list highlight and the sticky CTA point at the same topic.
    getByTestId('continue-now-row-topic-1');
    getByTestId('started-row-topic-2');
    getByText('2 sessions');
    expect(queryByTestId('up-next-row-topic-3')).toBeNull();
    // Sticky CTA names the continue topic explicitly.
    getByText('▶ Continue: Linear Equations');

    fireEvent.press(getByTestId('book-start-learning'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/[topicId]',
      params: { topicId: 'topic-1', subjectId: 'sub-1', bookId: 'book-1' },
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

  it('renders the hero up-next state, opens topic overview from the row, and starts chat only from the sticky CTA', () => {
    const { getByTestId, getByText } = render(<BookScreen />);

    getByTestId('up-next-row-topic-1');
    getByText('▶ Start: Linear Equations');

    fireEvent.press(getByTestId('up-next-row-topic-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/[topicId]',
      params: {
        topicId: 'topic-1',
        subjectId: 'sub-1',
        bookId: 'book-1',
        chapter: 'Foundations',
      },
    });

    mockPush.mockClear();

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

  it('does not render empty topic slots when generated data has blank titles', () => {
    mockUseBookWithTopics.mockReturnValue(
      makeBookQuery({
        data: {
          ...makeBookQuery().data,
          topics: [
            makeTopic({
              id: 'topic-1',
              title: 'Linear Equations',
              sortOrder: 1,
              chapter: 'Foundations',
            }),
            makeTopic({
              id: 'topic-blank',
              title: '   ',
              sortOrder: 2,
              chapter: 'Generated blanks',
            }),
            makeTopic({
              id: 'topic-3',
              title: 'Quadratic Equations',
              sortOrder: 3,
              chapter: 'Foundations',
            }),
          ],
        },
      }),
    );

    const { getByTestId, queryByTestId, queryByText } = render(<BookScreen />);

    getByTestId('up-next-row-topic-1');
    getByTestId('later-row-topic-3');
    expect(queryByTestId('later-row-topic-blank')).toBeNull();
    expect(queryByText('Generated blanks')).toBeNull();
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

    const { getByTestId, getByText, queryByTestId } = render(<BookScreen />);

    getByText('▶ Continue: Quadratic Equations');
    getByTestId('continue-now-row-topic-2');
    expect(queryByTestId('up-next-row-topic-1')).toBeNull();

    fireEvent.press(getByTestId('continue-now-row-topic-2'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/[topicId]',
      params: {
        topicId: 'topic-2',
        subjectId: 'sub-1',
        bookId: 'book-1',
        chapter: 'Foundations',
      },
    });

    mockPush.mockClear();

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
    // Session-backed state stays actionable even when retention data fails.
    getByTestId('continue-now-row-topic-1');
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
        bookId: 'book-1',
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

    const { getByText, getByTestId } = render(<BookScreen />);

    // The sticky CTA names the same topic that the book list marks as current.
    getByText('▶ Continue: Linear Equations');
    getByTestId('continue-now-row-topic-1');
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

  it('lets the learner set up the book after generation times out', async () => {
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
      getByTestId('book-gen-build-path');
    });

    fireEvent.press(getByTestId('book-gen-build-path'));

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

  it('[CR-2026-05-21-120] bookmarks button pushes to progress/saved exactly once, not twice', () => {
    // Before the fix, handleSubjectBookmarksPress issued two pushes:
    //   1. router.push('/(app)/progress')          ← seeds extra history entry
    //   2. requestAnimationFrame → router.push('/(app)/progress/saved')
    // This caused the user to need TWO Back presses to return to the shelf.
    // The fix collapses to a single push because progress/_layout.tsx exports
    // unstable_settings = { initialRouteName: 'index' }, seeding the parent
    // automatically on cross-tab entry.
    const { getByTestId } = render(<BookScreen />);

    fireEvent.press(getByTestId('book-subject-bookmarks'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/progress/saved',
      params: { subjectId: 'sub-1' },
    });
  });

  it('asks for confirmation before deleting an unstarted book', async () => {
    const { getByTestId } = render(<BookScreen />);

    fireEvent.press(getByTestId('book-delete-button'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete book?',
      expect.stringContaining('re-add it later'),
      expect.any(Array),
      { cancelable: true },
    );

    const buttons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as Array<{
      text?: string;
      onPress?: () => void | Promise<void>;
      style?: string;
    }>;
    const deleteButton = buttons.find((button) => button.text === 'Delete');
    expect(deleteButton?.style).toBe('destructive');

    await act(async () => {
      await deleteButton?.onPress?.();
    });

    expect(mockDeleteBookMutateAsync).toHaveBeenCalledWith({
      confirmStartedTopics: false,
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 'sub-1' },
      });
    });
  });

  it('warns that started topics and learning history will be deleted before confirming', async () => {
    mockDeleteBookMutateAsync
      .mockRejectedValueOnce(
        Object.assign(new Error('This book has started topics.'), {
          status: 409,
          details: {
            reason: 'started_topics',
            bookId: 'book-1',
            subjectId: 'sub-1',
            topicCount: 5,
            startedTopicCount: 2,
          },
        }),
      )
      .mockResolvedValueOnce({
        deleted: true,
        bookId: 'book-1',
        subjectId: 'sub-1',
        topicCount: 5,
        startedTopicCount: 2,
      });

    const { getByTestId } = render(<BookScreen />);

    fireEvent.press(getByTestId('book-delete-button'));

    const firstButtons = (Alert.alert as jest.Mock).mock
      .calls[0]?.[2] as Array<{
      text?: string;
      onPress?: () => void | Promise<void>;
    }>;

    await act(async () => {
      await firstButtons
        .find((button) => button.text === 'Delete')
        ?.onPress?.();
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledTimes(2);
    });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Delete started topics?',
      expect.stringContaining('2 started topics'),
      expect.any(Array),
      { cancelable: true },
    );

    const secondButtons = (Alert.alert as jest.Mock).mock
      .calls[1]?.[2] as Array<{
      text?: string;
      onPress?: () => void | Promise<void>;
      style?: string;
    }>;
    const deleteEverythingButton = secondButtons.find(
      (button) => button.text === 'Delete everything',
    );
    expect(deleteEverythingButton?.style).toBe('destructive');

    await act(async () => {
      await deleteEverythingButton?.onPress?.();
    });

    expect(mockDeleteBookMutateAsync).toHaveBeenLastCalledWith({
      confirmStartedTopics: true,
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId: 'sub-1' },
      });
    });
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
