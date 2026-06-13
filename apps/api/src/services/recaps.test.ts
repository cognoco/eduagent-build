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
 * services/dashboard burn-down (see docs/plans/2026-05-12-internal-mock-cleanup-
 * inventory.md).
 */

const mockGetChildrenForParent = jest.fn();
const mockGetChildSessions = jest.fn();
const mockGetChildSessionDetail = jest.fn();

jest.mock('./dashboard' /* gc1-allow: pattern-a conversion */, () => {
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

import type { Database } from '@eduagent/database';

import { ForbiddenError } from '../errors';
import { getRecapForParent, listRecapsForParent } from './recaps';

const PARENT_ID = 'a0000000-0000-4000-8000-000000000001';
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

beforeEach(() => {
  mockGetChildrenForParent.mockReset();
  mockGetChildSessions.mockReset();
  mockGetChildSessionDetail.mockReset();
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

    const recaps = await listRecapsForParent(db, PARENT_ID);

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

    await expect(listRecapsForParent(db, PARENT_ID)).rejects.toThrow(
      'connection lost',
    );
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

    const recaps = await listRecapsForParent(enrichedDb, PARENT_ID);

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

    const recaps = await listRecapsForParent(enrichedDb, PARENT_ID);

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

    const recaps = await listRecapsForParent(enrichedDb, PARENT_ID);

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

    const recaps = await listRecapsForParent(enrichedDb, PARENT_ID);

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
    const recaps = await listRecapsForParent({} as Database, PARENT_ID);

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

    const recap = await getRecapForParent(db, PARENT_ID, RECAP_ID);

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
      getRecapForParent(db, PARENT_ID, RECAP_ID),
    ).resolves.toBeNull();
  });

  it('still propagates non-Forbidden errors (e.g. DB failure)', async () => {
    mockGetChildrenForParent.mockResolvedValue([
      childRow(VISIBLE_CHILD, 'Visible'),
    ]);
    mockGetChildSessionDetail.mockRejectedValueOnce(new Error('boom'));

    await expect(getRecapForParent(db, PARENT_ID, RECAP_ID)).rejects.toThrow(
      'boom',
    );
  });
});
