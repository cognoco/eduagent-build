import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  BooksTab,
  BOOKS_TAB_INITIAL_STATE,
  type BooksTabState,
} from './BooksTab';
import type { EnrichedBook } from '../../lib/library-filters';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    accent: '#2563eb',
    textSecondary: '#888',
    muted: '#666',
    primary: '#0d9488',
    border: '#e8e0d4',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const algebraBook: EnrichedBook = {
  book: {
    id: 'book-1',
    subjectId: 'sub-1',
    title: 'Algebra Basics',
    description: 'Intro to algebra',
    emoji: '📐',
    sortOrder: 1,
    topicsGenerated: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  subjectId: 'sub-1',
  subjectName: 'Mathematics',
  topicCount: 8,
  completedCount: 4,
  status: 'IN_PROGRESS',
};

const egyptBook: EnrichedBook = {
  book: {
    id: 'book-2',
    subjectId: 'sub-2',
    title: 'Ancient Egypt',
    description: 'Pyramids',
    emoji: '🏛️',
    sortOrder: 1,
    topicsGenerated: true,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  subjectId: 'sub-2',
  subjectName: 'History',
  topicCount: 6,
  completedCount: 6,
  status: 'COMPLETED',
};

const subjects = [
  { id: 'sub-1', name: 'Mathematics' },
  { id: 'sub-2', name: 'History' },
];

const defaultState: BooksTabState = BOOKS_TAB_INITIAL_STATE;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BooksTab', () => {
  const defaultProps = {
    books: [algebraBook, egyptBook],
    subjects,
    state: defaultState,
    onStateChange: jest.fn(),
    onBookPress: jest.fn(),
    onAddSubject: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders book cards with parent subject name', () => {
    render(<BooksTab {...defaultProps} />);

    screen.getByTestId('book-card-book-1');
    screen.getByTestId('book-card-book-2');
    screen.getByText('Algebra Basics');
    screen.getByText('Ancient Egypt');
    // Parent subject names shown
    screen.getByText('Mathematics');
    screen.getByText('History');
    // Status labels
    screen.getByText('In progress');
    screen.getByText('Complete');
    // Progress labels
    screen.getByText('4/8 topics');
    screen.getByText('6/6 topics');
  });

  it('calls onBookPress with subjectId and bookId when tapped', () => {
    const onBookPress = jest.fn();
    render(<BooksTab {...defaultProps} onBookPress={onBookPress} />);

    fireEvent.press(screen.getByTestId('book-card-book-1'));
    expect(onBookPress).toHaveBeenCalledWith('sub-1', 'book-1');

    fireEvent.press(screen.getByTestId('book-card-book-2'));
    expect(onBookPress).toHaveBeenCalledWith('sub-2', 'book-2');
  });

  it('propagates search changes via onStateChange', () => {
    const onStateChange = jest.fn();
    render(<BooksTab {...defaultProps} onStateChange={onStateChange} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'algebra');
    expect(onStateChange).toHaveBeenCalledWith({
      ...defaultState,
      search: 'algebra',
    });
  });

  it('shows no-results when search matches nothing', () => {
    const searchState: BooksTabState = {
      ...defaultState,
      search: 'quantum',
    };
    render(<BooksTab {...defaultProps} state={searchState} />);

    screen.getByTestId('library-no-results');
    screen.getByText('No books match your search');
  });

  it('shows empty state when no books exist', () => {
    const onAddSubject = jest.fn();
    render(
      <BooksTab {...defaultProps} books={[]} onAddSubject={onAddSubject} />
    );

    screen.getByTestId('library-no-content');
    fireEvent.press(screen.getByTestId('library-add-subject-empty'));
    expect(onAddSubject).toHaveBeenCalledTimes(1);
  });

  it('shows book description when present', () => {
    render(<BooksTab {...defaultProps} />);
    screen.getByText('Intro to algebra');
    screen.getByText('Pyramids');
  });

  it('shows emoji badge from book data', () => {
    render(<BooksTab {...defaultProps} />);
    screen.getByText('📐');
    screen.getByText('🏛️');
  });

  it('propagates sort changes via onStateChange', () => {
    const onStateChange = jest.fn();
    render(<BooksTab {...defaultProps} onStateChange={onStateChange} />);

    fireEvent.press(screen.getByTestId('library-sort-button'));
    fireEvent.press(screen.getByText('Name (Z-A)'));

    expect(onStateChange).toHaveBeenCalledWith({
      ...defaultState,
      sortKey: 'name-desc',
    });
  });

  it('clear button in no-results resets search only when only search active', () => {
    const onStateChange = jest.fn();
    const searchState: BooksTabState = {
      ...defaultState,
      search: 'quantum',
    };
    render(
      <BooksTab
        {...defaultProps}
        state={searchState}
        onStateChange={onStateChange}
      />
    );

    screen.getByText('Clear search');
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith({
      ...searchState,
      search: '',
    });
  });

  it('shows "Clear all" when both search and filters are active with no results', () => {
    const onStateChange = jest.fn();
    const stateWithBoth: BooksTabState = {
      search: 'nonexistent',
      sortKey: 'name-asc',
      filters: { subjectIds: ['sub-999'], completion: [] },
    };
    render(
      <BooksTab
        {...defaultProps}
        state={stateWithBoth}
        onStateChange={onStateChange}
      />
    );

    screen.getByText('Clear all');
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith(BOOKS_TAB_INITIAL_STATE);
  });

  it('book card a11y label includes subject name (BUG-513)', () => {
    render(<BooksTab {...defaultProps} />);

    const card1 = screen.getByTestId('book-card-book-1');
    expect(card1.props.accessibilityLabel).toContain('Mathematics');
    expect(card1.props.accessibilityLabel).toContain('Algebra Basics');

    const card2 = screen.getByTestId('book-card-book-2');
    expect(card2.props.accessibilityLabel).toContain('History');
    expect(card2.props.accessibilityLabel).toContain('Ancient Egypt');
  });

  it('shows "Clear filters" when only filters cause no results', () => {
    const onStateChange = jest.fn();
    const filterOnlyState: BooksTabState = {
      search: '',
      sortKey: 'name-asc',
      filters: { subjectIds: ['sub-999'], completion: [] },
    };
    render(
      <BooksTab
        {...defaultProps}
        state={filterOnlyState}
        onStateChange={onStateChange}
      />
    );

    screen.getByText('Clear filters');
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith({
      ...filterOnlyState,
      filters: { subjectIds: [], completion: [] },
    });
  });

  it('exports BOOKS_TAB_INITIAL_STATE with correct defaults', () => {
    expect(BOOKS_TAB_INITIAL_STATE).toEqual({
      search: '',
      sortKey: 'name-asc',
      filters: { subjectIds: [], completion: [] },
    });
  });

  describe('shelf grouping', () => {
    const geometryBook: EnrichedBook = {
      ...algebraBook,
      book: { ...algebraBook.book, id: 'book-3', title: 'Geometry Basics' },
    };

    it('renders a shelf heading per subject with book + topic counts', () => {
      render(<BooksTab {...defaultProps} books={[algebraBook, egyptBook]} />);

      screen.getByTestId('books-shelf-heading-sub-1');
      screen.getByTestId('books-shelf-heading-sub-2');
      // Per-shelf topic totals come from summing per-book counts:
      // Mathematics shelf (algebraBook) = 8 topics; History shelf (egyptBook) = 6.
      expect(screen.getByTestId('books-shelf-count-sub-1').props.children).toBe(
        '1 book · 8 topics'
      );
      expect(screen.getByTestId('books-shelf-count-sub-2').props.children).toBe(
        '1 book · 6 topics'
      );
    });

    it('uses plural "books" and sums per-shelf topics when a shelf has multiple books', () => {
      render(
        <BooksTab
          {...defaultProps}
          books={[algebraBook, geometryBook, egyptBook]}
        />
      );

      // Mathematics shelf: 2 books (algebraBook 8 + geometryBook 8) = 16 topics
      expect(screen.getByTestId('books-shelf-count-sub-1').props.children).toBe(
        '2 books · 16 topics'
      );
      // History shelf: 1 book (egyptBook) = 6 topics
      expect(screen.getByTestId('books-shelf-count-sub-2').props.children).toBe(
        '1 book · 6 topics'
      );
    });

    it('uses singular "topic" when shelf has exactly one topic [BUG-885]', () => {
      const oneTopicBook: EnrichedBook = {
        ...algebraBook,
        topicCount: 1,
        completedCount: 0,
      };
      render(<BooksTab {...defaultProps} books={[oneTopicBook]} />);

      expect(screen.getByTestId('books-shelf-count-sub-1').props.children).toBe(
        '1 book · 1 topic'
      );
    });

    it('falls back to book-only count when per-book topic counts are missing', () => {
      const unbuiltBook: EnrichedBook = {
        ...algebraBook,
        topicCount: 0,
        completedCount: 0,
      };
      render(<BooksTab {...defaultProps} books={[unbuiltBook]} />);

      // No topics loaded yet → header omits the topics suffix
      expect(screen.getByTestId('books-shelf-count-sub-1').props.children).toBe(
        '1 book'
      );
    });

    it('orders shelf groups alphabetically by subject name', () => {
      render(<BooksTab {...defaultProps} books={[egyptBook, algebraBook]} />);

      const groups = screen.getAllByTestId(/^books-shelf-group-/);
      // History ("sub-2") comes before Mathematics ("sub-1") alphabetically.
      expect(groups[0].props.testID).toBe('books-shelf-group-sub-2');
      expect(groups[1].props.testID).toBe('books-shelf-group-sub-1');
    });
  });
});
