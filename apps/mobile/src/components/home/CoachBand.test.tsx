import { render, fireEvent } from '@testing-library/react-native';
import { CoachBand, type CoachBandProps } from './CoachBand';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    primarySoft: 'rgba(45,212,191,0.16)',
    primary: '#2dd4bf',
    secondary: '#a78bfa',
    textTertiary: '#94a3b8',
    textInverse: '#ffffff',
    border: '#2a2a54',
  }),
}));

describe('CoachBand', () => {
  const baseProps: CoachBandProps = {
    headline: 'Pick up where you stopped in Linear equations.',
    topicHighlight: 'Linear equations',
    eyebrow: 'TONIGHT',
    estimatedMinutes: 4,
    onContinue: jest.fn(),
    onDismiss: jest.fn(),
  };

  it('renders nothing when headline is null', () => {
    const { queryByTestId } = render(
      <CoachBand {...baseProps} headline={null} />
    );
    expect(queryByTestId('home-coach-band')).toBeNull();
  });

  it('renders the headline with topic highlighted', () => {
    const { getByTestId, getByText } = render(<CoachBand {...baseProps} />);
    expect(getByTestId('home-coach-band')).toBeTruthy();
    expect(getByText(/Linear equations/)).toBeTruthy();
  });

  it('fires onContinue when Continue is tapped', () => {
    const onContinue = jest.fn();
    const { getByTestId } = render(
      <CoachBand {...baseProps} onContinue={onContinue} />
    );
    fireEvent.press(getByTestId('home-coach-band-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when dismiss is tapped', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <CoachBand {...baseProps} onDismiss={onDismiss} />
    );
    fireEvent.press(getByTestId('home-coach-band-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders eyebrow text', () => {
    const { getByText } = render(<CoachBand {...baseProps} />);
    expect(getByText(/TONIGHT/)).toBeTruthy();
  });

  it('renders estimated minutes', () => {
    const { getByText } = render(<CoachBand {...baseProps} />);
    expect(getByText('4 min')).toBeTruthy();
  });
});
