// ---------------------------------------------------------------------------
// CUT-B1 identity-graph bootstrap — integration tests against the real new
// tables (0108/0109 + M-HOMES applied). Covers the §2.2a transaction, the
// BUG-411 email-reclaim guard (sequential + concurrent), idempotency on
// login.clerk_user_id, and the calendar-validation guard.
//
// Red-green evidence for the BUG-411 cases is recorded in the PR description:
// the sequential guard was demonstrated RED by removing the pre-insert lookup
// (raw login_email_unique 23505 → not the audited ConflictError) and GREEN with
// the guard restored; the concurrent case was demonstrated RED by routing the
// loser's 23505 to a bare rethrow and GREEN with the constraint-discriminating
// catch.
//
// [WI-1398] The bootstrap no longer dual-writes legacy `accounts`/`profiles`/
// `subscriptions` anchors — the 0129 FK re-point moved the retained quota/learning
// satellites onto the v2 graph, so createIdentityGraph writes only the v2 tables.
// The owner `profile_quota_usage` row is now written unconditionally (see the
// unconditional assertion below). The legacy-anchor assertions were retired
// under the preservation gate (docs/_archive/retired-code.md). The cleanup
// helper's best-effort legacy deletes are kept (harmless no-ops tables-absent).
// The pure-unit guards (calendar, jurisdiction) always run.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq, sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  createDatabase,
  generateUUIDv7,
  login,
  membership,
  organization,
  person,
  profileQuotaUsage,
  subscription,
  subscriptionPayers,
  quotaPools,
  type Database,
} from '@eduagent/database';
import { ConflictError } from '../../errors';
import {
  createIdentityGraph,
  buildValidatedBirthDate,
  locationToJurisdiction,
} from './identity-graph';

// Populate process.env.DATABASE_URL from the test env (no-op if already set).
loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

async function tableExists(
  db: Database,
  table: 'accounts' | 'profiles' | 'subscriptions' | 'profile_quota_usage',
): Promise<boolean> {
  const raw = (await db.execute(
    sql`SELECT to_regclass(${`public.${table}`}) AS reg`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ reg: string | null }>)
    : ((raw as { rows?: Array<{ reg: string | null }> }).rows ?? []);
  return rows[0]?.reg != null;
}

// Clean up the rows a graph creates, keyed by clerk user id.
async function cleanupByClerk(
  db: Database,
  clerkUserId: string,
): Promise<void> {
  const loginRow = await db.query.login.findFirst({
    where: eq(login.clerkUserId, clerkUserId),
  });
  if (!loginRow) return;
  const personId = loginRow.personId;
  const memberships = await db.query.membership.findMany({
    where: eq(membership.personId, personId),
  });
  const orgIds = memberships.map((m) => m.organizationId);
  // Children first (FK order): quota_pools → subscription_payers → subscription
  // → membership → login → person → organization.
  for (const orgId of orgIds) {
    const subs = await db.query.subscription.findMany({
      where: eq(subscription.organizationId, orgId),
    });
    for (const sub of subs) {
      if (await tableExists(db, 'profile_quota_usage')) {
        await db
          .delete(profileQuotaUsage)
          .where(eq(profileQuotaUsage.subscriptionId, sub.id));
      }
      await db.delete(quotaPools).where(eq(quotaPools.subscriptionId, sub.id));
      await db
        .delete(subscriptionPayers)
        .where(eq(subscriptionPayers.subscriptionId, sub.id));
    }
    await db.delete(subscription).where(eq(subscription.organizationId, orgId));
    // [WI-1139] Legacy `accounts` Drizzle def removed — raw SQL delete, same
    // tableExists()-gated, self-inerting behavior as before.
    if (await tableExists(db, 'accounts')) {
      await db.execute(sql`DELETE FROM accounts WHERE id = ${orgId}`);
    }
  }
  // [WI-1193] consent_grant.charge_person_id/organization_id are ON DELETE
  // RESTRICT — an adult bootstrap now writes rows here, so they must go before
  // the person/organization deletes below.
  await db
    .delete(consentGrant)
    .where(eq(consentGrant.chargePersonId, personId));
  await db.delete(membership).where(eq(membership.personId, personId));
  await db.delete(login).where(eq(login.clerkUserId, clerkUserId));
  await db.delete(person).where(eq(person.id, personId));
  for (const orgId of orgIds) {
    await db.delete(organization).where(eq(organization.id, orgId));
  }
}

