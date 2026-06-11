/**
 * [CR-2026-05-21-067] Break test — storeMilestones must batch into a single
 * round-trip regardless of how many milestones were detected.
 *
 * With backfill alone, a learner can cross 8 vocabulary thresholds + 6 topic
 * thresholds + 4 book thresholds + ... in a single snapshot pass.  Per-row
 * iteration through `await db.insert(...)` would issue one round-trip per
 * milestone, which is the kind of pattern that pushes a CF Worker towards
 * its 50-subrequest cap.  This test asserts that `storeMilestones` issues
 * exactly ONE `db.insert(...)` call for the full batch.
 *
 * The fake `Database` below is a *real* object passed as an argument; it is
 * NOT a jest.mock of an internal module (per AGENTS.md GC1 — only
 * external-boundary mocks are permitted via jest.mock).  The fake records
 * the call sequence and returns canned data so the assertion can prove the
 * intended call-count contract without standing up Postgres.
 */

import type { Database } from '@eduagent/database';

import { storeMilestones } from './milestone-detection';

interface InsertCallRecord {
  table: string;
  values: unknown;
  conflictResolution: 'doNothing' | 'doUpdate' | null;
  returning: boolean;
}

function buildRecordingDb(): {
  db: Database;
  calls: InsertCallRecord[];
} {
  const calls: InsertCallRecord[] = [];

  // Builder that records the chain `insert(table).values(...)
  // .onConflictDoNothing().returning()`.  Returns the recorded row shapes
  // back as the "inserted rows" so the mapping path in storeMilestones runs
  // end-to-end and the test catches any drift between row shape and parser.
  const insert = (table: { _: { name?: string } } | unknown) => {
    const record: InsertCallRecord = {
      table:
        typeof table === 'object' &&
        table !== null &&
        '_' in table &&
        typeof (table as { _: { name?: string } })._ === 'object'
          ? ((table as { _: { name?: string } })._.name ?? 'unknown')
          : 'unknown',
      values: null,
      conflictResolution: null,
      returning: false,
    };
    calls.push(record);

    let lastValues: Array<Record<string, unknown>> = [];
    const chain = {
      values: (vals: Array<Record<string, unknown>>) => {
        record.values = vals;
        lastValues = Array.isArray(vals) ? vals : [vals];
        return chain;
      },
      onConflictDoNothing: () => {
        record.conflictResolution = 'doNothing';
        return chain;
      },
      returning: () => {
        record.returning = true;
        // Return one fake row per input row so storeMilestones' mapping path
        // is exercised (catches accidental drop of returning() too).
        return Promise.resolve(
          lastValues.map((row, idx) => ({
            id: `01900000-0000-7000-8000-${String(idx).padStart(12, '0')}`,
            profileId: row['profileId'],
            milestoneType: row['milestoneType'],
            threshold: row['threshold'],
            subjectId: row['subjectId'] ?? null,
            bookId: row['bookId'] ?? null,
            metadata: row['metadata'] ?? null,
            celebratedAt: null,
            createdAt: new Date('2026-05-26T00:00:00Z'),
          })),
        );
      },
    };
    return chain;
  };

  return {
    db: { insert } as unknown as Database,
    calls,
  };
}

describe('storeMilestones — bulk insert contract (CR-2026-05-21-067)', () => {
  it('issues exactly one db.insert(...) call for a batch of N milestones', async () => {
    const { db, calls } = buildRecordingDb();

    // Realistic worst-case payload: 18 milestones in one snapshot pass
    // (8 vocabulary thresholds + 6 topic thresholds + 4 book thresholds).
    const detected = [
      ...[5, 10, 25, 50, 100, 250, 500, 1000].map((threshold) => ({
        profileId: '01900000-0000-7000-8000-000000000001',
        milestoneType: 'vocabulary_count' as const,
        threshold,
      })),
      ...[1, 3, 5, 10, 25, 50].map((threshold) => ({
        profileId: '01900000-0000-7000-8000-000000000001',
        milestoneType: 'topic_mastered_count' as const,
        threshold,
      })),
      ...[1, 3, 5, 10].map((threshold) => ({
        profileId: '01900000-0000-7000-8000-000000000001',
        milestoneType: 'book_completed' as const,
        threshold,
      })),
    ];

    expect(detected.length).toBe(18);

    const stored = await storeMilestones(
      db,
      '01900000-0000-7000-8000-000000000001',
      detected,
    );

    // The contract: ONE insert call regardless of batch size.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.conflictResolution).toBe('doNothing');
    expect(calls[0]?.returning).toBe(true);
    // Values is the full array, not a single row — proves batch shape.
    expect(Array.isArray(calls[0]?.values)).toBe(true);
    expect((calls[0]?.values as unknown[]).length).toBe(18);

    // Mapping path returns one MilestoneRecord per input row.
    expect(stored).toHaveLength(18);
    expect(stored[0]?.milestoneType).toBe('vocabulary_count');
    expect(stored[stored.length - 1]?.milestoneType).toBe('book_completed');
  });

  it('returns [] without issuing any insert when batch is empty', async () => {
    const { db, calls } = buildRecordingDb();

    const stored = await storeMilestones(
      db,
      '01900000-0000-7000-8000-000000000001',
      [],
    );

    expect(stored).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('does not issue one insert per milestone (regression guard for the N-roundtrip bug)', async () => {
    const { db, calls } = buildRecordingDb();

    // 12 milestones — if the implementation regressed to a per-row loop,
    // calls.length would be 12.  Single batch ⇒ calls.length === 1.
    const detected = Array.from({ length: 12 }, (_, idx) => ({
      profileId: '01900000-0000-7000-8000-000000000001',
      milestoneType: 'session_count' as const,
      threshold: idx + 1,
    }));

    await storeMilestones(db, '01900000-0000-7000-8000-000000000001', detected);

    expect(calls).toHaveLength(1);
    expect(calls).not.toHaveLength(12);
  });
});
