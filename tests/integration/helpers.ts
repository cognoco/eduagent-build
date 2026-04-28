import { inArray } from 'drizzle-orm';
import { accounts, createDatabase } from '@eduagent/database';

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
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local before running real integration tests.'
    );
  }
  return url;
}

export function buildIntegrationEnv(
  overrides: IntegrationEnvOverrides = {}
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
