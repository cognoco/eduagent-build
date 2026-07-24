/**
 * Integration: WI-2547 — authenticated adult self-consent ACCEPTANCE.
 *
 * `repairOrSignalAdultSelfConsentV2` case (c) deliberately writes NOTHING and
 * signals `needsAdultConsent` when it finds no versioned terms fact to derive
 * from. POST /v1/consent/self/accept is the user-reachable write that closes
 * that loop: the adult performs a real consent event and the server records one
 * `art6_1_a` grant per granular purpose with a versioned acceptance audit fact.
 *
 * The contract takes NO caller-supplied identifiers — the write subject is
 * always callerPersonId (the login→person binding), and organization, lawful
 * basis and policy version are server-derived too. `X-Profile-Id` is NOT an
 * input to the write: the route treats it purely as an anti-spoof consistency
 * check, rejecting a header that is not the caller.
 *
 * Transport note: the shared mobile API client normally carries profile
 * context, and useAdultSelfConsent pins that context to the loaded OWNER
 * identity, so the production request carries a header EQUAL to the caller.
 * Omitting the header is also valid against the server contract, but it is not
 * the mobile path. A header naming anyone else is an attacker/tamper shape.
 *
 * These cases pin both the happy paths and the fail-closed matrix:
 *   - success + EXACT audit version, both granular purposes;
 *   - header-equals-caller (the pinned production path) and no-header;
 *   - idempotent replay and concurrent submit (no duplicate rows);
 *   - already-consented adult (existing grants never duplicated or weakened);
 *   - re-consent after a withdrawal (the actual point of the flow);
 *   - minor / non-owner / cross-organization / mismatched X-Profile-Id → no write.
 */

