import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import * as sessionService from '../services/session';
import * as streamResponseService from '../services/session/session-stream-response';
import { sessionRoutes } from './sessions';

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
type TestEnv = typeof sessionRoutes extends Hono<infer E> ? E : never;

function createBoundaryApp() {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', {} as Database);
    c.set('profileId', PROFILE_ID);
    c.set('profileMeta', {
      birthYear: 2014,
      location: 'EU',
      consentStatus: 'CONSENTED',
      hasPremiumLlm: true,
      isOwner: true,
      resolvedVia: 'explicit-header',
    });
    c.set('subscriptionId', 'subscription-1');
    c.set('subscriptionTier', 'plus');
    c.set('llmTier', 'standard');
    c.set('quotaDecrementSource', undefined);
    c.set('quotaDecrementQuotaModel', undefined);
    c.set('quotaDecrementTopUpCreditId', undefined);
    c.set('quotaRemainingTurns', 10);
    c.set('quotaFractionRemaining', 0.5);
    await next();
  });
  app.route('/', sessionRoutes);
  return app;
}

function requestEnv(enabled: 'true' | 'false') {
  return {
    DATABASE_URL: 'postgresql://test.invalid/test',
    ANSWER_EVALUATION_RUNTIME_ENABLED: enabled,
  };
}

describe('session answer-evaluation route boundary [WI-1443]', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['false', 'true'] as const)(
    'POST /messages resolves binding=%s into processMessage options',
    async (binding) => {
      const processSpy = jest.spyOn(sessionService, 'processMessage');
      processSpy.mockResolvedValue({
        response: 'Mentor reply',
        escalationRung: 1,
        isUnderstandingCheck: false,
        exchangeCount: 1,
        expectedResponseMinutes: 1,
        readyToFinish: false,
      });
      const app = createBoundaryApp();

      const response = await app.request(
        `/sessions/${SESSION_ID}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '42' }),
        },
        requestEnv(binding),
      );

      expect(response.status).toBe(200);
      expect(processSpy).toHaveBeenCalledWith(
        expect.anything(),
        PROFILE_ID,
        SESSION_ID,
        expect.objectContaining({ message: '42' }),
        expect.objectContaining({
          answerEvaluationEnabled: binding === 'true',
        }),
      );
    },
  );

  it.each(['false', 'true'] as const)(
    'POST /stream resolves binding=%s into stream options',
    async (binding) => {
      jest.spyOn(sessionService, 'getSession').mockResolvedValue({
        id: SESSION_ID,
        subjectId: '00000000-0000-4000-8000-000000000003',
        topicId: null,
        topicTitle: null,
        subjectName: null,
        bookId: null,
        bookTitle: null,
        sessionType: 'learning',
        inputMode: 'text',
        verificationType: null,
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: null,
        wallClockSeconds: null,
        rawInput: null,
        filedAt: null,
        filingStatus: null,
        filingRetryCount: 0,
        metadata: {},
      });
      const streamSpy = jest
        .spyOn(streamResponseService, 'streamSessionResponse')
        .mockResolvedValue(new Response('ok'));
      const app = createBoundaryApp();

      const response = await app.request(
        `/sessions/${SESSION_ID}/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '42' }),
        },
        requestEnv(binding),
      );

      expect(response.status).toBe(200);
      expect(streamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          streamOptions: expect.objectContaining({
            answerEvaluationEnabled: binding === 'true',
          }),
        }),
      );
    },
  );
});
