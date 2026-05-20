/**
 * Negative-path and boundary tests for the profiles routes.
 *
 * Strategy: mount a mini Hono app that injects a mock DB and account via
 * middleware, bypassing auth. This lets us test the route layer in isolation
 * without touching the real database.
 *
 * Pattern: follows subjects-language-setup.test.ts and notes.test.ts.
 */

jest.mock(
  '../services/profile' /* gc1-allow: unit-route isolation; real service covered by integration tests */,
  () => {
    const actual = jest.requireActual(
      '../services/profile',
    ) as typeof import('../services/profile');
    return {
      ...actual,
      listProfiles: jest.fn(),
      createProfileWithLimitCheck: jest.fn(),
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
      switchProfile: jest.fn(),
    };
  },
);

import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  listProfiles,
  createProfileWithLimitCheck,
  getProfile,
  updateProfile,
  switchProfile,
  ProfileLimitError,
  ProfileValidationError,
} from '../services/profile';
import { profileRoutes } from './profiles';
import { ERROR_CODES } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Canonical UUIDs for test data
// ---------------------------------------------------------------------------

const ACCOUNT_ID = 'a0000000-0000-4000-a000-000000000001';
const PROFILE_ID_A = 'a0000000-0000-4000-a000-000000000010';
const PROFILE_ID_B = 'a0000000-0000-4000-a000-000000000011';

// ---------------------------------------------------------------------------
// Test app factory — bypasses auth, injects known account + db
// ---------------------------------------------------------------------------

import type { ProfileMeta } from '../middleware/profile-scope';

type TestEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

function makeApp(overrides?: {
  accountId?: string;
  isOwner?: boolean;
  profileMeta?: ProfileMeta | null;
}) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', {} as Database);
    c.set('account', {
      id: overrides?.accountId ?? ACCOUNT_ID,
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Account);
    c.set('profileId', undefined);
    // [CR-2026-05-19-H1] Inject profileMeta so isOwner gate can evaluate.
    // Default isOwner:true for happy-path tests; override for break tests.
    const profileMeta =
      overrides?.profileMeta === null
        ? undefined
        : (overrides?.profileMeta ??
          ({
            isOwner: overrides?.isOwner ?? true,
            birthYear: 2000,
            location: null,
            consentStatus: null,
            hasPremiumLlm: false,
          } as ProfileMeta));
    c.set('profileMeta', profileMeta);
    await next();
  });
  app.onError((err, c) =>
    c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
  );
  app.route('/v1', profileRoutes);
  return app;
}

const listProfilesMock = jest.mocked(listProfiles);
const createProfileWithLimitCheckMock = jest.mocked(
  createProfileWithLimitCheck,
);
const getProfileMock = jest.mocked(getProfile);
const updateProfileMock = jest.mocked(updateProfile);
const switchProfileMock = jest.mocked(switchProfile);

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /v1/profiles
// ---------------------------------------------------------------------------

