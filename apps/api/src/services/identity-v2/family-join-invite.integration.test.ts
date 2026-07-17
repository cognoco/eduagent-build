// ---------------------------------------------------------------------------
// [WI-1753] initiateFamilyJoinInvite — integration tests against the real
// identity graph. This is the Phase-2 invite WRITE, and it carries the AC-1
// ANTI-ENUMERATION break-test that the accept-side file defers to here.
//
// AC-1 (anti-enum) — the security crux: the invite WRITE must do byte-identical
// work whether or not `invited_email` matches a real account. We prove it by
// seeding a teen with a known login email and issuing two invites from the same
// (inviter, family-org) slot targets — one to that real email, one to a random
// non-matching email — and asserting the service returns the SAME result and
// writes a structurally identical `pending` row in both cases. The service has
// no person/login lookup at all, so there is no match/no-match branch to leak.
//
// Also covered: the WI-374-style atomic abuse caps (resend / recipient-change,
// enforced TOCTOU-free in the upsert setWhere) and the accepted-slot terminal
// guard.
//
// MIGRATION PREREQUISITE (same as family-join-v2.integration.test.ts): the seed
// (createIdentityGraph) requires migration 0143 (person.migration_pending_at),
// and this file's target table requires migration 0144 (family_join_invite).
// CI applies migrations (db-schema change class) before the integration suite;
// a raw local run against a staging DB missing 0143/0144 fails at the seed or
// the first invite write — that is the environment gap, not the invite logic.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  consentGrant,
  createDatabase,
  familyJoinInvite,
  login,
  membership,
  organization,
  person,
  profileQuotaUsage,
  quotaPools,
  subscription,
  subscriptionPayers,
  supportership,
  type Database,
} from '@eduagent/database';
import { ConflictError, ForbiddenError, RateLimitedError } from '../../errors';
import { createIdentityGraph } from './identity-graph';
import {
  initiateFamilyJoinInvite,
  resolveFamilyJoinInviter,
} from './family-join-invite';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;
const REPOINTED = process.env['IDENTITY_V2_REPOINTED'] === 'true';
const itGraph = RUN && REPOINTED ? it : it.skip;

const NOW_YEAR = new Date().getUTCFullYear();
const ADULT_BIRTH_YEAR = NOW_YEAR - 40;
const TEEN_BIRTH_YEAR = NOW_YEAR - 18;
// An adolescent (13–17) owner: old enough to hold their own org-of-one, too
// young to INITIATE a family-join invite (AC-7).
const MINOR_BIRTH_YEAR = NOW_YEAR - 15;

// No email config in the test env → sendEmail returns `no_api_key`, which the
// service treats as a config (not delivery) outcome: the invite row is KEPT and
// no counter is rolled back. So invite rows and counters are assertable here.
const APP_URL = 'https://example.test';

