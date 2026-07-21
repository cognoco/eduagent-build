import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Alert } from 'react-native';

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en' }],
}));

const mockPush = jest.fn();
const mockRecallMutate = jest.fn();
const mockRecallReset = jest.fn();
const mockRecallState = { isPending: false };
// [LEARN-14] Controls the useResolveTopicSubject result. Tests that need a
// resolver-driven subjectId set this before render.
let mockResolveResult: { subjectId: string } | undefined = undefined;
// [LEARN-14] Controls the params returned from useLocalSearchParams so a test
// can simulate a deep link that omits subjectId.
let mockSearchParams: Record<string, string> = {
  topicId: 'topic-1',
  subjectId: 'subject-1',
};
let queuedRecallResults: Array<Record<string, unknown> | 'defer' | Error> = [];
// Holds the callbacks of the most recent mutate() call so a test can
// fire them deferred — simulating a request that resolves AFTER the
// user has pressed timeout-retry.
let deferredCallbacks: {
  onSuccess?: (value: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
} | null = null;
let mockAnimateResponseImpl: (
  content: string,
  setMessages: React.Dispatch<
    React.SetStateAction<Array<{ id: string; role: string; content: string }>>
  >,
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
  onComplete?: () => void,
) => () => void;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock(
  '../../../hooks/use-progress', // gc1-allow: native-boundary — the real hook reaches into the API client + profile scope, neither of which is wired in this test environment
  () => ({
    useResolveTopicSubject: () => ({ data: mockResolveResult }),
  }),
);

jest.mock(
  '../../../hooks/use-retention', // gc1-allow: native-boundary — ChatShell mock (below) exposes mock-send-button; real useSubmitRecallTest cannot integrate with the real ChatShell in JSDOM without its own native-dep chain (speech-recognition, TTS, reanimated)
  () => ({
    useSubmitRecallTest: () => ({
      mutate: mockRecallMutate,
      reset: mockRecallReset,
      get isPending() {
        return mockRecallState.isPending;
      },
    }),
  }),
);

jest.mock(
  '../../../components/session/ChatShell', // gc1-allow: native-boundary — ChatShell pulls expo-speech-recognition, react-native-reanimated, TTS hooks and safe-area; none of these can run in JSDOM
  () => {
    const ReactReq = require('react');
    const { View, Text, Pressable } = require('react-native');

    return {
      ChatShell: ({
        messages,
        inputAccessory,
        footer,
        onSend,
      }: {
        messages: Array<{ id: string; content: string }>;
        inputAccessory?: React.ReactNode;
        footer?: React.ReactNode;
        onSend?: (text: string) => void;
      }) =>
        ReactReq.createElement(
          View,
          { testID: 'mock-chat-shell' },
          messages.map((message) =>
            ReactReq.createElement(Text, { key: message.id }, message.content),
          ),
          ReactReq.isValidElement(inputAccessory) ? inputAccessory : null,
          ReactReq.isValidElement(footer) ? footer : null,
          onSend
            ? ReactReq.createElement(
                Pressable,
                {
                  testID: 'mock-send-button',
                  onPress: () => onSend('I remember this topic well'),
                },
                ReactReq.createElement(Text, null, 'Send'),
              )
            : null,
        ),
      animateResponse: (
        content: string,
        setMessages: React.Dispatch<
          React.SetStateAction<
            Array<{ id: string; role: string; content: string }>
          >
        >,
        setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
        onComplete?: () => void,
      ) =>
        mockAnimateResponseImpl(
          content,
          setMessages,
          setIsStreaming,
          onComplete,
        ),
    };
  },
);

// components/progress (RemediationCard) uses only React Native primitives —
// real implementation runs in JSDOM. No mock needed.

const RecallTestScreen = require('./recall-test').default;

describe('RecallTestScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queuedRecallResults = [];
    mockAnimateResponseImpl = (
      content,
      setMessages,
      setIsStreaming,
      onComplete,
    ) => {
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev,
        { id: `ai-${prev.length}`, role: 'assistant', content },
      ]);
      onComplete?.();
      return () => undefined;
    };
    deferredCallbacks = null;
    mockRecallState.isPending = false;
    mockResolveResult = undefined;
    mockSearchParams = { topicId: 'topic-1', subjectId: 'subject-1' };
    mockRecallMutate.mockImplementation(
      (
        _input: Record<string, unknown>,
        options?: {
          onSuccess?: (value: Record<string, unknown>) => void;
          onError?: (error: Error) => void;
        },
      ) => {
        const next = queuedRecallResults.shift();
        if (next === 'defer') {
          deferredCallbacks = options ?? null;
          return;
        }
        if (next instanceof Error) {
          options?.onError?.(next);
          return;
        }
        if (next) {
          options?.onSuccess?.(next);
        }
      },
    );
  });

  it('[WI-1419] keeps recall feedback animateResponse copy behind translation keys', () => {
    const source = readFileSync(join(__dirname, 'recall-test.tsx'), 'utf8');

    expect(source).toContain("t('topic.recallTest.successMessage')");
    expect(source).toContain("t('topic.recallTest.partialResult')");
    expect(source).toContain("t('topic.recallTest.reTeach')");
    expect(source).toContain("t('topic.recallTest.needsReview')");
    expect(source).not.toMatch(/animateResponse\(\s*['"`]/);
  });

  it('shows a hint first, then remediation when the learner is still stuck', async () => {
    queuedRecallResults = [
      {
        passed: false,
        failureCount: 1,
        failureAction: 'feedback_only',
        hint: 'Try remembering the central definition first.',
      },
      {
        passed: false,
        failureCount: 4,
        failureAction: 'redirect_to_library',
        offRampStage: 'topic_parked',
        remediation: {
          cooldownEndsAt: '2026-03-30T18:30:00.000Z',
          suggestionText: 'Review the topic again.',
          retentionStatus: 'forgotten',
        },
      },
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      expect(mockRecallMutate).toHaveBeenNthCalledWith(
        1,
        { topicId: 'topic-1', attemptMode: 'dont_remember' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('Try remembering the central definition first.'),
      ).toBeTruthy();
    });

    screen.getByText('Still stuck');

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      screen.getByTestId('remediation-card');
    });

    expect(screen.queryByTestId('recall-dont-remember-button')).toBeNull();
  });

  it('shows remediation immediately when first result is topic_parked', async () => {
    queuedRecallResults = [
      {
        passed: false,
        failureCount: 4,
        failureAction: 'redirect_to_library',
        offRampStage: 'topic_parked',
        remediation: {
          cooldownEndsAt: '2026-03-30T18:30:00.000Z',
          retentionStatus: 'forgotten',
        },
      },
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      screen.getByTestId('remediation-card');
    });
  });

  // [WI-1462 / RR-4] The bounded re-teach off-ramp keeps the learner in the
  // same flow — no remediation card, no navigation, input stays enabled.
  it('shows the re-teach off-ramp on the 3rd failure without remediation or navigation', async () => {
    queuedRecallResults = [
      {
        passed: false,
        failureCount: 3,
        failureAction: 'feedback_only',
        offRampStage: 're_teach',
        hint: 'Here is a hint framed differently.',
      },
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('mock-send-button'));

    await waitFor(() => {
      expect(
        screen.getByText('Here is a hint framed differently.'),
      ).toBeTruthy();
    });

    expect(screen.queryByTestId('remediation-card')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    // Input stays enabled — the learner can retry in the same flow.
    expect(screen.getByTestId('mock-send-button')).toBeTruthy();
  });

  // [WI-1462 / RR-4] The 2nd consecutive failure after re-teach parks the
  // topic without ever auto-navigating — review/relearn stay explicit taps.
  it('parks the topic on the 4th failure without auto-navigating to Library', async () => {
    queuedRecallResults = [
      {
        passed: false,
        failureCount: 4,
        failureAction: 'redirect_to_library',
        offRampStage: 'topic_parked',
        remediation: {
          cooldownEndsAt: '2026-03-30T18:30:00.000Z',
          retentionStatus: 'forgotten',
        },
      },
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('mock-send-button'));

    await waitFor(() => {
      screen.getByTestId('remediation-card');
    });

    // The park is a warm exit, never an automatic redirect.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows success message when text recall passes', async () => {
    queuedRecallResults = [
      {
        passed: true,
        failureCount: 0,
        masteryScore: 0.75,
        xpChange: 'earned',
        nextReviewAt: '2026-04-02T10:00:00.000Z',
      },
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('mock-send-button'));

    await waitFor(() => {
      expect(mockRecallMutate).toHaveBeenCalledWith(
        { topicId: 'topic-1', answer: 'I remember this topic well' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });

    await waitFor(() => {
      screen.getByText(/your memory of this is solid/);
    });
  });

  it('[WI-78 review] ignores repeated text recall sends while the first attempt is pending', () => {
    mockRecallMutate.mockImplementation(() => {
      /* leave pending */
    });

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('mock-send-button'));
    fireEvent.press(screen.getByTestId('mock-send-button'));

    expect(mockRecallMutate).toHaveBeenCalledTimes(1);
  });

  it('[WI-78 DS-202] ignores repeated dont_remember taps while the first attempt is pending', async () => {
    mockRecallMutate.mockImplementation(() => {
      /* leave pending */
    });

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));
    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    expect(mockRecallMutate).toHaveBeenCalledTimes(1);
  });

  it('[WI-78 review] ignores repeated dont_remember taps before streaming state commits', () => {
    mockAnimateResponseImpl = (content, setMessages) => {
      setMessages((prev) => [
        ...prev,
        { id: `ai-${prev.length}`, role: 'assistant', content },
      ]);
      return () => undefined;
    };
    queuedRecallResults = [
      {
        passed: false,
        failureCount: 1,
        failureAction: 'feedback_only',
        hint: 'Try remembering the central definition first.',
      },
      {
        passed: false,
        failureCount: 2,
        failureAction: 'feedback_only',
        hint: 'Second duplicate hint.',
      },
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));
    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    expect(mockRecallMutate).toHaveBeenCalledTimes(1);
  });

  // [WI-2114] Answer-specific Recall Check feedback. The exact preview-device
  // incident: a learner recalling Sylvia Plath got the fixed "Good effort"
  // prompt, and asking "What is wrong with what I said" repeated the same copy
  // verbatim. The fix renders the grader's answer-specific feedback instead.
  describe('[WI-2114] answer-specific feedback', () => {
    beforeEach(() => {
      mockSearchParams = { topicId: 'topic-plath', subjectId: 'subject-lit' };
    });

    it('[AC-1/AC-6 Sylvia Plath] renders grader feedback, not the generic prompt', async () => {
      queuedRecallResults = [
        {
          passed: false,
          failureCount: 1,
          failureAction: 'feedback_only',
          feedback: {
            strengths:
              'You correctly recalled that The Bell Jar is her only novel.',
            gaps: 'You did not mention that Ariel was published after her death.',
            nextStep:
              'Next, note when Ariel appeared and why that timing matters.',
          },
        },
      ];

      render(<RecallTestScreen />);
      fireEvent.press(screen.getByTestId('mock-send-button'));

      await waitFor(() => {
        screen.getByText(/The Bell Jar is her only novel/);
      });
      screen.getByText(/Ariel was published after her death/);
      screen.getByText(/note when Ariel appeared/);
      // The generic "Good effort" prompt must NOT appear when the grader
      // supplied answer-specific feedback.
      expect(screen.queryByText(/Good effort/)).toBeNull();
    });

    it('[AC-5] falls back to the honest generic prompt when the grader gave no feedback', async () => {
      queuedRecallResults = [
        {
          passed: false,
          failureCount: 1,
          failureAction: 'feedback_only',
        },
      ];

      render(<RecallTestScreen />);
      fireEvent.press(screen.getByTestId('mock-send-button'));

      // Cooldown / grader-omitted-feedback path: the generic prompt stays.
      await waitFor(() => {
        screen.getByText(/Good effort/);
      });
    });

    it('[AC-3] consecutive submissions render distinct feedback', async () => {
      queuedRecallResults = [
        {
          passed: false,
          failureCount: 1,
          failureAction: 'feedback_only',
          feedback: {
            strengths: 'First submission: you named the poet.',
            gaps: 'First submission: the collection title is missing.',
            nextStep: 'First submission: add the collection title.',
          },
        },
        {
          passed: false,
          failureCount: 2,
          failureAction: 'feedback_only',
          feedback: {
            strengths: 'Second submission: you added the collection title.',
            gaps: 'Second submission: the publication year is still missing.',
            nextStep: 'Second submission: add the publication year.',
          },
        },
      ];

      render(<RecallTestScreen />);
      fireEvent.press(screen.getByTestId('mock-send-button'));
      await waitFor(() => {
        screen.getByText(/First submission: you named the poet/);
      });
      fireEvent.press(screen.getByTestId('mock-send-button'));
      await waitFor(() => {
        screen.getByText(/Second submission: you added the collection title/);
      });
      // Both distinct feedback bodies are on screen — the second did not repeat
      // the first verbatim.
      screen.getByText(/First submission: add the collection title/);
      screen.getByText(/Second submission: add the publication year/);
    });

    it('[AC-4] renders mentor-language feedback prose while controls stay in the app language', async () => {
      // Feedback arrives already written in the mentor language (here German —
      // server-produced prose); the client renders it verbatim, never through
      // t(). Navigation/controls (the dont-remember button) stay app-language.
      queuedRecallResults = [
        {
          passed: false,
          failureCount: 1,
          failureAction: 'feedback_only',
          feedback: {
            strengths: 'Du hast das Hauptthema richtig erkannt.',
            gaps: 'Dir fehlt noch das Erscheinungsjahr von Ariel.',
            nextStep: 'Nenne als Nächstes das Erscheinungsjahr.',
          },
        },
      ];

      render(<RecallTestScreen />);
      // App-language control label (English en.json) is present up front.
      screen.getByText("I don't remember");

      fireEvent.press(screen.getByTestId('mock-send-button'));

      await waitFor(() => {
        screen.getByText(/Du hast das Hauptthema richtig erkannt/);
      });
      // Mentor-prose rendered verbatim; app-language control unchanged.
      screen.getByText(/Nenne als Nächstes das Erscheinungsjahr/);
      screen.getByText("I don't remember");
    });
  });

  it('[BUG-680] shows timeout fallback when submission hangs past 30s', () => {
    jest.useFakeTimers();
    try {
      mockRecallState.isPending = true;
      render(<RecallTestScreen />);
      act(() => {
        jest.advanceTimersByTime(31_000);
      });
      screen.getByTestId('recall-test-timeout');
      screen.getByTestId('recall-test-timeout-retry');
      screen.getByTestId('recall-test-timeout-back');
    } finally {
      jest.useRealTimers();
    }
  });

  it('[BUG-680] timeout retry clears the timeout state', () => {
    jest.useFakeTimers();
    try {
      mockRecallState.isPending = true;
      render(<RecallTestScreen />);
      act(() => {
        jest.advanceTimersByTime(31_000);
      });
      const retry = screen.getByTestId('recall-test-timeout-retry');
      mockRecallState.isPending = false;
      fireEvent.press(retry);
      expect(screen.queryByTestId('recall-test-timeout')).toBeNull();
      // Retry must also reset the mutation observer so a fresh send is
      // allowed and TanStack state (data/error/status) is cleared.
      expect(mockRecallReset).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('[BUG-680 regression] late callbacks from the abandoned attempt do NOT mutate state after retry', async () => {
    jest.useFakeTimers();
    try {
      // First mutate() is deferred — we capture its callbacks and fire them
      // AFTER the user has pressed timeout-retry, simulating a late response
      // from a hung request.
      queuedRecallResults = ['defer' as unknown as Record<string, unknown>];
      mockRecallState.isPending = true;
      render(<RecallTestScreen />);

      // Send a message — callbacks are captured but not invoked.
      fireEvent.press(screen.getByTestId('mock-send-button'));
      expect(deferredCallbacks).not.toBeNull();
      const userMessage = screen.getByText('I remember this topic well');
      expect(userMessage).toBeTruthy();

      // Surface the timeout, then press retry.
      act(() => {
        jest.advanceTimersByTime(31_000);
      });
      mockRecallState.isPending = false;
      fireEvent.press(screen.getByTestId('recall-test-timeout-retry'));

      // Now the abandoned request finally resolves (success).
      act(() => {
        deferredCallbacks?.onSuccess?.({
          passed: true,
          failureCount: 0,
          masteryScore: 0.9,
        });
      });

      // The success-path animateResponse would append an AI bubble and
      // lock the input. Neither must happen because the submission is
      // stale.
      expect(screen.queryByText(/your memory of this is solid/)).toBeNull();
      // mock-send-button only renders while input is not disabled — so its
      // presence is proof input remained enabled.
      expect(screen.getByTestId('mock-send-button')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows error message and rolls back count on failure', async () => {
    // UX-DE-L8: errors are surfaced via platformAlert (not as AI chat bubble).
    const alertSpy = jest.spyOn(Alert, 'alert').mockReturnValue(undefined);
    queuedRecallResults = [
      new Error('Network error') as unknown as Record<string, unknown>,
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    // platformAlert passes through Alert.alert(title, message, buttons?, options?),
    // so assert positional args 0 and 1 explicitly rather than using
    // toHaveBeenCalledWith (which enforces arity).
    const [title, message] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('Something went wrong');
    expect(message).toMatch(/offline|can't be reached/i);
    alertSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // [LEARN-14] Relearn CTA no-ops when deep link lacks subjectId
  // -----------------------------------------------------------------------
  // Helper: drive the remediation card to render so the Relearn CTA exists.
  const renderWithRemediationCard = () => {
    queuedRecallResults = [
      {
        passed: false,
        failureCount: 4,
        failureAction: 'redirect_to_library',
        offRampStage: 'topic_parked',
        remediation: {
          cooldownEndsAt: '2026-03-30T18:30:00.000Z',
          retentionStatus: 'forgotten',
        },
      },
    ];
    render(<RecallTestScreen />);
    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));
    return waitFor(() => screen.getByTestId('remediation-card'));
  };

  it('[LEARN-14] Relearn CTA uses paramSubjectId when present', async () => {
    mockSearchParams = { topicId: 'topic-1', subjectId: 'subject-1' };
    await renderWithRemediationCard();

    fireEvent.press(screen.getByTestId('relearn-topic-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: expect.objectContaining({
        topicId: 'topic-1',
        subjectId: 'subject-1',
      }),
    });
  });

  it('[LEARN-14] Relearn CTA uses resolved subjectId when deep link omits it', async () => {
    mockSearchParams = { topicId: 'topic-1' };
    mockResolveResult = { subjectId: 'resolved-subject' };
    await renderWithRemediationCard();

    fireEvent.press(screen.getByTestId('relearn-topic-button'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/topic/relearn',
      params: expect.objectContaining({
        topicId: 'topic-1',
        subjectId: 'resolved-subject',
      }),
    });
  });

  it('[F-172] pressing dont-remember while handleSend is in-flight fires mutate only once total', async () => {
    // Arrange: first mutate() is deferred so the in-flight flag stays set.
    queuedRecallResults = ['defer' as unknown as Record<string, unknown>];

    render(<RecallTestScreen />);

    // Act: fire handleSend (sets submissionInFlightRef) — deferred, stays pending.
    fireEvent.press(screen.getByTestId('mock-send-button'));
    expect(mockRecallMutate).toHaveBeenCalledTimes(1);

    // Act: immediately fire handleDontRemember — should be blocked by shared guard.
    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    // Assert: second mutate() must NOT have fired.
    expect(mockRecallMutate).toHaveBeenCalledTimes(1);
  });

  it('[F-172] screen is not permanently locked after a dont-remember API error', async () => {
    // Arrange: first dont-remember call returns an error.
    queuedRecallResults = [new Error('network error')];

    render(<RecallTestScreen />);

    // Act: press dont-remember — the error handler fires synchronously.
    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));

    // Assert: the shared gate must have been released — a subsequent
    // dont-remember press should be accepted (mutate called a second time).
    queuedRecallResults = [
      {
        passed: false,
        failureCount: 1,
        failureAction: 'feedback_only',
        hint: 'Try again.',
      },
    ];
    fireEvent.press(screen.getByTestId('recall-dont-remember-button'));
    expect(mockRecallMutate).toHaveBeenCalledTimes(2);
  });

  it('[T13] shows warm grader-unavailable copy and re-submits the preserved answer on retry', async () => {
    // Construct a 502 UPSTREAM_ERROR (recall grader unavailable). We can't import
    // the UpstreamError class here, so replicate its detectable shape.
    const graderDown = new Error('recall grader unavailable');
    graderDown.name = 'UpstreamError';
    Object.assign(graderDown, { code: 'UPSTREAM_ERROR', status: 502 });

    queuedRecallResults = [
      graderDown,
      {
        passed: true,
        failureCount: 0,
        masteryScore: 0.8,
        nextReviewAt: '2026-04-02T10:00:00.000Z',
      },
    ];

    render(<RecallTestScreen />);

    // First send → grader unavailable → warm, answer-safe fallback (not an alert).
    fireEvent.press(screen.getByTestId('mock-send-button'));

    await waitFor(() => {
      screen.getByTestId('recall-test-grading-unavailable');
    });
    // getByText throws if absent — it is itself the assertion (no toBeTruthy).
    screen.getByText(/couldn't check it just now/);

    // The answer was submitted once and the typed text is preserved for retry.
    expect(mockRecallMutate).toHaveBeenCalledTimes(1);
    expect(mockRecallMutate).toHaveBeenNthCalledWith(
      1,
      { topicId: 'topic-1', answer: 'I remember this topic well' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    // Retry re-submits the SAME preserved answer (works because the server
    // restored the cooldown, C-2) — without re-prompting the learner.
    fireEvent.press(screen.getByTestId('recall-test-grading-retry'));

    await waitFor(() => {
      expect(mockRecallMutate).toHaveBeenCalledTimes(2);
    });
    expect(mockRecallMutate).toHaveBeenNthCalledWith(
      2,
      { topicId: 'topic-1', answer: 'I remember this topic well' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    await waitFor(() => {
      screen.getByText(/your memory of this is solid/);
    });
    expect(screen.queryByTestId('recall-test-grading-unavailable')).toBeNull();
  });

  it('[T13] a non-grader send error still surfaces the generic alert (no false grading fallback)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockReturnValue(undefined);
    queuedRecallResults = [
      new Error('network error') as unknown as Record<string, unknown>,
    ];

    render(<RecallTestScreen />);

    fireEvent.press(screen.getByTestId('mock-send-button'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('recall-test-grading-unavailable')).toBeNull();
    alertSpy.mockRestore();
  });

  it('[LEARN-14] Relearn CTA still navigates (to picker) when subjectId is fully unresolved — no silent no-op', async () => {
    mockSearchParams = { topicId: 'topic-1' };
    mockResolveResult = undefined;
    await renderWithRemediationCard();

    fireEvent.press(screen.getByTestId('relearn-topic-button'));

    // The push MUST happen (no silent return). When subjectId is unresolved,
    // relearn falls back to its subject-picker phase — that's the actionable
    // recovery path required by UX Resilience.
    expect(mockPush).toHaveBeenCalledTimes(1);
    const [pushArg] = mockPush.mock.calls[0] ?? [];
    expect(pushArg.pathname).toBe('/(app)/topic/relearn');
    expect(pushArg.params.topicId).toBe('topic-1');
    expect(pushArg.params.subjectId).toBeUndefined();
  });
});
