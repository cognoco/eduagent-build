/**
 * Service-layer unit tests for recaps.ts.
 *
 * Focus: per-child ForbiddenError must not poison sibling lookups. Promise.all
 * regression — if one child has hidden consent, the parent's recap list/detail
 * used to throw 403 even when other children were fully visible.
 *
 * Pattern: mocks `./dashboard` via requireActual + targeted overrides (gc1-allow:
 * pattern-a conversion). Real `./dashboard` cannot run without a database.
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
