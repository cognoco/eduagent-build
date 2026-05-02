import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  TopicsTab,
  TOPICS_TAB_INITIAL_STATE,
  type TopicsTabState,
} from './TopicsTab';
import type { EnrichedTopic } from '../../lib/library-filters';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    accent: '#2563eb',
    textSecondary: '#888',
    muted: '#666',
    primary: '#0d9488',
  }),
}));

jest.mock('../progress', () => ({
  RetentionSignal: ({
    status,
  }: {
    status: string;
  }): React.ReactElement | null => {
    const { Text } = require('react-native');
    return <Text testID={`retention-${status}`}>{status}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const topic1: EnrichedTopic = {
  topicId: 'topic-1',
  subjectId: 'sub-1',
  name: 'Fractions',
  subjectName: 'Mathematics',
  subjectStatus: 'active',
  bookId: 'book-1',
  bookTitle: 'Algebra Basics',
  chapter: 'Ch 1',
  retention: 'strong',
  lastReviewedAt: '2026-04-04T10:00:00Z',
  repetitions: 5,
  failureCount: 0,
  hasNote: false,
};

const topic2: EnrichedTopic = {
  topicId: 'topic-2',
  subjectId: 'sub-2',
  name: 'Pharaohs',
  subjectName: 'History',
  subjectStatus: 'active',
  bookId: 'book-2',
  bookTitle: 'Ancient Egypt',
  chapter: null,
  retention: 'forgotten',
  lastReviewedAt: '2026-03-01T10:00:00Z',
  repetitions: 1,
  failureCount: 4,
  hasNote: false,
};

const defaultState: TopicsTabState = TOPICS_TAB_INITIAL_STATE;
const subjects = [
  { id: 'sub-1', name: 'Mathematics' },
  { id: 'sub-2', name: 'History' },
];
const books = [
  { id: 'book-1', title: 'Algebra Basics', subjectName: 'Mathematics' },
  { id: 'book-2', title: 'Ancient Egypt', subjectName: 'History' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopicsTab', () => {
  const defaultProps = {
    topics: [topic1, topic2],
    subjects,
    books,
    noteTopicIds: new Set<string>(),
    state: defaultState,
    onStateChange: jest.fn(),
    onTopicPress: jest.fn(),
    onAddSubject: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders topic rows with subject, book, and retention info', () => {
    render(<TopicsTab {...defaultProps} />);

    expect(screen.getByTestId('topic-row-topic-1')).toBeTruthy();
    expect(screen.getByTestId('topic-row-topic-2')).toBeTruthy();
    // Topic names
    expect(screen.getByText('Fractions')).toBeTruthy();
    expect(screen.getByText('Pharaohs')).toBeTruthy();
    // Subject names
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    // Book titles
    expect(screen.getByText('Algebra Basics')).toBeTruthy();
    expect(screen.getByText('Ancient Egypt')).toBeTruthy();
    // Retention signals
    expect(screen.getByTestId('retention-strong')).toBeTruthy();
    expect(screen.getByTestId('retention-forgotten')).toBeTruthy();
    // Session counts
    expect(screen.getByText('5 sessions')).toBeTruthy();
    expect(screen.getByText('1 session')).toBeTruthy();
    // Chapter shown for topic1
    expect(screen.getByText('Ch 1')).toBeTruthy();
  });

  it('shows needs-attention warning for high failure count', () => {
    render(<TopicsTab {...defaultProps} />);

    // topic2 has failureCount 4 (>= 3)
    expect(screen.getByText('Needs attention')).toBeTruthy();
    // topic1 has failureCount 0, should not show warning
    const attentionTexts = screen.queryAllByText('Needs attention');
    expect(attentionTexts).toHaveLength(1);
  });

  it('propagates search changes via onStateChange', () => {
    const onStateChange = jest.fn();
    render(<TopicsTab {...defaultProps} onStateChange={onStateChange} />);

    fireEvent.changeText(
      screen.getByTestId('library-search-input'),
      'fractions'
    );
    expect(onStateChange).toHaveBeenCalledWith({
      ...defaultState,
      search: 'fractions',
    });
  });

  it('shows no-results with "search" message when search produces no matches', () => {
    const searchState: TopicsTabState = {
      ...defaultState,
      search: 'quantum',
    };
    render(<TopicsTab {...defaultProps} state={searchState} />);

    expect(screen.getByTestId('library-no-results')).toBeTruthy();
    expect(screen.getByText('No topics match your search')).toBeTruthy();
  });

  it('shows "filters" message when only filter applied (BUG-512)', () => {
    const filterOnlyState: TopicsTabState = {
      search: '',
      sortKey: 'name-asc',
      filters: {
        subjectIds: ['sub-999'],
        bookIds: [],
        retention: [],
        needsAttention: false,
        hasNotes: false,
      },
    };
    render(<TopicsTab {...defaultProps} state={filterOnlyState} />);

    expect(screen.getByTestId('library-no-results')).toBeTruthy();
    expect(screen.getByText('No topics match your filters')).toBeTruthy();
  });

  it('book filter matches topics by bookId (BUG-511)', () => {
    const bookFilterState: TopicsTabState = {
      search: '',
      sortKey: 'name-asc',
      filters: {
        subjectIds: [],
        bookIds: ['book-1'],
        retention: [],
        needsAttention: false,
        hasNotes: false,
      },
    };
    render(<TopicsTab {...defaultProps} state={bookFilterState} />);

    // topic1 has bookId 'book-1', topic2 has bookId 'book-2'
    expect(screen.getByTestId('topic-row-topic-1')).toBeTruthy();
    expect(screen.queryByTestId('topic-row-topic-2')).toBeNull();
  });

  it('disambiguates duplicate book titles with subject name (BUG-513)', () => {
    const dupeBooks = [
      { id: 'book-a', title: 'Uncategorized', subjectName: 'Mathematics' },
      { id: 'book-b', title: 'Uncategorized', subjectName: 'History' },
    ];
    render(<TopicsTab {...defaultProps} books={dupeBooks} />);

    // Open filter sheet
    fireEvent.press(screen.getByTestId('library-filter-button'));

    // Disambiguated labels should appear
    expect(screen.getByText('Uncategorized (Mathematics)')).toBeTruthy();
    expect(screen.getByText('Uncategorized (History)')).toBeTruthy();
  });

  it('calls onTopicPress with topicId and subjectId', () => {
    const onTopicPress = jest.fn();
    render(<TopicsTab {...defaultProps} onTopicPress={onTopicPress} />);

    fireEvent.press(screen.getByTestId('topic-row-topic-1'));
    expect(onTopicPress).toHaveBeenCalledWith(
      'topic-1',
      'sub-1',
      'strong',
      'Fractions'
    );

    fireEvent.press(screen.getByTestId('topic-row-topic-2'));
    expect(onTopicPress).toHaveBeenCalledWith(
      'topic-2',
      'sub-2',
      'forgotten',
      'Pharaohs'
    );
  });

  it('shows empty state when no topics exist', () => {
    const onAddSubject = jest.fn();
    render(
      <TopicsTab {...defaultProps} topics={[]} onAddSubject={onAddSubject} />
    );

    expect(screen.getByTestId('library-no-content')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-add-subject-empty'));
    expect(onAddSubject).toHaveBeenCalledTimes(1);
  });

  it('clear button resets search only when only search active', () => {
    const onStateChange = jest.fn();
    const searchState: TopicsTabState = {
      ...defaultState,
      search: 'quantum',
    };
    render(
      <TopicsTab
        {...defaultProps}
        state={searchState}
        onStateChange={onStateChange}
      />
    );

    expect(screen.getByText('Clear search')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith({
      ...searchState,
      search: '',
    });
  });

  it('shows "Clear all" when both search and filters are active with no results', () => {
    const onStateChange = jest.fn();
    const stateWithBoth: TopicsTabState = {
      search: 'nonexistent',
      sortKey: 'name-asc',
      filters: {
        subjectIds: ['sub-999'],
        bookIds: [],
        retention: [],
        needsAttention: false,
        hasNotes: false,
      },
    };
    render(
      <TopicsTab
        {...defaultProps}
        state={stateWithBoth}
        onStateChange={onStateChange}
      />
    );

    expect(screen.getByText('Clear all')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith(TOPICS_TAB_INITIAL_STATE);
  });

  it('shows "Clear filters" when only filters cause no results', () => {
    const onStateChange = jest.fn();
    const filterOnlyState: TopicsTabState = {
      search: '',
      sortKey: 'name-asc',
      filters: {
        subjectIds: ['sub-999'],
        bookIds: [],
        retention: [],
        needsAttention: false,
        hasNotes: false,
      },
    };
    render(
      <TopicsTab
        {...defaultProps}
        state={filterOnlyState}
        onStateChange={onStateChange}
      />
    );

    expect(screen.getByText('Clear filters')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith({
      ...filterOnlyState,
      filters: {
        subjectIds: [],
        bookIds: [],
        retention: [],
        needsAttention: false,
        hasNotes: false,
      },
    });
  });

  it('exports TOPICS_TAB_INITIAL_STATE with correct defaults', () => {
    expect(TOPICS_TAB_INITIAL_STATE).toEqual({
      search: '',
      sortKey: 'retention',
      filters: {
        subjectIds: [],
        bookIds: [],
        retention: [],
        needsAttention: false,
        hasNotes: false,
      },
    });
  });

  // [UX-DE-M4] Error state must always be actionable
  it('shows Retry button when isError=true and onRetry is provided', () => {
    const onRetry = jest.fn();
    render(
      <TopicsTab {...defaultProps} topics={[]} isError onRetry={onRetry} />
    );

    expect(screen.getByTestId('topics-tab-error')).toBeTruthy();
    fireEvent.press(screen.getByTestId('topics-tab-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('[UX-DE-M4] Go Back button calls router.back() when history exists (canGoBack=true)', () => {
    mockCanGoBack.mockReturnValue(true);
    render(<TopicsTab {...defaultProps} topics={[]} isError />);

    expect(screen.getByTestId('topics-tab-error')).toBeTruthy();
    expect(screen.getByTestId('topics-tab-go-back')).toBeTruthy();

    fireEvent.press(screen.getByTestId('topics-tab-go-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('[UX-DE-M4][BUG-948] Go Back button replaces to /(app)/library when deep-linked (canGoBack=false)', () => {
    mockCanGoBack.mockReturnValue(false);
    render(<TopicsTab {...defaultProps} topics={[]} isError />);

    expect(screen.getByTestId('topics-tab-go-back')).toBeTruthy();

    fireEvent.press(screen.getByTestId('topics-tab-go-back'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });
});
