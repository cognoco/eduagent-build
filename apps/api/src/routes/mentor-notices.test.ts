import { Hono } from 'hono';
import type { Database } from '@eduagent/database';

import {
  deferMentorNotice,
  MentorNoticeUnavailableError,
  startMentorNoticeRecheck,
} from '../services/mentor-notices';
import { mentorNoticeRoutes } from './mentor-notices';

jest.mock('../services/mentor-notices', () => ({
  ...jest.requireActual('../services/mentor-notices'),
  deferMentorNotice: jest.fn(),
  getProfileTimeZone: jest.fn().mockResolvedValue('UTC'),
  startMentorNoticeRecheck: jest.fn(),
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
