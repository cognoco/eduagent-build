import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockProfileFindFirst = jest.fn();
const mockFamilyLinksFindFirst = jest.fn().mockResolvedValue(undefined);

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: {
    query: {
      profiles: {
        findFirst: (...args: unknown[]) => mockProfileFindFirst(...args),
      },
      familyLinks: {
        findFirst: (...args: unknown[]) => mockFamilyLinksFindFirst(...args),
      },
      consentStates: {
        findFirst: jest.fn().mockResolvedValue(undefined),
      },
    },
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test requires DB module mock for middleware — no real DB */,
  () => mockDatabaseModule.module,
);

jest.mock('../services/account', () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    // gc1-allow: stubs findOrCreateAccount — avoids real Clerk/DB round-trip in unit tests for settings routes
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
});

// [WI-774] v2 identity resolver — under IDENTITY_V2_ENABLED='true' the account
// middleware resolves the graph and sets callerPersonId. Mocked so the flag-on
// route tests can assert the v2 guard is armed without an unmocked DB; the
// resolver itself is covered by identity integration tests.
jest.mock(
  '../services/identity-v2/identity-resolve' /* gc1-allow: route unit test — DB mocked; resolver covered by identity integration tests */,
  () => ({
    resolveIdentityV2: jest.fn().mockResolvedValue({
      account: {
        id: 'test-account-id',
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      personId: 'person-test-id',
      organizationId: 'test-account-id',
      isOwner: true,
      roles: ['admin'],
    }),
  }),
);

// [WI-774, WI-867] v2 profile-scope resolver — post-collapse always calls these.
// Module-level refs so per-test overrides work after jest.clearAllMocks().
const mockFindOwnerPersonScope = jest.fn().mockResolvedValue({
  profileId: 'profile-1',
  meta: {
    birthYear: 1990,
    location: 'EU',
    consentStatus: null,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    isOwner: true,
  },
});
const mockGetPersonScope = jest.fn().mockResolvedValue({
  profileId: 'profile-1',
  meta: {
    birthYear: 1990,
    location: 'EU',
    consentStatus: null,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    isOwner: true,
  },
});
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — post-collapse profile-scope middleware calls findOwnerPersonScope/getPersonScope (db.select() join chains, unrunnable on unit mock DB); real path covered by identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

const mockGetOwnedFamilyPoolBreakdownSharing = jest.fn();
const mockUpsertFamilyPoolBreakdownSharing = jest.fn();
const mockGetNotificationPrefs = jest.fn();
const mockUpsertNotificationPrefs = jest.fn();
const mockGetChildCelebrationLevel = jest.fn();
const mockUpsertCelebrationLevel = jest.fn();
const mockUpsertChildCelebrationLevel = jest.fn();
const mockGetWithdrawalArchivePreference = jest.fn();
const mockUpsertWithdrawalArchivePreference = jest.fn();
const mockRegisterPushToken = jest.fn();

// [WI-867] Post-collapse: account middleware calls ensureInitialTrialSubscriptionV2 unconditionally.
jest.mock(
  '../services/billing/billing-v2' /* gc1-allow: continuity — ensureInitialTrialSubscriptionV2 uses db.execute()/db.transaction() paths the unit mock DB cannot satisfy; real path covered by apps/api/src/services/billing/billing-v2/subscription-core-v2.integration.test.ts */,
  () => ({
    ...jest.requireActual('../services/billing/billing-v2'),
    ensureInitialTrialSubscriptionV2: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock('../services/settings' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../services/settings');
  return {
    ...actual,
    getOwnedFamilyPoolBreakdownSharing: (...args: unknown[]) =>
      mockGetOwnedFamilyPoolBreakdownSharing(...args),
    upsertFamilyPoolBreakdownSharing: (...args: unknown[]) =>
      mockUpsertFamilyPoolBreakdownSharing(...args),
    getNotificationPrefs: (...args: unknown[]) =>
      mockGetNotificationPrefs(...args),
    upsertNotificationPrefs: (...args: unknown[]) =>
      mockUpsertNotificationPrefs(...args),
    getChildCelebrationLevel: (...args: unknown[]) =>
      mockGetChildCelebrationLevel(...args),
    upsertCelebrationLevel: (...args: unknown[]) =>
      mockUpsertCelebrationLevel(...args),
    upsertChildCelebrationLevel: (...args: unknown[]) =>
      mockUpsertChildCelebrationLevel(...args),
    getWithdrawalArchivePreference: (...args: unknown[]) =>
      mockGetWithdrawalArchivePreference(...args),
    upsertWithdrawalArchivePreference: (...args: unknown[]) =>
      mockUpsertWithdrawalArchivePreference(...args),
    registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
  };
});

const mockNotifyParentToSubscribe = jest.fn();

jest.mock(
  '../services/notifications' /* gc1-allow: route unit test — side-effecting notification send replaced by behavior-controlled stub */,
  () => {
    const actual = jest.requireActual('../services/notifications');
    return {
      ...actual,
      notifyParentToSubscribe: (...args: unknown[]) =>
        mockNotifyParentToSubscribe(...args),
    };
  },
);

const mockSetAnalogyDomain = jest.fn();
const mockSetNativeLanguage = jest.fn();

jest.mock(
  '../services/retention-data' /* gc1-allow: route unit test — DB-bound subject preference writes replaced by behavior-controlled stubs */,
  () => {
    const actual = jest.requireActual('../services/retention-data');
    return {
      ...actual,
      setAnalogyDomain: (...args: unknown[]) => mockSetAnalogyDomain(...args),
      setNativeLanguage: (...args: unknown[]) => mockSetNativeLanguage(...args),
    };
  },
);

import { Hono } from 'hono';
import { app } from '../index';
import { settingsRoutes } from './settings';
import { BASE_AUTH_ENV, makeAuthHeaders } from '../test-utils/test-env';
import { ForbiddenError } from '@eduagent/schemas';

const AUTH_HEADERS = makeAuthHeaders();
const PROFILE_HEADERS = { ...AUTH_HEADERS, 'X-Profile-Id': 'profile-1' };
const CHILD_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440111';
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ...BASE_AUTH_ENV,
};
// [WI-867] Retained to verify callerPersonId is always threaded (v2 always active).
const V2_TEST_ENV = { ...TEST_ENV, IDENTITY_V2_ENABLED: 'true' };

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();
  mockFamilyLinksFindFirst.mockResolvedValue(undefined);
  mockProfileFindFirst.mockResolvedValue({
    id: 'profile-1',
    accountId: 'test-account-id',
    displayName: 'Alex',
    avatarUrl: null,
    birthYear: 1990,
    location: 'EU',
    isOwner: true,
    hasPremiumLlm: false,
    conversationLanguage: 'en',
    pronouns: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    archivedAt: null,
  });
  mockGetOwnedFamilyPoolBreakdownSharing.mockResolvedValue(false);
  mockUpsertFamilyPoolBreakdownSharing.mockResolvedValue({ value: true });
  mockGetNotificationPrefs.mockResolvedValue({
    reviewReminders: false,
    dailyReminders: false,
    weeklyProgressPush: true,
    weeklyProgressEmail: true,
    monthlyProgressEmail: true,
    pushEnabled: false,
    pushTokenRegistered: false,
    maxDailyPush: 3,
  });
  mockUpsertNotificationPrefs.mockResolvedValue({
    reviewReminders: true,
    dailyReminders: false,
    weeklyProgressPush: true,
    weeklyProgressEmail: true,
    monthlyProgressEmail: true,
    pushEnabled: false,
    pushTokenRegistered: false,
    maxDailyPush: 3,
  });
  mockGetWithdrawalArchivePreference.mockResolvedValue('auto');
  mockUpsertWithdrawalArchivePreference.mockResolvedValue({ value: 'auto' });
  mockGetChildCelebrationLevel.mockResolvedValue('big_only');
  mockUpsertCelebrationLevel.mockResolvedValue({ celebrationLevel: 'all' });
  mockUpsertChildCelebrationLevel.mockResolvedValue({
    celebrationLevel: 'all',
  });
  mockRegisterPushToken.mockResolvedValue(undefined);
  mockNotifyParentToSubscribe.mockResolvedValue({
    sent: true,
    rateLimited: false,
  });
  mockSetAnalogyDomain.mockResolvedValue('sports');
  mockSetNativeLanguage.mockResolvedValue('en');
});

