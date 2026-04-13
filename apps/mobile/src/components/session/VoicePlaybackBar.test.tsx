import { render, screen, fireEvent } from '@testing-library/react-native';
import { VoicePlaybackBar } from './VoicePlaybackBar';

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

    expect(screen.getByTestId('voice-replay-button')).toBeTruthy();
    expect(screen.getByTestId('voice-rate-button')).toBeTruthy();
  });

  it('hides stop and pause/resume buttons when not speaking', () => {
    render(<VoicePlaybackBar {...defaultProps} isSpeaking={false} />);

    expect(screen.queryByTestId('voice-stop-button')).toBeNull();
    expect(screen.queryByTestId('voice-pause-resume-button')).toBeNull();
  });

  it('shows stop and pause buttons when speaking', () => {
    render(<VoicePlaybackBar {...defaultProps} isSpeaking={true} />);

    expect(screen.getByTestId('voice-stop-button')).toBeTruthy();
    expect(screen.getByTestId('voice-pause-resume-button')).toBeTruthy();
  });

  it('shows pause icon when speaking and not paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={false} />
    );

    const pauseResumeButton = screen.getByTestId('voice-pause-resume-button');
    expect(pauseResumeButton).toBeTruthy();
    expect(screen.getByLabelText('Pause speaking')).toBeTruthy();
  });

  it('shows play icon when paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={true} />
    );

    expect(screen.getByLabelText('Resume speaking')).toBeTruthy();
  });

  it('calls onPause when pause button is pressed', () => {
    const onPause = jest.fn();
    render(
      <VoicePlaybackBar
        {...defaultProps}
        isSpeaking={true}
        isPaused={false}
        onPause={onPause}
      />
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
      />
    );

    fireEvent.press(screen.getByTestId('voice-pause-resume-button'));

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('shows stop button when paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={true} />
    );

    expect(screen.getByTestId('voice-stop-button')).toBeTruthy();
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
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} onStop={onStop} />
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
      />
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
      />
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
      />
    );

    fireEvent.press(screen.getByTestId('voice-rate-button'));

    expect(onRateChange).toHaveBeenCalledWith(1.0);
  });

  it('displays current rate', () => {
    render(<VoicePlaybackBar {...defaultProps} rate={0.75} />);

    expect(screen.getByText('0.75x')).toBeTruthy();
  });

  it('disables replay while speaking and not paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={false} />
    );

    const replay = screen.getByTestId('voice-replay-button');
    expect(replay.props.accessibilityState?.disabled).toBe(true);
  });

  it('enables replay when paused', () => {
    render(
      <VoicePlaybackBar {...defaultProps} isSpeaking={true} isPaused={true} />
    );

    const replay = screen.getByTestId('voice-replay-button');
    expect(replay.props.accessibilityState?.disabled).toBe(false);
  });

  // BUG-348: screenReaderEnabled prop and banner removed — the entire
  // VoicePlaybackBar is hidden at the ChatShell level when a screen reader
  // is active, so the component never renders with screenReaderEnabled.
});
