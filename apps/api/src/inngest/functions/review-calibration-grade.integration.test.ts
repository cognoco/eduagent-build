/**
 * review-calibration-grade — committed-write/lost-ack replay integration.
 *
 * Uses @inngest/test checkpoint state and the real database. The only test
 * double is the paid LLM provider boundary. In particular, no production
 * module or database helper is mocked.
 */

import { resolve } from 'path';
import { InngestTestEngine } from '@inngest/test';
import { InngestExecutionV1 } from 'inngest/internals';
import { and, eq, inArray } from 'drizzle-orm';
import {
  closeDatabase,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  person,
  retentionCards,
  retrievalEvents,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  _clearProviders,
  _resetCircuits,
  registerProvider,
  type ChatMessage,
  type LLMProvider,
  type ModelConfig,
} from '../../services/llm';
import type { ChatResult, ChatStreamResult } from '../../services/llm/types';
import { runWithInngestRequestContext } from '../helpers';
import { reviewCalibrationGrade } from './review-calibration-grade';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const RUN_ID = generateUUIDv7();
const createdProfileIds: string[] = [];

let db: Database;
let databaseUrl: string;
let graderResponse = '';
let paidGradeCalls = 0;

function requireDatabaseUrl(): string {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for review-calibration-grade integration tests',
    );
  }
  return databaseUrl;
}

function createGraderProvider(): LLMProvider {
  return {
    id: 'gemini',
    async chat(
      _messages: ChatMessage[],
      _config: ModelConfig,
    ): Promise<ChatResult> {
      paidGradeCalls += 1;
      return { content: graderResponse, stopReason: 'stop' };
    },
    chatStream(): ChatStreamResult {
      throw new Error('review calibration grading does not stream');
    },
  };
}

