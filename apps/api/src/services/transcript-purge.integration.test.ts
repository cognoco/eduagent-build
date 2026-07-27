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
  createDatabase,
  generateUUIDv7,
  learningSessions,
  mentorNotices,
  organization,
  person,
  sessionEmbeddings,
  sessionEvents,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import { purgeSessionTranscript } from './transcript-purge';
import { getMentorNoticeReceipt } from './mentor-notices/state';
import { resolveMentorNoticeRecheckContext } from './mentor-notices/offer';

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

      // [WI-1128] Legacy `accounts`/`profiles` are dropped post-M-DROP;
      // learning_sessions.profileId (and the rest of the retention chain)
      // FKs `person` directly post-M-REPOINT, so seed the v2 store only.
      const [org] = await db
        .insert(organization)
        .values({
          name: `Cascade Test Org ${RUN_ID}`,
        })
        .returning({ id: organization.id });
      accountId = org!.id;

      const [profile] = await db
        .insert(person)
        .values({
          displayName: 'Cascade Test User',
          birthDate: '2012-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning({ id: person.id });
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
      if (profileId) {
        await db.delete(person).where(eq(person.id, profileId));
      }
      if (accountId) {
        await db.delete(organization).where(eq(organization.id, accountId));
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
      await db.delete(person).where(eq(person.id, profileId));

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
  },
);

describeIfDb(
  'purgeSessionTranscript with multiple evidence-backed mentor notices (WI-2629 / OPQ-144 F2 Option A, transformed WI-2500 regression)',
  () => {
    // [WI-2500 → WI-2629] Originally reproduced the purge-transaction abort
    // found by CodeRabbit on PR #2475: a session with 2+ evidence-present
    // mentor_notices (distinct answer_event_id each) used to collapse both
    // rows to (source_session_id, NULL) when `purgeSessionTranscript`
    // deleted the session's events under the old `answer_event_id` ON DELETE
    // SET NULL FK — colliding on `mentor_notices_source_session_null_evidence_uq`
    // and aborting the purge. WI-2500's fix (ON DELETE CASCADE) avoided the
    // collision by deleting the notices along with their evidence events.
    //
    // OPQ-144's F2 Option A ruling supersedes that: `answer_event_id` is now
    // a bare scalar UUID with NO foreign key at all (see 0153 migration).
    // Purging `session_events` therefore leaves `answer_event_id` completely
    // untouched — neither nulled nor cascaded — so this test now asserts the
    // stronger, intended behavior: the purge still succeeds AND both notices
    // survive AND each keeps its ORIGINAL `answer_event_id` value unchanged.
    // (No collision is reintroduced: with no FK, the column never becomes
    // NULL, so evidence-backed rows never collapse onto the null-evidence
    // partial index.)
    let db: Database;
    let orgId: string;
    let profileId: string;
    let subjectId: string;
    let sessionId: string;
    let summaryId: string;
    let firstEventId: string;
    let secondEventId: string;
    let originalFetch: typeof globalThis.fetch;

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);

      // Stub the Voyage embeddings HTTP boundary (purge regenerates the
      // summary embedding). Integration tests mock at the HTTP boundary, not
      // via jest.mock of the internal ./embeddings module — enforced by
      // integration-mock-guard.test.ts. Any other URL falls through.
      originalFetch = globalThis.fetch;
      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        // Exact hostname match (not startsWith) so the boundary can't be
        // fooled by e.g. `api.voyageai.com.evil.example` — CodeQL flags
        // substring URL checks as incomplete sanitization.
        let host = '';
        try {
          host = new URL(url).hostname;
        } catch {
          host = '';
        }
        if (host === 'api.voyageai.com') {
          return new Response(
            JSON.stringify({
              data: [{ embedding: Array.from({ length: 1024 }, () => 0) }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return originalFetch(input, init);
      };

      const [org] = await db
        .insert(organization)
        .values({ name: `Purge Notices Org ${RUN_ID}` })
        .returning({ id: organization.id });
      orgId = org!.id;

      const [profile] = await db
        .insert(person)
        .values({
          displayName: 'Purge Notices User',
          birthDate: '2012-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning({ id: person.id });
      profileId = profile!.id;

      const [subject] = await db
        .insert(subjects)
        .values({
          profileId,
          name: 'Purge Notices Subject',
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
          learnerRecap: 'Today we covered two distinct evidenced notices.',
          llmSummary: {
            narrative: 'Worked on verifying multi-notice purge cascade.',
            topicsCovered: ['purge cascade'],
            sessionState: 'completed',
            reEntryRecommendation: 'Pick up by re-running the purge test.',
          },
          summaryGeneratedAt: new Date(),
        })
        .returning({ id: sessionSummaries.id });
      summaryId = summary!.id;

      const [firstEvent] = await db
        .insert(sessionEvents)
        .values({
          sessionId,
          profileId,
          subjectId,
          eventType: 'user_message',
          content: 'first evidenced answer',
        })
        .returning({ id: sessionEvents.id });
      firstEventId = firstEvent!.id;

      const [secondEvent] = await db
        .insert(sessionEvents)
        .values({
          sessionId,
          profileId,
          subjectId,
          eventType: 'user_message',
          content: 'second evidenced answer',
        })
        .returning({ id: sessionEvents.id });
      secondEventId = secondEvent!.id;

      // Two evidence-backed notices in the same session, each keyed to a
      // DISTINCT answer_event_id — permitted by
      // mentor_notices_source_session_answer_event_uq, forbidden only for
      // the (session, NULL) shape both would collapse to under the old FK.
      await db.insert(mentorNotices).values([
        {
          profileId,
          subjectId,
          sourceSessionId: sessionId,
          answerEventId: firstEventId,
          concept: 'first concept',
        },
        {
          profileId,
          subjectId,
          sourceSessionId: sessionId,
          answerEventId: secondEventId,
          concept: 'second concept',
        },
      ]);
    });

    afterAll(async () => {
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      }
      // Belt-and-braces cleanup in case the test failed mid-flight.
      if (profileId) {
        await db.delete(person).where(eq(person.id, profileId));
      }
      if (orgId) {
        await db.delete(organization).where(eq(organization.id, orgId));
      }
    });

    it('purges the session without aborting, and BOTH notices survive with their original answer_event_id VALUES unchanged', async () => {
      const result = await purgeSessionTranscript(
        db,
        profileId,
        summaryId,
        'fake-voyage-api-key',
      );

      // (a) purge succeeds — no abort from the null-evidence collision.
      expect(result.status).toBe('purged');

      const noticesAfter = await db
        .select({
          id: mentorNotices.id,
          concept: mentorNotices.concept,
          answerEventId: mentorNotices.answerEventId,
        })
        .from(mentorNotices)
        .where(eq(mentorNotices.sourceSessionId, sessionId));

      // (b) both notices survive the purge — no FK cascade deletes them.
      expect(noticesAfter).toHaveLength(2);

      const first = noticesAfter.find((n) => n.concept === 'first concept');
      const second = noticesAfter.find((n) => n.concept === 'second concept');

      // (c) each notice's answer_event_id VALUE is unchanged — compared
      // against the values captured before purge, proving identity
      // preservation, not merely "still non-NULL".
      expect(first?.answerEventId).toBe(firstEventId);
      expect(second?.answerEventId).toBe(secondEventId);

      // The evidence events themselves are gone (this is a real purge, not a
      // no-op) — answer_event_id is now a dangling scalar pointer by design.
      const eventsAfter = await db
        .select({ id: sessionEvents.id })
        .from(sessionEvents)
        .where(eq(sessionEvents.sessionId, sessionId));
      expect(eventsAfter).toEqual([]);
    });
  },
);

describeIfDb(
  'purgeSessionTranscript with a single evidence-backed mentor notice (WI-2629)',
  () => {
    let db: Database;
    let orgId: string;
    let profileId: string;
    let subjectId: string;
    let sessionId: string;
    let summaryId: string;
    let eventId: string;
    let originalFetch: typeof globalThis.fetch;

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);

      originalFetch = globalThis.fetch;
      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        let host = '';
        try {
          host = new URL(url).hostname;
        } catch {
          host = '';
        }
        if (host === 'api.voyageai.com') {
          return new Response(
            JSON.stringify({
              data: [{ embedding: Array.from({ length: 1024 }, () => 0) }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return originalFetch(input, init);
      };

      const [org] = await db
        .insert(organization)
        .values({ name: `Purge Single Notice Org ${RUN_ID}` })
        .returning({ id: organization.id });
      orgId = org!.id;

      const [profile] = await db
        .insert(person)
        .values({
          displayName: 'Purge Single Notice User',
          birthDate: '2012-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning({ id: person.id });
      profileId = profile!.id;

      const [subject] = await db
        .insert(subjects)
        .values({
          profileId,
          name: 'Purge Single Notice Subject',
          status: 'active',
          pedagogyMode: 'socratic',
        })
        .returning({ id: subjects.id });
      subjectId = subject!.id;

      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId, status: 'completed' })
        .returning({ id: learningSessions.id });
      sessionId = session!.id;

      const [summary] = await db
        .insert(sessionSummaries)
        .values({
          sessionId,
          profileId,
          status: 'accepted',
          learnerRecap: 'Today we covered a single evidenced notice.',
          llmSummary: {
            narrative: 'Worked on verifying single-notice purge survival.',
            topicsCovered: ['purge survival'],
            sessionState: 'completed',
            reEntryRecommendation: 'Pick up by re-running the purge test.',
          },
          summaryGeneratedAt: new Date(),
        })
        .returning({ id: sessionSummaries.id });
      summaryId = summary!.id;

      const [event] = await db
        .insert(sessionEvents)
        .values({
          sessionId,
          profileId,
          subjectId,
          eventType: 'user_message',
          content: 'the single evidenced answer',
        })
        .returning({ id: sessionEvents.id });
      eventId = event!.id;

      await db.insert(mentorNotices).values({
        profileId,
        subjectId,
        sourceSessionId: sessionId,
        answerEventId: eventId,
        concept: 'single notice concept',
      });
    });

    afterAll(async () => {
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      }
      if (profileId) {
        await db.delete(person).where(eq(person.id, profileId));
      }
      if (orgId) {
        await db.delete(organization).where(eq(organization.id, orgId));
      }
    });

    it('survives purge with its original answer_event_id value unchanged, even though the underlying event is gone', async () => {
      const result = await purgeSessionTranscript(
        db,
        profileId,
        summaryId,
        'fake-voyage-api-key',
      );
      expect(result.status).toBe('purged');

      const [noticeAfter] = await db
        .select({ answerEventId: mentorNotices.answerEventId })
        .from(mentorNotices)
        .where(eq(mentorNotices.sourceSessionId, sessionId));

      expect(noticeAfter?.answerEventId).toBe(eventId);

      const eventsAfter = await db
        .select({ id: sessionEvents.id })
        .from(sessionEvents)
        .where(eq(sessionEvents.sessionId, sessionId));
      expect(eventsAfter).toEqual([]);
    });
  },
);

describeIfDb(
  'a surviving purged-event notice stays safely consumable (WI-2629 consumer audit)',
  () => {
    // [WI-2629] After purge, answer_event_id is a DANGLING scalar pointer —
    // no session_events row exists at that id any more. This exercises two
    // REAL consumers (no mocks) against that exact state: the session-summary
    // receipt reader (`getMentorNoticeReceipt`, used by routes/sessions.ts)
    // and the notice re-offer resolver (`resolveMentorNoticeRecheckContext`,
    // used by the natural-resurfacing path in offer.ts). Neither reads
    // session_events, so neither should throw, leak, or silently drop the
    // still-valid notice.
    let db: Database;
    let orgId: string;
    let profileId: string;
    let subjectId: string;
    let sessionId: string;
    let summaryId: string;
    let noticeId: string;
    let eventId: string;
    let originalFetch: typeof globalThis.fetch;

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);

      originalFetch = globalThis.fetch;
      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        let host = '';
        try {
          host = new URL(url).hostname;
        } catch {
          host = '';
        }
        if (host === 'api.voyageai.com') {
          return new Response(
            JSON.stringify({
              data: [{ embedding: Array.from({ length: 1024 }, () => 0) }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return originalFetch(input, init);
      };

      const [org] = await db
        .insert(organization)
        .values({ name: `Purge Consumer Org ${RUN_ID}` })
        .returning({ id: organization.id });
      orgId = org!.id;

      const [profile] = await db
        .insert(person)
        .values({
          displayName: 'Purge Consumer User',
          birthDate: '2012-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning({ id: person.id });
      profileId = profile!.id;

      const [subject] = await db
        .insert(subjects)
        .values({
          profileId,
          name: 'Purge Consumer Subject',
          status: 'active',
          pedagogyMode: 'socratic',
        })
        .returning({ id: subjects.id });
      subjectId = subject!.id;

      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId, status: 'completed' })
        .returning({ id: learningSessions.id });
      sessionId = session!.id;

      const [summary] = await db
        .insert(sessionSummaries)
        .values({
          sessionId,
          profileId,
          status: 'accepted',
          learnerRecap: 'Today we covered consumer-path survival.',
          llmSummary: {
            narrative:
              'Worked on verifying consumer survival of a purged notice.',
            topicsCovered: ['consumer survival'],
            sessionState: 'completed',
            reEntryRecommendation: 'Pick up by re-running the purge test.',
          },
          summaryGeneratedAt: new Date(),
        })
        .returning({ id: sessionSummaries.id });
      summaryId = summary!.id;

      const [event] = await db
        .insert(sessionEvents)
        .values({
          sessionId,
          profileId,
          subjectId,
          eventType: 'user_message',
          content: 'the consumer-path evidenced answer',
        })
        .returning({ id: sessionEvents.id });
      eventId = event!.id;

      const [notice] = await db
        .insert(mentorNotices)
        .values({
          profileId,
          subjectId,
          sourceSessionId: sessionId,
          answerEventId: eventId,
          concept: 'consumer path concept',
          correctionHint: 'consumer path hint',
        })
        .returning({ id: mentorNotices.id });
      noticeId = notice!.id;

      // Purge this session's transcript BEFORE either consumer is exercised
      // — the notice's evidence event must already be gone.
      const result = await purgeSessionTranscript(
        db,
        profileId,
        summaryId,
        'fake-voyage-api-key',
      );
      expect(result.status).toBe('purged');
    });

    afterAll(async () => {
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      }
      if (profileId) {
        await db.delete(person).where(eq(person.id, profileId));
      }
      if (orgId) {
        await db.delete(organization).where(eq(organization.id, orgId));
      }
    });

    it('getMentorNoticeReceipt returns the full, undropped notice — no throw', async () => {
      const receipt = await getMentorNoticeReceipt(db, profileId, sessionId);
      expect(receipt).toEqual({
        id: noticeId,
        concept: 'consumer path concept',
        correctionHint: 'consumer path hint',
      });
    });

    it('resolveMentorNoticeRecheckContext (natural resurfacing) still finds and offers the surviving notice — no throw', async () => {
      const context = await resolveMentorNoticeRecheckContext(db, profileId, {
        id: sessionId,
        subjectId,
        exchangeCount: 1,
      });

      expect(context).toEqual({
        id: noticeId,
        concept: 'consumer path concept',
        correctionHint: 'consumer path hint',
        exchangeNumber: 1,
      });
    });
  },
);

describeIfDb(
  'mentor_notices FK cascades unchanged by WI-2629 (profileId, sourceSessionId)',
  () => {
    // [WI-2629] Only answer_event_id's FK is dropped. profileId → person and
    // sourceSessionId → learning_sessions stay ON DELETE CASCADE — this pins
    // that both unrelated cascades still fire so a future schema edit cannot
    // silently widen the scope of this change.
    let db: Database;
    let orgId: string;
    let profileId: string;
    let subjectId: string;
    let sessionId: string;
    let noticeId: string;

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);

      const [org] = await db
        .insert(organization)
        .values({ name: `FK Cascade Org ${RUN_ID}` })
        .returning({ id: organization.id });
      orgId = org!.id;

      const [profile] = await db
        .insert(person)
        .values({
          displayName: 'FK Cascade User',
          birthDate: '2012-01-01',
          residenceJurisdiction: 'EU',
        })
        .returning({ id: person.id });
      profileId = profile!.id;

      const [subject] = await db
        .insert(subjects)
        .values({
          profileId,
          name: 'FK Cascade Subject',
          status: 'active',
          pedagogyMode: 'socratic',
        })
        .returning({ id: subjects.id });
      subjectId = subject!.id;

      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId, status: 'completed' })
        .returning({ id: learningSessions.id });
      sessionId = session!.id;

      const [notice] = await db
        .insert(mentorNotices)
        .values({
          profileId,
          subjectId,
          sourceSessionId: sessionId,
          concept: 'fk cascade concept',
        })
        .returning({ id: mentorNotices.id });
      noticeId = notice!.id;
    });

    afterAll(async () => {
      if (orgId) {
        await db.delete(organization).where(eq(organization.id, orgId));
      }
    });

    it('deleting the source session still cascades the notice away', async () => {
      await db
        .delete(learningSessions)
        .where(eq(learningSessions.id, sessionId));

      const after = await db
        .select({ id: mentorNotices.id })
        .from(mentorNotices)
        .where(eq(mentorNotices.id, noticeId));
      expect(after).toEqual([]);
    });

    it('deleting the profile still cascades any remaining notices away', async () => {
      // Re-seed a fresh notice under the same profile (the previous one was
      // already cascaded away by the source-session delete above).
      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId, status: 'completed' })
        .returning({ id: learningSessions.id });

      const [notice] = await db
        .insert(mentorNotices)
        .values({
          profileId,
          subjectId,
          sourceSessionId: session!.id,
          concept: 'fk cascade concept 2',
        })
        .returning({ id: mentorNotices.id });

      await db.delete(person).where(eq(person.id, profileId));

      const after = await db
        .select({ id: mentorNotices.id })
        .from(mentorNotices)
        .where(eq(mentorNotices.id, notice!.id));
      expect(after).toEqual([]);
    });
  },
);
