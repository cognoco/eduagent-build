/**
 * Integration: Profile routes
 *
 * Exercises the real profile routes through the full app + real database.
 * JWT verification runs through the real Web Crypto path — no mocks.
 */

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import { buildAuthHeaders, createProfileViaRoute } from './route-fixtures';
import { signExpiredJWT } from './test-keys';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const PROFILE_USER = {
  userId: 'integration-profiles-user',
  email: 'integration-profiles@integration.test',
};

beforeEach(async () => {
  await cleanupAccounts({
    emails: [PROFILE_USER.email],
    clerkUserIds: [PROFILE_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [PROFILE_USER.email],
    clerkUserIds: [PROFILE_USER.userId],
  });
});

describe('Integration: GET /v1/profiles', () => {
  it('returns 200 with profiles array', async () => {
    const created = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PROFILE_USER,
      displayName: 'Integration Learner',
      birthYear: 2008,
    });

    const res = await app.request(
      '/v1/profiles',
      {
        method: 'GET',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.profiles)).toBe(true);
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0]).toMatchObject({
      id: created.id,
      displayName: 'Integration Learner',
      birthYear: 2008,
      isOwner: true,
    });
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request('/v1/profiles', { method: 'GET' }, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it('returns 401 with expired JWT', async () => {
    const expiredToken = signExpiredJWT({
      sub: PROFILE_USER.userId,
      email: PROFILE_USER.email,
    });

    const res = await app.request(
      '/v1/profiles',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${expiredToken}`,
          'Content-Type': 'application/json',
        },
      },
      TEST_ENV
    );

    expect(res.status).toBe(401);
  });
});

describe('Integration: POST /v1/profiles', () => {
  it('returns 201 with valid profile data', async () => {
    const resProfile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PROFILE_USER,
      displayName: 'Test User',
      birthYear: 2008,
    });

    expect(resProfile.displayName).toBe('Test User');
    expect(resProfile.birthYear).toBe(2008);
    expect(resProfile.accountId).toBeDefined();
  });

  it('returns 201 with birthYear-only profile data', async () => {
    const created = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PROFILE_USER,
      displayName: 'Birth Year User',
      birthYear: 2014,
    });

    expect(created.displayName).toBe('Birth Year User');
    expect(created.birthYear).toBe(2014);
  });

  it('returns 400 when displayName is missing', async () => {
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
        body: JSON.stringify({ birthYear: 2014 }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns 402 when profile limit is exceeded', async () => {
    await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PROFILE_USER,
      displayName: 'Owner',
      birthYear: 2000,
    });

    const res = await app.request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
        body: JSON.stringify({
          displayName: 'Second Profile',
          birthYear: 2010,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('PROFILE_LIMIT_EXCEEDED');
    expect(body.message).toMatch(/upgrade/i);
  });

  it('returns 400 when birthYear is missing', async () => {
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
        body: JSON.stringify({
          displayName: 'Missing Birth Year',
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('birthYear');
  });

  it('returns 400 when birthYear is null', async () => {
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
        body: JSON.stringify({
          displayName: 'Null Birth Year',
          birthYear: null,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('birthYear');
  });
});

describe('Integration: GET /v1/profiles/:id', () => {
  it('returns 200 with profile object', async () => {
    const created = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PROFILE_USER,
      displayName: 'Lookup User',
      birthYear: 2008,
    });

    const res = await app.request(
      `/v1/profiles/${created.id}`,
      {
        method: 'GET',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toMatchObject({
      id: created.id,
      displayName: 'Lookup User',
      birthYear: 2008,
    });
  });
});

describe('Integration: PATCH /v1/profiles/:id', () => {
  it('returns 200 with valid partial update', async () => {
    const created = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PROFILE_USER,
      displayName: 'Patch Me',
      birthYear: 2008,
    });

    const res = await app.request(
      `/v1/profiles/${created.id}`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
        body: JSON.stringify({ displayName: 'Updated Name' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toMatchObject({
      id: created.id,
      displayName: 'Updated Name',
    });
  });

  it('returns 400 for invalid avatarUrl', async () => {
    const created = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PROFILE_USER,
      displayName: 'Avatar User',
      birthYear: 2008,
    });

    const res = await app.request(
      `/v1/profiles/${created.id}`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
        body: JSON.stringify({ avatarUrl: 'not-a-url' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });
});

describe('Integration: POST /v1/profiles/switch', () => {
  it('returns 200 with valid profileId', async () => {
    const created = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: PROFILE_USER,
      displayName: 'Switch User',
      birthYear: 2008,
    });

    const res = await app.request(
      '/v1/profiles/switch',
      {
        method: 'POST',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
        body: JSON.stringify({ profileId: created.id }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      message: 'Profile switched',
      profileId: created.id,
    });
  });

  it('returns 400 for non-UUID profileId', async () => {
    const res = await app.request(
      '/v1/profiles/switch',
      {
        method: 'POST',
        headers: buildAuthHeaders({
          sub: PROFILE_USER.userId,
          email: PROFILE_USER.email,
        }),
        body: JSON.stringify({ profileId: 'not-a-uuid' }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(400);
  });
});
