import { render, screen } from '@testing-library/react-native';
import { EngagementChip } from './EngagementChip';

describe('EngagementChip', () => {
  it('renders the configured label for a signal', () => {
    render(<EngagementChip signal="focused" />);

    screen.getByText('Focused');
  });

  it('uses positive localized labels for support states', () => {
    const { rerender } = render(<EngagementChip signal="stuck" />);

    screen.getByText('Working through it');
    expect(screen.queryByText('Stuck')).toBeNull();
    expect(
      screen.getByTestId('engagement-chip-stuck').props.accessibilityLabel,
    ).toBe('Engagement: Working through it');

    rerender(<EngagementChip signal="scattered" />);
    screen.getByText('Finding focus');
    expect(screen.queryByText('Scattered')).toBeNull();
    expect(
      screen.getByTestId('engagement-chip-scattered').props.accessibilityLabel,
    ).toBe('Engagement: Finding focus');
  });

  it('renders each supported engagement state with a stable test id', () => {
    const { rerender } = render(<EngagementChip signal="curious" />);

    screen.getByTestId('engagement-chip-curious');

    rerender(<EngagementChip signal="stuck" />);
    screen.getByTestId('engagement-chip-stuck');

    rerender(<EngagementChip signal="breezing" />);
    screen.getByTestId('engagement-chip-breezing');

    rerender(<EngagementChip signal="focused" />);
    screen.getByTestId('engagement-chip-focused');

    rerender(<EngagementChip signal="scattered" />);
    screen.getByTestId('engagement-chip-scattered');
  });
});
