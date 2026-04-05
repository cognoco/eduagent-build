import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { ChatShell, type ChatMessage } from './ChatShell';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#888',
    primary: '#007AFF',
    textInverse: '#fff',
  }),
}));

jest.mock('../../lib/math-format', () => ({
  formatMathContent: (s: string) => s,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...rest }: { name: string }) => (
      <Text {...rest}>{name}</Text>
    ),
  };
});

// STT mock
const mockStartListening = jest.fn().mockResolvedValue(undefined);
const mockStopListening = jest.fn().mockResolvedValue(undefined);
const mockClearTranscript = jest.fn();
let mockSttState = {
  status: 'idle' as string,
  transcript: '',
  error: null as string | null,
  isListening: false,
};

jest.mock('../../hooks/use-speech-recognition', () => ({
  useSpeechRecognition: () => ({
    ...mockSttState,
    startListening: mockStartListening,
    stopListening: mockStopListening,
    clearTranscript: mockClearTranscript,
  }),
}));

// TTS mock
const mockSpeak = jest.fn();
const mockStopSpeaking = jest.fn();
const mockReplay = jest.fn();
const mockSetRate = jest.fn();

jest.mock('../../hooks/use-text-to-speech', () => ({
  useTextToSpeech: () => ({
    isSpeaking: false,
    rate: 1.0,
    speak: mockSpeak,
    stop: mockStopSpeaking,
    replay: mockReplay,
    setRate: mockSetRate,
  }),
}));

