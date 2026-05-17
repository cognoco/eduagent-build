import { fireEvent, render, screen } from '@testing-library/react-native';
import { ShelfRow } from './ShelfRow';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../lib/theme' /* gc1-allow: ThemeProvider requires native env; unit test cannot render it */,
  () => ({
    useThemeColors: () => ({
      retentionWeak: '#b45309',
      success: '#16a34a',
      textPrimary: '#111827',
      textSecondary: '#6b7280',
      warning: '#d97706',
    }),
    useSubjectTint: () => ({
      solid: '#2f6fbd',
      soft: '#edf3ff',
    }),
  }),
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultProps = {
  subjectId: 'sub-math',
  name: 'Mathematics',
  bookCount: 3,
  topicProgress: '18/32',
  reviewDueCount: 0,
  isFinished: false,
  isPaused: false,
  onPress: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShelfRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders subject name and book/topic summary', () => {
    render(<ShelfRow {...defaultProps} />);

    screen.getByTestId('shelf-row-header-sub-math');
    screen.getByText('Mathematics');
    screen.getByText('3 books · 18/32 topics');
  });

  it('renders the subject bookshelf motif', () => {
    render(<ShelfRow {...defaultProps} />);
    screen.getByTestId('shelf-row-bookshelf-sub-math');
  });

  it('renders each shelf as an open shelf row instead of a boxed card', () => {
    render(<ShelfRow {...defaultProps} />);

    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.style).toEqual(
      expect.objectContaining({
        alignItems: 'center',
        backgroundColor: 'transparent',
        borderRadius: 10,
        borderWidth: 0,
        elevation: 0,
        flexDirection: 'row',
        minHeight: 90,
        paddingBottom: 20,
        paddingTop: 12,
        shadowColor: '#2f6fbd',
      }),
    );
    screen.getByTestId('shelf-row-backboard-sub-math');
    screen.getByTestId('shelf-row-depth-sub-math');
    screen.getByTestId('shelf-row-rail-sub-math');
  });

  it('opens the subject shelf when header is pressed', () => {
    const onPress = jest.fn();
    render(<ShelfRow {...defaultProps} onPress={onPress} />);

    fireEvent.press(screen.getByTestId('shelf-row-header-sub-math'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith('sub-math');
  });

  it('renders paused chip when isPaused is true', () => {
    render(<ShelfRow {...defaultProps} isPaused={true} />);

    screen.getByTestId('shelf-row-paused-sub-math');
    screen.getByText('Paused');
  });

  it('renders archived chip when status is archived', () => {
    render(<ShelfRow {...defaultProps} status="archived" />);

    screen.getByTestId('shelf-row-archived-sub-math');
    screen.getByText('Archived');
    expect(screen.queryByTestId('shelf-row-paused-sub-math')).toBeNull();
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

  it('renders "Start learning" when subject has no books or topics', () => {
    render(<ShelfRow {...defaultProps} bookCount={0} topicProgress="0/0" />);

    screen.getByText('Start learning');
    expect(screen.queryByText(/books/)).toBeNull();
  });

  it('renders Review pill when reviewDueCount is positive', () => {
    render(<ShelfRow {...defaultProps} reviewDueCount={1} />);

    screen.getByTestId('shelf-row-review-sub-math');
    screen.getByText('Keep it fresh');
  });

  it('does not render Review pill when no topics are overdue', () => {
    render(<ShelfRow {...defaultProps} reviewDueCount={0} />);

    expect(screen.queryByTestId('shelf-row-review-sub-math')).toBeNull();
    expect(screen.queryByText('Keep it fresh')).toBeNull();
  });

  it('renders Finished pill when the shelf is finished and no topics are overdue', () => {
    render(<ShelfRow {...defaultProps} isFinished />);

    screen.getByTestId('shelf-row-finished-sub-math');
    screen.getByText('Finished');
  });

  it('does not render Finished pill when review is due', () => {
    render(<ShelfRow {...defaultProps} isFinished reviewDueCount={1} />);

    screen.getByTestId('shelf-row-review-sub-math');
    expect(screen.queryByTestId('shelf-row-finished-sub-math')).toBeNull();
  });

  it('header has correct accessibilityRole', () => {
    render(<ShelfRow {...defaultProps} />);

    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityRole).toBe('button');
  });

  it('header accessibilityLabel includes paused state', () => {
    render(<ShelfRow {...defaultProps} isPaused={true} />);

    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('paused');
  });

  it('header accessibilityLabel includes archived state', () => {
    render(<ShelfRow {...defaultProps} status="archived" />);

    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('archived');
  });

  it('header accessibilityLabel mentions review needed when topics are overdue', () => {
    render(<ShelfRow {...defaultProps} reviewDueCount={1} />);
    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('review needed');
  });

  it('header accessibilityLabel mentions finished when the shelf is finished', () => {
    render(<ShelfRow {...defaultProps} isFinished />);
    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('finished');
  });

  it('header accessibilityLabel mentions the open action', () => {
    render(<ShelfRow {...defaultProps} />);
    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('open');
  });
});
