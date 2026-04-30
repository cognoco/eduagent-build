// Tests for progress-helpers — specifically getActiveSubjectsByRecency [BUG-913]

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

import { createScopedRepository, type Database } from '@eduagent/database';
import { getActiveSubjectsByRecency } from './progress-helpers';

const CHILD_PROFILE_ID = '01933b3c-0000-7000-8000-000000000042';

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

function makeSubjectRow(overrides: {
  id: string;
  name: string;
  status?: string;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    status: overrides.status ?? 'active',
    profileId: CHILD_PROFILE_ID,
    rawInput: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeMockDb(opts: {
  subjects: ReturnType<typeof makeSubjectRow>[];
  sessionRows: Array<{
    subjectId: string;
    lastSessionAt: Date;
  }>;
}): Database {
  // repo.subjects.findMany returns subjects scoped to the profile.
  (createScopedRepository as jest.Mock).mockImplementation(
    (_db: Database, _profileId: string) => ({
      subjects: {
        findMany: jest.fn().mockResolvedValue(opts.subjects),
      },
    })
  );

  // db.select chain is used for the lastSession query.
  const orderByFn = jest.fn().mockResolvedValue(opts.sessionRows);
  const whereFn = jest.fn().mockReturnValue({ orderBy: orderByFn });
  const fromFn = jest.fn().mockReturnValue({ where: whereFn });
  const selectFn = jest.fn().mockReturnValue({ from: fromFn });

  return { select: selectFn } as unknown as Database;
}

// ---------------------------------------------------------------------------
// getActiveSubjectsByRecency [BUG-913]
// ---------------------------------------------------------------------------

describe('getActiveSubjectsByRecency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when the child has no active subjects', async () => {
    const db = makeMockDb({ subjects: [], sessionRows: [] });

    const result = await getActiveSubjectsByRecency(db, CHILD_PROFILE_ID);

    expect(result).toEqual([]);
  });

  it('puts Math (has sessions yesterday) before Biology (no sessions)', async () => {
    const mathId = 'subj-math-1';
    const biologyId = 'subj-bio-1';
    const yesterday = new Date('2026-04-28T09:00:00.000Z');

    const db = makeMockDb({
      subjects: [
        // Biology is listed first (alphabetical order in DB) — should end up last
        makeSubjectRow({ id: biologyId, name: 'Biology' }),
        makeSubjectRow({ id: mathId, name: 'Mathematics' }),
      ],
      sessionRows: [
        // Only Math has a session
        { subjectId: mathId, lastSessionAt: yesterday },
      ],
    });

    const result = await getActiveSubjectsByRecency(db, CHILD_PROFILE_ID);

    expect(result.map((s) => s.name)).toEqual(['Mathematics', 'Biology']);
    expect(result[0]!.lastSessionAt).not.toBeNull();
    expect(result[1]!.lastSessionAt).toBeNull();
  });

  it('orders two active subjects by most recent session first', async () => {
    const mathId = 'subj-math-2';
    const scienceId = 'subj-sci-2';
    const twoDaysAgo = new Date('2026-04-27T09:00:00.000Z');
    const yesterday = new Date('2026-04-28T09:00:00.000Z');

    const db = makeMockDb({
      subjects: [
        makeSubjectRow({ id: mathId, name: 'Mathematics' }),
        makeSubjectRow({ id: scienceId, name: 'Science' }),
      ],
      sessionRows: [
        // Science most recent, Math older
        { subjectId: scienceId, lastSessionAt: yesterday },
        { subjectId: mathId, lastSessionAt: twoDaysAgo },
      ],
    });

    const result = await getActiveSubjectsByRecency(db, CHILD_PROFILE_ID);

    expect(result.map((s) => s.name)).toEqual(['Science', 'Mathematics']);
  });

  it('breaks ties on name (alphabetical) when lastSessionAt is null for all', async () => {
    const db = makeMockDb({
      subjects: [
        makeSubjectRow({ id: 'subj-z', name: 'Zoology' }),
        makeSubjectRow({ id: 'subj-a', name: 'Astronomy' }),
        makeSubjectRow({ id: 'subj-b', name: 'Biology' }),
      ],
      sessionRows: [], // no sessions
    });

    const result = await getActiveSubjectsByRecency(db, CHILD_PROFILE_ID);

    // All null lastSessionAt → fall back to alphabetical
    expect(result.map((s) => s.name)).toEqual([
      'Astronomy',
      'Biology',
      'Zoology',
    ]);
  });
});
