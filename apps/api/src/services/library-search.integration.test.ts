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
  learningSessions,
  profiles,
  sessionSummaries,
  subjects,
  topicNotes,
  type Database,
} from '@eduagent/database';

import type { LibrarySearchResult } from '@eduagent/schemas';
import { searchLibrary } from './library-search';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();
let counter = 0;
let db: Database;

async function seedProfile(): Promise<{ profileId: string }> {
  const idx = ++counter;
  const clerkUserId = `clerk_libsearch_${RUN_ID}_${idx}`;
  const email = `libsearch-${RUN_ID}-${idx}@test.invalid`;
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Search Learner',
      birthYear: 2012,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  return { profileId: profile!.id };
}

async function seedLibrary(
  profileId: string,
  input: {
    subjectName: string;
    bookTitle: string;
    topicTitle: string;
  },
): Promise<{ subjectId: string; bookId: string; topicId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: input.subjectName })
    .returning({ id: subjects.id });
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });
  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: input.bookTitle,
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });
  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: input.topicTitle,
      description: `${input.topicTitle} description`,
      sortOrder: 0,
      estimatedMinutes: 10,
    })
    .returning({ id: curriculumTopics.id });
  return { subjectId: subject!.id, bookId: book!.id, topicId: topic!.id };
}

describeIfDb('searchLibrary (integration)', () => {
  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_libsearch_${RUN_ID}%`));
  });

  describe('notes', () => {
    it('returns sessionId on matched note rows', async () => {
      const { profileId } = await seedProfile();
      const { subjectId, topicId } = await seedLibrary(profileId, {
        subjectName: 'Biology',
        bookTitle: 'Cell Biology',
        topicTitle: 'Mitosis',
      });
      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId, topicId })
        .returning({ id: learningSessions.id });
      await db.insert(topicNotes).values({
        topicId,
        profileId,
        sessionId: session!.id,
        content: 'mitochondria powerhouse',
      });

      const result = await searchLibrary(db, profileId, 'mitochondria');

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]!.sessionId).toBe(session!.id);
    });

    it('returns null sessionId when note has no source session', async () => {
      const { profileId } = await seedProfile();
      const { topicId } = await seedLibrary(profileId, {
        subjectName: 'Chemistry',
        bookTitle: 'Organic Chemistry',
        topicTitle: 'Alkenes',
      });
      await db.insert(topicNotes).values({
        topicId,
        profileId,
        sessionId: null,
        content: 'double bond alkene',
      });

      const result = await searchLibrary(db, profileId, 'double bond');

      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]!.sessionId).toBeNull();
    });

    it('returns subjectName, topicName, and createdAt on note rows', async () => {
      const { profileId } = await seedProfile();
      const { topicId } = await seedLibrary(profileId, {
        subjectName: 'Physics',
        bookTitle: 'Mechanics',
        topicTitle: 'Newton Laws',
      });
      await db.insert(topicNotes).values({
        topicId,
        profileId,
        content: 'inertia resist change',
      });

      const result = await searchLibrary(db, profileId, 'inertia');

      expect(result.notes[0]).toMatchObject({
        subjectName: 'Physics',
        topicName: 'Newton Laws',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });
  });

  describe('sessions', () => {
    it('returns sessions that match summary content', async () => {
      const { profileId } = await seedProfile();
      const { subjectId, topicId } = await seedLibrary(profileId, {
        subjectName: 'History',
        bookTitle: 'World Wars',
        topicTitle: 'WWI Causes',
      });
      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId, topicId })
        .returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values({
        profileId,
        sessionId: session!.id,
        topicId,
        status: 'accepted',
        content: 'assassination of archduke triggered the war',
      });

      const result = await searchLibrary(db, profileId, 'archduke');

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        sessionId: session!.id,
        topicId,
        topicTitle: 'WWI Causes',
        subjectId,
        subjectName: 'History',
        snippet: expect.stringContaining('archduke'),
        occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('matches across narrative, learnerRecap, aiFeedback, highlight, and closingLine fields', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db
        .insert(subjects)
        .values({ profileId, name: 'Geography' })
        .returning({ id: subjects.id });
      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId: subject!.id })
        .returning({ id: learningSessions.id });

      for (const [field, value] of [
        ['narrative', 'tectonic plates collide'],
        ['learnerRecap', 'delta river sediment'],
        ['aiFeedback', 'cartography scale practice'],
        ['highlight', 'monsoon wind patterns'],
        ['closingLine', 'latitude longitude wrapup'],
      ] as const) {
        await db.insert(sessionSummaries).values({
          profileId,
          sessionId: session!.id,
          status: 'submitted',
          [field]: value,
        });
        const term = value.split(' ')[0]!;
        const result = await searchLibrary(db, profileId, term);
        expect(
          result.sessions.some((s: LibrarySearchResult['sessions'][number]) =>
            s.snippet.includes(term),
          ),
        ).toBe(true);
      }
    });

    it('excludes purged session summaries', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db
        .insert(subjects)
        .values({ profileId, name: 'Music' })
        .returning({ id: subjects.id });
      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId: subject!.id })
        .returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values({
        profileId,
        sessionId: session!.id,
        status: 'accepted',
        content: 'sonata form exposition development recapitulation',
        purgedAt: new Date(),
      });

      const result = await searchLibrary(db, profileId, 'sonata');

      expect(result.sessions).toHaveLength(0);
    });

    it('excludes pending and skipped summaries', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db
        .insert(subjects)
        .values({ profileId, name: 'Art' })
        .returning({ id: subjects.id });
      const [sessionA] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId: subject!.id })
        .returning({ id: learningSessions.id });
      const [sessionB] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId: subject!.id })
        .returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values([
        {
          profileId,
          sessionId: sessionA!.id,
          status: 'pending',
          content: 'impressionism brushstroke technique',
        },
        {
          profileId,
          sessionId: sessionB!.id,
          status: 'skipped',
          content: 'impressionism light and shadow',
        },
      ]);

      const result = await searchLibrary(db, profileId, 'impressionism');

      expect(result.sessions).toHaveLength(0);
    });

    it('includes freeform sessions with topicId null', async () => {
      const { profileId } = await seedProfile();
      const [subject] = await db
        .insert(subjects)
        .values({ profileId, name: 'Science' })
        .returning({ id: subjects.id });
      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId: subject!.id, topicId: null })
        .returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values({
        profileId,
        sessionId: session!.id,
        topicId: null,
        status: 'auto_closed',
        content: 'photosynthesis freeform exploration',
      });

      const result = await searchLibrary(db, profileId, 'photosynthesis');

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]!.topicId).toBeNull();
      expect(result.sessions[0]!.topicTitle).toBeNull();
      expect(result.sessions[0]!.bookId).toBeNull();
    });

    it("does not return another profile's session summaries", async () => {
      const { profileId: profileA } = await seedProfile();
      const { profileId: profileB } = await seedProfile();
      const [subject] = await db
        .insert(subjects)
        .values({ profileId: profileA, name: 'Philosophy' })
        .returning({ id: subjects.id });
      const [session] = await db
        .insert(learningSessions)
        .values({ profileId: profileA, subjectId: subject!.id })
        .returning({ id: learningSessions.id });
      await db.insert(sessionSummaries).values({
        profileId: profileA,
        sessionId: session!.id,
        status: 'accepted',
        content: 'cogito ergo sum',
      });

      const result = await searchLibrary(db, profileB, 'cogito');

      expect(result.sessions).toHaveLength(0);
    });
  });
});
