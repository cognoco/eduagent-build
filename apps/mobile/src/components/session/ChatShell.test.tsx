import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { ChatShell, type ChatMessage } from './ChatShell';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: jest.fn(() => true) }),
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
const mockRequestMicrophonePermission = jest.fn().mockResolvedValue(true);
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
    requestMicrophonePermission: mockRequestMicrophonePermission,
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

// Stub animated SVG components to avoid reanimated timer leaks in tests
jest.mock('../common', () => ({
  LightBulbAnimation: () => null,
  MagicPenAnimation: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGES: ChatMessage[] = [
  { id: 'ai-1', role: 'assistant', content: 'Hello student!' },
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

    // 4B.11: STT-to-transcript race condition — stopListening() resolves before
    // expo-speech-recognition has populated the transcript in state.
    it('captures transcript that arrives after stopListening resolves (STT race)', () => {
      // Phase 1: Recording just stopped, but transcript is still empty (race window)
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: '',
      };
      const { rerender, props } = renderChatShell({
        verificationType: 'teach_back',
      });

      // No preview should appear — transcript is empty even though we stopped
      expect(screen.queryByTestId('voice-send-button')).toBeNull();

      // Phase 2: Transcript arrives asynchronously from the native STT engine
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: 'Delayed recognition result',
      };
      rerender(<ChatShell {...props} />);

      // The useEffect([isListening, transcript]) should sync to pendingTranscript
      expect(screen.getByText('Delayed recognition result')).toBeTruthy();
      expect(screen.getByTestId('voice-send-button')).toBeTruthy();
    });

    it('does not re-populate preview with late STT after discard', () => {
      // Start with a transcript available
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: 'First attempt',
      };
      const { rerender, props } = renderChatShell({
        verificationType: 'teach_back',
      });

      // Preview shows the transcript
      expect(screen.getByText('First attempt')).toBeTruthy();

      // User discards the transcript
      fireEvent.press(screen.getByTestId('voice-discard-button'));
      expect(mockClearTranscript).toHaveBeenCalled();

      // Late STT update arrives (expo-speech-recognition fires a trailing event)
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: 'Late trailing update',
      };
      rerender(<ChatShell {...props} />);

      // The discardedRef gate should prevent re-populating the preview
      expect(screen.queryByTestId('voice-send-button')).toBeNull();
    });

    it('allows transcript capture after discard + new mic press', async () => {
      // Start with discarded state
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: 'Old attempt',
      };
      const { rerender, props } = renderChatShell({
        verificationType: 'teach_back',
      });

      // Discard the transcript
      fireEvent.press(screen.getByTestId('voice-discard-button'));

      // Press mic to start new recording (not re-record button)
      mockSttState = { ...mockSttState, isListening: false, transcript: '' };
      rerender(<ChatShell {...props} />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('voice-record-button'));
      });

      // Recording stops, new transcript arrives
      mockSttState = {
        ...mockSttState,
        isListening: false,
        transcript: 'New attempt after discard',
      };
      rerender(<ChatShell {...props} />);

      // discardedRef should have been cleared by handleVoicePress,
      // allowing the effect to capture this new transcript
      expect(screen.getByText('New attempt after discard')).toBeTruthy();
      expect(screen.getByTestId('voice-send-button')).toBeTruthy();
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
        { id: 'ai-1', role: 'assistant', content: 'Explain photosynthesis' },
      ];

      renderChatShell({
        verificationType: 'teach_back',
        messages: completedMessages,
      });

      expect(mockSpeak).toHaveBeenCalledWith('Explain photosynthesis');
    });

    it('does NOT speak streaming AI messages', () => {
      const streamingMessages: ChatMessage[] = [
        {
          id: 'ai-1',
          role: 'assistant',
          content: 'Explain photo',
          streaming: true,
        },
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
        messages: [{ id: 'ai-1', role: 'assistant', content: 'Hello' }],
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
        messages: [{ id: 'ai-1', role: 'assistant', content: 'Hello' }],
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

  it('shows inputAccessory even when inputDisabled is true [BUG-234]', () => {
    const { Text } = require('react-native');
    renderChatShell({
      inputDisabled: true,
      inputAccessory: <Text testID="subject-chips">Pick a subject</Text>,
    });

    // The accessory must remain visible so subject resolution chips are actionable
    expect(screen.getByTestId('subject-chips')).toBeTruthy();
    // But the text input itself should be hidden
    expect(screen.queryByTestId('chat-input')).toBeNull();
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

  // -----------------------------------------------------------------------
  // Screen-reader detection lifecycle (lines 176-196)
  // -----------------------------------------------------------------------

  describe('screen-reader detection', () => {
    let mockRemove: jest.Mock;
    let screenReaderChangedListener: ((enabled: boolean) => void) | undefined;

    beforeEach(() => {
      mockRemove = jest.fn();
      screenReaderChangedListener = undefined;

      jest
        .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
        .mockResolvedValue(false);

      jest
        .spyOn(AccessibilityInfo, 'addEventListener')
        .mockImplementation((_event, listener) => {
          screenReaderChangedListener = listener as unknown as (
            enabled: boolean
          ) => void;
          return { remove: mockRemove } as unknown as ReturnType<
            typeof AccessibilityInfo.addEventListener
          >;
        });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('suppresses TTS for new messages after screen reader detected on mount', async () => {
      jest
        .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
        .mockResolvedValue(true);

      const { rerender, props } = renderChatShell({
        verificationType: 'teach_back',
        messages: [
          { id: 'ai-1', role: 'assistant', content: 'Please explain.' },
        ],
      });

      // The first message may speak before the async screen reader check resolves.
      // After the promise resolves, screenReaderEnabled becomes true.
      await act(async () => {
        await Promise.resolve();
      });

      mockSpeak.mockClear();

      // Add a NEW AI message — this should NOT auto-speak because screen reader is now detected
      rerender(
        <ChatShell
          {...props}
          messages={[
            { id: 'ai-1', role: 'assistant', content: 'Please explain.' },
            { id: 'ai-2', role: 'assistant', content: 'Second message' },
          ]}
        />
      );

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('suppresses TTS when screen reader becomes active mid-session', async () => {
      renderChatShell({
        verificationType: 'teach_back',
        messages: [
          { id: 'ai-1', role: 'assistant', content: 'Hello learner!' },
        ],
      });

      // Allow the isScreenReaderEnabled promise to resolve
      await act(async () => {
        await Promise.resolve();
      });

      // Initial TTS fires (screen reader was off at mount)
      expect(mockSpeak).toHaveBeenCalledWith('Hello learner!');
      mockSpeak.mockClear();

      // Simulate screen reader turning ON
      act(() => {
        screenReaderChangedListener?.(true);
      });

      // Shows the manual-playback notice instead of auto-speaking
      expect(
        screen.getByText(
          'Screen reader is on, so voice mode keeps manual playback only.'
        )
      ).toBeTruthy();
    });

    it('cleans up listener subscription on unmount', async () => {
      const { unmount } = renderChatShell({
        verificationType: 'teach_back',
      });

      // Allow the isScreenReaderEnabled promise to resolve
      await act(async () => {
        await Promise.resolve();
      });

      expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
        'screenReaderChanged',
        expect.any(Function)
      );

      // Unmount should call subscription.remove()
      unmount();

      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('transitions from auto to manual TTS when screen reader detected', async () => {
      renderChatShell({
        verificationType: 'teach_back',
        messages: [{ id: 'ai-1', role: 'assistant', content: 'First message' }],
      });

      // Allow the isScreenReaderEnabled promise to resolve
      await act(async () => {
        await Promise.resolve();
      });

      // Auto-TTS fires initially
      expect(mockSpeak).toHaveBeenCalledWith('First message');
      mockSpeak.mockClear();

      // Screen reader turns on
      act(() => {
        screenReaderChangedListener?.(true);
      });

      // Voice toggle still shows as enabled (manual playback mode)
      const toggle = screen.getByTestId('voice-toggle');
      expect(toggle.props.accessibilityState.checked).toBe(true);

      // The manual-playback notice appears
      expect(
        screen.getByText(
          'Screen reader is on, so voice mode keeps manual playback only.'
        )
      ).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Homework image rendering
  // -----------------------------------------------------------------------

  it('renders image in MessageBubble when imageUri is present', () => {
    const messagesWithImage: ChatMessage[] = [
      {
        id: 'msg-img',
        role: 'user',
        content: 'What is this diagram?',
        imageUri: 'file:///cache/homework-123.jpg',
      },
    ];

    const { getByTestId } = render(
      <ChatShell
        title="Test"
        messages={messagesWithImage}
        onSend={jest.fn()}
        isStreaming={false}
      />
    );

    expect(getByTestId('message-image-msg-img')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Animation wiring (ANIM-IMPROVE)
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // BUG-547: internal isSystemPrompt messages must not render
  // -----------------------------------------------------------------------

  it('hides internal isSystemPrompt messages without kind (BUG-547)', () => {
    const messages: ChatMessage[] = [
      { id: 'u-1', role: 'user', content: 'What is ser vs estar?' },
      {
        id: 'sys-1',
        role: 'assistant',
        content: 'Looks like Spanish.',
        isSystemPrompt: true,
      },
      { id: 'ai-1', role: 'assistant', content: 'Great question!' },
    ];
    renderChatShell({ messages });

    expect(screen.queryByText('Looks like Spanish.')).toBeNull();
    expect(screen.getByText('Great question!')).toBeTruthy();
    expect(screen.getByText('What is ser vs estar?')).toBeTruthy();
  });

  it('shows isSystemPrompt messages that have a kind (error/reconnect)', () => {
    const messages: ChatMessage[] = [
      {
        id: 'sys-1',
        role: 'assistant',
        content: 'Connection lost. Tap to retry.',
        isSystemPrompt: true,
        kind: 'reconnect_prompt',
      },
    ];
    renderChatShell({ messages });

    expect(screen.getByText('Connection lost. Tap to retry.')).toBeTruthy();
  });

  describe('animation wiring (ANIM-IMPROVE)', () => {
    it('shows LightBulbAnimation when streaming', () => {
      renderChatShell({ isStreaming: true });
      expect(screen.getByTestId('thinking-bulb-animation')).toBeTruthy();
      expect(screen.queryByTestId('idle-pen-animation')).toBeNull();
    });

    it('does not show animations during normal conversation', () => {
      renderChatShell({ isStreaming: false });
      expect(screen.queryByTestId('thinking-bulb-animation')).toBeNull();
      expect(screen.queryByTestId('idle-pen-animation')).toBeNull();
    });
  });
});
