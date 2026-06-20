import type { Database } from '@eduagent/database';
import type { PendingCelebration } from '@eduagent/schemas';
import {
  filterCelebrationsByLevel,
  filterPendingCelebrations,
  getPendingCelebrations,
  queueCelebration,
} from './celebrations';

const profileId = 'test-profile-id';

function createMockDb(
  pendingCelebrations: unknown[] = [],
  options?: { celebrationsSeenByChild?: Date | null },
) {
  const row =
    pendingCelebrations.length > 0 || options?.celebrationsSeenByChild
      ? {
          profileId,
          pendingCelebrations,
          celebrationsSeenByChild: options?.celebrationsSeenByChild ?? null,
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
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([]),
        }),
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
      },
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
      },
    );

    expect(result).toEqual([
      expect.objectContaining({
        reason: 'topic_mastered',
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
      'Quadratic Equations',
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
      'Linear Equations',
    );

    expect(result).toHaveLength(2);
  });

  it('allows no-detail celebrations to recur after the child has seen the previous one', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-06T00:00:00.000Z'));

    try {
      const db = createMockDb(
        [
          {
            celebration: 'polar_star',
            reason: 'polar_star',
            detail: null,
            queuedAt: '2025-01-05T00:00:00.000Z',
          },
        ],
        { celebrationsSeenByChild: new Date('2025-01-05T12:00:00.000Z') },
      );

      const result = await queueCelebration(
        db,
        profileId,
        'polar_star',
        'polar_star',
      );

      const insertValuesCalls = (
        db.insert as unknown as jest.Mock
      ).mock.results.flatMap((result) => {
        const insertBuilder = result.value as {
          values: jest.Mock;
        };
        return insertBuilder.values.mock.calls;
      });

      expect(result).toHaveLength(2);
      expect(insertValuesCalls).toContainEqual([
        expect.objectContaining({
          sourceId: null,
          dedupeKey: 'polar_star:polar_star:2025-01-06T00:00:00.000Z',
        }),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('[BUG-866] getPendingCelebrations prune does not clobber concurrently-queued entries', () => {
  /**
   * Fake DB that models the prune-write race in getPendingCelebrations:
   *
   * - The UNLOCKED GET read (`db.query.coachingCardCache.findFirst`) returns a
   *   STALE snapshot — one valid entry plus one expired entry (so prune fires)
   *   and NO sign of the entry queued concurrently.
   * - Between the GET's read and its prune-write, a queueCelebration commits a
   *   NEWER entry. The LOCKED read (`select().for('update')`, inside
   *   mergeHomeSurfaceCacheDataInTx) therefore returns the FRESH row that
   *   contains that newer entry.
   *
   * A correct prune recomputes from the freshly-LOCKED row, so the newer entry
   * survives. The buggy prune writes back the stale snapshot it computed before
   * the lock, dropping the newer entry permanently.
   *
   * This is a hand-built fake Database object (the established pattern in this
   * file), not a jest.mock of an internal module.
   */
  function createRaceDb(args: {
    staleSnapshot: PendingCelebration[];
    lockedPending: PendingCelebration[];
  }) {
    const staleRow = {
      profileId,
      cardData: undefined,
      pendingCelebrations: args.staleSnapshot,
      celebrationsSeenByChild: null,
      celebrationsSeenByParent: null,
    };
    const lockedRow = {
      ...staleRow,
      pendingCelebrations: args.lockedPending,
    };

    const writes: PendingCelebration[][] = [];

    const db: Record<string, unknown> = {
      query: {
        coachingCardCache: {
          // Unlocked GET read → stale snapshot.
          findFirst: jest.fn().mockResolvedValue(staleRow),
        },
      },
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            // Locked read → fresh row with the concurrently-queued entry.
            for: jest.fn().mockResolvedValue([lockedRow]),
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((values: Record<string, unknown>) => {
          if (Array.isArray(values.pendingCelebrations)) {
            writes.push(values.pendingCelebrations as PendingCelebration[]);
          }
          return {
            where: jest.fn().mockResolvedValue(undefined),
          };
        }),
      }),
    };
    db.transaction = jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));

    return { db: db as unknown as Database, writes };
  }

  it('retains a newer concurrently-queued entry instead of writing back the stale prune', async () => {
    const now = new Date('2025-01-10T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    try {
      // Stale snapshot the GET read sees: one valid + one expired entry (expired
      // triggers the prune branch). The concurrently-queued entry is absent.
      const valid: PendingCelebration = {
        celebration: 'comet',
        reason: 'topic_mastered',
        detail: 'Algebra',
        queuedAt: '2025-01-09T00:00:00.000Z',
      };
      const expired: PendingCelebration = {
        celebration: 'polar_star',
        reason: 'polar_star',
        detail: null,
        queuedAt: '2024-01-01T00:00:00.000Z', // older than the 7-day expiry
      };
      // The newer entry a concurrent queueCelebration committed under the lock.
      const concurrentlyQueued: PendingCelebration = {
        celebration: 'orions_belt',
        reason: 'curriculum_complete',
        detail: 'Physics',
        queuedAt: '2025-01-09T23:59:59.000Z',
      };

      const { db, writes } = createRaceDb({
        staleSnapshot: [valid, expired],
        // Locked row: prune of the stale snapshot dropped `expired`, the
        // concurrent append added `concurrentlyQueued`.
        lockedPending: [valid, concurrentlyQueued],
      });

      await getPendingCelebrations(db, profileId, 'child');

      // The prune writes once. The persisted array must still contain the
      // concurrently-queued entry — never the stale snapshot that lacks it.
      expect(writes).toHaveLength(1);
      const persisted = writes[0]!;
      expect(persisted).toContainEqual(
        expect.objectContaining({ detail: 'Physics' }),
      );
      // And the expired entry must still be pruned.
      expect(persisted).not.toContainEqual(
        expect.objectContaining({ reason: 'polar_star' }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
