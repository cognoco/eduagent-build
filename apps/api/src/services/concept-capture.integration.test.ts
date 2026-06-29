import { resolve } from 'path';
import { and, eq, like } from 'drizzle-orm';

import {
  accounts,
  conceptMastery,
  concepts,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import type {
  ChallengeRoundEvaluationItem,
  LearningSession,
} from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { captureConceptMastery } from './concept-capture';
import { getConceptMasterySignalsForTopics } from './concept-mastery';

loadDatabaseEnv(resolve(__dirname, '../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `concept-capture-${RUN_ID}`;

let db: Database;
let counter = 0;

async function seedProfile(): Promise<{ profileId: string }> {
  const idx = ++counter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}-${idx}`,
      email: `${CLERK_PREFIX}-${idx}@test.invalid`,
    })
    .returning({ id: accounts.id });
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Concept Capture Learner',
      birthYear: 2011,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return { profileId: profile!.id };
}

async function seedTopic(
  profileId: string,
): Promise<{ subjectId: string; topicId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: `Biology ${counter}`,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });
  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `Book ${counter}`,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });
  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: `ATP ${counter}`,
      description: 'Cell energy',
      sortOrder: 0,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });

  return { subjectId: subject!.id, topicId: topic!.id };
}

async function seedLearningSession(input: {
  profileId: string;
  subjectId: string;
  topicId: string;
}): Promise<LearningSession> {
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      sessionType: 'learning',
      inputMode: 'text',
    })
    .returning();

  return {
    id: session!.id,
    profileId: input.profileId,
    subjectId: input.subjectId,
    topicId: input.topicId,
    sessionType: 'learning',
    inputMode: 'text',
    verificationType: null,
    status: 'active',
    escalationRung: 1,
    exchangeCount: 0,
    startedAt: session!.startedAt.toISOString(),
    lastActivityAt: session!.lastActivityAt.toISOString(),
    endedAt: null,
    durationSeconds: null,
    wallClockSeconds: null,
    metadata: {},
    rawInput: null,
    filedAt: null,
    filingStatus: null,
    filingRetryCount: 0,
  };
}

function evaluation(
  concept: string,
  result: ChallengeRoundEvaluationItem['result'],
): ChallengeRoundEvaluationItem {
  return {
    concept,
    result,
    evidence: `${concept} evidence`,
    answerEventId: generateUUIDv7(),
    learnerQuote: `${concept} learner quote`,
    ...(result === 'misconception'
      ? {
          misconception: `${concept} misconception`,
          correction: `${concept} correction`,
        }
      : {}),
  };
}

async function rowsForTopic(profileId: string, topicId: string) {
  return db
    .select({
      label: concepts.label,
      normalizedLabel: concepts.normalizedLabel,
      status: conceptMastery.status,
      verifiedAt: conceptMastery.verifiedAt,
      lastEvaluatedAt: conceptMastery.lastEvaluatedAt,
      supersededAt: conceptMastery.supersededAt,
      learnerQuote: conceptMastery.learnerQuote,
    })
    .from(concepts)
    .innerJoin(conceptMastery, eq(conceptMastery.conceptId, concepts.id))
    .where(
      and(eq(concepts.profileId, profileId), eq(concepts.topicId, topicId)),
    );
}

describeIfDb('captureConceptMastery (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
  });

  it('captures solid, partial, missing, and misconception verdicts from enriched evaluations', async () => {
    const { profileId } = await seedProfile();
    const { subjectId, topicId } = await seedTopic(profileId);
    const session = await seedLearningSession({
      profileId,
      subjectId,
      topicId,
    });
    const now = new Date('2026-06-08T12:00:00.000Z');

    await captureConceptMastery(
      db,
      profileId,
      session,
      topicId,
      [
        evaluation('ATP', 'solid'),
        evaluation('ADP', 'partial'),
        evaluation('Mitochondria', 'missing'),
        evaluation('Chlorophyll', 'misconception'),
      ],
      now,
    );

    const rows = await rowsForTopic(profileId, topicId);

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.status).sort()).toEqual([
      'misconception',
      'missing',
      'partial',
      'solid',
    ]);
    expect(rows.find((row) => row.label === 'ATP')?.verifiedAt).toEqual(now);
    expect(rows.find((row) => row.label === 'ADP')?.verifiedAt).toBeNull();
    expect(rows.find((row) => row.label === 'Mitochondria')?.status).toBe(
      'missing',
    );
    expect(
      rows.every((row) => row.learnerQuote?.endsWith('learner quote')),
    ).toBe(true);
  });

  it('dedupes normalized labels within a profile topic', async () => {
    const { profileId } = await seedProfile();
    const { subjectId, topicId } = await seedTopic(profileId);
    const session = await seedLearningSession({
      profileId,
      subjectId,
      topicId,
    });

    await captureConceptMastery(
      db,
      profileId,
      session,
      topicId,
      [evaluation('ATP', 'partial'), evaluation(' ATP  ', 'solid')],
      new Date('2026-06-08T12:05:00.000Z'),
    );

    const rows = await rowsForTopic(profileId, topicId);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: 'ATP',
      normalizedLabel: 'atp',
      status: 'solid',
    });
  });

  it('supersedes older live concepts absent from a later evaluated set and can un-supersede them', async () => {
    const { profileId } = await seedProfile();
    const { subjectId, topicId } = await seedTopic(profileId);
    const session = await seedLearningSession({
      profileId,
      subjectId,
      topicId,
    });

    await captureConceptMastery(
      db,
      profileId,
      session,
      topicId,
      [evaluation('ATP', 'partial')],
      new Date('2026-06-08T12:10:00.000Z'),
    );
    await captureConceptMastery(
      db,
      profileId,
      session,
      topicId,
      [
        evaluation('ATP synthesis', 'solid'),
        evaluation('Electron transport', 'solid'),
      ],
      new Date('2026-06-08T12:20:00.000Z'),
    );

    let rows = await rowsForTopic(profileId, topicId);
    expect(rows.find((row) => row.label === 'ATP')?.supersededAt).toEqual(
      new Date('2026-06-08T12:20:00.000Z'),
    );
    const signals = await getConceptMasterySignalsForTopics(db, profileId, [
      topicId,
    ]);
    expect(signals.get(topicId)).toMatchObject({
      verified: true,
      hasMentorAddition: false,
    });

    await captureConceptMastery(
      db,
      profileId,
      session,
      topicId,
      [evaluation('ATP', 'partial')],
      new Date('2026-06-08T12:30:00.000Z'),
    );

    rows = await rowsForTopic(profileId, topicId);
    expect(rows.find((row) => row.label === 'ATP')?.supersededAt).toBeNull();
    expect(rows.find((row) => row.label === 'ATP')?.status).toBe('partial');
  });
});
