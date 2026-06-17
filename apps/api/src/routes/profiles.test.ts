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
      assertProfileCreationAllowed: jest.fn(),
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
      updateProfileAppContext: jest.fn(),
      switchProfile: jest.fn(),
    };
  },
);

// gc1-allow: unit-route isolation; real service covered by profile-v2.integration.test.ts
jest.mock('../services/identity-v2/profile-v2', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/profile-v2',
  ) as typeof import('../services/identity-v2/profile-v2');
  return {
    ...actual,
    listProfilesV2: jest.fn(),
    getOwnerProfileV2: jest.fn(),
  };
});

// GC1 Pattern A: requireActual + targeted override (real orchestrator covered by
// child-profile-v2.integration.test.ts; route tests only stub createChildProfileV2).
jest.mock('../services/identity-v2/child-profile-v2', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/child-profile-v2',
  ) as typeof import('../services/identity-v2/child-profile-v2');
  return {
    ...actual,
    createChildProfileV2: jest.fn(),
  };
});

// GC1 Pattern A: requireActual + targeted override (real graph bootstrap covered
// by identity-graph integration tests; route tests only observe whether the
// pre-graph branch reaches createIdentityGraph).
jest.mock('../services/identity-v2/identity-graph', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/identity-graph',
  ) as typeof import('../services/identity-v2/identity-graph');
  return {
    ...actual,
    createIdentityGraph: jest.fn(),
  };
});

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '@eduagent/database';
import { ERROR_CODES, ForbiddenError } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  listProfiles,
  createProfileWithLimitCheck,
  assertProfileCreationAllowed,
  getProfile,
  updateProfile,
  updateProfileAppContext,
  switchProfile,
  ProfileLimitError,
  ProfileValidationError,
} from '../services/profile';
import {
  listProfilesV2,
  getOwnerProfileV2,
} from '../services/identity-v2/profile-v2';
import { createChildProfileV2 } from '../services/identity-v2/child-profile-v2';
import { createIdentityGraph } from '../services/identity-v2/identity-graph';
import { ConflictError } from '../errors';
import { profileRoutes } from './profiles';

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
  profileId?: string;
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
    c.set('profileId', overrides?.profileId);
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
const assertProfileCreationAllowedMock = jest.mocked(
  assertProfileCreationAllowed,
);
const getProfileMock = jest.mocked(getProfile);
const updateProfileMock = jest.mocked(updateProfile);
const updateProfileAppContextMock = jest.mocked(updateProfileAppContext);
const switchProfileMock = jest.mocked(switchProfile);
const listProfilesV2Mock = jest.mocked(listProfilesV2);
const getOwnerProfileV2Mock = jest.mocked(getOwnerProfileV2);
const createChildProfileV2Mock = jest.mocked(createChildProfileV2);
const createIdentityGraphMock = jest.mocked(createIdentityGraph);

