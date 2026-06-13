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
// SEQUENCING NOTE (real finding from the integration DB): the bootstrap's
// `quota_pools` insert references the NEW `subscription(id)`, but the satellite
// FK `quota_pools_subscription_id_subscriptions_id_fk` still targets LEGACY
// `subscriptions(id)` until the convergence FK re-point (M-REPOINT, WI-586
// §4 step 6) — by plan §1.4 the quota satellites re-point at convergence, not
// in CUT-B1. So a FULL-graph insert cannot succeed against the pre-M-REPOINT
// schema. The full-graph DB tests are therefore gated on `IDENTITY_V2_REPOINTED`
// (set once the test DB has the re-point applied); they SKIP otherwise. The
// BUG-411 guard tests do NOT need a full graph — the victim is seeded as a bare
// `login` row and the attacker is refused at the pre-insert email guard, before
// any subscription/quota write — so they run whenever a DB is present. The
// pure-unit guards (calendar, jurisdiction) always run.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  login,
  membership,
  organization,
  person,
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
// Full-graph tests need the quota-satellite FKs re-pointed at the new
// `subscription` table (M-REPOINT). Until then the graph's quota_pools insert
// can't succeed. Gate the full-graph DB tests behind this flag.
const REPOINTED = process.env['IDENTITY_V2_REPOINTED'] === 'true';

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
      await db.delete(quotaPools).where(eq(quotaPools.subscriptionId, sub.id));
      await db
        .delete(subscriptionPayers)
        .where(eq(subscriptionPayers.subscriptionId, sub.id));
    }
    await db.delete(subscription).where(eq(subscription.organizationId, orgId));
  }
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

  (REPOINTED ? it : it.skip)(
    'creates the full graph in one transaction (owner, plus trial) [needs M-REPOINT]',
    async () => {
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
    },
  );

  (REPOINTED ? it : it.skip)(
    'is idempotent on a repeated clerk id (login_clerk_user_id_unique replay) [needs M-REPOINT]',
    async () => {
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
    },
  );

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

  // The concurrent race exercises the 23505 EMAIL-constraint discrimination,
  // which requires the WINNER's full graph (incl. quota_pools) to commit — so
  // it is gated on M-REPOINT like the other full-graph tests. The sequential
  // test above already pins the primary BUG-411 defense (the pre-insert email
  // guard) without a full graph.
  (REPOINTED ? it : it.skip)(
    '[BUG-411 concurrent] two same-email/different-clerk bootstraps yield exactly one graph; the loser is refused, not a raw 500 [needs M-REPOINT]',
    async () => {
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
    },
  );
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
