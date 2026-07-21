import { render, fireEvent, act } from '@testing-library/react-native';

import { MentorInputBar } from './MentorInputBar';

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

/** Let the component's async permission-classification effect settle. */
async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Move the mocked hook into its listening state, the way a real start does. */
function speechListening(): void {
  setSpeech({
    status: 'listening',
    isListening: true,
    transcript: '',
    isFinalTranscript: false,
  });
}

/** An interim result: displayed while speaking, never committed. */
function speechInterim(transcript: string): void {
  setSpeech({
    status: 'listening',
    isListening: true,
    transcript,
    isFinalTranscript: false,
  });
}

/** Manual stop: the engine still owes us the final result. */
function speechStopped(): void {
  setSpeech({ status: 'processing', isListening: false });
}

/** The engine's final result for the utterance. */
function speechFinal(transcript: string): void {
  setSpeech({
    status: 'idle',
    isListening: false,
    transcript,
    isFinalTranscript: true,
  });
}

const baseProps = {
  onSubmitText: jest.fn(),
  onOpenCamera: jest.fn(),
  onOpenHomework: jest.fn(),
};

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
    // Faithful to the hook: clearing really does drop the held transcript.
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

describe('MentorInputBar', () => {
  it('renders the "Ask anything" box title', () => {
    const { getByText } = render(<MentorInputBar {...baseProps} />);

    expect(getByText('Ask anything')).toBeTruthy();
  });

  it('fires camera and homework callbacks', () => {
    const onOpenCamera = jest.fn();
    const onOpenHomework = jest.fn();
    const { getByTestId } = render(
      <MentorInputBar
        {...baseProps}
        onOpenCamera={onOpenCamera}
        onOpenHomework={onOpenHomework}
      />,
    );

    fireEvent.press(getByTestId('mentor-bar-camera'));
    fireEvent.press(getByTestId('mentor-bar-homework-chip'));

    expect(onOpenCamera).toHaveBeenCalledTimes(1);
    expect(onOpenHomework).toHaveBeenCalledTimes(1);
  });

  it('submits typed text without treating a mic press as a submission', async () => {
    const onSubmitText = jest.fn();
    const { getByTestId } = render(
      <MentorInputBar {...baseProps} onSubmitText={onSubmitText} />,
    );

    fireEvent.changeText(getByTestId('mentor-bar-input'), 'show topic');
    fireEvent(getByTestId('mentor-bar-input'), 'submitEditing');
    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });

    expect(onSubmitText).toHaveBeenCalledTimes(1);
    expect(onSubmitText).toHaveBeenCalledWith('show topic');
  });

  it('enables an accessible send affordance after typing and submits the trimmed prompt', () => {
    const onSubmitText = jest.fn();
    const { getByTestId } = render(
      <MentorInputBar {...baseProps} onSubmitText={onSubmitText} />,
    );

    const send = getByTestId('mentor-bar-send');
    expect(send.props.accessibilityRole).toBe('button');
    expect(send.props.accessibilityLabel).toBe('Send message');
    expect(send.props.accessibilityState).toEqual({ disabled: true });

    fireEvent.changeText(
      getByTestId('mentor-bar-input'),
      '  explain fractions ',
    );

    expect(getByTestId('mentor-bar-send').props.accessibilityState).toEqual({
      disabled: false,
    });
    fireEvent.press(getByTestId('mentor-bar-send'));

    expect(onSubmitText).toHaveBeenCalledWith('explain fractions');
  });

  it('does not submit blank typed prompts from the send affordance', () => {
    const onSubmitText = jest.fn();
    const { getByTestId } = render(
      <MentorInputBar {...baseProps} onSubmitText={onSubmitText} />,
    );

    fireEvent.changeText(getByTestId('mentor-bar-input'), '   ');
    fireEvent.press(getByTestId('mentor-bar-send'));

    expect(getByTestId('mentor-bar-send').props.accessibilityState).toEqual({
      disabled: true,
    });
    expect(onSubmitText).not.toHaveBeenCalled();
  });

  it('keeps the ask field tall enough for its wrapped placeholder', () => {
    const { getByTestId } = render(<MentorInputBar {...baseProps} />);

    expect(getByTestId('mentor-bar-input').props).toEqual(
      expect.objectContaining({
        multiline: true,
        numberOfLines: 2,
        textAlignVertical: 'top',
      }),
    );
    expect(getByTestId('mentor-bar-input').props.className).toContain(
      'min-h-16',
    );
  });

  it('keeps deterministic submit and non-LLM affordances live when unavailable', async () => {
    const onSubmitText = jest.fn();
    const onOpenCamera = jest.fn();
    const onOpenHomework = jest.fn();
    const { getByTestId, getByText } = render(
      <MentorInputBar
        unavailable
        onSubmitText={onSubmitText}
        onOpenCamera={onOpenCamera}
        onOpenHomework={onOpenHomework}
      />,
    );

    expect(
      getByText('The mentor is offline for a moment. You can still type.'),
    ).toBeTruthy();
    fireEvent.changeText(getByTestId('mentor-bar-input'), 'continue session-1');
    fireEvent(getByTestId('mentor-bar-input'), 'submitEditing');
    fireEvent.press(getByTestId('mentor-bar-camera'));
    fireEvent.press(getByTestId('mentor-bar-homework-chip'));
    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });

    expect(onSubmitText).toHaveBeenCalledWith('continue session-1');
    expect(onOpenCamera).toHaveBeenCalledTimes(1);
    expect(onOpenHomework).toHaveBeenCalledTimes(1);
    expect(mockSpeech.startListening).not.toHaveBeenCalled();
  });

  it('exposes the mic lifecycle and its accessible labels', () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    const micState = (): { state: string; label: string } => {
      const mic = getByTestId('mentor-bar-mic');
      return {
        state: mic.props.accessibilityValue.text,
        label: mic.props.accessibilityLabel,
      };
    };

    expect(micState()).toEqual({ state: 'idle', label: 'Start voice input' });

    setSpeech({ status: 'requesting_permission' });
    rerender(<MentorInputBar {...baseProps} />);
    expect(micState()).toEqual({
      state: 'requesting',
      label: 'Asking for microphone access',
    });
    expect(getByTestId('mentor-bar-mic').props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
      selected: false,
    });

    speechListening();
    rerender(<MentorInputBar {...baseProps} />);
    expect(micState()).toEqual({
      state: 'listening',
      label: 'Stop voice input',
    });
    expect(
      getByTestId('mentor-bar-mic').props.accessibilityState.selected,
    ).toBe(true);
    expect(getByTestId('mentor-bar-listening')).toBeTruthy();

    setSpeech({ status: 'processing', isListening: false });
    rerender(<MentorInputBar {...baseProps} />);
    expect(micState()).toEqual({
      state: 'processing',
      label: 'Finishing voice input',
    });

    setSpeech({ status: 'error' });
    rerender(<MentorInputBar {...baseProps} />);
    expect(micState()).toEqual({
      state: 'error',
      label: 'Try voice input again',
    });

    setSpeech({ status: 'idle' });
    rerender(<MentorInputBar {...baseProps} unavailable />);
    expect(micState()).toEqual({
      state: 'disabled',
      label: 'Voice input unavailable',
    });
    expect(
      getByTestId('mentor-bar-mic').props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('blocks a second start while a capture is still being set up', async () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);

    for (const status of ['requesting_permission', 'processing'] as const) {
      setSpeech({ status, isListening: false });
      rerender(<MentorInputBar {...baseProps} />);
      expect(
        getByTestId('mentor-bar-mic').props.accessibilityState.disabled,
      ).toBe(true);
      await act(async () => {
        fireEvent.press(getByTestId('mentor-bar-mic'));
      });
    }

    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);
    expect(mockSpeech.stopListening).not.toHaveBeenCalled();
  });

  it('toggles capture manually and never starts a second one while listening', async () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);

    speechListening();
    rerender(<MentorInputBar {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });

    expect(mockSpeech.stopListening).toHaveBeenCalledTimes(1);
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);
  });

  it('puts a final transcript into an editable draft and submits it only on an explicit send', async () => {
    const onSubmitText = jest.fn();
    const { getByTestId, rerender } = render(
      <MentorInputBar {...baseProps} onSubmitText={onSubmitText} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    speechListening();
    rerender(<MentorInputBar {...baseProps} onSubmitText={onSubmitText} />);

    speechFinal('explain photosynthesis');
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} onSubmitText={onSubmitText} />);
    });

    expect(getByTestId('mentor-bar-input').props.value).toBe(
      'explain photosynthesis',
    );
    expect(onSubmitText).not.toHaveBeenCalled();

    fireEvent.changeText(
      getByTestId('mentor-bar-input'),
      'explain photosynthesis simply',
    );
    fireEvent.press(getByTestId('mentor-bar-send'));

    expect(onSubmitText).toHaveBeenCalledTimes(1);
    expect(onSubmitText).toHaveBeenCalledWith('explain photosynthesis simply');
  });

  it('commits the final result, never the interim guess that preceded the stop', async () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    speechListening();
    rerender(<MentorInputBar {...baseProps} />);

    // Interim result while the learner is still speaking.
    speechInterim('close to a Quaker');
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });
    expect(getByTestId('mentor-bar-input').props.value).toBe('');

    // Learner stops. The engine has not finalised yet — nothing may be
    // committed here, and the mic stays unpressable while it settles.
    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    speechStopped();
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });
    expect(getByTestId('mentor-bar-input').props.value).toBe('');
    expect(getByTestId('mentor-bar-mic').props.accessibilityValue.text).toBe(
      'processing',
    );

    // The true final result arrives afterwards.
    speechFinal('close to equator');
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });

    expect(getByTestId('mentor-bar-input').props.value).toBe(
      'close to equator',
    );
  });

  it('ignores an interim result that never finalises', async () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    speechListening();
    rerender(<MentorInputBar {...baseProps} />);

    speechInterim('half heard');
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });
    // The session ends with no final result at all (no speech / engine gave up).
    setSpeech({ status: 'idle', isListening: false });
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });

    expect(getByTestId('mentor-bar-input').props.value).toBe('');
  });

  it('populates the draft once per capture even if the transcript is re-delivered', async () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    speechListening();
    rerender(<MentorInputBar {...baseProps} />);

    speechFinal('one two');
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });

    expect(getByTestId('mentor-bar-input').props.value).toBe('one two');
  });

  it('drops a late transcript after the learner discards the draft', async () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    speechListening();
    rerender(<MentorInputBar {...baseProps} />);

    fireEvent.changeText(getByTestId('mentor-bar-input'), '');

    speechFinal('late words');
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });

    expect(getByTestId('mentor-bar-input').props.value).toBe('');
  });

  it('keeps an in-flight capture when the learner types a bare space', async () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    speechListening();
    rerender(<MentorInputBar {...baseProps} />);

    fireEvent.changeText(getByTestId('mentor-bar-input'), ' ');

    speechFinal('keep this');
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });

    expect(getByTestId('mentor-bar-input').props.value).toBe('keep this');
  });

  it('does not resurrect a discarded transcript when the next capture starts', async () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    speechListening();
    rerender(<MentorInputBar {...baseProps} />);

    fireEvent.changeText(getByTestId('mentor-bar-input'), '');
    setSpeech({
      status: 'idle',
      isListening: false,
      transcript: 'discarded words',
    });
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });
    expect(getByTestId('mentor-bar-input').props.value).toBe('');

    // Starting the next capture must not let the discarded words land: the
    // hook clears its transcript only once permission resolves, so the
    // requesting render still carries them.
    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    setSpeech({ status: 'requesting_permission', isListening: false });
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} />);
    });

    expect(getByTestId('mentor-bar-input').props.value).toBe('');
  });

  it('recognizes in the learner voice locale the screen resolves', () => {
    render(<MentorInputBar {...baseProps} voiceLocale="de-DE" />);

    expect(mockUseSpeechRecognition).toHaveBeenCalledWith({ lang: 'de-DE' });
  });

  it('drops a late transcript when the Mentor action becomes unavailable', async () => {
    const { getByTestId, rerender } = render(<MentorInputBar {...baseProps} />);

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-mic'));
    });
    speechListening();
    rerender(<MentorInputBar {...baseProps} />);

    speechFinal('late words');
    await act(async () => {
      rerender(<MentorInputBar {...baseProps} unavailable />);
    });

    expect(getByTestId('mentor-bar-input').props.value).toBe('');
    expect(mockSpeech.stopListening).toHaveBeenCalled();
  });

  it('offers localized recovery on a runtime failure and keeps typing usable', async () => {
    const onSubmitText = jest.fn();
    setSpeech({ status: 'error', error: 'Speech recognition failed' });
    const { getByTestId, getByText } = render(
      <MentorInputBar {...baseProps} onSubmitText={onSubmitText} />,
    );

    await flushEffects();

    expect(
      getByText("Voice input didn't work. You can still type."),
    ).toBeTruthy();
    fireEvent.changeText(getByTestId('mentor-bar-input'), 'type instead');
    fireEvent.press(getByTestId('mentor-bar-send'));
    expect(onSubmitText).toHaveBeenCalledWith('type instead');

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-voice-retry'));
    });

    expect(mockSpeech.requestMicrophonePermission).not.toHaveBeenCalled();
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);
  });

  it('offers a permission prompt when the microphone was denied but can be asked again', async () => {
    setSpeech({
      status: 'error',
      error: 'Microphone permission is required for voice input',
      getMicrophonePermissionStatus: jest
        .fn()
        .mockResolvedValue({ granted: false, canAskAgain: true }),
    });
    const { getByTestId, getByText } = render(
      <MentorInputBar {...baseProps} />,
    );

    await flushEffects();

    expect(
      getByText('Microphone access is off. You can still type.'),
    ).toBeTruthy();
    expect(getByTestId('mentor-bar-voice-retry').props.accessibilityLabel).toBe(
      'Allow microphone',
    );

    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-voice-retry'));
    });

    expect(mockSpeech.requestMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);
  });

  it('does not restart capture when the learner declines the permission prompt', async () => {
    setSpeech({
      status: 'error',
      error: 'Microphone permission is required for voice input',
      getMicrophonePermissionStatus: jest
        .fn()
        .mockResolvedValue({ granted: false, canAskAgain: true }),
      requestMicrophonePermission: jest.fn().mockResolvedValue(false),
    });
    const { getByTestId } = render(<MentorInputBar {...baseProps} />);

    await flushEffects();
    await act(async () => {
      fireEvent.press(getByTestId('mentor-bar-voice-retry'));
    });

    expect(mockSpeech.startListening).not.toHaveBeenCalled();
  });
});