beforeEach(() => {
  jest.clearAllMocks();
  // Default: authorization passes. Deny-path tests override per-case.
  assertProfileCreationAllowedMock.mockResolvedValue(undefined);
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

  // [CUT-B1] v2 pre-graph: a freshly signed-up user under IDENTITY_V2_ENABLED
  // has no identity graph yet — accountMiddleware sets `clerkIdentity` and leaves
  // `account` unset, and the pre-graph allowlist routes GET /v1/profiles here to
  // return the documented empty list. Without the handler's pre-graph branch,
  // requireAccount() 401s, and the mobile client's 401→sign-out turns onboarding
  // into an unbreakable sign-in loop. Red-green: delete the pre-graph branch in
  // profiles.ts GET /profiles and this flips 200 → 401.
  it('[CUT-B1] returns 200 empty list (not 401) for a graphless v2 owner', async () => {
    type PreGraphEnv = {
      Bindings: { IDENTITY_V2_ENABLED?: string };
      Variables: {
        db: Database;
        account: Account | undefined;
        profileId: string | undefined;
        profileMeta: ProfileMeta | undefined;
        clerkIdentity:
          | { clerkUserId: string; verifiedEmail: string }
          | undefined;
      };
    };
    const app = new Hono<PreGraphEnv>();
    app.use('*', async (c, next) => {
      c.set('db', {} as Database);
      // Graphless: no account set; clerkIdentity present, as accountMiddleware
      // sets it on the v2 pre-graph path.
      c.set('clerkIdentity', {
        clerkUserId: 'user_pre_graph',
        verifiedEmail: 'newuser@example.com',
      });
      c.set('profileId', undefined);
      c.set('profileMeta', undefined);
      await next();
    });
    app.onError((err, c) =>
      err instanceof HTTPException
        ? c.json({ code: 'HTTP_ERROR', message: err.message }, err.status)
        : c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
    );
    app.route('/v1', profileRoutes);

    const res = await app.request(
      '/v1/profiles',
      {},
      { IDENTITY_V2_ENABLED: 'true' },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ profiles: [] });
    // Must short-circuit before the account-scoped service call.
    expect(listProfilesMock).not.toHaveBeenCalled();
  });

  it('propagates service errors to 500', async () => {
    listProfilesMock.mockRejectedValue(new Error('DB timeout'));

    const res = await makeApp().request('/v1/profiles');

    expect(res.status).toBe(500);
  });

  // [CUT-B2] Post-graph v2 read: flag-on + account resolved → the GET dispatches
  // to listProfilesV2(db, account.id) (account.id = organization.id, org-scoped =
  // the IDOR guard), NOT the legacy listProfiles. Red-green: drop the
  // isIdentityV2Enabled branch in profiles.ts GET and this flips to listProfiles.
  it('[CUT-B2] reads v2 via listProfilesV2 when IDENTITY_V2_ENABLED and account is resolved', async () => {
    const profile = makeProfileRow({ id: PROFILE_ID_A });
    listProfilesV2Mock.mockResolvedValue([profile]);

    const res = await makeApp().request(
      '/v1/profiles',
      {},
      { IDENTITY_V2_ENABLED: 'true' },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profiles: [{ id: PROFILE_ID_A }] });
    // v2 read is org-scoped to the caller's resolved account.id (= org id).
    expect(listProfilesV2Mock).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
    );
    // Legacy reader must NOT run on the v2 path.
    expect(listProfilesMock).not.toHaveBeenCalled();
  });

  // [CUT-B2] Flag-off: the legacy listProfiles path stays intact (until WP-FLAG).
  it('[CUT-B2] reads legacy listProfiles when IDENTITY_V2_ENABLED is not set', async () => {
    listProfilesMock.mockResolvedValue([]);

    const res = await makeApp().request('/v1/profiles');

    expect(res.status).toBe(200);
    expect(listProfilesMock).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
    );
    expect(listProfilesV2Mock).not.toHaveBeenCalled();
  });

  // [WI-799] Guardian family list with ≥13 children must serialize to 200, not
  // 500. profileListResponseSchema.parse() enforces the v1 13+ birthYear floor;
  // a sub-13 child row throws → 500. Red-green: change childBirthYear below to
  // currentYear - 12 (sub-13) and this test flips to 500.
  it('[WI-799] returns 200 (not 500) when guardian family list includes ≥13 children (IDENTITY_V2_ENABLED)', async () => {
    const currentYear = new Date().getFullYear();
    const parentProfile = makeProfileRow({ id: PROFILE_ID_A, isOwner: true });
    const childProfile = makeProfileRow({
      id: PROFILE_ID_B,
      isOwner: false,
    });
    // Override birthYear on the child to a year-relative ≥13 value (age 14),
    // matching the CHILD_BIRTH_YEAR constant introduced by WI-799.
    const childProfileWithBirthYear = {
      ...childProfile,
      birthYear: currentYear - 14,
    };
    listProfilesV2Mock.mockResolvedValue([
      parentProfile,
      childProfileWithBirthYear,
    ]);

    const res = await makeApp().request(
      '/v1/profiles',
      {},
      { IDENTITY_V2_ENABLED: 'true' },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles).toHaveLength(2);
    expect(
      body.profiles.find((p: { id: string }) => p.id === PROFILE_ID_B),
    ).toMatchObject({
      id: PROFILE_ID_B,
      birthYear: currentYear - 14,
    });
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
    // [BUG-407] profileMeta absent + count=0 → first-profile path, always
    // allowed. The route delegates that decision to assertProfileCreationAllowed
    // (mocked to resolve by default); the real count logic is covered in
    // services/profile.test.ts.

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
    // Route delegated the authorization decision to the service helper with
    // the (absent) profileMeta it read off the context.
    expect(assertProfileCreationAllowedMock).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
      undefined,
    );
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
        'User must be at least 13',
      ),
    );

    // [WI-570] birthYearSchema rejects ages < 13 at the request boundary
    // (v1 13+ floor). Use a schema-valid birthYear (age 14) and let the
    // mocked service throw ProfileValidationError — this exercises the
    // 400-on-service-throw branch without triggering Zod rejection.
    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Young',
        birthYear: new Date().getFullYear() - 14,
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

  // [CR-2026-05-19-H1] HTTP-translation test — when the service-owned gate
  // (assertProfileCreationAllowed) throws ForbiddenError (non-owner case), the
  // route must return 403 and never call createProfileWithLimitCheck. The
  // allow/deny/fail-closed *decision* logic itself is unit-tested directly
  // against the real helper in services/profile.test.ts.
  it('[CR-2026-05-19-H1] returns 403 when assertProfileCreationAllowed throws ForbiddenError (non-owner)', async () => {
    assertProfileCreationAllowedMock.mockRejectedValue(
      new ForbiddenError(
        'Only the account owner can create additional profiles.',
      ),
    );

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
    // Creation service must not run when the gate rejects.
    expect(createProfileWithLimitCheckMock).not.toHaveBeenCalled();
    // Route passed the active profileMeta straight through to the gate.
    expect(assertProfileCreationAllowedMock).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
      expect.objectContaining({ isOwner: false }),
    );
  });

  // [BUG-407] HTTP-translation test — fail-closed (meta absent + existing
  // profiles) surfaces as a ForbiddenError from the gate, which the route maps
  // to 403. The real DB-count fail-closed logic lives in services/profile.test.ts.
  it('[BUG-407] returns 403 when assertProfileCreationAllowed throws ForbiddenError (fail-closed)', async () => {
    assertProfileCreationAllowedMock.mockRejectedValue(
      new ForbiddenError(
        'Only the account owner can create additional profiles.',
      ),
    );

    const res = await makeApp({ profileMeta: null }).request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Intruder',
        birthYear: 2000,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    expect(createProfileWithLimitCheckMock).not.toHaveBeenCalled();
  });

  // [WI-811 review / Codex P1] Owner-only authorization on the flag-on add-child
  // path. A non-owner caller (e.g. a child on the account, isOwner:false) is
  // rejected with 403 BEFORE the orchestrator runs — fail-closed. Red-green:
  // remove the `profileMeta?.isOwner` gate in profiles.ts and this flips off 403.
  it('[WI-811] returns 403 when a non-owner attempts to add a child (flag-on)', async () => {
    getOwnerProfileV2Mock.mockResolvedValue(
      makeProfileRow({ id: PROFILE_ID_A, isOwner: true }),
    );

    const res = await makeApp({ isOwner: false }).request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Sibling',
          birthYear: 2010,
          location: 'EU',
          kind: 'child',
        }),
      },
      { IDENTITY_V2_ENABLED: 'true' },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    expect(createChildProfileV2Mock).not.toHaveBeenCalled();
  });

  // [WI-811 review / SHOULD_FIX] Route-layer coverage for the new child-create
  // arms: the HTTP translation of each orchestrator outcome (the integration
  // tests cover the orchestrator throwing; these cover the route mapping).
  // createChildProfileV2 is GC1 Pattern A-mocked. birthYear 2010 is schema-valid
  // (≤ currentYear-13) so the body reaches the route logic, not a Zod 400.
  const childBody = JSON.stringify({
    displayName: 'Kid',
    birthYear: 2010,
    location: 'EU',
    kind: 'child',
  });
  const flagOn = { IDENTITY_V2_ENABLED: 'true' } as const;
  const postChild = (overrides?: { isOwner?: boolean }) =>
    makeApp({ isOwner: overrides?.isOwner ?? true }).request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: childBody,
      },
      flagOn,
    );

  it('[WI-811] returns 201 on a successful owner-initiated child create (flag-on)', async () => {
    getOwnerProfileV2Mock.mockResolvedValue(
      makeProfileRow({ id: PROFILE_ID_A, isOwner: true }),
    );
    createChildProfileV2Mock.mockResolvedValue(
      makeProfileRow({ id: PROFILE_ID_B, isOwner: false }),
    );

    const res = await postChild();

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      profile: { id: PROFILE_ID_B, isOwner: false },
    });
    expect(createChildProfileV2Mock).toHaveBeenCalled();
  });

  it('[WI-811] returns 409 when the org has no owner for a child create (flag-on)', async () => {
    getOwnerProfileV2Mock.mockResolvedValue(null);

    const res = await postChild();

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: ERROR_CODES.CONFLICT });
    expect(createChildProfileV2Mock).not.toHaveBeenCalled();
  });

  // [WI-811 fail-closed | ic-117] A graphless (pre-graph) flag-on POST with
  // kind:'child' must fail closed with 409 — it must NOT fall through to
  // createIdentityGraph, which would bootstrap the caller AS the account owner
  // (a silent privilege grant; AC#5 fail-closed). The owner gate lives only in
  // the post-graph branch; the pre-graph branch went straight to the bootstrap.
  // Red-green-revert: delete the `input.kind === 'child'` reject in the POST
  // pre-graph branch of profiles.ts and this flips 409 → 201 (owner bootstrapped)
  // with createIdentityGraph called. createIdentityGraph is GC1 Pattern A-mocked
  // so the break surfaces the 201 owner-bootstrap, not a 500 from the empty test DB.
  it('[WI-811] rejects a graphless kind:child POST with 409 and does not bootstrap an owner (flag-on)', async () => {
    // Stub the graph bootstrap so the broken-guard (RED) path surfaces the 201
    // owner-bootstrap rather than a 500. buildBootstrapProfile reads only
    // personId + account.id off the graph.
    createIdentityGraphMock.mockResolvedValue({
      personId: PROFILE_ID_A,
      account: { id: ACCOUNT_ID },
    } as Awaited<ReturnType<typeof createIdentityGraph>>);

    type PreGraphEnv = {
      Bindings: { IDENTITY_V2_ENABLED?: string };
      Variables: {
        db: Database;
        account: Account | undefined;
        profileId: string | undefined;
        profileMeta: ProfileMeta | undefined;
        clerkIdentity:
          | { clerkUserId: string; verifiedEmail: string }
          | undefined;
      };
    };
    const app = new Hono<PreGraphEnv>();
    app.use('*', async (c, next) => {
      c.set('db', {} as Database);
      // Graphless: no account; clerkIdentity present, as accountMiddleware sets
      // it on the v2 pre-graph path.
      c.set('account', undefined);
      c.set('clerkIdentity', {
        clerkUserId: 'user_pre_graph',
        verifiedEmail: 'newuser@example.com',
      });
      c.set('profileId', undefined);
      c.set('profileMeta', undefined);
      await next();
    });
    app.onError((err, c) =>
      err instanceof HTTPException
        ? c.json({ code: 'HTTP_ERROR', message: err.message }, err.status)
        : c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
    );
    app.route('/v1', profileRoutes);

    const res = await app.request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: childBody,
      },
      flagOn,
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: ERROR_CODES.CONFLICT });
    // The fail-closed guard must short-circuit BEFORE the graph bootstrap.
    expect(createIdentityGraphMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'ForbiddenError',
      () => new ForbiddenError('nope', 'ADULT_OWNER_REQUIRED'),
      403,
      ERROR_CODES.FORBIDDEN,
    ],
    [
      'ProfileLimitError',
      () => new ProfileLimitError(),
      402,
      ERROR_CODES.PROFILE_LIMIT_EXCEEDED,
    ],
    [
      'ConflictError',
      () => new ConflictError('structurally-broken graph'),
      409,
      ERROR_CODES.CONFLICT,
    ],
  ])(
    '[WI-811] maps orchestrator %s to %i (flag-on)',
    async (_name, makeErr, status, code) => {
      getOwnerProfileV2Mock.mockResolvedValue(
        makeProfileRow({ id: PROFILE_ID_A, isOwner: true }),
      );
      createChildProfileV2Mock.mockRejectedValue(makeErr());

      const res = await postChild();

      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ code });
    },
  );

  it('[WI-811] maps orchestrator ProfileValidationError to a 400 validation error (flag-on)', async () => {
    getOwnerProfileV2Mock.mockResolvedValue(
      makeProfileRow({ id: PROFILE_ID_A, isOwner: true }),
    );
    createChildProfileV2Mock.mockRejectedValue(
      new ProfileValidationError(
        'CHILD_AGE_VIOLATION',
        'birthYear',
        'Users must be at least 13 years old to create a profile',
      ),
    );

    const res = await postChild();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
    });
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

  // [BREAK][CR-2026-05-19-H1] Non-owner attempting to edit a SIBLING profile
  // must be rejected with 403. Red-green regression test: revert the isOwner
  // guard in profiles.ts and this test will fail with status 200.
  it('[BREAK][CR-2026-05-19-H1] returns 403 when a non-owner edits a sibling profile', async () => {
    // App: active profile is PROFILE_ID_A (non-owner), attempting PATCH on PROFILE_ID_B
    const appWithNonOwner = new Hono<TestEnv>();
    appWithNonOwner.use('*', async (c, next) => {
      c.set('db', {} as Database);
      c.set('account', {
        id: ACCOUNT_ID,
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Account);
      // Non-owner active profile = PROFILE_ID_A
      c.set('profileId', PROFILE_ID_A);
      c.set('profileMeta', {
        isOwner: false,
        birthYear: 2008,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
      } as ProfileMeta);
      await next();
    });
    appWithNonOwner.onError((err, c) =>
      c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
    );
    appWithNonOwner.route('/v1', profileRoutes);

    // Attempt to PATCH sibling profile PROFILE_ID_B — must return 403
    const res = await appWithNonOwner.request(`/v1/profiles/${PROFILE_ID_B}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Hacked' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    // Service must not be called — gate fires before the DB write.
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  // [CR-2026-05-19-H1] Non-owner self-update must still be allowed.
  it('allows a non-owner to update their own profile', async () => {
    const updated = makeProfileRow({ id: PROFILE_ID_A, displayName: 'Self' });
    updateProfileMock.mockResolvedValue(updated);

    const appSelfUpdate = new Hono<TestEnv>();
    appSelfUpdate.use('*', async (c, next) => {
      c.set('db', {} as Database);
      c.set('account', {
        id: ACCOUNT_ID,
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Account);
      // Non-owner active profile = PROFILE_ID_A; patching own profile
      c.set('profileId', PROFILE_ID_A);
      c.set('profileMeta', {
        isOwner: false,
        birthYear: 2008,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
      } as ProfileMeta);
      await next();
    });
    appSelfUpdate.onError((err, c) =>
      c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
    );
    appSelfUpdate.route('/v1', profileRoutes);

    const res = await appSelfUpdate.request(`/v1/profiles/${PROFILE_ID_A}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Self' }),
    });

    expect(res.status).toBe(200);
    expect(updateProfileMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/profiles/:id/app-context
// ---------------------------------------------------------------------------

describe('PATCH /v1/profiles/:id/app-context', () => {
  it('persists the default app context for a profile', async () => {
    const updated = makeProfileRow({
      id: PROFILE_ID_A,
      displayName: 'Updated',
    });
    updateProfileAppContextMock.mockResolvedValue({
      ...updated,
      defaultAppContext: 'family',
      hasFamilyLinks: true,
    });

    const res = await makeApp().request(
      `/v1/profiles/${PROFILE_ID_A}/app-context`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultAppContext: 'family' }),
      },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      profile: {
        id: PROFILE_ID_A,
        defaultAppContext: 'family',
        hasFamilyLinks: true,
      },
    });
    expect(updateProfileAppContextMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID_A,
      ACCOUNT_ID,
      'family',
      expect.objectContaining({ identityV2Enabled: expect.any(Boolean) }),
    );
  });

  it('rejects an invalid app context value', async () => {
    const res = await makeApp().request(
      `/v1/profiles/${PROFILE_ID_A}/app-context`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultAppContext: 'recaps' }),
      },
    );

    expect(res.status).toBe(400);
    expect(updateProfileAppContextMock).not.toHaveBeenCalled();
  });

  it('[BREAK] returns 403 when family context is not allowed for the target profile', async () => {
    updateProfileAppContextMock.mockRejectedValue(
      new ForbiddenError(
        'Family mode is only available to adult owner profiles with family links.',
      ),
    );

    const res = await makeApp().request(
      `/v1/profiles/${PROFILE_ID_A}/app-context`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultAppContext: 'family' }),
      },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    expect(updateProfileAppContextMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID_A,
      ACCOUNT_ID,
      'family',
      expect.objectContaining({ identityV2Enabled: expect.any(Boolean) }),
    );
  });

  // [CR-2026-05-19-H1] Break test — non-owner active on PROFILE_ID_A must not
  // edit sibling PROFILE_ID_B's app-context. Active profileId is set so the
  // gate's `id !== activeProfileId` clause is exercised against a real sibling
  // identifier, not against `undefined` (which would mask a regression where
  // the gate accidentally allowed self-edits to slip through to siblings).
  it('[BREAK][CR-2026-05-19-H1] returns 403 when a non-owner edits a sibling app context', async () => {
    const appWithNonOwner = makeApp({
      profileId: PROFILE_ID_A,
      profileMeta: {
        isOwner: false,
        birthYear: 2008,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
      } as ProfileMeta,
    });

    const res = await appWithNonOwner.request(
      `/v1/profiles/${PROFILE_ID_B}/app-context`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultAppContext: 'study' }),
      },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    expect(updateProfileAppContextMock).not.toHaveBeenCalled();
  });

  // [CR-2026-05-19-H1] Positive case — a non-owner editing their OWN
  // app-context is permitted (self-update is always allowed; only sibling
  // edits are blocked). Paired with the break test above so the gate's two
  // clauses (isOwner + self-id) are both covered.
  it('[CR-2026-05-19-H1] allows a non-owner to update their own app context', async () => {
    const updated = makeProfileRow({
      id: PROFILE_ID_A,
      displayName: 'Alex',
      isOwner: false,
    });
    updateProfileAppContextMock.mockResolvedValue({
      ...updated,
      defaultAppContext: 'study',
      hasFamilyLinks: false,
    });

    const appSelfUpdate = makeApp({
      profileId: PROFILE_ID_A,
      profileMeta: {
        isOwner: false,
        birthYear: 2008,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
      } as ProfileMeta,
    });

    const res = await appSelfUpdate.request(
      `/v1/profiles/${PROFILE_ID_A}/app-context`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultAppContext: 'study' }),
      },
    );

    expect(res.status).toBe(200);
    expect(updateProfileAppContextMock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID_A,
      ACCOUNT_ID,
      'study',
      expect.objectContaining({ identityV2Enabled: expect.any(Boolean) }),
    );
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
// [CR-353 / BUG-353] Break test: requireAccount() defensive unwrap
//
// Simulates a middleware-ordering regression where accountMiddleware is not
// mounted (or is conditionally skipped) so c.get('account') returns undefined
// at runtime. Without requireAccount(), the first `account.id` access in any
// handler throws TypeError → 500, which is unstructured and hard to diagnose.
//
// With requireAccount() applied to every handler, the response is a structured
// 401 — even when the middleware chain regresses.
//
// Red-green: revert any `requireAccount(c.get('account'))` call in profiles.ts
// back to `c.get('account')` and both tests below flip from 401 → 500.
// ---------------------------------------------------------------------------

