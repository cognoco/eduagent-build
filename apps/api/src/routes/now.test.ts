import { Hono } from 'hono';
import type { Database } from '@eduagent/database';

import { nowRoutes } from './now';
import { buildNowFeed, buildNowOverflow } from '../services/now-feed';
import { TEST_PROFILE_ID } from '@eduagent/test-utils';

jest.mock('../services/now-feed', () => ({
  ...jest.requireActual('../services/now-feed'),
  buildNowFeed: jest.fn(),
  buildNowOverflow: jest.fn(),
}));

// [WI-2498] resolveMentorNoticeVisibility's CONSENT conjunct reads the
// consent tables via raw db queries the stub `db` below cannot satisfy. The
// conjunct is covered against a real database in
// tests/integration/mentor-notice-proxy-visibility.integration.test.ts.
// gc1-allow: isLlmExchangeConsentAllowed runs raw db queries with no real
// implementation available in this file's stub-db environment.
jest.mock('../services/identity-v2/consent-status-v2', () => ({
  ...jest.requireActual('../services/identity-v2/consent-status-v2'),
  isLlmExchangeConsentAllowed: jest.fn().mockResolvedValue(true),
}));

const PROFILE_ID = TEST_PROFILE_ID;
const CHILD_ID = '00000000-0000-4000-8000-000000000101';

// [WI-2498] `callerPersonId` is the server-resolved caller identity the
// mentor-notice visibility predicate compares against the selected profile.
// Defaults to the selected profile (a learner reading their own feed); pass a
// different id to simulate a guardian/supporter who selected someone else's
// profile.
function makeApp(mentorNoticeEnabled = false, callerPersonId = PROFILE_ID) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = {
      MENTOR_NOTICE_ENABLED: mentorNoticeEnabled ? 'true' : 'false',
    } as never;
    c.set('db' as never, { marker: 'db' } as unknown as Database);
    c.set('profileId' as never, PROFILE_ID);
    c.set('callerPersonId' as never, callerPersonId);
    await next();
  });
  app.route('/v1', nowRoutes);
  return app;
}

