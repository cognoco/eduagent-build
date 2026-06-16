import { inArray } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
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
  // identity graph is person/organization/login/membership; resolve the
  // affected persons via `login` (which carries the same email/clerkUserId
  // keys) and delete the graph. `person`-rooted FK cascades remove login,
  // membership, guardianship, and quota/subscription children; organizations
  // are removed explicitly via the membership edge.
  if (isIdentityV2Enabled()) {
    const personIds = new Set<string>();
    const orgIds = new Set<string>();

    if (input.emails && input.emails.length > 0) {
      const rows = await db.query.login.findMany({
        where: inArray(login.email, input.emails),
        columns: { personId: true },
      });
      rows.forEach((row) => personIds.add(row.personId));
    }
    if (input.clerkUserIds && input.clerkUserIds.length > 0) {
      const rows = await db.query.login.findMany({
        where: inArray(login.clerkUserId, input.clerkUserIds),
        columns: { personId: true },
      });
      rows.forEach((row) => personIds.add(row.personId));
    }

    if (personIds.size === 0) {
      return;
    }

    // Collect the organizations these persons belong to so we can remove the
    // org containers after the person-rooted cascade clears the memberships.
    const membershipRows = await db.query.membership.findMany({
      where: inArray(membership.personId, [...personIds]),
      columns: { organizationId: true },
    });
    membershipRows.forEach((row) => orgIds.add(row.organizationId));

    await db.delete(person).where(inArray(person.id, [...personIds]));
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
