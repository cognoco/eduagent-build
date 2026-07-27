/**
 * Route-layer tests for child-cap notification endpoints.
 *
 * The route owns auth/profile scoping. Database behavior and dedupe live in
 * the service tests / integration path.
 */

// WI-867 flag-collapse: route now calls listActiveChildCapNotificationsV2 /
// recordChildCapNotificationForAccountV2 from billing-v2 (db.select() join
// chains, unrunnable on unit mock DB). dismissChildCapNotification stays on
// the legacy service (unchanged). No integration twin yet for the V2 path
// through this route — tracked as WI-905 gap.
jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: WI-867 flag-collapse — route calls listActiveChildCapNotificationsV2/recordChildCapNotificationForAccountV2 from billing-v2 (db.select() join chains, unrunnable on unit mock DB); WI-905 gap: no route-level integration twin for listActiveChildCapNotificationsV2/recordChildCapNotificationForAccountV2 */,
  () => {
    const actual = jest.requireActual(
      '../services/billing/billing-v2',
    ) as typeof import('../services/billing/billing-v2');
    return {
      ...actual,
      listActiveChildCapNotificationsV2: jest.fn(),
      recordChildCapNotificationForAccountV2: jest.fn(),
    };
  },
);

jest.mock(
  '../services/child-cap-notifications' /* gc1-allow: route unit isolation; service covers DB behavior */,
  () => {
    const actual = jest.requireActual(
      '../services/child-cap-notifications',
    ) as typeof import('../services/child-cap-notifications');
    return {
      ...actual,
      dismissChildCapNotification: jest.fn(),
    };
  },
);

// [WI-1989] assertCallerIsAccountOwner calls verifyPersonIsOrgAdminV2, which
// runs a raw membership query this file's mini mock DB (`{}`) cannot satisfy.
// Every scenario here that reaches assertCallerIsAccountOwner is a
// caller-owner scenario (the non-owner break tests are rejected earlier by
// assertOwnerProfile's isOwner check, before this guard runs) — the
// caller-vs-X-Profile-Id-spoof distinction this guard exists to enforce is
// covered by the real-DB break test in
// tests/integration/wi1989-owner-idor.integration.test.ts.
jest.mock('../services/identity-v2/ownership-v2', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/ownership-v2',
  ) as typeof import('../services/identity-v2/ownership-v2');
  return {
    ...actual,
    verifyPersonIsOrgAdminV2: jest.fn().mockResolvedValue(true),
  };
});

import { Hono } from 'hono';

import type { Database } from '@eduagent/database';
import { ERROR_CODES, ForbiddenError, NotFoundError } from '@eduagent/schemas';

import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { dismissChildCapNotification } from '../services/child-cap-notifications';
import {
  listActiveChildCapNotificationsV2,
  recordChildCapNotificationForAccountV2,
} from '../services/billing/billing-v2';
import { notificationsRoutes } from './notifications';
import { TEST_PROFILE_ID, TEST_PROFILE_ID_2 } from '@eduagent/test-utils';

const OWNER_PROFILE_ID = TEST_PROFILE_ID;
const CHILD_PROFILE_ID = TEST_PROFILE_ID_2;
const ACCOUNT_ID = 'c0000000-0000-4000-8000-000000000001';
const NOTIFICATION_ID = 'b0000000-0000-4000-8000-000000000001';

type TestEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: { id: string };
    // [WI-1989] Required by assertCallerIsAccountOwner.
    callerPersonId: string | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

function makeApp(overrides?: {
  profileId?: string;
  profileMeta?: ProfileMeta | null;
  isOwner?: boolean;
}) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', {} as Database);
    c.set('account', { id: ACCOUNT_ID });
    c.set('callerPersonId', overrides?.profileId ?? OWNER_PROFILE_ID);
    c.set('profileId', overrides?.profileId ?? OWNER_PROFILE_ID);
    const profileMeta =
      overrides?.profileMeta === null
        ? undefined
        : (overrides?.profileMeta ??
          ({
            isOwner: overrides?.isOwner ?? true,
            resolvedVia:
              (overrides?.isOwner ?? true) ? 'explicit-header' : 'auto',
            birthYear: 2000,
            location: null,
            consentStatus: null,
            hasPremiumLlm: false,
          } as ProfileMeta));
    c.set('profileMeta', profileMeta);
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof ForbiddenError) {
      return c.json({ code: ERROR_CODES.FORBIDDEN, message: err.message }, 403);
    }
    if (err instanceof NotFoundError) {
      return c.json({ code: ERROR_CODES.NOT_FOUND, message: err.message }, 404);
    }
    return c.json(
      { code: ERROR_CODES.INTERNAL_ERROR, message: err.message },
      500,
    );
  });
  app.route('/v1', notificationsRoutes);
  return app;
}

