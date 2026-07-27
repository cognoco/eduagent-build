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
function makeApp(
  mentorNoticeEnabled = false,
  callerPersonId = PROFILE_ID,
  // [WI-2627] Raw binding value, deliberately `string | undefined` rather than
  // `number` so the malformed/absent cases below exercise the real wire shape.
  policyRevision: string | undefined = undefined,
) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = {
      MENTOR_NOTICE_ENABLED: mentorNoticeEnabled ? 'true' : 'false',
      MENTOR_NOTICE_POLICY_REVISION: policyRevision,
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
      // [WI-2627] The `r0` segment is the policy revision folded into the same
      // opaque token (AC-5), so a revision bump alone re-keys an already-shipped
      // client's persisted projection.
      'notice-policy-v1:r0:on:self:consented',
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
      'notice-policy-v1:r0:off',
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
    ).toBe('notice-policy-v1:r0:on:proxy');
    expect(await epochFor(makeApp(true, CHILD_ID), '/v1/now?scope=self')).toBe(
      'notice-policy-v1:r0:on:other-subject',
    );
  });

  it('emits the same epoch on /now/overflow', async () => {
    expect(await epochFor(makeApp(true), '/v1/now/overflow?scope=self')).toBe(
      'notice-policy-v1:r0:on:self:consented',
    );
    expect(await epochFor(makeApp(false), '/v1/now/overflow?scope=self')).toBe(
      'notice-policy-v1:r0:off',
    );
  });

  // -------------------------------------------------------------------------
  // [WI-2627] The ORDERABLE observation on the wire.
  //
  // WI-2504's epoch is comparable for equality only, so two responses cannot be
  // ordered and a late-arriving stale one wins whatever it says. Each case below
  // asserts the GUARANTEED PROPERTY a client depends on, not the field's shape:
  // that `rolloutEnabled` reports the DEPLOYMENT flag (never a per-request
  // tightening), that `projectionEpoch` is byte-identical to the epoch the same
  // response gated on, and that a malformed revision cannot raise the ordering.
  // -------------------------------------------------------------------------
  async function observationFor(
    app: ReturnType<typeof makeApp>,
    path: string,
    headers: Record<string, string> = {},
  ) {
    const res = await app.request(path, { headers });
    expect(res.status).toBe(200);
    return (await res.json()) as {
      mentorNoticePolicyEpoch?: string;
      mentorNoticePolicy?: {
        rolloutRevision: number;
        rolloutEnabled: boolean;
        projectionEpoch: string;
      };
    };
  }

  it('reports rolloutEnabled=false and the configured revision when the kill switch is thrown', async () => {
    const body = await observationFor(
      makeApp(false, PROFILE_ID, '7'),
      '/v1/now?scope=self',
    );
    expect(body.mentorNoticePolicy).toEqual({
      rolloutRevision: 7,
      rolloutEnabled: false,
      projectionEpoch: 'notice-policy-v1:r7:off',
    });
  });

  // THE case that decides the whole design. A proxy read is a PER-REQUEST
  // tightening of a rollout that is still ON. If it reported
  // `rolloutEnabled: false`, the client's monotonic store — where "same
  // revision, disabled wins" — would latch off at this revision, and the same
  // learner's own legitimate self read at the same revision could not turn it
  // back on (re-enable requires a STRICTLY HIGHER revision). One proxy read
  // would poison self until a deploy bumped the revision.
  it('keeps rolloutEnabled=true for per-request tightenings, so a tightened read cannot latch the rollout off', async () => {
    for (const body of [
      await observationFor(
        makeApp(true, PROFILE_ID, '4'),
        '/v1/now?scope=self',
        { 'X-Proxy-Mode': 'true' },
      ),
      await observationFor(makeApp(true, CHILD_ID, '4'), '/v1/now?scope=self'),
    ]) {
      expect(body.mentorNoticePolicy?.rolloutEnabled).toBe(true);
      expect(body.mentorNoticePolicy?.rolloutRevision).toBe(4);
    }
    // …while the epoch still SEPARATES them, which is what actually stops a
    // tightened read serving the untightened read's cached projection.
    expect(
      (
        await observationFor(
          makeApp(true, PROFILE_ID, '4'),
          '/v1/now?scope=self',
          { 'X-Proxy-Mode': 'true' },
        )
      ).mentorNoticePolicy?.projectionEpoch,
    ).toBe('notice-policy-v1:r4:on:proxy');
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['non-numeric', 'latest'],
    ['fractional', '2.5'],
    ['negative', '-3'],
  ])(
    'clamps a %s revision to 0, which cannot raise the ordering a client already observed',
    async (_label, raw) => {
      const body = await observationFor(
        makeApp(true, PROFILE_ID, raw),
        '/v1/now?scope=self',
      );
      // 0 is the LOWEST admissible revision. A client that has observed any
      // revision >= 0 with the rollout disabled will therefore IGNORE this
      // response (lower) or apply disabled-wins (equal) — a malformed binding is
      // structurally incapable of re-enabling a disabled client.
      expect(body.mentorNoticePolicy?.rolloutRevision).toBe(0);
    },
  );

  it('emits an observation whose projectionEpoch is the same string the response gated on, on both /now and /now/overflow', async () => {
    for (const path of ['/v1/now?scope=self', '/v1/now/overflow?scope=self']) {
      const body = await observationFor(makeApp(true, PROFILE_ID, '11'), path);
      // One derivation, two names: a client keying on either can never bind its
      // projection to a policy state different from the one the server enforced.
      expect(body.mentorNoticePolicy?.projectionEpoch).toBe(
        body.mentorNoticePolicyEpoch,
      );
      expect(body.mentorNoticePolicy?.projectionEpoch).toBe(
        'notice-policy-v1:r11:on:self:consented',
      );
    }
  });
});