describe('GET /v1/profiles', () => {
  it('returns 200 with the profile list for the authenticated account', async () => {
    const profile = makeProfileRow({ id: PROFILE_ID_A });
    listProfilesMock.mockResolvedValue([profile]);

    const res = await makeApp().request('/v1/profiles');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profiles: [{ id: PROFILE_ID_A }] });
    expect(listProfilesMock).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
    );
  });

  it('returns 200 with empty array when the account has no profiles', async () => {
    listProfilesMock.mockResolvedValue([]);

    const res = await makeApp().request('/v1/profiles');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ profiles: [] });
  });

  it('propagates service errors to 500', async () => {
    listProfilesMock.mockRejectedValue(new Error('DB timeout'));

    const res = await makeApp().request('/v1/profiles');

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/profiles
// ---------------------------------------------------------------------------

describe('POST /v1/profiles', () => {
  it('returns 201 with the created profile on valid input', async () => {
    const profile = makeProfileRow({ id: PROFILE_ID_A, displayName: 'Alex' });
    createProfileWithLimitCheckMock.mockResolvedValue(profile);

    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Alex',
        birthYear: 2000,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      profile: { id: PROFILE_ID_A, displayName: 'Alex' },
    });
  });

  it('allows first profile creation when no owner profile exists yet', async () => {
    const profile = makeProfileRow({
      id: PROFILE_ID_A,
      displayName: 'First Owner',
      isOwner: true,
    });
    createProfileWithLimitCheckMock.mockResolvedValue(profile);

    const res = await makeApp({ profileMeta: null }).request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'First Owner',
        birthYear: 2000,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(201);
    expect(createProfileWithLimitCheckMock).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
      expect.objectContaining({ displayName: 'First Owner' }),
      // [OPT-C] Route now threads the kill-switch from c.env; assertion needs
      // to accept the opts arg added by the adult-owner-gate wiring.
      expect.objectContaining({ adultOwnerGateEnabled: expect.any(Boolean) }),
    );
    const body = await res.json();
    expect(body).toMatchObject({
      profile: { id: PROFILE_ID_A, isOwner: true },
    });
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(createProfileWithLimitCheckMock).not.toHaveBeenCalled();
  });

  it('returns 400 when birthYear is a string instead of a number', async () => {
    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Alex',
        birthYear: 'nineteen-ninety',
        location: 'EU',
      }),
    });

    expect(res.status).toBe(400);
    expect(createProfileWithLimitCheckMock).not.toHaveBeenCalled();
  });

  it('returns 402 when the subscription profile limit is exceeded', async () => {
    createProfileWithLimitCheckMock.mockRejectedValue(new ProfileLimitError());

    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Alex',
        birthYear: 2000,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.PROFILE_LIMIT_EXCEEDED });
  });

  it('returns 400 when the service throws a ProfileValidationError', async () => {
    createProfileWithLimitCheckMock.mockRejectedValue(
      new ProfileValidationError(
        'CHILD_AGE_VIOLATION',
        'birthYear',
        'User must be at least 11',
      ),
    );

    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Young',
        birthYear: 2020,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it('propagates unexpected service errors to 500', async () => {
    createProfileWithLimitCheckMock.mockRejectedValue(new Error('unexpected'));

    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Alex',
        birthYear: 2000,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(500);
  });

  // [CR-2026-05-19-H1] Break test — non-owner profile must not create profiles.
  it('[BREAK][CR-2026-05-19-H1] returns 403 when active profile is not the account owner', async () => {
    const res = await makeApp({ isOwner: false }).request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Alex',
        birthYear: 2000,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    // Service must not be called — the gate fired at route entry.
    expect(createProfileWithLimitCheckMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /v1/profiles/:id
// ---------------------------------------------------------------------------

describe('GET /v1/profiles/:id', () => {
  it('returns 200 with the profile when it belongs to this account', async () => {
    getProfileMock.mockResolvedValue(makeProfileRow({ id: PROFILE_ID_A }));

    const res = await makeApp().request(`/v1/profiles/${PROFILE_ID_A}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profile: { id: PROFILE_ID_A } });
    expect(getProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID_A,
      ACCOUNT_ID,
    );
  });

  it('returns 404 when the profile does not exist', async () => {
    getProfileMock.mockResolvedValue(null);

    const res = await makeApp().request(`/v1/profiles/${PROFILE_ID_A}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('returns 404 when a different account tries to access this profile (ownership enforced at service layer)', async () => {
    // getProfile is called with (db, profileId, accountId) — it returns null
    // when the accountId does not own the profile, which the route maps to 404.
    getProfileMock.mockResolvedValue(null);

    const res = await makeApp({ accountId: 'other-account-id' }).request(
      `/v1/profiles/${PROFILE_ID_A}`,
    );

    expect(res.status).toBe(404);
    // The service was called with the other account's id — ownership enforced there
    expect(getProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID_A,
      'other-account-id',
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/profiles/:id
// ---------------------------------------------------------------------------

describe('PATCH /v1/profiles/:id', () => {
  it('returns 200 with the updated profile on valid input', async () => {
    const updated = makeProfileRow({
      id: PROFILE_ID_A,
      displayName: 'Updated',
    });
    updateProfileMock.mockResolvedValue(updated);

    const res = await makeApp().request(`/v1/profiles/${PROFILE_ID_A}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Updated' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profile: { displayName: 'Updated' } });
  });

  it('returns 400 on invalid payload (birthYear as negative number)', async () => {
    const res = await makeApp().request(`/v1/profiles/${PROFILE_ID_A}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birthYear: -1 }),
    });

    expect(res.status).toBe(400);
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the profile does not exist or belongs to another account', async () => {
    updateProfileMock.mockResolvedValue(null);

    const res = await makeApp().request(`/v1/profiles/${PROFILE_ID_B}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Nope' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('propagates service errors to 500', async () => {
    updateProfileMock.mockRejectedValue(new Error('DB down'));

    const res = await makeApp().request(`/v1/profiles/${PROFILE_ID_A}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Alex' }),
    });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/profiles/switch
// ---------------------------------------------------------------------------

describe('POST /v1/profiles/switch', () => {
  it('returns 200 on successful switch', async () => {
    switchProfileMock.mockResolvedValue({ profileId: PROFILE_ID_A });

    const res = await makeApp().request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID_A }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profileId: PROFILE_ID_A });
  });

  it('returns 403 when the profile does not belong to this account', async () => {
    // switchProfile returns null/falsy when ownership check fails
    switchProfileMock.mockResolvedValue(null);

    const res = await makeApp().request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID_B }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
  });

  it('returns 400 when profileId is missing from the body', async () => {
    const res = await makeApp().request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(switchProfileMock).not.toHaveBeenCalled();
  });

  it('returns 400 when profileId is not a valid UUID', async () => {
    const res = await makeApp().request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'not-a-uuid' }),
    });

    expect(res.status).toBe(400);
    expect(switchProfileMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfileRow(
  overrides: Partial<{
    id: string;
    accountId: string;
    displayName: string;
    isOwner: boolean;
  }>,
) {
  return {
    id: overrides.id ?? PROFILE_ID_A,
    accountId: overrides.accountId ?? ACCOUNT_ID,
    displayName: overrides.displayName ?? 'Test User',
    avatarUrl: null,
    birthYear: 2000,
    location: 'EU' as const,
    isOwner: overrides.isOwner ?? true,
    hasPremiumLlm: false,
    conversationLanguage: 'en' as const,
    pronouns: null,
    consentStatus: null,
    linkCreatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
