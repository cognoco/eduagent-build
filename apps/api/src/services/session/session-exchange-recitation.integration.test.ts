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
import {
  claimRecitationSetupTransition,
  persistExchangeResult,
} from './session-exchange';
import { startSession } from './session-crud';
import { mapSessionRow } from './session-events';
import { RECITATION_SETUP_CLAIM_METADATA_KEY } from './session-recitation-setup';

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

  it('persists setup state only with a new assistant event and does not advance it on client replay', async () => {
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
    const clientId = `recitation-setup-${profileId}`;
    const sensitiveAuditText = 'learner recitation must not persist';

    const first = await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'selection',
      'ready',
      1,
      {
        recitationSetup: { phase: 'ready', clarificationCount: 0 },
        sourceAudit: {
          status: 'ok',
          reliedOnSourceIds: ['recitation_text'],
          reliableReliedOnSourceIds: ['recitation_text'],
          unsupportedSourceIds: [],
          availableReliableSourceIds: ['recitation_text'],
          insufficient: false,
          reason: sensitiveAuditText,
          evidence: [
            {
              id: 'recitation_text',
              kind: 'recitation_text',
              reliability: 'learner_provided',
              label: 'Learner recitation',
              excerpt: sensitiveAuditText,
              reliableForFacts: true,
            },
          ],
        },
      },
      clientId,
    );
    const duplicate = await persistExchangeResult(
      db,
      profileId,
      session.id,
      session,
      'duplicate selection',
      'duplicate reply',
      1,
      {
        recitationSetup: {
          phase: 'awaiting_selection',
          clarificationCount: 1,
        },
      },
      clientId,
    );

    expect(first.persistedUserMessage).toBe(true);
    expect(duplicate.persistedUserMessage).toBe(false);

    const assistantEvents = await db
      .select({ metadata: sessionEvents.metadata })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.sessionId, session.id),
          eq(sessionEvents.eventType, 'ai_response'),
        ),
      );
    expect(assistantEvents).toHaveLength(1);
    expect(assistantEvents[0]?.metadata).toMatchObject({
      recitationSetup: { phase: 'ready', clarificationCount: 0 },
      sourceAudit: {
        status: 'ok',
        reliedOnSourceIds: ['recitation_text'],
        reason: '[redacted: source audit reason present]',
        evidence: [
          {
            id: 'recitation_text',
            excerpt: '[redacted: source evidence excerpt present]',
          },
        ],
      },
    });
    expect(JSON.stringify(assistantEvents[0]?.metadata)).not.toContain(
      sensitiveAuditText,
    );

    const [persistedSession] = await db
      .select({ metadata: learningSessions.metadata })
      .from(learningSessions)
      .where(eq(learningSessions.id, session.id));
    expect(persistedSession?.metadata).toEqual({ effectiveMode: 'recitation' });
  });

  it('serializes distinct recitation setup turns so only one clarification is claimed', async () => {
    const { profileId, subjectId } = await seedProfile(db);
    const secondDb = createDatabase(process.env.DATABASE_URL!);
    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
      metadata: { effectiveMode: 'recitation' },
    });

    const clientIds = ['recitation-race-a', 'recitation-race-b'] as const;
    const messages = ["I don't know", 'still not sure'] as const;
    const transitions = await Promise.all([
      claimRecitationSetupTransition(
        db,
        profileId,
        session.id,
        messages[0],
        clientIds[0],
      ),
      claimRecitationSetupTransition(
        secondDb,
        profileId,
        session.id,
        messages[1],
        clientIds[1],
      ),
    ]);

    expect(transitions.map((transition) => transition?.action).sort()).toEqual([
      'clarify_selection',
      'invite_after_cap',
    ]);

    const [beforeReplaySession] = await db
      .select({ metadata: learningSessions.metadata })
      .from(learningSessions)
      .where(eq(learningSessions.id, session.id));
    const beforeReplayClaim = (
      beforeReplaySession?.metadata as Record<string, unknown>
    )[RECITATION_SETUP_CLAIM_METADATA_KEY];

    const clarificationIndex = transitions.findIndex(
      (transition) => transition?.action === 'clarify_selection',
    );
    const replay = await claimRecitationSetupTransition(
      db,
      profileId,
      session.id,
      messages[clarificationIndex]!,
      clientIds[clarificationIndex]!,
    );
    expect(replay?.action).toBe('clarify_selection');

    const moderationFlags = await db
      .select({ id: sessionEvents.id })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.sessionId, session.id),
          eq(sessionEvents.eventType, 'flag'),
        ),
      );
    expect(moderationFlags).toHaveLength(0);

    const [startEvent] = await db
      .select({ metadata: sessionEvents.metadata })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.sessionId, session.id),
          eq(sessionEvents.eventType, 'session_start'),
        ),
      );
    expect(startEvent?.metadata).not.toHaveProperty('recitationSetup');

    const [persistedSession] = await db
      .select({ metadata: learningSessions.metadata })
      .from(learningSessions)
      .where(eq(learningSessions.id, session.id));
    expect(persistedSession?.metadata).toMatchObject({
      effectiveMode: 'recitation',
      inputMode: 'text',
      [RECITATION_SETUP_CLAIM_METADATA_KEY]: {
        phase: 'ready',
        clarificationCount: 1,
        lastAction: 'invite_after_cap',
      },
    });
    const persistedClaim = (
      persistedSession?.metadata as Record<string, unknown>
    )[RECITATION_SETUP_CLAIM_METADATA_KEY];
    expect(persistedClaim).toEqual(beforeReplayClaim);
    expect(JSON.stringify(persistedClaim)).not.toContain("I don't know");
    expect(JSON.stringify(persistedClaim)).not.toContain('still not sure');
  });

  it('replays the same recitation setup claim without consuming the clarification cap', async () => {
    const { profileId, subjectId } = await seedProfile(db);
    const secondDb = createDatabase(process.env.DATABASE_URL!);
    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
      metadata: { effectiveMode: 'recitation' },
    });
    const clientId = 'recitation-replay';

    const transitions = await Promise.all([
      claimRecitationSetupTransition(
        db,
        profileId,
        session.id,
        "I don't know",
        clientId,
      ),
      claimRecitationSetupTransition(
        secondDb,
        profileId,
        session.id,
        "I don't know",
        clientId,
      ),
    ]);

    expect(transitions.map((transition) => transition?.action)).toEqual([
      'clarify_selection',
      'clarify_selection',
    ]);
    const [persistedSession] = await db
      .select({ metadata: learningSessions.metadata })
      .from(learningSessions)
      .where(eq(learningSessions.id, session.id));
    expect(persistedSession?.metadata).toMatchObject({
      [RECITATION_SETUP_CLAIM_METADATA_KEY]: {
        phase: 'awaiting_selection',
        clarificationCount: 1,
        lastAction: 'clarify_selection',
        lastClientId: clientId,
        recentClaims: [
          {
            clientId,
            action: 'clarify_selection',
            phase: 'awaiting_selection',
            clarificationCount: 1,
          },
        ],
      },
    });
  });
});
