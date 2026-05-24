import { resolve } from 'path';
import { like } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningProfiles,
  learningSessions,
  profiles,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import { prepareExchangeContext } from './session-exchange';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();

let seedCounter = 0;

async function seedProfileWithSubject(
  db: Database,
  subjectName: string,
): Promise<{ profileId: string; subjectId: string }> {
  const idx = ++seedCounter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_wi80_exchange_${RUN_ID}_${idx}`,
      email: `wi80-exchange-${RUN_ID}-${idx}@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `WI-80 Learner ${idx}`,
      birthYear: 2011,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: subjectName,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  return { profileId: profile!.id, subjectId: subject!.id };
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
      exchangeCount: 0,
      metadata: input.metadata ?? {},
    })
    .returning({ id: learningSessions.id });

  return session!.id;
}

async function prepare(db: Database, profileId: string, sessionId: string) {
  return prepareExchangeContext(db, profileId, sessionId, 'Can we continue?', {
    semanticMemoryRetrievalEnabled: false,
    memoryFactsReadEnabled: false,
    memoryFactsRelevanceEnabled: false,
  });
}

describeIfDb('prepareExchangeContext WI-80 ownership hardening', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_wi80_exchange_${RUN_ID}%`));
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
