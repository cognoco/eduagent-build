/**
 * Service-layer unit tests for recaps.ts.
 *
 * Focus: per-child ForbiddenError must not poison sibling lookups. Promise.all
 * regression — if one child has hidden consent, the parent's recap list/detail
 * used to throw 403 even when other children were fully visible.
 *
 * Pattern: mocks `./dashboard` via requireActual + targeted overrides (gc1-allow:
 * pattern-a conversion). Real `./dashboard` cannot run without a database.
 *
 * GC6 deferred: 1 internal mock (`./dashboard`, gc1-allow annotated). Burn-down
 * would require fakeDbReturning to stub db.query.familyLinks/subjects/profiles/
 * learningSessions.findMany chains used by getChildrenForParent /
 * getChildSessions / getChildSessionDetail — a multi-table relational-API stub
 * substantially larger than this test file. Tracked with the broader
 * services/dashboard burn-down (see docs/_archive/plans/done/
 * 2026-05-12-internal-mock-cleanup-inventory.md).
 */

const mockGetChildrenForParent = jest.fn();
const mockGetChildSessions = jest.fn();
const mockGetChildSessionDetail = jest.fn();
const mockListProfileSessions = jest.fn();

jest.mock('./dashboard', () => {
  const actual = jest.requireActual(
    './dashboard',
  ) as typeof import('./dashboard');
  return {
    ...actual,
    getChildrenForParent: (...args: unknown[]) =>
      mockGetChildrenForParent(...args),
    getChildSessions: (...args: unknown[]) => mockGetChildSessions(...args),
    getChildSessionDetail: (...args: unknown[]) =>
      mockGetChildSessionDetail(...args),
  };
});

jest.mock(
  './session/session-crud' /* gc1-allow: scoped session service boundary */,
  () => {
    const actual = jest.requireActual(
      './session/session-crud',
    ) as typeof import('./session/session-crud');
    return {
      ...actual,
      listProfileSessions: (...args: unknown[]) =>
        mockListProfileSessions(...args),
    };
  },
);

import {
  assessments,
  evidenceLinks,
  needsDeepeningTopics,
  retentionCards,
  sessionSummaries,
  topicNotes,
  type Database,
} from '@eduagent/database';

import { ForbiddenError } from '../errors';
import {
  getRecapForParent,
  listRecapsForParent,
  listRecapsForProfile,
  validateRecapItems,
} from './recaps';

const PARENT_ID = 'a0000000-0000-4000-8000-000000000001';
const ORGANIZATION_ID = 'c0000000-0000-4000-8000-000000000001';
const VISIBLE_CHILD = 'a0000000-0000-4000-8000-000000000010';
const HIDDEN_CHILD = 'a0000000-0000-4000-8000-000000000020';
const RECAP_ID = 'b0000000-0000-4000-8000-000000000100';

const db = {} as Database;

function childRow(profileId: string, displayName: string) {
  return { profileId, displayName } as Awaited<
    ReturnType<typeof import('./dashboard').getChildrenForParent>
  >[number];
}

function sessionRow(sessionId: string) {
  return {
    sessionId,
    subjectId: 'c0000000-0000-4000-8000-000000000001',
    subjectName: 'Mathematics',
    topicId: null,
    topicTitle: null,
    sessionType: 'learning',
    startedAt: '2026-05-01T10:00:00.000Z',
    endedAt: '2026-05-01T10:30:00.000Z',
    exchangeCount: 5,
    displayTitle: 'Session',
    displaySummary: null,
    highlight: null,
    narrative: null,
    conversationPrompt: null,
    engagementSignal: null,
  } as Awaited<
    ReturnType<typeof import('./dashboard').getChildSessions>
  >[number];
}

function topicSessionRow(sessionId: string) {
  return {
    ...sessionRow(sessionId),
    topicId: 'd0000000-0000-4000-8000-000000000001',
    topicTitle: 'Fractions',
  } as Awaited<
    ReturnType<typeof import('./dashboard').getChildSessions>
  >[number];
}

