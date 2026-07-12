/**
 * Integration: WI-787 round 2 — credentialed-charge suppression at the HTTP
 * boundary (parent-addressed operate/manage surfaces).
 *
 * Canon: a credentialed charge (Person with a Login row) suppresses guardian
 * operate/manage/view — domain-model.md §4, MMT-ADR-0008 (`op(G, C) ⇐ … ∧
 * (C has no Login)`), ontology.md inv 23. Operator ruling OPQ-32:
 * blocked-by-default. consent-authority is the ruled exception and is NOT
 * org- or Login-gated (ADR-0008:24).
 *
 * Round-1 fixed the central resolver (verifyPersonOwnershipV2). These cases
 * pin the three production bypass surfaces the Gate-1 lens proved route
 * around it:
 *   1. DELETE /v1/learner-profile/:profileId/all — route passes
 *      accountId=undefined so the service guard self-skips
 *      (learner-profile.ts:1126).
 *   2. POST /v1/learner-profile/:profileId/tell — parseLearnerInput →
 *      applyAnalysis writes learning_profiles with no charge-side guard
 *      (learner-input.ts:186).
 *   3. PUT /v1/settings/celebration-level (child branch) —
 *      upsertChildCelebrationLevel guards via parent edge only
 *      (settings.ts:326).
 *
 * Red-green-revert: at the round-1 head these three deny-cases FAIL (the
 * writes succeed); they pass once every parent-addressed surface routes
 * through the credentialed-charge check; reverting the fix turns them red
 * again. The two pin-cases (consent revoke stays allowed; uncredentialed
 * child stays writable) must be green BEFORE and AFTER the fix — they fence
 * the fix from over-blocking.
 *
 * Seeding follows learner-profile-child-consent.integration.test.ts: parent
 * via route, child direct (bypasses sub-tier limit), family link + consent
 * via fixtures. "Credentialed" = a `login` row bound to the child Person —
 * the Login row IS the canonical signal (not person.has_own_account).
 * Cleanup rides cleanupAccounts (login.person_id is ON DELETE CASCADE).
 */

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  resolveAccountId,
  seedDirectChildProfileForTest,
  seedFamilyLinkForTest,
  setProfileConsentStatusForTest,
} from './route-fixtures';
import { login } from '@eduagent/database';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const PARENT_USER = {
  userId: 'integration-wi787r2-parent-user',
  email: 'integration-wi787r2-parent@integration.test',
};

/** Creates a child profile row directly in the DB (bypasses sub-tier limit). */
async function createChildProfileDirect(
  parentProfileId: string,
  displayName: string,
  birthYear: number,
): Promise<string> {
  const db = createIntegrationDb();
  const accountId = await resolveAccountId(db, parentProfileId);
  if (!accountId)
    throw new Error(`Parent profile ${parentProfileId} not found`);
  const child = await seedDirectChildProfileForTest({
    parentProfileId,
    accountId,
    displayName,
    birthYear,
  });
  return child.id;
}

/**
 * Credential the child: bind a Login row to their Person. Post-cutover the
 * profile id IS the person id, so childProfileId is the login.person_id.
 */
async function credentialChild(childProfileId: string): Promise<void> {
  const db = createIntegrationDb();
  await db.insert(login).values({
    personId: childProfileId,
    clerkUserId: `integration-wi787r2-child-${childProfileId}`,
    email: `wi787r2-child-${childProfileId}@integration.test`,
  });
}

async function seedConsentedChild(
  parentProfileId: string,
  displayName: string,
  opts: { credentialed: boolean },
): Promise<string> {
  const childProfileId = await createChildProfileDirect(
    parentProfileId,
    displayName,
    2012,
  );
  await seedFamilyLinkForTest({ parentProfileId, childProfileId });
  const db = createIntegrationDb();
  const accountId = await resolveAccountId(db, childProfileId);
  if (!accountId) throw new Error(`Child profile ${childProfileId} not found`);
  await setProfileConsentStatusForTest({
    profileId: childProfileId,
    accountId,
    status: 'CONSENTED',
    parentEmail: PARENT_USER.email,
  });
  if (opts.credentialed) {
    await credentialChild(childProfileId);
  }
  return childProfileId;
}

async function createParent(): Promise<string> {
  const parentProfile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: PARENT_USER,
    displayName: 'WI787r2 Parent',
    birthYear: 1985,
  });
  return parentProfile.id;
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: [PARENT_USER.email],
    clerkUserIds: [PARENT_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [PARENT_USER.email],
    clerkUserIds: [PARENT_USER.userId],
  });
});

