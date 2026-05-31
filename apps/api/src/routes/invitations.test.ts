import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockProfileFindFirst = jest.fn();
const mockFindOrCreateAccount = jest.fn();
const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: {
    query: {
      profiles: {
        findFirst: (...args: unknown[]) => mockProfileFindFirst(...args),
      },
    },
  },
});

jest.mock(
  '@eduagent/database' /* gc1-allow: mounted-route unit test — DB middleware is injected with a controlled mock; service integration covers real DB behavior */,
  () => mockDatabaseModule.module,
);

jest.mock(
  '../services/account' /* gc1-allow: mounted-chain provisioning assertion */,
  () => {
    const actual = jest.requireActual(
      '../services/account',
    ) as typeof import('../services/account');
    return {
      ...actual,
      findOrCreateAccount: (...args: unknown[]) =>
        mockFindOrCreateAccount(...args),
    };
  },
);

jest.mock(
  '../services/invitation' /* gc1-allow: route unit isolation; real DB behavior is covered by invitation.integration.test.ts */,
  () => ({
    createInvitation: jest.fn(),
    acceptInvitation: jest.fn(),
    createClaim: jest.fn(),
    redeemClaim: jest.fn(),
  }),
);

import { Hono } from 'hono';

import type { Database, MembershipRole } from '@eduagent/database';
import { ERROR_CODES, ForbiddenError } from '@eduagent/schemas';

import type { AuthUser } from '../middleware/auth';
import { clearJWKSCache } from '../middleware/jwt';
import type { ProfileMeta } from '../middleware/profile-scope';
import type { Account } from '../services/account';
import { app as fullApp } from '../index';
import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { BASE_AUTH_ENV, makeAuthHeaders } from '../test-utils/test-env';
import {
  acceptInvitation,
  createClaim,
  createInvitation,
  redeemClaim,
} from '../services/invitation';
import { invitationRoutes } from './invitations';

const ACCOUNT_ID = 'a0000000-0000-4000-8000-000000000001';
const PROFILE_ID = 'a0000000-0000-4000-8000-000000000010';
const TARGET_PROFILE_ID = 'a0000000-0000-4000-8000-000000000020';
const INVITATION_ID = 'b0000000-0000-4000-8000-000000000001';
const MEMBERSHIP_ID = 'c0000000-0000-4000-8000-000000000001';
const FULL_CHAIN_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ENVIRONMENT: 'test',
  ...BASE_AUTH_ENV,
  MODE_IDENTITY_V1_ENABLED: 'true',
};

type TestEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account | undefined;
    organizationId: string | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

function makeInvitation(overrides: Partial<{ kind: 'invite' | 'claim' }> = {}) {
  return {
    id: INVITATION_ID,
    organizationId: ACCOUNT_ID,
    kind: overrides.kind ?? 'invite',
    invitedRoles: ['mentor'] as MembershipRole[],
    targetProfileId: overrides.kind === 'claim' ? TARGET_PROFILE_ID : null,
    tokenHash: 'a'.repeat(64),
    emailHint: 'invitee@example.test',
    status: 'pending',
    expiresAt: new Date('2026-06-01T00:00:00.000Z'),
    createdAt: new Date('2026-05-31T00:00:00.000Z'),
    acceptedAt: null,
    acceptedByProfileId: null,
  };
}

function makeApp(
  overrides: {
    isOwner?: boolean;
    profileMeta?: ProfileMeta | null;
    account?: Account | null;
    organizationId?: string | null;
  } = {},
) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', {} as Database);
    c.set('user', {
      userId: 'user_test',
      email: 'test@example.com',
      emailVerified: true,
    });
    c.set(
      'account',
      overrides.account === null
        ? undefined
        : ({
            id: ACCOUNT_ID,
            clerkUserId: 'user_test',
            email: 'test@example.com',
            timezone: null,
            createdAt: '2026-05-31T00:00:00.000Z',
            updatedAt: '2026-05-31T00:00:00.000Z',
          } as Account),
    );
    c.set('profileId', PROFILE_ID);
    c.set(
      'organizationId',
      overrides.organizationId === null
        ? undefined
        : (overrides.organizationId ?? ACCOUNT_ID),
    );
    c.set(
      'profileMeta',
      overrides.profileMeta === null
        ? undefined
        : (overrides.profileMeta ?? {
            birthYear: 1990,
            location: null,
            consentStatus: null,
            hasPremiumLlm: false,
            isOwner: overrides.isOwner ?? true,
          }),
    );
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof ForbiddenError) {
      return c.json({ code: ERROR_CODES.FORBIDDEN, message: err.message }, 403);
    }
    return c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500);
  });
  app.route('/v1', invitationRoutes);
  return app;
}

const createInvitationMock = jest.mocked(createInvitation);
const acceptInvitationMock = jest.mocked(acceptInvitation);
const createClaimMock = jest.mocked(createClaim);
const redeemClaimMock = jest.mocked(redeemClaim);

