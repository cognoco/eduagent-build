/**
 * Integration: WI-1193 AC2/AC3 — adult self-consent is independently revocable
 * AND retrievable through user-reachable routes, bound to the authenticated
 * login→person (never the X-Profile-Id-selectable active profile).
 *
 * A self-registered adult owner (18+) holds one `art6_1_a` grant per
 * granular purpose after signup. These cases exercise:
 *   - PUT /v1/consent/self/withdraw — one purpose withdrawn, the other stays live
 *     (AC2 revocability), and the withdrawal binds to callerPersonId so an
 *     in-account member canNOT withdraw ANOTHER profile's adult consent (the
 *     rework-2 IDOR fix).
 *   - GET /v1/consent/self/accountability — the production accountability caller
 *     (AC3): lawful basis + versioned terms-acceptance + accepted purposes in one
 *     report, self-scoped, with the terms fact SURVIVING a withdrawal.
 */

import { and, eq } from 'drizzle-orm';
import { consentGrant } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  seedDirectChildProfileForTest,
  seedFamilyLinkForTest,
} from './route-fixtures';
import { recordAdultSelfConsentV2 } from '../../apps/api/src/services/identity-v2/consent-v2';

import { app } from '../../apps/api/src/index';

const TEST_POLICY_VERSION = '2026-05-31';
const TEST_ENV = buildIntegrationEnv({
  CONSENT_POLICY_VERSION: TEST_POLICY_VERSION,
});
const ADULT_USER = {
  userId: 'integration-self-withdraw-adult',
  email: 'integration-self-withdraw@integration.test',
};

async function selfConsentGrant(personId: string, purpose: string) {
  const db = createIntegrationDb();
  return db.query.consentGrant.findFirst({
    where: and(
      eq(consentGrant.chargePersonId, personId),
      eq(consentGrant.purpose, purpose),
      eq(consentGrant.lawfulBasis, 'art6_1_a'),
    ),
  });
}

