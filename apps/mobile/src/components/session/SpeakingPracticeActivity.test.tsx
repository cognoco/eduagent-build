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

// GC1: the whole `jest.mock(...)` call must close on the same physical line
// it opens on for the checker (scripts/check-gc1-pattern-a.ts) to honor a
// same-line `gc1-allow` — a multi-line factory body defeats its AST check
// even with the marker on the opening line. Keeping the factory nested
// inline (rather than hoisting it out to a separately-declared const) also
// matters for correctness: the outer factory here creates a plain object
// immediately and only reads mockSttState etc. from the INNER function,
// which isn't called until React render time (by when they're initialized).
// A named-const factory would need that const already initialized at
// require-time, before its own declaration runs — it isn't, so that
// approach throws/returns undefined. Squashing onto one line is formatting
// only; it doesn't change this evaluation order.
// prettier-ignore
jest.mock('../../hooks/use-speech-recognition', () => ({ useSpeechRecognition: () => ({ ...mockSttState, startListening: mockStartListening, stopListening: mockStopListening, clearTranscript: mockClearTranscript, requestMicrophonePermission: jest.fn(), getMicrophonePermissionStatus: jest.fn() }) })); // gc1-allow: voice hook touches native recording APIs outside component scope

const mockSpeak = jest.fn();
const mockStopSpeaking = jest.fn();

// prettier-ignore
jest.mock('../../hooks/use-text-to-speech', () => ({ useTextToSpeech: () => ({ isSpeaking: false, rate: 1.0, speak: mockSpeak, stop: mockStopSpeaking, replay: jest.fn(), setRate: jest.fn() }) })); // gc1-allow: voice output hook touches native speech APIs outside component scope

const mockMutateAsync = jest.fn();

// prettier-ignore
jest.mock('../../hooks/use-speaking-practice-api', () => ({ useRecordSpeakingPracticeAttempt: () => ({ mutateAsync: mockMutateAsync }) })); // gc1-allow: network-mutation hook — API client integration covered by attempt.integration.test.ts

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

function activityView(sessionId = 'session-1') {
  return (
    <SpeakingPracticeActivity
      activity={makeActivity()}
      sessionId={sessionId}
      subjectId="subject-1"
    />
  );
}

