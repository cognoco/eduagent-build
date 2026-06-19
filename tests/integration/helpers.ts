import { inArray, sql } from 'drizzle-orm';
import {
  accounts,
  consentGrant,
  consentRequest,
  createDatabase,
  guardianship,
  login,
  membership,
  organization,
  person,
  subscription,
  supportership,
} from '@eduagent/database';

function isIdentityV2Enabled(): boolean {
  return process.env.IDENTITY_V2_ENABLED === 'true';
}

const tableExistsCache = new Map<string, boolean>();

async function tableExists(
  db: ReturnType<typeof createIntegrationDb>,
  table: string,
): Promise<boolean> {
  const cached = tableExistsCache.get(table);
  if (cached !== undefined) return cached;

  const raw = (await db.execute(
    sql`SELECT to_regclass(${`public.${table}`}) AS reg`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ reg: string | null }>)
    : ((raw as { rows?: Array<{ reg: string | null }> }).rows ?? []);
  const exists = rows[0]?.reg != null;
  tableExistsCache.set(table, exists);
  return exists;
}

type IntegrationEnvOverrides = Partial<{
  ENVIRONMENT: string;
  DATABASE_URL: string;
  CLERK_JWKS_URL: string;
  CLERK_AUDIENCE: string;
  APP_URL: string;
  API_ORIGIN: string;
}>;

export const INTEGRATION_TEST_AUDIENCE = 'integration-test-audience';

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local before running real integration tests.',
    );
  }
  return url;
}

export function buildIntegrationEnv(
  overrides: IntegrationEnvOverrides = {},
): Record<string, string> {
  return {
    ENVIRONMENT: 'test',
    DATABASE_URL: requireDatabaseUrl(),
    CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
    // [SEC-1 / BUG-717] verifyClerkJWT hard-fails on undefined audience.
    // signTestJWT() defaults aud to this same value so tokens validate.
    CLERK_AUDIENCE: INTEGRATION_TEST_AUDIENCE,
    APP_URL: 'https://app.mentomate.test',
    API_ORIGIN: 'https://api.integration.test',
    // [WI-586] Routes read the identity-v2 flag from the per-request env
    // (`c.env.IDENTITY_V2_ENABLED`), not process.env. Propagate the process-level
    // flag (set job-level by the flag-ON CI lane) into the request env so the
    // HTTP-route surface exercises the v2 path flag-ON. Mirror the value (do NOT
    // force 'true') so the flag-OFF default lane keeps the legacy path.
    ...(process.env.IDENTITY_V2_ENABLED !== undefined
      ? { IDENTITY_V2_ENABLED: process.env.IDENTITY_V2_ENABLED }
      : {}),
    ...overrides,
  };
}

export function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

