/**
 * Integration: persistExchangeResult — recitation branch writes a
 * practice_activity_events row with source_type = 'session_event' and a
 * dedupe_key that matches buildPracticeActivityDedupeKey({ activityType:
 * 'recitation', activitySubtype: 'recitation', sourceType: 'session_event',
 * sourceId: <aiEventId> }).
 *
 * The recitation branch fires when session.metadata.effectiveMode ===
 * 'recitation'. We exercise it by seeding a learning_session with that
 * metadata value, then calling persistExchangeResult directly with an
 * active-status session object whose metadata carries effectiveMode:
 * 'recitation'.
 *
 * No internal mocks — real DB, real services.
 */

import { resolve } from 'path';
import { eq, and } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  learningSessions,
  practiceActivityEvents,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../test-utils/legacy-identity-anchors';
import { buildPracticeActivityDedupeKey } from '../practice-activity-events';
import { persistExchangeResult } from './session-exchange';
import { mapSessionRow } from './session-events';

// The workspace root is 5 levels up from apps/api/src/services/session/.
loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let seedCounter = 0;
// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded ids for v2 cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedProfile(
  db: Database,
): Promise<{ profileId: string; subjectId: string }> {
  const idx = ++seedCounter;
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId: `clerk_recit_integ_${RUN_ID}_${idx}`,
    email: `recit-integ-${RUN_ID}-${idx}@test.invalid`,
    displayName: `Recitation Tester ${idx}`,
    birthYear: 2010,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: `Subject ${idx}`,
    })
    .returning({ id: subjects.id });

  return { profileId, subjectId: subject!.id };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeIfDb('persistExchangeResult — recitation branch (integration)', () => {
  let db: Database;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await deleteV2IdentitiesForTest(db, {
      accountIds: seededAccountIds,
      profileIds: seededProfileIds,
    });
  });

  it('writes a practice_activity_events row with source_type=session_event and the canonical dedupe_key', async () => {
    const { profileId, subjectId } = await seedProfile(db);

    // Seed a learning_session whose metadata carries effectiveMode:
    // 'recitation' — the exact condition that gates the recitation branch.
    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        sessionType: 'learning',
        inputMode: 'text',
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        metadata: { effectiveMode: 'recitation' },
      })
      .returning();

    const session = mapSessionRow(sessionRow!);

    // Drive persistExchangeResult through the recitation branch.
    // clientId is omitted so the function inserts both user_message and
    // ai_response in a single INSERT (the non-clientId path), which is
    // the simplest way to guarantee an aiEventId is created.
    const result = await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'What does mitosis produce?',
      'Mitosis produces two genetically identical daughter cells.',
      1 /* effectiveRung */,
    );

    expect(result.exchangeCount).toBe(1);
    expect(result.aiEventId).toBeDefined();

    const aiEventId = result.aiEventId!;

    // Fetch the practice_activity_events row produced by the recitation
    // branch — scoped by both profileId and sourceId so we are not picking
    // up unrelated rows from concurrent test runs.
    const rows = await db
      .select()
      .from(practiceActivityEvents)
      .where(
        and(
          eq(practiceActivityEvents.profileId, profileId),
          eq(practiceActivityEvents.sourceId, aiEventId),
        ),
      );

    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    // Assert source classification.
    expect(row.sourceType).toBe('session_event');
    expect(row.activityType).toBe('recitation');
    expect(row.activitySubtype).toBe('recitation');

    // Assert the dedupe_key matches the canonical builder output for the
    // exact same inputs the recitation branch passes. This is the crux of
    // the review finding: the branch omits an explicit dedupeKey and relies
    // on recordPracticeActivityEvent to call buildPracticeActivityDedupeKey
    // internally. If the call site ever passes different inputs the key
    // will diverge — this test would catch that.
    const expectedKey = buildPracticeActivityDedupeKey({
      activityType: 'recitation',
      activitySubtype: 'recitation',
      sourceType: 'session_event',
      sourceId: aiEventId,
    });

    expect(row.dedupeKey).toBe(expectedKey);

    // Verify the ai_response session event that serves as the source
    // actually belongs to this profile.
    const aiEvent = await db
      .select({ id: sessionEvents.id, profileId: sessionEvents.profileId })
      .from(sessionEvents)
      .where(eq(sessionEvents.id, aiEventId));

    expect(aiEvent).toHaveLength(1);
    expect(aiEvent[0]!.profileId).toBe(profileId);
  });

  it('deduplicates: a second call with the same aiEventId does NOT insert a duplicate row', async () => {
    const { profileId, subjectId } = await seedProfile(db);

    const [sessionRow] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        sessionType: 'learning',
        inputMode: 'text',
        status: 'active',
        escalationRung: 1,
        exchangeCount: 0,
        metadata: { effectiveMode: 'recitation' },
      })
      .returning();

    const session = mapSessionRow(sessionRow!);

    // First call — exchange 1.
    const first = await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'First question',
      'First answer',
      1,
    );

    const aiEventId = first.aiEventId!;

    // Construct the dedupe_key and attempt a duplicate insert using the
    // public recordPracticeActivityEvent helper directly — this simulates
    // a retry / at-least-once delivery scenario.
    const { recordPracticeActivityEvent } =
      await import('../practice-activity-events');

    const dedupedResult = await recordPracticeActivityEvent(db, {
      profileId,
      subjectId,
      activityType: 'recitation',
      activitySubtype: 'recitation',
      completedAt: new Date(),
      sourceType: 'session_event',
      sourceId: aiEventId,
    });

    // onConflictDoNothing returns null when the row already exists.
    expect(dedupedResult).toBeNull();

    // Confirm exactly one row exists.
    const rows = await db
      .select()
      .from(practiceActivityEvents)
      .where(
        and(
          eq(practiceActivityEvents.profileId, profileId),
          eq(practiceActivityEvents.sourceId, aiEventId),
        ),
      );

    expect(rows).toHaveLength(1);
  });
});
