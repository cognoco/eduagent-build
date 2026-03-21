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
  rate: 1.0,
  onStop: jest.fn(),
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

  it('hides stop button when not speaking', () => {
    render(<VoicePlaybackBar {...defaultProps} isSpeaking={false} />);

    expect(screen.queryByTestId('voice-stop-button')).toBeNull();
  });

  it('shows stop button when speaking', () => {
    render(<VoicePlaybackBar {...defaultProps} isSpeaking={true} />);

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

  it('disables replay while speaking', () => {
    render(<VoicePlaybackBar {...defaultProps} isSpeaking={true} />);

    const replay = screen.getByTestId('voice-replay-button');
    expect(replay.props.accessibilityState?.disabled).toBe(true);
  });
});