beforeEach(() => {
  mockGetChildrenForParent.mockReset();
  mockGetChildSessions.mockReset();
  mockGetChildSessionDetail.mockReset();
  mockListProfileSessions.mockReset();
});

describe('listRecapsForParent — per-child ForbiddenError isolation', () => {
  it('returns recaps from visible children when a sibling has hidden consent', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
      childRow(HIDDEN_CHILD, 'Hidden'),
    ]);
    mockGetChildSessions.mockImplementation(
      async (_db: unknown, _parent: string, childId: string) => {
        if (childId === HIDDEN_CHILD) {
          throw new ForbiddenError('Child learning data is hidden.');
        }
        return [sessionRow(RECAP_ID)];
      },
    );

    const recaps = await listRecapsForParent(
      db,
      PARENT_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recaps).toHaveLength(1);
    expect(recaps[0]).toMatchObject({
      recapId: RECAP_ID,
      childProfileId: VISIBLE_CHILD,
    });
  });

  it('still propagates non-Forbidden errors (e.g. DB failure)', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessions.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      listRecapsForParent(db, PARENT_ID, PARENT_ID, ORGANIZATION_ID),
    ).rejects.toThrow('connection lost');
  });
});

/**
 * Minimal drizzle query-builder stand-in for the next-topic lookup. The real
 * `./dashboard` functions are mocked (they need a DB), but the next-topic
 * enrichment in listRecapsForParent issues a direct `db.select(...).from(...)
 * .leftJoin(...).where(...)` — this fake resolves that chain to `rows` so we can
 * assert the enrichment behavior without a live database.
 */
function fakeDbReturning(rows: unknown[]): Database {
  const chain: Record<string, unknown> = {};
  chain['select'] = jest.fn(() => chain);
  chain['from'] = jest.fn(() => chain);
  chain['leftJoin'] = jest.fn(() => chain);
  chain['where'] = jest.fn(async () => rows);
  return chain as unknown as Database;
}