describe('Integration: WI-787 — guardian writes to credentialed charge are 403 at the HTTP boundary', () => {
  it('DELETE /v1/learner-profile/:childId/all on a credentialed child → 403', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Credentialed Teen A', {
      credentialed: true,
    });

    const res = await app.request(
      `/v1/learner-profile/${childId}/all`,
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN');
  });

  it('POST /v1/learner-profile/:childId/tell on a credentialed child → 403', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Credentialed Teen B', {
      credentialed: true,
    });

    const res = await app.request(
      `/v1/learner-profile/${childId}/tell`,
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
        body: JSON.stringify({ text: 'Prefers worked examples over drills.' }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN');
  });

  it('PUT /v1/settings/celebration-level (child branch) on a credentialed child → 403', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Credentialed Teen C', {
      credentialed: true,
    });

    const res = await app.request(
      '/v1/settings/celebration-level',
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
        body: JSON.stringify({
          celebrationLevel: 'big_only',
          childProfileId: childId,
        }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN');
  });

  // ---------------------------------------------------------------------
  // Round-3 additions (Gate-2 lens): targeted single-charge operate/manage/
  // view surfaces on /profiles/:id and family removal that still bypassed
  // the leaf guards. (Aggregate-enumeration surfaces — dashboard root,
  // weekly/monthly digest fan-out — are tracked as a follow-up WI, not here.)
  // Also asserts the FORBIDDEN envelope, not just status (lens MATERIAL).
  // ---------------------------------------------------------------------

  it('GET /v1/profiles/:childId on a credentialed child → 403 FORBIDDEN', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Credentialed Teen F', {
      credentialed: true,
    });

    const res = await app.request(
      `/v1/profiles/${childId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN');
  });

  it('PATCH /v1/profiles/:childId on a credentialed child → 403 FORBIDDEN', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Credentialed Teen G', {
      credentialed: true,
    });

    const res = await app.request(
      `/v1/profiles/${childId}`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
        body: JSON.stringify({ displayName: 'Renamed By Guardian' }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN');
  });

  it('PATCH /v1/profiles/:childId/app-context on a credentialed child → 403 FORBIDDEN', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Credentialed Teen H', {
      credentialed: true,
    });

    const res = await app.request(
      `/v1/profiles/${childId}/app-context`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
        body: JSON.stringify({ defaultAppContext: 'study' }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN');
  });

  it('POST /v1/subscription/family/remove of a credentialed child → 403 FORBIDDEN', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Credentialed Teen I', {
      credentialed: true,
    });

    const res = await app.request(
      '/v1/subscription/family/remove',
      {
        method: 'POST',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
        body: JSON.stringify({ profileId: childId }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN');
  });

  // ---------------------------------------------------------------------
  // Pins — must be green before AND after the fix. They fence the
  // suppression from over-blocking.
  // ---------------------------------------------------------------------

  it('PIN: GET /v1/profiles/:parentId (own profile) stays allowed', async () => {
    const parentId = await createParent();
    // credential a child too, to prove the guard is target-scoped, not global
    await seedConsentedChild(parentId, 'Credentialed Teen J', {
      credentialed: true,
    });

    const res = await app.request(
      `/v1/profiles/${parentId}`,
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
  });

  it('PIN: PATCH /v1/profiles/:childId on an UNcredentialed child stays allowed', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Ordinary Child K', {
      credentialed: false,
    });

    const res = await app.request(
      `/v1/profiles/${childId}`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
        body: JSON.stringify({ displayName: 'Renamed Ordinary' }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
  });

  it('PIN: PUT /v1/consent/:childId/revoke on a credentialed child stays allowed (consent-authority exception)', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Credentialed Teen D', {
      credentialed: true,
    });

    const res = await app.request(
      `/v1/consent/${childId}/revoke`,
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
  });

  it('PIN: DELETE /v1/learner-profile/:childId/all on an UNcredentialed child stays allowed', async () => {
    const parentId = await createParent();
    const childId = await seedConsentedChild(parentId, 'Ordinary Child E', {
      credentialed: false,
    });

    const res = await app.request(
      `/v1/learner-profile/${childId}/all`,
      {
        method: 'DELETE',
        headers: buildAuthHeaders(
          { sub: PARENT_USER.userId, email: PARENT_USER.email },
          parentId,
        ),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
  });
});
