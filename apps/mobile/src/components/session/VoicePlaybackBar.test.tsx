import { render, screen, fireEvent } from '@testing-library/react-native';
import { VoicePlaybackBar } from './VoicePlaybackBar';

jest.mock('../../lib/theme', () => ({
  // gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM
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

const defaultProps = {
  isSpeaking: false,
  isPaused: false,
  rate: 1.0,
  onStop: jest.fn(),
  onPause: jest.fn(),
  onResume: jest.fn(),
  onReplay: jest.fn(),
  onRateChange: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('VoicePlaybackBar', () => {
  it('renders replay and rate buttons', () => {
    render(<VoicePlaybackBar {...defaultProps} />);

    screen.getByTestId('voice-replay-button');
    screen.getByTestId('voice-rate-button');
  });

  it('hides stop and pause/resume buttons when not speaking', () => {
    render(<VoicePlaybackBar {...defaultProps} isSpeaking={false} />);

    expect(screen.queryByTestId('voice-stop-button')).toBeNull();
    expect(screen.queryByTestId('voice-pause-resume-button')).toBeNull();
  });

  it('shows stop and pause buttons when speaking', () => {
    render(<VoicePlaybackBar {...defaultProps} isSpeaking={true} />);

    screen.getByTestId('voice-stop-button');
    screen.getByTestId('voice-pause-resume-button');
  });

  it('shows pause icon when speaking and not paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={false} />,
    );

    screen.getByTestId('voice-pause-resume-button');
    screen.getByLabelText('Pause speaking');
  });

  it('shows play icon when paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={true} />,
    );

    screen.getByLabelText('Resume speaking');
  });

  it('calls onPause when pause button is pressed', () => {
    const onPause = jest.fn();
    render(
      <VoicePlaybackBar
        {...defaultProps}
        isSpeaking={true}
        isPaused={false}
        onPause={onPause}
      />,
    );

    fireEvent.press(screen.getByTestId('voice-pause-resume-button'));

    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('calls onResume when resume button is pressed', () => {
    const onResume = jest.fn();
    render(
      <VoicePlaybackBar
        {...defaultProps}
        isSpeaking={true}
        isPaused={true}
        onResume={onResume}
      />,
    );

    fireEvent.press(screen.getByTestId('voice-pause-resume-button'));

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('shows stop button when paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={true} />,
    );

    screen.getByTestId('voice-stop-button');
  });

  it('calls onReplay when replay is pressed', () => {
    const onReplay = jest.fn();
    render(<VoicePlaybackBar {...defaultProps} onReplay={onReplay} />);

    fireEvent.press(screen.getByTestId('voice-replay-button'));

    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it('calls onStop when stop is pressed', () => {
    const onStop = jest.fn();
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} onStop={onStop} />,
    );

    fireEvent.press(screen.getByTestId('voice-stop-button'));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('cycles rate 1.0 → 1.25 on press', () => {
    const onRateChange = jest.fn();
    render(
      <VoicePlaybackBar
        {...defaultProps}
        rate={1.0}
        onRateChange={onRateChange}
      />,
    );

    fireEvent.press(screen.getByTestId('voice-rate-button'));

    expect(onRateChange).toHaveBeenCalledWith(1.25);
  });

  it('cycles rate 1.25 → 0.75 on press', () => {
    const onRateChange = jest.fn();
    render(
      <VoicePlaybackBar
        {...defaultProps}
        rate={1.25}
        onRateChange={onRateChange}
      />,
    );

    fireEvent.press(screen.getByTestId('voice-rate-button'));

    expect(onRateChange).toHaveBeenCalledWith(0.75);
  });

  it('cycles rate 0.75 → 1.0 on press', () => {
    const onRateChange = jest.fn();
    render(
      <VoicePlaybackBar
        {...defaultProps}
        rate={0.75}
        onRateChange={onRateChange}
      />,
    );

    fireEvent.press(screen.getByTestId('voice-rate-button'));

    expect(onRateChange).toHaveBeenCalledWith(1.0);
  });

  it('displays current rate', () => {
    render(<VoicePlaybackBar {...defaultProps} rate={0.75} />);

    screen.getByText('0.75x');
  });

  it('disables replay while speaking and not paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={false} />,
    );

    const replay = screen.getByTestId('voice-replay-button');
    expect(replay.props.accessibilityState?.disabled).toBe(true);
  });

  it('enables replay when paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={true} />,
    );

    const replay = screen.getByTestId('voice-replay-button');
    expect(replay.props.accessibilityState?.disabled).toBe(false);
  });

  // BUG-348: screenReaderEnabled prop and banner removed — the entire
  // VoicePlaybackBar is hidden at the ChatShell level when a screen reader
  // is active, so the component never renders with screenReaderEnabled.

  // [a11y sweep] Break tests: decorative playback icons must be hidden from
  // screen readers — each Pressable parent already carries an accessibilityLabel.
  it('marks the replay icon wrapper as accessibility-hidden [a11y sweep]', () => {
    render(<VoicePlaybackBar {...defaultProps} />);
    const iconWrapper = screen.getByTestId('voice-replay-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
  });

  it('replay icon is excluded from default visible-only queries [a11y sweep]', () => {
    render(<VoicePlaybackBar {...defaultProps} />);
    expect(screen.queryByTestId('voice-replay-icon')).toBeNull();
  });

  it('marks the pause/resume icon wrapper as accessibility-hidden [a11y sweep]', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={false} />,
    );
    const iconWrapper = screen.getByTestId('voice-pause-resume-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
  });

  it('marks the stop icon wrapper as accessibility-hidden [a11y sweep]', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={false} />,
    );
    const iconWrapper = screen.getByTestId('voice-stop-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
  });
});