function fakeProofDb(rowsByTable: Map<unknown, unknown[]>): Database {
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
    // Scoped-repository path used by getVerifiedProofForSessionTopic for the
    // weak-spot and retention-card reads, and by getArtifactEvidenceAvailability
    // for the evidence-links read; serve from the same seeded map.
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

describe('listRecapsForParent — next-topic enrichment', () => {
  it('surfaces the stored next-topic title and reason on the recap', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessions.mockResolvedValue([sessionRow(RECAP_ID)]);

    const enrichedDb = fakeDbReturning([
      {
        sessionId: RECAP_ID,
        nextTopicTitle: 'Comparing fractions',
        // ownedSubjectId is non-null → the curriculum_topics → curriculum_books
        // → subjects ownership chain resolved for the same profile, so the
        // title is allowed to surface.
        ownedSubjectId: 'c0000000-0000-4000-8000-000000000001',
        nextTopicReason: 'Build on equivalent fractions',
      },
    ]);

    const recaps = await listRecapsForParent(
      enrichedDb,
      PARENT_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recaps).toHaveLength(1);
    expect(recaps[0]).toMatchObject({
      recapId: RECAP_ID,
      nextTopicTitle: 'Comparing fractions',
      nextTopicReason: 'Build on equivalent fractions',
    });
  });

  it('suppresses a next-topic title whose ownership chain does not resolve to the same profile', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessions.mockResolvedValue([sessionRow(RECAP_ID)]);

    // The aliased topic matched (title present) but the owned-subject join did
    // NOT resolve (ownedSubjectId null) — e.g. next_topic_id points at a foreign
    // profile's topic. The title must be suppressed, not leaked onto the card.
    const enrichedDb = fakeDbReturning([
      {
        sessionId: RECAP_ID,
        nextTopicTitle: 'Foreign profile topic',
        ownedSubjectId: null,
        nextTopicReason: 'Build on equivalent fractions',
      },
    ]);

    const recaps = await listRecapsForParent(
      enrichedDb,
      PARENT_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recaps).toHaveLength(1);
    expect(recaps[0]?.nextTopicTitle).toBeNull();
  });

  it('returns null next-topic for a recap with no stored next topic', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessions.mockResolvedValue([sessionRow(RECAP_ID)]);

    // DB returns no next-topic row for this session.
    const enrichedDb = fakeDbReturning([]);

    const recaps = await listRecapsForParent(
      enrichedDb,
      PARENT_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recaps).toHaveLength(1);
    expect(recaps[0]?.nextTopicTitle).toBeNull();
    expect(recaps[0]?.nextTopicReason).toBeNull();
  });

  it('only merges next-topic onto its own session — a foreign row never leaks', async () => {
    const FOREIGN_SESSION = 'b0000000-0000-4000-8000-000000000999';
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessions.mockResolvedValue([sessionRow(RECAP_ID)]);

    // Even if the lookup returned an extra row for a session outside the
    // parent's recap set, it must not surface on any returned recap — the
    // merge is keyed strictly by the recap's own sessionId.
    const enrichedDb = fakeDbReturning([
      {
        sessionId: RECAP_ID,
        nextTopicTitle: 'Comparing fractions',
        ownedSubjectId: 'c0000000-0000-4000-8000-000000000001',
        nextTopicReason: 'On topic',
      },
      {
        sessionId: FOREIGN_SESSION,
        nextTopicTitle: 'Another family secret',
        ownedSubjectId: 'c0000000-0000-4000-8000-000000000002',
        nextTopicReason: 'Should never appear',
      },
    ]);

    const recaps = await listRecapsForParent(
      enrichedDb,
      PARENT_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recaps).toHaveLength(1);
    expect(recaps[0]?.nextTopicTitle).toBe('Comparing fractions');
    expect(
      recaps.some((recap) => recap.nextTopicTitle === 'Another family secret'),
    ).toBe(false);
  });

  it('is non-fatal: a lookup failure still returns recaps without a next-topic', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessions.mockResolvedValue([sessionRow(RECAP_ID)]);

    // db.select is undefined on this bare object → the lookup throws and the
    // try/catch defaults next-topic to null without failing the recap list.
    const recaps = await listRecapsForParent(
      {} as Database,
      PARENT_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recaps).toHaveLength(1);
    expect(recaps[0]?.nextTopicTitle).toBeNull();
    expect(recaps[0]?.nextTopicReason).toBeNull();
  });
});

describe('getRecapForParent — per-child ForbiddenError isolation', () => {
  it('returns the recap from a visible child when a sibling has hidden consent', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(HIDDEN_CHILD, 'Hidden'),
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessionDetail.mockImplementation(
      async (
        _db: unknown,
        _parent: string,
        childId: string,
        _recapId: string,
      ) => {
        if (childId === HIDDEN_CHILD) {
          throw new ForbiddenError('Child learning data is hidden.');
        }
        return sessionRow(RECAP_ID);
      },
    );

    const recap = await getRecapForParent(
      db,
      PARENT_ID,
      RECAP_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recap).toMatchObject({
      recapId: RECAP_ID,
      childProfileId: VISIBLE_CHILD,
    });
  });

  it('returns null when no visible child owns the recap', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
      childRow(HIDDEN_CHILD, 'Hidden'),
    ]);
    mockGetChildSessionDetail.mockImplementation(
      async (
        _db: unknown,
        _parent: string,
        childId: string,
        _recapId: string,
      ) => {
        if (childId === HIDDEN_CHILD) {
          throw new ForbiddenError('Child learning data is hidden.');
        }
        return null;
      },
    );

    await expect(
      getRecapForParent(db, PARENT_ID, RECAP_ID, PARENT_ID, ORGANIZATION_ID),
    ).resolves.toBeNull();
  });

  it('still propagates non-Forbidden errors (e.g. DB failure)', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessionDetail.mockRejectedValueOnce(new Error('boom'));

    await expect(
      getRecapForParent(db, PARENT_ID, RECAP_ID, PARENT_ID, ORGANIZATION_ID),
    ).rejects.toThrow('boom');
  });
});

