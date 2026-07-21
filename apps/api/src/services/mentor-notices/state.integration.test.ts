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
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';

import { acceptMentorNotice } from './state';

/**
 * [WI-2500] Real-DB proof for clause 4 — durable identity is source session
 * PLUS validated answer-event evidence, not source-session-only. The old
 * `mentor_notices_source_session_unique` constraint made a session
 * permanently one-notice; the new
 * `mentor_notices_source_session_answer_event_unique` (NULLS NOT DISTINCT on
 * (source_session_id, answer_event_id)) must:
 *   1. Stay idempotent under a genuine concurrent retry of the SAME evidence
 *      (exactly one row survives — not zero, not two).
 *   2. Allow a second, DIFFERENTLY-evidenced notice in the SAME session
 *      (the exact case the old constraint wrongly forbade).
 * Both are exercised against a real Postgres cluster with real concurrent
 * connections — no mocks, per "no internal mocks in integration tests".
 */

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();

let db: Database;
const orgIds: string[] = [];
const personIds: string[] = [];

async function seedFixture() {
  const [org] = await db
    .insert(organization)
    .values({ name: `WI-2500 evidence-aware constraint ${RUN_ID}` })
    .returning({ id: organization.id });
  orgIds.push(org!.id);

  const [profile] = await db
    .insert(person)
    .values({
      displayName: 'WI-2500 Fixture Learner',
      birthDate: '2012-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning({ id: person.id });
  personIds.push(profile!.id);

  const [subject] = await db
    .insert(subjects)
    .values({ profileId: profile!.id, name: 'WI-2500 Biology' })
    .returning({ id: subjects.id });

  const [session] = await db
    .insert(learningSessions)
    .values({ profileId: profile!.id, subjectId: subject!.id })
    .returning({ id: learningSessions.id });

  const [eventA] = await db
    .insert(sessionEvents)
    .values({
      sessionId: session!.id,
      profileId: profile!.id,
      subjectId: subject!.id,
      eventType: 'user_message',
      content: 'Mitosis makes identical cells, meiosis does too I think',
    })
    .returning({ id: sessionEvents.id });

  const [eventB] = await db
    .insert(sessionEvents)
    .values({
      sessionId: session!.id,
      profileId: profile!.id,
      subjectId: subject!.id,
      eventType: 'user_message',
      content: 'Photosynthesis happens in the mitochondria I believe',
    })
    .returning({ id: sessionEvents.id });

  return {
    profileId: profile!.id,
    subjectId: subject!.id,
    sessionId: session!.id,
    eventAId: eventA!.id,
    eventBId: eventB!.id,
  };
}

afterAll(async () => {
  for (const pid of personIds) {
    await db.delete(person).where(eq(person.id, pid));
  }
  for (const oid of orgIds) {
    await db.delete(organization).where(eq(organization.id, oid));
  }
});

describeIfDb(
  'acceptMentorNotice — evidence-aware uniqueness (real DB) [WI-2500]',
  () => {
    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    it('stays idempotent when the same accepted evidence is inserted concurrently', async () => {
      const fixture = await seedFixture();

      const attempt = () =>
        acceptMentorNotice(db, {
          profileId: fixture.profileId,
          subjectId: fixture.subjectId,
          topicId: null,
          sourceSessionId: fixture.sessionId,
          answerEventId: fixture.eventAId,
          concept: 'Mitosis versus meiosis',
          correctionHint: 'Mitosis keeps the chromosome count unchanged.',
        });

      // Two genuinely concurrent connections racing the same insert — not
      // sequential calls on one connection, which would never exercise the
      // constraint's concurrency behavior at all.
      const [first, second] = await Promise.all([attempt(), attempt()]);
      const accepted = [first, second].filter((r) => r !== null);
      expect(accepted).toHaveLength(1);

      const rows = await db
        .select()
        .from(mentorNotices)
        .where(eq(mentorNotices.sourceSessionId, fixture.sessionId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.answerEventId).toBe(fixture.eventAId);
    });

    it('allows a second, differently-evidenced notice in the same session', async () => {
      const fixture = await seedFixture();

      const firstNotice = await acceptMentorNotice(db, {
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        topicId: null,
        sourceSessionId: fixture.sessionId,
        answerEventId: fixture.eventAId,
        concept: 'Mitosis versus meiosis',
        correctionHint: 'Mitosis keeps the chromosome count unchanged.',
      });
      expect(firstNotice).not.toBeNull();

      // This is the case the OLD source-session-only constraint wrongly
      // forbade: a second notice, same session, different evidence.
      const secondNotice = await acceptMentorNotice(db, {
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        topicId: null,
        sourceSessionId: fixture.sessionId,
        answerEventId: fixture.eventBId,
        concept: 'Photosynthesis location',
        correctionHint: 'Photosynthesis happens in the chloroplast.',
      });
      expect(secondNotice).not.toBeNull();
      expect(secondNotice!.id).not.toBe(firstNotice!.id);

      const rows = await db
        .select()
        .from(mentorNotices)
        .where(eq(mentorNotices.sourceSessionId, fixture.sessionId));
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.answerEventId).sort()).toEqual(
        [fixture.eventAId, fixture.eventBId].sort(),
      );
    });
  },
);
