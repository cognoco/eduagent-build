import { learningSessionSchema, type LearningSession } from '@eduagent/schemas';

export const PHOTOSYNTHESIS_FIXTURE_TIMESTAMP = '2025-01-15T00:00:00.000Z';

export const PHOTOSYNTHESIS_SUBJECT_ID = '22380000-0000-4000-8000-000000000001';
export const PHOTOSYNTHESIS_BOOK_ID = '22380000-0000-4000-8000-000000000002';
export const PHOTOSYNTHESIS_TOPIC_ID = '22380000-0000-4000-8000-000000000003';
export const PHOTOSYNTHESIS_SESSION_ID = '22380000-0000-4000-8000-000000000004';

export const V2_SUBJECTS_EMPTY_STORAGE_STATE = {
  cookies: [],
  origins: [],
};

export const V2_SUBJECTS_CASES = {
  multiSubject: {
    seed: { scenario: 'multi-subject', alias: 'v2-subjects-multi' },
    expected: {
      profileName: 'Multi-Subject Learner',
      subjectNames: {
        active: 'Physics',
        paused: 'Literature',
        archived: 'Art History',
      },
      missingQuery: 'impossible-wi-2238-subject',
    },
  },
  learningActive: {
    seed: { scenario: 'learning-active', alias: 'v2-subjects-resume' },
    expected: {
      profileName: 'Active Learner',
      subjectName: 'World History',
      topicName: 'World History Topic 1',
      nextAction: 'Resume',
    },
  },
  retentionDue: {
    seed: { scenario: 'retention-due', alias: 'v2-subjects-review' },
    expected: {
      profileName: 'Review Learner',
      subjectName: 'Biology',
      topicName: 'Biology Topic 1',
      nextAction: 'Review',
    },
  },
  apiRecovery: {
    seed: { scenario: 'learning-active', alias: 'v2-subjects-retry' },
    expected: {
      subjectName: 'World History',
      failureMessage: 'Synthetic WI-2238 Subjects read failure',
    },
  },
  curriculumPreparing: {
    seed: { scenario: 'learning-active', alias: 'v2-subjects-preparing' },
    expected: {
      profileName: 'Active Learner',
      subjectName: 'World History',
      preparingMessage: 'Building your World History curriculum…',
    },
  },
  firstSubject: {
    seed: { scenario: 'onboarding-no-subject', alias: 'v2-subjects-first' },
    expected: {
      profileName: 'Test Learner',
      subjectName: 'Photosynthesis',
      emptyTitle: 'No subjects yet',
      readyTitle: 'Starting with Photosynthesis',
      returnTo: 'subjects',
    },
  },
} as const;

export function photosynthesisSession(): LearningSession {
  return learningSessionSchema.parse({
    id: PHOTOSYNTHESIS_SESSION_ID,
    subjectId: PHOTOSYNTHESIS_SUBJECT_ID,
    topicId: PHOTOSYNTHESIS_TOPIC_ID,
    topicTitle: 'Photosynthesis',
    subjectName: 'Photosynthesis',
    bookId: PHOTOSYNTHESIS_BOOK_ID,
    bookTitle: 'Photosynthesis foundations',
    sessionType: 'learning',
    inputMode: 'text',
    verificationType: null,
    status: 'active',
    escalationRung: 1,
    exchangeCount: 0,
    startedAt: PHOTOSYNTHESIS_FIXTURE_TIMESTAMP,
    lastActivityAt: PHOTOSYNTHESIS_FIXTURE_TIMESTAMP,
    endedAt: null,
    durationSeconds: null,
    wallClockSeconds: null,
    rawInput: null,
    filedAt: null,
    filingStatus: null,
    filingRetryCount: 0,
  } satisfies LearningSession);
}