describe('getRecapForParent — verified-proof enrichment', () => {
  const verifiedAt = new Date('2026-07-10T10:00:00.000Z');
  const nextReviewAt = new Date('2026-07-17T10:00:00.000Z');

  beforeEach(() => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessionDetail.mockResolvedValue(topicSessionRow(RECAP_ID));
  });

  function proofDb(noteCreatedAt = new Date()): Database {
    return fakeProofDb(
      new Map<unknown, unknown[]>([
        [sessionSummaries, []],
        [
          assessments,
          [
            {
              topicId: topicSessionRow(RECAP_ID).topicId,
              topicTitle: 'Fractions',
              subjectId: topicSessionRow(RECAP_ID).subjectId,
              sessionId: RECAP_ID,
              verifiedAt,
            },
          ],
        ],
        [
          topicNotes,
          [
            {
              content: 'Equivalent fractions name the same amount.',
              createdAt: noteCreatedAt,
            },
          ],
        ],
        [needsDeepeningTopics, []],
        [
          retentionCards,
          [
            {
              topicId: topicSessionRow(RECAP_ID).topicId,
              easeFactor: 2.5,
              intervalDays: 30,
              repetitions: 2,
              failureCount: 0,
              consecutiveSuccesses: 2,
              xpStatus: 'verified',
              lastReviewedAt: new Date(),
              nextReviewAt,
            },
          ],
        ],
      ]),
    );
  }

  it('populates verified proof from the session topic marked artifact', async () => {
    const recap = await getRecapForParent(
      proofDb(),
      PARENT_ID,
      RECAP_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recap?.verifiedProof).toEqual({
      topicId: topicSessionRow(RECAP_ID).topicId,
      topicTitle: 'Fractions',
      subjectId: topicSessionRow(RECAP_ID).subjectId,
      verifiedAt: verifiedAt.toISOString(),
      verificationState: 'fresh',
      retentionStatus: 'strong',
      nextReviewDate: nextReviewAt.toISOString(),
      quote: 'Equivalent fractions name the same amount.',
    });
  });

  it('leaves verified proof null and preserves the recap when no verified assessment exists', async () => {
    const noProofDb = fakeProofDb(
      new Map<unknown, unknown[]>([
        [sessionSummaries, []],
        [assessments, []],
      ]),
    );

    const recap = await getRecapForParent(
      noProofDb,
      PARENT_ID,
      RECAP_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recap).toMatchObject({
      recapId: RECAP_ID,
      childProfileId: VISIBLE_CHILD,
      topicTitle: 'Fractions',
      narrative: null,
      verifiedProof: null,
    });
  });

  it('keeps proof metadata but nulls an aged marked-note quote', async () => {
    const agedCreatedAt = new Date();
    agedCreatedAt.setUTCDate(agedCreatedAt.getUTCDate() - 31);

    const recap = await getRecapForParent(
      proofDb(agedCreatedAt),
      PARENT_ID,
      RECAP_ID,
      PARENT_ID,
      ORGANIZATION_ID,
    );

    expect(recap?.verifiedProof).toMatchObject({
      topicId: topicSessionRow(RECAP_ID).topicId,
      verifiedAt: verifiedAt.toISOString(),
      verificationState: 'fresh',
      nextReviewDate: nextReviewAt.toISOString(),
      quote: null,
    });
  });
});

