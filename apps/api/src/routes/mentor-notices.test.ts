import { Hono } from 'hono';
import type { Database } from '@eduagent/database';

import {
  deferMentorNotice,
  MentorNoticeUnavailableError,
  startMentorNoticeRecheck,
} from '../services/mentor-notices';
import { mentorNoticeRoutes } from './mentor-notices';

jest.mock(
  '../services/mentor-notices' /* gc1-allow: route unit test injects service outcomes into a fake request database; services have direct unit and integration coverage */,
  () => ({
    ...jest.requireActual('../services/mentor-notices'),
    deferMentorNotice: jest.fn(),
    getProfileTimeZone: jest.fn().mockResolvedValue('UTC'),
    startMentorNoticeRecheck: jest.fn(),
  }),
);

// [WI-2398] assertNotProxyMode now also calls assertCanWriteProfile, which
// calls verifyPersonOwnershipV2 — a raw db.select() membership query the
// stub `db` in this file cannot satisfy. Every scenario in this file is a
// caller-self write (makeApp sets callerPersonId equal to profileId below);
// the cross-account write attack this guard exists to close is covered by
// the real-DB break test in
// tests/integration/wi2398-write-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's stub-db environment.
jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

// [WI-2498] resolveMentorNoticeVisibility's CONSENT conjunct reads the
// consent_grant/consent_request tables via a raw db query the stub `db` above
// cannot satisfy. Every scenario in this file is a consented caller-self read;
// the consent conjunct itself is covered against a real database in
// tests/integration/mentor-notice-proxy-visibility.integration.test.ts.
// gc1-allow: isLlmExchangeConsentAllowed runs raw db queries with no real
// implementation available in this file's stub-db environment.
jest.mock('../services/identity-v2/consent-status-v2', () => ({
  ...jest.requireActual('../services/identity-v2/consent-status-v2'),
  isLlmExchangeConsentAllowed: jest.fn().mockResolvedValue(true),
}));

const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440001';
const NOTICE_ID = '550e8400-e29b-41d4-a716-446655440002';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440003';

function makeApp(enabled = true) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db' as never, { marker: 'db' } as unknown as Database);
    c.set('profileId' as never, PROFILE_ID);
    c.set('profileMeta' as never, {
      id: PROFILE_ID,
      isOwner: true,
      resolvedVia: 'explicit-header',
    });
    // [WI-2398] Caller-self identity — assertNotProxyMode now also calls
    // assertCanWriteProfile, which requires account + callerPersonId.
    c.set('account' as never, { id: 'test-account-id' });
    c.set('callerPersonId' as never, PROFILE_ID);
    c.env = { MENTOR_NOTICE_ENABLED: enabled ? 'true' : 'false' } as never;
    await next();
  });
  app.route('/v1', mentorNoticeRoutes);
  return app;
}

describe('mentor notice routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps both actions invisible while the feature is disabled', async () => {
    const app = makeApp(false);
    const [recheck, defer] = await Promise.all([
      app.request(`/v1/mentor-notices/${NOTICE_ID}/recheck`, {
        method: 'POST',
      }),
      app.request(`/v1/mentor-notices/${NOTICE_ID}/defer`, { method: 'POST' }),
    ]);

    expect(recheck.status).toBe(404);
    expect(defer.status).toBe(404);
    expect(startMentorNoticeRecheck).not.toHaveBeenCalled();
    expect(deferMentorNotice).not.toHaveBeenCalled();
  });

  it('returns the idempotent re-check session response', async () => {
    jest.mocked(startMentorNoticeRecheck).mockResolvedValue({
      sessionId: SESSION_ID,
    });

    const response = await makeApp().request(
      `/v1/mentor-notices/${NOTICE_ID}/recheck`,
      { method: 'POST' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sessionId: SESSION_ID });
    expect(startMentorNoticeRecheck).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      NOTICE_ID,
    );
  });

  it.each([
    ['not_found' as const, 404],
    ['terminal' as const, 409],
  ])('maps %s re-check failures to %i', async (reason, status) => {
    jest
      .mocked(startMentorNoticeRecheck)
      .mockRejectedValue(new MentorNoticeUnavailableError(reason));

    const response = await makeApp().request(
      `/v1/mentor-notices/${NOTICE_ID}/recheck`,
      { method: 'POST' },
    );

    expect(response.status).toBe(status);
  });

  it('returns the server defer timestamp', async () => {
    const deferredAt = '2026-07-19T12:00:00.000Z';
    jest.mocked(deferMentorNotice).mockResolvedValue({
      noticeId: NOTICE_ID,
      deferredAt,
    });

    const response = await makeApp().request(
      `/v1/mentor-notices/${NOTICE_ID}/defer`,
      { method: 'POST' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      noticeId: NOTICE_ID,
      deferredAt,
    });
  });
});
