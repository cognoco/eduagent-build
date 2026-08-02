import { render, fireEvent, act } from '@testing-library/react-native';

import { VoiceInputControl, appendTranscript } from './VoiceInputControl';

import type { SpeechRecognitionStatus } from '../../hooks/use-speech-recognition';

interface MockSpeech {
  status: SpeechRecognitionStatus;
  transcript: string;
  isFinalTranscript: boolean;
  error: string | null;
  isListening: boolean;
  startListening: jest.Mock;
  stopListening: jest.Mock;
  clearTranscript: jest.Mock;
  requestMicrophonePermission: jest.Mock;
  getMicrophonePermissionStatus: jest.Mock;
}

let mockSpeech: MockSpeech;
let mockUseSpeechRecognition: jest.Mock;

jest.mock(
  '../../hooks/use-speech-recognition' /* gc1-allow: native-boundary — the hook wraps expo-speech-recognition, a native module with no jest-runnable implementation */,
  () => ({
    useSpeechRecognition: (options?: unknown) =>
      mockUseSpeechRecognition(options),
  }),
);

function setSpeech(next: Partial<MockSpeech>): void {
  mockSpeech = { ...mockSpeech, ...next };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function speechListening(): void {
  setSpeech({
    status: 'listening',
    isListening: true,
    transcript: '',
    isFinalTranscript: false,
  });
}

function speechInterim(transcript: string): void {
  setSpeech({
    status: 'listening',
    isListening: true,
    transcript,
    isFinalTranscript: false,
  });
}

function speechFinal(transcript: string): void {
  setSpeech({
    status: 'idle',
    isListening: false,
    transcript,
    isFinalTranscript: true,
  });
}

function speechError(message: string): void {
  setSpeech({
    status: 'error',
    isListening: false,
    error: message,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSpeech = {
    status: 'idle',
    transcript: '',
    isFinalTranscript: false,
    error: null,
    isListening: false,
    startListening: jest.fn().mockResolvedValue(undefined),
    stopListening: jest.fn().mockResolvedValue(undefined),
    clearTranscript: jest.fn(() => {
      setSpeech({
        transcript: '',
        isFinalTranscript: false,
        error: null,
        status: 'idle',
      });
    }),
    requestMicrophonePermission: jest.fn().mockResolvedValue(true),
    getMicrophonePermissionStatus: jest.fn().mockResolvedValue(null),
  };
  mockUseSpeechRecognition = jest.fn(() => mockSpeech);
});

describe('appendTranscript', () => {
  it('returns the transcript alone for an empty draft', () => {
    expect(appendTranscript('', 'hello there')).toBe('hello there');
    expect(appendTranscript('   ', 'hello')).toBe('hello');
  });

  it('appends with a single space to a non-empty draft', () => {
    expect(appendTranscript('first part', 'second part')).toBe(
      'first part second part',
    );
    expect(appendTranscript('trailing  ', 'more')).toBe('trailing more');
  });
});

describe('VoiceInputControl', () => {
  const onTranscript = jest.fn();

  function renderControl(
    props: Partial<React.ComponentProps<typeof VoiceInputControl>> = {},
  ) {
    return render(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
        {...props}
      />,
    );
  }

  it('passes voiceLocale and single-utterance mode to the speech hook', () => {
    renderControl({ voiceLocale: 'de-DE' });
    expect(mockUseSpeechRecognition).toHaveBeenCalledWith({
      lang: 'de-DE',
      continuous: false,
    });
  });

  it('starts a capture on mic press', async () => {
    const screen = renderControl();
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);
  });

  it('never commits an interim transcript', async () => {
    const screen = renderControl();
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    speechListening();
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    speechInterim('half heard phr');
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    await flushEffects();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('commits the final transcript exactly once, then clears the hook', async () => {
    const screen = renderControl();
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    speechListening();
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    speechFinal('  the whole sentence  ');
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    await flushEffects();
    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith('the whole sentence');
    expect(mockSpeech.clearTranscript).toHaveBeenCalled();

    // A re-render with the same final result must not commit again.
    screen.rerender(
      <VoiceInputControl
        value="the whole sentence"
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    await flushEffects();
    expect(onTranscript).toHaveBeenCalledTimes(1);
  });

  it('emptying the draft discards the in-flight capture (late final cannot inject)', async () => {
    const screen = renderControl({ value: 'typed words' });
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    speechListening();
    screen.rerender(
      <VoiceInputControl
        value="typed words"
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    // The learner clears the field while the engine still owes a final.
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    speechFinal('late arriving sentence');
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    await flushEffects();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('disabling the surface mid-capture discards it and stops listening', async () => {
    const screen = renderControl();
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    speechListening();
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
        disabled
      />,
    );
    await flushEffects();
    expect(mockSpeech.stopListening).toHaveBeenCalled();
    speechFinal('should never land');
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
        disabled
      />,
    );
    await flushEffects();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('only the most recently started capture may commit when two controls are mounted', async () => {
    // The native recognizer is a singleton: both mounted controls' hook
    // instances receive the same result events. Ownership must be exclusive.
    const onTranscriptA = jest.fn();
    const onTranscriptB = jest.fn();
    const two = () => (
      <>
        <VoiceInputControl
          value=""
          onTranscript={onTranscriptA}
          testID="a-mic"
        />
        <VoiceInputControl
          value=""
          onTranscript={onTranscriptB}
          testID="b-mic"
        />
      </>
    );
    const screen = render(two());
    fireEvent.press(screen.getByTestId('a-mic'));
    await flushEffects();
    // B starts a capture while A's is still accepting — B takes ownership.
    // (The shared mock stays idle so B's press reads its own not-listening
    // state, as a real second hook instance would.)
    fireEvent.press(screen.getByTestId('b-mic'));
    await flushEffects();
    speechFinal('spoken once');
    screen.rerender(two());
    await flushEffects();
    expect(onTranscriptB).toHaveBeenCalledTimes(1);
    expect(onTranscriptB).toHaveBeenCalledWith('spoken once');
    expect(onTranscriptA).not.toHaveBeenCalled();
  });

  it('stops the native recognizer on unmount', async () => {
    const screen = renderControl();
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    speechListening();
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    screen.unmount();
    await flushEffects();
    expect(mockSpeech.stopListening).toHaveBeenCalled();
  });

  it('a scope change revokes the in-flight capture (late final cannot cross scopes)', async () => {
    const screen = renderControl({ scopeKey: 'child-001' });
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    speechListening();
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
        scopeKey="child-001"
      />,
    );
    // The route's child parameter changes while the engine still owes a final.
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
        scopeKey="child-002"
      />,
    );
    await flushEffects();
    expect(mockSpeech.stopListening).toHaveBeenCalled();
    speechFinal('meant for the previous child');
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
        scopeKey="child-002"
      />,
    );
    await flushEffects();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('a terminal engine error revokes acceptance (spurious late final cannot commit)', async () => {
    const screen = renderControl();
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    speechError('start failed');
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    await flushEffects();
    // A stray final result delivered after the error must be rejected.
    speechFinal('spurious after error');
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    await flushEffects();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('blocks the mic while disabled', async () => {
    const screen = renderControl({ disabled: true });
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    expect(mockSpeech.startListening).not.toHaveBeenCalled();
  });

  it('blocks a second press while a start is in flight (requesting)', async () => {
    setSpeech({ status: 'requesting_permission' });
    const screen = renderControl();
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    expect(mockSpeech.startListening).not.toHaveBeenCalled();
  });

  it('blocks the mic during processing (stop pressed, final still owed)', async () => {
    setSpeech({ status: 'processing' });
    const screen = renderControl();
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    expect(mockSpeech.startListening).not.toHaveBeenCalled();
    expect(mockSpeech.stopListening).not.toHaveBeenCalled();
  });

  it('stops listening when pressed during an active capture', async () => {
    const screen = renderControl();
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    speechListening();
    screen.rerender(
      <VoiceInputControl
        value=""
        onTranscript={onTranscript}
        testID="probe-mic"
      />,
    );
    fireEvent.press(screen.getByTestId('probe-mic'));
    await flushEffects();
    expect(mockSpeech.stopListening).toHaveBeenCalledTimes(1);
  });

  it('offers permission recovery when the OS reports an askable denial', async () => {
    mockSpeech.getMicrophonePermissionStatus.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    speechError('Microphone permission is required for voice input');
    const screen = renderControl();
    await flushEffects();
    const retry = screen.getByTestId('probe-mic-retry');
    fireEvent.press(retry);
    await flushEffects();
    expect(mockSpeech.requestMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);
  });

  it('does not restart after a denied recovery request', async () => {
    mockSpeech.getMicrophonePermissionStatus.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    mockSpeech.requestMicrophonePermission.mockResolvedValue(false);
    speechError('Microphone permission is required for voice input');
    const screen = renderControl();
    await flushEffects();
    fireEvent.press(screen.getByTestId('probe-mic-retry'));
    await flushEffects();
    expect(mockSpeech.requestMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(mockSpeech.startListening).not.toHaveBeenCalled();
  });

  it('offers a plain retry for a non-permission error (module unavailable)', async () => {
    speechError('Speech recognition is not available on this device');
    const screen = renderControl();
    await flushEffects();
    fireEvent.press(screen.getByTestId('probe-mic-retry'));
    await flushEffects();
    expect(mockSpeech.requestMicrophonePermission).not.toHaveBeenCalled();
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);
  });

  it('shows the listening indicator while capturing', () => {
    speechListening();
    const screen = renderControl();
    expect(screen.getByTestId('probe-mic-listening')).toBeTruthy();
  });
});