describe('settings routes', () => {
  it('GET /v1/settings/withdrawal-archive returns 403 for non-owner callers (I5)', async () => {
    // [WI-867] Post-collapse: isOwner comes from getPersonScope meta, not legacy profile row.
    mockGetPersonScope.mockResolvedValueOnce({
      profileId: 'profile-1',
      meta: {
        birthYear: 1990,
        location: 'EU',
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: false,
      },
    });

    const res = await app.request(
      '/v1/settings/withdrawal-archive',
      { headers: PROFILE_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  it('GET /v1/settings/family-pool-breakdown-sharing returns the stored value', async () => {
    mockGetOwnedFamilyPoolBreakdownSharing.mockResolvedValue(true);

    const res = await app.request(
      '/v1/settings/family-pool-breakdown-sharing',
      { headers: PROFILE_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ value: true });
  });

  it('PUT /v1/settings/family-pool-breakdown-sharing persists a boolean', async () => {
    const res = await app.request(
      '/v1/settings/family-pool-breakdown-sharing',
      {
        method: 'PUT',
        headers: PROFILE_HEADERS,
        body: JSON.stringify({ value: true }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ value: true });
    // [WI-867] Post-collapse: callerPersonId always set (resolveIdentityV2 always runs).
    expect(mockUpsertFamilyPoolBreakdownSharing).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      'test-account-id',
      true,
      { callerPersonId: 'person-test-id' },
    );
  });

  it('PUT /v1/settings/family-pool-breakdown-sharing rejects non-owner callers', async () => {
    mockUpsertFamilyPoolBreakdownSharing.mockRejectedValue(
      new ForbiddenError('Profile owner required'),
    );

    const res = await app.request(
      '/v1/settings/family-pool-breakdown-sharing',
      {
        method: 'PUT',
        headers: PROFILE_HEADERS,
        body: JSON.stringify({ value: true }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Validation / negative-path coverage
  // ---------------------------------------------------------------------------

  it('GET /v1/settings/notifications returns 200 with preferences for the active profile', async () => {
    const res = await app.request(
      '/v1/settings/notifications',
      { headers: PROFILE_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('preferences');
    expect(mockGetNotificationPrefs).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
    );
  });

  it('PUT /v1/settings/notifications returns 400 on invalid payload (maxDailyPush as string)', async () => {
    const res = await app.request(
      '/v1/settings/notifications',
      {
        method: 'PUT',
        headers: PROFILE_HEADERS,
        body: JSON.stringify({ maxDailyPush: 'ten' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(mockUpsertNotificationPrefs).not.toHaveBeenCalled();
  });

  it('PUT /v1/settings/notifications returns 200 on a valid payload', async () => {
    const res = await app.request(
      '/v1/settings/notifications',
      {
        method: 'PUT',
        headers: PROFILE_HEADERS,
        body: JSON.stringify({
          reviewReminders: true,
          dailyReminders: false,
          pushEnabled: false,
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    expect(mockUpsertNotificationPrefs).toHaveBeenCalled();
  });

  it('[WI-867] callerPersonId is always threaded into write guard (v2 always active)', async () => {
    const res = await app.request(
      '/v1/settings/notifications',
      {
        method: 'PUT',
        headers: PROFILE_HEADERS,
        body: JSON.stringify({
          reviewReminders: true,
          dailyReminders: false,
          pushEnabled: false,
        }),
      },
      V2_TEST_ENV,
    );

    expect(res.status).toBe(200);
    // [WI-867] callerPersonId must always be threaded from resolveIdentityV2 (flag collapsed).
    expect(mockUpsertNotificationPrefs).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      'test-account-id',
      expect.objectContaining({ reviewReminders: true }),
      { callerPersonId: 'person-test-id' },
    );
  });

  it('GET /v1/settings/withdrawal-archive returns 200 for owner callers', async () => {
    const res = await app.request(
      '/v1/settings/withdrawal-archive',
      { headers: PROFILE_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
  });

  it('PUT /v1/settings/withdrawal-archive returns 400 on invalid payload (unknown enum value)', async () => {
    // withdrawalArchivePreferenceSchema only allows 'auto' | 'always' | 'never'
    const res = await app.request(
      '/v1/settings/withdrawal-archive',
      {
        method: 'PUT',
        headers: PROFILE_HEADERS,
        body: JSON.stringify({ value: 'delete_everything' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(400);
    expect(mockUpsertWithdrawalArchivePreference).not.toHaveBeenCalled();
  });

  it('PUT /v1/settings/withdrawal-archive returns 403 when ForbiddenError is thrown', async () => {
    mockUpsertWithdrawalArchivePreference.mockRejectedValue(
      new ForbiddenError('Owner required'),
    );

    const res = await app.request(
      '/v1/settings/withdrawal-archive',
      {
        method: 'PUT',
        headers: PROFILE_HEADERS,
        body: JSON.stringify({ value: 'auto' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  it('routes return 401 when no Authorization header is present', async () => {
    const res = await app.request(
      '/v1/settings/notifications',
      { headers: { 'Content-Type': 'application/json' } },
      TEST_ENV,
    );

    expect(res.status).toBe(401);
  });

  it('routes return 403 when a profile that belongs to a different account is used (wrong-profile access)', async () => {
    // [WI-867] Post-collapse: profile-scope middleware calls getPersonScope (v2).
    // When it returns null (profile not in this account's person graph), middleware 403s.
    mockGetPersonScope.mockResolvedValueOnce(null);

    const res = await app.request(
      '/v1/settings/notifications',
      {
        headers: {
          ...AUTH_HEADERS,
          'X-Profile-Id': 'profile-owned-by-another-account',
        },
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  describe('[BREAK][Issue 901] auto-resolved owner identity is not owner authority', () => {
    const cases: Array<{
      name: string;
      path: string;
      init?: RequestInit;
      serviceMock: jest.Mock;
    }> = [
      {
        name: 'GET /settings/withdrawal-archive',
        path: '/v1/settings/withdrawal-archive',
        serviceMock: mockGetWithdrawalArchivePreference,
      },
      {
        name: 'GET /settings/celebration-level?childProfileId',
        path: `/v1/settings/celebration-level?childProfileId=${CHILD_PROFILE_ID}`,
        serviceMock: mockGetChildCelebrationLevel,
      },
      {
        name: 'PUT /settings/notifications',
        path: '/v1/settings/notifications',
        init: {
          method: 'PUT',
          body: JSON.stringify({
            reviewReminders: true,
            dailyReminders: true,
            pushEnabled: true,
          }),
        },
        serviceMock: mockUpsertNotificationPrefs,
      },
      {
        name: 'PUT /settings/celebration-level self',
        path: '/v1/settings/celebration-level',
        init: {
          method: 'PUT',
          body: JSON.stringify({ celebrationLevel: 'all' }),
        },
        serviceMock: mockUpsertCelebrationLevel,
      },
      {
        name: 'PUT /settings/celebration-level child',
        path: '/v1/settings/celebration-level',
        init: {
          method: 'PUT',
          body: JSON.stringify({
            childProfileId: CHILD_PROFILE_ID,
            celebrationLevel: 'all',
          }),
        },
        serviceMock: mockUpsertChildCelebrationLevel,
      },
      {
        name: 'PUT /settings/withdrawal-archive',
        path: '/v1/settings/withdrawal-archive',
        init: {
          method: 'PUT',
          body: JSON.stringify({ value: 'auto' }),
        },
        serviceMock: mockUpsertWithdrawalArchivePreference,
      },
      {
        name: 'PUT /settings/family-pool-breakdown-sharing',
        path: '/v1/settings/family-pool-breakdown-sharing',
        init: {
          method: 'PUT',
          body: JSON.stringify({ value: true }),
        },
        serviceMock: mockUpsertFamilyPoolBreakdownSharing,
      },
      {
        name: 'POST /settings/push-token',
        path: '/v1/settings/push-token',
        init: {
          method: 'POST',
          body: JSON.stringify({ token: 'ExponentPushToken[xxxxxxxxxx]' }),
        },
        serviceMock: mockRegisterPushToken,
      },
      {
        name: 'POST /settings/notify-parent-subscribe',
        path: '/v1/settings/notify-parent-subscribe',
        init: { method: 'POST' },
        serviceMock: mockNotifyParentToSubscribe,
      },
      {
        name: 'PUT /settings/subjects/:subjectId/analogy-domain',
        path: `/v1/settings/subjects/${SUBJECT_ID}/analogy-domain`,
        init: {
          method: 'PUT',
          body: JSON.stringify({ analogyDomain: 'sports' }),
        },
        serviceMock: mockSetAnalogyDomain,
      },
      {
        name: 'PUT /settings/subjects/:subjectId/native-language',
        path: `/v1/settings/subjects/${SUBJECT_ID}/native-language`,
        init: {
          method: 'PUT',
          body: JSON.stringify({ nativeLanguage: 'en' }),
        },
        serviceMock: mockSetNativeLanguage,
      },
    ];

    it.each(cases)(
      'returns 403 for auto-resolved owner on $name',
      async ({ path, init, serviceMock }) => {
        const res = await app.request(
          path,
          {
            ...init,
            headers: {
              ...AUTH_HEADERS,
              'Content-Type': 'application/json',
              ...(init?.headers ?? {}),
            },
          },
          { ...TEST_ENV, API_ORIGIN: 'https://api.test' },
        );

        expect(res.status).toBe(403);
        expect(serviceMock).not.toHaveBeenCalled();
      },
    );
  });
});

// ---------------------------------------------------------------------------
// [WI-173 / DS-084] Proxy-mode write guard — 8 write handlers in settings.ts
// ---------------------------------------------------------------------------
describe('[WI-173 / DS-084] settings proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('account' as never, { id: 'test-account-id' });
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', settingsRoutes);
    return proxyApp;
  }

  beforeEach(() => jest.clearAllMocks());

  it('PUT /settings/notifications returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/settings/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewReminders: true,
        dailyReminders: true,
        pushEnabled: true,
      }),
    });
    expect(res.status).toBe(403);
  });

  it('PUT /settings/celebration-level returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/settings/celebration-level', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ celebrationLevel: 'all' }),
    });
    expect(res.status).toBe(403);
  });

  it('PUT /settings/withdrawal-archive returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/settings/withdrawal-archive', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'auto' }),
    });
    expect(res.status).toBe(403);
  });

  it('PUT /settings/family-pool-breakdown-sharing returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(
      '/settings/family-pool-breakdown-sharing',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: true }),
      },
    );
    expect(res.status).toBe(403);
  });

  it('POST /settings/push-token returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request('/settings/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'ExponentPushToken[xxxxxxxxxx]' }),
    });
    expect(res.status).toBe(403);
  });

  it('POST /settings/notify-parent-subscribe returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(
      '/settings/notify-parent-subscribe',
      { method: 'POST' },
    );
    expect(res.status).toBe(403);
  });

  it('PUT /settings/subjects/:subjectId/analogy-domain returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/settings/subjects/${SUBJECT_ID}/analogy-domain`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analogyDomain: 'sports' }),
      },
    );
    expect(res.status).toBe(403);
  });

  it('PUT /settings/subjects/:subjectId/native-language returns 403 in proxy mode', async () => {
    const res = await makeProxyApp().request(
      `/settings/subjects/${SUBJECT_ID}/native-language`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nativeLanguage: 'en' }),
      },
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// [CR LOW defense-in-depth] Child celebration routes must require the owner
// gate, not just the family-link check inside the service. The GET branch has
// no proxy guard, so assertOwnerProfile is the only protection there. This
// asserts a non-owner profile is rejected (403) from both child branches,
// matching the pattern used by consent / learner-profile / onboarding.
// ---------------------------------------------------------------------------
describe('[CR LOW] child celebration routes require owner gate', () => {
  function asNonOwnerProfile() {
    // [WI-867] Post-collapse: isOwner comes from getPersonScope meta, not legacy profile row.
    mockGetPersonScope.mockResolvedValue({
      profileId: 'profile-1',
      meta: {
        birthYear: 2014,
        location: 'EU',
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: false,
      },
    });
  }

  it('GET /settings/celebration-level?childProfileId returns 403 for a non-owner', async () => {
    asNonOwnerProfile();

    const res = await app.request(
      `/v1/settings/celebration-level?childProfileId=${CHILD_PROFILE_ID}`,
      { headers: PROFILE_HEADERS },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });

  it('PUT /settings/celebration-level with childProfileId returns 403 for a non-owner', async () => {
    asNonOwnerProfile();

    const res = await app.request(
      '/v1/settings/celebration-level',
      {
        method: 'PUT',
        headers: { ...PROFILE_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childProfileId: CHILD_PROFILE_ID,
          celebrationLevel: 'all',
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(403);
  });
});
