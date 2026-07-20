/**
 * Route-layer tests for /recaps endpoints.
 *
 * Strategy: mount a mini Hono app that injects a mock DB and account via
 * middleware, bypassing auth. Tests focus on the isOwner gate
 * (assertOwnerProfile) and response shape. Real service behavior is covered
 * by integration tests.
 *
 * Pattern: follows profiles.test.ts and notes.test.ts.
 */

// [WI-1989] assertCallerIsAccountOwner calls verifyPersonIsOrgAdminV2, which
// runs a raw membership query this file's mini mock DB (`{}`) cannot satisfy.
// Every scenario here that reaches assertCallerIsAccountOwner is a
// caller-owner scenario (the non-owner break tests are rejected earlier by
// assertOwnerProfile's isOwner check, before this guard runs) — the
// caller-vs-X-Profile-Id-spoof distinction this guard exists to enforce is
// covered by the real-DB break test in
// tests/integration/wi1989-owner-idor.integration.test.ts.
//
// [WI-2416] Same rationale for verifyPersonOwnershipV2, called by
// assertCanReadProfile (GET /recaps/self) — this file's mock db (`{}`)
// cannot satisfy its raw membership query either. Every /recaps/self
// scenario here is a caller-self scenario (makeApp defaults callerPersonId
// to the same PROFILE_ID as the active profile); the cross-account read
// attack this guard exists to close is covered by the real-DB break test in
// tests/integration/wi2416-read-idor.integration.test.ts.
jest.mock('../services/identity-v2/ownership-v2', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/ownership-v2',
  ) as typeof import('../services/identity-v2/ownership-v2');
  return {
    ...actual,
    verifyPersonIsOrgAdminV2: jest.fn().mockResolvedValue(true),
    verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
  };
});

// GC6 canonical pattern: spread jest.requireActual and override only the
// service functions that hit the DB, keeping the route-layer test isolated
// without a full-replace internal mock (no gc1-allow escape needed).
jest.mock('../services/recaps', () => {
  const actual = jest.requireActual(
    '../services/recaps',
  ) as typeof import('../services/recaps');
  return {
    ...actual,
    listRecapsForParent: jest.fn(),
    listRecapsForProfile: jest.fn(),
    getRecapForParent: jest.fn(),
  };
});

import { Hono } from 'hono';

import type { Database } from '@eduagent/database';
import { ERROR_CODES, ForbiddenError, NotFoundError } from '@eduagent/schemas';

import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import {
  getRecapForParent,
  listRecapsForParent,
  listRecapsForProfile,
} from '../services/recaps';
import { recapsRoutes } from './recaps';
import { TEST_PROFILE_ID, TEST_PROFILE_ID_2 } from '@eduagent/test-utils';

// ---------------------------------------------------------------------------
// Canonical IDs for test data
// ---------------------------------------------------------------------------

const PROFILE_ID = TEST_PROFILE_ID;
const CHILD_PROFILE_ID = TEST_PROFILE_ID_2;
const RECAP_ID = 'b0000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = 'c0000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

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
    c.set('callerPersonId', overrides?.profileId ?? PROFILE_ID);
    c.set('profileId', overrides?.profileId ?? PROFILE_ID);
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
  // Mirror the real app.onError handler in index.ts so typed domain errors
  // produce the correct HTTP status codes (403 for ForbiddenError, etc.).
  app.onError((err, c) => {
    if (err instanceof ForbiddenError) {
      return c.json({ code: ERROR_CODES.FORBIDDEN, message: err.message }, 403);
    }
    if (err instanceof NotFoundError) {
      return c.json({ code: ERROR_CODES.NOT_FOUND, message: err.message }, 404);
    }
    return c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500);
  });
  app.route('/v1', recapsRoutes);
  return app;
}

const listRecapsForParentMock = jest.mocked(listRecapsForParent);
const listRecapsForProfileMock = jest.mocked(listRecapsForProfile);
const getRecapForParentMock = jest.mocked(getRecapForParent);

beforeEach(() => {
  listRecapsForParentMock.mockReset();
  listRecapsForProfileMock.mockReset();
  getRecapForParentMock.mockReset();
});

// ---------------------------------------------------------------------------
// Recap list item fixture
// ---------------------------------------------------------------------------

function makeRecapItem(overrides: Partial<{ recapId: string }> = {}) {
  return {
    recapId: overrides.recapId ?? RECAP_ID,
    sessionId: RECAP_ID,
    childProfileId: CHILD_PROFILE_ID,
    childDisplayName: 'Test Child',
    subjectId: 'c0000000-0000-4000-8000-000000000001',
    subjectName: 'Mathematics',
    topicId: 'd0000000-0000-4000-8000-000000000001',
    topicTitle: 'Fractions',
    sessionType: 'learning' as const,
    startedAt: '2026-05-01T10:00:00.000Z',
    endedAt: '2026-05-01T10:30:00.000Z',
    exchangeCount: 5,
    displayTitle: 'Fractions Session',
    displaySummary: 'Covered fractions',
    highlight: null,
    narrative: null,
    conversationPrompt: null,
    engagementSignal: null,
    nextTopicTitle: null,
    nextTopicReason: null,
    verifiedProof: null,
  };
}

