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
      updateProfileAppContext: jest.fn(),
    };
  },
);

// gc1-allow: unit-route isolation; real service covered by profile-v2.integration.test.ts
// [WI-867] getProfileV2 and updateProfileV2 added — route now uses v2 reads/writes post-collapse.
jest.mock('../services/identity-v2/profile-v2', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/profile-v2',
  ) as typeof import('../services/identity-v2/profile-v2');
  return {
    ...actual,
    listProfilesV2: jest.fn(),
    getOwnerProfileV2: jest.fn(),
    getProfileV2: jest.fn(),
    updateProfileV2: jest.fn(),
    // [WI-867] POST /v1/profiles/switch uses getPersonScope post-collapse (no-op switchProfile).
    getPersonScope: jest.fn(),
  };
});

// GC1 Pattern A: requireActual + targeted override (real orchestrator covered by
// child-profile-v2.integration.test.ts; route tests only stub createChildProfileV2).
jest.mock('../services/identity-v2/child-profile-v2', () => {
  // gc1-allow: unit-route isolation; real orchestrator covered by child-profile-v2.integration.test.ts
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
  // gc1-allow: unit-route isolation; real graph bootstrap covered by identity-graph integration tests
  const actual = jest.requireActual(
    '../services/identity-v2/identity-graph',
  ) as typeof import('../services/identity-v2/identity-graph');
  return {
    ...actual,
    createIdentityGraph: jest.fn(),
  };
});

// [WI-1302] POST /v1/profiles/switch's owner-elevation gate now derives
// "is the caller already the owner" from callerPersonId via
// verifyPersonIsOrgAdminV2, which runs a raw membership db.select() the
// `{}` mock DB these route tests inject cannot satisfy. The
// caller-identity-vs-X-Profile-Id-spoof distinction this guard exists to
// enforce is covered by the real-DB break test in
// tests/integration/profile-switch-elevation-idor.integration.test.ts.
jest.mock('../services/identity-v2/ownership-v2', () => {
  const actual = jest.requireActual(
    '../services/identity-v2/ownership-v2',
  ) as typeof import('../services/identity-v2/ownership-v2');
  return {
    ...actual,
    verifyPersonIsOrgAdminV2: jest.fn(),
  };
});

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '@eduagent/database';
import { ERROR_CODES, ForbiddenError } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import {
  updateProfileAppContext,
  ProfileLimitError,
  ProfileValidationError,
} from '../services/profile';
import {
  listProfilesV2,
  getOwnerProfileV2,
  getProfileV2,
  updateProfileV2,
  getPersonScope,
} from '../services/identity-v2/profile-v2';
import { createChildProfileV2 } from '../services/identity-v2/child-profile-v2';
import { createIdentityGraph } from '../services/identity-v2/identity-graph';
import { verifyPersonIsOrgAdminV2 } from '../services/identity-v2/ownership-v2';
import { ConflictError } from '../errors';
import { profileRoutes } from './profiles';

// ---------------------------------------------------------------------------
// Canonical UUIDs for test data
// ---------------------------------------------------------------------------

const ACCOUNT_ID = 'a0000000-0000-4000-a000-000000000001';
const PROFILE_ID_A = 'a0000000-0000-4000-a000-000000000010';
const PROFILE_ID_B = 'a0000000-0000-4000-a000-000000000011';
// [WI-1302] Default authenticated-caller person id — distinct from the
// PROFILE_ID_* targets, since callerPersonId is the CALLER's own identity,
// never the profile being acted on.
const CALLER_PERSON_ID = 'a0000000-0000-4000-a000-000000000099';

// ---------------------------------------------------------------------------
// Test app factory — bypasses auth, injects known account + db
// ---------------------------------------------------------------------------

import type { ProfileMeta } from '../middleware/profile-scope';

