import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockProfileFindFirst = jest.fn();

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: {
    query: {
      profiles: {
        findFirst: (...args: unknown[]) => mockProfileFindFirst(...args),
      },
      consentStates: {
        findFirst: jest.fn().mockResolvedValue(undefined),
      },
    },
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('../services/account', () => ({
  // gc1-allow: stubs findOrCreateAccount — avoids real Clerk/DB round-trip in unit tests for settings routes
  findOrCreateAccount: jest.fn().mockResolvedValue({
    id: 'test-account-id',
    clerkUserId: 'user_test',
    email: 'test@example.com',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
}));

const mockGetOwnedFamilyPoolBreakdownSharing = jest.fn();
const mockUpsertFamilyPoolBreakdownSharing = jest.fn();
const mockUpsertLearningMode = jest.fn();

jest.mock('../services/settings', () => {
  // gc1-allow: uses requireActual with targeted overrides for getOwnedFamilyPoolBreakdownSharing/upsertFamilyPoolBreakdownSharing — canonical partial-mock pattern from CLAUDE.md
  const actual = jest.requireActual('../services/settings');
  return {
    ...actual,
    upsertLearningMode: (...args: unknown[]) => mockUpsertLearningMode(...args),
    getOwnedFamilyPoolBreakdownSharing: (...args: unknown[]) =>
      mockGetOwnedFamilyPoolBreakdownSharing(...args),
    upsertFamilyPoolBreakdownSharing: (...args: unknown[]) =>
      mockUpsertFamilyPoolBreakdownSharing(...args),
  };
});

const mockClearSessionStaticContextForProfile = jest.fn();
jest.mock('../services/session/session-cache', () => {
  // gc1-allow: partial mock via requireActual — intercepts clearSessionStaticContextForProfile to verify cache invalidation fires on learning-mode change
  const actual = jest.requireActual('../services/session/session-cache');
  return {
    ...actual,
    clearSessionStaticContextForProfile: (...args: unknown[]) =>
      mockClearSessionStaticContextForProfile(...args),
  };
});

import { app } from '../index';
import { BASE_AUTH_ENV, makeAuthHeaders } from '../test-utils/test-env';
import { ForbiddenError } from '@eduagent/schemas';

const AUTH_HEADERS = makeAuthHeaders();
const PROFILE_HEADERS = { ...AUTH_HEADERS, 'X-Profile-Id': 'profile-1' };
const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ...BASE_AUTH_ENV,
};

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();
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
  mockUpsertLearningMode.mockResolvedValue({ mode: 'serious' });
});

describe('settings routes', () => {
  it('GET /v1/settings/withdrawal-archive returns 403 for non-owner callers (I5)', async () => {
    const nonOwnerProfile = {
      id: 'profile-1',
      accountId: 'test-account-id',
      displayName: 'Alex',
      avatarUrl: null,
      birthYear: 1990,
      location: 'EU',
      isOwner: false,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      pronouns: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      archivedAt: null,
    };
    mockProfileFindFirst
      .mockResolvedValueOnce(nonOwnerProfile)
      .mockResolvedValueOnce(nonOwnerProfile);

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
    expect(mockUpsertFamilyPoolBreakdownSharing).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      'test-account-id',
      true,
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

  it('PUT /v1/settings/learning-mode clears cached session context for the active profile', async () => {
    const res = await app.request(
      '/v1/settings/learning-mode',
      {
        method: 'PUT',
        headers: PROFILE_HEADERS,
        body: JSON.stringify({ mode: 'serious' }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ mode: 'serious' });
    expect(mockUpsertLearningMode).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      'test-account-id',
      'serious',
    );
    expect(mockClearSessionStaticContextForProfile).toHaveBeenCalledWith(
      'profile-1',
    );
  });
});