beforeAll(() => {
  installTestJwksInterceptor();
});

afterAll(() => {
  restoreTestFetch();
});

beforeEach(() => {
  clearJWKSCache();
  jest.clearAllMocks();
  mockProfileFindFirst.mockResolvedValue(undefined);
  mockFindOrCreateAccount.mockResolvedValue({
    id: ACCOUNT_ID,
    clerkUserId: 'user_test',
    email: 'test@example.com',
    timezone: null,
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
  });
});

describe('invitationRoutes', () => {
  it('POST /invitations creates an owner-gated invite and returns the one-time token', async () => {
    createInvitationMock.mockResolvedValue({
      invitation: makeInvitation(),
      rawToken: 'raw-invite-token',
    });

    const res = await makeApp().request('/v1/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invitedRoles: ['mentor'],
        email: 'invitee@example.test',
      }),
    });

    expect(res.status).toBe(201);
    expect(createInvitationMock).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
      ['mentor'],
      { email: 'invitee@example.test' },
    );
    await expect(res.json()).resolves.toMatchObject({
      invitation: { id: INVITATION_ID, kind: 'invite' },
      token: 'raw-invite-token',
    });
  });

  it('POST /invitations rejects non-owner active profiles', async () => {
    const res = await makeApp({ isOwner: false }).request('/v1/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitedRoles: ['mentor'] }),
    });

    expect(res.status).toBe(403);
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it('POST /invitations/accept accepts an invite for the authenticated user', async () => {
    acceptInvitationMock.mockResolvedValue({
      membershipId: MEMBERSHIP_ID,
      organizationId: ACCOUNT_ID,
    });

    const res = await makeApp().request('/v1/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'raw-invite-token' }),
    });

    expect(res.status).toBe(200);
    expect(acceptInvitationMock).toHaveBeenCalledWith(
      expect.anything(),
      'raw-invite-token',
      'user_test',
      'test@example.com',
    );
    await expect(res.json()).resolves.toEqual({
      membershipId: MEMBERSHIP_ID,
      organizationId: ACCOUNT_ID,
    });
  });

  it('POST /invitations/claims creates an owner-gated managed-profile claim', async () => {
    createClaimMock.mockResolvedValue({
      invitation: makeInvitation({ kind: 'claim' }),
      rawToken: 'raw-claim-token',
    });

    const res = await makeApp().request('/v1/invitations/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetProfileId: TARGET_PROFILE_ID,
        email: 'learner@example.test',
      }),
    });

    expect(res.status).toBe(201);
    expect(createClaimMock).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
      TARGET_PROFILE_ID,
      { email: 'learner@example.test' },
    );
    await expect(res.json()).resolves.toMatchObject({
      invitation: { id: INVITATION_ID, kind: 'claim' },
      token: 'raw-claim-token',
    });
  });

  it('POST /invitations/claims rejects non-owner active profiles', async () => {
    const res = await makeApp({ isOwner: false }).request(
      '/v1/invitations/claims',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetProfileId: TARGET_PROFILE_ID }),
      },
    );

    expect(res.status).toBe(403);
    expect(createClaimMock).not.toHaveBeenCalled();
  });

  it('POST /invitations/claims/redeem relies only on the authenticated user id', async () => {
    redeemClaimMock.mockResolvedValue({
      graduatedProfileId: TARGET_PROFILE_ID,
    });

    const res = await makeApp({ account: null, organizationId: null }).request(
      '/v1/invitations/claims/redeem',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'raw-claim-token' }),
      },
    );

    expect(res.status).toBe(200);
    expect(redeemClaimMock).toHaveBeenCalledWith(
      expect.anything(),
      'raw-claim-token',
      'user_test',
    );
    await expect(res.json()).resolves.toEqual({
      graduatedProfileId: TARGET_PROFILE_ID,
    });
  });

  it('[T2][CRITICAL-1] mounted /v1 claim redeem reaches the route without account provisioning', async () => {
    redeemClaimMock.mockResolvedValue({
      graduatedProfileId: TARGET_PROFILE_ID,
    });

    const res = await fullApp.request(
      '/v1/invitations/claims/redeem',
      {
        method: 'POST',
        headers: makeAuthHeaders(),
        body: JSON.stringify({ token: 'raw-claim-token' }),
      },
      FULL_CHAIN_ENV,
    );

    expect(res.status).toBe(200);
    expect(mockFindOrCreateAccount).not.toHaveBeenCalled();
    expect(redeemClaimMock).toHaveBeenCalledWith(
      expect.anything(),
      'raw-claim-token',
      'user_test',
    );
    await expect(res.json()).resolves.toEqual({
      graduatedProfileId: TARGET_PROFILE_ID,
    });
  });

  it('returns 400 for malformed request bodies', async () => {
    const res = await makeApp().request('/v1/invitations/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetProfileId: 'not-a-uuid' }),
    });

    expect(res.status).toBe(400);
    expect(createClaimMock).not.toHaveBeenCalled();
  });
});
