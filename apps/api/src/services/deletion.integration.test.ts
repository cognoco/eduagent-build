/**
 * Integration: account-cascade through retention-pipeline tables.
 *
 * Spec acceptance (docs/specs/2026-05-05-tiered-conversation-retention.md):
 *   "Integration test verifies post-cascade row counts are zero for
 *    session_summaries, session_embeddings, session_events for the deleted
 *    account."
 *
 * The retention story relies on `accounts → profiles → ...` cascading all the
 * way down to the three retention tables. If a future ALTER TABLE drops
 * any cascade option, deleting an account would leave orphaned transcript
 * rows alive — the privacy guarantee fails open. This test pins the chain
 * by exercising executeDeletion() against the real database.
 */

import { resolve } from 'path';
import { sql } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  byokWaitlist,
  consentStates,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  profiles,
  sessionEmbeddings,
  sessionEvents,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import { eq } from 'drizzle-orm';
import {
  cancelDeletion,
  deleteArchivedProfileIfStillEligible,
  deleteProfileIfConsentWithdrawn,
  executeDeletion,
  scheduleDeletion,
} from './deletion';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

function randomVector(): number[] {
  return Array.from({ length: 1024 }, () => 0);
}

describeIfDb(
  'Account-cascade through retention-pipeline tables (integration)',
  () => {
    let db: Database;
    let accountId: string;
    let profileId: string;
    const accountEmail = `acct_cascade_${RUN_ID}@test.invalid`;

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);

      const [account] = await db
        .insert(accounts)
        .values({
          clerkUserId: `clerk_integ_acct_cascade_${RUN_ID}`,
          email: accountEmail,
        })
        .returning({ id: accounts.id });
      accountId = account!.id;

      // [R3] Seed a BYOK waitlist row sharing the account's email. The table
      // has no FK to accounts, so the account-delete cascade cannot reach it;
      // executeDeletion must erase it explicitly (GDPR Art 17). This is the
      // break test for that fix — revert the byok delete in executeDeletion and
      // the "byok_waitlist row is erased" assertion below goes red.
      await db.insert(byokWaitlist).values({ email: accountEmail });

      const [profile] = await db
        .insert(profiles)
        .values({
          accountId,
          displayName: 'Account Cascade Test User',
          birthYear: 2012,
          isOwner: true,
        })
        .returning({ id: profiles.id });
      profileId = profile!.id;

      const [subject] = await db
        .insert(subjects)
        .values({
          profileId,
          name: 'Account Cascade Subject',
          status: 'active',
          pedagogyMode: 'socratic',
        })
        .returning({ id: subjects.id });
      const subjectId = subject!.id;

      const [session] = await db
        .insert(learningSessions)
        .values({
          profileId,
          subjectId,
          status: 'completed',
        })
        .returning({ id: learningSessions.id });
      const sessionId = session!.id;

      await db.insert(sessionSummaries).values({
        sessionId,
        profileId,
        status: 'accepted',
        learnerRecap: 'Today we covered account-cascade testing.',
        llmSummary: {
          narrative:
            'Worked on verifying account-level FK cascade through retention tables for account-cascade testing.',
          topicsCovered: ['account-cascade testing'],
          sessionState: 'completed',
          reEntryRecommendation:
            'Pick up by adding a non-cascade FK and watching this break.',
        },
        summaryGeneratedAt: new Date(),
      });

      await db.insert(sessionEvents).values({
        sessionId,
        profileId,
        subjectId,
        eventType: 'user_message',
        content: 'account-cascade test message',
      });

      await db.insert(sessionEmbeddings).values({
        sessionId,
        profileId,
        content: 'account-cascade test embedding content',
        embedding: randomVector(),
      });
    });

    afterAll(async () => {
      // Belt-and-braces cleanup if the test failed before executeDeletion ran.
      if (accountId) {
        await db.execute(sql`DELETE FROM accounts WHERE id = ${accountId}`);
      }
      // byok_waitlist has no FK to accounts, so it is not cleaned up by the
      // account delete above — remove the seeded row explicitly.
      await db.execute(
        sql`DELETE FROM byok_waitlist WHERE email = ${accountEmail}`,
      );
    });

    // -----------------------------------------------------------------------
    // [Fix Bug #494] TOCTOU break test — cancellation-race guard
    //
    // Scenario: account has a pending deletion schedule, user cancels it, then
    // executeDeletion fires (simulating the Inngest post-grace-period step
    // arriving after cancelDeletion). The atomic WHERE guard must prevent the
    // delete and return 'cancelled'; the account row must still exist.
    //
    // Red→green: before the fix executeDeletion used `WHERE id = $1` with no
    // cancellation predicate, so it would delete the account regardless of the
    // cancellation flag. With the fix the atomic WHERE prevents the delete.
    // -----------------------------------------------------------------------
    it('[Bug #494] executeDeletion returns "cancelled" and leaves account intact when deletion was cancelled', async () => {
      // Create a fresh account for this test (separate from the cascade suite).
      const [cancelTestAccount] = await db
        .insert(accounts)
        .values({
          clerkUserId: `clerk_cancel_race_${RUN_ID}`,
          email: `cancel_race_${RUN_ID}@test.invalid`,
        })
        .returning({ id: accounts.id });
      const cancelTestAccountId = cancelTestAccount!.id;

      try {
        // Schedule deletion (sets deletionScheduledAt).
        await scheduleDeletion(db, cancelTestAccountId);

        // User cancels during grace period (sets deletionCancelledAt > deletionScheduledAt).
        await cancelDeletion(db, cancelTestAccountId);

        // Inngest post-grace-period step fires — must be a no-op.
        const result = await executeDeletion(db, cancelTestAccountId);

        expect(result).toBe('cancelled');

        // Account row must still exist.
        const row = await db.query.accounts.findFirst({
          where: (a, { eq: eqFn }) => eqFn(a.id, cancelTestAccountId),
          columns: { id: true },
        });
        expect(row).not.toBeUndefined();
      } finally {
        // Clean up.
        await db.execute(
          sql`DELETE FROM accounts WHERE id = ${cancelTestAccountId}`,
        );
      }
    });

    it('cascade-deletes all retention-pipeline rows for the deleted account', async () => {
      const before = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_summaries WHERE profile_id = ${profileId}`,
      );
      expect((before.rows as Array<{ c: number }>)[0]!.c).toBeGreaterThan(0);

      // [R3] BYOK waitlist row exists before deletion (no FK → no cascade).
      const byokBefore = await db.execute(
        sql`SELECT count(*)::int AS c FROM byok_waitlist WHERE email = ${accountEmail}`,
      );
      expect((byokBefore.rows as Array<{ c: number }>)[0]!.c).toBe(1);

      // executeDeletion only deletes when an active (non-cancelled) deletion is
      // scheduled — the [Bug #494] atomic guard requires deletionScheduledAt IS
      // NOT NULL. Production schedules via the account route before the Inngest
      // job runs executeDeletion; mirror that here so the cascade actually fires.
      await scheduleDeletion(db, accountId);
      const deletionResult = await executeDeletion(db, accountId);
      expect(deletionResult).toBe('deleted');

      const summaries = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_summaries WHERE profile_id = ${profileId}`,
      );
      expect((summaries.rows as Array<{ c: number }>)[0]!.c).toBe(0);

      const embeddings = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_embeddings WHERE profile_id = ${profileId}`,
      );
      expect((embeddings.rows as Array<{ c: number }>)[0]!.c).toBe(0);

      const events = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_events WHERE profile_id = ${profileId}`,
      );
      expect((events.rows as Array<{ c: number }>)[0]!.c).toBe(0);

      // [R3] The email-only BYOK waitlist row must be erased too — it has no FK
      // to accounts, so without the explicit delete in executeDeletion it would
      // survive account deletion. Revert that delete and this assertion fails.
      const byokAfter = await db.execute(
        sql`SELECT count(*)::int AS c FROM byok_waitlist WHERE email = ${accountEmail}`,
      );
      expect((byokAfter.rows as Array<{ c: number }>)[0]!.c).toBe(0);
    });
  },
);