describe('listRecapsForProfile — self-scope session mapping', () => {
  it('maps scoped profile sessions to recap items without parent or child-edge reads', async () => {
    mockListProfileSessions.mockResolvedValue({
      sessions: [sessionRow(RECAP_ID)],
      nextCursor: null,
    });

    const profileDb = {
      query: {
        person: {
          findFirst: jest.fn(async () => ({ displayName: 'Self Learner' })),
        },
      },
    } as unknown as Database;

    const recaps = await listRecapsForProfile(profileDb, VISIBLE_CHILD, {
      limit: 7,
    });

    expect(mockListProfileSessions).toHaveBeenCalledWith(
      profileDb,
      VISIBLE_CHILD,
      { limit: 7 },
    );
    expect(mockGetChildrenForParent).not.toHaveBeenCalled();
    expect(mockGetChildSessions).not.toHaveBeenCalled();
    expect(recaps).toEqual([
      expect.objectContaining({
        recapId: RECAP_ID,
        childProfileId: VISIBLE_CHILD,
        childDisplayName: 'Self Learner',
        subjectName: 'Mathematics',
      }),
    ]);
  });

  it('falls back to a neutral display name when the profile row is unavailable', async () => {
    mockListProfileSessions.mockResolvedValue({
      sessions: [sessionRow(RECAP_ID)],
      nextCursor: null,
    });

    const profileDb = {
      query: {
        person: {
          findFirst: jest.fn(async () => null),
        },
      },
    } as unknown as Database;

    const recaps = await listRecapsForProfile(profileDb, VISIBLE_CHILD);

    expect(recaps[0]).toMatchObject({
      childProfileId: VISIBLE_CHILD,
      childDisplayName: 'Learner',
    });
  });

  it('drops a malformed recap row instead of throwing the whole self-recaps list', async () => {
    const BAD_SESSION = 'b0000000-0000-4000-8000-000000000777';
    mockListProfileSessions.mockResolvedValue({
      sessions: [
        sessionRow(RECAP_ID),
        // sessionType outside the enum → recapListItemSchema rejects this row.
        // Before the per-row hardening the route-level recapsResponseSchema.parse
        // threw on this single bad row and 500'd the entire self-recaps list.
        { ...sessionRow(BAD_SESSION), sessionType: 'not-a-real-type' },
      ],
      nextCursor: null,
    });

    const profileDb = {
      query: {
        person: {
          findFirst: jest.fn(async () => ({ displayName: 'Self Learner' })),
        },
      },
    } as unknown as Database;

    const recaps = await listRecapsForProfile(profileDb, VISIBLE_CHILD);

    expect(recaps).toHaveLength(1);
    expect(recaps[0]).toMatchObject({ recapId: RECAP_ID });
    expect(recaps.some((recap) => recap.recapId === BAD_SESSION)).toBe(false);
  });
});

describe('validateRecapItems', () => {
  const validRecap = {
    recapId: RECAP_ID,
    sessionId: RECAP_ID,
    childProfileId: VISIBLE_CHILD,
    childDisplayName: 'Self Learner',
    subjectId: 'c0000000-0000-4000-8000-000000000001',
    subjectName: 'Mathematics',
    topicId: null,
    topicTitle: null,
    sessionType: 'learning',
    startedAt: '2026-05-01T10:00:00.000Z',
    endedAt: '2026-05-01T10:30:00.000Z',
    exchangeCount: 5,
    displayTitle: 'Session',
    displaySummary: null,
    highlight: null,
    narrative: null,
    conversationPrompt: null,
    engagementSignal: null,
    nextTopicTitle: null,
    nextTopicReason: null,
  };

  it('keeps schema-valid items and reports invalid ones via onInvalid without throwing', () => {
    const invalidRecap = { ...validRecap, sessionType: 'not-a-real-type' };
    const reported: string[] = [];

    const result = validateRecapItems([validRecap, invalidRecap], (error) => {
      reported.push(error.issues[0]?.path.join('.') ?? '');
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ recapId: RECAP_ID });
    // The real cause is surfaced to the caller (which logs + captures it),
    // pointing at the offending field rather than swallowing the failure.
    expect(reported).toEqual(['sessionType']);
  });

  it('returns every item unchanged when all are valid', () => {
    const onInvalid = jest.fn();
    const result = validateRecapItems([validRecap], onInvalid);

    expect(result).toHaveLength(1);
    expect(onInvalid).not.toHaveBeenCalled();
  });
});
