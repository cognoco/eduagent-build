import type { Database } from '@eduagent/database';
import {
  buildDoneFramePayload,
  streamSessionResponse,
} from './session-stream-response';

type StreamSessionResponseParams = Parameters<typeof streamSessionResponse>[0];

const PROFILE_ID = 'profile-1';
const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const AI_EVENT_ID = '00000000-0000-4000-8000-000000000002';

function makeCreateSseResponse() {
  const frames: string[] = [];
  return {
    frames,
    createSseResponse: async (
      handler: (stream: {
        writeSSE: (event: { data: string }) => Promise<void>;
      }) => Promise<void>,
    ) => {
      await handler({
        writeSSE: async ({ data }) => {
          frames.push(data);
        },
      });
      return new Response('ok');
    },
  };
}

// [WI-2627] The observation the route resolves and hands to every terminal
// frame. `r6` is arbitrary but non-zero, so a test that passed only because the
// default happens to be 0 cannot pass silently.
const NOTICE_POLICY_OBSERVATION = {
  rolloutRevision: 6,
  rolloutEnabled: true,
  projectionEpoch: 'notice-policy-v1:r6:on:self:consented',
};

function baseParams(overrides = {}) {
  return {
    db: {} as Database,
    noticePolicyObservation: NOTICE_POLICY_OBSERVATION,
    profileId: PROFILE_ID,
    sessionId: SESSION_ID,
    input: { message: 'Explain gravity' },
    session: { exchangeCount: 2 },
    subscriptionId: 'sub-1',
    quota: {
      source: 'monthly' as const,
      quotaModel: 'shared-pool' as const,
      topUpCreditId: undefined,
    },
    streamOptions: {
      llmTier: 'standard' as const,
      subscriptionTier: 'plus' as const,
      quotaRemainingTurns: 3,
      quotaFractionRemaining: 0.5,
      voyageApiKey: undefined,
      clientId: undefined as string | undefined,
      memoryFactsReadEnabled: false,
      memoryFactsRelevanceEnabled: false,
      challengeRoundRuntimeEnabled: false,
      answerEvaluationEnabled: true,
      reviewCallbackOpenerEnabled: false,
      judgeFrameworkEnabled: false,
      judgeEnforcementEnabled: false,
      challengeRoundGraderEnabled: false,
    },
    deps: {
      streamMessage: jest.fn(),
      processMessage: jest.fn(),
      refundQuotaOrEscalate: jest.fn().mockResolvedValue({ refunded: true }),
      markPersisted: jest.fn().mockResolvedValue(undefined),
      sendEmptyReplyFallbackEvent: jest.fn().mockResolvedValue(undefined),
      logger: {
        error: jest.fn(),
        warn: jest.fn(),
      },
      captureException: jest.fn(),
      addBreadcrumb: jest.fn(),
    },
    ...overrides,
  };
}

