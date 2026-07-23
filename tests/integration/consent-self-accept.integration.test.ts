/**
 * Integration: WI-2547 — authenticated adult self-consent ACCEPTANCE.
 *
 * `repairOrSignalAdultSelfConsentV2` case (c) deliberately writes NOTHING and
 * signals `needsAdultConsent` when it finds no versioned terms fact to derive
 * from. POST /v1/consent/self/accept is the user-reachable write that closes
 * that loop: the adult performs a real consent event and the server records one
 * `art6_1_a` grant per granular purpose with a versioned acceptance audit fact.
 *
 * The contract takes NO caller-supplied identifiers — person, organization,
 * lawful basis and policy version are all server-derived — so these cases pin
 * both the happy path and the fail-closed matrix:
 *   - success + EXACT audit version, both granular purposes;
 *   - idempotent replay and concurrent submit (no duplicate rows);
 *   - already-consented adult (existing grants never duplicated or weakened);
 *   - re-consent after a withdrawal (the actual point of the flow);
 *   - minor / non-owner / cross-organization / spoofed X-Profile-Id → no write.
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
} from './route-fixtures';
import {
  acceptAdultSelfConsentV2,
  AdultSelfConsentNotEligibleError,
} from '../../apps/api/src/services/identity-v2/consent-v2';

import { app } from '../../apps/api/src/index';

const TEST_POLICY_VERSION = '2026-07-23-wi2547';
const TEST_ENV = buildIntegrationEnv({
  CONSENT_POLICY_VERSION: TEST_POLICY_VERSION,
});

const ADULT_USER = {
  userId: 'integration-self-accept-adult',
  email: 'integration-self-accept@integration.test',
};
const MINOR_USER = {
  userId: 'integration-self-accept-minor',
  email: 'integration-self-accept-minor@integration.test',
};
const OTHER_ORG_USER = {
  userId: 'integration-self-accept-otherorg',
  email: 'integration-self-accept-otherorg@integration.test',
};

const ALL_EMAILS = [ADULT_USER.email, MINOR_USER.email, OTHER_ORG_USER.email];
const ALL_USER_IDS = [
  ADULT_USER.userId,
  MINOR_USER.userId,
  OTHER_ORG_USER.userId,
];

/** Every art6_1_a grant this person holds, newest first. */
async function art6Grants(personId: string) {
  const db = createIntegrationDb();
  return db.query.consentGrant.findMany({
    where: and(
      eq(consentGrant.chargePersonId, personId),
      eq(consentGrant.lawfulBasis, 'art6_1_a'),
    ),
    orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
  });
}

async function art6GrantsForPurpose(personId: string, purpose: string) {
  return (await art6Grants(personId)).filter((g) => g.purpose === purpose);
}

/**
 * Drop the signup-written grants so the owner looks like the legacy adult the
 * bootstrap signals `needsAdultConsent` for — the population this route serves.
 */
async function clearArt6Grants(personId: string): Promise<void> {
  const db = createIntegrationDb();
  await db
    .delete(consentGrant)
    .where(
      and(
        eq(consentGrant.chargePersonId, personId),
        eq(consentGrant.lawfulBasis, 'art6_1_a'),
      ),
    );
}

function acceptRequest(headers: Record<string, string>) {
  return app.request(
    '/v1/consent/self/accept',
    { method: 'POST', headers },
    TEST_ENV,
  );
}

async function createLegacyAdultOwner() {
  const owner = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: ADULT_USER,
    displayName: 'Adult Owner',
    birthYear: 1990,
  });
  await clearArt6Grants(owner.id);
  return owner;
}