// ---------------------------------------------------------------------------
// [F-122] Archive-cleanup deletion atomicity — restore-race guard.
//
// Scenario: a profile is archived (past retention) with a non-CONSENTED consent
// state. The archive-cleanup job reads eligibility, then a restoreConsent()
// lands (status → CONSENTED, archivedAt cleared) BEFORE the final delete. The
// atomic delete must NOT remove the now-restored profile.
//
// Red→green: the old archive-cleanup called the unconditional deleteProfile,
// which would delete regardless of the restore. deleteArchivedProfileIfStillEligible
// folds the eligibility predicate into the DELETE's WHERE, so the restore wins.
// ---------------------------------------------------------------------------
const F122_RUN_ID = generateUUIDv7();
const describeIfDbF122 = hasDatabaseUrl ? describe : describe.skip;

describeIfDbF122(
  '[F-122] deleteArchivedProfileIfStillEligible — restore-race atomicity',
  () => {
    let db: Database;
    let seq = 0;

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterAll(async () => {
      await db.execute(
        sql`DELETE FROM accounts WHERE clerk_user_id LIKE ${`clerk_f122_${F122_RUN_ID}%`}`,
      );
    });

    async function seedArchivedProfile(opts: {
      consentStatus: 'PENDING' | 'WITHDRAWN' | 'CONSENTED';
      archivedAt: Date | null;
    }): Promise<string> {
      const idx = ++seq;
      const [account] = await db
        .insert(accounts)
        .values({
          clerkUserId: `clerk_f122_${F122_RUN_ID}_${idx}`,
          email: `f122_${F122_RUN_ID}_${idx}@test.invalid`,
        })
        .returning({ id: accounts.id });

      const [profile] = await db
        .insert(profiles)
        .values({
          accountId: account!.id,
          displayName: `F122 Test ${idx}`,
          birthYear: 2013,
          isOwner: false,
          archivedAt: opts.archivedAt,
        })
        .returning({ id: profiles.id });

      await db.insert(consentStates).values({
        profileId: profile!.id,
        consentType: 'GDPR',
        status: opts.consentStatus,
      });

      return profile!.id;
    }

    async function profileExists(profileId: string): Promise<boolean> {
      const row = await db.query.profiles.findFirst({
        where: (p, { eq: eqFn }) => eqFn(p.id, profileId),
        columns: { id: true },
      });
      return row != null;
    }

    // Cutoff = now − 30 days; a profile archived at/before this date is past
    // the retention window and eligible for hard-delete. Each test below seeds
    // its profile with archivedAt = now − 40 days (comfortably past this cutoff).
    const RETENTION_CUTOFF = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    it('deletes an archived, non-consented profile past retention (happy path)', async () => {
      const archivedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const profileId = await seedArchivedProfile({
        consentStatus: 'WITHDRAWN',
        archivedAt,
      });

      const deleted = await deleteArchivedProfileIfStillEligible(
        db,
        profileId,
        RETENTION_CUTOFF,
      );

      expect(deleted).toBe(true);
      expect(await profileExists(profileId)).toBe(false);
    });

    it('does NOT delete when consent was restored after the eligibility read (TOCTOU race)', async () => {
      const archivedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const profileId = await seedArchivedProfile({
        consentStatus: 'WITHDRAWN',
        archivedAt,
      });

      // Simulate restoreConsent() landing in the race window: status → CONSENTED
      // and archivedAt cleared.
      await db
        .update(consentStates)
        .set({ status: 'CONSENTED' })
        .where(eq(consentStates.profileId, profileId));
      await db
        .update(profiles)
        .set({ archivedAt: null })
        .where(eq(profiles.id, profileId));

      const deleted = await deleteArchivedProfileIfStillEligible(
        db,
        profileId,
        RETENTION_CUTOFF,
      );

      // The restored profile must survive.
      expect(deleted).toBe(false);
      expect(await profileExists(profileId)).toBe(true);
    });

    it('does NOT delete when only the consent state was restored (archivedAt still set)', async () => {
      const archivedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const profileId = await seedArchivedProfile({
        consentStatus: 'CONSENTED',
        archivedAt,
      });

      const deleted = await deleteArchivedProfileIfStillEligible(
        db,
        profileId,
        RETENTION_CUTOFF,
      );

      expect(deleted).toBe(false);
      expect(await profileExists(profileId)).toBe(true);
    });
  },
);