export async function cleanupAccounts(input: {
  emails?: string[];
  clerkUserIds?: string[];
}): Promise<void> {
  const db = createIntegrationDb();

  // [WI-586] Flag-ON the close-gate DB is committed-migrations-only (M-DROP
  // applied), so the legacy `accounts` table does not exist. Flag-ON the
  // identity graph is person/organization/login/membership/guardianship.
  // Resolve the seeded owner via `login` (same email/clerkUserId keys), expand
  // to ALL persons in their organizations (children have no login row), then
  // tear the graph down in FK-safe order: guardianship edges (onDelete RESTRICT
  // on person) first, then person (cascades login/membership), then the org.
  if (isIdentityV2Enabled()) {
    const ownerPersonIds = new Set<string>();
    const orgIds = new Set<string>();

    if (input.emails && input.emails.length > 0) {
      const rows = await db.query.login.findMany({
        where: inArray(login.email, input.emails),
        columns: { personId: true },
      });
      rows.forEach((row) => ownerPersonIds.add(row.personId));
    }
    if (input.clerkUserIds && input.clerkUserIds.length > 0) {
      const rows = await db.query.login.findMany({
        where: inArray(login.clerkUserId, input.clerkUserIds),
        columns: { personId: true },
      });
      rows.forEach((row) => ownerPersonIds.add(row.personId));
    }

    if (ownerPersonIds.size === 0) {
      // [WI-808] Even when the v2 login lookup finds nothing, there may be
      // legacy `accounts` rows (direct-insert seeds without a login row). Clean
      // them up so duplicate-key errors don't bleed across tests.
      if (!(await tableExists(db, 'accounts'))) {
        return;
      }
      const legacyIds = new Set<string>();
      if (input.emails && input.emails.length > 0) {
        const rows = await db.query.accounts.findMany({
          where: inArray(accounts.email, input.emails),
        });
        rows.forEach((row) => legacyIds.add(row.id));
      }
      if (input.clerkUserIds && input.clerkUserIds.length > 0) {
        const rows = await db.query.accounts.findMany({
          where: inArray(accounts.clerkUserId, input.clerkUserIds),
        });
        rows.forEach((row) => legacyIds.add(row.id));
      }
      if (legacyIds.size > 0) {
        await db.delete(accounts).where(inArray(accounts.id, [...legacyIds]));
      }
      return;
    }

    // Resolve the orgs the seeded owners belong to.
    const ownerMemberships = await db.query.membership.findMany({
      where: inArray(membership.personId, [...ownerPersonIds]),
      columns: { organizationId: true },
    });
    ownerMemberships.forEach((row) => orgIds.add(row.organizationId));

    // Expand to every person in those orgs (children have no login row).
    const allPersonIds = new Set<string>([...ownerPersonIds]);
    if (orgIds.size > 0) {
      const orgMemberships = await db.query.membership.findMany({
        where: inArray(membership.organizationId, [...orgIds]),
        columns: { personId: true },
      });
      orgMemberships.forEach((row) => allPersonIds.add(row.personId));
    }

    const personIdList = [...allPersonIds];
    const orgIdList = [...orgIds];
    // [WI-586] FK-safe teardown order. The owner-bootstrap (createIdentityGraph)
    // now provisions a subscription (payer_person_id → person, organization_id →
    // organization, both onDelete RESTRICT) plus its cascade children. consent
    // grants and supportership edges are also RESTRICT on person. Every RESTRICT
    // edge into person/organization must be cleared before the person/org delete.
    //
    // Order:
    //   1. guardianship edges (RESTRICT on person, both directions)
    //   2. consent_request   (CASCADE on person/org, but may back-link grant)
    //   3. consent_grant     (RESTRICT on person AND organization)
    //   4. supportership     (RESTRICT on person, both directions)
    //   5. subscription      (RESTRICT on person AND organization; CASCADE its
    //                         own children — quota_pools, profile_quota_usage,
    //                         subscription_payers, top_up_credits, usage_events)
    //   6. person            (CASCADE login, membership)
    //   7. organization
    await db
      .delete(guardianship)
      .where(inArray(guardianship.guardianPersonId, personIdList));
    await db
      .delete(guardianship)
      .where(inArray(guardianship.chargePersonId, personIdList));
    await db
      .delete(consentRequest)
      .where(inArray(consentRequest.chargePersonId, personIdList));
    if (orgIdList.length > 0) {
      await db
        .delete(consentRequest)
        .where(inArray(consentRequest.organizationId, orgIdList));
    }
    await db
      .delete(supportership)
      .where(inArray(supportership.supporterPersonId, personIdList));
    await db
      .delete(supportership)
      .where(inArray(supportership.supporteePersonId, personIdList));
    await db
      .delete(consentGrant)
      .where(inArray(consentGrant.chargePersonId, personIdList));
    if (orgIdList.length > 0) {
      await db
        .delete(consentGrant)
        .where(inArray(consentGrant.organizationId, orgIdList));
      await db
        .delete(subscription)
        .where(inArray(subscription.organizationId, orgIdList));
    }
    await db
      .delete(subscription)
      .where(inArray(subscription.payerPersonId, personIdList));
    await db.delete(person).where(inArray(person.id, personIdList));
    if (orgIdList.length > 0) {
      await db.delete(organization).where(inArray(organization.id, orgIdList));
    }

    // [WI-808] M-DROP has not yet been applied to the committed-migration set —
    // the legacy `accounts` table still exists. Some test seed helpers insert
    // directly into `accounts` (legacy path) without also creating a `login` row,
    // so the v2 lookup above finds nothing and the legacy rows persist across
    // tests, causing duplicate-key failures on re-seed. Always attempt legacy
    // cleanup after the v2 pass so those rows are swept regardless of whether
    // the seed created v2 rows.
    if (await tableExists(db, 'accounts')) {
      const legacyAccountIds = new Set<string>();
      if (input.emails && input.emails.length > 0) {
        const rows = await db.query.accounts.findMany({
          where: inArray(accounts.email, input.emails),
        });
        rows.forEach((row) => legacyAccountIds.add(row.id));
      }
      if (input.clerkUserIds && input.clerkUserIds.length > 0) {
        const rows = await db.query.accounts.findMany({
          where: inArray(accounts.clerkUserId, input.clerkUserIds),
        });
        rows.forEach((row) => legacyAccountIds.add(row.id));
      }
      if (legacyAccountIds.size > 0) {
        await db
          .delete(accounts)
          .where(inArray(accounts.id, [...legacyAccountIds]));
      }
    }
    return;
  }

  const accountIds = new Set<string>();

  if (input.emails && input.emails.length > 0) {
    const rows = await db.query.accounts.findMany({
      where: inArray(accounts.email, input.emails),
    });
    rows.forEach((row) => accountIds.add(row.id));
  }

  if (input.clerkUserIds && input.clerkUserIds.length > 0) {
    const rows = await db.query.accounts.findMany({
      where: inArray(accounts.clerkUserId, input.clerkUserIds),
    });
    rows.forEach((row) => accountIds.add(row.id));
  }

  if (accountIds.size === 0) {
    return;
  }

  await db.delete(accounts).where(inArray(accounts.id, [...accountIds]));
}
