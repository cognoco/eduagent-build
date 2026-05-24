import { TEST_PROFILE_ID } from '@eduagent/test-utils';

import { createScopedRepository } from './repository.js';
import { curricula, subjects } from './schema/index.js';

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
  const profileId = TEST_PROFILE_ID;

  describe('findById', () => {
    it('returns the topic when the scoped chain resolves a row', async () => {
      const { chain, calls } = createRecordingChain([
        {
          id: 't1',
          bookId: 'b1',
          sortOrder: 0,
          title: 'Photosynthesis',
          bookSortOrder: 0,
          subjectId: 's1',
        },
      ]);
      const repo = createScopedRepository(chain as never, profileId);
      const row = await repo.curriculumTopics.findById('t1');
      expect(row).toEqual({
        id: 't1',
        bookId: 'b1',
        sortOrder: 0,
        title: 'Photosynthesis',
        bookSortOrder: 0,
        subjectId: 's1',
      });
      // Must include three innerJoins — books + curricula + subjects — so
      // ownership is enforced through both parent chains inside the query, not
      // filtered post-hoc in JS.
      expect(calls.innerJoin).toHaveLength(3);
      const secondJoin = calls.innerJoin[1];
      expect(secondJoin).not.toBeUndefined();
      expect(secondJoin![0]).toBe(curricula);
      // The final join must reference the subjects table (first argument
      // to innerJoin). A typo that joined books→books would pass the count
      // stringify as "[object Object]", so compare by identity instead.
      const finalJoin = calls.innerJoin[2];
      expect(finalJoin).not.toBeUndefined();
      expect(finalJoin![0]).toBe(subjects);
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
      expect(calls.innerJoin).toHaveLength(3);
      expect(calls.innerJoin[1]![0]).toBe(curricula);
      expect(calls.innerJoin[2]![0]).toBe(subjects);
      expect(calls.orderBy).toHaveLength(1);
      expect(calls.limit).toEqual([[50]]);
    });
  });

  describe('findEarliestInLaterBooks', () => {
    it('[WI-80] enforces both book and curriculum parent chains', async () => {
      const { chain, calls } = createRecordingChain([
        { id: 't4', title: 'Next book opening' },
      ]);
      const repo = createScopedRepository(chain as never, profileId);
      const rows = await repo.curriculumTopics.findEarliestInLaterBooks(
        's1',
        0,
        50,
      );
      expect(rows).toEqual([{ id: 't4', title: 'Next book opening' }]);
      expect(calls.innerJoin).toHaveLength(3);
      expect(calls.innerJoin[1]![0]).toBe(curricula);
      expect(calls.innerJoin[2]![0]).toBe(subjects);
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
        3,
      );
      expect(rows).toEqual([{ id: 't1', title: 'Photosynthesis' }]);
      expect(calls.innerJoin).toHaveLength(3);
      expect(calls.innerJoin[1]![0]).toBe(curricula);
      expect(calls.innerJoin[2]![0]).toBe(subjects);
      expect(calls.limit).toEqual([[3]]);
    });

    // BUG-643 [P-3]: empty keywords used to crash at the driver because
    // `or(...[])` produces invalid drizzle SQL. The helper now short-circuits
    // before hitting the DB so any future caller that forgets to filter
    // upstream is safe.
    it('returns [] without hitting the DB when keywords is empty (BUG-643 [P-3])', async () => {
      const { chain, calls } = createRecordingChain([
        { id: 'should-never-be-returned', title: 'leaked' },
      ]);
      const repo = createScopedRepository(chain as never, profileId);
      const rows = await repo.curriculumTopics.findMatchingInSubject(
        's1',
        [],
        3,
      );
      expect(rows).toEqual([]);
      // Proof we short-circuited — none of the chain methods were called.
      expect(calls.select).toHaveLength(0);
      expect(calls.where).toHaveLength(0);
      expect(calls.limit).toHaveLength(0);
    });
  });
});

describe('createScopedRepository → invariant', () => {
  it('throws when profileId is empty or blank', () => {
    expect(() => createScopedRepository({} as never, '')).toThrow(/profileId/i);
    expect(() => createScopedRepository({} as never, '   ')).toThrow(
      /profileId/i,
    );
  });
});
