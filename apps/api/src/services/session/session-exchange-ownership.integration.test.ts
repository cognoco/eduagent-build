import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  challengeRoundCooldowns,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningProfiles,
  learningSessions,
  membership,
  organization,
  person,
  retentionCards,
  sessionEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import { deleteV2IdentitiesForTest } from '../../test-utils/legacy-identity-anchors';
import { prepareExchangeContext } from './session-exchange';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

let seedCounter = 0;
// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded ids for v2 cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedProfileWithSubject(
  db: Database,
  subjectName: string,
): Promise<{ profileId: string; subjectId: string }> {
  const idx = ++seedCounter;
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  // [WI-867] v2 identity rows — always seeded (flag collapsed to v2-only).
  await db
    .insert(organization)
    .values({ id: accountId, name: `WI-80 Org ${idx}` });
  await db.insert(person).values({
    id: profileId,
    displayName: `WI-80 Learner ${idx}`,
    birthDate: '2011-06-15',
    residenceJurisdiction: 'US',
  });
  await db.insert(membership).values({
    personId: profileId,
    organizationId: accountId,
    roles: ['admin', 'learner'],
  });

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: subjectName,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  return { profileId, subjectId: subject!.id };
}

async function seedTopic(
  db: Database,
  input: { subjectId: string; title: string; description?: string },
): Promise<string> {
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: input.subjectId, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: input.subjectId,
      title: `${input.title} Book`,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: input.title,
      description: input.description ?? `${input.title} description`,
      sortOrder: 0,
      estimatedMinutes: 20,
      skipped: false,
    })
    .returning({ id: curriculumTopics.id });

  return topic!.id;
}

async function seedSession(
  db: Database,
  input: {
    profileId: string;
    subjectId: string;
    topicId?: string | null;
    sessionType?: 'learning' | 'homework' | 'interleaved';
    metadata?: Record<string, unknown>;
    exchangeCount?: number;
  },
): Promise<string> {
  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: input.profileId,
      subjectId: input.subjectId,
      topicId: input.topicId ?? null,
      sessionType: input.sessionType ?? 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: input.exchangeCount ?? 0,
      metadata: input.metadata ?? {},
    })
    .returning({ id: learningSessions.id });

  return session!.id;
}

async function seedChallengeEligibleSession(db: Database): Promise<{
  profileId: string;
  subjectId: string;
  topicId: string;
  sessionId: string;
}> {
  const seeded = await seedProfileWithSubject(db, 'Challenge Biology');
  const topicId = await seedTopic(db, {
    subjectId: seeded.subjectId,
    title: 'Cell Energy',
  });
  const sessionId = await seedSession(db, {
    profileId: seeded.profileId,
    subjectId: seeded.subjectId,
    topicId,
    exchangeCount: 7,
  });

  await db.insert(sessionEvents).values(
    Array.from({ length: 4 }, (_, index) => ({
      sessionId,
      profileId: seeded.profileId,
      subjectId: seeded.subjectId,
      topicId,
      eventType: 'ai_response' as const,
      content: `solid answer ${index + 1}`,
      metadata: { escalationRung: 1, correctAnswer: true },
      createdAt: new Date(Date.UTC(2026, 4, 19, 12, index, 0)),
    })),
  );

  return { ...seeded, topicId, sessionId };
}

async function prepare(db: Database, profileId: string, sessionId: string) {
  return prepareExchangeContext(db, profileId, sessionId, 'Can we continue?', {
    semanticMemoryRetrievalEnabled: false,
    memoryFactsReadEnabled: false,
    memoryFactsRelevanceEnabled: false,
  });
}

async function prepareWithQuota(
  db: Database,
  profileId: string,
  sessionId: string,
) {
  return prepareExchangeContext(db, profileId, sessionId, 'Can we continue?', {
    semanticMemoryRetrievalEnabled: false,
    memoryFactsReadEnabled: false,
    memoryFactsRelevanceEnabled: false,
    subscriptionTier: 'free',
    quotaRemainingTurns: 3,
    quotaFractionRemaining: 0.3,
  });
}

