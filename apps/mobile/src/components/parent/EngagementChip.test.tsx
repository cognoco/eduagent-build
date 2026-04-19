import { render, screen } from '@testing-library/react-native';
import { EngagementChip } from './EngagementChip';

describe('EngagementChip', () => {
  it('renders the configured label for a signal', () => {
    render(<EngagementChip signal="focused" />);

    expect(screen.getByText('Focused')).toBeTruthy();
  });

  it('renders each supported engagement state with a stable test id', () => {
    const { rerender } = render(<EngagementChip signal="curious" />);

    expect(screen.getByTestId('engagement-chip-curious')).toBeTruthy();

    rerender(<EngagementChip signal="stuck" />);
    expect(screen.getByTestId('engagement-chip-stuck')).toBeTruthy();

    rerender(<EngagementChip signal="breezing" />);
    expect(screen.getByTestId('engagement-chip-breezing')).toBeTruthy();

    rerender(<EngagementChip signal="focused" />);
    expect(screen.getByTestId('engagement-chip-focused')).toBeTruthy();

    rerender(<EngagementChip signal="scattered" />);
    expect(screen.getByTestId('engagement-chip-scattered')).toBeTruthy();
  });
});
