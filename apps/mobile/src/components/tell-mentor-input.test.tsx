import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { TellMentorInput } from './tell-mentor-input';

import type { SpeechRecognitionStatus } from '../hooks/use-speech-recognition';

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

jest.mock(
  '../hooks/use-speech-recognition' /* gc1-allow: native-boundary — the hook wraps expo-speech-recognition, a native module with no jest-runnable implementation */,
  () => ({
    useSpeechRecognition: () => mockSpeech,
  }),
);

const BASE_PROPS = {
  value: '',
  onChangeText: jest.fn(),
  onSubmit: jest.fn(),
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
    clearTranscript: jest.fn(),
    requestMicrophonePermission: jest.fn().mockResolvedValue(true),
    getMicrophonePermissionStatus: jest.fn().mockResolvedValue(null),
  };
});

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('TellMentorInput', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<TellMentorInput {...BASE_PROPS} />);
    expect(toJSON()).toBeTruthy();
  });

  it('TextInput has testID and accessibilityLabel', () => {
    render(<TellMentorInput {...BASE_PROPS} />);
    const input = screen.getByTestId('tell-mentor-input-field');
    expect(input).toBeTruthy();
    expect(input.props.accessibilityLabel).toBeTruthy();
  });

  it('submit Pressable has testID', () => {
    render(<TellMentorInput {...BASE_PROPS} />);
    const btn = screen.getByTestId('tell-mentor-submit');
    expect(btn).toBeTruthy();
  });

  it('submit Pressable has accessibilityRole="button"', () => {
    render(<TellMentorInput {...BASE_PROPS} />);
    const btn = screen.getByTestId('tell-mentor-submit');
    expect(btn.props.accessibilityRole).toBe('button');
  });

  it('uses adult/neutral copy when birthYear is null (bug 173: not adolescent)', () => {
    render(
      <TellMentorInput {...BASE_PROPS} audience="learner" birthYear={null} />,
    );
    // Adult copy title
    screen.getByText('Add a Note for Your Mentor');
  });

  it('uses adult copy when birthYear is undefined', () => {
    render(
      <TellMentorInput
        {...BASE_PROPS}
        audience="learner"
        birthYear={undefined}
      />,
    );
    screen.getByText('Add a Note for Your Mentor');
  });

  it('uses adolescent copy when birthYear gives age 15', () => {
    const adolescentYear = new Date().getFullYear() - 15;
    render(
      <TellMentorInput
        {...BASE_PROPS}
        audience="learner"
        birthYear={adolescentYear}
      />,
    );
    screen.getByText('Tell Your Mentor Something');
  });

  it('uses parent copy when audience is parent', () => {
    render(
      <TellMentorInput {...BASE_PROPS} audience="parent" childName="Emma" />,
    );
    screen.getByText('Tell the Mentor');
    screen.getByText(
      'Add something important for the mentor to remember about Emma.',
    );
  });

  describe('voice input (WI-2549)', () => {
    it('renders the shared voice control next to the field', () => {
      render(<TellMentorInput {...BASE_PROPS} />);
      expect(screen.getByTestId('tell-mentor-mic')).toBeTruthy();
    });

    it('appends the final transcript to the draft through onChangeText', async () => {
      const onChangeText = jest.fn();
      const screenApi = render(
        <TellMentorInput
          {...BASE_PROPS}
          value="typed so far"
          onChangeText={onChangeText}
        />,
      );
      fireEvent.press(screenApi.getByTestId('tell-mentor-mic'));
      await flushEffects();
      mockSpeech = {
        ...mockSpeech,
        status: 'idle',
        isListening: false,
        transcript: 'and dictated',
        isFinalTranscript: true,
      };
      screenApi.rerender(
        <TellMentorInput
          {...BASE_PROPS}
          value="typed so far"
          onChangeText={onChangeText}
        />,
      );
      await flushEffects();
      expect(onChangeText).toHaveBeenCalledWith('typed so far and dictated');
    });

    it('disables the mic while the submission is pending', async () => {
      const screenApi = render(<TellMentorInput {...BASE_PROPS} isPending />);
      fireEvent.press(screenApi.getByTestId('tell-mentor-mic'));
      await flushEffects();
      expect(mockSpeech.startListening).not.toHaveBeenCalled();
    });

    it('forwards voiceScopeKey — a scope change revokes the in-flight capture', async () => {
      const onChangeText = jest.fn();
      const screenApi = render(
        <TellMentorInput
          {...BASE_PROPS}
          onChangeText={onChangeText}
          voiceScopeKey="child-001"
        />,
      );
      fireEvent.press(screenApi.getByTestId('tell-mentor-mic'));
      await flushEffects();

      screenApi.rerender(
        <TellMentorInput
          {...BASE_PROPS}
          onChangeText={onChangeText}
          voiceScopeKey="child-002"
        />,
      );
      await flushEffects();
      expect(mockSpeech.stopListening).toHaveBeenCalled();

      mockSpeech = {
        ...mockSpeech,
        status: 'idle',
        isListening: false,
        transcript: 'meant for the previous child',
        isFinalTranscript: true,
      };
      screenApi.rerender(
        <TellMentorInput
          {...BASE_PROPS}
          onChangeText={onChangeText}
          voiceScopeKey="child-002"
        />,
      );
      await flushEffects();
      expect(onChangeText).not.toHaveBeenCalled();
    });
  });
});
