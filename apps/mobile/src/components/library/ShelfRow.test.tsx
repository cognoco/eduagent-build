import { fireEvent, render, screen } from '@testing-library/react-native';
import { ShelfRow } from './ShelfRow';
import type { BookRowData } from './BookRow';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#1a1a1a',
    textSecondary: '#525252',
    surfaceElevated: '#f3ede4',
    warning: '#a16207',
    muted: '#a3a3a3',
    retentionStrong: '#15803d',
    retentionFading: '#a16207',
    retentionWeak: '#ea580c',
    retentionForgotten: '#737373',
  }),
  useSubjectTint: () => ({
    name: 'teal',
    solid: '#0f766e',
    soft: 'rgba(15,118,110,0.14)',
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleBooks: BookRowData[] = [
  {
    bookId: 'book-1',
    title: 'Algebra Basics',
    topicProgress: '5/8',
    retentionStatus: 'strong',
    hasNotes: false,
  },
  {
    bookId: 'book-2',
    title: 'Geometry',
    topicProgress: '3/6',
    retentionStatus: 'fading',
    hasNotes: true,
  },
  {
    bookId: 'book-3',
    title: 'Calculus',
    topicProgress: '10/18',
    retentionStatus: null,
    hasNotes: false,
  },
];

const defaultProps = {
  subjectId: 'sub-math',
  name: 'Mathematics',
  bookCount: 3,
  topicProgress: '18/32',
  retentionStatus: 'fading' as const,
  isPaused: false,
  expanded: false,
  books: sampleBooks,
  onToggle: jest.fn(),
  onBookPress: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShelfRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders collapsed state with subject name and book/topic summary', () => {
    render(<ShelfRow {...defaultProps} />);

    screen.getByTestId('shelf-row-header-sub-math');
    screen.getByText('Mathematics');
    screen.getByText('3 books · 18/32 topics');
  });

  it('renders the tinted icon tile (no emoji)', () => {
    render(<ShelfRow {...defaultProps} />);
    screen.getByTestId('shelf-row-icon-sub-math');
  });

  it('does not render book rows when collapsed', () => {
    render(<ShelfRow {...defaultProps} expanded={false} />);

    expect(screen.queryByTestId('book-row-book-1')).toBeNull();
    expect(screen.queryByTestId('book-row-book-2')).toBeNull();
    expect(screen.queryByTestId('book-row-book-3')).toBeNull();
  });

  it('renders expanded state with book rows visible', () => {
    render(<ShelfRow {...defaultProps} expanded={true} />);

    screen.getByTestId('book-row-book-1');
    screen.getByTestId('book-row-book-2');
    screen.getByTestId('book-row-book-3');
    screen.getByText('Algebra Basics');
    screen.getByText('Geometry');
    screen.getByText('Calculus');
  });

  it('calls onToggle with subjectId when header is pressed', () => {
    const onToggle = jest.fn();
    render(<ShelfRow {...defaultProps} onToggle={onToggle} />);

    fireEvent.press(screen.getByTestId('shelf-row-header-sub-math'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('sub-math');
  });

  it('calls onBookPress with subjectId and bookId when a book is tapped', () => {
    const onBookPress = jest.fn();
    render(
      <ShelfRow {...defaultProps} expanded={true} onBookPress={onBookPress} />
    );

    fireEvent.press(screen.getByTestId('book-row-book-2'));
    expect(onBookPress).toHaveBeenCalledTimes(1);
    expect(onBookPress).toHaveBeenCalledWith('sub-math', 'book-2');
  });

  it('renders paused chip when isPaused is true', () => {
    render(<ShelfRow {...defaultProps} isPaused={true} />);

    screen.getByTestId('shelf-row-paused-sub-math');
    screen.getByText('Paused');
  });

  it('does not render paused chip when isPaused is false', () => {
    render(<ShelfRow {...defaultProps} isPaused={false} />);

    expect(screen.queryByTestId('shelf-row-paused-sub-math')).toBeNull();
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('renders singular "book" label when bookCount is 1', () => {
    render(<ShelfRow {...defaultProps} bookCount={1} />);

    screen.getByText('1 book · 18/32 topics');
  });

  it('renders Review pill when retentionStatus is weak', () => {
    render(<ShelfRow {...defaultProps} retentionStatus="weak" />);

    screen.getByTestId('shelf-row-review-sub-math');
    screen.getByText('Review');
  });

  it('renders Review pill when retentionStatus is forgotten', () => {
    render(<ShelfRow {...defaultProps} retentionStatus="forgotten" />);

    screen.getByTestId('shelf-row-review-sub-math');
  });

  it('does not render Review pill when retentionStatus is strong', () => {
    render(<ShelfRow {...defaultProps} retentionStatus="strong" />);

    expect(screen.queryByTestId('shelf-row-review-sub-math')).toBeNull();
    expect(screen.queryByText('Review')).toBeNull();
  });

  it('does not render Review pill when retentionStatus is fading', () => {
    render(<ShelfRow {...defaultProps} retentionStatus="fading" />);

    expect(screen.queryByTestId('shelf-row-review-sub-math')).toBeNull();
  });

  it('does not render Review pill when retentionStatus is null', () => {
    render(<ShelfRow {...defaultProps} retentionStatus={null} />);

    expect(screen.queryByTestId('shelf-row-review-sub-math')).toBeNull();
  });

  it('header has correct accessibilityRole', () => {
    render(<ShelfRow {...defaultProps} />);

    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityRole).toBe('button');
  });

  it('header accessibilityLabel includes paused state', () => {
    render(<ShelfRow {...defaultProps} isPaused={true} expanded={false} />);

    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('paused');
  });

  it('header accessibilityLabel mentions review needed when status is weak', () => {
    render(<ShelfRow {...defaultProps} retentionStatus="weak" />);
    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('review needed');
  });

  it('header accessibilityLabel mentions expand/collapse state', () => {
    render(<ShelfRow {...defaultProps} expanded={false} />);
    const collapsedHeader = screen.getByTestId('shelf-row-header-sub-math');
    expect(collapsedHeader.props.accessibilityLabel).toContain('expand');

    render(<ShelfRow {...defaultProps} expanded={true} />);
    // Re-query for the newly rendered header
    const allHeaders = screen.getAllByTestId('shelf-row-header-sub-math');
    const expandedHeader = allHeaders[allHeaders.length - 1];
    expect(expandedHeader.props.accessibilityLabel).toContain('collapse');
  });

  it('shows "not started" for books with null retentionStatus when expanded', () => {
    render(<ShelfRow {...defaultProps} expanded={true} />);

    screen.getByText('not started');
  });

  it('shows notes indicator for books with hasNotes=true when expanded', () => {
    render(<ShelfRow {...defaultProps} expanded={true} />);

    // book-2 has hasNotes=true
    screen.getByLabelText('Has notes');
  });
});
