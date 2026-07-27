/**
 * Integration: persistExchangeResult round-trips EVALUATE and TEACH_BACK
 * assessment signals through `session_events.metadata.signals.*` so that
 * `parseEvaluateAssessment` (services/evaluate.ts) and
 * `parseTeachBackAssessment` (services/teach-back.ts) can read them back.
 *
 * Wave-1 of bug #348 rewrote the prompts and parsers to live on the envelope
 * signal channel. The plumbing gap closed here: `envelopeToParsedExchange`
 * extracts the signals, `persistExchangeResult` writes them to
 * `aiMetadata.signals.{evaluate_assessment,teach_back_assessment}`, and the
 * parsers re-hydrate them. Without this round-trip every EVALUATE and
 * TEACH_BACK assessment is silently lost after the LLM call.
 *
 * No internal mocks — real DB, real services.
 */

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  learningSessions,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../../test-utils/legacy-identity-anchors';
import { parseEvaluateAssessment } from '../evaluate';
import { parseTeachBackAssessment } from '../teach-back';
import { persistExchangeResult } from './session-exchange';
import { mapSessionRow } from './session-events';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

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
    clerkUserId: `clerk_assess_integ_${RUN_ID}_${idx}`,
    email: `assess-integ-${RUN_ID}-${idx}@test.invalid`,
    displayName: `Assessment Tester ${idx}`,
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

async function seedSession(
  db: Database,
  profileId: string,
  subjectId: string,
  escalationRung = 1,
) {
  const [sessionRow] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung,
      exchangeCount: 0,
      metadata: {},
    })
    .returning();
  return mapSessionRow(sessionRow!);
}

