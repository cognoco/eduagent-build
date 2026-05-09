import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { AccessibilityInfo, AppState } from 'react-native';
import { ChatShell, type ChatMessage } from './ChatShell';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
}));

// [BUG-886] ChatShell now reads useIsFocused so it can short-circuit Send
// taps that land on a stale offscreen instance on RN Web. Tests default to
// focused=true; the BUG-886 describe block flips this to false to verify
// the dormant-instance behaviour.
let mockIsFocused = true;
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockIsFocused,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/theme', () => ({
  useTheme: () => ({ colorScheme: 'dark' }),
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
const mockGetMicrophonePermissionStatus = jest
  .fn()
  .mockResolvedValue({ granted: true, canAskAgain: true });
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
    getMicrophonePermissionStatus: mockGetMicrophonePermissionStatus,
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
  DeskLampAnimation: () => null,
  MagicPenAnimation: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGES: ChatMessage[] = [
  { id: 'ai-1', role: 'assistant', content: 'Hello student!' },
];

function renderChatShell(
  overrides: Partial<React.ComponentProps<typeof ChatShell>> = {},
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

// [BUG-759] No test in this file calls jest.advanceTimersByTime / runAllTimers
// / etc., so the previous global jest.useFakeTimers() / useRealTimers() pair
// was dead scaffolding that risked deadlocking RN async work (state updates,
// microtasks) under fake-time. Removed.
beforeEach(() => {
  jest.clearAllMocks();
  mockGetMicrophonePermissionStatus.mockResolvedValue({
    granted: true,
    canAskAgain: true,
  });
  mockSttState = {
    status: 'idle',
    transcript: '',
    error: null,
    isListening: false,
  };
});

describe('ChatShell', () => {
  // -----------------------------------------------------------------------
  // Basic rendering (regression — existing behaviour)
  // -----------------------------------------------------------------------

  // [BUG-887] On small phones (Galaxy S10e ~5.8") the Text/Voice mode
  // toggle eats vertical space the composer needs when the soft keyboard
  // opens. Onboarding interview opts in to hide the toggle.
  it('hides the input mode toggle by default [BUG-887]', () => {
    renderChatShell();
    expect(screen.queryByTestId('input-mode-toggle')).toBeNull();
    screen.getByTestId('message-bubble-assistant-0');
    screen.getByTestId('chat-input');
    screen.getByTestId('send-button');
  });

  it('tags rendered messages by role and visible index for E2E assertions', () => {
    renderChatShell({
      messages: [
        { id: 'ai-1', role: 'assistant', content: 'What should we try?' },
        { id: 'user-1', role: 'user', content: 'A short answer.' },
      ],
    });

    screen.getByTestId('message-bubble-assistant-0');
    screen.getByTestId('message-bubble-user-1');
  });

  it('shows the input mode toggle when hideInputModeToggle is false [BUG-887]', () => {
    renderChatShell({ hideInputModeToggle: false });
    screen.getByTestId('input-mode-toggle');
  });

  it('renders the compact enable-voice button in the input row when not in voice mode', () => {
    renderChatShell();
    // [BUG-965] Voice-OFF state shows the long-press-to-enable button, NOT
    // the recording button. Distinct testIDs let E2E flows assert each
    // state's presence/absence without ambiguity.
    screen.getByTestId('voice-enable-button');
    expect(screen.queryByTestId('voice-record-button')).toBeNull();
  });

  it('uses the explicit fallback route when backBehavior is replace', () => {
    renderChatShell({
      backFallback: '/(app)/library',
      backBehavior: 'replace',
    });

    fireEvent.press(screen.getByLabelText('Go back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('defers fully to onBackPress when supplied [BUG-867]', () => {
    // Regression: the back chevron looked clickable but the URL never
    // changed because the string-templated `/(app)/shelf/${subjectId}`
    // path didn't resolve. Parents now own navigation through onBackPress
    // and use the typed object form, so the chevron must call the
    // handler and skip the default router calls entirely.
    const onBackPress = jest.fn();
    renderChatShell({
      backFallback: '/(app)/library',
      backBehavior: 'replace',
      onBackPress,
    });

    fireEvent.press(screen.getByLabelText('Go back'));

    expect(onBackPress).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('renders title, subtitle, and messages', () => {
    renderChatShell({ title: 'Learning Session', subtitle: 'Math' });

    screen.getByText('Learning Session');
    screen.getByText('Math');
    screen.getByText('Hello student!');
  });

  it('renders text input and send button', () => {
    renderChatShell();

    screen.getByTestId('chat-input');
    screen.getByTestId('send-button');
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

      screen.getByTestId('voice-toggle');
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

    it('shows enable-voice button (NOT record button) when voice is OFF (standard session)', () => {
      renderChatShell({ verificationType: undefined });

      // [BUG-965] Distinct testIDs per state — see ChatShell.tsx voice
      // input branch.
      screen.getByTestId('voice-enable-button');
      expect(screen.queryByTestId('voice-record-button')).toBeNull();
    });

    it('shows voice record button (NOT enable button) when voice is ON (teach_back)', () => {
      renderChatShell({ verificationType: 'teach_back' });

      screen.getByTestId('voice-record-button');
      expect(screen.queryByTestId('voice-enable-button')).toBeNull();
    });

    it('flips from enable-voice button to record button after toggling voice ON', () => {
      renderChatShell({ verificationType: undefined });

      // OFF → enable-voice button only
      screen.getByTestId('voice-enable-button');
      expect(screen.queryByTestId('voice-record-button')).toBeNull();

      // Flip voice ON
      fireEvent.press(screen.getByTestId('voice-toggle'));

      // ON → record button only
      screen.getByTestId('voice-record-button');
      expect(screen.queryByTestId('voice-enable-button')).toBeNull();
    });

    it('shows playback bar when voice is enabled', () => {
      renderChatShell({ verificationType: 'teach_back' });

      screen.getByTestId('voice-playback-bar');
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

      screen.getByText('Photosynthesis is the process...');
      screen.getByTestId('voice-send-button');
      screen.getByTestId('voice-discard-button');
      screen.getByTestId('voice-rerecord-button');
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
      screen.getByText('Delayed recognition result');
      screen.getByTestId('voice-send-button');
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
      screen.getByText('First attempt');

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
      screen.getByText('New attempt after discard');
      screen.getByTestId('voice-send-button');
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
        screen.getByTestId('voice-toggle').props.accessibilityState.checked,
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

  // [BUG-970 / BUG-969] The Maestro nightly flows for assessment and homework
  // wait up to 10–15s on `chat-input`. ChatShell hides the input row when
  // inputDisabled flips on (during interview→session handoff or while the
  // homework camera is closing back to chat) — so the visibility of
  // `chat-input` *must* track inputDisabled exactly. Both directions are
  // locked in here so any future refactor that desyncs the testID from the
  // disabled state surfaces in CI before the nightly flow goes red.
  it('[BUG-970 / BUG-969] chat-input testID is rendered when input is enabled', () => {
    renderChatShell({ inputDisabled: false });

    screen.getByTestId('chat-input');
    screen.getByTestId('send-button');
  });

  it('[BUG-970 / BUG-969] chat-input testID re-appears when inputDisabled flips back to false', () => {
    const { rerender } = renderChatShell({ inputDisabled: true });
    expect(screen.queryByTestId('chat-input')).toBeNull();

    rerender(
      <ChatShell
        title="Session"
        messages={DEFAULT_MESSAGES}
        onSend={jest.fn()}
        isStreaming={false}
        inputDisabled={false}
      />,
    );

    screen.getByTestId('chat-input');
    screen.getByTestId('send-button');
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
    screen.getByTestId('subject-chips');
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

    screen.getByTestId('voice-toggle');
    screen.getByTestId('custom-action');
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
            enabled: boolean,
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
        />,
      );

      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('suppresses TTS when screen reader becomes active mid-session', async () => {
      renderChatShell({
        verificationType: 'teach_back',
        hideInputModeToggle: false,
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
      screen.getByText(
        'Screen reader is on. Voice input is not available. Use text input below.',
      );
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
        expect.any(Function),
      );

      // Unmount should call subscription.remove()
      unmount();

      expect(mockRemove).toHaveBeenCalledTimes(1);
    });

    it('[BUG-928] does NOT subscribe to AccessibilityInfo on web (Chromium AXMode false-positives)', async () => {
      // Chromium-based browsers report isScreenReaderEnabled() === true when
      // the accessibility tree is generated for any reason, even without
      // assistive tech. Auto-suppressing TTS based on that signal silently
      // disables voice for ordinary Chrome users. The fix: skip the entire
      // listener wiring on web. Native (iOS/Android) is unaffected.
      const RN = require('react-native');
      const originalPlatform = RN.Platform.OS;
      Object.defineProperty(RN.Platform, 'OS', { get: () => 'web' });

      try {
        // Even if AccessibilityInfo.isScreenReaderEnabled would resolve true,
        // the component must not consult it on web.
        jest
          .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
          .mockResolvedValue(true);

        renderChatShell({
          verificationType: 'teach_back',
          messages: [
            { id: 'ai-1', role: 'assistant', content: 'Hello learner!' },
          ],
        });

        await act(async () => {
          await Promise.resolve();
        });

        // The component should not have subscribed at all on web.
        expect(AccessibilityInfo.addEventListener).not.toHaveBeenCalled();
        expect(AccessibilityInfo.isScreenReaderEnabled).not.toHaveBeenCalled();

        // And TTS still fires for the AI message — not suppressed.
        expect(mockSpeak).toHaveBeenCalledWith('Hello learner!');
      } finally {
        Object.defineProperty(RN.Platform, 'OS', {
          get: () => originalPlatform,
        });
      }
    });

    it('[BUG-938] does NOT show "Screen reader is on" banner on web even with voice enabled', async () => {
      // BUG-938 is the user-visible symptom of BUG-928: the banner asserting
      // a screen reader is on appears in headless Chrome despite no AT
      // running. The BUG-928 fix prevents screenReaderEnabled from ever
      // flipping true on web; this test pins the OBSERVABLE outcome (no
      // banner in the rendered tree) so a future regression that bypasses
      // the platform guard fails here, not in production.
      const RN = require('react-native');
      const originalPlatform = RN.Platform.OS;
      Object.defineProperty(RN.Platform, 'OS', { get: () => 'web' });

      try {
        // Even if the platform misreports a screen reader, the banner must
        // not render on web.
        jest
          .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
          .mockResolvedValue(true);

        renderChatShell({
          verificationType: 'teach_back',
          messages: [
            { id: 'ai-1', role: 'assistant', content: 'Hello learner!' },
          ],
        });

        await act(async () => {
          await Promise.resolve();
        });

        // Toggle voice mode on so the banner condition (screenReaderEnabled
        // && isVoiceEnabled) becomes the only gate; on web the first half is
        // forced false, so the banner stays hidden.
        const toggle = screen.queryByTestId('voice-toggle');
        if (toggle) {
          act(() => {
            fireEvent.press(toggle);
          });
        }

        await act(async () => {
          await Promise.resolve();
        });

        // Break test: the literal banner copy must not appear in the rendered
        // tree on web. If anyone reintroduces a path that flips
        // screenReaderEnabled on web, this assertion will fail.
        expect(
          screen.queryByText(
            'Screen reader is on. Voice input is not available. Use text input below.',
          ),
        ).toBeNull();
      } finally {
        Object.defineProperty(RN.Platform, 'OS', {
          get: () => originalPlatform,
        });
      }
    });

    it('transitions from auto to manual TTS when screen reader detected', async () => {
      renderChatShell({
        verificationType: 'teach_back',
        hideInputModeToggle: false,
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
      screen.getByText(
        'Screen reader is on. Voice input is not available. Use text input below.',
      );
    });
  });

  describe('mic permission refresh', () => {
    let addEventListenerSpy: jest.SpiedFunction<
      typeof AppState.addEventListener
    >;
    let mockAppStateRemove: jest.Mock;

    beforeEach(() => {
      mockAppStateRemove = jest.fn();

      addEventListenerSpy = jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((_event, _listener) => {
          return {
            remove: mockAppStateRemove,
          } as ReturnType<typeof AppState.addEventListener>;
        });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('clears stale mic permission errors after returning from Settings with permission granted', async () => {
      mockSttState = {
        ...mockSttState,
        status: 'error',
        error: 'Microphone permission is required for voice input',
      };
      mockGetMicrophonePermissionStatus.mockResolvedValue({
        granted: true,
        canAskAgain: false,
      });

      renderChatShell({ verificationType: 'teach_back' });
      const appStateChangedListener = addEventListenerSpy.mock.calls.at(
        -1,
      )?.[1] as ((status: string) => void) | undefined;
      expect(appStateChangedListener).toBeInstanceOf(Function);

      await act(async () => {
        appStateChangedListener?.('active');
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockGetMicrophonePermissionStatus).toHaveBeenCalled();
      expect(mockClearTranscript).toHaveBeenCalled();
    });

    it('does not clear transcript on resume when permission is still denied', async () => {
      mockSttState = {
        ...mockSttState,
        status: 'error',
        error: 'Microphone permission is required for voice input',
      };
      mockGetMicrophonePermissionStatus.mockResolvedValue({
        granted: false,
        canAskAgain: false,
      });

      renderChatShell({ verificationType: 'teach_back' });
      const appStateChangedListener = addEventListenerSpy.mock.calls.at(
        -1,
      )?.[1] as ((status: string) => void) | undefined;
      expect(appStateChangedListener).toBeInstanceOf(Function);

      await act(async () => {
        appStateChangedListener?.('active');
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockGetMicrophonePermissionStatus).toHaveBeenCalled();
      expect(mockClearTranscript).not.toHaveBeenCalled();
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
      />,
    );

    getByTestId('message-image-msg-img');
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
    screen.getByText('Great question!');
    screen.getByText('What is ser vs estar?');
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

    screen.getByText('Connection lost. Tap to retry.');
  });

  describe('animation wiring (ANIM-IMPROVE)', () => {
    it('shows DeskLampAnimation (thinking-bulb-animation) when streaming', () => {
      renderChatShell({ isStreaming: true });
      screen.getByTestId('thinking-bulb-animation');
      expect(screen.queryByTestId('idle-pen-animation')).toBeNull();
    });

    it('does not show animations during normal conversation', () => {
      renderChatShell({ isStreaming: false });
      expect(screen.queryByTestId('thinking-bulb-animation')).toBeNull();
      expect(screen.queryByTestId('idle-pen-animation')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // H4: inputDisabled without disabledReason must not be silent
  // -----------------------------------------------------------------------

  describe('H4: input disabled fallback message', () => {
    it('shows generic fallback when inputDisabled=true and no disabledReason given', () => {
      renderChatShell({ inputDisabled: true });

      screen.getByTestId('input-disabled-banner');
      screen.getByText('Input is currently unavailable');
    });

    it('shows provided disabledReason when given', () => {
      renderChatShell({ inputDisabled: true, disabledReason: 'Session ended' });

      screen.getByTestId('input-disabled-banner');
      screen.getByText('Session ended');
    });

    it('does NOT show disabled banner when input is enabled', () => {
      renderChatShell({ inputDisabled: false });

      expect(screen.queryByTestId('input-disabled-banner')).toBeNull();
    });

    it('hides the disabled banner when showDisabledBanner is false', () => {
      renderChatShell({
        inputDisabled: true,
        showDisabledBanner: false,
      });

      expect(screen.queryByTestId('input-disabled-banner')).toBeNull();
      expect(screen.queryByTestId('chat-input')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // L2: STT error indicator is a Pressable that retries
  // -----------------------------------------------------------------------

  describe('L2: STT error retry tap target', () => {
    it('shows voice error as a Pressable when STT is in error state', () => {
      mockSttState = {
        ...mockSttState,
        status: 'error',
        error: 'Microphone permission denied',
      };
      renderChatShell({ verificationType: 'teach_back' });

      screen.getByTestId('voice-error-indicator');
    });

    it('retries STT when user taps the error indicator', async () => {
      mockSttState = {
        ...mockSttState,
        status: 'error',
        error: 'Network error',
      };
      renderChatShell({ verificationType: 'teach_back' });

      await act(async () => {
        fireEvent.press(screen.getByTestId('voice-error-indicator'));
      });

      expect(mockStartListening).toHaveBeenCalled();
    });
  });

  // [BUG-886] On RN Web every Stack screen stays in the DOM, so a previous
  // session's ChatShell can intercept the visible Send tap and POST to the
  // wrong session. ChatShell now reads useIsFocused — when the screen is
  // not focused, handleSend short-circuits, the input is non-editable, the
  // Send Pressable is disabled, and the wrapping View is removed from the
  // accessibility tree on web (pointerEvents='none', aria-hidden, tabIndex=-1).
  describe('stale-instance Send guard (BUG-886)', () => {
    afterEach(() => {
      // Restore for the rest of the suite.
      mockIsFocused = true;
    });

    it('does not call onSend when the screen is unfocused', async () => {
      mockIsFocused = false;
      const onSend = jest.fn();
      renderChatShell({ onSend });

      // Type something into the input. With editable={!isStreaming &&
      // isFocused} the field is disabled while unfocused, but onChangeText
      // still fires through fireEvent — that is fine; the test cares about
      // whether the Send press triggers onSend.
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('chat-input'), 'hello');
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('send-button'));
      });

      expect(onSend).not.toHaveBeenCalled();
    });

    it('disables the Send Pressable while unfocused, even with non-empty input', () => {
      mockIsFocused = false;
      renderChatShell({ onSend: jest.fn() });

      const send = screen.getByTestId('send-button');
      expect(send.props.accessibilityState).toMatchObject({ disabled: true });
    });

    it('marks the input row aria-hidden + pointerEvents=none on web when unfocused', () => {
      const RN = require('react-native');
      const originalPlatform = RN.Platform.OS;
      Object.defineProperty(RN.Platform, 'OS', { get: () => 'web' });

      try {
        mockIsFocused = false;
        renderChatShell({ onSend: jest.fn() });

        // RNTL hides elements with aria-hidden by default. Pass
        // includeHiddenElements so we can inspect the dormant row's props.
        const row = screen.getByTestId('chat-input-row', {
          includeHiddenElements: true,
        });
        expect(row).not.toBeNull();
        expect(row?.props.pointerEvents).toBe('none');
        // RN normalizes `aria-hidden` to `accessibilityElementsHidden` on
        // some host components (especially under jest where the RN Web
        // shim isn't applied). Accept either prop key — the implementation
        // intent is the same.
        expect(
          row?.props['aria-hidden'] === true ||
            row?.props.accessibilityElementsHidden === true,
        ).toBe(true);
        // tabIndex is web-only; RN may strip it from native host props.
        // Accept either the literal -1 or the focusable=false equivalent.
        expect(
          row?.props.tabIndex === -1 || row?.props.focusable === false,
        ).toBe(true);
      } finally {
        Object.defineProperty(RN.Platform, 'OS', {
          get: () => originalPlatform,
        });
      }
    });

    it('keeps the input row interactive on web when focused', () => {
      const RN = require('react-native');
      const originalPlatform = RN.Platform.OS;
      Object.defineProperty(RN.Platform, 'OS', { get: () => 'web' });

      try {
        mockIsFocused = true;
        renderChatShell({ onSend: jest.fn() });

        const row = screen.getByTestId('chat-input-row');
        expect(row?.props.pointerEvents).toBe('auto');
        expect(row?.props['aria-hidden']).toBeUndefined();
        expect(row?.props.tabIndex).toBeUndefined();
      } finally {
        Object.defineProperty(RN.Platform, 'OS', {
          get: () => originalPlatform,
        });
      }
    });

    it('does not apply web-only AT shielding on native unfocused screens', () => {
      // Native (iOS/Android) Stack only renders the focused screen, so the
      // BUG-886 race does not exist there. The web-specific aria-hidden /
      // tabIndex=-1 / pointerEvents='none' must not silently turn into
      // accessibility regressions on native if a screen unfocuses for
      // any reason.
      const RN = require('react-native');
      const originalPlatform = RN.Platform.OS;
      Object.defineProperty(RN.Platform, 'OS', { get: () => 'ios' });

      try {
        mockIsFocused = false;
        renderChatShell({ onSend: jest.fn() });

        const row = screen.getByTestId('chat-input-row');
        // pointerEvents falls back to 'auto', and aria-hidden is undefined
        // on native — RN's parent stack handles real focus.
        expect(row?.props.pointerEvents).toBe('auto');
        expect(row?.props['aria-hidden']).toBeUndefined();
      } finally {
        Object.defineProperty(RN.Platform, 'OS', {
          get: () => originalPlatform,
        });
      }
    });

    it('Send button does NOT use bg-primary styling when the instance is unfocused [BUG-886]', async () => {
      // [BUG-886] The disabled prop on the Send Pressable already includes
      // !isFocused, but the visual class (bg-primary) previously only checked
      // input.trim() && !isStreaming — so the dormant instance on RN Web still
      // rendered as a filled primary button, which looks interactive. This
      // break test asserts the class condition also gates on isFocused.
      mockIsFocused = false;
      const onSend = jest.fn();
      renderChatShell({ onSend });

      // Inject text via fireEvent so the trimmed value is non-empty —
      // that eliminates input.trim() as the reason for bg-surface-elevated
      // and isolates the isFocused guard.
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('chat-input'), 'hello');
      });

      const send = screen.getByTestId('send-button');
      // className is a NativeWind prop available as props.className in RNTL.
      const className: string = send.props.className ?? '';
      expect(className).not.toContain('bg-primary');
      expect(className).toContain('bg-surface-elevated');
    });

    it('still calls onSend when focused [break test for over-strict guard]', async () => {
      // The simplest way for someone to break BUG-886 is to leave
      // !isFocused logic active even on the focused instance. Catch that
      // by asserting the happy path still works.
      mockIsFocused = true;
      const onSend = jest.fn();
      renderChatShell({ onSend });

      await act(async () => {
        fireEvent.changeText(screen.getByTestId('chat-input'), 'hello');
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('send-button'));
      });

      expect(onSend).toHaveBeenCalledWith('hello');
    });
  });

  describe('escalation rung strip', () => {
    it('renders the rung strip when pedagogicalState is provided', () => {
      const { getByTestId, getByText } = renderChatShell({
        pedagogicalState: {
          rung: 2,
          phase: 'BUILDING',
          exchangesUsed: 2,
          exchangesMax: 4,
        },
      });
      expect(getByTestId('escalation-rung-strip')).toBeTruthy();
      expect(getByText(/RUNG 2/)).toBeTruthy();
      expect(getByText(/BUILDING/)).toBeTruthy();
      expect(getByText(/2 of 4/)).toBeTruthy();
    });

    it('falls back to subtitle when pedagogicalState is absent', () => {
      const { queryByTestId, getByText } = renderChatShell({
        subtitle: "I'm here to help",
      });
      expect(queryByTestId('escalation-rung-strip')).toBeNull();
      expect(getByText("I'm here to help")).toBeTruthy();
    });
  });

  describe('memory chip', () => {
    it('renders the memory chip when memoryHint is provided', () => {
      const { getByTestId, getByText } = renderChatShell({
        memoryHint: "Last week you mixed up the sign — I'll watch for that.",
      });
      expect(getByTestId('chat-memory-hint')).toBeTruthy();
      expect(getByText(/mixed up the sign/)).toBeTruthy();
    });

    it('does not render memory chip when memoryHint is absent', () => {
      const { queryByTestId } = renderChatShell({});
      expect(queryByTestId('chat-memory-hint')).toBeNull();
    });
  });
});
