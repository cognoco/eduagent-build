import { fireEvent, render, screen, act } from '@testing-library/react-native';

import { SubjectHubSearchFilter } from './SubjectHubSearchFilter';

import type { SpeechRecognitionStatus } from '../../hooks/use-speech-recognition';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

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
  '../../hooks/use-speech-recognition' /* gc1-allow: native-boundary — the hook wraps expo-speech-recognition, a native module with no jest-runnable implementation */,
  () => ({
    useSpeechRecognition: () => mockSpeech,
  }),
);

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

describe('SubjectHubSearchFilter', () => {
  it('updates the query on typing and renders the shared voice control', () => {
    const onQueryChange = jest.fn();

    render(<SubjectHubSearchFilter query="" onQueryChange={onQueryChange} />);

    fireEvent.changeText(screen.getByTestId('subject-hub-search-input'), 'mol');
    expect(onQueryChange).toHaveBeenCalledWith('mol');
    screen.getByTestId('search-mic');
  });

  it('a final transcript REPLACES the query through onQueryChange (WI-2550)', async () => {
    const onQueryChange = jest.fn();
    const screenApi = render(
      <SubjectHubSearchFilter query="mol" onQueryChange={onQueryChange} />,
    );

    fireEvent.press(screenApi.getByTestId('search-mic'));
    await flushEffects();
    expect(mockSpeech.startListening).toHaveBeenCalledTimes(1);

    mockSpeech = {
      ...mockSpeech,
      status: 'idle',
      isListening: false,
      transcript: 'photosynthesis',
      isFinalTranscript: true,
    };
    screenApi.rerender(
      <SubjectHubSearchFilter query="mol" onQueryChange={onQueryChange} />,
    );
    await flushEffects();
    expect(onQueryChange).toHaveBeenCalledWith('photosynthesis');
  });
});
