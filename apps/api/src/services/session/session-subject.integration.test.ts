/**
 * Integration: getSubjectSessions joins through subjects.profileId.
 *
 * This service is one of the architectural exceptions documented in
 * CLAUDE.md — it uses a direct db.select() with a multi-table join
 * (learning_sessions → subjects) so profile scoping is enforced via
 * subjects.profileId rather than createScopedRepository. A unit test
 * with a mocked db would only assert that the joins are called, not that
 * the WHERE clause actually keeps another profile's sessions out. So the
 * coverage that matters lives here, against the real schema.
 */

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
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
import { getSubjectSessions } from './session-subject';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

describeIfDb('getSubjectSessions (integration)', () => {
  let db: Database;
  let accountId: string;
  let profileId: string;
  let otherProfileId: string;
  let subjectId: string;
  let otherSubjectId: string;
  let completedSessionId: string;
  let autoClosedSessionId: string;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);

    const [account] = await db
      .insert(accounts)
      .values({
        clerkUserId: `clerk_integ_subjsess_${RUN_ID}`,
        email: `subjsess_${RUN_ID}@test.invalid`,
      })
      .returning({ id: accounts.id });
    accountId = account!.id;

    const [profile] = await db
      .insert(profiles)
      .values({
        accountId,
        displayName: 'Subject Sessions User',
        birthYear: 2012,
        isOwner: true,
      })
      .returning({ id: profiles.id });
    profileId = profile!.id;

    const [otherProfile] = await db
      .insert(profiles)
      .values({
        accountId,
        displayName: 'Other User Same Account',
        birthYear: 2014,
        isOwner: false,
      })
      .returning({ id: profiles.id });
    otherProfileId = otherProfile!.id;

    const [subject] = await db
      .insert(subjects)
      .values({
        profileId,
        name: 'Math',
        status: 'active',
        pedagogyMode: 'socratic',
      })
      .returning({ id: subjects.id });
    subjectId = subject!.id;

    const [otherSubject] = await db
      .insert(subjects)
      .values({
        profileId: otherProfileId,
        name: 'Math',
        status: 'active',
        pedagogyMode: 'socratic',
      })
      .returning({ id: subjects.id });
    otherSubjectId = otherSubject!.id;

    const [completed] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        status: 'completed',
        exchangeCount: 4,
      })
      .returning({ id: learningSessions.id });
    completedSessionId = completed!.id;

    const [autoClosed] = await db
      .insert(learningSessions)
      .values({
        profileId,
        subjectId,
        status: 'auto_closed',
        exchangeCount: 2,
      })
      .returning({ id: learningSessions.id });
    autoClosedSessionId = autoClosed!.id;

    await db.insert(learningSessions).values({
      profileId,
      subjectId,
      status: 'completed',
      exchangeCount: 0,
    });

    await db.insert(learningSessions).values({
      profileId,
      subjectId,
      status: 'active',
      exchangeCount: 5,
    });

    // Other profile's session on a same-named subject — must be excluded.
    await db.insert(learningSessions).values({
      profileId: otherProfileId,
      subjectId: otherSubjectId,
      status: 'completed',
      exchangeCount: 6,
    });
  });

  afterAll(async () => {
    if (accountId) {
      await db.delete(accounts).where(eq(accounts.id, accountId));
    }
  });

  it('returns completed and auto_closed sessions with at least one exchange, scoped to profile', async () => {
    const sessions = await getSubjectSessions(db, profileId, subjectId);

    const ids = sessions.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([completedSessionId, autoClosedSessionId])
    );
    expect(ids).toHaveLength(2);
  });

  it("does not surface another profile's sessions when subjectId matches by chance", async () => {
    // Caller passes the other profile's subjectId but their own profileId.
    // Because the WHERE clause pins both subjectId AND subjects.profileId,
    // this returns nothing — the cross-profile read is structurally blocked.
    const sessions = await getSubjectSessions(db, profileId, otherSubjectId);
    expect(sessions).toEqual([]);
  });
});