(RUN ? describe : describe.skip)('createIdentityGraph (integration)', () => {
  let db: Database;
  const created: string[] = []; // clerk ids to clean up

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterEach(async () => {
    for (const clerkId of created) {
      await cleanupByClerk(db, clerkId).catch((err) => {
        // Best-effort cleanup — a failure here must not mask the test result.
        void err;
      });
    }
    created.length = 0;
  });

  function uniqueClerk(): string {
    const id = `clerk_${generateUUIDv7()}`;
    created.push(id);
    return id;
  }

  /**
   * Seed a bare victim graph — organization + person + login only (NO
   * subscription/quota_pools, so it does not hit the pre-M-REPOINT satellite
   * FK). Sufficient for the BUG-411 email-reclaim guard, which trips on the
   * login.email lookup before any subscription write.
   */
  async function seedBareLogin(
    clerkUserId: string,
    email: string,
  ): Promise<void> {
    const [org] = await db
      .insert(organization)
      .values({ name: 'Victim Org' })
      .returning();
    const [personRow] = await db
      .insert(person)
      .values({
        displayName: 'Victim',
        birthDate: '1980-01-01',
        residenceJurisdiction: 'US',
      })
      .returning();
    const [loginRow] = await db
      .insert(login)
      .values({ personId: personRow!.id, clerkUserId, email })
      .returning();
    await db
      .update(person)
      .set({ loginId: loginRow!.id })
      .where(eq(person.id, personRow!.id));
    await db.insert(membership).values({
      personId: personRow!.id,
      organizationId: org!.id,
      roles: ['admin', 'learner'],
    });
  }

  it('creates the full graph in one transaction (owner, plus trial)', async () => {
    const clerkUserId = uniqueClerk();
    const email = `owner_${generateUUIDv7()}@test.local`;

    const graph = await createIdentityGraph(db, {
      clerkUserId,
      verifiedEmail: email,
      displayName: 'Owner',
      birthYear: 1990,
      birthMonth: 6,
      birthDay: 15,
      location: 'US',
      timezone: 'America/New_York',
    });

    expect(graph.isOwner).toBe(true);
    expect(graph.roles).toEqual(['admin', 'learner']);
    expect(graph.account.clerkUserId).toBe(clerkUserId);
    expect(graph.account.email).toBe(email);

    // person: exact birth date persisted, jurisdiction mapped, login_id wired.
    const personRow = await db.query.person.findFirst({
      where: eq(person.id, graph.personId),
    });
    expect(personRow?.birthDate).toBe('1990-06-15');
    expect(personRow?.residenceJurisdiction).toBe('US');
    expect(personRow?.loginId).toBeTruthy(); // reverse circular wire

    // subscription: plus trial with a real trial_ends_at, payer = person.
    const subRow = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, graph.organizationId),
    });
    expect(subRow?.planTier).toBe('plus');
    expect(subRow?.status).toBe('trial');
    expect(subRow?.trialEndsAt).toBeTruthy();
    expect(subRow?.payerPersonId).toBe(graph.personId);

    // subscription_payers primary + quota_pools exist.
    const payer = await db.query.subscriptionPayers.findFirst({
      where: eq(subscriptionPayers.subscriptionId, subRow!.id),
    });
    expect(payer?.role).toBe('primary');
    const pool = await db.query.quotaPools.findFirst({
      where: eq(quotaPools.subscriptionId, subRow!.id),
    });
    expect(pool).toBeTruthy();

    // [WI-1398] The legacy accounts/profiles/subscriptions dual-write assertions
    // that stood here were retired: createIdentityGraph no longer dual-writes the
    // legacy tables (0129 FK re-point discharged the pre-repoint bridge). See
    // docs/_archive/retired-code.md ("WI-1398 — identity-graph.integration.test.ts")
    // and tag retired/wi-1398-legacy-dual-write-assertions.

    // Owner profile_quota_usage is now written UNCONDITIONALLY at bootstrap
    // (profile_quota_usage.profile_id → person.id post-0129), closing the
    // owner-quota tables-absent gap. Assert it always exists — no tableExists gate.
    const ownerUsage = await db.query.profileQuotaUsage.findFirst({
      where: eq(profileQuotaUsage.subscriptionId, subRow!.id),
    });
    expect(ownerUsage?.profileId).toBe(graph.personId);
    expect(ownerUsage?.role).toBe('owner');
    expect(ownerUsage?.usedThisMonth).toBe(0);
    expect(ownerUsage?.usedToday).toBe(0);

    // [WI-1193 AC1/AC2] A self-registered adult owner (birthYear 1990 → age
    // ~35-36) gets a persisted lawful-basis + terms-accepted fact per purpose:
    // one CONSENTED consent_grant row for EACH of platform_use/llm_disclosure,
    // basis='art6_1_a' — the "adult who never needed consent" gap
    // this WI closes.
    const grants = await db.query.consentGrant.findMany({
      where: eq(consentGrant.chargePersonId, graph.personId),
    });
    expect(grants).toHaveLength(2);
    const purposes = grants.map((g) => g.purpose).sort();
    expect(purposes).toEqual(['llm_disclosure', 'platform_use']);
    for (const g of grants) {
      expect(g.lawfulBasis).toBe('art6_1_a');
      expect(g.granted).toBe(true);
      expect(g.withdrawnAt).toBeNull();
      expect(g.organizationId).toBe(graph.organizationId);
    }
  });

  it('[WI-1193] does NOT record adult self-consent for a self-registered owner under 18', async () => {
    // A 15-year-old self-registering as owner passes the >= 13 minimum-age gate
    // (createIdentityGraph's only age check) but is not a true adult by the
    // codebase's 18+ threshold — pre-existing gap (no consent workflow exists
    // for a guardian-less self-registered teen); this WI does not resolve it,
    // it only must not mis-record them as an adult.
    const clerkUserId = uniqueClerk();
    const email = `teen_owner_${generateUUIDv7()}@test.local`;
    const currentYear = new Date().getUTCFullYear();

    const graph = await createIdentityGraph(db, {
      clerkUserId,
      verifiedEmail: email,
      displayName: 'Teen Owner',
      birthYear: currentYear - 15,
      birthMonth: 1,
      birthDay: 1,
      location: 'US',
    });

    const grants = await db.query.consentGrant.findMany({
      where: eq(consentGrant.chargePersonId, graph.personId),
    });
    expect(grants).toHaveLength(0);
  });

  it('is idempotent on a repeated clerk id (login_clerk_user_id_unique replay)', async () => {
    const clerkUserId = uniqueClerk();
    const email = `idem_${generateUUIDv7()}@test.local`;
    const args = {
      clerkUserId,
      verifiedEmail: email,
      displayName: 'Idem',
      birthYear: 1985,
      location: 'EU' as const,
    };
    const first = await createIdentityGraph(db, args);
    const second = await createIdentityGraph(db, args);
    // Same graph returned; no duplicate person/org created.
    expect(second.personId).toBe(first.personId);
    expect(second.organizationId).toBe(first.organizationId);
  });

  it('[BUG-411 sequential] refuses a same-email/different-clerk reclaim with the audited ConflictError', async () => {
    const victimClerk = uniqueClerk();
    const sharedEmail = `victim_${generateUUIDv7()}@test.local`;
    // Bare login (no subscription/quota) — sufficient for the email guard,
    // and FK-safe pre-M-REPOINT.
    await seedBareLogin(victimClerk, sharedEmail);

    const attackerClerk = uniqueClerk();
    await expect(
      createIdentityGraph(db, {
        clerkUserId: attackerClerk,
        verifiedEmail: sharedEmail, // same email, different clerk id
        displayName: 'Attacker',
        birthYear: 1980,
        location: 'US',
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // The victim's login still points at the victim's clerk id — not rewired.
    const victimLogin = await db.query.login.findFirst({
      where: eq(login.email, sharedEmail),
    });
    expect(victimLogin?.clerkUserId).toBe(victimClerk);
    // No attacker login row was created.
    const attackerLogin = await db.query.login.findFirst({
      where: eq(login.clerkUserId, attackerClerk),
    });
    expect(attackerLogin).toBeUndefined();
  });

  it('[BUG-411 concurrent] two same-email/different-clerk bootstraps yield exactly one graph; the loser is refused, not a raw 500', async () => {
    const sharedEmail = `race_${generateUUIDv7()}@test.local`;
    const clerkA = uniqueClerk();
    const clerkB = uniqueClerk();

    const results = await Promise.allSettled([
      createIdentityGraph(db, {
        clerkUserId: clerkA,
        verifiedEmail: sharedEmail,
        displayName: 'A',
        birthYear: 1990,
        location: 'US',
      }),
      createIdentityGraph(db, {
        clerkUserId: clerkB,
        verifiedEmail: sharedEmail,
        displayName: 'B',
        birthYear: 1990,
        location: 'US',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    // Exactly one graph created; the loser refused.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser got the audited ConflictError, never a raw error.
    const loser = rejected[0] as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(ConflictError);
  });

  // [A2 regression] Concurrent SAME-clerk/SAME-email replay must NOT be treated
  // as reclaim abuse — it is idempotent. The loser hits login_email_unique (or
  // login_clerk_user_id_unique) but, because the clerk id matches, the 23505
  // discrimination re-reads by email, finds the same clerk id, and returns the
  // committed graph instead of refusing. Both calls succeed; exactly one graph.
  it('[A2 concurrent same-clerk replay] two same-email/SAME-clerk bootstraps both succeed idempotently (no ConflictError)', async () => {
    const sharedEmail = `idemrace_${generateUUIDv7()}@test.local`;
    const sameClerk = uniqueClerk();

    const results = await Promise.allSettled([
      createIdentityGraph(db, {
        clerkUserId: sameClerk,
        verifiedEmail: sharedEmail,
        displayName: 'Same',
        birthYear: 1990,
        location: 'US',
      }),
      createIdentityGraph(db, {
        clerkUserId: sameClerk,
        verifiedEmail: sharedEmail,
        displayName: 'Same',
        birthYear: 1990,
        location: 'US',
      }),
    ]);

    // No ConflictError — idempotent replay, not reclaim abuse.
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(0);
    const fulfilled = results.filter(
      (
        r,
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<typeof createIdentityGraph>>
      > => r.status === 'fulfilled',
    );
    expect(fulfilled).toHaveLength(2);
    // Both calls resolved to the SAME graph (one person, one org).
    expect(fulfilled[0]!.value.personId).toBe(fulfilled[1]!.value.personId);
    expect(fulfilled[0]!.value.organizationId).toBe(
      fulfilled[1]!.value.organizationId,
    );
  });
});

// Pure-unit guards (no DB) — always run.
describe('buildValidatedBirthDate', () => {
  it('accepts a real calendar date and returns YYYY-MM-DD', () => {
    expect(buildValidatedBirthDate(2000, 2, 29)).toBe('2000-02-29'); // leap year
    expect(buildValidatedBirthDate(1990, 12, 31)).toBe('1990-12-31');
  });

  it('rejects Feb 31 (the silent-normalization trap) instead of rolling to Mar 3', () => {
    expect(() => buildValidatedBirthDate(1990, 2, 31)).toThrow();
  });

  it('rejects Feb 29 on a non-leap year', () => {
    expect(() => buildValidatedBirthDate(2001, 2, 29)).toThrow();
  });

  it('rejects month 13 / day 0', () => {
    expect(() => buildValidatedBirthDate(2000, 13, 1)).toThrow();
    expect(() => buildValidatedBirthDate(2000, 1, 0)).toThrow();
  });
});

describe('locationToJurisdiction', () => {
  it('maps US→US, EU→EU, OTHER→ROW, null→ROW (inverse of the reseed map)', () => {
    expect(locationToJurisdiction('US')).toBe('US');
    expect(locationToJurisdiction('EU')).toBe('EU');
    expect(locationToJurisdiction('OTHER')).toBe('ROW');
    expect(locationToJurisdiction(null)).toBe('ROW');
    expect(locationToJurisdiction(undefined)).toBe('ROW');
  });
});