describe('Integration: adult self-consent routes (WI-1193 AC2/AC3)', () => {
  beforeEach(async () => {
    await cleanupAccounts({
      emails: [ADULT_USER.email],
      clerkUserIds: [ADULT_USER.userId],
    });
  });

  afterAll(async () => {
    await cleanupAccounts({
      emails: [ADULT_USER.email],
      clerkUserIds: [ADULT_USER.userId],
    });
  });

  it('[AC2] an adult withdraws ONE self-consent purpose through the route; the other stays live', async () => {
    const owner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: ADULT_USER,
      displayName: 'Adult Owner',
      birthYear: 1990,
    });

    // Both granular purposes are granted at signup, neither withdrawn.
    const platformBefore = await selfConsentGrant(owner.id, 'platform_use');
    const llmBefore = await selfConsentGrant(owner.id, 'llm_disclosure');
    expect(platformBefore?.granted).toBe(true);
    expect(platformBefore?.withdrawnAt).toBeNull();
    expect(llmBefore?.granted).toBe(true);
    expect(llmBefore?.withdrawnAt).toBeNull();

    const res = await app.request(
      '/v1/consent/self/withdraw',
      {
        method: 'PUT',
        headers: buildAuthHeaders(
          { sub: ADULT_USER.userId, email: ADULT_USER.email },
          owner.id,
        ),
        body: JSON.stringify({ purpose: 'llm_disclosure' }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);

    // Independent revocation: only llm_disclosure is stamped withdrawn;
    // platform_use is untouched.
    const platformAfter = await selfConsentGrant(owner.id, 'platform_use');
    const llmAfter = await selfConsentGrant(owner.id, 'llm_disclosure');
    expect(llmAfter?.withdrawnAt).not.toBeNull();
    expect(platformAfter?.withdrawnAt).toBeNull();
    expect(platformAfter?.granted).toBe(true);
  });

  // [AC2 authorization — rework-2 IDOR fix] The withdrawal binds to
  // callerPersonId (the login→person accountMiddleware resolves from the JWT),
  // NOT withProfile(c).profileId. The owner selects a DIFFERENT in-account
  // profile via X-Profile-Id and attempts a withdrawal; the target profile's
  // grant must be UNTOUCHED (the caller can only act on their OWN consent).
  //
  // RED (pre-fix): the handler read withProfile(c).profileId = the selected
  // child → withdrew the CHILD's seeded art6_1_a grant.
  // GREEN: it reads callerPersonId = the owner → the child's grant stays live.
  it('[AC2] withdrawal is bound to the caller, NOT the X-Profile-Id target (cross-profile IDOR blocked)', async () => {
    const owner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: ADULT_USER,
      displayName: 'Adult Owner',
      birthYear: 1990,
    });
    // A managed child in the SAME account, selectable by the owner via
    // X-Profile-Id — direct-seed the membership + guardianship edge (the
    // add-child route's owner-gate/limit validation is incidental here).
    const child = await seedDirectChildProfileForTest({
      parentProfileId: owner.id,
      accountId: owner.accountId,
      displayName: 'Managed Child',
      birthYear: 2014,
    });
    await seedFamilyLinkForTest({
      parentProfileId: owner.id,
      childProfileId: child.id,
    });
    // Seed an art6_1_a grant on the CHILD — the attack target. (A
    // child would not normally hold one; seeding it makes the IDOR assertion
    // meaningful: prove the route cannot be tricked into withdrawing it.)
    const db = createIntegrationDb();
    await recordAdultSelfConsentV2(
      db,
      child.id,
      child.accountId,
      'child-seed-version',
    );

    const res = await app.request(
      '/v1/consent/self/withdraw',
      {
        method: 'PUT',
        // Owner's JWT, but X-Profile-Id points at the CHILD.
        headers: buildAuthHeaders(
          { sub: ADULT_USER.userId, email: ADULT_USER.email },
          child.id,
        ),
        body: JSON.stringify({ purpose: 'platform_use' }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);

    // The CHILD's grant must be untouched — the withdrawal acted on the OWNER.
    const childGrant = await selfConsentGrant(child.id, 'platform_use');
    expect(childGrant?.withdrawnAt).toBeNull();
    expect(childGrant?.granted).toBe(true);
    // The caller's OWN grant is the one that was withdrawn.
    const ownerGrant = await selfConsentGrant(owner.id, 'platform_use');
    expect(ownerGrant?.withdrawnAt).not.toBeNull();
  });

  it('[AC3] GET /consent/self/accountability reports lawful basis + versioned terms + purposes, and the terms fact SURVIVES withdrawal', async () => {
    const owner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: ADULT_USER,
      displayName: 'Adult Owner',
      birthYear: 1990,
    });

    const headers = buildAuthHeaders(
      { sub: ADULT_USER.userId, email: ADULT_USER.email },
      owner.id,
    );

    const before = await app.request(
      '/v1/consent/self/accountability',
      { method: 'GET', headers },
      TEST_ENV,
    );
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as {
      records: Array<{
        purpose: string;
        lawfulBasis: string;
        granted: boolean;
        termsAcceptedAt: string;
        termsVersion: string | null;
        withdrawnAt: string | null;
      }>;
    };
    // Both granular purposes, the canonical adult basis, and a NON-null,
    // versioned terms-acceptance fact retrievable in one report.
    const byPurpose = new Map(beforeBody.records.map((r) => [r.purpose, r]));
    expect([...byPurpose.keys()].sort()).toEqual([
      'llm_disclosure',
      'platform_use',
    ]);
    for (const r of beforeBody.records) {
      expect(r.lawfulBasis).toBe('art6_1_a');
      expect(r.granted).toBe(true);
      expect(r.withdrawnAt).toBeNull();
      expect(r.termsVersion).toBe(TEST_POLICY_VERSION);
      expect(typeof r.termsAcceptedAt).toBe('string');
    }

    // Withdraw one purpose, then re-read the report.
    const withdrawRes = await app.request(
      '/v1/consent/self/withdraw',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ purpose: 'llm_disclosure' }),
      },
      TEST_ENV,
    );
    expect(withdrawRes.status).toBe(200);

    const after = await app.request(
      '/v1/consent/self/accountability',
      { method: 'GET', headers },
      TEST_ENV,
    );
    const afterBody = (await after.json()) as typeof beforeBody;
    const afterByPurpose = new Map(
      afterBody.records.map((r) => [r.purpose, r]),
    );
    const llm = afterByPurpose.get('llm_disclosure');
    const platform = afterByPurpose.get('platform_use');
    // The withdrawn purpose is stamped, but its versioned terms-acceptance fact
    // SURVIVES the withdrawal — Art 5(2)/7(1) must still prove consent WAS
    // validly obtained (the audit_fact clobber the merge prevents).
    expect(llm?.withdrawnAt).not.toBeNull();
    expect(llm?.termsVersion).toBe(TEST_POLICY_VERSION);
    // The other purpose stays live.
    expect(platform?.withdrawnAt).toBeNull();
    expect(platform?.granted).toBe(true);
  });

  it('[AC3] the accountability report is self-scoped — X-Profile-Id cannot retrieve another profile record', async () => {
    const owner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: ADULT_USER,
      displayName: 'Adult Owner',
      birthYear: 1990,
    });
    const child = await seedDirectChildProfileForTest({
      parentProfileId: owner.id,
      accountId: owner.accountId,
      displayName: 'Managed Child',
      birthYear: 2014,
    });
    await seedFamilyLinkForTest({
      parentProfileId: owner.id,
      childProfileId: child.id,
    });
    // A distinctly-versioned art6_1_a grant on the child.
    const db = createIntegrationDb();
    await recordAdultSelfConsentV2(
      db,
      child.id,
      child.accountId,
      'child-only-v',
    );

    // Owner's JWT, X-Profile-Id points at the child.
    const res = await app.request(
      '/v1/consent/self/accountability',
      {
        method: 'GET',
        headers: buildAuthHeaders(
          { sub: ADULT_USER.userId, email: ADULT_USER.email },
          child.id,
        ),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      records: Array<{ termsVersion: string | null }>;
    };
    // The report is the OWNER's (callerPersonId), never the selected child's —
    // the child's distinct 'child-only-v' terms version must NOT appear.
    expect(body.records.every((r) => r.termsVersion !== 'child-only-v')).toBe(
      true,
    );
    expect(
      body.records.every((r) => r.termsVersion === TEST_POLICY_VERSION),
    ).toBe(true);
  });
});