describe('streamSessionResponse', () => {
  it('preserves answerEvaluation in the canonical done-frame builder', () => {
    const frame = buildDoneFramePayload({
      exchangeCount: 3,
      escalationRung: 2,
      answerEvaluation: {
        correctness: 'partial',
        concept: 'fractions',
      },
    });

    expect(frame).toEqual(
      expect.objectContaining({
        answerEvaluation: {
          correctness: 'partial',
          concept: 'fractions',
        },
      }),
    );
  });

  it('emits answerEvaluation on the normal streaming done frame', async () => {
    const { frames, createSseResponse } = makeCreateSseResponse();
    const params = baseParams({ createSseResponse });
    params.deps.streamMessage.mockResolvedValueOnce({
      stream: (async function* () {
        yield 'Streamed response';
      })(),
      onComplete: jest.fn().mockResolvedValue({
        response: 'Streamed response',
        exchangeCount: 3,
        escalationRung: 2,
        answerEvaluation: { correctness: 'correct', concept: 'gravity' },
      }),
    });

    await streamSessionResponse(
      params as unknown as StreamSessionResponseParams,
    );

    const done = frames
      .map((frame) => JSON.parse(frame))
      .find((frame) => frame.type === 'done');
    expect(done.answerEvaluation).toEqual({
      correctness: 'correct',
      concept: 'gravity',
    });
  });

  it('replaces partial stream output with non-streaming fallback without refunding quota', async () => {
    const { frames, createSseResponse } = makeCreateSseResponse();
    const params = baseParams({ createSseResponse });
    params.deps.streamMessage.mockResolvedValueOnce({
      stream: (async function* () {
        yield 'partial ';
        throw new Error('stream failed');
      })(),
      onComplete: jest.fn(),
    });
    params.deps.processMessage.mockResolvedValueOnce({
      response: 'Recovered response',
      exchangeCount: 3,
      escalationRung: 2,
      expectedResponseMinutes: 1,
      aiEventId: AI_EVENT_ID,
      answerEvaluation: { correctness: 'partial', concept: 'gravity' },
    });

    await streamSessionResponse(
      params as unknown as StreamSessionResponseParams,
    );

    expect(frames.join('\n')).toContain('"type":"chunk"');
    expect(frames.join('\n')).toContain('"type":"replace"');
    expect(frames.join('\n')).toContain('Recovered response');
    expect(frames.join('\n')).toContain('"type":"done"');
    const done = frames
      .map((frame) => JSON.parse(frame))
      .find((frame) => frame.type === 'done');
    expect(done.answerEvaluation).toEqual({
      correctness: 'partial',
      concept: 'gravity',
    });
    expect(params.deps.refundQuotaOrEscalate).not.toHaveBeenCalled();
    expect(params.deps.processMessage).toHaveBeenCalledWith(
      params.db,
      PROFILE_ID,
      SESSION_ID,
      params.input,
      expect.objectContaining({ answerEvaluationEnabled: true }),
    );
  });

  it('preserves answer-evaluation enablement in the pre-stream non-streaming fallback', async () => {
    const { frames, createSseResponse } = makeCreateSseResponse();
    const params = baseParams({ createSseResponse });
    params.deps.streamMessage.mockRejectedValueOnce(
      new Error('stream setup failed'),
    );
    params.deps.processMessage.mockResolvedValueOnce({
      response: 'Recovered before streaming',
      exchangeCount: 3,
      escalationRung: 2,
      expectedResponseMinutes: 1,
      aiEventId: AI_EVENT_ID,
      answerEvaluation: { correctness: 'incorrect', concept: 'gravity' },
    });

    await streamSessionResponse(
      params as unknown as StreamSessionResponseParams,
    );

    expect(frames.join('\n')).toContain('Recovered before streaming');
    const done = frames
      .map((frame) => JSON.parse(frame))
      .find((frame) => frame.type === 'done');
    expect(done.answerEvaluation).toEqual({
      correctness: 'incorrect',
      concept: 'gravity',
    });
    expect(params.deps.processMessage).toHaveBeenCalledWith(
      params.db,
      PROFILE_ID,
      SESSION_ID,
      params.input,
      expect.objectContaining({ answerEvaluationEnabled: true }),
    );
  });

  it('preserves the recitation idempotency key across stream fallback and persistence marking', async () => {
    const { createSseResponse } = makeCreateSseResponse();
    const clientId = 'recitation-turn-1';
    const params = baseParams({ createSseResponse });
    params.streamOptions.clientId = clientId;
    params.deps.streamMessage.mockResolvedValueOnce({
      stream: (async function* () {
        yield 'partial';
        throw new Error('stream failed');
      })(),
      onComplete: jest.fn(),
    });
    params.deps.processMessage.mockResolvedValueOnce({
      response: 'Recovered response',
      exchangeCount: 3,
      escalationRung: 2,
      expectedResponseMinutes: 1,
      aiEventId: AI_EVENT_ID,
    });

    await streamSessionResponse(
      params as unknown as StreamSessionResponseParams,
    );

    expect(params.deps.streamMessage).toHaveBeenCalledWith(
      params.db,
      PROFILE_ID,
      SESSION_ID,
      params.input,
      expect.objectContaining({ clientId }),
    );
    expect(params.deps.processMessage).toHaveBeenCalledWith(
      params.db,
      PROFILE_ID,
      SESSION_ID,
      params.input,
      expect.objectContaining({ clientId }),
    );
    expect(params.deps.markPersisted).toHaveBeenCalledWith(
      expect.objectContaining({ key: clientId }),
    );
  });

  it('emits fallback frames, refunds quota, and dispatches observability when onComplete reports fallback', async () => {
    const { frames, createSseResponse } = makeCreateSseResponse();
    const params = baseParams({ createSseResponse });
    params.deps.streamMessage.mockResolvedValueOnce({
      stream: (async function* () {
        yield* [];
      })(),
      onComplete: jest.fn().mockResolvedValue({
        exchangeCount: 2,
        escalationRung: 1,
        fallback: {
          reason: 'empty_reply',
          fallbackText: "I didn't have a reply — tap to try again.",
        },
      }),
    });

    await streamSessionResponse(
      params as unknown as StreamSessionResponseParams,
    );

    expect(frames.join('\n')).toContain('"type":"fallback"');
    expect(frames.join('\n')).toContain('"reason":"empty_reply"');
    expect(params.deps.refundQuotaOrEscalate).toHaveBeenCalledWith(
      params.db,
      'sub-1',
      expect.objectContaining({ route: 'sessions.stream.fallback' }),
    );
    expect(params.deps.sendEmptyReplyFallbackEvent).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      profileId: PROFILE_ID,
      exchangeCount: 2,
      reason: 'empty_reply',
    });
  });

  // -------------------------------------------------------------------------
  // [WI-2627] EVERY terminal `done` frame carries the policy observation.
  //
  // The observation describes the POLICY, not the outcome of the turn. There are
  // four distinct paths that emit a terminal frame — the normal one, two
  // non-streaming fallbacks, and the hand-built empty-reply frame that does not
  // go through `buildDoneFramePayload` at all — and a client cannot tell "this
  // path forgot to include it" from "this worker is too old to send it". So a
  // dropped observation on any one path silently means "no policy change
  // observed" and leaves a rollback unpropagated on exactly the turns that
  // already went wrong.
  //
  // This table asserts the property over all four paths rather than the happy
  // one, so a future path added without the observation fails here.
  // -------------------------------------------------------------------------
  describe('[WI-2627] policy observation on every terminal done frame', () => {
    function doneFrameFrom(frames: string[]) {
      return frames
        .map((frame) => JSON.parse(frame))
        .find((frame) => frame.type === 'done');
    }

    it('normal streaming completion', async () => {
      const { frames, createSseResponse } = makeCreateSseResponse();
      const params = baseParams({ createSseResponse });
      params.deps.streamMessage.mockResolvedValueOnce({
        stream: (async function* () {
          yield 'Streamed response';
        })(),
        onComplete: jest.fn().mockResolvedValue({
          response: 'Streamed response',
          exchangeCount: 3,
          escalationRung: 2,
        }),
      });

      await streamSessionResponse(
        params as unknown as StreamSessionResponseParams,
      );

      expect(doneFrameFrom(frames).mentorNoticePolicy).toEqual(
        NOTICE_POLICY_OBSERVATION,
      );
    });

    it('mid-stream failure recovered by the non-streaming fallback', async () => {
      const { frames, createSseResponse } = makeCreateSseResponse();
      const params = baseParams({ createSseResponse });
      params.deps.streamMessage.mockResolvedValueOnce({
        stream: (async function* () {
          yield 'partial ';
          throw new Error('stream failed');
        })(),
        onComplete: jest.fn(),
      });
      params.deps.processMessage.mockResolvedValueOnce({
        response: 'Recovered response',
        exchangeCount: 3,
        escalationRung: 2,
        expectedResponseMinutes: 1,
        aiEventId: AI_EVENT_ID,
      });

      await streamSessionResponse(
        params as unknown as StreamSessionResponseParams,
      );

      expect(doneFrameFrom(frames).mentorNoticePolicy).toEqual(
        NOTICE_POLICY_OBSERVATION,
      );
    });

    it('pre-stream setup failure recovered by the non-streaming fallback', async () => {
      const { frames, createSseResponse } = makeCreateSseResponse();
      const params = baseParams({ createSseResponse });
      params.deps.streamMessage.mockRejectedValueOnce(
        new Error('stream setup failed'),
      );
      params.deps.processMessage.mockResolvedValueOnce({
        response: 'Recovered before streaming',
        exchangeCount: 3,
        escalationRung: 2,
        expectedResponseMinutes: 1,
        aiEventId: AI_EVENT_ID,
      });

      await streamSessionResponse(
        params as unknown as StreamSessionResponseParams,
      );

      expect(doneFrameFrom(frames).mentorNoticePolicy).toEqual(
        NOTICE_POLICY_OBSERVATION,
      );
    });

    // The one hand-built terminal frame — it bypasses buildDoneFramePayload, so
    // it is the path most likely to be missed.
    it('empty-reply fallback frame, which is built by hand rather than through buildDoneFramePayload', async () => {
      const { frames, createSseResponse } = makeCreateSseResponse();
      const params = baseParams({ createSseResponse });
      params.deps.streamMessage.mockResolvedValueOnce({
        stream: (async function* () {
          yield* [];
        })(),
        onComplete: jest.fn().mockResolvedValue({
          exchangeCount: 2,
          escalationRung: 1,
          fallback: {
            reason: 'empty_reply',
            fallbackText: "I didn't have a reply — tap to try again.",
          },
        }),
      });

      await streamSessionResponse(
        params as unknown as StreamSessionResponseParams,
      );

      expect(doneFrameFrom(frames).mentorNoticePolicy).toEqual(
        NOTICE_POLICY_OBSERVATION,
      );
    });

    // A worker that has no observation to give must send NOTHING rather than a
    // synthesised one — absence is the client's only signal for "this response
    // carries no observation", and a fabricated default would be indistinguishable
    // from a real reading of the live policy.
    it('omits the field entirely when the route supplied no observation', async () => {
      const { frames, createSseResponse } = makeCreateSseResponse();
      const params = baseParams({
        createSseResponse,
        noticePolicyObservation: undefined,
      });
      params.deps.streamMessage.mockResolvedValueOnce({
        stream: (async function* () {
          yield 'Streamed response';
        })(),
        onComplete: jest.fn().mockResolvedValue({
          response: 'Streamed response',
          exchangeCount: 3,
          escalationRung: 2,
        }),
      });

      await streamSessionResponse(
        params as unknown as StreamSessionResponseParams,
      );

      expect(doneFrameFrom(frames)).not.toHaveProperty('mentorNoticePolicy');
    });
  });
});