describe('now routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(buildNowFeed).mockResolvedValue({
      scope: 'self',
      cards: [],
      overflowCount: 0,
      generatedAt: '2026-06-20T00:00:00.000Z',
    });
    jest.mocked(buildNowOverflow).mockResolvedValue({
      scope: 'self',
      items: [],
    });
  });

  it('returns 400 when person scope omits personId', async () => {
    const res = await makeApp().request('/v1/now?scope=person');

    expect(res.status).toBe(400);
    expect(buildNowFeed).not.toHaveBeenCalled();
  });

  it('passes personId through to buildNowFeed for person scope', async () => {
    jest.mocked(buildNowFeed).mockResolvedValue({
      scope: 'person',
      cards: [],
      overflowCount: 0,
      generatedAt: '2026-06-20T00:00:00.000Z',
    });

    const res = await makeApp().request(
      `/v1/now?scope=person&personId=${CHILD_ID}`,
    );

    expect(res.status).toBe(200);
    expect(buildNowFeed).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      {
        scope: 'person',
        personId: CHILD_ID,
      },
      { mentorNoticeEnabled: false },
    );
  });

  it('passes supporter-hub scope through without personId', async () => {
    jest.mocked(buildNowFeed).mockResolvedValue({
      scope: 'supporter-hub',
      cards: [],
      overflowCount: 0,
      generatedAt: '2026-06-20T00:00:00.000Z',
    });

    const res = await makeApp().request('/v1/now?scope=supporter-hub');

    expect(res.status).toBe(200);
    expect(buildNowFeed).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      {
        scope: 'supporter-hub',
      },
      { mentorNoticeEnabled: false },
    );
  });

  it('returns 400 from overflow when person scope omits personId', async () => {
    const res = await makeApp().request('/v1/now/overflow?scope=person');

    expect(res.status).toBe(400);
    expect(buildNowOverflow).not.toHaveBeenCalled();
  });

  it('passes personId through to buildNowOverflow and returns parsed overflow items', async () => {
    jest.mocked(buildNowOverflow).mockResolvedValue({
      scope: 'person',
      items: [
        {
          kind: 'needs_deepening',
          templateKey: 'now.needs_deepening.default',
          params: {
            topicId: CHILD_ID,
          },
          deepLink: {
            route: 'subject.topic',
            params: {
              subjectId: CHILD_ID,
              bookId: CHILD_ID,
              topicId: CHILD_ID,
            },
            chain: ['library', 'subject', 'topic'],
          },
          scope: 'person',
          personId: CHILD_ID,
        },
      ],
    });

    const res = await makeApp().request(
      `/v1/now/overflow?scope=person&personId=${CHILD_ID}`,
    );

    expect(res.status).toBe(200);
    expect(buildNowOverflow).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      {
        scope: 'person',
        personId: CHILD_ID,
      },
      { mentorNoticeEnabled: false },
    );
    await expect(res.json()).resolves.toMatchObject({
      scope: 'person',
      items: [
        {
          kind: 'needs_deepening',
          scope: 'person',
          personId: CHILD_ID,
        },
      ],
    });
  });

  it('passes the visibility predicate to the self feed collector for a learner reading their own feed', async () => {
    const app = makeApp(true);

    const response = await app.request('/v1/now?scope=self');

    expect(response.status).toBe(200);
    expect(buildNowFeed).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      { scope: 'self' },
      { mentorNoticeEnabled: true },
    );
  });

  // [WI-2498] The rollout flag alone must NOT enable notice data. This is the
  // route-level shape of the named red case: a guardian selects the child's
  // profile (profileId) while the server-resolved caller is someone else, and
  // sends NO X-Proxy-Mode header.
  it('does not enable notices from the rollout flag alone when the caller is not the subject', async () => {
    const app = makeApp(true, CHILD_ID);

    const response = await app.request('/v1/now?scope=self');

    expect(response.status).toBe(200);
    expect(buildNowFeed).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      { scope: 'self' },
      { mentorNoticeEnabled: false },
    );
  });

  // The client-supplied header may only TIGHTEN the predicate.
  it('X-Proxy-Mode: true removes notices even for a genuine self read', async () => {
    const app = makeApp(true);

    const response = await app.request('/v1/now?scope=self', {
      headers: { 'X-Proxy-Mode': 'true' },
    });

    expect(response.status).toBe(200);
    expect(buildNowFeed).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      { scope: 'self' },
      { mentorNoticeEnabled: false },
    );
  });

  it('passes supporter-hub scope through to buildNowOverflow without personId', async () => {
    jest.mocked(buildNowOverflow).mockResolvedValue({
      scope: 'supporter-hub',
      items: [],
    });

    const res = await makeApp().request('/v1/now/overflow?scope=supporter-hub');

    expect(res.status).toBe(200);
    expect(buildNowOverflow).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      {
        scope: 'supporter-hub',
      },
      { mentorNoticeEnabled: false },
    );
  });

  // -------------------------------------------------------------------------
  // [WI-2504] Policy epoch on the wire.
  //
  // The epoch is what lets a client invalidate a projection it already
  // persisted. It is derived from the SAME call that decides `visible`, so
  // each case below asserts BOTH: the epoch the client will bind its cache to,
  // and the visibility that reached the feed builder. They can never diverge.
  // -------------------------------------------------------------------------
  async function epochFor(
    app: ReturnType<typeof makeApp>,
    path: string,
    headers: Record<string, string> = {},
  ): Promise<string | undefined> {
    const res = await app.request(path, { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { mentorNoticePolicyEpoch?: string };
    return body.mentorNoticePolicyEpoch;
  }

  it('emits the visible epoch on /now when the rollout is on for a consented self read', async () => {
    expect(await epochFor(makeApp(true), '/v1/now?scope=self')).toBe(
      'notice-policy-v1:on:self:consented',
    );
    expect(buildNowFeed).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      { scope: 'self' },
      { mentorNoticeEnabled: true },
    );
  });

  it('emits the rollout-off epoch on /now when the kill switch is thrown', async () => {
    expect(await epochFor(makeApp(false), '/v1/now?scope=self')).toBe(
      'notice-policy-v1:off',
    );
    expect(buildNowFeed).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      { scope: 'self' },
      { mentorNoticeEnabled: false },
    );
  });

  // Distinct denial epochs matter: a proxy-tightened read and a flag-off read
  // must not key to the same client cache entry.
  it('emits distinct epochs for a proxy read and a non-subject read', async () => {
    expect(
      await epochFor(makeApp(true), '/v1/now?scope=self', {
        'X-Proxy-Mode': 'true',
      }),
    ).toBe('notice-policy-v1:on:proxy');
    expect(await epochFor(makeApp(true, CHILD_ID), '/v1/now?scope=self')).toBe(
      'notice-policy-v1:on:other-subject',
    );
  });

  it('emits the same epoch on /now/overflow', async () => {
    expect(await epochFor(makeApp(true), '/v1/now/overflow?scope=self')).toBe(
      'notice-policy-v1:on:self:consented',
    );
    expect(await epochFor(makeApp(false), '/v1/now/overflow?scope=self')).toBe(
      'notice-policy-v1:off',
    );
  });
});