async function submitTranscript(
  rerender: ReturnType<typeof render>['rerender'],
  transcript: string,
  sessionId = 'session-1',
) {
  mockSttState = {
    status: 'listening',
    transcript,
    error: null,
    isListening: true,
  };
  rerender(activityView(sessionId));
  mockSttState = { ...mockSttState, isListening: false };
  await act(async () => {
    rerender(activityView(sessionId));
  });
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

  // WI-1777 Option-B rework: legacy/cache events may still carry the
  // schema-supported shadowing value, but the MVP UI must not instruct a
  // learner to speak along when playback and recognition are independent.
  it('renders the honest repeat-after-me instruction for a legacy shadowing event', () => {
    const shadowingActivity: LanguageLearningActivityEvent = {
      ...makeActivity(),
      activityType: 'shadowing',
      speakingPractice: {
        ...makeActivity().speakingPractice!,
        type: 'shadowing',
      },
    };
    render(
      <SpeakingPracticeActivity
        activity={shadowingActivity}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );
    screen.getByText('Repeat the line');
    expect(
      screen.queryByText('Speak along with the audio, a beat behind'),
    ).toBeNull();
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

  it('persists legacy shadowing events as repeat-after-me attempts', async () => {
    mockMutateAsync.mockResolvedValue({
      attemptNumber: 1,
      lexicalMatchScore: 1,
      missingWords: [],
      extraWords: [],
      isComplete: true,
    });
    const shadowingActivity: LanguageLearningActivityEvent = {
      ...makeActivity(),
      activityType: 'shadowing',
      speakingPractice: {
        ...makeActivity().speakingPractice!,
        type: 'shadowing',
      },
    };

    const { rerender } = render(
      <SpeakingPracticeActivity
        activity={shadowingActivity}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );

    mockSttState = {
      status: 'listening',
      transcript: 'I would like a cup of tea',
      error: null,
      isListening: true,
    };
    rerender(
      <SpeakingPracticeActivity
        activity={shadowingActivity}
        sessionId="session-1"
        subjectId="subject-1"
      />,
    );

    mockSttState = {
      status: 'idle',
      transcript: 'I would like a cup of tea',
      error: null,
      isListening: false,
    };
    await act(async () => {
      rerender(
        <SpeakingPracticeActivity
          activity={shadowingActivity}
          sessionId="session-1"
          subjectId="subject-1"
        />,
      );
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'repeat_after_me' }),
    );
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

  it('keeps later successful feedback when an earlier attempt resolves last', async () => {
    const attemptA = deferred<{
      missingWords: string[];
      extraWords: string[];
      isComplete: boolean;
    }>();
    const attemptB = deferred<{
      missingWords: string[];
      extraWords: string[];
      isComplete: boolean;
    }>();
    mockMutateAsync
      .mockReturnValueOnce(attemptA.promise)
      .mockReturnValueOnce(attemptB.promise);

    const { rerender } = render(activityView());
    await submitTranscript(rerender, 'attempt A');
    fireEvent.press(screen.getByTestId('speaking-practice-record'));
    await submitTranscript(rerender, 'I would like a cup of tea');

    await act(async () => {
      attemptB.resolve({
        missingWords: [],
        extraWords: [],
        isComplete: true,
      });
      await attemptB.promise;
    });
    screen.getByText('Matched');

    await act(async () => {
      attemptA.resolve({
        missingWords: ['would'],
        extraWords: [],
        isComplete: false,
      });
      await attemptA.promise;
    });

    screen.getByText('Matched');
    expect(screen.queryByText('Try again: would')).toBeNull();
  });

  it('does not replace later feedback with an earlier attempt error', async () => {
    const attemptA = deferred<never>();
    const attemptB = deferred<{
      missingWords: string[];
      extraWords: string[];
      isComplete: boolean;
    }>();
    mockMutateAsync
      .mockReturnValueOnce(attemptA.promise)
      .mockReturnValueOnce(attemptB.promise);

    const { rerender } = render(activityView());
    await submitTranscript(rerender, 'attempt A');
    fireEvent.press(screen.getByTestId('speaking-practice-record'));
    await submitTranscript(rerender, 'I would like a cup of tea');

    await act(async () => {
      attemptB.resolve({
        missingWords: [],
        extraWords: [],
        isComplete: true,
      });
      await attemptB.promise;
    });

    await act(async () => {
      attemptA.reject(new Error('attempt A cancelled'));
      await attemptA.promise.catch(() => undefined);
    });

    screen.getByText('Matched');
    expect(screen.queryByTestId('speaking-practice-attempt-error')).toBeNull();
  });

  it('invalidates an outstanding attempt when navigation changes the session', async () => {
    const attemptA = deferred<{
      missingWords: string[];
      extraWords: string[];
      isComplete: boolean;
    }>();
    mockMutateAsync.mockReturnValueOnce(attemptA.promise);

    const { rerender } = render(activityView());
    await submitTranscript(rerender, 'attempt A');

    rerender(activityView('session-2'));
    await act(async () => {
      attemptA.resolve({
        missingWords: ['would'],
        extraWords: [],
        isComplete: false,
      });
      await attemptA.promise;
    });

    expect(screen.queryByText('Try again: would')).toBeNull();
    expect(screen.queryByTestId('speaking-practice-attempt-error')).toBeNull();
  });

  it('does not read or apply an outstanding response after unmount', async () => {
    const feedbackRead = jest.fn();
    const attempt = deferred<{
      missingWords: string[];
      extraWords: string[];
      isComplete: boolean;
    }>();
    mockMutateAsync.mockReturnValueOnce(attempt.promise);

    const { rerender, unmount } = render(activityView());
    await submitTranscript(rerender, 'attempt A');
    unmount();

    await act(async () => {
      attempt.resolve({
        get missingWords() {
          feedbackRead();
          return [];
        },
        extraWords: [],
        isComplete: true,
      });
      await attempt.promise;
    });

    expect(feedbackRead).not.toHaveBeenCalled();
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
