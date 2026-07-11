import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SpeakingPracticeActivity } from './SpeakingPracticeActivity';
import type { LanguageLearningActivityEvent } from '../../lib/sse';

let mockSttState = {
  status: 'idle' as string,
  transcript: '',
  error: null as string | null,
  isListening: false,
};
const mockStartListening = jest.fn();
const mockStopListening = jest.fn();
const mockClearTranscript = jest.fn();

// prettier-ignore
jest.mock('../../hooks/use-speech-recognition', () => ({ // gc1-allow: voice hook touches native recording APIs outside component scope
  useSpeechRecognition: () => ({
    ...mockSttState,
    startListening: mockStartListening,
    stopListening: mockStopListening,
    clearTranscript: mockClearTranscript,
    requestMicrophonePermission: jest.fn(),
    getMicrophonePermissionStatus: jest.fn(),
  }),
}));

const mockSpeak = jest.fn();
const mockStopSpeaking = jest.fn();

// prettier-ignore
jest.mock('../../hooks/use-text-to-speech', () => ({ // gc1-allow: voice output hook touches native speech APIs outside component scope
  useTextToSpeech: () => ({
    isSpeaking: false,
    rate: 1.0,
    speak: mockSpeak,
    stop: mockStopSpeaking,
    replay: jest.fn(),
    setRate: jest.fn(),
  }),
}));

const mockMutateAsync = jest.fn();

// prettier-ignore
jest.mock('../../hooks/use-speaking-practice-api', () => ({ // gc1-allow: network-mutation hook — API client integration covered by attempt.integration.test.ts
  useRecordSpeakingPracticeAttempt: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

function makeActivity(): LanguageLearningActivityEvent {
  return {
    strand: 'fluency',
    activityType: 'repeat_after_me',
    modality: 'voice',
    targetWords: [],
    targetGrammar: [],
    speakingPractice: {
      type: 'repeat_after_me',
      targetText: 'I would like a cup of tea.',
      locale: 'en-US',
      modality: 'voice',
      retryGuidance: 'retry_same_target',
    },
  };
}

describe('SpeakingPracticeActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSttState = {
      status: 'idle',
      transcript: '',
      error: null,
      isListening: false,
    };
  });

  it('renders null when the activity has no speakingPractice artifact', () => {
    const activity: LanguageLearningActivityEvent = {
      strand: 'meaning_input',
      activityType: 'graded_input',
      modality: 'text',
      targetWords: [],
      targetGrammar: [],
    };
    const { toJSON } = render(
      <SpeakingPracticeActivity
        activity={activity}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders the target sentence from the activity', () => {
    render(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );
    screen.getByText('I would like a cup of tea.');
  });

  it('submits an attempt exactly once when recording stops with a transcript', async () => {
    mockMutateAsync.mockResolvedValue({
      attemptNumber: 1,
      lexicalMatchScore: 4 / 7,
      missingWords: ['would', 'a', 'of'],
      extraWords: [],
      isComplete: false,
    });

    const { rerender } = render(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );

    // Simulate: user starts recording, transcript streams in, then stops.
    mockSttState = {
      status: 'listening',
      transcript: 'I like cup tea',
      error: null,
      isListening: true,
    };
    rerender(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );

    mockSttState = {
      status: 'idle',
      transcript: 'I like cup tea',
      error: null,
      isListening: false,
    };
    await act(async () => {
      rerender(
        <SpeakingPracticeActivity
          activity={makeActivity()}
          sessionId="session-1"
          subjectId="subject-1"
        />,
      );
    });

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      sessionId: 'session-1',
      subjectId: 'subject-1',
      mode: 'repeat_after_me',
      targetText: 'I would like a cup of tea.',
      transcript: 'I like cup tea',
      locale: 'en-US',
    });

    // Server feedback rendered, not an internally-recomputed value.
    await screen.findByText('Try again: would, a, of');
  });

  it('does not submit when recording stops with an empty transcript', async () => {
    const { rerender } = render(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );

    mockSttState = {
      status: 'listening',
      transcript: '',
      error: null,
      isListening: true,
    };
    rerender(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );

    mockSttState = {
      status: 'idle',
      transcript: '',
      error: null,
      isListening: false,
    };
    await act(async () => {
      rerender(
        <SpeakingPracticeActivity
          activity={makeActivity()}
          sessionId="session-1"
          subjectId="subject-1"
        />,
      );
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows a user-visible error and does not crash when the attempt submission fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('network down'));

    const { rerender } = render(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );

    mockSttState = {
      status: 'listening',
      transcript: 'I like cup tea',
      error: null,
      isListening: true,
    };
    rerender(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );
    mockSttState = {
      status: 'idle',
      transcript: 'I like cup tea',
      error: null,
      isListening: false,
    };
    await act(async () => {
      rerender(
        <SpeakingPracticeActivity
          activity={makeActivity()}
          sessionId="session-1"
          subjectId="subject-1"
        />,
      );
    });

    await screen.findByTestId('speaking-practice-attempt-error');
    // WI-1777 Phase-4 M1: the error path must never show a client-computed
    // verdict — no phantom "Matched"/missing-words, even though the
    // transcript ("I like cup tea") differs from the target.
    expect(screen.queryByText('Matched')).toBeNull();
    expect(screen.queryByTestId('speaking-practice-missing')).toBeNull();
  });

  it('shows no verdict while listening/interim transcript is streaming, before the server has scored anything (M1)', () => {
    mockSttState = {
      status: 'listening',
      transcript: 'I would like a cup of tea',
      error: null,
      isListening: true,
    };

    render(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );

    // Interim transcript happens to match the target word-for-word, but no
    // attempt has been submitted/scored yet — the card must not show a
    // client-computed "Matched" verdict for it.
    screen.getByText('I would like a cup of tea');
    expect(screen.queryByText('Matched')).toBeNull();
    expect(screen.queryByTestId('speaking-practice-missing')).toBeNull();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('retry clears the transcript/feedback but keeps the same target text (prop-derived, never local state)', async () => {
    mockMutateAsync.mockResolvedValue({
      attemptNumber: 1,
      lexicalMatchScore: 4 / 7,
      missingWords: ['would', 'a', 'of'],
      extraWords: [],
      isComplete: false,
    });

    mockSttState = {
      status: 'idle',
      transcript: 'I like cup tea',
      error: null,
      isListening: false,
    };
    const { rerender } = render(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );
    // Force the stop->submit effect by transitioning through listening once.
    mockSttState = { ...mockSttState, isListening: true };
    rerender(
      <SpeakingPracticeActivity
        activity={makeActivity()}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );
    mockSttState = { ...mockSttState, isListening: false };
    await act(async () => {
      rerender(
        <SpeakingPracticeActivity
          activity={makeActivity()}
          sessionId="session-1"
          subjectId="subject-1"
        />,
      );
    });
    await screen.findByText('Try again: would, a, of');

    fireEvent.press(screen.getByTestId('speaking-practice-retry'));

    expect(mockClearTranscript).toHaveBeenCalledTimes(1);
    // The target sentence is still visible — retry never drops it.
    screen.getByText('I would like a cup of tea.');
  });
});
