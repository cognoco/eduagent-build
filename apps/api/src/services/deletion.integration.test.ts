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
import { executeDeletion } from './deletion';

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

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);

      const [account] = await db
        .insert(accounts)
        .values({
          clerkUserId: `clerk_integ_acct_cascade_${RUN_ID}`,
          email: `acct_cascade_${RUN_ID}@test.invalid`,
        })
        .returning({ id: accounts.id });
      accountId = account!.id;

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
    });

    it('cascade-deletes all retention-pipeline rows for the deleted account', async () => {
      const before = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_summaries WHERE profile_id = ${profileId}`
      );
      expect((before.rows as Array<{ c: number }>)[0]!.c).toBeGreaterThan(0);

      await executeDeletion(db, accountId);

      const summaries = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_summaries WHERE profile_id = ${profileId}`
      );
      expect((summaries.rows as Array<{ c: number }>)[0]!.c).toBe(0);

      const embeddings = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_embeddings WHERE profile_id = ${profileId}`
      );
      expect((embeddings.rows as Array<{ c: number }>)[0]!.c).toBe(0);

      const events = await db.execute(
        sql`SELECT count(*)::int AS c FROM session_events WHERE profile_id = ${profileId}`
      );
      expect((events.rows as Array<{ c: number }>)[0]!.c).toBe(0);
    });
  }
);