const listMock = jest.mocked(listActiveChildCapNotificationsV2);
const dismissMock = jest.mocked(dismissChildCapNotification);
const recordForAccountMock = jest.mocked(
  recordChildCapNotificationForAccountV2,
);

beforeEach(() => {
  jest.clearAllMocks();
  listMock.mockResolvedValue([
    {
      id: NOTIFICATION_ID,
      ownerProfileId: OWNER_PROFILE_ID,
      childProfileId: CHILD_PROFILE_ID,
      childDisplayName: 'Emma',
      kind: 'daily_exceeded',
      occurredOn: '2026-05-26',
      resetsAt: '2026-05-27T01:00:00.000Z',
      createdAt: '2026-05-26T12:00:00.000Z',
    },
  ]);
  dismissMock.mockResolvedValue(true);
  recordForAccountMock.mockResolvedValue({ inserted: true });
});

describe('GET /v1/notifications/child-cap', () => {
  it('lists active child-cap notifications for the owner profile', async () => {
    const res = await makeApp().request('/v1/notifications/child-cap');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0]).toMatchObject({
      id: NOTIFICATION_ID,
      childDisplayName: 'Emma',
      kind: 'daily_exceeded',
    });
    expect(listMock).toHaveBeenCalledWith(expect.anything(), OWNER_PROFILE_ID);
  });

  it('returns 403 and does not read parent notifications for a child profile', async () => {
    const res = await makeApp({
      profileId: CHILD_PROFILE_ID,
      isOwner: false,
    }).request('/v1/notifications/child-cap');

    expect(res.status).toBe(403);
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe('POST /v1/notifications/child-cap/:id/dismiss', () => {
  it('dismisses an owner-owned notification', async () => {
    const res = await makeApp().request(
      `/v1/notifications/child-cap/${NOTIFICATION_ID}/dismiss`,
      { method: 'POST' },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(dismissMock).toHaveBeenCalledWith(
      expect.anything(),
      OWNER_PROFILE_ID,
      NOTIFICATION_ID,
    );
  });

  it('returns 404 for a notification outside the owner account', async () => {
    dismissMock.mockResolvedValueOnce(false);

    const res = await makeApp().request(
      `/v1/notifications/child-cap/${NOTIFICATION_ID}/dismiss`,
      { method: 'POST' },
    );

    expect(res.status).toBe(404);
  });

  it('treats an already-dismissed owner notification as a 200 no-op', async () => {
    dismissMock.mockResolvedValueOnce(true);

    const res = await makeApp().request(
      `/v1/notifications/child-cap/${NOTIFICATION_ID}/dismiss`,
      { method: 'POST' },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});

describe('POST /v1/notifications/child-cap/notify-parent', () => {
  it('lets a child profile create the quota-specific parent notification', async () => {
    const res = await makeApp({
      profileId: CHILD_PROFILE_ID,
      isOwner: false,
    }).request('/v1/notifications/child-cap/notify-parent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'daily_exceeded',
        resetsAt: '2026-05-27T01:00:00.000Z',
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sent: true });
    expect(recordForAccountMock).toHaveBeenCalledWith(expect.anything(), {
      accountId: ACCOUNT_ID,
      childProfileId: CHILD_PROFILE_ID,
      kind: 'daily_exceeded',
      resetsAt: '2026-05-27T01:00:00.000Z',
      occurredAt: expect.any(String),
    });
  });

  it('rejects owner profiles so owner quota exhaustion does not page the parent', async () => {
    const res = await makeApp().request(
      '/v1/notifications/child-cap/notify-parent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'monthly_exceeded',
          resetsAt: '2026-06-01T00:00:00.000Z',
        }),
      },
    );

    expect(res.status).toBe(403);
    expect(recordForAccountMock).not.toHaveBeenCalled();
  });
});
