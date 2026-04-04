import type { Database } from '@eduagent/database';
import {
  filterCelebrationsByLevel,
  filterPendingCelebrations,
  queueCelebration,
  PARENT_VISIBLE_REASONS,
} from './celebrations';

const profileId = 'test-profile-id';

function createMockDb(pendingCelebrations: unknown[] = []) {
  const row =
    pendingCelebrations.length > 0
      ? {
          profileId,
          pendingCelebrations,
          celebrationsSeenByChild: null,
          celebrationsSeenByParent: null,
        }
      : null;

  const db: Record<string, unknown> = {
    query: {
      coachingCardCache: {
        findFirst: jest.fn().mockResolvedValue(row),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          for: jest.fn().mockResolvedValue(row ? [row] : []),
        }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  };
  db.transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  return db as unknown as Database;
}

describe('filterCelebrationsByLevel', () => {
  const celebrations = [
    {
      celebration: 'polar_star',
      reason: 'polar_star',
      queuedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      celebration: 'comet',
      reason: 'topic_mastered',
      queuedAt: '2025-01-01T00:00:00.000Z',
    },
  ] as const;

  it('keeps all celebrations for all level', () => {
    expect(filterCelebrationsByLevel([...celebrations], 'all')).toHaveLength(2);
  });

  it('keeps only tier 3-4 celebrations for big_only', () => {
    expect(filterCelebrationsByLevel([...celebrations], 'big_only')).toEqual([
      celebrations[1],
    ]);
  });

  it('returns nothing when level is off', () => {
    expect(filterCelebrationsByLevel([...celebrations], 'off')).toEqual([]);
  });
});

describe('filterPendingCelebrations', () => {
  it('filters out expired celebrations', () => {
    const result = filterPendingCelebrations(
      [
        {
          celebration: 'comet',
          reason: 'topic_mastered',
          queuedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      {
        viewer: 'child',
        now: new Date('2025-01-10T00:00:00.000Z'),
      }
    );

    expect(result).toEqual([]);
  });

  it('hides child-only celebrations from parent view', () => {
    const result = filterPendingCelebrations(
      [
        {
          celebration: 'polar_star',
          reason: 'polar_star',
          queuedAt: '2025-01-05T00:00:00.000Z',
        },
        {
          celebration: 'comet',
          reason: 'topic_mastered',
          queuedAt: '2025-01-05T00:00:00.000Z',
        },
      ],
      {
        viewer: 'parent',
        now: new Date('2025-01-06T00:00:00.000Z'),
      }
    );

    expect(result).toEqual([
      expect.objectContaining({
        reason: PARENT_VISIBLE_REASONS[0],
      }),
    ]);
  });
});

describe('queueCelebration', () => {
  it('deduplicates identical celebration + reason + detail', async () => {
    const db = createMockDb([
      {
        celebration: 'comet',
        reason: 'topic_mastered',
        detail: 'Quadratic Equations',
        queuedAt: '2025-01-05T00:00:00.000Z',
      },
    ]);

    const result = await queueCelebration(
      db,
      profileId,
      'comet',
      'topic_mastered',
      'Quadratic Equations'
    );

    expect(result).toHaveLength(1);
    // Upsert writes via insert().onConflictDoUpdate(), not update()
    expect(db.insert).toHaveBeenCalled();
  });

  it('allows same celebration + reason with different detail', async () => {
    const db = createMockDb([
      {
        celebration: 'comet',
        reason: 'topic_mastered',
        detail: 'Quadratic Equations',
        queuedAt: '2025-01-05T00:00:00.000Z',
      },
    ]);

    const result = await queueCelebration(
      db,
      profileId,
      'comet',
      'topic_mastered',
      'Linear Equations'
    );

    expect(result).toHaveLength(2);
  });
});