import { and, eq, sql } from 'drizzle-orm';
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
  repairOrSignalAdultSelfConsentV2,
  adultSelfConsentLockKey,
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

  // [WI-2547] MIXED-WRITER concurrency: the two writers that can create an
  // art6_1_a grant must serialise against EACH OTHER, not just against
  // themselves.
  //
  // POST /consent/self/accept is an authenticated public contract — the mobile
  // gate is a UI affordance, not an authorization precondition on the route. So
  // an eligible adult can call accept directly at the same moment a GET
  // /profiles bootstrap runs first-use repair case (a). While the two writers
  // used separate advisory-lock namespaces, both transactions could observe no
  // live platform_use grant and each insert one, duplicating a canonical
  // compliance row.
  //
  // Determinism: a barrier connection holds the advisory keys and releases both
  // writers at the same instant. It takes the shared key AND the superseded
  // acceptance-only key, so the release is simultaneous under either
  // implementation — that is what makes this test genuinely red when acceptance
  // is reverted to its own namespace, rather than red only when the scheduler
  // happens to cooperate. Production code carries no test hook; the barrier is
  // just another client taking advisory locks.
  it('[AC2] concurrent first-use REPAIR and ACCEPT leave exactly one live grant per purpose', async () => {
    const owner = await createLegacyAdultOwner();
    const db = createIntegrationDb();

    // Put the owner in repair case (a): no art6_1_a grant, but a genuinely
    // captured VERSIONED terms fact on a prior grant — the only lawful repair
    // source. Without this, repair returns needs_consent and writes nothing,
    // and the race cannot occur.
    const priorAcceptedAt = new Date('2026-01-01T00:00:00.000Z').toISOString();
    await db.insert(consentGrant).values({
      chargePersonId: owner.id,
      organizationId: owner.accountId,
      purpose: 'platform_use',
      lawfulBasis: 'gdpr_parental_consent',
      granted: true,
      grantedAt: new Date('2026-01-01T00:00:00.000Z'),
      auditFact: {
        source: 'legacy_signup',
        termsAcceptedAt: priorAcceptedAt,
        termsVersion: 'legacy-terms-v1',
      },
    });
    expect(await art6Grants(owner.id)).toHaveLength(0);

    // --- barrier: hold every key either implementation may take -------------
    const barrierDb = createIntegrationDb();
    let releaseBarrier!: () => void;
    const barrierHeld = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    // The shared key IS the repair writer's established literal (kept verbatim
    // for rolling-deploy safety), so those two collapse to one entry — hence the
    // Set. The acceptance-only key is the superseded namespace this test's
    // negative control reverts to; the barrier holds it so the release stays
    // simultaneous under that reverted implementation too, which is what keeps
    // the test genuinely red rather than scheduler-dependent.
    const barrierKeys = [
      ...new Set([
        adultSelfConsentLockKey(owner.id), // shared key == deployed repair key
        `adult-consent-accept:${owner.id}:${owner.accountId}`, // negative-control key
      ]),
    ];
    const barrierTx = barrierDb.transaction(async (tx) => {
      for (const key of barrierKeys) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
        );
      }
      await barrierHeld;
    });
    // Let the barrier transaction actually acquire the locks first.
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Both writers start and queue behind the barrier.
    const repairPromise = repairOrSignalAdultSelfConsentV2(
      createIntegrationDb(),
      owner.id,
      owner.accountId,
    );
    const acceptPromise = acceptAdultSelfConsentV2(
      createIntegrationDb(),
      owner.id,
      owner.accountId,
      TEST_POLICY_VERSION,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    releaseBarrier();
    await barrierTx;

    const [repairOutcome, acceptedPurposes] = await Promise.all([
      repairPromise,
      acceptPromise,
    ]);

    // The invariant: exactly one LIVE grant per canonical purpose. No duplicate
    // platform_use row, whichever transaction serialised first.
    const live = (await art6Grants(owner.id)).filter(
      (g) => g.granted && g.withdrawnAt === null,
    );
    const livePlatform = live.filter((g) => g.purpose === 'platform_use');
    const liveLlm = live.filter((g) => g.purpose === 'llm_disclosure');
    expect(livePlatform).toHaveLength(1);
    expect(liveLlm).toHaveLength(1);

    // Outcomes/provenance must agree with whichever transaction won.
    expect(['repaired', 'already_present']).toContain(repairOutcome);
    const platformSource = (
      livePlatform[0]?.auditFact as Record<string, unknown>
    )['source'];
    if (repairOutcome === 'repaired') {
      // Repair went first: it wrote platform_use from the versioned fact, so
      // accept found it live and only had llm_disclosure left to grant.
      expect(platformSource).toBe('adult_self_consent_repair');
      expect(acceptedPurposes).toEqual(['llm_disclosure']);
    } else {
      // Accept went first and wrote both purposes; repair then saw an existing
      // art6_1_a grant and stood down without writing.
      expect(platformSource).toBe('adult_self_acceptance');
      expect(acceptedPurposes.sort()).toEqual([
        'llm_disclosure',
        'platform_use',
      ]);
    }

    // llm_disclosure only ever comes from acceptance — repair never infers it.
    expect((liveLlm[0]?.auditFact as Record<string, unknown>)['source']).toBe(
      'adult_self_acceptance',
    );
  }, 60_000);

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

  // ATTACKER / TAMPER shape — deliberately NOT the mobile client's transport.
  // A legitimate request carries the owner id (pinned by useAdultSelfConsent);
  // a header naming a DIFFERENT in-account profile can only arrive from a
  // tampered or hand-rolled client, and AC2 requires it to fail closed.
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

  // The shape the mobile mutation actually puts on the wire. The shared API
  // client normally carries profile context, and useAdultSelfConsent pins that
  // context to the loaded OWNER identity so a restored managed-child selection
  // cannot poison the request — so a header equal to callerPersonId is the
  // production path, not an edge case.
  it('[AC2] accepts with X-Profile-Id EQUAL to the caller — the pinned production path', async () => {
    const owner = await createLegacyAdultOwner();

    const res = await acceptRequest(
      buildAuthHeaders(
        { sub: ADULT_USER.userId, email: ADULT_USER.email },
        owner.id,
      ),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { purposesGranted: string[] };
    expect(body.purposesGranted.sort()).toEqual([
      'llm_disclosure',
      'platform_use',
    ]);

    // Exactly the caller's canonical two grants — nothing more, nothing less.
    const grants = await art6Grants(owner.id);
    expect(grants).toHaveLength(2);
    expect(grants.map((g) => g.purpose).sort()).toEqual([
      'llm_disclosure',
      'platform_use',
    ]);
    for (const grant of grants) {
      expect(grant.chargePersonId).toBe(owner.id);
      expect(grant.organizationId).toBe(owner.accountId);
      expect(grant.granted).toBe(true);
      expect(grant.withdrawnAt).toBeNull();
    }
  });

  it('[AC2] accepts with NO X-Profile-Id header — a valid direct server-contract path', async () => {
    const owner = await createLegacyAdultOwner();

    // Omitting the header is a legitimate way to call the contract (the server
    // derives everything from callerPersonId), but it is NOT what the mobile
    // client sends — see the pinned production path above.
    const res = await acceptRequest(
      buildAuthHeaders({ sub: ADULT_USER.userId, email: ADULT_USER.email }),
    );
    expect(res.status).toBe(200);
    expect(await art6Grants(owner.id)).toHaveLength(2);
  });

  // ATTACKER / TAMPER shape (cross-organization variant) — as above, this
  // header can only arrive from a tampered client.
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

/**
 * [WI-2547] Literal-continuity guard for the shared advisory-lock key.
 *
 * The key's VALUE is load-bearing, not just its uniqueness: advisory locks only
 * exclude processes that hash the same string, and the first-use repair already
 * takes `adult-consent-repair:<person>` on origin/main. Renaming the literal —
 * however tidy the new name — would leave an old repair worker and a new repair
 * worker on different keys for the length of a rolling deploy, free to bypass
 * each other and duplicate the repair row the lock exists to protect.
 *
 * The mixed-writer regression above CANNOT catch that: its barrier derives its
 * key from this same helper, so a rename moves both sides together and the test
 * stays green. This assertion pins the value itself, and needs no database.
 */
describe('adultSelfConsentLockKey literal continuity [WI-2547]', () => {
  it('returns the already-deployed repair lock literal verbatim', () => {
    const personId = '019f8d28-d977-7ecd-94d9-6e11035ec057';

    expect(adultSelfConsentLockKey(personId)).toBe(
      'adult-consent-repair:019f8d28-d977-7ecd-94d9-6e11035ec057',
    );
  });
});