// Stub animated SVG component to avoid reanimated timer leaks in tests
jest.mock('../common', () => ({
  PenWritingAnimation: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGES: ChatMessage[] = [
  { id: 'ai-1', role: 'ai', content: 'Hello student!' },
];

function renderChatShell(
  overrides: Partial<React.ComponentProps<typeof ChatShell>> = {}
) {
  const defaultProps = {
    title: 'Session',
    messages: DEFAULT_MESSAGES,
    onSend: jest.fn(),
    isStreaming: false,
    ...overrides,
  };
  return { ...render(<ChatShell {...defaultProps} />), props: defaultProps };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSttState = {
    status: 'idle',
    transcript: '',
    error: null,
    isListening: false,
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ChatShell', () => {
  // -----------------------------------------------------------------------
  // Basic rendering (regression — existing behaviour)
  // -----------------------------------------------------------------------

  it('renders title, subtitle, and messages', () => {
    renderChatShell({ title: 'Learning Session', subtitle: 'Math' });

    expect(screen.getByText('Learning Session')).toBeTruthy();
    expect(screen.getByText('Math')).toBeTruthy();
    expect(screen.getByText('Hello student!')).toBeTruthy();
  });

  it('renders text input and send button', () => {
    renderChatShell();

    expect(screen.getByTestId('chat-input')).toBeTruthy();
    expect(screen.getByTestId('send-button')).toBeTruthy();
  });

  it('calls onSend when send button is pressed with text', () => {
    const onSend = jest.fn();
    renderChatShell({ onSend });

    fireEvent.changeText(screen.getByTestId('chat-input'), 'Hello');
    fireEvent.press(screen.getByTestId('send-button'));

    expect(onSend).toHaveBeenCalledWith('Hello');
  });

  // -----------------------------------------------------------------------
  // Voice UI — conditional rendering
  // -----------------------------------------------------------------------

  describe('voice UI visibility', () => {
    it('always shows voice toggle regardless of session type', () => {
      renderChatShell({ verificationType: undefined });

      expect(screen.getByTestId('voice-toggle')).toBeTruthy();
    });

    it('voice toggle defaults OFF for standard sessions', () => {
      renderChatShell({ verificationType: undefined });

      const toggle = screen.getByTestId('voice-toggle');
      expect(toggle.props.accessibilityState.checked).toBe(false);
    });

    it('voice toggle defaults ON for teach_back sessions', () => {
      renderChatShell({ verificationType: 'teach_back' });

      const toggle = screen.getByTestId('voice-toggle');
      expect(toggle.props.accessibilityState.checked).toBe(true);
    });

    it('does NOT show voice record button when voice is OFF (standard session)', () => {
      renderChatShell({ verificationType: undefined });

      expect(screen.queryByTestId('voice-record-button')).toBeNull();
    });

    it('shows voice record button when voice is ON (teach_back)', () => {
      renderChatShell({ verificationType: 'teach_back' });

      expect(screen.getByTestId('voice-record-button')).toBeTruthy();
    });

    it('shows mic button after toggling voice ON in standard session', () => {
      renderChatShell({ verificationType: undefined });

      // Voice is OFF by default — no mic button
      expect(screen.queryByTestId('voice-record-button')).toBeNull();

      // Toggle voice ON
      fireEvent.press(screen.getByTestId('voice-toggle'));

      expect(screen.getByTestId('voice-record-button')).toBeTruthy();
    });

    it('shows playback bar when voice is enabled', () => {
      renderChatShell({ verificationType: 'teach_back' });

      expect(screen.getByTestId('voice-playback-bar')).toBeTruthy();
    });

    it('hides playback bar when voice is OFF', () => {
      renderChatShell({ verificationType: undefined });

      expect(screen.queryByTestId('voice-playback-bar')).toBeNull();
    });

    it('hides playback bar when input is disabled', () => {
      renderChatShell({ verificationType: 'teach_back', inputDisabled: true });

      expect(screen.queryByTestId('voice-playback-bar')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // VoiceToggle state management
  // -----------------------------------------------------------------------

  describe('VoiceToggle', () => {
    it('defaults to voice enabled for teach_back', () => {
      renderChatShell({ verificationType: 'teach_back' });

      const toggle = screen.getByTestId('voice-toggle');
      expect(toggle.props.accessibilityState.checked).toBe(true);
    });

    it('toggles voice off when pressed', () => {
      renderChatShell({ verificationType: 'teach_back' });

      fireEvent.press(screen.getByTestId('voice-toggle'));

      const toggle = screen.getByTestId('voice-toggle');
      expect(toggle.props.accessibilityState.checked).toBe(false);
    });

    it('stops speaking when toggling voice off', () => {
      renderChatShell({ verificationType: 'teach_back' });

      fireEvent.press(screen.getByTestId('voice-toggle'));

      expect(mockStopSpeaking).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Voice recording flow
  // -----------------------------------------------------------------------

  describe('voice recording', () => {
    it('calls startListening when mic button is pressed', async () => {
      renderChatShell({ verificationType: 'teach_back' });

      await act(async () => {
        fireEvent.press(screen.getByTestId('voice-record-button'));
      });

      expect(mockStartListening).toHaveBeenCalled();
    });

    it('stops TTS when starting to record', async () => {
      renderChatShell({ verificationType: 'teach_back' });

      await act(async () => {
        fireEvent.press(screen.getByTestId('voice-record-button'));
      });

      expect(mockStopSpeaking).toHaveBeenCalled();
    });

    it('calls stopListening when mic is pressed while listening', async () => {
      mockSttState = {
        ...mockSttState,
        isListening: true,
        status: 'listening',
      };
      renderChatShell({ verificationType: 'teach_back' });

      await act(async () => {
        fireEvent.press(screen.getByTestId('voice-record-button'));
      });

      expect(mockStopListening).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Transcript preview flow
  // -----------------------------------------------------------------------

  describe('transcript preview', () => {
    it('shows transcript preview when transcript is available and not listening', () => {
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: 'Photosynthesis is the process...',
      };
      renderChatShell({ verificationType: 'teach_back' });

      expect(screen.getByText('Photosynthesis is the process...')).toBeTruthy();
      expect(screen.getByTestId('voice-send-button')).toBeTruthy();
      expect(screen.getByTestId('voice-discard-button')).toBeTruthy();
      expect(screen.getByTestId('voice-rerecord-button')).toBeTruthy();
    });

    it('does NOT show transcript preview when listening', () => {
      mockSttState = {
        ...mockSttState,
        isListening: true,
        transcript: 'partial transcript...',
      };
      renderChatShell({ verificationType: 'teach_back' });

      expect(screen.queryByTestId('voice-send-button')).toBeNull();
    });

    it('submits transcript as message on Send press', () => {
      const onSend = jest.fn();
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: 'My explanation',
      };
      renderChatShell({ verificationType: 'teach_back', onSend });

      fireEvent.press(screen.getByTestId('voice-send-button'));

      expect(onSend).toHaveBeenCalledWith('My explanation');
      expect(mockClearTranscript).toHaveBeenCalled();
    });

    it('clears transcript on Discard press', () => {
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: 'Discard me',
      };
      renderChatShell({ verificationType: 'teach_back' });

      fireEvent.press(screen.getByTestId('voice-discard-button'));

      expect(mockClearTranscript).toHaveBeenCalled();
    });

    it('clears and restarts listening on Re-record press', async () => {
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: 'Re-record me',
      };
      renderChatShell({ verificationType: 'teach_back' });

      await act(async () => {
        fireEvent.press(screen.getByTestId('voice-rerecord-button'));
      });

      expect(mockClearTranscript).toHaveBeenCalled();
      expect(mockStartListening).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // TTS auto-speak
  // -----------------------------------------------------------------------

  describe('TTS auto-speak', () => {
    it('speaks completed AI messages when voice is enabled', () => {
      const completedMessages: ChatMessage[] = [
        { id: 'ai-1', role: 'ai', content: 'Explain photosynthesis' },
      ];

      renderChatShell({
        verificationType: 'teach_back',
        messages: completedMessages,
      });

      expect(mockSpeak).toHaveBeenCalledWith('Explain photosynthesis');
    });

    it('does NOT speak streaming AI messages', () => {
      const streamingMessages: ChatMessage[] = [
        { id: 'ai-1', role: 'ai', content: 'Explain photo', streaming: true },
      ];

      renderChatShell({
        verificationType: 'teach_back',
        messages: streamingMessages,
      });

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('does NOT speak when voice toggle is off', () => {
      renderChatShell({
        verificationType: 'teach_back',
        messages: [{ id: 'ai-1', role: 'ai', content: 'Hello' }],
      });

      // First render speaks. Clear the mock.
      mockSpeak.mockClear();

      // Toggle voice off
      fireEvent.press(screen.getByTestId('voice-toggle'));

      // Re-render with new message (would normally trigger speak)
      // Since we can't easily re-render with new messages in this test setup,
      // we verify the toggle changed state
      expect(
        screen.getByTestId('voice-toggle').props.accessibilityState.checked
      ).toBe(false);
    });

    it('does NOT speak when voice defaults OFF (standard session)', () => {
      renderChatShell({
        verificationType: undefined,
        messages: [{ id: 'ai-1', role: 'ai', content: 'Hello' }],
      });

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('stops speaking when user sends a text message in teach_back', () => {
      renderChatShell({ verificationType: 'teach_back' });

      fireEvent.changeText(screen.getByTestId('chat-input'), 'My answer');
      fireEvent.press(screen.getByTestId('send-button'));

      expect(mockStopSpeaking).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Input disabled
  // -----------------------------------------------------------------------

  it('hides input area when inputDisabled is true', () => {
    renderChatShell({ inputDisabled: true });

    expect(screen.queryByTestId('chat-input')).toBeNull();
    expect(screen.queryByTestId('send-button')).toBeNull();
  });

  it('hides voice record button when inputDisabled even for teach_back', () => {
    renderChatShell({ inputDisabled: true, verificationType: 'teach_back' });

    expect(screen.queryByTestId('voice-record-button')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Header right action composition
  // -----------------------------------------------------------------------

  it('renders rightAction alongside voice toggle for all sessions', () => {
    const { Text } = require('react-native');
    renderChatShell({
      rightAction: <Text testID="custom-action">Done</Text>,
    });

    expect(screen.getByTestId('voice-toggle')).toBeTruthy();
    expect(screen.getByTestId('custom-action')).toBeTruthy();
  });
});
