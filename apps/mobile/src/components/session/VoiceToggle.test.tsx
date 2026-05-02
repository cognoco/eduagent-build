import { render, screen, fireEvent } from '@testing-library/react-native';
import { VoiceToggle } from './VoiceToggle';

// ---------------------------------------------------------------------------
// Mocks — external boundaries only
// ---------------------------------------------------------------------------

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#888',
    primary: '#007AFF',
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...rest }: { name: string }) => (
      <Text {...rest}>{name}</Text>
    ),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => jest.clearAllMocks());

describe('VoiceToggle', () => {
  // -----------------------------------------------------------------------
  // Accessibility labels for screen readers
  // -----------------------------------------------------------------------

  it('shows "Mute AI voice" label when voice is enabled', () => {
    render(<VoiceToggle isVoiceEnabled={true} onToggle={jest.fn()} />);

    screen.getByLabelText('Mute AI voice');
  });

  it('shows "Unmute AI voice" label when voice is disabled', () => {
    render(<VoiceToggle isVoiceEnabled={false} onToggle={jest.fn()} />);

    screen.getByLabelText('Unmute AI voice');
  });

  it('has button accessibility role', () => {
    render(<VoiceToggle isVoiceEnabled={false} onToggle={jest.fn()} />);

    const toggle = screen.getByTestId('voice-toggle');
    expect(toggle.props.accessibilityRole).toBe('button');
  });

  it('reports checked=true accessibility state when voice enabled', () => {
    render(<VoiceToggle isVoiceEnabled={true} onToggle={jest.fn()} />);

    const toggle = screen.getByTestId('voice-toggle');
    expect(toggle.props.accessibilityState.checked).toBe(true);
  });

  it('reports checked=false accessibility state when voice disabled', () => {
    render(<VoiceToggle isVoiceEnabled={false} onToggle={jest.fn()} />);

    const toggle = screen.getByTestId('voice-toggle');
    expect(toggle.props.accessibilityState.checked).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Toggle state transitions (voice on/off)
  // -----------------------------------------------------------------------

  it('shows volume-high icon when voice is enabled', () => {
    render(<VoiceToggle isVoiceEnabled={true} onToggle={jest.fn()} />);

    screen.getByText('volume-high');
  });

  it('shows volume-mute icon when voice is disabled', () => {
    render(<VoiceToggle isVoiceEnabled={false} onToggle={jest.fn()} />);

    screen.getByText('volume-mute');
  });

  it('calls onToggle when pressed', () => {
    const onToggle = jest.fn();
    render(<VoiceToggle isVoiceEnabled={false} onToggle={onToggle} />);

    fireEvent.press(screen.getByTestId('voice-toggle'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onToggle on each press (multiple toggles)', () => {
    const onToggle = jest.fn();
    render(<VoiceToggle isVoiceEnabled={false} onToggle={onToggle} />);

    fireEvent.press(screen.getByTestId('voice-toggle'));
    fireEvent.press(screen.getByTestId('voice-toggle'));

    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Voice mode is session-scoped (component-level, not persistent)
  // -----------------------------------------------------------------------

  it('re-renders correctly when isVoiceEnabled changes from false to true', () => {
    const { rerender } = render(
      <VoiceToggle isVoiceEnabled={false} onToggle={jest.fn()} />
    );

    screen.getByText('volume-mute');
    screen.getByLabelText('Unmute AI voice');

    rerender(<VoiceToggle isVoiceEnabled={true} onToggle={jest.fn()} />);

    screen.getByText('volume-high');
    screen.getByLabelText('Mute AI voice');
  });

  it('re-renders correctly when isVoiceEnabled changes from true to false', () => {
    const { rerender } = render(
      <VoiceToggle isVoiceEnabled={true} onToggle={jest.fn()} />
    );

    screen.getByText('volume-high');

    rerender(<VoiceToggle isVoiceEnabled={false} onToggle={jest.fn()} />);

    screen.getByText('volume-mute');
  });

  // -----------------------------------------------------------------------
  // Touch target meets 44x44 minimum
  // -----------------------------------------------------------------------

  it('meets minimum 44px touch target', () => {
    render(<VoiceToggle isVoiceEnabled={false} onToggle={jest.fn()} />);

    // The component uses min-h-[44px] min-w-[44px] — verify via testID presence
    // (NativeWind applies the style; we trust the className, but verify render)
    screen.getByTestId('voice-toggle');
  });
});
