import {
  bookmarks,
  consentGrant,
  curriculumTopics,
  guardianship,
  learningProfiles,
  learningSessions,
  login,
  membership,
  monthlyReports,
  person,
  practiceActivityEvents,
  sessionSummaries,
  subjects,
  supportership,
  topicNotes,
  weeklyReports,
} from '@eduagent/database';
import { CONSENT_PURPOSES } from '@eduagent/schemas';

import {
  createRecordingDb,
  type TestSeedInsertRecord,
} from '../test-utils/test-seed-db';
import { seedScenario } from './test-seed';

function insertedRow(
  inserts: TestSeedInsertRecord[],
  table: unknown,
  id: string,
): Record<string, unknown> {
  const values = insertedRows(inserts, table);
  const row = values.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`No inserted row found for ${id}`);
  return row;
}

function insertedRows(
  inserts: TestSeedInsertRecord[],
  table: unknown,
): Record<string, unknown>[] {
  return inserts
    .filter((record) => record.table === table)
    .flatMap((record) =>
      Array.isArray(record.values) ? record.values : [record.values],
    );
}

function requiredId(ids: Record<string, string>, key: string): string {
  const value = ids[key];
  if (!value) throw new Error(`Seed result omitted required id: ${key}`);
  return value;
}

describe('v2-journal-paper-trail seed', () => {
  it('persists a solo adult owner and every Journal paper-trail artifact', async () => {
    const { db, inserts } = createRecordingDb();

    const result = await seedScenario(
      db,
      'v2-journal-paper-trail',
      'v2-journal@example.com',
    );

    const subjectId = requiredId(result.ids, 'subjectId');
    const topicId = requiredId(result.ids, 'topicId');
    const sessionId = requiredId(result.ids, 'sessionId');
    const sessionSummaryId = requiredId(result.ids, 'sessionSummaryId');
    const learnerNoteId = requiredId(result.ids, 'learnerNoteId');
    const bookmarkId = requiredId(result.ids, 'bookmarkId');
    const practiceActivityEventId = requiredId(
      result.ids,
      'practiceActivityEventId',
    );
    const weeklyReportId = requiredId(result.ids, 'weeklyReportId');
    const monthlyReportId = requiredId(result.ids, 'monthlyReportId');
    const mentorMemoryId = requiredId(result.ids, 'mentorMemoryId');

    expect(result.scenario).toBe('v2-journal-paper-trail');
    expect(result.ids.learnerProfileId).toBe(result.profileId);
    expect(result.ids.recapId).toBe(sessionId);
    const journalLearner = insertedRow(inserts, person, result.profileId);
    const journalLogin = insertedRows(inserts, login).find(
      (row) => row.personId === result.profileId,
    );
    const journalMembership = insertedRows(inserts, membership).find(
      (row) => row.personId === result.profileId,
    );
    if (!journalLogin || !journalMembership) {
      throw new Error('Journal learner is missing credential or membership');
    }
    expect(journalLearner).toEqual(
      expect.objectContaining({
        id: result.profileId,
        birthDate: '1985-01-01',
      }),
    );
    expect(
      new Date().getUTCFullYear() -
        Number(String(journalLearner.birthDate).slice(0, 4)),
    ).toBeGreaterThanOrEqual(18);
    expect(journalLogin).toEqual(
      expect.objectContaining({
        personId: result.profileId,
        email: 'v2-journal@example.com',
        clerkUserId: expect.stringMatching(/^clerk_seed_/),
      }),
    );
    expect(journalMembership).toEqual(
      expect.objectContaining({
        personId: result.profileId,
        organizationId: result.accountId,
        roles: ['admin', 'learner'],
      }),
    );
    const consentRows = inserts
      .filter((record) => record.table === consentGrant)
      .flatMap((record) =>
        Array.isArray(record.values) ? record.values : [record.values],
      )
      .filter((row) => row.chargePersonId === result.profileId);
    expect(consentRows).toHaveLength(CONSENT_PURPOSES.length);
    expect(consentRows.map((row) => row.purpose).sort()).toEqual(
      [...CONSENT_PURPOSES].sort(),
    );
    expect(consentRows).toEqual(
      expect.arrayContaining(
        CONSENT_PURPOSES.map((purpose) =>
          expect.objectContaining({
            chargePersonId: result.profileId,
            organizationId: result.accountId,
            purpose,
            lawfulBasis: 'art6_1_a',
            granted: true,
          }),
        ),
      ),
    );
    for (const id of [
      subjectId,
      topicId,
      sessionId,
      sessionSummaryId,
      learnerNoteId,
      bookmarkId,
      practiceActivityEventId,
      weeklyReportId,
      monthlyReportId,
      mentorMemoryId,
    ]) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
    expect(result.ids).toEqual(
      expect.objectContaining({
        subjectId: expect.any(String),
        topicId: expect.any(String),
        sessionId: expect.any(String),
        recapId: expect.any(String),
        sessionSummaryId: expect.any(String),
        learnerNoteId: expect.any(String),
        bookmarkId: expect.any(String),
        practiceActivityEventId: expect.any(String),
        weeklyReportId: expect.any(String),
        monthlyReportId: expect.any(String),
        mentorMemoryId: expect.any(String),
      }),
    );

    const journalSubject = insertedRow(inserts, subjects, subjectId);
    const journalTopic = insertedRow(inserts, curriculumTopics, topicId);
    expect(journalSubject).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        name: 'Biology',
      }),
    );
    expect(journalTopic).toEqual(
      expect.objectContaining({
        title: 'Biology Topic 1',
      }),
    );

    const journalSession = insertedRow(inserts, learningSessions, sessionId);
    expect(journalSession).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        subjectId,
        topicId,
        status: 'completed',
        wallClockSeconds: 960,
        startedAt: expect.any(Date),
        lastActivityAt: expect.any(Date),
        endedAt: expect.any(Date),
      }),
    );
    const startedAt = (journalSession.startedAt as Date).getTime();
    const lastActivityAt = (journalSession.lastActivityAt as Date).getTime();
    const endedAt = (journalSession.endedAt as Date).getTime();
    expect(startedAt).toBeLessThanOrEqual(lastActivityAt);
    expect(lastActivityAt).toBeLessThanOrEqual(endedAt);
    expect(endedAt - startedAt).toBe(960_000);
    const journalSummary = insertedRow(
      inserts,
      sessionSummaries,
      sessionSummaryId,
    );
    expect(journalSummary).toEqual(
      expect.objectContaining({
        sessionId,
        profileId: result.profileId,
        topicId,
        content:
          'The learner connected sunlight, chlorophyll, and glucose while explaining how photosynthesis stores energy.',
        learnerRecap:
          'We traced how photosynthesis stores sunlight as chemical energy in glucose.',
      }),
    );
    expect(journalSummary.content).not.toBe(journalSummary.learnerRecap);
    const learnerNote = insertedRow(inserts, topicNotes, learnerNoteId);
    const mentorBookmark = insertedRow(inserts, bookmarks, bookmarkId);
    expect(learnerNote).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        sessionId,
        topicId,
        content:
          'Photosynthesis stores sunlight as chemical energy in glucose for the plant.',
      }),
    );
    expect(mentorBookmark).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        sessionId,
        subjectId,
        topicId,
        content:
          'Chlorophyll captures light energy that powers photosynthesis.',
      }),
    );
    expect(learnerNote.content).not.toBe(mentorBookmark.content);

    expect(
      insertedRow(inserts, practiceActivityEvents, practiceActivityEventId),
    ).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        subjectId,
        activityType: 'review',
        activitySubtype: 'spaced_repetition',
        pointsEarned: 8,
        score: 3,
        total: 3,
        sourceType: 'topic',
        sourceId: topicId,
        metadata: expect.objectContaining({ topicId }),
      }),
    );

    expect(insertedRow(inserts, weeklyReports, weeklyReportId)).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        childProfileId: result.profileId,
        reportWeek: '2026-07-13',
        reportData: expect.objectContaining({
          thisWeek: expect.objectContaining({ totalSessions: 4 }),
        }),
      }),
    );
    expect(insertedRow(inserts, monthlyReports, monthlyReportId)).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        childProfileId: result.profileId,
        reportMonth: '2026-07-01',
        reportData: expect.objectContaining({
          thisMonth: expect.objectContaining({ topicsMastered: 12 }),
        }),
      }),
    );

    expect(insertedRow(inserts, learningProfiles, mentorMemoryId)).toEqual(
      expect.objectContaining({
        profileId: result.profileId,
        interests: ['Plant biology', 'Nature photography'],
        memoryConsentStatus: 'granted',
        memoryCollectionEnabled: true,
        memoryInjectionEnabled: true,
      }),
    );
    expect(inserts.some((record) => record.table === guardianship)).toBe(false);
    expect(inserts.some((record) => record.table === supportership)).toBe(
      false,
    );
  });
});
