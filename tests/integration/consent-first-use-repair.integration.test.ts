/**
 * Integration: WI-1193 AC1 — first-use adult self-consent REPAIR-or-SIGNAL.
 *
 * An adult account-owner who signed up BEFORE the adult self-consent bootstrap
 * existed holds no `art6_1_a` grant (recordAdultSelfConsentV2 runs only inside
 * the identity-graph bootstrap, which existing adults never re-enter). On the
 * next authenticated session bootstrap (GET /v1/profiles) the server:
 *   (a) repairs from a genuinely captured VERSIONED terms fact → writes the
 *       art6_1_a record with the LEGACY purpose and repair provenance;
 *   (b) leaves a NEW adult (bootstrap already wrote the record) untouched;
 *   (c) with NO versioned fact, writes NOTHING and surfaces `needsAdultConsent`
 *       so the client drives a normal (re-)consent write — a version-less
 *       record is never fabricated (pm-ruling amendment 2026-07-18: the hard
 *       constraint governs).
 */

import { and, eq } from 'drizzle-orm';
import { consentGrant } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders, createProfileViaRoute } from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_POLICY_VERSION = '2026-05-31';
const TEST_ENV = buildIntegrationEnv({
  CONSENT_POLICY_VERSION: TEST_POLICY_VERSION,
});
const ADULT_USER = {
  userId: 'integration-first-use-repair-adult',
  email: 'integration-first-use-repair@integration.test',
};
const AUTH = { sub: ADULT_USER.userId, email: ADULT_USER.email };

async function art6Grant(personId: string) {
  const db = createIntegrationDb();
  return db.query.consentGrant.findFirst({
    where: and(
      eq(consentGrant.chargePersonId, personId),
      eq(consentGrant.lawfulBasis, 'art6_1_a'),
    ),
  });
}

/** Simulate a pre-feature EXISTING adult: strip the bootstrap-written record. */
async function stripArt6Grants(personId: string) {
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

async function getProfiles(profileId: string) {
  const res = await app.request(
    '/v1/profiles',
    { method: 'GET', headers: buildAuthHeaders(AUTH, profileId) },
    TEST_ENV,
  );
  return res;
}

describe('Integration: adult self-consent first-use repair (WI-1193 AC1)', () => {
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

  it('[AC1 case b] a NEW adult owner (bootstrap wrote art6_1_a) → needsAdultConsent false, nothing to repair', async () => {
    const owner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: ADULT_USER,
      displayName: 'New Adult Owner',
      birthYear: 1990,
    });
    // Bootstrap already recorded the adult self-consent grant.
    expect(await art6Grant(owner.id)).toBeTruthy();

    const res = await getProfiles(owner.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needsAdultConsent: boolean };
    expect(body.needsAdultConsent).toBe(false);
  });

  it('[AC1 case c] an EXISTING adult owner with NO captured versioned fact → needsAdultConsent true and NOTHING is written (never fabricate)', async () => {
    const owner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: ADULT_USER,
      displayName: 'Existing Adult No Fact',
      birthYear: 1990,
    });
    // Simulate the pre-feature existing adult: no art6_1_a record, and no other
    // grant carrying a versioned terms fact.
    await stripArt6Grants(owner.id);
    expect(await art6Grant(owner.id)).toBeFalsy();

    const res = await getProfiles(owner.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needsAdultConsent: boolean };
    // The signal fires — client must drive a (re-)consent write.
    expect(body.needsAdultConsent).toBe(true);
    // HARD CONSTRAINT: no consent record was fabricated.
    expect(await art6Grant(owner.id)).toBeFalsy();
  });

  it('[AC1 case a] an EXISTING adult owner WITH a captured versioned terms fact → repair record written (legacy purpose + provenance), needsAdultConsent false', async () => {
    const owner = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: ADULT_USER,
      displayName: 'Existing Adult With Fact',
      birthYear: 1990,
    });
    await stripArt6Grants(owner.id);

    // Seed a prior grant carrying a GENUINELY captured versioned terms fact —
    // the realistic future case (a): e.g. a managed profile that already held a
    // versioned terms fact and now needs its adult self-consent record. Basis is
    // incidental; the repair keys on the versioned audit_fact, not the basis.
    const db = createIntegrationDb();
    await db.insert(consentGrant).values({
      chargePersonId: owner.id,
      organizationId: owner.accountId,
      purpose: 'legacy_prior_purpose',
      lawfulBasis: 'gdpr_parental_consent',
      granted: true,
      grantedAt: new Date(),
      auditFact: {
        source: 'legacy_capture',
        termsAcceptedAt: '2025-01-01T00:00:00.000Z',
        termsVersion: '2025-legacy',
      },
    });

    const res = await getProfiles(owner.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needsAdultConsent: boolean };
    // Repaired — no client re-consent needed.
    expect(body.needsAdultConsent).toBe(false);

    // The repair record: art6_1_a, LEGACY purpose (no retroactive granular
    // purposes), derived from and provenance-marked to the captured fact.
    const repaired = await art6Grant(owner.id);
    expect(repaired).toBeTruthy();
    expect(repaired?.purpose).toBe('platform_use');
    const audit = repaired?.auditFact as Record<string, unknown> | null;
    expect(audit?.['source']).toBe('adult_self_consent_repair');
    expect(audit?.['termsVersion']).toBe('2025-legacy');
    expect(audit?.['termsAcceptedAt']).toBe('2025-01-01T00:00:00.000Z');
    expect(audit?.['repairedFromEventAt']).toBe('2025-01-01T00:00:00.000Z');
  });
});
