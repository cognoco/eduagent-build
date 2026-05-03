import { render, screen } from '@testing-library/react-native';
import { RetentionPill } from './RetentionPill';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    retentionStrong: '#22c55e',
    retentionFading: '#eab308',
    retentionWeak: '#f97316',
    retentionForgotten: '#737373',
  }),
}));

describe('RetentionPill', () => {
  it('renders strong status with green dot and label', () => {
    render(<RetentionPill status="strong" />);
    expect(screen.getByText('Strong')).toBeTruthy();
    expect(screen.getByTestId('retention-pill-dot')).toBeTruthy();
  });

  it('renders fading status', () => {
    render(<RetentionPill status="fading" />);
    expect(screen.getByText('Fading')).toBeTruthy();
  });

  it('renders compact variant (no label)', () => {
    render(<RetentionPill status="weak" size="small" />);
    expect(screen.queryByText('Weak')).toBeNull();
    expect(screen.getByTestId('retention-pill-dot')).toBeTruthy();
  });

  it('renders large variant', () => {
    render(<RetentionPill status="strong" size="large" />);
    expect(screen.getByText('Strong')).toBeTruthy();
  });
});
