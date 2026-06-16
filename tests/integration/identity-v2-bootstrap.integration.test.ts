import { eq, sql } from 'drizzle-orm';
import {
  accounts,
  membership,
  profiles,
  quotaPools,
  subscription,
  subscriptions,
} from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';

import { app } from '../../apps/api/src/index';

const RUN = process.env.IDENTITY_V2_ENABLED === 'true';
const TEST_ENV = buildIntegrationEnv();

const CLERK_ID = 'integration-identity-v2-bootstrap';
const EMAIL = 'integration-identity-v2-bootstrap@integration.test';

async function tableExists(
  db: ReturnType<typeof createIntegrationDb>,
  table: string,
): Promise<boolean> {
  const raw = (await db.execute(
    sql`SELECT to_regclass(${`public.${table}`}) AS reg`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ reg: string | null }>)
    : ((raw as { rows?: Array<{ reg: string | null }> }).rows ?? []);
  return rows[0]?.reg != null;
}

beforeEach(async () => {
  await cleanupAccounts({ emails: [EMAIL], clerkUserIds: [CLERK_ID] });
});

afterAll(async () => {
  await cleanupAccounts({ emails: [EMAIL], clerkUserIds: [CLERK_ID] });
});

(RUN ? describe : describe.skip)('Identity v2 owner bootstrap', () => {
  it('[WI-586] creates a quota-FK-safe graph on the committed migration schema', async () => {
    const res = await app.request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: CLERK_ID, email: EMAIL }),
        body: JSON.stringify({
          displayName: 'Identity V2 Bootstrap',
          birthYear: 2000,
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { profile: { id: string } };
    const personId = body.profile.id;

    const db = createIntegrationDb();
    const member = await db.query.membership.findFirst({
      where: eq(membership.personId, personId),
    });
    expect(member).toBeTruthy();

    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, member!.organizationId),
    });
    expect(sub?.planTier).toBe('plus');
    expect(sub?.status).toBe('trial');

    const quota = await db.query.quotaPools.findFirst({
      where: eq(quotaPools.subscriptionId, sub!.id),
    });
    expect(quota).toBeTruthy();

    if (await tableExists(db, 'accounts')) {
      const legacyAccount = await db.query.accounts.findFirst({
        where: eq(accounts.id, member!.organizationId),
      });
      expect(legacyAccount?.email).toBe(EMAIL);
    }

    if (await tableExists(db, 'profiles')) {
      const legacyProfile = await db.query.profiles.findFirst({
        where: eq(profiles.id, personId),
      });
      expect(legacyProfile?.accountId).toBe(member!.organizationId);
      expect(legacyProfile?.isOwner).toBe(true);
    }

    if (await tableExists(db, 'subscriptions')) {
      const retainedSubscription = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.id, sub!.id),
      });
      expect(retainedSubscription?.accountId).toBe(member!.organizationId);
      expect(retainedSubscription?.tier).toBe('plus');
      expect(retainedSubscription?.status).toBe('trial');
    }
  });
});
