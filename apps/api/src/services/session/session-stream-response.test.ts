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

function baseParams(overrides = {}) {
  return {
    db: {} as Database,
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
});
