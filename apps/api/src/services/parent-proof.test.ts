import {
  assessments,
  needsDeepeningTopics,
  retentionCards,
  topicNotes,
  type Database,
} from '@eduagent/database';

import { getVerifiedProofForSessionTopic } from './parent-proof';

const PROFILE_ID = 'a0000000-0000-4000-8000-000000000010';
const SESSION_ID = 'b0000000-0000-4000-8000-000000000100';
const SUBJECT_ID = 'c0000000-0000-4000-8000-000000000001';
const TOPIC_ID = 'd0000000-0000-4000-8000-000000000001';
const VERIFIED_AT = new Date('2026-07-10T10:00:00.000Z');
const NEXT_REVIEW_AT = new Date('2026-07-17T10:00:00.000Z');

function fakeDbByTable(rowsByTable: Map<unknown, unknown[]>): Database {
  return {
    select: jest.fn(() => {
      let rows: unknown[] = [];
      const chain: Record<string, unknown> = {};
      chain['from'] = jest.fn((table: unknown) => {
        rows = rowsByTable.get(table) ?? [];
        return chain;
      });
      chain['innerJoin'] = jest.fn(() => chain);
      chain['leftJoin'] = jest.fn(() => chain);
      chain['where'] = jest.fn(() => chain);
      chain['orderBy'] = jest.fn(() => chain);
      chain['limit'] = jest.fn(async () => rows);
      chain['then'] = (
        resolve: (value: unknown[]) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject);
      return chain;
    }),
  } as unknown as Database;
}

function verifiedAssessmentRows(): unknown[] {
  return [
    {
      topicId: TOPIC_ID,
      topicTitle: 'Plate tectonics',
      subjectId: SUBJECT_ID,
      sessionId: SESSION_ID,
      verifiedAt: VERIFIED_AT,
    },
  ];
}

function retentionRows(): unknown[] {
  return [
    {
      topicId: TOPIC_ID,
      easeFactor: 2.5,
      intervalDays: 30,
      repetitions: 2,
      failureCount: 0,
      consecutiveSuccesses: 2,
      xpStatus: 'verified',
      lastReviewedAt: new Date(),
      nextReviewAt: NEXT_REVIEW_AT,
    },
  ];
}

describe('getVerifiedProofForSessionTopic', () => {
  it('returns a marked kept note with verification, retention, and next-review state', async () => {
    const db = fakeDbByTable(
      new Map<unknown, unknown[]>([
        [assessments, verifiedAssessmentRows()],
        [
          topicNotes,
          [
            {
              content: 'The plates move because heat drives mantle motion.',
              createdAt: new Date(),
            },
          ],
        ],
        [needsDeepeningTopics, []],
        [retentionCards, retentionRows()],
      ]),
    );

    await expect(
      getVerifiedProofForSessionTopic(db, PROFILE_ID, SESSION_ID, TOPIC_ID),
    ).resolves.toEqual({
      hasProof: true,
      topicId: TOPIC_ID,
      topicTitle: 'Plate tectonics',
      subjectId: SUBJECT_ID,
      sessionId: SESSION_ID,
      verifiedAt: VERIFIED_AT.toISOString(),
      quote: 'The plates move because heat drives mantle motion.',
      masteryVerificationState: 'fresh',
      retentionStatus: 'strong',
      nextReviewDate: NEXT_REVIEW_AT.toISOString(),
    });
  });

  it('returns no proof when no verified assessment exists', async () => {
    const db = fakeDbByTable(new Map<unknown, unknown[]>([[assessments, []]]));

    await expect(
      getVerifiedProofForSessionTopic(db, PROFILE_ID, SESSION_ID, TOPIC_ID),
    ).resolves.toEqual({ hasProof: false, quote: null });
  });

  it('keeps proof metadata but ages the marked note quote out after 30 days', async () => {
    const agedCreatedAt = new Date();
    agedCreatedAt.setUTCDate(agedCreatedAt.getUTCDate() - 31);
    const db = fakeDbByTable(
      new Map<unknown, unknown[]>([
        [assessments, verifiedAssessmentRows()],
        [topicNotes, [{ content: 'An aged quote.', createdAt: agedCreatedAt }]],
        [needsDeepeningTopics, []],
        [retentionCards, retentionRows()],
      ]),
    );

    const result = await getVerifiedProofForSessionTopic(
      db,
      PROFILE_ID,
      SESSION_ID,
      TOPIC_ID,
    );

    expect(result).toMatchObject({
      hasProof: true,
      topicId: TOPIC_ID,
      topicTitle: 'Plate tectonics',
      verifiedAt: VERIFIED_AT.toISOString(),
      masteryVerificationState: 'fresh',
      quote: null,
    });
  });
});
