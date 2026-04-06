import { render, screen, fireEvent } from '@testing-library/react-native';
import { VoiceRecordButton, VoiceTranscriptPreview } from './VoiceRecordButton';

// ---------------------------------------------------------------------------
// Mocks — external boundaries only
// ---------------------------------------------------------------------------

const mockHapticLight = jest.fn();
const mockHapticMedium = jest.fn();
const mockHapticSuccess = jest.fn();

jest.mock('../../lib/haptics', () => ({
  hapticLight: () => mockHapticLight(),
  hapticMedium: () => mockHapticMedium(),
  hapticSuccess: () => mockHapticSuccess(),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#888',
    primary: '#007AFF',
    textInverse: '#fff',
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
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// VoiceRecordButton
// ---------------------------------------------------------------------------

describe('VoiceRecordButton', () => {
  it('renders with mic icon when not listening', () => {
    render(
      <VoiceRecordButton
        isListening={false}
        onPress={jest.fn()}
        disabled={false}
      />
    );

    expect(screen.getByTestId('voice-record-button')).toBeTruthy();
    expect(screen.getByText('mic')).toBeTruthy();
  });

  it('renders with stop icon when listening', () => {
    render(
      <VoiceRecordButton
        isListening={true}
        onPress={jest.fn()}
        disabled={false}
      />
    );

    expect(screen.getByText('stop')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Haptic feedback (FR147)
  // -----------------------------------------------------------------------

  it('triggers light haptic when starting recording', () => {
    const onPress = jest.fn();
    render(
      <VoiceRecordButton
        isListening={false}
        onPress={onPress}
        disabled={false}
      />
    );

    fireEvent.press(screen.getByTestId('voice-record-button'));

    expect(mockHapticLight).toHaveBeenCalledTimes(1);
    expect(mockHapticMedium).not.toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('triggers medium haptic when stopping recording', () => {
    const onPress = jest.fn();
    render(
      <VoiceRecordButton
        isListening={true}
        onPress={onPress}
        disabled={false}
      />
    );

    fireEvent.press(screen.getByTestId('voice-record-button'));

    expect(mockHapticMedium).toHaveBeenCalledTimes(1);
    expect(mockHapticLight).not.toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Disabled state
  // -----------------------------------------------------------------------

  it('prevents interaction when disabled', () => {
    const onPress = jest.fn();
    render(
      <VoiceRecordButton
        isListening={false}
        onPress={onPress}
        disabled={true}
      />
    );

    const button = screen.getByTestId('voice-record-button');
    expect(button.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(button);

    // Pressable with disabled=true should not fire onPress
    expect(onPress).not.toHaveBeenCalled();
    expect(mockHapticLight).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Accessibility labels
  // -----------------------------------------------------------------------

  it('has correct accessibility label when not listening', () => {
    render(
      <VoiceRecordButton
        isListening={false}
        onPress={jest.fn()}
        disabled={false}
      />
    );

    expect(screen.getByLabelText('Start recording')).toBeTruthy();
  });

  it('has correct accessibility label when listening', () => {
    render(
      <VoiceRecordButton
        isListening={true}
        onPress={jest.fn()}
        disabled={false}
      />
    );

    expect(screen.getByLabelText('Stop recording')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Animation states (pulse during listening)
  // -----------------------------------------------------------------------

  it('wraps button in Animated.View for pulse animation', () => {
    const { toJSON } = render(
      <VoiceRecordButton
        isListening={true}
        onPress={jest.fn()}
        disabled={false}
      />
    );

    // The component renders — Animated.View wraps the Pressable.
    // Reanimated is mocked by jest-expo, so we verify the tree renders
    // without crashing and the button is accessible.
    expect(screen.getByTestId('voice-record-button')).toBeTruthy();
    expect(toJSON()).toBeTruthy();
  });

  it('renders without animation crash when not listening', () => {
    const { toJSON } = render(
      <VoiceRecordButton
        isListening={false}
        onPress={jest.fn()}
        disabled={false}
      />
    );

    expect(toJSON()).toBeTruthy();
    expect(screen.getByTestId('voice-record-button')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// VoiceTranscriptPreview
// ---------------------------------------------------------------------------

describe('VoiceTranscriptPreview', () => {
  it('renders transcript text and action buttons', () => {
    render(
      <VoiceTranscriptPreview
        transcript="Plants use sunlight"
        onSend={jest.fn()}
        onDiscard={jest.fn()}
        onReRecord={jest.fn()}
      />
    );

    expect(screen.getByText('Plants use sunlight')).toBeTruthy();
    expect(screen.getByTestId('voice-send-button')).toBeTruthy();
    expect(screen.getByTestId('voice-discard-button')).toBeTruthy();
    expect(screen.getByTestId('voice-rerecord-button')).toBeTruthy();
  });

  it('returns null when transcript is empty', () => {
    const { toJSON } = render(
      <VoiceTranscriptPreview
        transcript=""
        onSend={jest.fn()}
        onDiscard={jest.fn()}
        onReRecord={jest.fn()}
      />
    );

    expect(toJSON()).toBeNull();
  });

  it('triggers success haptic on send', () => {
    const onSend = jest.fn();
    render(
      <VoiceTranscriptPreview
        transcript="My answer"
        onSend={onSend}
        onDiscard={jest.fn()}
        onReRecord={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId('voice-send-button'));

    expect(mockHapticSuccess).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('triggers light haptic on discard', () => {
    const onDiscard = jest.fn();
    render(
      <VoiceTranscriptPreview
        transcript="Discard me"
        onSend={jest.fn()}
        onDiscard={onDiscard}
        onReRecord={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId('voice-discard-button'));

    expect(mockHapticLight).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('calls onReRecord when re-record is pressed', () => {
    const onReRecord = jest.fn();
    render(
      <VoiceTranscriptPreview
        transcript="Re-record me"
        onSend={jest.fn()}
        onDiscard={jest.fn()}
        onReRecord={onReRecord}
      />
    );

    fireEvent.press(screen.getByTestId('voice-rerecord-button'));

    expect(onReRecord).toHaveBeenCalledTimes(1);
  });
});
