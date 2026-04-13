import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import BookScreen from './[bookId]';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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

// Default search params — overridden per test via mockSearchParams
let mockSearchParams = () => ({
  subjectId: 'sub-1',
  bookId: 'book-1',
});

// --- useBookWithTopics ---
const mockBookRefetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseBookWithTopics = jest.fn((): any => ({
  data: {
    book: {
      id: 'book-1',
      title: 'Algebra',
      emoji: '📐',
      topicsGenerated: true,
      description: 'Basic algebra',
    },
    topics: [
      {
        id: 'topic-1',
        title: 'Linear Equations',
        sortOrder: 1,
        skipped: false,
      },
      {
        id: 'topic-2',
        title: 'Quadratic Equations',
        sortOrder: 2,
        skipped: false,
      },
    ],
    completedTopicCount: 0,
  },
  isLoading: false,
  isError: false,
  error: null,
  refetch: mockBookRefetch,
}));

// --- useGenerateBookTopics ---
const mockGenerateMutate = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseGenerateBookTopics = jest.fn((): any => ({
  mutate: mockGenerateMutate,
  isPending: false,
}));

jest.mock('../../../../../hooks/use-books', () => ({
  useBookWithTopics: () => mockUseBookWithTopics(),
  useGenerateBookTopics: () => mockUseGenerateBookTopics(),
}));

// --- useBookSessions ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseBookSessions = jest.fn((): any => ({
  data: [],
  isLoading: false,
}));

jest.mock('../../../../../hooks/use-book-sessions', () => ({
  useBookSessions: () => mockUseBookSessions(),
}));

// --- useTopicSuggestions ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseTopicSuggestions = jest.fn((): any => ({
  data: [],
  isLoading: false,
}));

jest.mock('../../../../../hooks/use-topic-suggestions', () => ({
  useTopicSuggestions: () => mockUseTopicSuggestions(),
}));

// --- useBookNotes ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseBookNotes = jest.fn((): any => ({
  data: { notes: [] },
  isLoading: false,
}));

jest.mock('../../../../../hooks/use-notes', () => ({
  useBookNotes: () => mockUseBookNotes(),
}));

// --- useSubjects ---
jest.mock('../../../../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: [{ id: 'sub-1', name: 'Mathematics' }],
  }),
}));

// --- useThemeColors ---
jest.mock('../../../../../lib/theme', () => ({
  useThemeColors: () => ({
    accent: '#00bfa5',
    textSecondary: '#888',
    textInverse: '#fff',
  }),
}));

// --- formatApiError ---
jest.mock('../../../../../lib/format-api-error', () => ({
  formatApiError: (err: unknown) =>
    err instanceof Error ? err.message : 'Unknown error',
}));

// --- PenWritingAnimation (simple stub) ---
jest.mock('../../../../../components/common', () => ({
  PenWritingAnimation: () => null,
}));

