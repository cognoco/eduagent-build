import {
  assessments,
  evidenceLinks,
  needsDeepeningTopics,
  retentionCards,
  sessionEvents,
  topicNotes,
  type Database,
} from '@eduagent/database';

import { getVerifiedProofForSessionTopic } from './parent-proof';

const PROFILE_ID = 'a0000000-0000-4000-8000-000000000010';
const SESSION_ID = 'b0000000-0000-4000-8000-000000000100';
const SUBJECT_ID = 'c0000000-0000-4000-8000-000000000001';
const TOPIC_ID = 'd0000000-0000-4000-8000-000000000001';
const ARTIFACT_ID = 'e0000000-0000-4000-8000-000000000001';
const EVENT_ID = 'f0000000-0000-4000-8000-000000000001';
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
    // Scoped-repository path: the weak-spot and retention-card reads now go
    // through db.query.<table>.findMany/findFirst; serve them from the same
    // seeded rows map keyed by table.
    query: {
      needsDeepeningTopics: {
        findMany: jest.fn(
          async () => rowsByTable.get(needsDeepeningTopics) ?? [],
        ),
      },
      retentionCards: {
        findFirst: jest.fn(
          async () => (rowsByTable.get(retentionCards) ?? [])[0],
        ),
      },
      evidenceLinks: {
        findMany: jest.fn(async () => rowsByTable.get(evidenceLinks) ?? []),
      },
    },
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
              id: ARTIFACT_ID,
              content: 'The plates move because heat drives mantle motion.',
              createdAt: new Date(),
            },
          ],
        ],
        [needsDeepeningTopics, []],
        [retentionCards, retentionRows()],
        [
          evidenceLinks,
          [
            {
              id: '10000000-0000-4000-8000-000000000001',
              profileId: PROFILE_ID,
              fromKind: 'artifact',
              fromId: ARTIFACT_ID,
              toKind: 'transcript_excerpt',
              toId: EVENT_ID,
              createdAt: new Date(),
            },
          ],
        ],
        [sessionEvents, [{ id: EVENT_ID, content: 'raw transcript body' }]],
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
      evidenceAvailability: 'available',
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

  it('keeps the verified fact but suppresses a migrated legacy challenge note with no evidence link', async () => {
    const db = fakeDbByTable(
      new Map<unknown, unknown[]>([
        [assessments, verifiedAssessmentRows()],
        [
          topicNotes,
          [
            {
              id: ARTIFACT_ID,
              content: 'Historical note without reconstructable provenance.',
              artifactSource: 'challenge_drafted_note',
              verificationState: 'verified',
              createdAt: new Date(),
            },
          ],
        ],
        [needsDeepeningTopics, []],
        [retentionCards, retentionRows()],
        [evidenceLinks, []],
      ]),
    );

    await expect(
      getVerifiedProofForSessionTopic(db, PROFILE_ID, SESSION_ID, TOPIC_ID),
    ).resolves.toMatchObject({
      hasProof: true,
      topicId: TOPIC_ID,
      verifiedAt: VERIFIED_AT.toISOString(),
      quote: null,
      evidenceAvailability: 'source_unavailable',
    });
  });

  it('keeps the verified fact but suppresses a fresh note whose target was purged', async () => {
    const db = fakeDbByTable(
      new Map<unknown, unknown[]>([
        [assessments, verifiedAssessmentRows()],
        [
          topicNotes,
          [
            {
              id: ARTIFACT_ID,
              content: 'Fresh note whose transcript target is gone.',
              createdAt: new Date(),
            },
          ],
        ],
        [needsDeepeningTopics, []],
        [retentionCards, retentionRows()],
        [
          evidenceLinks,
          [
            {
              id: '10000000-0000-4000-8000-000000000001',
              profileId: PROFILE_ID,
              fromKind: 'artifact',
              fromId: ARTIFACT_ID,
              toKind: 'transcript_excerpt',
              toId: EVENT_ID,
              createdAt: new Date(),
            },
          ],
        ],
        [sessionEvents, []],
      ]),
    );

    await expect(
      getVerifiedProofForSessionTopic(db, PROFILE_ID, SESSION_ID, TOPIC_ID),
    ).resolves.toMatchObject({
      hasProof: true,
      topicId: TOPIC_ID,
      quote: null,
      evidenceAvailability: 'source_unavailable',
    });
  });

  it('keeps proof metadata but ages the marked note quote out after 30 days', async () => {
    const agedCreatedAt = new Date();
    agedCreatedAt.setUTCDate(agedCreatedAt.getUTCDate() - 31);
    const db = fakeDbByTable(
      new Map<unknown, unknown[]>([
        [assessments, verifiedAssessmentRows()],
        [
          topicNotes,
          [
            {
              id: ARTIFACT_ID,
              content: 'An aged quote.',
              createdAt: agedCreatedAt,
            },
          ],
        ],
        [needsDeepeningTopics, []],
        [retentionCards, retentionRows()],
        [
          evidenceLinks,
          [
            {
              id: '10000000-0000-4000-8000-000000000001',
              profileId: PROFILE_ID,
              fromKind: 'artifact',
              fromId: ARTIFACT_ID,
              toKind: 'transcript_excerpt',
              toId: EVENT_ID,
              createdAt: new Date(),
            },
          ],
        ],
        [sessionEvents, []],
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
      evidenceAvailability: 'source_unavailable',
    });
  });
});
