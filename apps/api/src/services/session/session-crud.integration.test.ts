import { resolve } from 'path';
import { like } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  learningSessions,
  profiles,
  sessionEvents,
  sessionSummaries,
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

  // [BUG-102 / BUG-106] BREAK TEST — pre-fix, hydrateChildSessions batched
  // session_summaries, subjects, curriculum_topics, and ai_response drill
  // events purely by sessionId/subjectId/topicId, with no profileId
  // predicate. We simulate the leak by seeding an extra summary AND an
  // ai_response drill row owned by a sibling profile that point at the
  // owner's session row. Without the fix those rows would be returned in
  // the owner's archive view.
  it('[BREAK] [BUG-102/106] hydrateChildSessions filters secondary rows by profileId', async () => {
    const owner = await seedProfileWithSubject('Biology');
    const sibling = await seedProfileWithSubject('Biology-sibling');

    const [ownerSession] = await db
      .insert(learningSessions)
      .values({
        profileId: owner.profileId,
        subjectId: owner.subjectId,
        exchangeCount: 1,
      })
      .returning({ id: learningSessions.id });

    // Owner-authored summary (correct)
    await db.insert(sessionSummaries).values({
      sessionId: ownerSession!.id,
      profileId: owner.profileId,
      narrative: 'owner-narrative',
      highlight: 'owner-highlight',
      content: 'owner-content',
      status: 'accepted',
    });

    // Simulated leak: sibling-owned summary at the same sessionId. The
    // pre-fix WHERE-only-by-sessionId query would happily return this row.
    await db.insert(sessionSummaries).values({
      sessionId: ownerSession!.id,
      profileId: sibling.profileId,
      narrative: 'LEAK-sibling-narrative',
      highlight: 'LEAK-sibling-highlight',
      content: 'LEAK-sibling-content',
      status: 'accepted',
    });

    // Simulated leak: sibling-owned drill event also pointing at the owner
    // session — same shape of cross-account leak.
    await db.insert(sessionEvents).values({
      sessionId: ownerSession!.id,
      profileId: sibling.profileId,
      subjectId: sibling.subjectId,
      eventType: 'ai_response',
      content: 'LEAK',
      drillCorrect: 9999,
      drillTotal: 9999,
    });

    const result = await listProfileSessions(db, owner.profileId);

    expect(result.sessions).toHaveLength(1);
    const row = result.sessions[0]!;
    // Narrative must be the owner's, never the sibling's.
    expect(row.narrative).toBe('owner-narrative');
    expect(row.highlight).toBe('owner-highlight');
    // Drills must not include the sibling's leak event.
    expect(row.drills).not.toContainEqual(
      expect.objectContaining({ correct: 9999, total: 9999 }),
    );
  });
});