(RUN ? describe : describe.skip)(
  'initiateFamilyJoinInvite (integration)',
  () => {
    let db: Database;
    const personIds: string[] = [];
    const orgIds: string[] = [];
    const subIds: string[] = [];

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterEach(async () => {
      for (const oid of orgIds) {
        await db
          .delete(familyJoinInvite)
          .where(eq(familyJoinInvite.familyOrgId, oid));
      }
      for (const sid of subIds) {
        await db
          .delete(profileQuotaUsage)
          .where(eq(profileQuotaUsage.subscriptionId, sid));
        await db
          .delete(subscriptionPayers)
          .where(eq(subscriptionPayers.subscriptionId, sid));
        await db.delete(quotaPools).where(eq(quotaPools.subscriptionId, sid));
      }
      for (const pid of personIds) {
        await db
          .delete(supportership)
          .where(eq(supportership.supporterPersonId, pid));
        await db
          .delete(profileQuotaUsage)
          .where(eq(profileQuotaUsage.profileId, pid));
        // [WI-1193] An ADULT_BIRTH_YEAR/TEEN_BIRTH_YEAR seed now holds
        // consent_grant rows (adult self-consent, written at createIdentityGraph
        // bootstrap) — RESTRICT on both charge_person_id and organization_id, so
        // these must go before the person/organization deletes below.
        await db
          .delete(consentGrant)
          .where(eq(consentGrant.chargePersonId, pid));
        await db.delete(membership).where(eq(membership.personId, pid));
        await db.delete(login).where(eq(login.personId, pid));
      }
      for (const oid of orgIds) {
        await db
          .delete(subscription)
          .where(eq(subscription.organizationId, oid));
        await db.delete(organization).where(eq(organization.id, oid));
      }
      for (const pid of personIds) {
        await db.delete(person).where(eq(person.id, pid));
      }
      personIds.length = 0;
      orgIds.length = 0;
      subIds.length = 0;
    });

    async function seedInviter(): Promise<{ personId: string; orgId: string }> {
      const { organizationId, personId } = await createIdentityGraph(db, {
        clerkUserId: `clerk_inviter_${randomUUID()}`,
        verifiedEmail: `inviter_${randomUUID()}@example.test`,
        displayName: 'Inviter Parent',
        birthYear: ADULT_BIRTH_YEAR,
      });
      personIds.push(personId);
      orgIds.push(organizationId);
      const sub = await db.query.subscription.findFirst({
        where: eq(subscription.organizationId, organizationId),
        columns: { id: true },
      });
      if (sub) subIds.push(sub.id);
      return { personId, orgId: organizationId };
    }

    itGraph(
      'AC-1 anti-enum: identical result + row whether the email matches a real account or not',
      async () => {
        // Seed a real teen with a known login email (the "match" target).
        const teenEmail = `teen_${randomUUID()}@example.test`;
        const teen = await createIdentityGraph(db, {
          clerkUserId: `clerk_teen_${randomUUID()}`,
          verifiedEmail: teenEmail,
          displayName: 'Existing Teen',
          birthYear: TEEN_BIRTH_YEAR,
        });
        personIds.push(teen.personId);
        orgIds.push(teen.organizationId);
        const teenSub = await db.query.subscription.findFirst({
          where: eq(subscription.organizationId, teen.organizationId),
          columns: { id: true },
        });
        if (teenSub) subIds.push(teenSub.id);

        // Two independent inviter slots so the two invites do not collide on the
        // (inviter, org) unique — we compare their outcomes.
        const a = await seedInviter();
        const b = await seedInviter();

        const matchResult = await initiateFamilyJoinInvite(db, {
          inviterPersonId: a.personId,
          familyOrgId: a.orgId,
          invitedEmail: teenEmail, // matches a real account
          appUrl: APP_URL,
        });
        const noMatchResult = await initiateFamilyJoinInvite(db, {
          inviterPersonId: b.personId,
          familyOrgId: b.orgId,
          invitedEmail: `nobody_${randomUUID()}@example.test`, // no match
          appUrl: APP_URL,
        });

        // Byte-identical service result regardless of account existence.
        expect(matchResult).toEqual(noMatchResult);

        // Both writes produced a structurally identical pending invite row.
        const matchRow = await db.query.familyJoinInvite.findFirst({
          where: and(
            eq(familyJoinInvite.inviterPersonId, a.personId),
            eq(familyJoinInvite.familyOrgId, a.orgId),
          ),
        });
        const noMatchRow = await db.query.familyJoinInvite.findFirst({
          where: and(
            eq(familyJoinInvite.inviterPersonId, b.personId),
            eq(familyJoinInvite.familyOrgId, b.orgId),
          ),
        });
        expect(matchRow?.status).toBe('pending');
        expect(noMatchRow?.status).toBe('pending');
        expect(matchRow?.resendCount).toBe(noMatchRow?.resendCount);
        expect(matchRow?.recipientChangeCount).toBe(
          noMatchRow?.recipientChangeCount,
        );
        expect(matchRow?.token).toBeTruthy();
        expect(noMatchRow?.token).toBeTruthy();
      },
      30_000,
    );

    itGraph(
      'atomic resend cap: the initial invite + 3 resends succeed, the 4th resend is rate-limited',
      async () => {
        const { personId, orgId } = await seedInviter();
        const email = `resend_${randomUUID()}@example.test`;
        const call = () =>
          initiateFamilyJoinInvite(db, {
            inviterPersonId: personId,
            familyOrgId: orgId,
            invitedEmail: email,
            appUrl: APP_URL,
          });

        // initial + 3 resends (resend_count 0 → 3) all allowed.
        await call();
        await call();
        await call();
        await call();
        const row = await db.query.familyJoinInvite.findFirst({
          where: eq(familyJoinInvite.familyOrgId, orgId),
          columns: { resendCount: true },
        });
        expect(row?.resendCount).toBe(3);

        // 4th resend (would be resend_count 4) is capped.
        await expect(call()).rejects.toBeInstanceOf(RateLimitedError);
      },
      30_000,
    );

    // recipient_change_count is an INDEPENDENT abuse control from resend_count:
    // retargeting the invite to a different address each time never increments
    // resendCount (it resets it to 0), so the resend cap above cannot bound it.
    // Without its own cap, one (inviter, family-org) slot could be walked across
    // unlimited distinct addresses — the distinct-email bombing hole the R2 key
    // was chosen to close. This is that cap's boundary.
    itGraph(
      'atomic recipient-change cap: the initial invite + 3 retargets succeed, the 4th retarget is rate-limited',
      async () => {
        const { personId, orgId } = await seedInviter();
        const retarget = () =>
          initiateFamilyJoinInvite(db, {
            inviterPersonId: personId,
            familyOrgId: orgId,
            // a DIFFERENT recipient every call — a change, never a resend.
            invitedEmail: `retarget_${randomUUID()}@example.test`,
            appUrl: APP_URL,
          });

        // initial invite + 3 recipient changes (change_count 0 → 3) all allowed.
        await retarget();
        await retarget();
        await retarget();
        await retarget();
        const row = await db.query.familyJoinInvite.findFirst({
          where: eq(familyJoinInvite.familyOrgId, orgId),
          columns: { recipientChangeCount: true, resendCount: true },
        });
        expect(row?.recipientChangeCount).toBe(3);
        // Each change reset the resend counter — proving the two caps are
        // genuinely independent and the resend cap never bounded this path.
        expect(row?.resendCount).toBe(0);

        // 4th retarget (would be change_count 4) is capped.
        await expect(retarget()).rejects.toBeInstanceOf(RateLimitedError);
      },
      30_000,
    );

    itGraph(
      'terminal guard: an accepted slot cannot be re-invited',
      async () => {
        const { personId, orgId } = await seedInviter();
        await initiateFamilyJoinInvite(db, {
          inviterPersonId: personId,
          familyOrgId: orgId,
          invitedEmail: `accepted_${randomUUID()}@example.test`,
          appUrl: APP_URL,
        });
        // Simulate the accept route flipping the slot to terminal.
        await db
          .update(familyJoinInvite)
          .set({ status: 'accepted' })
          .where(eq(familyJoinInvite.familyOrgId, orgId));

        await expect(
          initiateFamilyJoinInvite(db, {
            inviterPersonId: personId,
            familyOrgId: orgId,
            invitedEmail: `again_${randomUUID()}@example.test`,
            appUrl: APP_URL,
          }),
        ).rejects.toBeInstanceOf(ConflictError);
      },
      30_000,
    );

    // Caller-bound authority break-tests (identity-v2 seam). resolveFamilyJoinInviter
    // is the server-side gate the route delegates to; these assert the two ways an
    // unauthorized caller is refused BEFORE any invite row is written.

    itGraph(
      'blast-radius gate: a non-admin member cannot resolve as an inviter',
      async () => {
        const { personId } = await seedInviter();
        // Strip the admin role from the seeded owner's membership → learner only.
        await db
          .update(membership)
          .set({ roles: ['learner'] })
          .where(eq(membership.personId, personId));

        await expect(
          resolveFamilyJoinInviter(db, personId),
        ).rejects.toBeInstanceOf(ForbiddenError);
      },
      30_000,
    );

    itGraph(
      'AC-7: a minor (adolescent) owner cannot initiate a family-join invite',
      async () => {
        const minor = await createIdentityGraph(db, {
          clerkUserId: `clerk_minor_${randomUUID()}`,
          verifiedEmail: `minor_${randomUUID()}@example.test`,
          displayName: 'Minor Owner',
          birthYear: MINOR_BIRTH_YEAR,
        });
        personIds.push(minor.personId);
        orgIds.push(minor.organizationId);
        const minorSub = await db.query.subscription.findFirst({
          where: eq(subscription.organizationId, minor.organizationId),
          columns: { id: true },
        });
        if (minorSub) subIds.push(minorSub.id);

        await expect(
          resolveFamilyJoinInviter(db, minor.personId),
        ).rejects.toBeInstanceOf(ForbiddenError);
      },
      30_000,
    );
  },
);