async function seedScenario(label: string) {
  const profileId = generateUUIDv7();
  createdProfileIds.push(profileId);

  await db.insert(person).values({
    id: profileId,
    displayName: `WI-2009 ${label} ${RUN_ID}`,
    birthDate: '2000-01-01',
    residenceJurisdiction: 'EU',
  });

  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: `Biology ${label} ${RUN_ID}` })
    .returning({ id: subjects.id });
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });
  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Energy ${label} ${RUN_ID}`,
      sortOrder: 1,
    })
    .returning({ id: curriculumBooks.id });
  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Photosynthesis',
      description: 'How plants convert light into stored energy',
      sortOrder: 1,
      estimatedMinutes: 20,
    })
    .returning({ id: curriculumTopics.id });
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: subject!.id,
      topicId: topic!.id,
      sessionType: 'learning',
      status: 'active',
      exchangeCount: 1,
    })
    .returning({ id: learningSessions.id });
  const [learnerMessage] = await db
    .insert(sessionEvents)
    .values({
      sessionId: session!.id,
      profileId,
      subjectId: subject!.id,
      topicId: topic!.id,
      eventType: 'user_message',
      content: 'Plants store light energy as chemical energy in glucose.',
    })
    .returning({ id: sessionEvents.id });

  await db.insert(retentionCards).values({
    profileId,
    topicId: topic!.id,
  });

  return {
    profileId,
    sessionId: session!.id,
    topicId: topic!.id,
    learnerMessageEventId: learnerMessage!.id,
    timestamp: new Date().toISOString(),
  };
}

beforeAll(() => {
  databaseUrl = requireDatabaseUrl();
  db = createDatabase(databaseUrl);
});

beforeEach(() => {
  paidGradeCalls = 0;
  _clearProviders();
  _resetCircuits();
  registerProvider(createGraderProvider());
});

afterAll(async () => {
  if (createdProfileIds.length > 0) {
    await db.delete(person).where(inArray(person.id, createdProfileIds));
  }
  _clearProviders();
  _resetCircuits();
  await closeDatabase(db);
});

describe('reviewCalibrationGrade committed-write/lost-ack replay', () => {
  it.each([
    {
      label: 'graded',
      response: JSON.stringify({
        quality: 2,
        verdict: 'misconception',
        rationale: 'The answer confuses the source and stored forms of energy.',
        misconception: 'Glucose is made directly from light.',
      }),
      expectedGrader: 'llm' as const,
      expectedQuality: 2,
      expectedVerdict: 'misconception' as const,
      expectedRationale:
        'The answer confuses the source and stored forms of energy.',
      expectedMisconception: 'Glucose is made directly from light.',
      expectedStepResult: {
        outcome: 'graded',
        quality: 2,
        verdict: 'misconception',
      },
    },
    {
      label: 'fallback',
      response: 'not valid grader JSON',
      expectedGrader: 'fallback_heuristic' as const,
      expectedQuality: null,
      expectedVerdict: null,
      expectedRationale: null,
      expectedMisconception: null,
      expectedStepResult: { outcome: 'fallback', capped: false },
    },
  ])(
    'uses the committed $label retrieval row as the replay receipt',
    async ({
      label,
      response,
      expectedGrader,
      expectedQuality,
      expectedVerdict,
      expectedRationale,
      expectedMisconception,
      expectedStepResult,
    }) => {
      graderResponse = response;
      const payload = await seedScenario(label);
      const event = {
        name: 'app/review.calibration.requested',
        data: payload,
      };

      // Capture only the checkpoints acknowledged before the paid grade/write
      // step. The first grade execution commits its row, then we intentionally
      // discard that step checkpoint to model a lost Inngest acknowledgement.
      const acknowledgedSteps: InngestTestEngine.MockedStep[] = [];
      const firstAttempt = new InngestTestEngine({
        function: reviewCalibrationGrade,
        events: [event],
        steps: acknowledgedSteps,
      });
      await runWithInngestRequestContext({ databaseUrl }, () =>
        firstAttempt.executeStep('claim-cooldown-slot'),
      );
      const claimStepId = InngestExecutionV1._internals.hashId(
        'claim-cooldown-slot',
      );
      const gradeStepId = InngestExecutionV1._internals.hashId(
        'rehydrate-grade-and-record',
      );
      expect(acknowledgedSteps.some(({ id }) => id === claimStepId)).toBe(true);
      await runWithInngestRequestContext({ databaseUrl }, () =>
        firstAttempt.executeStep('rehydrate-grade-and-record'),
      );
      // @inngest/test appends the just-run target as the final checkpoint.
      // Remove only that grade/write acknowledgement: load + cooldown claim
      // remain acknowledged, while the committed database row remains real.
      const lostGradeAcknowledgement = acknowledgedSteps.pop();
      expect(lostGradeAcknowledgement?.id).toBe(gradeStepId);
      const beforeGradeCheckpoint = [...acknowledgedSteps];
      expect(beforeGradeCheckpoint.some(({ id }) => id === claimStepId)).toBe(
        true,
      );
      expect(beforeGradeCheckpoint.some(({ id }) => id === gradeStepId)).toBe(
        false,
      );

      const committedRows = await db
        .select()
        .from(retrievalEvents)
        .where(
          and(
            eq(retrievalEvents.profileId, payload.profileId),
            eq(retrievalEvents.answerEventId, payload.learnerMessageEventId),
          ),
        );
      expect(committedRows).toHaveLength(1);

      // A fresh engine has no in-memory result from the grade step. It gets
      // only the pre-grade durable checkpoints, exactly as an Inngest replay
      // after the DB commit was acknowledged by Postgres but not by Inngest.
      const replay = new InngestTestEngine({
        function: reviewCalibrationGrade,
        events: [event],
        steps: beforeGradeCheckpoint,
      });
      const replayedGrade = await runWithInngestRequestContext(
        { databaseUrl },
        () => replay.executeStep('rehydrate-grade-and-record'),
      );

      const rowsAfterReplay = await db
        .select()
        .from(retrievalEvents)
        .where(
          and(
            eq(retrievalEvents.profileId, payload.profileId),
            eq(retrievalEvents.answerEventId, payload.learnerMessageEventId),
          ),
        );

      expect(paidGradeCalls).toBe(1);
      expect(replayedGrade.result).toEqual(expectedStepResult);
      expect(rowsAfterReplay).toHaveLength(1);
      expect(rowsAfterReplay[0]).toMatchObject({
        id: payload.learnerMessageEventId,
        gradedBy: expectedGrader,
        quality: expectedQuality,
        verdict: expectedVerdict,
        rubricRationale: expectedRationale,
        misconception: expectedMisconception,
      });
    },
    30_000,
  );
});