describeIfDb(
  'persistExchangeResult — bug #348 envelope-signal assessment round-trip',
  () => {
    let db: Database;

    beforeAll(() => {
      db = createDatabase(process.env.DATABASE_URL!);
    });

    afterAll(async () => {
      await deleteV2IdentitiesForTest(db, {
        accountIds: seededAccountIds,
        profileIds: seededProfileIds,
      });
    });

    it('round-trips signals.evaluate_assessment through aiMetadata.signals so parseEvaluateAssessment reads it back', async () => {
      const { profileId, subjectId } = await seedProfile(db);
      const session = await seedSession(db, profileId, subjectId);

      // Wire-shape signal as emitted on the envelope by an EVALUATE turn.
      const evaluateAssessmentSignal = {
        challenge_passed: true,
        flaw_identified: 'Learner missed the role of activation energy.',
        quality: 4,
      } as const;

      const persisted = await persistExchangeResult(
        db,
        profileId,
        session.id,
        session,
        'A catalyst lowers the activation energy of a reaction.',
        // Persisted ai_response.content is the cleaned reply (prose only) — the
        // envelope JSON is NOT mirrored here. Parsers therefore MUST resolve
        // the assessment from metadata, not by re-parsing content.
        "That's mostly right — but what does a catalyst actually do that lets it lower activation energy?",
        1,
        {
          isUnderstandingCheck: false,
          timeToAnswerMs: 5000,
          hintCountInSession: 0,
          evaluateAssessment: evaluateAssessmentSignal,
        },
      );

      const aiEventId = persisted.aiEventId!;
      expect(aiEventId).toBeDefined();

      const [row] = await db
        .select({
          content: sessionEvents.content,
          metadata: sessionEvents.metadata,
        })
        .from(sessionEvents)
        .where(eq(sessionEvents.id, aiEventId));

      expect(row).toBeDefined();

      // Sanity: the persisted content is prose only — the parser CANNOT recover
      // the assessment from this branch, so the metadata branch is the only
      // path. This is exactly the failure mode bug #348 described.
      expect(row!.content.trim().startsWith('{')).toBe(false);

      const parsed = parseEvaluateAssessment({
        content: row!.content,
        metadata: row!.metadata,
      });

      expect(parsed).toEqual({
        challengePassed: true,
        quality: 4,
        flawIdentified: 'Learner missed the role of activation energy.',
      });
    });

    it('round-trips signals.teach_back_assessment through aiMetadata.signals so parseTeachBackAssessment reads it back', async () => {
      const { profileId, subjectId } = await seedProfile(db);
      const session = await seedSession(db, profileId, subjectId);

      const teachBackAssessmentSignal = {
        completeness: 3,
        accuracy: 4,
        clarity: 2,
        overall_quality: 3,
        weakest_area: 'clarity' as const,
        gap_identified: 'Learner did not explain WHY mitochondria need oxygen.',
      };

      const persisted = await persistExchangeResult(
        db,
        profileId,
        session.id,
        session,
        'Mitochondria make ATP using oxygen and food.',
        'Good summary! Can you say what would happen if there was no oxygen?',
        1,
        {
          isUnderstandingCheck: false,
          timeToAnswerMs: 7000,
          hintCountInSession: 0,
          teachBackAssessment: teachBackAssessmentSignal,
        },
      );

      const aiEventId = persisted.aiEventId!;
      expect(aiEventId).toBeDefined();

      const [row] = await db
        .select({
          content: sessionEvents.content,
          metadata: sessionEvents.metadata,
        })
        .from(sessionEvents)
        .where(eq(sessionEvents.id, aiEventId));

      expect(row).toBeDefined();
      expect(row!.content.trim().startsWith('{')).toBe(false);

      const parsed = parseTeachBackAssessment({
        content: row!.content,
        metadata: row!.metadata,
      });

      expect(parsed).toEqual({
        completeness: 3,
        accuracy: 4,
        clarity: 2,
        overallQuality: 3,
        weakestArea: 'clarity',
        gapIdentified: 'Learner did not explain WHY mitochondria need oxygen.',
      });
    });

    it('omits the signals sub-object on non-assessment turns (no key pollution)', async () => {
      const { profileId, subjectId } = await seedProfile(db);
      const session = await seedSession(db, profileId, subjectId);

      const persisted = await persistExchangeResult(
        db,
        profileId,
        session.id,
        session,
        'What is 2 + 2?',
        '4.',
        1,
        {
          isUnderstandingCheck: false,
          timeToAnswerMs: 1000,
          hintCountInSession: 0,
        },
      );

      const aiEventId = persisted.aiEventId!;
      const [row] = await db
        .select({ metadata: sessionEvents.metadata })
        .from(sessionEvents)
        .where(eq(sessionEvents.id, aiEventId));

      const meta = row!.metadata as Record<string, unknown> | null;
      expect(meta).toBeDefined();
      // No assessment signals were passed, so the `signals` key MUST NOT exist
      // on the persisted metadata. Empty/undefined keys would pollute the
      // jsonb column and confuse parsers that null-check `meta.signals`.
      expect(meta && 'signals' in meta).toBe(false);
    });

    it.each([
      ['correct', true, false],
      ['partial', false, true],
      ['incorrect', false, false],
      ['na', undefined, false],
    ] as const)(
      'round-trips answerEvaluation=%s with compatibility mapping',
      async (correctness, expectedCorrectAnswer, expectedPartialProgress) => {
        const { profileId, subjectId } = await seedProfile(db);
        const session = await seedSession(db, profileId, subjectId);

        const persisted = await persistExchangeResult(
          db,
          profileId,
          session.id,
          session,
          'Learner answer',
          'Mentor response',
          1,
          {
            isUnderstandingCheck: false,
            timeToAnswerMs: 1000,
            hintCountInSession: 0,
            partialProgress: false,
            answerEvaluation: { correctness, concept: 'fractions' },
          },
        );

        const [row] = await db
          .select({ metadata: sessionEvents.metadata })
          .from(sessionEvents)
          .where(eq(sessionEvents.id, persisted.aiEventId!));
        const metadata = row!.metadata as Record<string, unknown>;

        expect(metadata.answerEvaluation).toEqual({
          correctness,
          concept: 'fractions',
        });
        if (expectedCorrectAnswer === undefined) {
          expect(metadata).not.toHaveProperty('correctAnswer');
        } else {
          expect(metadata.correctAnswer).toBe(expectedCorrectAnswer);
        }
        expect(metadata.partialProgress).toBe(expectedPartialProgress);
      },
    );

    it('persists a truthful 5→4 downscaffolding audit with source streak 4', async () => {
      const { profileId, subjectId } = await seedProfile(db);
      const session = await seedSession(db, profileId, subjectId, 5);

      await persistExchangeResult(
        db,
        profileId,
        session.id,
        session,
        '42',
        'That is the product.',
        4,
        {
          isUnderstandingCheck: false,
          timeToAnswerMs: 1000,
          hintCountInSession: 0,
          answerEvaluation: { correctness: 'correct' },
          rungMovementStreak: 4,
          rungAction: 'deescalate',
          rungDirection: 'down',
          rungReason:
            'Four correct answers at the current rung — reducing support',
        },
      );

      const rows = await db
        .select({
          content: sessionEvents.content,
          metadata: sessionEvents.metadata,
          eventType: sessionEvents.eventType,
        })
        .from(sessionEvents)
        .where(eq(sessionEvents.sessionId, session.id));
      const aiResponse = rows.find((row) => row.eventType === 'ai_response');

      expect(aiResponse?.metadata).toMatchObject({
        escalationRung: 4,
        rungMovement: {
          fromRung: 5,
          toRung: 4,
          action: 'deescalate',
          direction: 'down',
          streak: 4,
          reason: 'Four correct answers at the current rung — reducing support',
        },
      });
      expect(rows.some((row) => row.eventType === 'escalation')).toBe(false);
      expect(rows.some((row) => /escalation offered/i.test(row.content))).toBe(
        false,
      );
    });
  },
);
