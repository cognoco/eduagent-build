import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  bookmarks,
  createDatabase,
  dictationResults,
  generateUUIDv7,
  learningProfiles,
  learningSessions,
  milestones,
  monthlyReports,
  quizRounds,
  retentionCards,
  topicNotes,
  weeklyReports,
  vocabulary,
  type Database,
} from '@eduagent/database';
import { and, eq } from 'drizzle-orm';
import { resetDatabase, seedScenario } from './test-seed';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
const EMAIL_PREFIX = `seed-medium-priority-${RUN_ID}-`;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for medium-priority seed integration tests',
    );
  }

  db = createDatabase(databaseUrl);
});

afterAll(async () => {
  await resetDatabase(db, {}, { prefix: EMAIL_PREFIX });
});

describe('medium-priority seed scenarios integration', () => {
  it('creates a language-subject-active learner with B1 vocabulary and 5 completed sessions', async () => {
    const email = `${EMAIL_PREFIX}language@test.invalid`;
    const result = await seedScenario(db, 'language-subject-active', email);

    expect(result.scenario).toBe('language-subject-active');
    expect(typeof result.ids.subjectId).toBe('string');

    const vocabRows = await db
      .select()
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.profileId, result.profileId),
          eq(vocabulary.subjectId, result.ids.subjectId),
        ),
      );

    expect(vocabRows).toHaveLength(5);
    expect(
      vocabRows.map((row: typeof vocabulary.$inferSelect) => row.cefrLevel),
    ).toEqual(expect.arrayContaining(['A1', 'A2', 'B1']));

    const sessions = await db
      .select()
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, result.profileId),
          eq(learningSessions.subjectId, result.ids.subjectId),
          eq(learningSessions.status, 'completed'),
        ),
      );

    expect(sessions).toHaveLength(5);
  });

  it('creates a parent-with-reports fixture with a monthly report row', async () => {
    const email = `${EMAIL_PREFIX}reports@test.invalid`;
    const result = await seedScenario(db, 'parent-with-reports', email);

    expect(result.scenario).toBe('parent-with-reports');
    expect(typeof result.ids.reportId).toBe('string');

    const [report] = await db
      .select()
      .from(monthlyReports)
      .where(eq(monthlyReports.id, result.ids.reportId));

    expect(report).toEqual(expect.objectContaining({}));
    expect(report).toEqual(
      expect.objectContaining({
        id: result.ids.reportId,
        profileId: result.ids.parentProfileId,
        childProfileId: result.ids.childProfileId,
        reportMonth: '2026-03-01',
      }),
    );
    expect((report?.reportData as { month?: string }).month).toBe('March 2026');
  });

  it('creates a mentor-memory-populated fixture with granted consent and at least 4 completed child sessions', async () => {
    const email = `${EMAIL_PREFIX}memory@test.invalid`;
    const result = await seedScenario(db, 'mentor-memory-populated', email);

    expect(result.scenario).toBe('mentor-memory-populated');
    expect(typeof result.ids.childProfileId).toBe('string');

    const [profile] = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.profileId, result.ids.childProfileId));

    expect(profile).toEqual(expect.objectContaining({}));
    expect(profile).toEqual(
      expect.objectContaining({
        profileId: result.ids.childProfileId,
        memoryConsentStatus: 'granted',
        memoryCollectionEnabled: true,
        memoryInjectionEnabled: true,
      }),
    );
    expect(profile?.interests).toEqual(['Soccer', 'History']);

    const sessions = await db
      .select()
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, result.ids.childProfileId),
          eq(learningSessions.status, 'completed'),
        ),
      );

    expect(sessions.length).toBeGreaterThanOrEqual(4);
  });

  it('creates a mentor-audit rich-child-history fixture with reports, recap, quiz, dictation, homework, milestone, bookmarks, and vocabulary', async () => {
    const email = `${EMAIL_PREFIX}mentor-rich-history@test.invalid`;
    const result = await seedScenario(
      db,
      'mentor-audit-rich-child-history',
      email,
    );

    expect(result.scenario).toBe('mentor-audit-rich-child-history');
    expect(result.ids.childProfileId).toBeTruthy();
    expect(result.ids.reportId).toBeTruthy();
    expect(result.ids.weeklyReportId).toBeTruthy();
    expect(result.ids.quizRoundId).toBeTruthy();
    expect(result.ids.dictationResultId).toBeTruthy();
    expect(result.ids.homeworkSessionId).toBeTruthy();
    expect(result.ids.milestoneId).toBeTruthy();
    expect(result.ids.topicNoteId).toBeTruthy();
    expect(result.ids.vocabularyId).toBeTruthy();
    expect(result.ids.bookmarkId).toBeTruthy();

    const [monthlyReport] = await db
      .select()
      .from(monthlyReports)
      .where(eq(monthlyReports.id, result.ids.reportId));
    expect(monthlyReport).toEqual(expect.objectContaining({}));

    const [weeklyReport] = await db
      .select()
      .from(weeklyReports)
      .where(eq(weeklyReports.id, result.ids.weeklyReportId));
    expect(weeklyReport).toEqual(expect.objectContaining({}));

    const [quizRound] = await db
      .select()
      .from(quizRounds)
      .where(eq(quizRounds.id, result.ids.quizRoundId));
    expect(quizRound).toEqual(
      expect.objectContaining({
        id: result.ids.quizRoundId,
        profileId: result.ids.childProfileId,
        status: 'completed',
      }),
    );

    const [dictationResult] = await db
      .select()
      .from(dictationResults)
      .where(eq(dictationResults.id, result.ids.dictationResultId));
    expect(dictationResult).toEqual(
      expect.objectContaining({
        id: result.ids.dictationResultId,
        profileId: result.ids.childProfileId,
        reviewed: true,
      }),
    );

    const [homeworkSession] = await db
      .select()
      .from(learningSessions)
      .where(eq(learningSessions.id, result.ids.homeworkSessionId));
    expect(homeworkSession).toEqual(
      expect.objectContaining({
        id: result.ids.homeworkSessionId,
        profileId: result.ids.childProfileId,
        sessionType: 'homework',
        status: 'completed',
      }),
    );

    const [milestone] = await db
      .select()
      .from(milestones)
      .where(eq(milestones.id, result.ids.milestoneId));
    expect(milestone).toEqual(
      expect.objectContaining({
        id: result.ids.milestoneId,
        profileId: result.ids.childProfileId,
      }),
    );

    const [topicNote] = await db
      .select()
      .from(topicNotes)
      .where(eq(topicNotes.id, result.ids.topicNoteId));
    expect(topicNote).toEqual(
      expect.objectContaining({
        id: result.ids.topicNoteId,
        profileId: result.ids.childProfileId,
      }),
    );

    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.id, result.ids.bookmarkId));
    expect(bookmark).toEqual(
      expect.objectContaining({
        id: result.ids.bookmarkId,
        profileId: result.ids.childProfileId,
      }),
    );

    const [vocab] = await db
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.id, result.ids.vocabularyId));
    expect(vocab).toEqual(
      expect.objectContaining({
        id: result.ids.vocabularyId,
        profileId: result.ids.childProfileId,
      }),
    );

    const retentionRows = await db
      .select()
      .from(retentionCards)
      .where(eq(retentionCards.profileId, result.ids.childProfileId));
    expect(retentionRows.length).toBeGreaterThanOrEqual(1);
  });
});
