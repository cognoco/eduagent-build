import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ERROR_CODES, ConflictError, NotFoundError } from '@eduagent/schemas';

import { challengeRoundRoutes } from './challenge-round';
import {
  acceptChallengeRound,
  abortChallengeRound,
  declineChallengeRound,
} from '../services/challenge-round/route-actions';

jest.mock(
  '../services/challenge-round/route-actions' /* gc1-allow: route unit test - route delegates to service; service has direct unit coverage */,
  () => ({
    acceptChallengeRound: jest.fn(),
    declineChallengeRound: jest.fn(),
    abortChallengeRound: jest.fn(),
  }),
);

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000101';
const TOPIC_ID = '00000000-0000-4000-8000-000000000201';

const offeredState = {
  state: 'offered' as const,
  topicId: TOPIC_ID,
  offerCount: 1,
  declinedDontAskAgain: false,
  evaluations: [],
};

function makeApp(options: { isOwner?: boolean } = {}) {
  const testApp = new Hono();
  testApp.use('*', async (c, next) => {
    c.set('db' as never, { marker: 'db' });
    c.set('profileId' as never, PROFILE_ID);
    c.set('profileMeta' as never, {
      birthYear: 2010,
      location: 'EU',
      consentStatus: 'CONSENTED',
      hasPremiumLlm: false,
      isOwner: options.isOwner ?? true,
      resolvedVia: (options.isOwner ?? true) ? 'explicit-header' : 'auto',
    });
    await next();
  });
  testApp.route('/v1', challengeRoundRoutes);
  testApp.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof NotFoundError) {
      return c.json({ code: ERROR_CODES.NOT_FOUND, message: err.message }, 404);
    }
    if (err instanceof ConflictError) {
      return c.json({ code: ERROR_CODES.CONFLICT, message: err.message }, 409);
    }
    throw err;
  });
  return testApp;
}

function postJson(path: string, body: unknown) {
  return makeApp().request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('challenge-round routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (acceptChallengeRound as jest.Mock).mockResolvedValue({
      ...offeredState,
      state: 'accepted',
    });
    (declineChallengeRound as jest.Mock).mockResolvedValue({
      ...offeredState,
      state: 'declined',
      declinedDontAskAgain: true,
    });
    (abortChallengeRound as jest.Mock).mockResolvedValue({
      ...offeredState,
      state: 'aborted',
    });
  });

  it.each([
    ['/v1/challenge-round/accept', acceptChallengeRound],
    ['/v1/challenge-round/abort', abortChallengeRound],
  ])('validates and delegates %s', async (path, service) => {
    const res = await postJson(path, {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      challengeRound: expect.objectContaining({ topicId: TOPIC_ID }),
    });
    expect(service).toHaveBeenCalledWith(expect.anything(), PROFILE_ID, {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
    });
  });

  it('passes dontAskAgain through to decline service', async () => {
    const res = await postJson('/v1/challenge-round/decline', {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      dontAskAgain: true,
    });

    expect(res.status).toBe(200);
    expect(declineChallengeRound).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      { sessionId: SESSION_ID, topicId: TOPIC_ID, dontAskAgain: true },
    );
  });

  it('defaults dontAskAgain to false on decline', async () => {
    const res = await postJson('/v1/challenge-round/decline', {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
    });

    expect(res.status).toBe(200);
    expect(declineChallengeRound).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      { sessionId: SESSION_ID, topicId: TOPIC_ID, dontAskAgain: false },
    );
  });

  it('returns 400 for invalid body and does not call service', async () => {
    const res = await postJson('/v1/challenge-round/accept', {
      sessionId: 'not-a-uuid',
      topicId: TOPIC_ID,
    });

    expect(res.status).toBe(400);
    expect(acceptChallengeRound).not.toHaveBeenCalled();
  });

  it('returns 403 in proxy mode before calling service', async () => {
    const res = await makeApp({ isOwner: false }).request(
      '/v1/challenge-round/accept',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: SESSION_ID, topicId: TOPIC_ID }),
      },
    );

    expect(res.status).toBe(403);
    expect(acceptChallengeRound).not.toHaveBeenCalled();
  });

  it('maps service conflicts to 409 style responses', async () => {
    (acceptChallengeRound as jest.Mock).mockRejectedValueOnce(
      new ConflictError('accept requires state=offered'),
    );

    const res = await postJson('/v1/challenge-round/accept', {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.CONFLICT,
      message: 'accept requires state=offered',
    });
  });

  it('maps missing owned session to 404 style responses', async () => {
    (acceptChallengeRound as jest.Mock).mockRejectedValueOnce(
      new NotFoundError('Session'),
    );

    const res = await postJson('/v1/challenge-round/accept', {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Session not found',
    });
  });
});
