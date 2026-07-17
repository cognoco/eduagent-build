/**
 * Integration: WI-1193 AC2 — an adult self-consent purpose is independently
 * revocable through a user-reachable route.
 *
 * A self-registered adult owner (18+) holds one `adult_self_consent` grant per
 * granular purpose after signup. This exercises the authenticated self-service
 * path PUT /v1/consent/self/withdraw and asserts that withdrawing ONE purpose
 * stamps only that purpose's grant, leaving the other live — the user-shaped
 * check the DoD requires for the AC2 revocability criterion, over and above the
 * service-level withdrawAdultSelfConsentV2 test.
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

const TEST_ENV = buildIntegrationEnv();
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
      eq(consentGrant.lawfulBasis, 'adult_self_consent'),
    ),
  });
}

describe('Integration: PUT /v1/consent/self/withdraw (WI-1193 AC2)', () => {
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

  it('an adult withdraws ONE self-consent purpose through the route; the other stays live', async () => {
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
});
