import { render, fireEvent } from '@testing-library/react-native';
import { CoachBand, type CoachBandProps } from './CoachBand';

describe('CoachBand', () => {
  const baseProps: CoachBandProps = {
    headline: 'Pick up where you stopped in Linear equations.',
    eyebrow: 'TONIGHT',
    estimatedMinutes: 4,
    onContinue: jest.fn(),
    onDismiss: jest.fn(),
  };

  it('renders nothing when headline is null', () => {
    const { queryByTestId } = render(
      <CoachBand {...baseProps} headline={null} />,
    );
    expect(queryByTestId('home-coach-band')).toBeNull();
  });

  it('renders the headline', () => {
    const { getByTestId, getByText } = render(<CoachBand {...baseProps} />);
    expect(getByTestId('home-coach-band'));
    expect(getByText(/Linear equations/));
  });

  it('fires onContinue when Continue is tapped', () => {
    const onContinue = jest.fn();
    const { getByTestId } = render(
      <CoachBand {...baseProps} onContinue={onContinue} />,
    );
    fireEvent.press(getByTestId('home-coach-band-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when dismiss is tapped', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <CoachBand {...baseProps} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByTestId('home-coach-band-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the dismiss control at least a 44px touch target', () => {
    const { getByTestId } = render(<CoachBand {...baseProps} />);

    expect(getByTestId('home-coach-band-dismiss').props.hitSlop).toEqual({
      top: 12,
      bottom: 12,
      left: 18,
      right: 18,
    });
  });

  it('renders explicit eyebrow text', () => {
    const { getByText } = render(<CoachBand {...baseProps} />);
    expect(getByText(/TONIGHT/));
  });

  it('renders time-aware eyebrow when none provided', () => {
    const morning = new Date('2026-05-03T09:00:00');
    const afternoon = new Date('2026-05-03T14:00:00');
    const evening = new Date('2026-05-03T20:00:00');

    const { unmount, getByText } = render(
      <CoachBand {...baseProps} eyebrow={undefined} now={morning} />,
    );
    expect(getByText(/THIS MORNING/));
    unmount();

    const { unmount: u2, getByText: g2 } = render(
      <CoachBand {...baseProps} eyebrow={undefined} now={afternoon} />,
    );
    expect(g2(/THIS AFTERNOON/)).toBeTruthy();
    u2();

    const { getByText: g3 } = render(
      <CoachBand {...baseProps} eyebrow={undefined} now={evening} />,
    );
    expect(g3(/TONIGHT/)).toBeTruthy();
  });

  it('renders estimated minutes', () => {
    const { getByText } = render(<CoachBand {...baseProps} />);
    expect(getByText('4 min'));
  });
});
