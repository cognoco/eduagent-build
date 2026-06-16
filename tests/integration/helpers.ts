import { inArray } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  guardianship,
  login,
  membership,
  organization,
  person,
} from '@eduagent/database';

function isIdentityV2Enabled(): boolean {
  return process.env.IDENTITY_V2_ENABLED === 'true';
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
    // guardianship FK to person is onDelete RESTRICT — remove edges first.
    await db
      .delete(guardianship)
      .where(inArray(guardianship.guardianPersonId, personIdList));
    await db
      .delete(guardianship)
      .where(inArray(guardianship.chargePersonId, personIdList));
    await db.delete(person).where(inArray(person.id, personIdList));
    if (orgIds.size > 0) {
      await db
        .delete(organization)
        .where(inArray(organization.id, [...orgIds]));
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