describe('[CR-353 / BUG-353] requireAccount defensive unwrap — 401 not 500 on account=undefined', () => {
  /**
   * Mini-app with NO account injected into context — simulates a
   * middleware-ordering regression where accountMiddleware ran but failed
   * to set `account` (e.g. early return, conditional skip, mounting outside
   * the middleware chain).
   */
  function makeAppWithoutAccount() {
    const app = new Hono<TestEnv>();
    app.use('*', async (c, next) => {
      c.set('db', {} as Database);
      // Deliberately omit c.set('account', ...) to simulate the regression.
      c.set('profileId', undefined);
      c.set('profileMeta', undefined);
      await next();
    });
    app.onError((err, c) => {
      // Re-surface HTTPException with its own status so Hono returns the
      // correct 4xx code rather than a generic 500.
      if (err instanceof HTTPException) {
        return c.json({ code: 'HTTP_ERROR', message: err.message }, err.status);
      }
      return c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500);
    });
    app.route('/v1', profileRoutes);
    return app;
  }

  it('[BREAK] GET /v1/profiles returns 401 (not 500 TypeError) when account is undefined', async () => {
    const res = await makeAppWithoutAccount().request('/v1/profiles');
    // Before the fix: c.get('account').id throws TypeError → onError → 500.
    // After the fix: requireAccount(c.get('account')) throws HTTPException(401) → 401.
    expect(res.status).toBe(401);
    const body = await res.json();
    // Must not be an unstructured 500 crash
    expect(body.code).not.toBe('INTERNAL_ERROR');
  });

  it('[BREAK] POST /v1/profiles returns 401 (not 500 TypeError) when account is undefined', async () => {
    const res = await makeAppWithoutAccount().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Test',
        birthYear: 2000,
        location: 'EU',
      }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).not.toBe('INTERNAL_ERROR');
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
    defaultAppContext: null,
    hasFamilyLinks: false,
    conversationLanguage: 'en' as const,
    pronouns: null,
    consentStatus: null,
    linkCreatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
