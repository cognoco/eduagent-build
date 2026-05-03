import { fireEvent, render, screen } from '@testing-library/react-native';
import { BookRow } from './BookRow';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#1a1a1a',
    textSecondary: '#525252',
    surfaceElevated: '#f3ede4',
    muted: '#a3a3a3',
    retentionStrong: '#15803d',
    retentionFading: '#a16207',
    retentionWeak: '#ea580c',
    retentionForgotten: '#737373',
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultProps = {
  bookId: 'book-42',
  title: 'Algebra Basics',
  topicProgress: '5/8',
  retentionStatus: 'strong' as const,
  hasNotes: false,
  onPress: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BookRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and topic progress', () => {
    render(<BookRow {...defaultProps} />);
    screen.getByText('Algebra Basics');
    screen.getByText('5/8 topics');
  });

  it('renders the tinted book icon tile', () => {
    render(<BookRow {...defaultProps} />);
    screen.getByTestId('book-row-icon-book-42');
  });

  it('calls onPress with bookId when pressed', () => {
    const onPress = jest.fn();
    render(<BookRow {...defaultProps} onPress={onPress} />);

    fireEvent.press(screen.getByTestId('book-row-book-42'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith('book-42');
  });

  it('renders Review pill when retentionStatus is weak', () => {
    render(<BookRow {...defaultProps} retentionStatus="weak" />);
    screen.getByTestId('book-row-review-book-42');
    screen.getByText('Review');
  });

  it('renders Review pill when retentionStatus is forgotten', () => {
    render(<BookRow {...defaultProps} retentionStatus="forgotten" />);
    screen.getByTestId('book-row-review-book-42');
  });

  it('does not render Review pill when retentionStatus is strong', () => {
    render(<BookRow {...defaultProps} retentionStatus="strong" />);
    expect(screen.queryByTestId('book-row-review-book-42')).toBeNull();
    expect(screen.queryByText('Review')).toBeNull();
  });

  it('does not render Review pill when retentionStatus is fading', () => {
    render(<BookRow {...defaultProps} retentionStatus="fading" />);
    expect(screen.queryByTestId('book-row-review-book-42')).toBeNull();
  });

  it('shows "not started" text when retentionStatus is null', () => {
    render(<BookRow {...defaultProps} retentionStatus={null} />);
    screen.getByText('not started');
    expect(screen.queryByTestId('book-row-review-book-42')).toBeNull();
  });

  it('shows notes indicator when hasNotes is true', () => {
    render(<BookRow {...defaultProps} hasNotes={true} />);
    screen.getByLabelText('Has notes');
  });

  it('hides notes indicator when hasNotes is false', () => {
    render(<BookRow {...defaultProps} hasNotes={false} />);
    expect(screen.queryByLabelText('Has notes')).toBeNull();
  });

  it('sets correct testID (book-row-{bookId})', () => {
    render(<BookRow {...defaultProps} bookId="book-99" />);
    expect(screen.getByTestId('book-row-book-99')).toBeTruthy();
  });

  it('sets accessibilityLabel with title, progress, retention, and notes info', () => {
    render(
      <BookRow
        {...defaultProps}
        bookId="book-1"
        title="Geometry"
        topicProgress="3/6"
        retentionStatus="fading"
        hasNotes={true}
      />
    );
    const row = screen.getByTestId('book-row-book-1');
    expect(row.props.accessibilityLabel).toBe(
      'Geometry, 3/6 topics, retention fading, has notes'
    );
  });

  it('accessibilityLabel omits retention when retentionStatus is null', () => {
    render(
      <BookRow
        {...defaultProps}
        bookId="book-2"
        title="Calculus"
        topicProgress="10/18"
        retentionStatus={null}
        hasNotes={false}
      />
    );
    const row = screen.getByTestId('book-row-book-2');
    expect(row.props.accessibilityLabel).toBe('Calculus, 10/18 topics');
  });

  it('accessibilityLabel includes "has notes" when hasNotes is true but no retention', () => {
    render(
      <BookRow
        {...defaultProps}
        bookId="book-3"
        title="Physics"
        topicProgress="2/4"
        retentionStatus={null}
        hasNotes={true}
      />
    );
    const row = screen.getByTestId('book-row-book-3');
    expect(row.props.accessibilityLabel).toBe('Physics, 2/4 topics, has notes');
  });
});