type TestEnv = {
  Bindings: { DATABASE_URL: string; OWNER_ELEVATION_GATE_ENABLED?: string };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
    // [WI-1302] The authenticated caller's own person id — server-resolved in
    // production by accountMiddleware, injected directly here for route
    // isolation.
    callerPersonId: string | undefined;
  };
};

function makeApp(overrides?: {
  accountId?: string;
  isOwner?: boolean;
  profileMeta?: ProfileMeta | null;
  profileId?: string;
  user?: AuthUser & { factorVerificationAge?: [number, number] };
  callerPersonId?: string | null;
}) {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.set('db', {} as Database);
    c.set(
      'user',
      overrides?.user ?? {
        userId: 'user_test',
        email: 'test@example.com',
        emailVerified: true,
      },
    );
    c.set('account', {
      id: overrides?.accountId ?? ACCOUNT_ID,
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Account);
    c.set('profileId', overrides?.profileId);
    c.set(
      'callerPersonId',
      overrides?.callerPersonId === null
        ? undefined
        : (overrides?.callerPersonId ?? CALLER_PERSON_ID),
    );
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
            // [Issue 901] Default to the explicit-header path — the real mobile
            // client ALWAYS sends X-Profile-Id (api-client.ts:209), so every
            // legitimate request resolves via 'explicit-header'. Break tests
            // pass an explicit profileMeta with resolvedVia:'auto' to exercise
            // the headerless auto-resolve attack.
            resolvedVia: 'explicit-header',
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

const updateProfileAppContextMock = jest.mocked(updateProfileAppContext);
const listProfilesV2Mock = jest.mocked(listProfilesV2);
const getOwnerProfileV2Mock = jest.mocked(getOwnerProfileV2);
// [WI-867] Route now uses v2 reads/writes for GET/PATCH /v1/profiles/:id post-collapse.
const getProfileV2Mock = jest.mocked(getProfileV2);
const updateProfileV2Mock = jest.mocked(updateProfileV2);
// [WI-867] POST /v1/profiles/switch uses getPersonScope (ownership check) post-collapse.
const getPersonScopeMock = jest.mocked(getPersonScope);
const createChildProfileV2Mock = jest.mocked(createChildProfileV2);
const createIdentityGraphMock = jest.mocked(createIdentityGraph);
// [WI-1302] POST /v1/profiles/switch's owner-elevation gate consults this to
// determine whether the CALLER (not the X-Profile-Id-resolved profile) is
// already the owner.
const verifyPersonIsOrgAdminV2Mock = jest.mocked(verifyPersonIsOrgAdminV2);

beforeEach(() => {
  jest.clearAllMocks();
  // [WI-1302] Default: the caller is the account owner (mirrors the prior
  // default isOwner:true happy-path convention below). Non-owner-caller break
  // tests override to false per-case.
  verifyPersonIsOrgAdminV2Mock.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// GET /v1/profiles
// ---------------------------------------------------------------------------

describe('GET /v1/profiles', () => {
  it('returns 200 with the profile list for the authenticated account', async () => {
    const profile = makeProfileRow({ id: PROFILE_ID_A });
    // [WI-867] Post-collapse: route always calls listProfilesV2 (no flag branch).
    listProfilesV2Mock.mockResolvedValue([profile]);

    const res = await makeApp().request('/v1/profiles');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profiles: [{ id: PROFILE_ID_A }] });
    expect(listProfilesV2Mock).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
    );
  });

  it('returns 200 with empty array when the account has no profiles', async () => {
    // [WI-867] Post-collapse: route always calls listProfilesV2.
    listProfilesV2Mock.mockResolvedValue([]);

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
  });

  it('propagates service errors to 500', async () => {
    // [WI-867] Post-collapse: route calls listProfilesV2 — error from v2 fn bubbles to 500.
    listProfilesV2Mock.mockRejectedValue(new Error('DB timeout'));

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
  });

  // [WI-867] CUT: legacy listProfiles path dropped — route always calls listProfilesV2 post-collapse.

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
  // [WI-867] Post-collapse: POST /v1/profiles with account present uses the v2
  // post-graph path. Non-child creates are idempotent replays of the owner bootstrap
  // (getOwnerProfileV2 → 201 if owner exists, 409 if not). Child creates go through
  // createChildProfileV2. Legacy createProfileWithLimitCheck is no longer called.

  it('returns 201 with the owner profile on idempotent replay (owner already exists)', async () => {
    const profile = makeProfileRow({
      id: PROFILE_ID_A,
      displayName: 'Alex',
      isOwner: true,
    });
    getOwnerProfileV2Mock.mockResolvedValue(profile);

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

  it('returns 409 when account exists but has no owner (broken graph)', async () => {
    // [WI-867] CUT: "first profile creation" (assertProfileCreationAllowed + createProfileWithLimitCheck)
    // no longer reachable when account is present. Route returns 409 when getOwnerProfileV2 → null.
    getOwnerProfileV2Mock.mockResolvedValue(null);

    const res = await makeApp({ profileMeta: null }).request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'First Owner',
        birthYear: 2000,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.CONFLICT });
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(getOwnerProfileV2Mock).not.toHaveBeenCalled();
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
    expect(getOwnerProfileV2Mock).not.toHaveBeenCalled();
  });

  it('returns 400 when birthMonth is provided without birthDay', async () => {
    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Alex',
        birthYear: 2000,
        birthMonth: 5,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(400);
    expect(getOwnerProfileV2Mock).not.toHaveBeenCalled();
  });

  it('returns 400 when birthMonth and birthDay do not form a calendar date', async () => {
    const res = await makeApp().request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Alex',
        birthYear: 2000,
        birthMonth: 2,
        birthDay: 31,
        location: 'EU',
      }),
    });

    expect(res.status).toBe(400);
    expect(getOwnerProfileV2Mock).not.toHaveBeenCalled();
  });

  // [WI-867] CUT: 402 (ProfileLimitError) and 400 (ProfileValidationError) from
  // createProfileWithLimitCheck no longer reachable for non-child owner-replay path.
  // Coverage moves to createChildProfileV2 error paths (tested in [WI-811] block below).

  // [WI-867] CUT: 500 from createProfileWithLimitCheck no longer reachable in
  // non-child owner-replay path. Covered by integration tests.

  // [WI-867] CUT: assertProfileCreationAllowed gates no longer called in v2 path.
  // WI-811 tests below cover the v2 child-create authorization.
  it('[WI-811] returns 403 when a non-owner attempts a non-child POST (owner-only gate)', async () => {
    getOwnerProfileV2Mock.mockResolvedValue(null);

    const res = await makeApp({ isOwner: false }).request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Alex',
        birthYear: 2000,
        location: 'EU',
        kind: 'child',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    expect(createChildProfileV2Mock).not.toHaveBeenCalled();
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

  // [BREAK / Issue 901] An auto-resolved owner (no X-Profile-Id header) is
  // isOwner:true, so it passes the isOwner check — but profileScopeMiddleware
  // synthesized that identity for a HEADERLESS caller (a child on the account,
  // or anyone holding the account JWT). Before the explicit-header requirement,
  // such a caller could omit X-Profile-Id and add a child. The add-child gate
  // must reject resolvedVia:'auto' even though isOwner is true and an owner
  // exists. Red-green: drop the resolvedVia clause in profiles.ts → flips to 201.
  it('[BREAK][Issue 901] returns 403 when an auto-resolved owner (no X-Profile-Id) adds a child (flag-on)', async () => {
    getOwnerProfileV2Mock.mockResolvedValue(
      makeProfileRow({ id: PROFILE_ID_A, isOwner: true }),
    );

    const res = await makeApp({
      profileMeta: {
        isOwner: true,
        birthYear: 1990,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'auto',
      } as ProfileMeta,
    }).request(
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
  // [WI-867] Post-collapse: route uses getProfileV2 (not legacy getProfile).
  it('returns 200 with the profile when it belongs to this account', async () => {
    getProfileV2Mock.mockResolvedValue(makeProfileRow({ id: PROFILE_ID_A }));

    const res = await makeApp().request(`/v1/profiles/${PROFILE_ID_A}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profile: { id: PROFILE_ID_A } });
    expect(getProfileV2Mock).toHaveBeenCalledWith(
      expect.anything(),
      PROFILE_ID_A,
      ACCOUNT_ID,
    );
  });

  it('returns 404 when the profile does not exist', async () => {
    getProfileV2Mock.mockResolvedValue(null);

    const res = await makeApp().request(`/v1/profiles/${PROFILE_ID_A}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it('returns 404 when a different account tries to access this profile (ownership enforced at service layer)', async () => {
    // getProfileV2 is called with (db, profileId, accountId) — returns null
    // when the accountId does not own the profile, which the route maps to 404.
    getProfileV2Mock.mockResolvedValue(null);

    const res = await makeApp({ accountId: 'other-account-id' }).request(
      `/v1/profiles/${PROFILE_ID_A}`,
    );

    expect(res.status).toBe(404);
    // The service was called with the other account's id — ownership enforced there
    expect(getProfileV2Mock).toHaveBeenCalledWith(
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
  // [WI-867] Post-collapse: route uses updateProfileV2 (not legacy updateProfile).
  it('returns 200 with the updated profile on valid input', async () => {
    const updated = makeProfileRow({
      id: PROFILE_ID_A,
      displayName: 'Updated',
    });
    updateProfileV2Mock.mockResolvedValue(updated);

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
    expect(updateProfileV2Mock).not.toHaveBeenCalled();
  });

  it('returns 404 when the profile does not exist or belongs to another account', async () => {
    updateProfileV2Mock.mockResolvedValue(null);

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
    updateProfileV2Mock.mockRejectedValue(new Error('DB down'));

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
    expect(updateProfileV2Mock).not.toHaveBeenCalled();
  });

  // [BREAK][Issue 901] An auto-resolved owner (no X-Profile-Id header) is
  // isOwner:true but its identity was synthesized for a headerless caller. It
  // must NOT be able to edit a DIFFERENT profile id. The active profileId is the
  // auto-resolved owner (PROFILE_ID_A); the target is PROFILE_ID_B (a sibling),
  // so id !== activeProfileId AND resolvedVia:'auto' → 403. Red-green: drop the
  // resolvedVia clause in profiles.ts → the owner branch passes → 200/404.
  it('[BREAK][Issue 901] returns 403 when an auto-resolved owner (no X-Profile-Id) edits another profile', async () => {
    const appAutoOwner = new Hono<TestEnv>();
    appAutoOwner.use('*', async (c, next) => {
      c.set('db', {} as Database);
      c.set('account', {
        id: ACCOUNT_ID,
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Account);
      // Auto-resolved owner: active profile is the OWNER (PROFILE_ID_A), but
      // resolvedVia:'auto' (no X-Profile-Id header was sent).
      c.set('profileId', PROFILE_ID_A);
      c.set('profileMeta', {
        isOwner: true,
        birthYear: 1990,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'auto',
      } as ProfileMeta);
      await next();
    });
    appAutoOwner.onError((err, c) =>
      c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
    );
    appAutoOwner.route('/v1', profileRoutes);

    // Edit a DIFFERENT profile (PROFILE_ID_B) — must return 403.
    const res = await appAutoOwner.request(`/v1/profiles/${PROFILE_ID_B}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Hacked' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    expect(updateProfileV2Mock).not.toHaveBeenCalled();
  });

  // [CR-2026-05-19-H1] Non-owner self-update must still be allowed.
  // [Issue 901] resolvedVia:'explicit-header' is required — the mobile client
  // always sends X-Profile-Id (api-client.ts:209); an explicit-header non-owner
  // self-editing their own profile is a legitimate operation.
  it('allows a non-owner to update their own profile', async () => {
    const updated = makeProfileRow({ id: PROFILE_ID_A, displayName: 'Self' });
    updateProfileV2Mock.mockResolvedValue(updated);

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
      // Non-owner active profile = PROFILE_ID_A; patching own profile.
      // resolvedVia:'explicit-header' mirrors real mobile client behaviour
      // (X-Profile-Id always sent). Without it the first guard (Issue 901) fires.
      c.set('profileId', PROFILE_ID_A);
      c.set('profileMeta', {
        isOwner: false,
        birthYear: 2008,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'explicit-header',
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
    expect(updateProfileV2Mock).toHaveBeenCalled();
  });

  // [BREAK][Issue 901] Auto-resolved owner self-edit — the closed attack vector.
  // When no X-Profile-Id header is sent, profileScopeMiddleware sets
  // resolvedVia:'auto' and resolves activeProfileId to the owner's profile id.
  // A non-owner who sends PATCH /v1/profiles/{ownerProfileId} with no header
  // gets id === activeProfileId (both the owner id) and would previously pass
  // the old compound gate. The new unconditional resolvedVia guard must fire
  // BEFORE the self-edit exception is evaluated, returning 403 and never calling
  // the update service.
  // Red→green: temporarily revert the resolvedVia guard in the PATCH handler
  // (restore the old single compound `if ((isOwner !== true || resolvedVia !== 'explicit-header') && id !== activeProfileId)`)
  // → this test passes (request goes through) → restore the fix → green.
  it('[BREAK][Issue 901] returns 403 when auto-resolved owner edits own (auto) profileId', async () => {
    const appAutoSelf = new Hono<TestEnv>();
    appAutoSelf.use('*', async (c, next) => {
      c.set('db', {} as Database);
      c.set('account', {
        id: ACCOUNT_ID,
        clerkUserId: 'user_test',
        email: 'test@example.com',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Account);
      // Auto-resolved owner: activeProfileId = PROFILE_ID_A (the owner),
      // resolvedVia:'auto' (no X-Profile-Id header was sent).
      // id (route param) also = PROFILE_ID_A → id === activeProfileId.
      // Under the old guard this bypassed the 403; the new guard must catch it.
      c.set('profileId', PROFILE_ID_A);
      c.set('profileMeta', {
        isOwner: true,
        birthYear: 1990,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'auto',
      } as ProfileMeta);
      await next();
    });
    appAutoSelf.onError((err, c) =>
      c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500),
    );
    appAutoSelf.route('/v1', profileRoutes);

    // PATCH the owner's own profile id (id === activeProfileId) without an
    // explicit header → must be 403 and must NOT call the update service.
    const res = await appAutoSelf.request(`/v1/profiles/${PROFILE_ID_A}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'ShouldBeBlocked' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    // The update service must not be called — the gate fires before the DB write.
    expect(updateProfileV2Mock).not.toHaveBeenCalled();
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
  // [Issue 901] resolvedVia:'explicit-header' is required — mirrors real mobile
  // client behaviour (X-Profile-Id always sent, api-client.ts:209). Without it
  // the unconditional resolvedVia guard fires first and returns 403.
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
        resolvedVia: 'explicit-header',
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
    );
  });
});

// ---------------------------------------------------------------------------
// POST /v1/profiles/switch
// ---------------------------------------------------------------------------

describe('POST /v1/profiles/switch', () => {
  // [WI-867] Post-collapse: switch route uses getPersonScope (v2) for ownership check.
  // Legacy switchProfile is no longer called.
  it('returns 200 on successful switch', async () => {
    getPersonScopeMock.mockResolvedValue({
      profileId: PROFILE_ID_A,
      meta: {
        birthYear: 2000,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
        resolvedVia: 'explicit-header',
      },
    });

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
    // getPersonScope returns null when the profile is not in this account's graph.
    getPersonScopeMock.mockResolvedValue(null);

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
    expect(getPersonScopeMock).not.toHaveBeenCalled();
  });

  it('returns 400 when profileId is not a valid UUID', async () => {
    const res = await makeApp().request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'not-a-uuid' }),
    });

    expect(res.status).toBe(400);
    expect(getPersonScopeMock).not.toHaveBeenCalled();
  });

  it('[BREAK][WI-301] returns 403 OWNER_ELEVATION_REQUIRED when a non-owner switches to owner with stale fva', async () => {
    const ownerSwitchResult = {
      profileId: PROFILE_ID_A,
      meta: {
        birthYear: 2000,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    } as Awaited<ReturnType<typeof getPersonScope>>;
    getPersonScopeMock.mockResolvedValue(ownerSwitchResult);
    // [WI-1302] The caller is genuinely NOT the owner — verified server-side
    // via callerPersonId, not the (spoofable) profileMeta below.
    verifyPersonIsOrgAdminV2Mock.mockResolvedValue(false);

    const res = await makeApp({
      profileId: PROFILE_ID_B,
      profileMeta: {
        isOwner: false,
        birthYear: 2012,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'explicit-header',
      },
      user: {
        userId: 'child_user',
        email: 'child@example.com',
        factorVerificationAge: [120, -1],
      },
    }).request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID_A }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({
      code: 'OWNER_ELEVATION_REQUIRED',
    });
  });

  it('[WI-301] returns 200 when a non-owner switches to owner with fresh fva', async () => {
    const ownerSwitchResult = {
      profileId: PROFILE_ID_A,
      meta: {
        birthYear: 2000,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    } as Awaited<ReturnType<typeof getPersonScope>>;
    getPersonScopeMock.mockResolvedValue(ownerSwitchResult);
    // [WI-1302] Genuinely not the owner — the fresh fva is what carries this
    // request through the gate, not caller identity.
    verifyPersonIsOrgAdminV2Mock.mockResolvedValue(false);

    const res = await makeApp({
      profileId: PROFILE_ID_B,
      profileMeta: {
        isOwner: false,
        birthYear: 2012,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'explicit-header',
      },
      user: {
        userId: 'child_user',
        email: 'child@example.com',
        factorVerificationAge: [1, -1],
      },
    }).request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID_A }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profileId: PROFILE_ID_A });
  });

  it('[WI-1302] allows the real owner (callerPersonId resolves admin) to switch to the owner profile without fresh fva', async () => {
    const ownerSwitchResult = {
      profileId: PROFILE_ID_A,
      meta: {
        birthYear: 2000,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    } as Awaited<ReturnType<typeof getPersonScope>>;
    getPersonScopeMock.mockResolvedValue(ownerSwitchResult);
    // [WI-1302] Authority now comes from callerPersonId resolving as an org
    // admin (mocked here — the real query is covered by the integration
    // break test), not from profileMeta below, which is left isOwner:true /
    // resolvedVia:'explicit-header' only to prove it's no longer load-bearing.
    verifyPersonIsOrgAdminV2Mock.mockResolvedValue(true);

    const res = await makeApp({
      profileId: PROFILE_ID_A,
      profileMeta: {
        isOwner: true,
        birthYear: 1990,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'explicit-header',
      },
      user: {
        userId: 'owner_user',
        email: 'owner@example.com',
        factorVerificationAge: [120, -1],
      },
    }).request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID_A }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profileId: PROFILE_ID_A });
  });

  it('[BREAK][WI-1302] a non-owner spoofing X-Profile-Id=owner (profileMeta.isOwner:true/explicit-header) is still denied without fresh fva', async () => {
    const ownerSwitchResult = {
      profileId: PROFILE_ID_A,
      meta: {
        birthYear: 2000,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    } as Awaited<ReturnType<typeof getPersonScope>>;
    getPersonScopeMock.mockResolvedValue(ownerSwitchResult);
    // [WI-1302] The CALLER is genuinely not an org admin — this is the fact
    // that must gate the request. profileMeta below claims isOwner:true /
    // resolvedVia:'explicit-header' (exactly what a caller gets by sending
    // X-Profile-Id: <owner's id>, which profileScopeMiddleware verifies only
    // belongs to the account, not that it's the caller's own identity). Pre-fix,
    // isExplicitOwnerContext(profileMeta) read that spoofed value and wrongly
    // skipped the elevation gate; the fix ignores it entirely.
    verifyPersonIsOrgAdminV2Mock.mockResolvedValue(false);

    const res = await makeApp({
      profileId: PROFILE_ID_A, // spoofed: X-Profile-Id resolved to the owner
      profileMeta: {
        isOwner: true,
        birthYear: 2012,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'explicit-header',
      },
      user: {
        userId: 'child_user',
        email: 'child@example.com',
        // No fresh fva — the only legitimate bypass is unavailable.
      },
    }).request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID_A }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'OWNER_ELEVATION_REQUIRED' });
  });

  it('[WI-301] allows a non-owner to switch to another non-owner without fva', async () => {
    const childSwitchResult = {
      profileId: PROFILE_ID_B,
      meta: {
        birthYear: 2000,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: false,
      },
    } as Awaited<ReturnType<typeof getPersonScope>>;
    getPersonScopeMock.mockResolvedValue(childSwitchResult);
    // [WI-1302] Genuinely not the owner — irrelevant here since the target
    // isn't the owner either, but kept accurate rather than relying on the
    // beforeEach default.
    verifyPersonIsOrgAdminV2Mock.mockResolvedValue(false);

    const res = await makeApp({
      profileId: PROFILE_ID_A,
      profileMeta: {
        isOwner: false,
        birthYear: 2012,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'explicit-header',
      },
      user: {
        userId: 'child_user',
        email: 'child@example.com',
      },
    }).request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID_B }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profileId: PROFILE_ID_B });
  });

  it('[WI-301] fails closed when a non-owner switches to owner without fva', async () => {
    const ownerSwitchResult = {
      profileId: PROFILE_ID_A,
      meta: {
        birthYear: 2000,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    } as Awaited<ReturnType<typeof getPersonScope>>;
    getPersonScopeMock.mockResolvedValue(ownerSwitchResult);
    // [WI-1302] Genuinely not the owner — no fva, no caller-identity bypass.
    verifyPersonIsOrgAdminV2Mock.mockResolvedValue(false);

    const res = await makeApp({
      profileId: PROFILE_ID_B,
      profileMeta: {
        isOwner: false,
        birthYear: 2012,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'explicit-header',
      },
      user: {
        userId: 'child_user',
        email: 'child@example.com',
      },
    }).request('/v1/profiles/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: PROFILE_ID_A }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({
      code: 'OWNER_ELEVATION_REQUIRED',
    });
  });

  it('[WI-301] bypasses owner elevation when OWNER_ELEVATION_GATE_ENABLED is false', async () => {
    const ownerSwitchResult = {
      profileId: PROFILE_ID_A,
      meta: {
        birthYear: 2000,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        isOwner: true,
      },
    } as Awaited<ReturnType<typeof getPersonScope>>;
    getPersonScopeMock.mockResolvedValue(ownerSwitchResult);

    const res = await makeApp({
      profileId: PROFILE_ID_B,
      profileMeta: {
        isOwner: false,
        birthYear: 2012,
        location: null,
        consentStatus: null,
        hasPremiumLlm: false,
        resolvedVia: 'explicit-header',
      },
      user: {
        userId: 'child_user',
        email: 'child@example.com',
        factorVerificationAge: [120, -1],
      },
    }).request(
      '/v1/profiles/switch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: PROFILE_ID_A }),
      },
      { OWNER_ELEVATION_GATE_ENABLED: 'false' },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ profileId: PROFILE_ID_A });
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
