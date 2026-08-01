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

import { acceptMentorNotice, getMentorNoticeReceipt } from './state';

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

    it('allows a second, DIFFERENTLY-evidenced notice in the SAME session — the case the old session-only constraint wrongly forbade', async () => {
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

    // [WI-2629 AC-5 — rework of a bounced review] The write boundary must
    // now REJECT a fresh evidence-absent write outright — it must never
    // reach the database. This replaces the old "no-evidence write
    // succeeds" pair of tests above, which proved the OPPOSITE of AC-5 and
    // is exactly why the item bounced. This test fails on the merged
    // pre-fix code (where a null answerEventId writes successfully) and
    // passes once acceptMentorNotice's runtime guard rejects it.
    it('rejects a fresh write with no answer-event evidence — new notices always require answerEventId', async () => {
      const fixture = await seedFixture();

      const notice = await acceptMentorNotice(db, {
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        topicId: null,
        sourceSessionId: fixture.sessionId,
        // Intentionally casting past the type system: this proves the
        // RUNTIME guard, not just the compile-time one, rejects an
        // absent/undefined-at-runtime answerEventId reaching the DB.
        answerEventId: null as unknown as string,
        concept: 'No-evidence concept',
        correctionHint: null,
      });

      expect(notice).toBeNull();

      const rows = await db
        .select()
        .from(mentorNotices)
        .where(eq(mentorNotices.sourceSessionId, fixture.sessionId));
      expect(rows).toHaveLength(0);
    });

    // [WI-2629 AC-5] A pre-existing (legacy) evidence-absent row — inserted
    // directly, bypassing acceptMentorNotice, simulating a row written
    // before this write-boundary tightening — must remain readable. The
    // write boundary is the only thing that changed; reads and the schema's
    // storage (nullable column, both partial unique indexes) are untouched.
    it('keeps a legacy no-evidence row (inserted directly, bypassing acceptMentorNotice) readable', async () => {
      const fixture = await seedFixture();

      const [legacyRow] = await db
        .insert(mentorNotices)
        .values({
          profileId: fixture.profileId,
          subjectId: fixture.subjectId,
          topicId: null,
          sourceSessionId: fixture.sessionId,
          answerEventId: null,
          concept: 'Legacy no-evidence concept',
          correctionHint: null,
        })
        .returning({ id: mentorNotices.id });
      expect(legacyRow).toBeDefined();

      const rows = await db
        .select()
        .from(mentorNotices)
        .where(eq(mentorNotices.sourceSessionId, fixture.sessionId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(legacyRow!.id);
      expect(rows[0]!.answerEventId).toBeNull();
      expect(rows[0]!.concept).toBe('Legacy no-evidence concept');
    });
  },
);

/**
 * [WI-2599] The read-side consequence of the uniqueness change proven above: a
 * session may now hold two notices, but `getSessionSummary` shows exactly one,
 * so `getMentorNoticeReceipt` must always project the SAME one. Its projection
 * is latest-by-createdAt with an id tiebreaker (rationale recorded at the
 * function in `state.ts`), and these cases assert that chosen notice — not that
 * some notice comes back, which the pre-fix unordered `findFirst` already did.
 * Real Postgres, real rows, no mocks.
 */
describeIfDb(
  'getMentorNoticeReceipt — deterministic projection (real DB) [WI-2599]',
  () => {
    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    it('projects the NEWEST notice when one session holds two differently-evidenced notices', async () => {
      const fixture = await seedFixture();

      const olderNotice = await acceptMentorNotice(db, {
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        topicId: null,
        sourceSessionId: fixture.sessionId,
        answerEventId: fixture.eventAId,
        concept: 'Mitosis versus meiosis',
        correctionHint: 'Mitosis keeps the chromosome count unchanged.',
      });
      const newerNotice = await acceptMentorNotice(db, {
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        topicId: null,
        sourceSessionId: fixture.sessionId,
        answerEventId: fixture.eventBId,
        concept: 'Photosynthesis location',
        correctionHint: 'Photosynthesis happens in the chloroplast.',
      });
      expect(olderNotice).not.toBeNull();
      expect(newerNotice).not.toBeNull();
      expect(newerNotice!.id).not.toBe(olderNotice!.id);

      // [WI-2599 plan-proofing] Force physical (heap) storage order to
      // CONTRADICT the required answer, so this case cannot pass by luck of
      // insertion order matching scan order — the exact ambiguity Gate-2
      // flagged. A Postgres UPDATE always writes a NEW tuple version; on a
      // small table with no other churn, that new version is visited AFTER
      // the row's previous live tuple by a forward sequential scan. This
      // relocates the correct answer's (newerNotice's) live tuple to the end
      // of the heap, physically after the wrong answer's (olderNotice's) —
      // regardless of insertion order, so an unordered read can no longer
      // land on the right row by accident of a fresh table's layout.
      await db
        .update(mentorNotices)
        .set({ correctionHint: newerNotice!.correctionHint })
        .where(eq(mentorNotices.id, newerNotice!.id));

      // Establish the premise before asserting on it: two rows really are on
      // this one session, and the notice this test calls "newer" really does
      // carry the later createdAt. Without this, "newest wins" could pass on a
      // session that only ever held one row.
      const rows = await db
        .select()
        .from(mentorNotices)
        .where(eq(mentorNotices.sourceSessionId, fixture.sessionId));
      expect(rows).toHaveLength(2);
      const olderRow = rows.find((r) => r.id === olderNotice!.id)!;
      const newerRow = rows.find((r) => r.id === newerNotice!.id)!;
      expect(newerRow.createdAt.getTime()).toBeGreaterThan(
        olderRow.createdAt.getTime(),
      );

      const receipt = await getMentorNoticeReceipt(
        db,
        fixture.profileId,
        fixture.sessionId,
      );
      expect(receipt).toEqual(newerNotice);
    });

    it('breaks a createdAt tie by id, so the projection is total-ordered and never falls back to storage order', async () => {
      const fixture = await seedFixture();

      // One instant shared by both rows. Nothing forbids this: created_at has
      // no unique index, and the column's defaultNow() is transaction-scoped,
      // so createdAt alone is not by itself a total order.
      const sharedCreatedAt = new Date();
      const [smallerId, largerId] = [generateUUIDv7(), generateUUIDv7()].sort();

      // Smaller id inserted FIRST on purpose: storage order then points at the
      // row this test must not choose, so an unordered read and the required
      // answer disagree. Insert them the other way and the case proves nothing.
      await db.insert(mentorNotices).values({
        id: smallerId,
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        topicId: null,
        sourceSessionId: fixture.sessionId,
        answerEventId: fixture.eventAId,
        concept: 'Tie — earlier id',
        correctionHint: null,
        createdAt: sharedCreatedAt,
      });
      await db.insert(mentorNotices).values({
        id: largerId,
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        topicId: null,
        sourceSessionId: fixture.sessionId,
        answerEventId: fixture.eventBId,
        concept: 'Tie — later id',
        correctionHint: null,
        createdAt: sharedCreatedAt,
      });

      // [WI-2599 plan-proofing] Same technique as the newest-wins case above:
      // an UPDATE relocates the required winner's (largerId's) live tuple to
      // the end of the heap, physically after the loser's (smallerId's),
      // guaranteeing a forward seq scan reaches smallerId first regardless of
      // insertion order or environment-specific physical layout.
      await db
        .update(mentorNotices)
        .set({ concept: 'Tie — later id' })
        .where(eq(mentorNotices.id, largerId));

      const rows = await db
        .select()
        .from(mentorNotices)
        .where(eq(mentorNotices.sourceSessionId, fixture.sessionId));
      expect(rows).toHaveLength(2);
      // The tie is real in the database, not just in the seed values.
      expect(rows[0]!.createdAt.getTime()).toBe(rows[1]!.createdAt.getTime());

      const receipt = await getMentorNoticeReceipt(
        db,
        fixture.profileId,
        fixture.sessionId,
      );
      expect(receipt).toEqual({
        id: largerId,
        concept: 'Tie — later id',
        correctionHint: null,
      });
    });

    // [WI-2599 — bounce rework] The two cases above rely on Postgres returning
    // an unordered scan in plain insertion order, which is what an INSERT-only
    // table happens to do — but that is not a guarantee the read is entitled
    // to lean on, and it is why the earlier revert evidence was rejected as
    // non-discriminating (it could coincidentally read correctly on some
    // Postgres instance/plan). This case makes physical storage order actively
    // POINT AT THE WRONG ROW, so no plan that merely walks the heap can land
    // on the right answer by chance:
    //   1. Insert the LOSER first — its live tuple is the earliest in the heap.
    //   2. Insert the WINNER second (newer createdAt — the actual, correct
    //      answer per this function's ordering contract).
    //   3. No-op UPDATE the WINNER. Postgres MVCC never updates a tuple in
    //      place — an UPDATE writes a brand-new tuple version appended at the
    //      end of the heap and marks the old version dead. This relocates the
    //      WINNER's only live tuple to the very end, past the LOSER, so the
    //      physical/storage order is now the OPPOSITE of the createdAt order.
    // An unordered forward scan (no ORDER BY, LIMIT 1) reaches the LOSER
    // first — confirmed by EXPLAIN and by repeated runs (see WI-2599 evidence
    // in the PR/commit). Only code that actually ORDERs by createdAt/id can
    // land on the WINNER here. Assert the guaranteed property (the projected
    // receipt IS the deterministic — latest-createdAt — choice), not any
    // internal/storage detail.
    it('returns the newest notice even when physical storage order points at the OLDER row — proves the read cannot rely on storage/heap order', async () => {
      const fixture = await seedFixture();

      const loserId = generateUUIDv7();
      const winnerId = generateUUIDv7();
      const olderCreatedAt = new Date(Date.now() - 60 * 60 * 1000); // must LOSE
      const newerCreatedAt = new Date(); // must WIN

      // 1. LOSER inserted first — earliest live tuple in the heap.
      await db.insert(mentorNotices).values({
        id: loserId,
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        topicId: null,
        sourceSessionId: fixture.sessionId,
        answerEventId: fixture.eventAId,
        concept: 'Heap-order decoy — must lose',
        correctionHint: null,
        createdAt: olderCreatedAt,
      });

      // 2. WINNER inserted second — newer createdAt is the actual tiebreaker
      // under test, independent of physical position.
      await db.insert(mentorNotices).values({
        id: winnerId,
        profileId: fixture.profileId,
        subjectId: fixture.subjectId,
        topicId: null,
        sourceSessionId: fixture.sessionId,
        answerEventId: fixture.eventBId,
        concept: 'Heap-order winner — must win',
        correctionHint: null,
        createdAt: newerCreatedAt,
      });

      // 3. No-op UPDATE the WINNER: forces a new tuple version, appended at
      // the end of the heap, relocating the WINNER's live tuple PAST the
      // LOSER's. Physical order is now: LOSER (early), WINNER (late) — the
      // reverse of the correct answer.
      await db
        .update(mentorNotices)
        .set({ correctionHint: null })
        .where(eq(mentorNotices.id, winnerId));

      const rows = await db
        .select()
        .from(mentorNotices)
        .where(eq(mentorNotices.sourceSessionId, fixture.sessionId));
      expect(rows).toHaveLength(2);

      const receipt = await getMentorNoticeReceipt(
        db,
        fixture.profileId,
        fixture.sessionId,
      );
      expect(receipt).toEqual({
        id: winnerId,
        concept: 'Heap-order winner — must win',
        correctionHint: null,
      });
    });
  },
);
