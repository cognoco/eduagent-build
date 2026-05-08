import { render, screen } from '@testing-library/react-native';
import { RetentionPill } from './RetentionPill';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    retentionStrong: '#22c55e',
    retentionFading: '#eab308',
    retentionWeak: '#f97316',
    retentionForgotten: '#737373',
    textSecondary: '#525252',
  }),
}));

describe('RetentionPill', () => {
  it('renders still-remembered status with green dot and label', () => {
    render(<RetentionPill status="strong" />);
    expect(screen.getByText('Still remembered')).toBeTruthy();
    expect(screen.getByTestId('retention-pill-dot')).toBeTruthy();
  });

  it('renders getting-fuzzy status', () => {
    render(<RetentionPill status="fading" />);
    expect(screen.getByText('Getting fuzzy')).toBeTruthy();
  });

  it('renders compact variant (no label)', () => {
    render(<RetentionPill status="weak" size="small" />);
    expect(screen.queryByText('Needs a quick refresh')).toBeNull();
    expect(screen.getByTestId('retention-pill-dot')).toBeTruthy();
  });

  it('renders large variant', () => {
    render(<RetentionPill status="strong" size="large" />);
    expect(screen.getByText('Still remembered')).toBeTruthy();
  });

  it('renders elapsed-days copy when the review is at least two days old', () => {
    render(<RetentionPill status="strong" daysSinceLastReview={9} />);
    expect(screen.getByText('Remembered after 9 days')).toBeTruthy();
    expect(screen.getByTestId('retention-pill-elapsed')).toBeTruthy();
  });

  it('hides elapsed-days copy below the suppression threshold', () => {
    render(<RetentionPill status="fading" daysSinceLastReview={1} />);
    expect(screen.queryByText('Getting fuzzy after 1 day')).toBeNull();
    expect(screen.queryByTestId('retention-pill-elapsed')).toBeNull();
  });

  it('hides elapsed-days copy when the value is null', () => {
    render(<RetentionPill status="forgotten" daysSinceLastReview={null} />);
    expect(screen.queryByText(/Last seen/)).toBeNull();
    expect(screen.queryByTestId('retention-pill-elapsed')).toBeNull();
  });
});
