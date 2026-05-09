import { fireEvent, render, screen } from '@testing-library/react-native';
import { ShelfRow } from './ShelfRow';

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
    success: '#15803d',
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

  it('renders the tinted icon tile (no emoji)', () => {
    render(<ShelfRow {...defaultProps} />);
    screen.getByTestId('shelf-row-icon-sub-math');
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

  it('renders Review pill when reviewDueCount is positive', () => {
    render(<ShelfRow {...defaultProps} reviewDueCount={1} />);

    screen.getByTestId('shelf-row-review-sub-math');
    screen.getByText('Review');
  });

  it('does not render Review pill when no topics are overdue', () => {
    render(<ShelfRow {...defaultProps} reviewDueCount={0} />);

    expect(screen.queryByTestId('shelf-row-review-sub-math')).toBeNull();
    expect(screen.queryByText('Review')).toBeNull();
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