// --- Library components: render real implementations for text assertions ---
// SuggestionCard, SessionRow, ChapterDivider are simple RN components that
// render text; we let them render normally so we can assert on content.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessions(count: number, withChapters = false) {
  return Array.from({ length: count }, (_, i) => ({
    id: `sess-${i + 1}`,
    topicId: `topic-${(i % 2) + 1}`,
    topicTitle: `Session Topic ${i + 1}`,
    chapter: withChapters ? (i < 2 ? 'Chapter A' : 'Chapter B') : null,
    createdAt: new Date(Date.now() - (i + 1) * 3600_000).toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BookScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    // Reset to defaults
    mockSearchParams = () => ({
      subjectId: 'sub-1',
      bookId: 'book-1',
    });
    mockUseBookWithTopics.mockImplementation(() => ({
      data: {
        book: {
          id: 'book-1',
          title: 'Algebra',
          emoji: '📐',
          topicsGenerated: true,
          description: 'Basic algebra',
        },
        topics: [
          {
            id: 'topic-1',
            title: 'Linear Equations',
            sortOrder: 1,
            skipped: false,
          },
          {
            id: 'topic-2',
            title: 'Quadratic Equations',
            sortOrder: 2,
            skipped: false,
          },
        ],
        completedTopicCount: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBookRefetch,
    }));
    mockUseGenerateBookTopics.mockImplementation(() => ({
      mutate: mockGenerateMutate,
      isPending: false,
    }));
    mockUseBookSessions.mockImplementation(() => ({
      data: [],
      isLoading: false,
    }));
    mockUseTopicSuggestions.mockImplementation(() => ({
      data: [],
      isLoading: false,
    }));
    mockUseBookNotes.mockImplementation(() => ({
      data: { notes: [] },
      isLoading: false,
    }));
  });

  // -----------------------------------------------------------------------
  // 1. Loading state
  // -----------------------------------------------------------------------
  it('renders loading indicator when book is loading', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockBookRefetch,
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('book-loading')).toBeTruthy();
    expect(getByText('Loading book...')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. Error state — retry and back buttons
  // -----------------------------------------------------------------------
  it('shows error state with retry and back buttons', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Server exploded'),
      refetch: mockBookRefetch,
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('book-error')).toBeTruthy();
    expect(getByText('Server exploded')).toBeTruthy();
    expect(getByTestId('book-retry-button')).toBeTruthy();
    expect(getByTestId('book-back-button')).toBeTruthy();
  });

  it('retry button calls refetch on error screen', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Temporary failure'),
      refetch: mockBookRefetch,
    });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-retry-button'));
    expect(mockBookRefetch).toHaveBeenCalledTimes(1);
  });

  it('back button on error screen calls router.back()', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('oops'),
      refetch: mockBookRefetch,
    });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 3. Missing params
  // -----------------------------------------------------------------------
  it('shows missing-param guidance when subjectId is absent', () => {
    mockSearchParams = () => ({ subjectId: '', bookId: 'book-1' });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('book-missing-param')).toBeTruthy();
    expect(
      getByText('Missing book details. Please go back and try again.')
    ).toBeTruthy();
  });

  it('shows missing-param guidance when bookId is absent', () => {
    mockSearchParams = () => ({ subjectId: 'sub-1', bookId: '' });

    const { getByTestId } = render(<BookScreen />);
    expect(getByTestId('book-missing-param')).toBeTruthy();
  });

  it('missing-param back button calls router.back()', () => {
    mockSearchParams = () => ({ subjectId: '', bookId: '' });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-missing-param-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 4. Main view renders
  // -----------------------------------------------------------------------
  it('renders main view when book is loaded with topics', () => {
    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('book-screen')).toBeTruthy();
    expect(getByText('Algebra')).toBeTruthy();
    expect(getByText('📐')).toBeTruthy();
    expect(getByText('Mathematics')).toBeTruthy();
  });

  it('displays session count stat on main view', () => {
    mockUseBookSessions.mockReturnValue({
      data: makeSessions(3),
      isLoading: false,
    });

    const { getByText } = render(<BookScreen />);
    expect(getByText('3 sessions')).toBeTruthy();
  });

  it('displays singular "session" when count is 1', () => {
    mockUseBookSessions.mockReturnValue({
      data: makeSessions(1),
      isLoading: false,
    });

    const { getByText } = render(<BookScreen />);
    expect(getByText('1 session')).toBeTruthy();
  });

  it('displays note count when notes exist', () => {
    mockUseBookNotes.mockReturnValue({
      data: {
        notes: [
          { id: 'n-1', topicId: 'topic-1', content: 'note text' },
          { id: 'n-2', topicId: 'topic-2', content: 'note text 2' },
        ],
      },
      isLoading: false,
    });

    const { getByText } = render(<BookScreen />);
    expect(getByText('2 notes')).toBeTruthy();
  });

  it('displays completed topic progress when > 0', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: {
          id: 'book-1',
          title: 'Algebra',
          emoji: '📐',
          topicsGenerated: true,
          description: null,
        },
        topics: [
          { id: 'topic-1', title: 'T1', sortOrder: 1, skipped: false },
          { id: 'topic-2', title: 'T2', sortOrder: 2, skipped: false },
          { id: 'topic-3', title: 'T3', sortOrder: 3, skipped: false },
        ],
        completedTopicCount: 2,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBookRefetch,
    });

    const { getByText } = render(<BookScreen />);
    expect(getByText('2/3 topics')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 5. Suggestion cards
  // -----------------------------------------------------------------------
  it('renders suggestion cards from pre-generated topics', () => {
    // No API suggestions, but 2 uncovered topics exist
    const { getByTestId, getByText } = render(<BookScreen />);
    // Topics are not yet completed so they show as suggestion cards
    expect(getByTestId('suggestion-topic-1')).toBeTruthy();
    expect(getByText('Linear Equations')).toBeTruthy();
    expect(getByTestId('suggestion-topic-2')).toBeTruthy();
    expect(getByText('Quadratic Equations')).toBeTruthy();
  });

  it('renders API suggestions ahead of pre-generated topics', () => {
    mockUseTopicSuggestions.mockReturnValue({
      data: [
        { id: 'sug-1', title: 'Polynomials' },
        { id: 'sug-2', title: 'Inequalities' },
      ],
      isLoading: false,
    });

    const { getByTestId, getByText, queryByTestId } = render(<BookScreen />);
    // API suggestions take priority, max 2 total
    expect(getByTestId('suggestion-sug-1')).toBeTruthy();
    expect(getByText('Polynomials')).toBeTruthy();
    expect(getByTestId('suggestion-sug-2')).toBeTruthy();
    expect(getByText('Inequalities')).toBeTruthy();
    // Pre-generated topics should be pushed out (max 2)
    expect(queryByTestId('suggestion-topic-1')).toBeNull();
  });

  it('pressing a topic-type suggestion navigates with topicId', () => {
    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('suggestion-topic-1'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: 'sub-1',
          topicId: 'topic-1',
        }),
      })
    );
  });

  it('pressing an API suggestion navigates with rawInput', () => {
    mockUseTopicSuggestions.mockReturnValue({
      data: [{ id: 'sug-1', title: 'Polynomials' }],
      isLoading: false,
    });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('suggestion-sug-1'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: 'sub-1',
          rawInput: 'Polynomials',
        }),
      })
    );
  });

  // -----------------------------------------------------------------------
  // 6. Empty sessions guidance
  // -----------------------------------------------------------------------
  it('shows empty sessions guidance when no sessions exist', () => {
    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('book-empty-sessions')).toBeTruthy();
    expect(getByText('No sessions yet')).toBeTruthy();
    expect(getByText('Pick a topic above to start learning')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 7. Start learning button
  // -----------------------------------------------------------------------
  it('renders start learning button when topics exist', () => {
    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('book-start-learning')).toBeTruthy();
    expect(getByText('Start learning')).toBeTruthy();
  });

  it('start learning navigates using first suggestion card (topic type)', () => {
    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-start-learning'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: 'sub-1',
          topicId: 'topic-1',
        }),
      })
    );
  });

  it('start learning uses rawInput when first card is an API suggestion', () => {
    mockUseTopicSuggestions.mockReturnValue({
      data: [{ id: 'sug-1', title: 'Polynomials' }],
      isLoading: false,
    });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-start-learning'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: 'sub-1',
          rawInput: 'Polynomials',
        }),
      })
    );
  });

  it('start learning falls back to first uncovered topic when no suggestions', () => {
    // All topics completed → no suggestion cards
    mockUseBookSessions.mockReturnValue({
      data: [
        {
          id: 'sess-1',
          topicId: 'topic-1',
          topicTitle: 'Linear',
          chapter: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'sess-2',
          topicId: 'topic-2',
          topicTitle: 'Quadratic',
          chapter: null,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-start-learning'));

    // All topics covered, falls back to first topic
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/session',
        params: expect.objectContaining({
          mode: 'learning',
          subjectId: 'sub-1',
          topicId: 'topic-1',
        }),
      })
    );
  });

  it('hides start learning button in readOnly mode', () => {
    mockSearchParams = () => ({
      subjectId: 'sub-1',
      bookId: 'book-1',
      readOnly: 'true',
    });

    const { queryByTestId } = render(<BookScreen />);
    expect(queryByTestId('book-start-learning')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 8. Session list renders session rows
  // -----------------------------------------------------------------------
  it('renders session rows when sessions exist', () => {
    const sessions = makeSessions(3);
    mockUseBookSessions.mockReturnValue({
      data: sessions,
      isLoading: false,
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('session-sess-1')).toBeTruthy();
    expect(getByTestId('session-sess-2')).toBeTruthy();
    expect(getByTestId('session-sess-3')).toBeTruthy();
    expect(getByText('Session Topic 1')).toBeTruthy();
    expect(getByText('Session Topic 2')).toBeTruthy();
    expect(getByText('Session Topic 3')).toBeTruthy();
  });

  it('pressing a session row navigates to session summary', () => {
    mockUseBookSessions.mockReturnValue({
      data: makeSessions(1),
      isLoading: false,
    });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('session-sess-1'));

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/session-summary/[sessionId]',
        params: { sessionId: 'sess-1' },
      })
    );
  });

  it('long-pressing a session row no longer shows unavailable actions', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseBookSessions.mockReturnValue({
      data: makeSessions(1),
      isLoading: false,
    });

    const { getByTestId } = render(<BookScreen />);
    fireEvent(getByTestId('session-sess-1'), 'longPress');

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows "Past sessions" heading when sessions exist', () => {
    mockUseBookSessions.mockReturnValue({
      data: makeSessions(2),
      isLoading: false,
    });

    const { getByText } = render(<BookScreen />);
    expect(getByText('Past sessions')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 9. Chapter dividers
  // -----------------------------------------------------------------------
  it('shows chapter dividers when 4+ sessions with chapters', () => {
    const sessions = makeSessions(5, true); // withChapters=true
    mockUseBookSessions.mockReturnValue({
      data: sessions,
      isLoading: false,
    });

    const { getByText } = render(<BookScreen />);
    // ChapterDivider renders chapter name text — CSS uppercase is visual only
    expect(getByText('Chapter A')).toBeTruthy();
    expect(getByText('Chapter B')).toBeTruthy();
    // All 5 sessions should still render under their respective chapters
    expect(getByText('Session Topic 1')).toBeTruthy();
    expect(getByText('Session Topic 5')).toBeTruthy();
  });

  it('does not show chapter dividers when fewer than 4 sessions', () => {
    const sessions = makeSessions(3, true);
    mockUseBookSessions.mockReturnValue({
      data: sessions,
      isLoading: false,
    });

    const { queryByText, getByText } = render(<BookScreen />);
    // With < 4 sessions, no ChapterDivider components are rendered,
    // so the chapter group names should not appear as separate text
    expect(queryByText('Chapter A')).toBeNull();
    expect(queryByText('Chapter B')).toBeNull();
    // But sessions themselves still render (flat list, no grouping)
    expect(getByText('Session Topic 1')).toBeTruthy();
    expect(getByText('Session Topic 3')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 10. Back button on main view
  // -----------------------------------------------------------------------
  it('back button on main view calls router.back()', () => {
    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('back button replaces shelf when there is no back history', () => {
    mockCanGoBack.mockReturnValue(false);

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-back'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  // -----------------------------------------------------------------------
  // Generation state
  // -----------------------------------------------------------------------
  it('shows generating screen when topics not yet generated', () => {
    mockUseBookWithTopics.mockReturnValue({
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
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBookRefetch,
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('book-generating')).toBeTruthy();
    expect(getByText('Algebra')).toBeTruthy();
    expect(getByText('Basic algebra')).toBeTruthy();
    expect(getByText('📐')).toBeTruthy();
  });

  it('shows generating screen when mutation is pending', () => {
    mockUseGenerateBookTopics.mockReturnValue({
      mutate: mockGenerateMutate,
      isPending: true,
    });

    const { getByTestId } = render(<BookScreen />);
    expect(getByTestId('book-generating')).toBeTruthy();
  });

  it('generating screen shows back button in idle/slow phase', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: {
          id: 'book-1',
          title: 'Algebra',
          emoji: null,
          topicsGenerated: false,
          description: null,
        },
        topics: [],
        completedTopicCount: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBookRefetch,
    });

    const { getByTestId } = render(<BookScreen />);
    expect(getByTestId('book-gen-back-idle')).toBeTruthy();
    fireEvent.press(getByTestId('book-gen-back-idle'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Empty topics state
  // -----------------------------------------------------------------------
  it('shows empty topics state when book has no topics and generation is done', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: {
          id: 'book-1',
          title: 'Algebra',
          emoji: '📐',
          topicsGenerated: true,
          description: null,
        },
        topics: [],
        completedTopicCount: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBookRefetch,
    });

    const { getByTestId, getByText } = render(<BookScreen />);
    expect(getByTestId('book-empty-topics')).toBeTruthy();
    expect(getByText('No topics in this book yet.')).toBeTruthy();
  });

  it('hides start learning button when no topics exist', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: {
        book: {
          id: 'book-1',
          title: 'Algebra',
          emoji: null,
          topicsGenerated: true,
          description: null,
        },
        topics: [],
        completedTopicCount: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBookRefetch,
    });

    const { queryByTestId } = render(<BookScreen />);
    expect(queryByTestId('book-start-learning')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // "Study next" header
  // -----------------------------------------------------------------------
  it('shows "Study next" section heading when suggestions exist', () => {
    const { getByText } = render(<BookScreen />);
    expect(getByText('Study next')).toBeTruthy();
  });

  it('hides "Study next" when all topics are completed', () => {
    // Both topics covered by sessions
    mockUseBookSessions.mockReturnValue({
      data: [
        {
          id: 's1',
          topicId: 'topic-1',
          topicTitle: 'T1',
          chapter: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 's2',
          topicId: 'topic-2',
          topicTitle: 'T2',
          chapter: null,
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    });

    const { queryByText } = render(<BookScreen />);
    expect(queryByText('Study next')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Auto-start
  // -----------------------------------------------------------------------
  it('auto-starts session when autoStart=true and topics available', async () => {
    mockSearchParams = () => ({
      subjectId: 'sub-1',
      bookId: 'book-1',
      autoStart: 'true',
    });

    render(<BookScreen />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/session',
          params: expect.objectContaining({
            mode: 'learning',
            subjectId: 'sub-1',
          }),
        })
      );
    });
  });

  it('does not auto-start when autoStart param is absent', () => {
    render(<BookScreen />);
    // Push should not be called automatically (no interaction)
    expect(mockPush).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // BUG-81: initial generation failure shows user-visible Alert [BUG-81]
  // -----------------------------------------------------------------------
  it('shows Alert when initial book topic generation fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    // Book needs generation (topicsGenerated: false)
    mockUseBookWithTopics.mockReturnValue({
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
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockBookRefetch,
    });

    // Simulate mutate calling its onError callback
    mockGenerateMutate.mockImplementation(
      (_input: unknown, callbacks: { onError: (e: Error) => void }) => {
        callbacks.onError(new Error('LLM service unavailable'));
      }
    );

    render(<BookScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Couldn't build this book",
        expect.any(String),
        expect.any(Array)
      );
    });
  });

  // -----------------------------------------------------------------------
  // Loading back button
  // -----------------------------------------------------------------------
  it('loading state has a back button that navigates away', () => {
    mockUseBookWithTopics.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockBookRefetch,
    });

    const { getByTestId } = render(<BookScreen />);
    fireEvent.press(getByTestId('book-loading-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
