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
  retentionStatus: 'fading' as const,
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
    render(<ShelfRow {...defaultProps} isPaused={true} />);

    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('paused');
  });

  it('header accessibilityLabel mentions review needed when status is weak', () => {
    render(<ShelfRow {...defaultProps} retentionStatus="weak" />);
    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('review needed');
  });

  it('header accessibilityLabel mentions the open action', () => {
    render(<ShelfRow {...defaultProps} />);
    const header = screen.getByTestId('shelf-row-header-sub-math');
    expect(header.props.accessibilityLabel).toContain('open');
  });
});
