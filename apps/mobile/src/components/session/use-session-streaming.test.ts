import { renderHook, act } from '@testing-library/react-native';
import {
  buildSessionApiMessage,
  useSessionStreaming,
} from './use-session-streaming';
import { QuotaExceededError } from '../../lib/api-client';
import { UpstreamError } from '../../lib/api-errors';

const mockCaptureException = jest.fn();

jest.mock(
  '../../lib/sentry' /* gc1-allow: Sentry SDK loads native module config in Jest */,
  () => ({
    Sentry: {
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    },
  }),
);

// Mock ChatShell directly so the hook can avoid the session barrel cycle.
// prettier-ignore
jest.mock('./ChatShell', () => ({ // gc1-allow: hook test avoids the session barrel cycle; only the animation helper is needed
  animateResponse: jest.fn(() => jest.fn()),
}));

// Mock session recovery
const mockWriteRecoveryMarker = jest.fn().mockResolvedValue(undefined);
// prettier-ignore
jest.mock('../../lib/session-recovery', () => ({ // gc1-allow: uses Expo SecureStore native storage that cannot be exercised in JSDOM
  writeSessionRecoveryMarker: (...args: unknown[]) =>
    mockWriteRecoveryMarker(...args),
}));

// Mock homework problem-cards
jest.mock(
  '../homework/problem-cards' /* gc1-allow: pattern-a conversion; problem-cards transitively imports native modules unavailable in JSDOM */,
  () => ({
    ...jest.requireActual('../homework/problem-cards'),
    buildHomeworkSessionMetadata: jest.fn(() => ({})),
    withProblemMode: jest.fn((problems: unknown[]) => problems),
  }),
);

const RECONNECT_ERROR_TEXT =
  'Lost connection — check your network and tap Reconnect to try again.';

function applyMessageUpdates(
  calls: Array<[unknown]>,
  initialState: Array<Record<string, unknown>>,
) {
  return calls.reduce<Array<Record<string, unknown>>>((state, [update]) => {
    if (typeof update === 'function') {
      return (
        update as (
          prev: Array<Record<string, unknown>>,
        ) => Array<Record<string, unknown>>
      )(state);
    }
    return update as Array<Record<string, unknown>>;
  }, initialState);
}

// ---------------------------------------------------------------------------
// Options factory — builds the ~30-field dependency bag for useSessionStreaming.
// Declared at module scope for brevity but silenceTimerRef cleanup is handled
// in the describe-level afterEach via the returned ref.
// ---------------------------------------------------------------------------

function createMockOpts(overrides: Record<string, unknown> = {}) {
  const silenceTimerRef = {
    current: null as ReturnType<typeof setTimeout> | null,
  };
  return {
    activeSessionId: null as string | null,
    setActiveSessionId: jest.fn(),
    effectiveSubjectId: 'subject-1',
    effectiveSubjectName: 'Math',
    effectiveMode: 'learning',
    topicId: undefined,
    inputMode: 'text' as const,
    rawInput: undefined,
    verificationType: undefined,
    normalizedOcrText: undefined,
    homeworkCaptureSource: undefined,

    messages: [] as Array<{ id: string; role: string; content: string }>,
    setMessages: jest.fn(),
    setIsStreaming: jest.fn(),
    setExchangeCount: jest.fn(),
    setEscalationRung: jest.fn(),
    setQuotaError: jest.fn(),
    setNotePromptOffered: jest.fn(),
    setShowNoteInput: jest.fn(),
    setResponseHistory: jest.fn(),
    setHomeworkProblemsState: jest.fn(),
    setFluencyDrill: jest.fn(),
    setLanguageLearning: jest.fn(),
    setChallengeRound: jest.fn(),
    setChallengeOffer: jest.fn(),
    setDraftedNote: jest.fn(),
    setLowConfidenceMessageId: jest.fn(),

    homeworkProblemsState: [],
    currentProblemIndex: 0,
    activeHomeworkProblem: undefined,
    homeworkMode: undefined,

    subjectId: undefined,
    classifiedSubject: null,

    isStreaming: false,
    sessionExpired: false,
    quotaError: null,
    draftText: '',
    notePromptOffered: false,

    animationCleanupRef: { current: null },
    silenceTimerRef,
    lastAiAtRef: { current: null },
    lastExpectedMinutesRef: { current: 10 },
    lastRetryPayloadRef: { current: null },
    trackerStateRef: { current: {} },
    imageBase64Ref: { current: null as string | null },
    imageMimeTypeRef: {
      current: null as 'image/jpeg' | 'image/png' | 'image/webp' | null,
    },

    activeProfileId: 'profile-1',

    apiClient: {
      sessions: {
        ':sessionId': {
          'homework-state': {
            $post: jest.fn().mockResolvedValue({ ok: true }),
          },
        },
      },
      subjects: {
        ':subjectId': {
          sessions: {
            $post: jest.fn().mockResolvedValue({
              ok: true,
              json: async () => ({ session: { id: 'new-session-1' } }),
            }),
          },
        },
      },
      celebrations: {
        pending: {
          $get: jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ pendingCelebrations: [] }),
          }),
        },
        seen: {
          $post: jest.fn().mockResolvedValue({ ok: true }),
        },
      },
    },

    startSession: {
      mutateAsync: jest.fn().mockResolvedValue({
        session: { id: 'new-session-1' },
      }),
    },

    streamMessage: jest.fn(
      async (
        _text: string,
        onChunk: (accumulated: string) => void,
        onComplete: (result: Record<string, unknown>) => Promise<void>,
        _sessionId: string,
      ) => {
        onChunk('Helpful answer');
        await onComplete({
          aiEventId: 'ai-event-1',
          exchangeCount: 1,
          escalationRung: 0,
          expectedResponseMinutes: 5,
        });
      },
    ),

    recordSystemPrompt: {
      mutateAsync: jest.fn().mockResolvedValue(undefined),
    },

    trackExchange: jest.fn(() => ({
      triggered: [],
      trackerState: {},
    })),
    trigger: jest.fn(),

    createLocalMessageId: jest.fn(
      (prefix: string) => `${prefix}-${Date.now()}`,
    ),
    responseHistory: [],

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSessionApiMessage', () => {
  it('turns a first topic acknowledgement into a clear teaching request', () => {
    expect(
      buildSessionApiMessage('ok', {
        effectiveMode: 'learning',
        topicName: 'Cells',
        messages: [{ id: 'opening', role: 'assistant', content: 'Ready?' }],
      } as any),
    ).toBe('I\'m ready. Please start teaching me "Cells" from the beginning.');
  });

  it('keeps substantive learner messages unchanged', () => {
    expect(
      buildSessionApiMessage('Can you explain cells?', {
        effectiveMode: 'learning',
        topicName: 'Cells',
        messages: [{ id: 'opening', role: 'assistant', content: 'Ready?' }],
      } as any),
    ).toBe('Can you explain cells?');
  });

  it('keeps later acknowledgements unchanged', () => {
    expect(
      buildSessionApiMessage('ok', {
        effectiveMode: 'learning',
        topicName: 'Cells',
        messages: [
          { id: 'opening', role: 'assistant', content: 'Ready?' },
          { id: 'user-1', role: 'user', content: 'Start here' },
        ],
      } as any),
    ).toBe('ok');
  });
});

