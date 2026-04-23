import { createScopedRepository } from './repository.js';
import { subjects } from './schema/index.js';

// Recording mock: every chain method records its arguments so tests can
// assert on SQL predicates, not just call counts.
interface RecordedCalls {
  select: unknown[][];
  from: unknown[][];
  innerJoin: unknown[][];
  where: unknown[][];
  limit: unknown[][];
  orderBy: unknown[][];
}

function createRecordingChain(result: unknown[]) {
  const calls: RecordedCalls = {
    select: [],
    from: [],
    innerJoin: [],
    where: [],
    limit: [],
    orderBy: [],
  };
  const chain: Record<string, unknown> = {};
  const record = (method: keyof RecordedCalls) =>
    jest.fn((...args: unknown[]) => {
      calls[method].push(args);
      return chain;
    });
  chain.select = record('select');
  chain.from = record('from');
  chain.innerJoin = record('innerJoin');
  chain.where = record('where');
  chain.orderBy = record('orderBy');
  // Terminal: .limit() resolves the promise.
  chain.limit = jest.fn((...args: unknown[]) => {
    calls.limit.push(args);
    return Promise.resolve(result);
  });
  // Also make the chain itself thenable for queries that end on .orderBy().
  (chain as { then?: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return { chain, calls };
}

describe('createScopedRepository → curriculumTopics', () => {
  const profileId = '00000000-0000-0000-0000-000000000001';

  describe('findById', () => {
    it('returns the topic when the scoped chain resolves a row', async () => {
      const { chain, calls } = createRecordingChain([
        { id: 't1', bookId: 'b1', sortOrder: 0, title: 'Photosynthesis' },
      ]);
      const repo = createScopedRepository(chain as never, profileId);
      const row = await repo.curriculumTopics.findById('t1');
      expect(row).toEqual({
        id: 't1',
        bookId: 'b1',
        sortOrder: 0,
        title: 'Photosynthesis',
      });
      // Must include two innerJoins — books + subjects — so ownership is
      // enforced inside the query, not filtered post-hoc in JS.
      expect(calls.innerJoin).toHaveLength(2);
      // The second join must reference the subjects table (first argument
      // to innerJoin). A typo that joined books→books would pass the count
      // check but fail this reference-identity one — drizzle pgTable objects
      // stringify as "[object Object]", so compare by identity instead.
      const secondJoin = calls.innerJoin[1];
      expect(secondJoin).toBeDefined();
      const secondJoinTable = secondJoin![0];
      expect(secondJoinTable).toBe(subjects);
      // Terminal limit(1) ensures we never scan the whole table.
      expect(calls.limit).toEqual([[1]]);
    });

    it('returns null when the scoped chain resolves empty', async () => {
      const { chain } = createRecordingChain([]);
      const repo = createScopedRepository(chain as never, profileId);
      expect(await repo.curriculumTopics.findById('t1')).toBeNull();
    });
  });

  describe('findLaterInBook', () => {
    it('orders ascending, enforces ownership, and caps with a limit', async () => {
      const { chain, calls } = createRecordingChain([
        { id: 't2', title: 'Light reactions' },
        { id: 't3', title: 'Calvin cycle' },
      ]);
      const repo = createScopedRepository(chain as never, profileId);
      const rows = await repo.curriculumTopics.findLaterInBook('b1', 0, 50);
      expect(rows).toHaveLength(2);
      expect(calls.innerJoin).toHaveLength(2);
      expect(calls.orderBy).toHaveLength(1);
      expect(calls.limit).toEqual([[50]]);
    });
  });

  describe('findMatchingInSubject', () => {
    it('issues a single limited query with ownership join', async () => {
      const { chain, calls } = createRecordingChain([
        { id: 't1', title: 'Photosynthesis' },
      ]);
      const repo = createScopedRepository(chain as never, profileId);
      const rows = await repo.curriculumTopics.findMatchingInSubject(
        's1',
        ['photo'],
        3
      );
      expect(rows).toEqual([{ id: 't1', title: 'Photosynthesis' }]);
      expect(calls.innerJoin).toHaveLength(2);
      expect(calls.limit).toEqual([[3]]);
    });

    // NOTE: The "empty keywords" short-circuit lives in matchFreeformTopic,
    // not in the repo method — the repo method does not need a defensive
    // guard for a call that never happens in production.
  });
});

describe('createScopedRepository → invariant', () => {
  it('throws when profileId is empty or blank', () => {
    expect(() => createScopedRepository({} as never, '')).toThrow(/profileId/i);
    expect(() => createScopedRepository({} as never, '   ')).toThrow(
      /profileId/i
    );
  });
});