// ---------------------------------------------------------------------------
// [F-093] deleteProfileIfConsentWithdrawn — account isolation guard.
//
// Finding: "Consent-revocation delete branch lacks parent-chain account guard
// that archive branch has (BUG-662 asymmetry)."
//
// The archive branch (UPDATE profiles) has:
//   AND account_id = (SELECT account_id FROM profiles WHERE id = ${parentProfileId})
// The delete branch previously called deleteProfileIfConsentWithdrawn() with
// no account guard, meaning a corrupt/replayed Inngest event with a mismatched
// (childProfileId, parentProfileId) pair could delete a profile from a
// different account.
//
// Red→green: adding an optional parentProfileId param that, when supplied, adds
// the same parent-chain account guard to the DELETE's WHERE clause. A cross-
// account attempt must return false (profile retained).
// ---------------------------------------------------------------------------
const F093_RUN_ID = generateUUIDv7();
const describeIfDbF093 = hasDatabaseUrl ? describe : describe.skip;

describeIfDbF093(
  '[F-093] deleteProfileIfConsentWithdrawn — account isolation',
  () => {
    let db: Database;
    let seq = 0;

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterAll(async () => {
      await db.execute(
        sql`DELETE FROM accounts WHERE clerk_user_id LIKE ${`clerk_f093_${F093_RUN_ID}%`}`,
      );
    });

    async function seedAccountWithWithdrawnProfile(): Promise<{
      accountId: string;
      profileId: string;
      revokedAt: Date;
    }> {
      const idx = ++seq;
      const [account] = await db
        .insert(accounts)
        .values({
          clerkUserId: `clerk_f093_${F093_RUN_ID}_${idx}`,
          email: `f093_${F093_RUN_ID}_${idx}@test.invalid`,
        })
        .returning({ id: accounts.id });

      const [profile] = await db
        .insert(profiles)
        .values({
          accountId: account!.id,
          displayName: `F093 Test ${idx}`,
          birthYear: 2013,
          isOwner: false,
        })
        .returning({ id: profiles.id });

      const revokedAt = new Date();
      await db.insert(consentStates).values({
        profileId: profile!.id,
        consentType: 'GDPR',
        status: 'WITHDRAWN',
        respondedAt: revokedAt,
      });

      return { accountId: account!.id, profileId: profile!.id, revokedAt };
    }

    async function profileExists(profileId: string): Promise<boolean> {
      const row = await db.query.profiles.findFirst({
        where: (p, { eq: eqFn }) => eqFn(p.id, profileId),
        columns: { id: true },
      });
      return row != null;
    }

    // [F-093][BREAK] Cross-account delete attempt must be blocked.
    // A parentProfileId from a DIFFERENT account is passed — the guard must
    // reject the delete and return false, leaving the profile intact.
    it('[F-093][BREAK] cross-account deletion attempt is rejected (profile retained)', async () => {
      const { profileId, revokedAt } = await seedAccountWithWithdrawnProfile();

      // Seed a second account with its own profile (the "attacker" account).
      const [attackerAccount] = await db
        .insert(accounts)
        .values({
          clerkUserId: `clerk_f093_${F093_RUN_ID}_attacker_${++seq}`,
          email: `f093_attacker_${F093_RUN_ID}_${seq}@test.invalid`,
        })
        .returning({ id: accounts.id });
      const [attackerProfile] = await db
        .insert(profiles)
        .values({
          accountId: attackerAccount!.id,
          displayName: `F093 Attacker ${seq}`,
          birthYear: 1990,
          isOwner: true,
        })
        .returning({ id: profiles.id });

      // Attempt to delete using an attacker parentProfileId from a different account.
      const deleted = await deleteProfileIfConsentWithdrawn(
        db,
        profileId,
        revokedAt,
        attackerProfile!.id, // cross-account parent — must be rejected
      );

      // Profile must survive — the account guard blocked the delete.
      expect(deleted).toBe(false);
      expect(await profileExists(profileId)).toBe(true);
    });

    // Same-account deletion with a valid parentProfileId must still succeed (happy path).
    it('same-account deletion with parentProfileId succeeds (happy path)', async () => {
      const { accountId, profileId, revokedAt } =
        await seedAccountWithWithdrawnProfile();

      // A valid parent profile on the same account.
      const [parentProfile] = await db
        .insert(profiles)
        .values({
          accountId,
          displayName: 'F093 Parent',
          birthYear: 1985,
          isOwner: true,
        })
        .returning({ id: profiles.id });

      const deleted = await deleteProfileIfConsentWithdrawn(
        db,
        profileId,
        revokedAt,
        parentProfile!.id, // same account — must be allowed
      );

      expect(deleted).toBe(true);
      expect(await profileExists(profileId)).toBe(false);
    });

    // Backward-compat: omitting parentProfileId still deletes (existing callers
    // that don't have parentProfileId available don't break).
    it('omitting parentProfileId still deletes (backward compat)', async () => {
      const { profileId, revokedAt } = await seedAccountWithWithdrawnProfile();

      const deleted = await deleteProfileIfConsentWithdrawn(
        db,
        profileId,
        revokedAt,
      );

      expect(deleted).toBe(true);
      expect(await profileExists(profileId)).toBe(false);
    });
  },
);
