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
  profiles,
  subjects,
  topicNotes,
  type Database,
} from '@eduagent/database';
import { listAllNotes } from './notes';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
let db: Database;
let counter = 0;

async function seedProfile(): Promise<{ profileId: string }> {
  const idx = ++counter;
  const clerkUserId = `clerk_allnotes_${RUN_ID}_${idx}`;
  const email = `allnotes-${RUN_ID}-${idx}@test.invalid`;
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Notes Learner',
      birthYear: 2012,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  return { profileId: profile!.id };
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

describeIfDb('listAllNotes (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_allnotes_${RUN_ID}%`));
  });

  it('is profile-scoped and includes topic context', async () => {
    const owner = await seedProfile();
    const other = await seedProfile();
    const ownerTopic = await seedTopic(
      owner.profileId,
      'Chemistry',
      'Atomic Structure',
    );
    const otherTopic = await seedTopic(
      other.profileId,
      'Biology',
      'Cell Structure',
    );
    await db.insert(topicNotes).values([
      {
        profileId: owner.profileId,
        topicId: ownerTopic.topicId,
        content: 'Atoms are mostly empty space.',
      },
      {
        profileId: other.profileId,
        topicId: otherTopic.topicId,
        content: 'Cells have membranes.',
      },
    ]);

    const result = await listAllNotes(db, owner.profileId);

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({
      subjectName: 'Chemistry',
      topicTitle: 'Atomic Structure',
      content: 'Atoms are mostly empty space.',
    });
    expect(result.notes[0]!.content).not.toContain('Cells');
  });

  it('supports subject filtering and cursor pagination', async () => {
    const { profileId } = await seedProfile();
    const chemistry = await seedTopic(profileId, 'Chemistry', 'Bonds');
    const history = await seedTopic(profileId, 'History', 'Ancient Rome');
    await db.insert(topicNotes).values([
      {
        profileId,
        topicId: history.topicId,
        content: 'Rome note should be filtered out.',
      },
      {
        profileId,
        topicId: chemistry.topicId,
        content: 'First chemistry note.',
      },
      {
        profileId,
        topicId: chemistry.topicId,
        content: 'Second chemistry note.',
      },
    ]);

    const page1 = await listAllNotes(db, profileId, {
      subjectId: chemistry.subjectId,
      limit: 1,
    });
    expect(page1.notes).toHaveLength(1);
    expect(page1.notes[0]!.subjectName).toBe('Chemistry');
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listAllNotes(db, profileId, {
      subjectId: chemistry.subjectId,
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(page2.notes).toHaveLength(1);
    expect(page2.notes[0]!.subjectName).toBe('Chemistry');
    expect(page2.notes[0]!.id).not.toBe(page1.notes[0]!.id);
    expect(page2.nextCursor).toBeNull();
  });
});
