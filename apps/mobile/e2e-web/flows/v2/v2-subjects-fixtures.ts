import { learningSessionSchema, type LearningSession } from '@eduagent/schemas';

export const PHOTOSYNTHESIS_FIXTURE_TIMESTAMP = '2025-01-15T00:00:00.000Z';

export const PHOTOSYNTHESIS_SUBJECT_ID = '22380000-0000-4000-8000-000000000001';
export const PHOTOSYNTHESIS_BOOK_ID = '22380000-0000-4000-8000-000000000002';
export const PHOTOSYNTHESIS_TOPIC_ID = '22380000-0000-4000-8000-000000000003';
export const PHOTOSYNTHESIS_SESSION_ID = '22380000-0000-4000-8000-000000000004';

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
