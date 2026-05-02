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
    textSecondary: '#666',
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

    screen.getByTestId('voice-record-button');
    // Icon is a11y-hidden — must use includeHiddenElements to find it
    screen.getByText('mic', { includeHiddenElements: true });
  });

  it('renders with stop icon when listening', () => {
    render(
      <VoiceRecordButton
        isListening={true}
        onPress={jest.fn()}
        disabled={false}
      />
    );

    // Icon is a11y-hidden — must use includeHiddenElements to find it
    screen.getByText('stop', { includeHiddenElements: true });
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

    screen.getByLabelText('Start recording');
  });

  it('has correct accessibility label when listening', () => {
    render(
      <VoiceRecordButton
        isListening={true}
        onPress={jest.fn()}
        disabled={false}
      />
    );

    screen.getByLabelText('Stop recording');
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
    screen.getByTestId('voice-record-button');
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
    screen.getByTestId('voice-record-button');
  });

  // [a11y sweep] Break tests: decorative mic/stop icon must be hidden from
  // screen readers — the Pressable's accessibilityLabel already conveys the action.
  it('marks the mic/stop icon wrapper as accessibility-hidden [a11y sweep]', () => {
    render(
      <VoiceRecordButton
        isListening={false}
        onPress={jest.fn()}
        disabled={false}
      />
    );
    // includeHiddenElements required because the wrapper is itself a11y-hidden.
    const iconWrapper = screen.getByTestId('voice-record-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
  });

  it('mic/stop icon is excluded from default visible-only queries [a11y sweep]', () => {
    render(
      <VoiceRecordButton
        isListening={false}
        onPress={jest.fn()}
        disabled={false}
      />
    );
    expect(screen.queryByTestId('voice-record-icon')).toBeNull();
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

    screen.getByText('Plants use sunlight');
    screen.getByTestId('voice-send-button');
    screen.getByTestId('voice-discard-button');
    screen.getByTestId('voice-rerecord-button');
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

  it('renders Re-record and Discard as icon-only with screen-reader labels [BUG-715]', () => {
    render(
      <VoiceTranscriptPreview
        transcript="Hello"
        onSend={jest.fn()}
        onDiscard={jest.fn()}
        onReRecord={jest.fn()}
      />
    );
    // No visible text label for the secondary actions
    expect(screen.queryByText('Discard')).toBeNull();
    expect(screen.queryByText('Re-record')).toBeNull();
    // Icons rendered (the @expo/vector-icons mock prints icon name as Text)
    screen.getByText('refresh-outline');
    screen.getByText('trash-outline');
    // Screen-reader labels and tap targets preserved
    const reRecord = screen.getByTestId('voice-rerecord-button');
    const discard = screen.getByTestId('voice-discard-button');
    expect(reRecord.props.accessibilityLabel).toBe('Re-record');
    expect(discard.props.accessibilityLabel).toBe('Discard recording');
    expect(reRecord.props.className).toContain('min-w-[44px]');
    expect(reRecord.props.className).toContain('min-h-[44px]');
    expect(discard.props.className).toContain('min-w-[44px]');
    expect(discard.props.className).toContain('min-h-[44px]');
  });
});