describe('useSessionStreaming', () => {
  // Track silence timer refs across tests so afterEach can clear pending timers
  // created by scheduleSilencePrompt (real setTimeout with multi-minute delay).
  const activeTimerRefs: Array<{
    current: ReturnType<typeof setTimeout> | null;
  }> = [];

  function makeOpts(overrides: Record<string, unknown> = {}) {
    const o = createMockOpts(overrides);
    activeTimerRefs.push(o.silenceTimerRef as any);
    return o;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptureException.mockClear();
  });

  afterEach(() => {
    for (const ref of activeTimerRefs) {
      if (ref.current) clearTimeout(ref.current);
      ref.current = null;
    }
    activeTimerRefs.length = 0;
  });

  // -------------------------------------------------------------------------
  // ensureSession
  // -------------------------------------------------------------------------

  describe('ensureSession', () => {
    it('returns existing sessionId when one is active', async () => {
      const opts = makeOpts({ activeSessionId: 'existing-123' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let sessionId: string | null = null;
      await act(async () => {
        sessionId = await result.current.ensureSession();
      });

      expect(sessionId).toBe('existing-123');
      expect(opts.startSession.mutateAsync).not.toHaveBeenCalled();
    });

    it('creates a new session via startSession when none exists', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let sessionId: string | null = null;
      await act(async () => {
        sessionId = await result.current.ensureSession();
      });

      expect(sessionId).toBe('new-session-1');
      expect(opts.startSession.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectId: 'subject-1',
          sessionType: 'learning',
          inputMode: 'text',
          metadata: expect.objectContaining({ effectiveMode: 'learning' }),
        }),
      );
      expect(opts.setActiveSessionId).toHaveBeenCalledWith('new-session-1');
    });

    it('uses API client directly when overrideSubjectId is provided', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.ensureSession('override-subject');
      });

      expect(
        opts.apiClient.subjects[':subjectId'].sessions.$post,
      ).toHaveBeenCalled();
      // Should NOT use startSession.mutateAsync when override is given
      expect(opts.startSession.mutateAsync).not.toHaveBeenCalled();
    });

    it('returns null when no subject is available', async () => {
      const opts = makeOpts({ effectiveSubjectId: '' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let sessionId: string | null = null;
      await act(async () => {
        sessionId = await result.current.ensureSession();
      });

      expect(sessionId).toBeNull();
    });

    it('creates homework session type when mode is homework', async () => {
      const opts = makeOpts({ effectiveMode: 'homework' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.ensureSession();
      });

      expect(opts.startSession.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sessionType: 'homework' }),
      );
    });

    it('captures homework metadata sync failure to Sentry while preserving the new session', async () => {
      const err = new Error('homework metadata down');
      const opts = makeOpts({
        effectiveMode: 'homework',
        homeworkProblemsState: [{ id: 'p1', text: 'Solve x+1=2' }],
        apiClient: {
          ...createMockOpts().apiClient,
          sessions: {
            ':sessionId': {
              'homework-state': {
                $post: jest.fn().mockRejectedValue(err),
              },
            },
          },
        },
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let sessionId: string | null = null;
      await act(async () => {
        sessionId = await result.current.ensureSession();
      });

      expect(sessionId).toBe('new-session-1');
      expect(opts.setActiveSessionId).toHaveBeenCalledWith('new-session-1');
      expect(mockCaptureException).toHaveBeenCalledWith(err, {
        tags: {
          surface: 'session',
          feature: 'homework_metadata_sync',
          sync_scope: 'ensure_session',
          sessionId: 'new-session-1',
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // continueWithMessage
  // -------------------------------------------------------------------------

  describe('continueWithMessage', () => {
    it('expands a first topic acknowledgement before streaming', async () => {
      const opts = makeOpts({
        topicName: 'What Makes Something Alive?',
        messages: [
          {
            id: 'opening',
            role: 'assistant',
            content: 'Today we are starting.',
          },
        ],
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('ok');
      });

      expect(opts.streamMessage).toHaveBeenCalledWith(
        'I\'m ready. Please start teaching me "What Makes Something Alive?" from the beginning.',
        expect.any(Function),
        expect.any(Function),
        'new-session-1',
        expect.objectContaining({
          idempotencyKey: expect.any(String),
          onReplay: expect.any(Function),
        }),
      );
    });

    it('creates session, streams message, and updates state on success', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('What is algebra?');
      });

      // Session was created
      expect(opts.startSession.mutateAsync).toHaveBeenCalled();
      // Stream was started — durability layer wraps the streamOptions with
      // idempotencyKey + onReplay (set when an outbox entry is enqueued).
      expect(opts.streamMessage).toHaveBeenCalledWith(
        'What is algebra?',
        expect.any(Function), // onChunk
        expect.any(Function), // onComplete
        'new-session-1',
        expect.objectContaining({
          idempotencyKey: expect.any(String),
          onReplay: expect.any(Function),
        }),
      );
      // State was updated via onComplete callback
      expect(opts.setExchangeCount).toHaveBeenCalledWith(1);
      expect(opts.setEscalationRung).toHaveBeenCalledWith(0);
      expect(opts.setIsStreaming).toHaveBeenCalledWith(false);
    });

    it('stores challenge round affordances from the typed done payload', async () => {
      const challengeRound = {
        state: 'active',
        startedAt: '2026-05-26T10:00:00.000Z',
        questionIndex: 1,
        totalQuestions: 3,
        offerCount: 1,
        topicId: '11111111-1111-4111-8111-111111111111',
        declinedDontAskAgain: false,
        evaluations: [],
      };
      const draftedNote = {
        id: 'draft-1',
        body: null,
        sourceAnswerEventIds: ['answer-event-1'],
        fallbackPrompt: 'Write this one in your own words.',
      };
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string,
          ) => {
            onChunk('Challenge time.');
            await onComplete({
              aiEventId: 'ai-event-1',
              exchangeCount: 1,
              escalationRung: 1,
              expectedResponseMinutes: 5,
              challengeRound,
              challengeOffer: { pitch: 'Want a harder round?' },
              draftedNote,
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('I know this already');
      });

      expect(opts.setChallengeRound).toHaveBeenCalledWith(challengeRound);
      expect(opts.setChallengeOffer).toHaveBeenCalledWith({
        pitch: 'Want a harder round?',
      });
      expect(opts.setDraftedNote).toHaveBeenCalledWith(draftedNote);
    });

    it('attaches a homework image only when the send explicitly requests it', async () => {
      const imageBase64Ref = { current: 'homework-image-base64' };
      const imageMimeTypeRef = {
        current: 'image/jpeg' as const,
      };
      const opts = makeOpts({
        effectiveMode: 'homework',
        imageBase64Ref,
        imageMimeTypeRef,
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Solve 2x + 5 = 17');
      });

      const streamOptions = (opts.streamMessage as jest.Mock).mock
        .calls[0]?.[4];
      expect(streamOptions).not.toHaveProperty('imageBase64');
      expect(streamOptions).not.toHaveProperty('imageMimeType');
      expect(imageBase64Ref.current).toBe('homework-image-base64');
      expect(imageMimeTypeRef.current).toBe('image/jpeg');
    });

    it('sends the homework image with the requested first turn and then clears it', async () => {
      const imageBase64Ref = { current: 'homework-image-base64' };
      const imageMimeTypeRef = {
        current: 'image/jpeg' as const,
      };
      const opts = makeOpts({
        effectiveMode: 'homework',
        imageBase64Ref,
        imageMimeTypeRef,
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Solve 2x + 5 = 17', {
          attachImage: true,
        });
      });

      expect(opts.streamMessage).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        'new-session-1',
        expect.objectContaining({
          idempotencyKey: expect.any(String),
          imageBase64: 'homework-image-base64',
          imageMimeType: 'image/jpeg',
        }),
      );
      expect(imageBase64Ref.current).toBeNull();
      expect(imageMimeTypeRef.current).toBeNull();
    });

    it('does not attach a queued homework image outside homework mode even when requested', async () => {
      const imageBase64Ref = { current: 'homework-image-base64' };
      const imageMimeTypeRef = {
        current: 'image/jpeg' as const,
      };
      const opts = makeOpts({
        effectiveMode: 'learning',
        imageBase64Ref,
        imageMimeTypeRef,
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('hi', {
          attachImage: true,
        });
      });

      const streamOptions = (opts.streamMessage as jest.Mock).mock
        .calls[0]?.[4];
      expect(streamOptions).not.toHaveProperty('imageBase64');
      expect(streamOptions).not.toHaveProperty('imageMimeType');
      expect(imageBase64Ref.current).toBe('homework-image-base64');
      expect(imageMimeTypeRef.current).toBe('image/jpeg');
    });

    it('keeps the session input locked until the low-level stream settles', async () => {
      let releaseStream!: () => void;
      let markDoneHandlerComplete!: () => void;
      const streamGate = new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      const doneHandlerComplete = new Promise<void>((resolve) => {
        markDoneHandlerComplete = resolve;
      });
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string,
          ) => {
            onChunk('Helpful answer');
            await onComplete({
              aiEventId: 'ai-event-1',
              exchangeCount: 1,
              escalationRung: 0,
              expectedResponseMinutes: 5,
            });
            markDoneHandlerComplete();
            await streamGate;
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let sendPromise!: Promise<void>;
      await act(async () => {
        sendPromise = result.current.continueWithMessage('What is algebra?');
        await doneHandlerComplete;
      });

      expect(opts.setExchangeCount).toHaveBeenCalledWith(1);
      expect(opts.setIsStreaming).toHaveBeenCalledWith(true);
      expect(opts.setIsStreaming).not.toHaveBeenCalledWith(false);

      await act(async () => {
        releaseStream();
        await sendPromise;
      });

      expect(opts.setIsStreaming).toHaveBeenCalledWith(false);
    });

    it('queues overlapping sends until the active turn fully settles', async () => {
      let releaseFirstStream!: () => void;
      let markFirstDoneHandlerComplete!: () => void;
      const firstStreamGate = new Promise<void>((resolve) => {
        releaseFirstStream = resolve;
      });
      const firstDoneHandlerComplete = new Promise<void>((resolve) => {
        markFirstDoneHandlerComplete = resolve;
      });
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string,
          ) => {
            onChunk('Helpful answer');
            await onComplete({
              aiEventId: 'ai-event-1',
              exchangeCount: 1,
              escalationRung: 0,
              expectedResponseMinutes: 5,
            });

            if ((opts.streamMessage as jest.Mock).mock.calls.length === 1) {
              markFirstDoneHandlerComplete();
              await firstStreamGate;
            }
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let firstSend!: Promise<void>;
      await act(async () => {
        firstSend = result.current.continueWithMessage('First turn');
        await firstDoneHandlerComplete;
      });

      const secondSend = result.current.continueWithMessage('Second turn');
      await Promise.resolve();
      expect(opts.streamMessage).toHaveBeenCalledTimes(1);

      await act(async () => {
        releaseFirstStream();
        await firstSend;
        await secondSend;
      });

      expect(opts.streamMessage).toHaveBeenCalledTimes(2);
      expect(opts.streamMessage).toHaveBeenNthCalledWith(
        2,
        'Second turn',
        expect.any(Function),
        expect.any(Function),
        'new-session-1',
        expect.objectContaining({
          idempotencyKey: expect.any(String),
          onReplay: expect.any(Function),
        }),
      );
    });

    // [BUG-292 / PR #268] Regression guard for the N≥3 concurrent-caller race.
    //
    // Original shape:
    //   while (activeContinueRef.current) { await activeContinueRef.current; }
    //   activeContinueRef.current = currentTurn;
    //
    // With three concurrent callers, all three observe `ref.current === null`
    // on the same microtask tick and each writes its own promise into the ref
    // (last writer wins). The check-then-act window between the while exit
    // and the assignment means all three streams ran in parallel — duplicate
    // continues — and earlier turns were stranded with their resolves never
    // being awaited by the next entrant. The replacement is an atomic
    // chain-tail swap: read predecessor + install self in one sync block,
    // then await predecessor before doing any work.
    //
    // This test fires 3 concurrent callers, gates each stream so they
    // overlap in time, and asserts strict FIFO serialization: at most one
    // stream is in-flight at any moment AND streams start in submission order.
    it('[BUG-292] serializes N≥3 concurrent callers — no duplicate concurrent streams', async () => {
      // Each gate forces its stream to stay in-flight until released, so a
      // racing implementation would have multiple streams running together.
      const streamReleases: Array<() => void> = [];
      const inflight: string[] = []; // texts currently in their stream body
      const peakInflight = { value: 0 };
      const startOrder: string[] = [];

      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string,
          ) => {
            startOrder.push(text);
            inflight.push(text);
            peakInflight.value = Math.max(peakInflight.value, inflight.length);

            // Wait until this stream is explicitly released. This holds the
            // chain so subsequent callers must queue behind us — a broken
            // implementation would let them barge in and inflight.length
            // would exceed 1.
            await new Promise<void>((resolve) => {
              streamReleases.push(resolve);
            });

            onChunk(`reply to ${text}`);
            await onComplete({
              aiEventId: `ai-event-${text}`,
              exchangeCount: 1,
              escalationRung: 0,
              expectedResponseMinutes: 5,
            });

            inflight.splice(inflight.indexOf(text), 1);
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      // Fire three callers in one synchronous burst — this is the exact
      // shape that triggered the race (taps in rapid succession, voice
      // input flush concurrent with a manual send, reconnect colliding
      // with an autosend, etc.).
      let p1!: Promise<void>;
      let p2!: Promise<void>;
      let p3!: Promise<void>;
      await act(async () => {
        p1 = result.current.continueWithMessage('first');
        p2 = result.current.continueWithMessage('second');
        p3 = result.current.continueWithMessage('third');
        // Let queued microtasks run so the first caller enters its stream.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Only ONE caller may be inside streamMessage at this point. If the
      // race were present, all three would be in their stream bodies and
      // peakInflight.value would be 3.
      expect(peakInflight.value).toBe(1);
      expect(inflight).toEqual(['first']);
      expect(opts.streamMessage).toHaveBeenCalledTimes(1);

      // Release first → second should start, but not third.
      await act(async () => {
        streamReleases[0]?.();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await p1;
      });
      expect(peakInflight.value).toBe(1);
      expect(opts.streamMessage).toHaveBeenCalledTimes(2);
      expect(inflight).toEqual(['second']);

      // Release second → third runs.
      await act(async () => {
        streamReleases[1]?.();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await p2;
      });
      expect(peakInflight.value).toBe(1);
      expect(opts.streamMessage).toHaveBeenCalledTimes(3);
      expect(inflight).toEqual(['third']);

      await act(async () => {
        streamReleases[2]?.();
        await p3;
      });

      // Every caller was handled exactly once, in submission order, with
      // strictly one stream in flight at any moment.
      expect(opts.streamMessage).toHaveBeenCalledTimes(3);
      expect(startOrder).toEqual(['first', 'second', 'third']);
      expect(peakInflight.value).toBe(1);
      expect(inflight).toEqual([]);
    });

    it('stores retry payload before ensureSession for crash recovery', async () => {
      const lastRetryPayloadRef = { current: null as any };
      const opts = makeOpts({ lastRetryPayloadRef });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Hello', {
          sessionSubjectId: 's1',
        });
      });

      // Retry payload was set BEFORE ensureSession (for BUG-331 fix). The
      // durability layer also stamps an outboxEntryId for replay correlation.
      expect(lastRetryPayloadRef.current).toMatchObject({
        text: 'Hello',
        options: expect.objectContaining({ sessionSubjectId: 's1' }),
        outboxEntryId: expect.any(String),
      });
    });

    it('tracks exchange milestones and triggers celebrations', async () => {
      const opts = makeOpts();
      (opts.trackExchange as jest.Mock).mockReturnValue({
        triggered: ['first_exchange'],
        trackerState: { exchangeCount: 1 },
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      expect(opts.trackExchange).toHaveBeenCalled();
      expect(opts.trigger).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'first_exchange' }),
      );
    });

    it('surfaces graded-input activity from a completed language turn', async () => {
      const languageLearning = {
        strand: 'meaning_input',
        activityType: 'graded_input',
        modality: 'text',
        targetWords: ['agua'],
        targetGrammar: [],
        gradedInput: {
          type: 'graded_input',
          modality: 'reading',
          cefrLevel: 'A1',
          knownWordRatioTarget: 0.85,
          knownWordEstimate: 0.82,
          targetWords: ['agua'],
          text: 'Tengo agua en la mesa.',
          comprehensionQuestions: [
            {
              id: 'q1',
              prompt: 'What is on the table?',
              answerHint: 'agua',
            },
          ],
          audioEnabled: true,
        },
      };
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
          ) => {
            onChunk('Read this.');
            await onComplete({
              aiEventId: 'ai-event-graded-input',
              exchangeCount: 1,
              escalationRung: 0,
              expectedResponseMinutes: 5,
              languageLearning,
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Hola');
      });

      expect(opts.setLanguageLearning).toHaveBeenCalledWith(languageLearning);
    });

    it('surfaces meaning-output activity from a completed language turn [WI-1756]', async () => {
      // Regression guard: languageLearning used to be dropped to `null`
      // whenever `gradedInput` was absent, which silently discarded every
      // meaning_output turn (WI-1756 AC1). This object has no `gradedInput`
      // key at all.
      const languageLearning = {
        strand: 'meaning_output',
        activityType: 'free_response',
        modality: 'text',
        targetWords: ['agua'],
        targetGrammar: [],
        meaningOutput: {
          type: 'meaning_output',
          taskType: 'personal_answer',
          communicativeGoal:
            'Share a true or imagined personal answer someone could respond to.',
          prompt: 'Answer personally in one or two short sentences using agua.',
          responseMode: 'short_answer',
          targetWords: ['agua'],
          targetGrammar: [],
          retryExpectation: 'retry_after_feedback',
          correctionExpectation: 'meaning_first_then_form',
        },
      };
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
          ) => {
            onChunk('Tell me about your day.');
            await onComplete({
              aiEventId: 'ai-event-meaning-output',
              exchangeCount: 1,
              escalationRung: 0,
              expectedResponseMinutes: 5,
              languageLearning,
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Hola');
      });

      expect(opts.setLanguageLearning).toHaveBeenCalledWith(languageLearning);
    });

    it('surfaces speaking-practice activity from a completed language turn [WI-1777]', async () => {
      // Regression guard: the allowlist gate must include `speakingPractice`
      // or the entire languageLearning state update is silently dropped —
      // the exact WI-1756 bug pattern, applied to the new artifact field.
      // This object has no `gradedInput`/`meaningOutput` key at all.
      const languageLearning = {
        strand: 'fluency',
        activityType: 'repeat_after_me',
        modality: 'voice',
        targetWords: [],
        targetGrammar: [],
        speakingPractice: {
          type: 'repeat_after_me',
          targetText: 'I like coffee.',
          locale: 'en-US',
          modality: 'voice',
          retryGuidance: 'retry_same_target',
        },
      };
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
          ) => {
            onChunk('Repeat after me.');
            await onComplete({
              aiEventId: 'ai-event-speaking-practice',
              exchangeCount: 1,
              escalationRung: 0,
              expectedResponseMinutes: 5,
              languageLearning,
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Hola');
      });

      expect(opts.setLanguageLearning).toHaveBeenCalledWith(languageLearning);
    });

    it('shows error message when session creation fails', async () => {
      const opts = makeOpts({ effectiveSubjectId: '' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      // BUG-144: The no-subject fallback used to animate the error into the
      // transcript as a plain AI message — user got un-actionable text and
      // had no retry path. The fallback now appends a typed system message
      // (kind: 'reconnect_prompt'), which activates the inline Reconnect
      // affordance via SessionMessageActions. animateResponse must NOT be
      // called in this path.
      const { animateResponse } = require('./ChatShell');
      expect(animateResponse).not.toHaveBeenCalled();

      // Verify a reconnect-prompt system message was appended.
      const setMessagesCalls = (opts.setMessages as jest.Mock).mock.calls;
      const appendedMessages: any[] = [];
      for (const [updater] of setMessagesCalls) {
        if (typeof updater === 'function') {
          const next = updater([]);
          if (Array.isArray(next)) appendedMessages.push(...next);
        }
      }
      const reconnectPrompt = appendedMessages.find(
        (m) => m?.kind === 'reconnect_prompt',
      );
      expect(reconnectPrompt).toBeDefined();
      expect(reconnectPrompt.role).toBe('assistant');
      expect(reconnectPrompt.isSystemPrompt).toBe(true);
      expect(reconnectPrompt.content).toEqual(
        expect.stringContaining('select a subject'),
      );
    });

    it('handles QuotaExceededError with structured card', async () => {
      const quotaDetails = {
        tier: 'free' as const,
        effectiveAccessTier: 'free' as const,
        quotaModel: 'per-profile' as const,
        profileRole: 'child' as const,
        reason: 'daily' as const,
        resetsAt: '2026-05-27T01:00:00.000Z',
        dailyLimit: 10,
        monthlyLimit: 100,
        usedToday: 10,
        usedThisMonth: 50,
        topUpCreditsRemaining: 0,
        upgradeOptions: [],
      };
      const opts = makeOpts({
        streamMessage: jest
          .fn()
          .mockRejectedValue(
            new QuotaExceededError('Quota exceeded', quotaDetails),
          ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      expect(opts.setQuotaError).toHaveBeenCalledWith(quotaDetails);
      expect(opts.setIsStreaming).toHaveBeenCalledWith(false);
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('handles reconnectable errors with reconnect prompt', async () => {
      const networkError = new TypeError('Failed to fetch');
      const opts = makeOpts({
        streamMessage: jest.fn().mockRejectedValue(networkError),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      expect(opts.setIsStreaming).toHaveBeenCalledWith(false);
      // setMessages should have been called to show the error
      expect(opts.setMessages).toHaveBeenCalled();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('captures upstream LLM stream errors before showing reconnect prompt', async () => {
      const llmError = new UpstreamError(
        'Something went wrong while generating a reply. Please try again.',
        'LLM_UNAVAILABLE',
        502,
      );
      const opts = makeOpts({
        activeSessionId: 'session-1',
        effectiveMode: 'learning',
        topicId: 'topic-1',
        inputMode: 'voice',
        streamMessage: jest.fn().mockRejectedValue(llmError),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      expect(mockCaptureException).toHaveBeenCalledWith(llmError, {
        tags: {
          surface: 'session_stream',
          feature: 'llm',
          mode: 'learning',
          reconnectable: 'true',
          code: 'LLM_UNAVAILABLE',
        },
        extra: {
          sessionId: 'session-1',
          profileId: 'profile-1',
          subjectId: 'subject-1',
          topicId: 'topic-1',
          inputMode: 'voice',
        },
      });
    });

    it('writes session recovery marker after successful stream', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('test');
      });

      expect(mockWriteRecoveryMarker).toHaveBeenCalled();
    });

    it('converts explicit fallback completions into reconnect prompts', async () => {
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            _onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string,
          ) => {
            await onComplete({
              aiEventId: 'ai-event-fallback',
              exchangeCount: 1,
              escalationRung: 0,
              fallback: {
                reason: 'empty_reply',
                fallbackText: "I didn't have a reply — tap to try again.",
              },
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('What happened?');
      });

      const finalMessages = applyMessageUpdates(
        (opts.setMessages as jest.Mock).mock.calls,
        [],
      );

      expect(finalMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            kind: 'reconnect_prompt',
            content: "I didn't have a reply — tap to try again.",
            streaming: false,
          }),
        ]),
      );
      expect(opts.trackExchange).not.toHaveBeenCalled();
      expect(mockWriteRecoveryMarker).toHaveBeenCalledTimes(1);
    });

    it('converts zero-chunk completions into reconnect prompts', async () => {
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            _onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string,
          ) => {
            await onComplete({
              aiEventId: 'ai-event-empty',
              exchangeCount: 1,
              escalationRung: 0,
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Anyone there?');
      });

      const finalMessages = applyMessageUpdates(
        (opts.setMessages as jest.Mock).mock.calls,
        [],
      );

      expect(finalMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            kind: 'reconnect_prompt',
            content: "I didn't have a reply — tap to try again.",
          }),
        ]),
      );
      expect(opts.trackExchange).not.toHaveBeenCalled();
    });

    // [BUG-957 / LEARN-02] Corner case: streamMessage resolves *without* ever
    // invoking onChunk or onComplete. The XHR closed cleanly (HTTP 200) but
    // the server emitted no SSE events at all (e.g. proxy buffering, mid-flight
    // worker termination, or an empty SSE stream that ends before any frame is
    // flushed). Without the finally-block fixup in use-session-streaming.ts
    // (lines ~875-898), the streaming bubble would stay forever — the writing
    // animation never stops because setIsStreaming stays true and the message
    // bubble keeps `streaming: true`. This break test guards that fixup.
    it('[BUG-957] converts a silent stream completion (no chunks, no onComplete) into a reconnect prompt', async () => {
      const opts = makeOpts({
        // Resolve immediately with no events — simulates a 200 response that
        // closed before any SSE frame was emitted.
        streamMessage: jest.fn(async () => {
          /* no-op: no onChunk, no onComplete */
        }),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Hello?');
      });

      const finalMessages = applyMessageUpdates(
        (opts.setMessages as jest.Mock).mock.calls,
        [],
      );

      // The streaming bubble must be converted into a reconnect prompt with
      // a clear recovery affordance — no message may remain in `streaming: true`.
      expect(finalMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'assistant',
            kind: 'reconnect_prompt',
            content: 'Connection lost — Try again',
            streaming: false,
          }),
        ]),
      );
      // No ghost streaming bubble must be left over.
      const stillStreaming = finalMessages.filter(
        (m: { streaming?: boolean }) => m.streaming === true,
      );
      expect(stillStreaming).toHaveLength(0);
    });

    it('[WI-2102] keeps the mentor-writing indicator mounted for the sparse t=0/25/79s stream', async () => {
      jest.useFakeTimers();

      let currentMessages: Array<Record<string, unknown>> = [];
      let isStreaming = false;
      const streamingTransitions: boolean[] = [];
      let releaseCompletion!: () => void;
      const completionGate = new Promise<void>((resolve) => {
        releaseCompletion = resolve;
      });
      const opts = makeOpts({
        setMessages: jest.fn(
          (
            update:
              | Array<Record<string, unknown>>
              | ((
                  previous: Array<Record<string, unknown>>,
                ) => Array<Record<string, unknown>>),
          ) => {
            currentMessages =
              typeof update === 'function' ? update(currentMessages) : update;
          },
        ),
        setIsStreaming: jest.fn((next: boolean) => {
          if (next !== isStreaming) streamingTransitions.push(next);
          isStreaming = next;
        }),
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string,
          ) => {
            onChunk('t=0');
            await new Promise((resolve) => setTimeout(resolve, 25_000));
            onChunk('t=25');
            await new Promise((resolve) => setTimeout(resolve, 54_000));
            onChunk('t=79');
            await completionGate;
            await onComplete({
              aiEventId: 'ai-event-sparse',
              exchangeCount: 1,
              escalationRung: 0,
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let pending: Promise<void> | undefined;
      try {
        await act(async () => {
          pending = result.current.continueWithMessage('retry later');
          await Promise.resolve();
        });

        expect(isStreaming).toBe(true);
        expect(currentMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: 't=0',
              streaming: true,
            }),
          ]),
        );

        await act(async () => {
          await jest.advanceTimersByTimeAsync(25_000);
        });
        expect(isStreaming).toBe(true);
        expect(currentMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: 't=25',
              streaming: true,
            }),
          ]),
        );

        await act(async () => {
          await jest.advanceTimersByTimeAsync(45_000);
        });
        expect(isStreaming).toBe(true);
        expect(currentMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: 't=25',
              streaming: true,
            }),
          ]),
        );

        await act(async () => {
          await jest.advanceTimersByTimeAsync(9_000);
        });
        expect(isStreaming).toBe(true);
        expect(currentMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: 't=79',
              streaming: true,
            }),
          ]),
        );

        releaseCompletion();
        await act(async () => {
          await pending;
        });

        expect(isStreaming).toBe(false);
        expect(streamingTransitions).toEqual([true, false]);
        expect(currentMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: 't=79',
              streaming: false,
              eventId: 'ai-event-sparse',
            }),
          ]),
        );
        expect(currentMessages[0]).not.toHaveProperty('kind');
      } finally {
        releaseCompletion();
        await act(async () => {
          jest.runOnlyPendingTimers();
          await pending;
        });
        jest.clearAllTimers();
        jest.useRealTimers();
      }
    });

    it('[WI-2102] finalizes a completed reply exactly once', async () => {
      const onCompleteCalls = jest.fn();
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
          ) => {
            onChunk('Complete answer');
            onCompleteCalls();
            await onComplete({
              aiEventId: 'ai-event-complete',
              exchangeCount: 1,
              escalationRung: 0,
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('finish once');
      });

      const indicatorUnmounts = (opts.setIsStreaming as jest.Mock).mock.calls
        .map(([next]) => next)
        .filter((next) => next === false);
      expect(onCompleteCalls).toHaveBeenCalledTimes(1);
      expect(indicatorUnmounts).toHaveLength(1);
      expect(opts.trackExchange).toHaveBeenCalledTimes(1);
    });

    it('[WI-2102] clears the indicator and surfaces the existing error when aborted at t=40s', async () => {
      jest.useFakeTimers();
      const abortError = Object.assign(new Error('The operation was aborted'), {
        name: 'AbortError',
      });
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (_text: string, onChunk: (accumulated: string) => void) => {
            onChunk('Partial answer');
            await new Promise((resolve) => setTimeout(resolve, 40_000));
            throw abortError;
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      try {
        let pending!: Promise<void>;
        await act(async () => {
          pending = result.current.continueWithMessage('abort at forty');
          await Promise.resolve();
        });

        expect(opts.setIsStreaming).toHaveBeenCalledWith(true);
        expect(opts.setIsStreaming).not.toHaveBeenCalledWith(false);

        await act(async () => {
          await jest.advanceTimersByTimeAsync(40_000);
          await pending;
        });

        const finalMessages = applyMessageUpdates(
          (opts.setMessages as jest.Mock).mock.calls,
          [],
        );
        expect(opts.setIsStreaming).toHaveBeenCalledWith(false);
        expect(finalMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              content: RECONNECT_ERROR_TEXT,
              streaming: false,
              kind: 'reconnect_prompt',
            }),
          ]),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // -------------------------------------------------------------------------
  // handleReconnect
  // -------------------------------------------------------------------------

  describe('handleReconnect', () => {
    it('replays the last message on reconnect', async () => {
      const lastRetryPayloadRef = {
        current: { text: 'retry me', options: undefined },
      };
      const opts = makeOpts({
        lastRetryPayloadRef,
        messages: [
          { id: 'user-1', role: 'user', content: 'retry me' },
          { id: 'ai-err', role: 'assistant', content: 'Connection lost' },
        ],
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('ai-err');
      });

      // setMessages should have been called to remove the error message
      expect(opts.setMessages).toHaveBeenCalled();
      // streamMessage should have been called with the retry payload — the
      // durability layer attaches idempotencyKey + onReplay so the reconnect
      // is dedup'd against any concurrent in-flight attempt.
      expect(opts.streamMessage).toHaveBeenCalledWith(
        'retry me',
        expect.any(Function),
        expect.any(Function),
        expect.any(String),
        expect.objectContaining({
          idempotencyKey: expect.any(String),
          onReplay: expect.any(Function),
        }),
      );
    });

    it('does nothing when no retry payload exists', async () => {
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('some-id');
      });

      expect(opts.streamMessage).not.toHaveBeenCalled();
    });

    it('does nothing when streaming is in progress', async () => {
      const opts = makeOpts({
        isStreaming: true,
        lastRetryPayloadRef: { current: { text: 'test', options: undefined } },
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('some-id');
      });

      expect(opts.streamMessage).not.toHaveBeenCalled();
    });

    it('does nothing when session is expired', async () => {
      const opts = makeOpts({
        sessionExpired: true,
        lastRetryPayloadRef: { current: { text: 'test', options: undefined } },
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('some-id');
      });

      expect(opts.streamMessage).not.toHaveBeenCalled();
    });

    it('does not reconnect when quotaError is active (CR-5)', async () => {
      const opts = makeOpts({
        quotaError: { dailyLimit: 10 },
        lastRetryPayloadRef: { current: { text: 'test', options: undefined } },
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.handleReconnect('some-id');
      });

      expect(opts.streamMessage).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // fetchFastCelebrations
  // -------------------------------------------------------------------------

  describe('fetchFastCelebrations', () => {
    it('returns celebrations when found on first poll', async () => {
      const mockCelebrations = [{ type: 'streak', detail: { days: 5 } }];
      const opts = makeOpts();
      (opts.apiClient.celebrations.pending.$get as jest.Mock).mockResolvedValue(
        {
          ok: true,
          json: async () => ({ pendingCelebrations: mockCelebrations }),
        },
      );
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let celebrations: unknown[] = [];
      await act(async () => {
        celebrations = await result.current.fetchFastCelebrations();
      });

      expect(celebrations).toEqual(mockCelebrations);
      // Should mark celebrations as seen
      expect(opts.apiClient.celebrations.seen.$post).toHaveBeenCalled();
    });

    it('returns empty array on API error', async () => {
      const opts = makeOpts();
      (opts.apiClient.celebrations.pending.$get as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      let celebrations: unknown[] = [];
      await act(async () => {
        celebrations = await result.current.fetchFastCelebrations();
      });

      expect(celebrations).toEqual([]);
    });

    it('stops polling when unmounted before the pending response resolves', async () => {
      const opts = makeOpts();
      let resolvePending!: (value: {
        ok: boolean;
        json: () => Promise<{ pendingCelebrations: unknown[] }>;
      }) => void;
      const pendingResponse = new Promise<{
        ok: boolean;
        json: () => Promise<{ pendingCelebrations: unknown[] }>;
      }>((resolve) => {
        resolvePending = resolve;
      });
      (opts.apiClient.celebrations.pending.$get as jest.Mock).mockReturnValue(
        pendingResponse,
      );
      const { result, unmount } = renderHook(() =>
        useSessionStreaming(opts as any),
      );

      const celebrationsPromise = result.current.fetchFastCelebrations();
      unmount();
      resolvePending({
        ok: true,
        json: async () => ({
          pendingCelebrations: [{ type: 'streak', detail: { days: 5 } }],
        }),
      });

      await expect(celebrationsPromise).resolves.toEqual([]);
      expect(opts.apiClient.celebrations.pending.$get).toHaveBeenCalledTimes(1);
      expect(opts.apiClient.celebrations.seen.$post).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // syncHomeworkMetadata
  // -------------------------------------------------------------------------

  describe('syncHomeworkMetadata', () => {
    it('posts homework state when in homework mode', async () => {
      const opts = makeOpts({ effectiveMode: 'homework' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.syncHomeworkMetadata(
          'session-1',
          [{ id: 'p1', text: 'Solve x+1=2' }] as any,
          0,
        );
      });

      expect(
        opts.apiClient.sessions[':sessionId']['homework-state'].$post,
      ).toHaveBeenCalled();
    });

    it('skips sync when not in homework mode', async () => {
      const opts = makeOpts({ effectiveMode: 'learning' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.syncHomeworkMetadata(
          'session-1',
          [{ id: 'p1', text: 'test' }] as any,
          0,
        );
      });

      expect(
        opts.apiClient.sessions[':sessionId']['homework-state'].$post,
      ).not.toHaveBeenCalled();
    });

    it('skips sync when problems array is empty', async () => {
      const opts = makeOpts({ effectiveMode: 'homework' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.syncHomeworkMetadata('session-1', [], 0);
      });

      expect(
        opts.apiClient.sessions[':sessionId']['homework-state'].$post,
      ).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // F6: confidence indicator state management
  // -------------------------------------------------------------------------

  describe('confidence indicator (F6)', () => {
    it('sets lowConfidenceMessageId when done event has confidence=low', async () => {
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string,
          ) => {
            // Deliver at least one chunk — post-[EMPTY-REPLY-GUARD-3] a
            // zero-chunk stream routes to the reconnect-prompt branch and
            // short-circuits the confidence handler. The low-confidence
            // indicator only makes sense for a real reply.
            onChunk('Yes, that is right.');
            await onComplete({
              aiEventId: 'ai-event-2',
              exchangeCount: 1,
              escalationRung: 0,
              expectedResponseMinutes: 5,
              confidence: 'low',
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Is this right?');
      });

      // setLowConfidenceMessageId should have been called with the AI stream message id
      expect(opts.setLowConfidenceMessageId).toHaveBeenCalledWith(
        expect.stringMatching(/^ai-/),
      );
    });

    it('clears lowConfidenceMessageId when done event has confidence=high', async () => {
      const opts = makeOpts({
        streamMessage: jest.fn(
          async (
            _text: string,
            _onChunk: (accumulated: string) => void,
            onComplete: (result: Record<string, unknown>) => Promise<void>,
            _sessionId: string,
          ) => {
            await onComplete({
              aiEventId: 'ai-event-3',
              exchangeCount: 2,
              escalationRung: 0,
              expectedResponseMinutes: 5,
              confidence: 'high',
            });
          },
        ),
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Good answer');
      });

      // Should clear the low-confidence indicator (null) since confidence is not 'low'
      expect(opts.setLowConfidenceMessageId).toHaveBeenCalledWith(null);
    });

    it('clears lowConfidenceMessageId when confidence is absent (treat as medium)', async () => {
      // Default streamMessage mock returns no confidence field
      const opts = makeOpts();
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      await act(async () => {
        await result.current.continueWithMessage('Next question');
      });

      // No confidence field → treated as medium → clears any prior low-confidence state
      expect(opts.setLowConfidenceMessageId).toHaveBeenCalledWith(null);
    });
  });

  // -------------------------------------------------------------------------
  // WI-373: silence prompt sends an intent token, not free content
  // -------------------------------------------------------------------------
  describe('WI-373 silence intent', () => {
    it('records a silence_nudge intent token when the silence timer fires', async () => {
      jest.useFakeTimers();
      try {
        const opts = makeOpts({ activeSessionId: 'session-1', draftText: '' });
        const { result } = renderHook(() => useSessionStreaming(opts as any));

        act(() => {
          result.current.scheduleSilencePrompt('session-1', 2);
        });

        // Advance past the maximum (20-minute) threshold so the timer fires
        // regardless of the pace multiplier, then flush the async callback.
        await act(async () => {
          jest.advanceTimersByTime(20 * 60 * 1000 + 1000);
          await Promise.resolve();
        });

        expect(opts.recordSystemPrompt.mutateAsync).toHaveBeenCalledWith({
          kind: 'silence_nudge',
        });
        const arg = opts.recordSystemPrompt.mutateAsync.mock.calls[0]?.[0];
        expect(arg).not.toHaveProperty('content');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // -------------------------------------------------------------------------
  // WI-306: silence prompt draft freshness — stale-closure regression
  // -------------------------------------------------------------------------
  describe('WI-306 silence prompt draft freshness', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function fireSilenceTimer() {
      await act(async () => {
        jest.advanceTimersByTime(20 * 60 * 1000 + 1000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    function messagesAfterSilence(
      opts: ReturnType<typeof makeOpts>,
      initialMessages: Array<Record<string, unknown>> = [],
    ) {
      return applyMessageUpdates(
        (opts.setMessages as jest.Mock).mock.calls,
        initialMessages,
      );
    }

    it('adds and persists one silence prompt when draft is empty at schedule and fire time', async () => {
      const opts = makeOpts({ activeSessionId: 'session-1', draftText: '' });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      act(() => {
        result.current.scheduleSilencePrompt('session-1', 2);
      });
      await fireSilenceTimer();

      expect(messagesAfterSilence(opts)).toEqual([
        expect.objectContaining({
          id: 'silence-prompt',
          role: 'assistant',
          isSystemPrompt: true,
        }),
      ]);
      expect(opts.recordSystemPrompt.mutateAsync).toHaveBeenCalledWith({
        kind: 'silence_nudge',
      });
      const arg = opts.recordSystemPrompt.mutateAsync.mock.calls[0]?.[0];
      expect(arg).not.toHaveProperty('content');
    });

    it('does not add or persist a silence prompt when the learner types before the timer fires', async () => {
      let opts = makeOpts({ activeSessionId: 'session-1', draftText: '' });
      const { result, rerender } = renderHook(() =>
        useSessionStreaming(opts as any),
      );

      act(() => {
        result.current.scheduleSilencePrompt('session-1', 2);
      });

      act(() => {
        opts = { ...opts, draftText: 'I am working on it' } as ReturnType<
          typeof makeOpts
        >;
        rerender(opts);
      });
      // Flush the useEffect that syncs draftText into the ref (React 19 + fake timers)
      act(() => {
        jest.advanceTimersByTime(0);
      });
      await fireSilenceTimer();

      expect(opts.setMessages).not.toHaveBeenCalled();
      expect(messagesAfterSilence(opts)).toEqual([]);
      expect(opts.recordSystemPrompt.mutateAsync).not.toHaveBeenCalled();
    });

    it('adds a silence prompt when draft was non-empty at schedule time but empty at fire time', async () => {
      let opts = makeOpts({
        activeSessionId: 'session-1',
        draftText: 'starting an answer',
      });
      const { result, rerender } = renderHook(() =>
        useSessionStreaming(opts as any),
      );

      act(() => {
        result.current.scheduleSilencePrompt('session-1', 2);
      });

      act(() => {
        opts = { ...opts, draftText: '' } as ReturnType<typeof makeOpts>;
        rerender(opts);
      });
      // Flush the useEffect that syncs draftText into the ref (React 19 + fake timers)
      act(() => {
        jest.advanceTimersByTime(0);
      });
      await fireSilenceTimer();

      expect(messagesAfterSilence(opts)).toEqual([
        expect.objectContaining({ id: 'silence-prompt' }),
      ]);
      expect(opts.recordSystemPrompt.mutateAsync).toHaveBeenCalledWith({
        kind: 'silence_nudge',
      });
    });

    it('treats whitespace-only draft text at fire time as empty', async () => {
      let opts = makeOpts({ activeSessionId: 'session-1', draftText: '' });
      const { result, rerender } = renderHook(() =>
        useSessionStreaming(opts as any),
      );

      act(() => {
        result.current.scheduleSilencePrompt('session-1', 2);
      });

      act(() => {
        opts = { ...opts, draftText: '   \n\t  ' } as ReturnType<
          typeof makeOpts
        >;
        rerender(opts);
      });
      // Flush the useEffect that syncs draftText into the ref (React 19 + fake timers)
      act(() => {
        jest.advanceTimersByTime(0);
      });
      await fireSilenceTimer();

      expect(messagesAfterSilence(opts)).toEqual([
        expect.objectContaining({ id: 'silence-prompt' }),
      ]);
      expect(opts.recordSystemPrompt.mutateAsync).toHaveBeenCalledWith({
        kind: 'silence_nudge',
      });
    });

    it('does not append a duplicate silence prompt when one already exists', async () => {
      const existingPrompt = {
        id: 'silence-prompt',
        role: 'assistant',
        content: 'Still working on it?',
        isSystemPrompt: true,
      };
      const opts = makeOpts({
        activeSessionId: 'session-1',
        draftText: '',
        messages: [existingPrompt],
      });
      const { result } = renderHook(() => useSessionStreaming(opts as any));

      act(() => {
        result.current.scheduleSilencePrompt('session-1', 2);
      });
      await fireSilenceTimer();

      const message = messagesAfterSilence(opts, [existingPrompt]);
      expect(message.filter((m) => m.id === 'silence-prompt')).toHaveLength(1);
    });
  });
});
