import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  ERROR_CODES,
  ConflictError,
  NotFoundError,
  challengeRoundSessionStateSchema,
} from '@eduagent/schemas';

import { challengeRoundRoutes } from './challenge-round';
import {
  acceptChallengeRound,
  abortChallengeRound,
  declineChallengeRound,
} from '../services/challenge-round/route-actions';
import { TEST_PROFILE_ID, TEST_SESSION_ID } from '@eduagent/test-utils';

jest.mock(
  '../services/challenge-round/route-actions' /* gc1-allow: route unit test - route delegates to service; service has direct unit coverage */,
  () => ({
    acceptChallengeRound: jest.fn(),
    declineChallengeRound: jest.fn(),
    abortChallengeRound: jest.fn(),
  }),
);

const PROFILE_ID = TEST_PROFILE_ID;
const SESSION_ID = TEST_SESSION_ID;
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
    // Mirror the production catch-all (apps/api/src/index.ts onError): an
    // unclassified fault — including a ZodError thrown by an outbound
    // response-schema `.parse()` — surfaces as a 500 server fault rather than
    // shipping a malformed body to the client.
    if (err instanceof z.ZodError) {
      return c.json(
        { code: ERROR_CODES.INTERNAL_ERROR, message: err.message },
        500,
      );
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

// WI-977 — challenge-round.ts returns responses with no schema validation.
// These routes now parse the service result through
// challengeRoundSessionStateSchema before c.json(), so a valid response is
// guaranteed schema-conformant and a drifted/malformed service shape is caught
// as a 500 server fault rather than shipped to the client.
describe('challenge-round routes — outbound schema validation (WI-977)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['/v1/challenge-round/accept', acceptChallengeRound, 'accepted'],
    ['/v1/challenge-round/decline', declineChallengeRound, 'declined'],
    ['/v1/challenge-round/abort', abortChallengeRound, 'aborted'],
  ] as const)(
    'returns a schema-valid challengeRound for %s',
    async (path, service, state) => {
      (service as jest.Mock).mockResolvedValue({ ...offeredState, state });

      const res = await postJson(path, {
        sessionId: SESSION_ID,
        topicId: TOPIC_ID,
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { challengeRound: unknown };
      // The response body's challengeRound must itself satisfy the contract.
      expect(
        challengeRoundSessionStateSchema.safeParse(body.challengeRound).success,
      ).toBe(true);
    },
  );

  it.each([
    ['/v1/challenge-round/accept', acceptChallengeRound],
    ['/v1/challenge-round/decline', declineChallengeRound],
    ['/v1/challenge-round/abort', abortChallengeRound],
  ] as const)(
    'rejects a malformed service shape with a 500 for %s',
    async (path, service) => {
      // `state: 'frobnicated'` is not in challengeRoundStateEnum — a drifted
      // service contract that must never reach the wire.
      (service as jest.Mock).mockResolvedValue({
        ...offeredState,
        state: 'frobnicated',
      });

      const res = await postJson(path, {
        sessionId: SESSION_ID,
        topicId: TOPIC_ID,
      });

      expect(res.status).toBe(500);
    },
  );

  it('tolerates abort returning undefined (no round ever existed)', async () => {
    // abortChallengeRound returns `undefined` when the session never had a
    // round; the optional parse must pass it through, not throw.
    (abortChallengeRound as jest.Mock).mockResolvedValue(undefined);

    const res = await postJson('/v1/challenge-round/abort', {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ challengeRound: undefined });
  });
});
