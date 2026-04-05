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

    expect(screen.getByTestId('book-card-book-1')).toBeTruthy();
    expect(screen.getByTestId('book-card-book-2')).toBeTruthy();
    expect(screen.getByText('Algebra Basics')).toBeTruthy();
    expect(screen.getByText('Ancient Egypt')).toBeTruthy();
    // Parent subject names shown
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    // Status labels
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
    // Progress labels
    expect(screen.getByText('4/8 topics')).toBeTruthy();
    expect(screen.getByText('6/6 topics')).toBeTruthy();
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

    expect(screen.getByTestId('library-no-results')).toBeTruthy();
    expect(screen.getByText('No books match your search')).toBeTruthy();
  });

  it('shows empty state when no books exist', () => {
    const onAddSubject = jest.fn();
    render(
      <BooksTab {...defaultProps} books={[]} onAddSubject={onAddSubject} />
    );

    expect(screen.getByTestId('library-no-content')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-add-subject-empty'));
    expect(onAddSubject).toHaveBeenCalledTimes(1);
  });

  it('shows book description when present', () => {
    render(<BooksTab {...defaultProps} />);
    expect(screen.getByText('Intro to algebra')).toBeTruthy();
    expect(screen.getByText('Pyramids')).toBeTruthy();
  });

  it('shows emoji badge from book data', () => {
    render(<BooksTab {...defaultProps} />);
    expect(screen.getByText('📐')).toBeTruthy();
    expect(screen.getByText('🏛️')).toBeTruthy();
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

    expect(screen.getByText('Clear search')).toBeTruthy();
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

    expect(screen.getByText('Clear all')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith(BOOKS_TAB_INITIAL_STATE);
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

    expect(screen.getByText('Clear filters')).toBeTruthy();
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
});