describeIfDb('prepareExchangeContext WI-80 ownership hardening', () => {
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

  it('[WI-80] suppresses current-topic prompt metadata when a stale session topic belongs to another profile', async () => {
    const own = await seedProfileWithSubject(db, 'Science');
    const foreign = await seedProfileWithSubject(db, 'Private Biology');
    const foreignTopicId = await seedTopic(db, {
      subjectId: foreign.subjectId,
      title: 'Foreign Mitochondria Topic',
      description: 'Private cell-powerhouse notes',
    });
    const sessionId = await seedSession(db, {
      profileId: own.profileId,
      subjectId: own.subjectId,
      topicId: foreignTopicId,
    });

    const prep = await prepare(db, own.profileId, sessionId);

    expect(prep.context.subjectName).toBe('Science');
    expect(prep.context.topicTitle).toBeUndefined();
    expect(prep.context.topicDescription).toBeUndefined();
    expect(JSON.stringify(prep.context)).not.toContain(
      'Foreign Mitochondria Topic',
    );
    expect(JSON.stringify(prep.context)).not.toContain(
      'Private cell-powerhouse notes',
    );
  });

  it('sets Challenge Round eligibility for a strong new-topic session with enough remaining quota', async () => {
    const seeded = await seedChallengeEligibleSession(db);

    const result = await prepareWithQuota(
      db,
      seeded.profileId,
      seeded.sessionId,
    );

    expect(result.context.challengeEligible).toBe(true);
  });

  it('suppresses Challenge Round eligibility inside the decline cooldown window', async () => {
    const seeded = await seedChallengeEligibleSession(db);
    await db.insert(challengeRoundCooldowns).values({
      profileId: seeded.profileId,
      topicId: seeded.topicId,
      lastOutcome: 0,
      lastOfferedAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await prepareWithQuota(
      db,
      seeded.profileId,
      seeded.sessionId,
    );

    expect(result.context.challengeEligible).toBe(false);
  });

  it('[WI-80] filters interleaved metadata topics through profile ownership before prompt hydration', async () => {
    const own = await seedProfileWithSubject(db, 'Math');
    const foreign = await seedProfileWithSubject(db, 'Private Algebra');
    const foreignTopicId = await seedTopic(db, {
      subjectId: foreign.subjectId,
      title: 'Foreign Quadratics Topic',
    });
    const sessionId = await seedSession(db, {
      profileId: own.profileId,
      subjectId: own.subjectId,
      sessionType: 'interleaved',
      metadata: {
        interleavedTopics: [
          {
            topicId: foreignTopicId,
            subjectId: foreign.subjectId,
            topicTitle: 'Foreign Metadata Fallback',
          },
        ],
      },
    });

    const prep = await prepare(db, own.profileId, sessionId);

    expect(prep.context.interleavedTopics ?? []).toEqual([]);
    expect(JSON.stringify(prep.context)).not.toContain(
      'Foreign Quadratics Topic',
    );
    expect(JSON.stringify(prep.context)).not.toContain(
      'Foreign Metadata Fallback',
    );
  });

  it('[WI-80] ignores stale strong retention-card topic IDs when enriching learner memory', async () => {
    const own = await seedProfileWithSubject(db, 'Science');
    const foreign = await seedProfileWithSubject(db, 'Private Science');
    const foreignTopicId = await seedTopic(db, {
      subjectId: foreign.subjectId,
      title: 'Foreign Strong Memory Topic',
    });
    await db.insert(learningProfiles).values({
      profileId: own.profileId,
      memoryEnabled: true,
      memoryInjectionEnabled: true,
      memoryConsentStatus: 'granted',
      struggles: [
        {
          subject: 'Science',
          topic: 'Foreign Strong Memory Topic',
          lastSeen: '2026-05-20',
          attempts: 2,
          confidence: 'medium',
        },
      ],
    });
    await db.insert(retentionCards).values({
      profileId: own.profileId,
      topicId: foreignTopicId,
      intervalDays: 21,
      repetitions: 5,
    });
    const sessionId = await seedSession(db, {
      profileId: own.profileId,
      subjectId: own.subjectId,
    });

    const prep = await prepare(db, own.profileId, sessionId);

    expect(prep.context.learnerMemoryContext).toContain(
      'Foreign Strong Memory Topic',
    );
  });

  it('[WI-80] suppresses homework library context when the session subject is stale and foreign', async () => {
    const own = await seedProfileWithSubject(db, 'Own Homework');
    const foreign = await seedProfileWithSubject(db, 'Private Homework');
    await seedTopic(db, {
      subjectId: foreign.subjectId,
      title: 'Foreign Homework Library Topic',
    });
    const sessionId = await seedSession(db, {
      profileId: own.profileId,
      subjectId: foreign.subjectId,
      sessionType: 'homework',
    });

    const prep = await prepare(db, own.profileId, sessionId);

    expect(JSON.stringify(prep.context)).not.toContain(
      'Foreign Homework Library Topic',
    );
    expect(prep.context.learningHistoryContext).toBeUndefined();
  });
});
