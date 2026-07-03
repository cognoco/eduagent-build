import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  practiceActivityEvents,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';
import { listPracticeActivityHistory } from './practice-activity-history';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
let db: Database;
let counter = 0;
// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded v2 ids for cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedProfile(): Promise<{ profileId: string }> {
  const idx = ++counter;
  const clerkUserId = `clerk_pahistory_${RUN_ID}_${idx}`;
  const email = `pahistory-${RUN_ID}-${idx}@test.invalid`;
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    displayName: 'Practice Learner',
    birthYear: 2012,
    clerkUserId,
    email,
    isOwner: true,
  });
  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);
  return { profileId };
}

async function seedTopic(
  profileId: string,
  subjectName: string,
  topicTitle: string,
): Promise<{ subjectId: string; topicId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: subjectName })
    .returning({ id: subjects.id });
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });
  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: `${subjectName} Book`,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });
  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: topicTitle,
      description: `${topicTitle} description`,
      sortOrder: 0,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });

  return { subjectId: subject!.id, topicId: topic!.id };
}

async function insertEvent(
  profileId: string,
  event: {
    activityType:
      | 'quiz'
      | 'review'
      | 'assessment'
      | 'dictation'
      | 'recitation'
      | 'fluency_drill';
    subjectId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  const dedupeKey = `pahistory_${RUN_ID}_${++counter}`;
  const [row] = await db
    .insert(practiceActivityEvents)
    .values({
      profileId,
      subjectId: event.subjectId ?? null,
      activityType: event.activityType,
      sourceType: 'integration_test',
      sourceId: dedupeKey,
      dedupeKey,
      metadata: event.metadata ?? {},
    })
    .returning({ id: practiceActivityEvents.id });
  return row!.id;
}

describeIfDb('listPracticeActivityHistory (integration)', () => {
  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await deleteV2IdentitiesForTest(db, {
      accountIds: [...seededAccountIds],
      profileIds: [...seededProfileIds],
    });
  });

  it('returns only the active profile’s events (profile-scoped)', async () => {
    const owner = await seedProfile();
    const other = await seedProfile();
    await insertEvent(owner.profileId, { activityType: 'quiz' });
    await insertEvent(other.profileId, { activityType: 'dictation' });

    const result = await listPracticeActivityHistory(db, owner.profileId);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.activityType).toBe('quiz');
    expect(result.nextCursor).toBeNull();
  });

  it('paginates newest-first with a cursor', async () => {
    const { profileId } = await seedProfile();
    await insertEvent(profileId, { activityType: 'quiz' });
    await insertEvent(profileId, { activityType: 'review' });
    const last = await insertEvent(profileId, { activityType: 'dictation' });

    const page1 = await listPracticeActivityHistory(db, profileId, {
      limit: 1,
    });
    expect(page1.items).toHaveLength(1);
    // Newest insert (highest UUIDv7 id) comes first.
    expect(page1.items[0]!.id).toBe(last);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listPracticeActivityHistory(db, profileId, {
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await listPracticeActivityHistory(db, profileId, {
      limit: 1,
      cursor: page2.nextCursor!,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
  });

  it('filters by activity type', async () => {
    const { profileId } = await seedProfile();
    await insertEvent(profileId, { activityType: 'quiz' });
    await insertEvent(profileId, { activityType: 'dictation' });

    const result = await listPracticeActivityHistory(db, profileId, {
      type: 'dictation',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.activityType).toBe('dictation');
  });

  it('resolves topic title + subject name best-effort, null when absent', async () => {
    const { profileId } = await seedProfile();
    const { subjectId, topicId } = await seedTopic(
      profileId,
      'Biology',
      'Photosynthesis',
    );
    // assessment carries metadata.topicId → resolvable headline
    await insertEvent(profileId, {
      activityType: 'assessment',
      subjectId,
      metadata: { topicId },
    });
    // dictation has no topic and no subject → both null
    const dictationId = await insertEvent(profileId, {
      activityType: 'dictation',
    });

    const result = await listPracticeActivityHistory(db, profileId);
    const byId = new Map(result.items.map((i) => [i.id, i]));

    const assessment = result.items.find(
      (i) => i.activityType === 'assessment',
    );
    expect(assessment?.topicTitle).toBe('Photosynthesis');
    expect(assessment?.subjectName).toBe('Biology');

    const dictation = byId.get(dictationId);
    expect(dictation?.topicTitle).toBeNull();
    expect(dictation?.subjectName).toBeNull();
  });

  it('does not resolve a topic title owned by another profile', async () => {
    const owner = await seedProfile();
    const intruder = await seedProfile();
    const { topicId } = await seedTopic(owner.profileId, 'Maths', 'Fractions');
    // intruder references the owner's topicId in metadata — must NOT leak.
    await insertEvent(intruder.profileId, {
      activityType: 'assessment',
      metadata: { topicId },
    });

    const result = await listPracticeActivityHistory(db, intruder.profileId);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.topicTitle).toBeNull();
  });
});
