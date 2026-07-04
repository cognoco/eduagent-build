import { inArray, sql } from 'drizzle-orm';
import {
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

export function isIdentityV2Enabled(): boolean {
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

// [WI-1139] The legacy `accounts` Drizzle table def was removed from
// @eduagent/database (physical DB drop is a separate step, WI-1306/M2a), so
// the accounts-table reads/deletes below use raw parameterized SQL instead
// of a typed `db.query.accounts`/`db.delete(accounts)` call. Same
// tableExists()-gated, self-inerting behavior as before.
function toRowsArray<T>(raw: unknown): T[] {
  return Array.isArray(raw)
    ? (raw as T[])
    : ((raw as { rows?: T[] }).rows ?? []);
}

async function findLegacyAccountIdsByEmail(
  db: ReturnType<typeof createIntegrationDb>,
  emails: string[],
): Promise<string[]> {
  if (emails.length === 0) return [];
  const raw = (await db.execute(
    sql`SELECT id FROM accounts WHERE email IN (${sql.join(
      emails.map((e) => sql`${e}`),
      sql`, `,
    )})`,
  )) as unknown;
  return toRowsArray<{ id: string }>(raw).map((row) => row.id);
}

async function findLegacyAccountIdsByClerkUserId(
  db: ReturnType<typeof createIntegrationDb>,
  clerkUserIds: string[],
): Promise<string[]> {
  if (clerkUserIds.length === 0) return [];
  const raw = (await db.execute(
    sql`SELECT id FROM accounts WHERE clerk_user_id IN (${sql.join(
      clerkUserIds.map((c) => sql`${c}`),
      sql`, `,
    )})`,
  )) as unknown;
  return toRowsArray<{ id: string }>(raw).map((row) => row.id);
}

async function deleteLegacyAccountsByIds(
  db: ReturnType<typeof createIntegrationDb>,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.execute(
    sql`DELETE FROM accounts WHERE id IN (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`,
  );
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

  // [WI-1145] Clean the v2 identity graph UNCONDITIONALLY (was gated on
  // isIdentityV2Enabled()). Post-WI-867 collapse the create route writes v2
  // (login/person/membership/organization) regardless of the flag, so a flag-gated
  // teardown left v2 rows behind on the post-collapse flag-off main lane and the
  // next create 409'd on the login.clerk_user_id / organization unique keys. This
  // pass resolves the seeded owner via `login` (same email/clerkUserId keys),
  // expands to ALL persons in their orgs (children have no login row), tears the
  // graph down in FK-safe order (guardianship → consent → subscription → person →
  // org), and also sweeps legacy `accounts` (tableExists-guarded). It no-ops when
  // the login lookup finds nothing (pre-collapse flag-off seeds only legacy), so it
  // is safe across every flag/DB state.
  {
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
        (await findLegacyAccountIdsByEmail(db, input.emails)).forEach((id) =>
          legacyIds.add(id),
        );
      }
      if (input.clerkUserIds && input.clerkUserIds.length > 0) {
        (
          await findLegacyAccountIdsByClerkUserId(db, input.clerkUserIds)
        ).forEach((id) => legacyIds.add(id));
      }
      await deleteLegacyAccountsByIds(db, [...legacyIds]);
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
        (await findLegacyAccountIdsByEmail(db, input.emails)).forEach((id) =>
          legacyAccountIds.add(id),
        );
      }
      if (input.clerkUserIds && input.clerkUserIds.length > 0) {
        (
          await findLegacyAccountIdsByClerkUserId(db, input.clerkUserIds)
        ).forEach((id) => legacyAccountIds.add(id));
      }
      await deleteLegacyAccountsByIds(db, [...legacyAccountIds]);
    }
    return;
  }
}
