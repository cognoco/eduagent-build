import { resolve } from 'path';
import { like } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { listProfileSessions } from './session-crud';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
let db: Database;
let counter = 0;

async function seedProfileWithSubject(
  subjectName: string,
): Promise<{ profileId: string; subjectId: string }> {
  const idx = ++counter;
  const clerkUserId = `clerk_session_archive_${RUN_ID}_${idx}`;
  const email = `session-archive-${RUN_ID}-${idx}@test.invalid`;
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Session Learner',
      birthYear: 2012,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  const [subject] = await db
    .insert(subjects)
    .values({ profileId: profile!.id, name: subjectName })
    .returning({ id: subjects.id });

  return { profileId: profile!.id, subjectId: subject!.id };
}

describeIfDb('listProfileSessions (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_session_archive_${RUN_ID}%`));
  });

  it('is profile-scoped and cursor-paginates sessions', async () => {
    const owner = await seedProfileWithSubject('Chemistry');
    const other = await seedProfileWithSubject('History');
    await db.insert(learningSessions).values([
      {
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 1,
      },
      {
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 2,
      },
      {
        profileId: other.profileId,
        subjectId: other.subjectId,
        exchangeCount: 1,
      },
    ]);

    const page1 = await listProfileSessions(db, owner.profileId, { limit: 1 });

    expect(page1.sessions).toHaveLength(1);
    expect(page1.sessions[0]!.subjectName).toBe('Chemistry');
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listProfileSessions(db, owner.profileId, {
      limit: 1,
      cursor: page1.nextCursor!,
    });

    expect(page2.sessions).toHaveLength(1);
    expect(page2.sessions[0]!.subjectName).toBe('Chemistry');
    expect(page2.sessions[0]!.sessionId).not.toBe(page1.sessions[0]!.sessionId);
    expect(page2.nextCursor).toBeNull();
  });

  it('ignores zero-exchange sessions in the archive', async () => {
    const owner = await seedProfileWithSubject('Physics');
    await db.insert(learningSessions).values([
      {
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 0,
      },
    ]);

    const result = await listProfileSessions(db, owner.profileId);

    expect(result.sessions).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});