// ---------------------------------------------------------------------------
// GET /v1/recaps
// ---------------------------------------------------------------------------

describe('GET /v1/recaps', () => {
  it('returns 200 with recap list for the authenticated owner profile', async () => {
    const recap = makeRecapItem();
    listRecapsForParentMock.mockResolvedValue([recap]);

    const res = await makeApp().request('/v1/recaps');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ recaps: [{ recapId: RECAP_ID }] });
  });

  it('returns 200 with empty array when no recaps exist', async () => {
    listRecapsForParentMock.mockResolvedValue([]);

    const res = await makeApp().request('/v1/recaps');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ recaps: [] });
  });

  // [CR-2026-05-19-H1] Break test: non-owner must be rejected from recap list.
  // Red-green: revert the assertOwnerProfile(c) call in recaps.ts and this
  // test flips from 403 to 200.
  it('[BREAK][CR-2026-05-19-H1] returns 403 when active profile is not the account owner', async () => {
    const res = await makeApp({ isOwner: false }).request('/v1/recaps');

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    // Service must not be called; the route gate fires first.
    expect(listRecapsForParentMock).not.toHaveBeenCalled();
  });

  // [CR-2026-05-19-H1] Break test: absent profileMeta must also fail closed.
  it('[BREAK][CR-2026-05-19-H1] returns 403 when profileMeta is absent (fail-closed)', async () => {
    const res = await makeApp({ profileMeta: null }).request('/v1/recaps');

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    expect(listRecapsForParentMock).not.toHaveBeenCalled();
  });

  it('filters by childProfileId when provided as a query param', async () => {
    listRecapsForParentMock.mockResolvedValue([]);

    const res = await makeApp().request(
      `/v1/recaps?childProfileId=${CHILD_PROFILE_ID}`,
    );

    expect(res.status).toBe(200);
    expect(listRecapsForParentMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      expect.objectContaining({ childProfileId: CHILD_PROFILE_ID }),
    );
  });

  it('returns 400 when childProfileId is not a valid UUID', async () => {
    const res = await makeApp().request('/v1/recaps?childProfileId=not-a-uuid');

    expect(res.status).toBe(400);
    expect(listRecapsForParentMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/recaps/self
// ---------------------------------------------------------------------------

describe('GET /v1/recaps/self', () => {
  it('returns self-scope recaps for the active profile without owner gating', async () => {
    const recap = makeRecapItem({ recapId: RECAP_ID });
    listRecapsForProfileMock.mockResolvedValue([recap]);

    const res = await makeApp({ isOwner: false }).request('/v1/recaps/self');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ recaps: [{ recapId: RECAP_ID }] });
    expect(listRecapsForProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      expect.objectContaining({ limit: 20 }),
    );
    expect(listRecapsForParentMock).not.toHaveBeenCalled();
  });

  it('honors the bounded limit query for self recaps', async () => {
    listRecapsForProfileMock.mockResolvedValue([]);

    const res = await makeApp().request('/v1/recaps/self?limit=5');

    expect(res.status).toBe(200);
    expect(listRecapsForProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      expect.objectContaining({ limit: 5 }),
    );
  });

  it('returns 400 when self recap limit is outside the schema bounds', async () => {
    const res = await makeApp().request('/v1/recaps/self?limit=999');

    expect(res.status).toBe(400);
    expect(listRecapsForProfileMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/recaps/:recapId
// ---------------------------------------------------------------------------

describe('GET /v1/recaps/:recapId', () => {
  it('returns 200 with the recap detail for the authenticated owner profile', async () => {
    const recap = makeRecapItem();
    getRecapForParentMock.mockResolvedValue(recap);

    const res = await makeApp().request(`/v1/recaps/${RECAP_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ recap: { recapId: RECAP_ID } });
    expect(getRecapForParentMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID,
      RECAP_ID,
    );
  });

  it('returns 404 when the recap does not exist', async () => {
    getRecapForParentMock.mockResolvedValue(null);

    const res = await makeApp().request(`/v1/recaps/${RECAP_ID}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  // [CR-2026-05-19-H1] Break test: non-owner must be rejected from recap detail.
  // Red-green: revert the assertOwnerProfile(c) call in recaps.ts and this
  // test flips from 403 to 200 (or 404 if service returns null).
  it('[BREAK][CR-2026-05-19-H1] returns 403 when active profile is not the account owner', async () => {
    const res = await makeApp({ isOwner: false }).request(
      `/v1/recaps/${RECAP_ID}`,
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    // Service must not be called; the route gate fires first.
    expect(getRecapForParentMock).not.toHaveBeenCalled();
  });

  // [CR-2026-05-19-H1] Break test: absent profileMeta must also fail closed.
  it('[BREAK][CR-2026-05-19-H1] returns 403 when profileMeta is absent (fail-closed)', async () => {
    const res = await makeApp({ profileMeta: null }).request(
      `/v1/recaps/${RECAP_ID}`,
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    expect(getRecapForParentMock).not.toHaveBeenCalled();
  });
});
