/**
 * Integration: profile-cascade reaches every retention-pipeline table.
 *
 * The retention spec assumes that deleting a profile cascades through:
 *
 *   profiles
 *     → learning_sessions
 *         → session_summaries
 *             → (via session_id and via profile_id, both cascade)
 *         → session_events
 *         → session_embeddings
 *
 * If any link in this chain ever drifts (e.g., a future ALTER TABLE drops
 * the cascade option), retention silently leaks transcript data — the
 * privacy story this spec sells the user fails open. This test pins the
 * full chain end-to-end against the real database.
 *
 * No internal mocks: we drive the real Postgres schema, including the
 * pgvector column on session_embeddings.
 */

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
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

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

function randomVector(): number[] {
  // Embedding column is `vector(1024)` (Voyage voyage-3.5). Values don't
  // need to be normalized for an FK-cascade test — only the row needs to
  // exist so we can later assert it was deleted.
  return Array.from({ length: 1024 }, () => 0);
}

describeIfDb(
  'Profile-cascade through retention-pipeline tables (integration)',
  () => {
    let db: Database;
    let accountId: string;
    let profileId: string;
    let subjectId: string;
    let sessionId: string;
    let summaryId: string;

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);

      const [account] = await db
        .insert(accounts)
        .values({
          clerkUserId: `clerk_integ_cascade_${RUN_ID}`,
          email: `cascade_${RUN_ID}@test.invalid`,
        })
        .returning({ id: accounts.id });
      accountId = account!.id;

      const [profile] = await db
        .insert(profiles)
        .values({
          accountId,
          displayName: 'Cascade Test User',
          birthYear: 2012,
          isOwner: true,
        })
        .returning({ id: profiles.id });
      profileId = profile!.id;

      const [subject] = await db
        .insert(subjects)
        .values({
          profileId,
          name: 'Cascade Subject',
          status: 'active',
          pedagogyMode: 'socratic',
        })
        .returning({ id: subjects.id });
      subjectId = subject!.id;

      const [session] = await db
        .insert(learningSessions)
        .values({
          profileId,
          subjectId,
          status: 'completed',
        })
        .returning({ id: learningSessions.id });
      sessionId = session!.id;

      const [summary] = await db
        .insert(sessionSummaries)
        .values({
          sessionId,
          profileId,
          status: 'accepted',
          learnerRecap: 'Today we covered cascade testing.',
          llmSummary: {
            narrative:
              'Worked on verifying foreign-key cascade through cascade testing for retention.',
            topicsCovered: ['cascade testing'],
            sessionState: 'completed',
            reEntryRecommendation:
              'Pick up by adding a non-cascade FK and watching this test fail.',
          },
          summaryGeneratedAt: new Date(),
        })
        .returning({ id: sessionSummaries.id });
      summaryId = summary!.id;

      await db.insert(sessionEvents).values({
        sessionId,
        profileId,
        subjectId,
        eventType: 'user_message',
        content: 'cascade test message',
      });

      await db.insert(sessionEmbeddings).values({
        sessionId,
        profileId,
        content: 'cascade test embedding content',
        embedding: randomVector(),
      });
    });

    afterAll(async () => {
      // Belt-and-braces cleanup in case the test failed mid-flight.
      if (accountId) {
        await db.delete(accounts).where(eq(accounts.id, accountId));
      }
    });

    it('seeded fixture is visible in every retention-pipeline table', async () => {
      const [sessionRow] = await db
        .select({ id: learningSessions.id })
        .from(learningSessions)
        .where(eq(learningSessions.profileId, profileId));
      expect(sessionRow?.id).toBe(sessionId);

      const [summaryRow] = await db
        .select({ id: sessionSummaries.id })
        .from(sessionSummaries)
        .where(eq(sessionSummaries.profileId, profileId));
      expect(summaryRow?.id).toBe(summaryId);

      const [eventRow] = await db
        .select({ id: sessionEvents.id })
        .from(sessionEvents)
        .where(eq(sessionEvents.profileId, profileId));
      expect(eventRow?.id).toBeDefined();

      const [embeddingRow] = await db
        .select({ id: sessionEmbeddings.id })
        .from(sessionEmbeddings)
        .where(eq(sessionEmbeddings.profileId, profileId));
      expect(embeddingRow?.id).toBeDefined();
    });

    it('deleting the profile removes every row referencing it across the chain', async () => {
      await db.delete(profiles).where(eq(profiles.id, profileId));

      const sessionsAfter = await db
        .select({ id: learningSessions.id })
        .from(learningSessions)
        .where(eq(learningSessions.profileId, profileId));
      expect(sessionsAfter).toEqual([]);

      const summariesAfter = await db
        .select({ id: sessionSummaries.id })
        .from(sessionSummaries)
        .where(eq(sessionSummaries.profileId, profileId));
      expect(summariesAfter).toEqual([]);

      const eventsAfter = await db
        .select({ id: sessionEvents.id })
        .from(sessionEvents)
        .where(eq(sessionEvents.profileId, profileId));
      expect(eventsAfter).toEqual([]);

      const embeddingsAfter = await db
        .select({ id: sessionEmbeddings.id })
        .from(sessionEmbeddings)
        .where(eq(sessionEmbeddings.profileId, profileId));
      expect(embeddingsAfter).toEqual([]);
    });
  }
);