describe('Integration: POST /v1/consent/self/accept (WI-2547)', () => {
  beforeEach(async () => {
    await cleanupAccounts({ emails: ALL_EMAILS, clerkUserIds: ALL_USER_IDS });
  });

  afterAll(async () => {
    await cleanupAccounts({ emails: ALL_EMAILS, clerkUserIds: ALL_USER_IDS });
  });

  it('[AC1/AC2] records both granular purposes with the EXACT server policy version', async () => {
    const owner = await createLegacyAdultOwner();
    expect(await art6Grants(owner.id)).toHaveLength(0);

    const res = await acceptRequest(
      buildAuthHeaders(
        { sub: ADULT_USER.userId, email: ADULT_USER.email },
        owner.id,
      ),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      purposesGranted: string[];
      termsVersion: string;
    };
    expect(body.purposesGranted.sort()).toEqual([
      'llm_disclosure',
      'platform_use',
    ]);
    // Server binding, never a caller-supplied value.
    expect(body.termsVersion).toBe(TEST_POLICY_VERSION);

    const grants = await art6Grants(owner.id);
    expect(grants).toHaveLength(2);
    for (const grant of grants) {
      expect(grant.granted).toBe(true);
      expect(grant.withdrawnAt).toBeNull();
      expect(grant.organizationId).toBe(owner.accountId);
      const fact = grant.auditFact as Record<string, unknown>;
      // The versioned acceptance fact — exact version, distinct provenance.
      expect(fact['termsVersion']).toBe(TEST_POLICY_VERSION);
      expect(fact['source']).toBe('adult_self_acceptance');
      expect(typeof fact['termsAcceptedAt']).toBe('string');
    }
  });

  // The population this route exists for. repairOrSignalAdultSelfConsentV2 case
  // (a) writes CONSENT_PURPOSES[0] ONLY, but its own `already_present` guard
  // matches on (chargePersonId, lawfulBasis) with NO purpose predicate. Reusing
  // that guard here would read "already present" off the repaired platform_use
  // row and silently never grant llm_disclosure. Acceptance is per purpose, so
  // the missing purpose is filled and the repaired one is left alone.
  it('[AC2] grants the MISSING purpose for an adult repaired into platform_use only', async () => {
    const owner = await createLegacyAdultOwner();

    // Reproduce the repair outcome: one live platform_use grant, no llm_disclosure.
    const db = createIntegrationDb();
    const repairedAt = new Date('2026-01-01T00:00:00.000Z');
    await db.insert(consentGrant).values({
      chargePersonId: owner.id,
      organizationId: owner.accountId,
      purpose: 'platform_use',
      lawfulBasis: 'art6_1_a',
      granted: true,
      grantedAt: repairedAt,
      auditFact: {
        source: 'adult_self_consent_repair',
        termsAcceptedAt: repairedAt.toISOString(),
        termsVersion: 'legacy-version',
      },
    });
    expect(await art6GrantsForPurpose(owner.id, 'llm_disclosure')).toHaveLength(
      0,
    );

    const res = await acceptRequest(
      buildAuthHeaders(
        { sub: ADULT_USER.userId, email: ADULT_USER.email },
        owner.id,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { purposesGranted: string[] };
    // ONLY the missing purpose is written.
    expect(body.purposesGranted).toEqual(['llm_disclosure']);

    const llm = await art6GrantsForPurpose(owner.id, 'llm_disclosure');
    expect(llm).toHaveLength(1);
    expect(llm[0]?.granted).toBe(true);
    expect((llm[0]?.auditFact as Record<string, unknown>)['termsVersion']).toBe(
      TEST_POLICY_VERSION,
    );

    // The repaired platform_use grant keeps its original provenance and version.
    const platform = await art6GrantsForPurpose(owner.id, 'platform_use');
    expect(platform).toHaveLength(1);
    const platformFact = platform[0]?.auditFact as Record<string, unknown>;
    expect(platformFact['source']).toBe('adult_self_consent_repair');
    expect(platformFact['termsVersion']).toBe('legacy-version');
  });

  it('[AC2] is idempotent under replay — a second accept writes nothing new', async () => {
    const owner = await createLegacyAdultOwner();
    const headers = buildAuthHeaders(
      { sub: ADULT_USER.userId, email: ADULT_USER.email },
      owner.id,
    );

    const first = await acceptRequest(headers);
    expect(first.status).toBe(200);
    const firstGrants = await art6Grants(owner.id);
    expect(firstGrants).toHaveLength(2);

    const second = await acceptRequest(headers);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { purposesGranted: string[] };
    // Nothing was written the second time, but the call still succeeds.
    expect(secondBody.purposesGranted).toEqual([]);

    const afterGrants = await art6Grants(owner.id);
    expect(afterGrants).toHaveLength(2);
    // The original rows are untouched — not re-stamped, not superseded.
    expect(afterGrants.map((g) => g.id).sort()).toEqual(
      firstGrants.map((g) => g.id).sort(),
    );
  });

  it('[AC2] concurrent submits produce exactly one grant per purpose', async () => {
    const owner = await createLegacyAdultOwner();
    const headers = buildAuthHeaders(
      { sub: ADULT_USER.userId, email: ADULT_USER.email },
      owner.id,
    );

    const [a, b] = await Promise.all([
      acceptRequest(headers),
      acceptRequest(headers),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    // The advisory lock serialises the two transactions: the loser observes the
    // winner's rows and skips, so no purpose is double-granted.
    expect(await art6GrantsForPurpose(owner.id, 'platform_use')).toHaveLength(
      1,
    );
    expect(await art6GrantsForPurpose(owner.id, 'llm_disclosure')).toHaveLength(
      1,
    );
  });

  it('[AC2] an already-consented adult keeps their existing grants — not duplicated, not weakened', async () => {
    // Signup already wrote both grants; do NOT clear them.
    const owner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: ADULT_USER,
      displayName: 'Adult Owner',
      birthYear: 1990,
    });
    const before = await art6Grants(owner.id);
    expect(before.length).toBeGreaterThan(0);

    const res = await acceptRequest(
      buildAuthHeaders(
        { sub: ADULT_USER.userId, email: ADULT_USER.email },
        owner.id,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { purposesGranted: string[] };
    expect(body.purposesGranted).toEqual([]);

    const after = await art6Grants(owner.id);
    expect(after.map((g) => g.id).sort()).toEqual(
      before.map((g) => g.id).sort(),
    );
    for (const grant of after) {
      expect(grant.granted).toBe(true);
      expect(grant.withdrawnAt).toBeNull();
    }
  });

  it('[AC2] re-consents a WITHDRAWN purpose while leaving the live sibling untouched', async () => {
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

    const withdrawn = await app.request(
      '/v1/consent/self/withdraw',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ purpose: 'llm_disclosure' }),
      },
      TEST_ENV,
    );
    expect(withdrawn.status).toBe(200);

    const platformBefore = await art6GrantsForPurpose(owner.id, 'platform_use');
    expect(platformBefore).toHaveLength(1);

    const res = await acceptRequest(headers);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { purposesGranted: string[] };
    // Only the withdrawn purpose is re-granted.
    expect(body.purposesGranted).toEqual(['llm_disclosure']);

    const llmAfter = await art6GrantsForPurpose(owner.id, 'llm_disclosure');
    const live = llmAfter.filter((g) => g.granted && g.withdrawnAt === null);
    expect(live).toHaveLength(1);
    expect(
      (live[0]?.auditFact as Record<string, unknown>)['termsVersion'],
    ).toBe(TEST_POLICY_VERSION);

    // The live sibling was never re-written.
    const platformAfter = await art6GrantsForPurpose(owner.id, 'platform_use');
    expect(platformAfter.map((g) => g.id)).toEqual(
      platformBefore.map((g) => g.id),
    );
  });

  it('[AC2] a MINOR owner is refused with no write', async () => {
    const minorOwner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: MINOR_USER,
      displayName: 'Minor Owner',
      birthYear: new Date().getUTCFullYear() - 13,
    });
    await clearArt6Grants(minorOwner.id);

    const res = await acceptRequest(
      buildAuthHeaders(
        { sub: MINOR_USER.userId, email: MINOR_USER.email },
        minorOwner.id,
      ),
    );
    expect(res.status).toBe(403);
    expect(await art6Grants(minorOwner.id)).toHaveLength(0);
  });

  // A managed member holds no Login, so the non-owner and unknown-person
  // branches are not reachable over HTTP. Assert them against the service the
  // route delegates to — the same gate, exercised directly.
  describe('eligibility gate (service-level — no login exists for these shapes)', () => {
    it('[AC2] an ADULT NON-OWNER (learner membership only) is refused with no write', async () => {
      const owner = await createLegacyAdultOwner();
      // Adult birth year isolates the OWNERSHIP failure from the age failure.
      const member = await seedDirectChildProfileForTest({
        parentProfileId: owner.id,
        accountId: owner.accountId,
        displayName: 'Adult Non-Owner',
        birthYear: 1992,
      });

      await expect(
        acceptAdultSelfConsentV2(
          createIntegrationDb(),
          member.id,
          owner.accountId,
          TEST_POLICY_VERSION,
        ),
      ).rejects.toBeInstanceOf(AdultSelfConsentNotEligibleError);
      expect(await art6Grants(member.id)).toHaveLength(0);
    });

    it('[AC2] an UNKNOWN person id is refused with no write', async () => {
      const owner = await createLegacyAdultOwner();
      const unknownPersonId = '00000000-0000-7000-8000-00000000dead';

      await expect(
        acceptAdultSelfConsentV2(
          createIntegrationDb(),
          unknownPersonId,
          owner.accountId,
          TEST_POLICY_VERSION,
        ),
      ).rejects.toBeInstanceOf(AdultSelfConsentNotEligibleError);
      expect(await art6Grants(unknownPersonId)).toHaveLength(0);
    });

    it('[AC2] an adult owner of ANOTHER organization is refused for this organization', async () => {
      const owner = await createLegacyAdultOwner();
      const otherOrgOwner = await createProfileViaRoute({
        app,
        env: TEST_ENV,
        user: OTHER_ORG_USER,
        displayName: 'Other Org Owner',
        birthYear: 1988,
      });
      await clearArt6Grants(otherOrgOwner.id);
      expect(otherOrgOwner.accountId).not.toBe(owner.accountId);

      // Real adult owner, wrong organization → no membership row there.
      await expect(
        acceptAdultSelfConsentV2(
          createIntegrationDb(),
          otherOrgOwner.id,
          owner.accountId,
          TEST_POLICY_VERSION,
        ),
      ).rejects.toBeInstanceOf(AdultSelfConsentNotEligibleError);
      expect(await art6Grants(otherOrgOwner.id)).toHaveLength(0);
      expect(await art6Grants(owner.id)).toHaveLength(0);
    });
  });

  it('[AC2] a same-org spoofed X-Profile-Id FAILS CLOSED — 403, and neither caller nor target is written', async () => {
    const owner = await createLegacyAdultOwner();
    const child = await seedDirectChildProfileForTest({
      parentProfileId: owner.id,
      accountId: owner.accountId,
      displayName: 'Managed Child',
      birthYear: 2014,
    });
    expect(await art6Grants(child.id)).toHaveLength(0);

    // Owner's JWT, but X-Profile-Id presents as the managed child.
    const res = await acceptRequest(
      buildAuthHeaders(
        { sub: ADULT_USER.userId, email: ADULT_USER.email },
        child.id,
      ),
    );

    // Binding to callerPersonId alone would make this a harmless 200 against
    // the caller's own record. AC2 requires it to fail CLOSED instead:
    // recording consent while presenting as someone else is an authorization
    // failure, not a silently rewritten request.
    expect(res.status).toBe(403);
    // The spoof target gains nothing...
    expect(await art6Grants(child.id)).toHaveLength(0);
    // ...and neither does the caller — no write happened at all.
    expect(await art6Grants(owner.id)).toHaveLength(0);
  });

  it('[AC2] accepts with NO X-Profile-Id header (the auto-resolved owner path)', async () => {
    const owner = await createLegacyAdultOwner();

    // No header at all — the normal client shape.
    const res = await acceptRequest(
      buildAuthHeaders({ sub: ADULT_USER.userId, email: ADULT_USER.email }),
    );
    expect(res.status).toBe(200);
    expect(await art6Grants(owner.id)).toHaveLength(2);
  });

  it('[AC2] an X-Profile-Id naming ANOTHER organization never writes into that org', async () => {
    const owner = await createLegacyAdultOwner();
    const otherOrgOwner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: OTHER_ORG_USER,
      displayName: 'Other Org Owner',
      birthYear: 1988,
    });
    await clearArt6Grants(otherOrgOwner.id);
    expect(otherOrgOwner.accountId).not.toBe(owner.accountId);

    // The other-org login presents a profile belonging to a DIFFERENT org.
    const res = await acceptRequest(
      buildAuthHeaders(
        { sub: OTHER_ORG_USER.userId, email: OTHER_ORG_USER.email },
        owner.id,
      ),
    );

    // Fail closed, unconditionally — same disposition as the same-org spoof, so
    // the response cannot distinguish "profile exists in another org" from
    // "profile does not exist" (no cross-account enumeration).
    expect(res.status).toBe(403);
    // Nothing written anywhere: not the foreign target...
    expect(await art6Grants(owner.id)).toHaveLength(0);
    // ...and not the caller's own record either.
    expect(await art6Grants(otherOrgOwner.id)).toHaveLength(0);
  });
});
